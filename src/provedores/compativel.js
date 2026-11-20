// Conversa com qualquer IA que fale o formato de chat da OpenAI ("/chat/completions"):
// OpenAI, Gemini (endereço compatível do Google), OpenRouter, Ollama, LM Studio, Groq, DeepSeek...
// A IA pede ferramentas (ler arquivo, rodar comando...) e o pet executa aqui, pedindo
// Permitir/Negar no chat para tudo que mexe no computador (veja ferramentas.js).
const os = require("node:os");
const ferramentas = require("./ferramentas");

const MAX_PASSOS = 30; // voltas de ferramenta por mensagem
const MAX_HISTORICO = 80; // mensagens guardadas da conversa

function promptDoSistema(pet, pasta, personagem) {
  const sistema = { win32: "Windows", darwin: "macOS", linux: "Linux" }[process.platform] || process.platform;
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  return [
    personagem,
    "",
    "Você também é um assistente de programação no computador da pessoa.",
    `Pasta de trabalho: ${pasta}`,
    `Sistema: ${sistema} (${os.release()}). Os comandos rodam em ${shell}.`,
    "Use as ferramentas para olhar arquivos antes de responder sobre eles. Caminhos são relativos à pasta de trabalho.",
    "Escrever, editar e rodar comandos sempre pede permissão à pessoa. Se ela negar, não insista: pergunte o que ela prefere.",
    "Prefira editar_arquivo a reescrever arquivos inteiros. Nunca rode comandos destrutivos sem explicar antes.",
  ].join("\n");
}

class ChatCompativel {
  // opcoes: { nome, endereco, modelo, chave, cabecalhos }
  constructor(opcoes) {
    this.opcoes = opcoes;
    this.historico = [];
    this.ocupado = false;
    this.abortar = null;
    this.semFerramentas = false; // modelo que não aceita ferramentas: só conversa
  }

  novaConversa() {
    this.historico = [];
  }

  parar() {
    this.abortar?.abort();
  }

  async pedir(mensagens) {
    const { endereco, modelo, chave, cabecalhos = {} } = this.opcoes;
    const corpo = { model: modelo, messages: mensagens };
    if (!this.semFerramentas) corpo.tools = ferramentas.paraOpenAI();
    const r = await fetch(endereco.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(chave ? { Authorization: `Bearer ${chave}` } : {}), ...cabecalhos },
      body: JSON.stringify(corpo),
      signal: this.abortar.signal,
    });
    const texto = await r.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      json = null;
    }
    if (!r.ok) {
      const msg = (Array.isArray(json) ? json[0] : json)?.error?.message || texto.slice(0, 300) || r.statusText;
      const erro = new Error(`${r.status}: ${msg}`);
      erro.status = r.status;
      throw erro;
    }
    const escolha = json?.choices?.[0];
    if (!escolha?.message) throw new Error("A IA mandou uma resposta vazia.");
    return escolha.message;
  }

  // Mesma interface do ChatClaude: eventos { texto, ferramenta, permissao, fim, erro }.
  async enviar({ texto, imagens = [] }, { pasta, pet, personagem }, eventos) {
    if (this.ocupado) return eventos.erro("Calma, ainda estou respondendo a mensagem anterior!");
    this.ocupado = true;
    this.abortar = new AbortController();
    const sinal = this.abortar.signal;
    let inicio = this.historico.length;
    try {
      // imagem vai como "image_url" com data URL (formato aceito pela OpenAI, Gemini, Ollama...)
      const conteudo = imagens.length
        ? [
            ...imagens.map((i) => ({ type: "image_url", image_url: { url: `data:${i.source.media_type};base64,${i.source.data}` } })),
            { type: "text", text: texto.trim() || "O que você vê nesta imagem?" },
          ]
        : texto;
      this.historico.push({ role: "user", content: conteudo });
      const sistema = { role: "system", content: promptDoSistema(pet, pasta, personagem) };

      for (let passo = 0; passo < MAX_PASSOS; passo++) {
        let msg;
        try {
          msg = await this.pedir([sistema, ...this.historico]);
        } catch (e) {
          // alguns modelos (vários do Ollama, por exemplo) não aceitam ferramentas: tenta só conversar
          if (!this.semFerramentas && e.status === 400 && /tool|function/i.test(e.message)) {
            this.semFerramentas = true;
            eventos.texto("(Este modelo não aceita ferramentas, então eu só converso: não consigo ler arquivos nem rodar comandos com ele.)");
            msg = await this.pedir([sistema, ...this.historico]);
          } else throw e;
        }
        // guarda a resposta como veio (o Gemini precisa receber de volta campos extras das ferramentas)
        const guardar = { ...msg, role: "assistant" };
        for (const k of Object.keys(guardar)) if (guardar[k] == null) delete guardar[k];
        if (!guardar.content && !guardar.tool_calls?.length) guardar.content = "";
        this.historico.push(guardar);

        if (typeof msg.content === "string" && msg.content.trim()) eventos.texto(msg.content.trim());
        const chamadas = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        if (!chamadas.length) break;

        for (const c of chamadas) {
          const nome = c.function?.name;
          let args = {};
          try {
            args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
          } catch {
            args = null;
          }
          let resultado;
          if (args === null) resultado = "Os argumentos não vieram em JSON válido. Tente de novo.";
          else {
            eventos.ferramenta(ferramentas.resumo(nome, args));
            resultado = await ferramentas.executar(nome, args, { pasta, permissao: eventos.permissao, sinal });
          }
          if (sinal.aborted) throw new Error("abortado");
          this.historico.push({ role: "tool", tool_call_id: c.id, name: nome, content: resultado });
        }
        if (passo === MAX_PASSOS - 1) eventos.texto("Parei aqui para não ficar rodando sem fim. Quer que eu continue?");
      }
      if (this.historico.length > MAX_HISTORICO) this.cortarHistorico();
    } catch (e) {
      if (sinal.aborted) eventos.erro("Parei.");
      else eventos.erro(this.explicarErro(e));
      this.limparPontaSolta(inicio);
    } finally {
      this.ocupado = false;
      this.abortar = null;
      eventos.fim();
    }
  }

  // Corta o começo da conversa sem deixar resposta de ferramenta "órfã" (a API recusa).
  cortarHistorico() {
    let i = this.historico.length - MAX_HISTORICO;
    while (i < this.historico.length && this.historico[i].role !== "user") i++;
    this.historico = this.historico.slice(i);
  }

  // Depois de um erro ou de "parar": se a IA ainda não respondeu nada, esquece a mensagem;
  // se parou no meio das ferramentas, completa as que ficaram sem resposta (a API exige).
  limparPontaSolta(inicio) {
    const turno = this.historico.slice(inicio);
    if (!turno.some((m) => m.role === "assistant")) {
      this.historico = this.historico.slice(0, inicio);
      return;
    }
    const respondidas = new Set(turno.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
    for (const m of turno)
      for (const c of m.tool_calls || [])
        if (!respondidas.has(c.id)) this.historico.push({ role: "tool", tool_call_id: c.id, name: c.function?.name, content: "Interrompido pela pessoa." });
  }

  explicarErro(e) {
    const { nome, endereco, chave } = this.opcoes;
    if (e.status === 401 || e.status === 403) return `${nome} recusou a chave (${e.message}). Confira a chave em Ajustes, IA.`;
    if (e.status === 404) return `${nome} não achou o modelo ou o endereço (${e.message}). Confira o modelo em Ajustes, IA.`;
    if (e.status === 429) return `${nome} disse que passou do limite de uso (${e.message}). Espere um pouco ou confira o seu plano.`;
    if (e.status) return `${nome} respondeu com erro ${e.message}`;
    if (!chave && /localhost|127\.0\.0\.1/.test(endereco)) return `Não consegui falar com ${nome} em ${endereco}. Ele está aberto? (${e.message})`;
    return `Não consegui falar com ${nome}: ${e.message}`;
  }
}

module.exports = { ChatCompativel, promptDoSistema };
