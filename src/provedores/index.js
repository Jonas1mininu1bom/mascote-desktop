// Qual IA conversa no chat. O Claude Code continua sendo o padrão; as outras falam o
// formato de chat da OpenAI (o Gemini também, pelo endereço compatível do Google).
const { ChatClaude, promptDoPersonagem } = require("../claude");
const { ChatCompativel } = require("./compativel");

// endereco: base da API (sem "/chat/completions"). chave: "sim" (precisa), "opcional" ou "nao".
const PROVEDORES = [
  { id: "claude", nome: "Claude Code", dica: "Usa o Claude Code instalado e logado no computador (ou ANTHROPIC_API_KEY)." },
  {
    id: "gemini",
    nome: "Gemini (Google)",
    endereco: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelo: "gemini-2.5-flash",
    chave: "sim",
    linkChave: "https://aistudio.google.com/apikey",
    dica: "Crie uma chave grátis no Google AI Studio.",
  },
  {
    id: "openai",
    nome: "OpenAI (ChatGPT)",
    endereco: "https://api.openai.com/v1",
    modelo: "gpt-5-mini",
    chave: "sim",
    linkChave: "https://platform.openai.com/api-keys",
    dica: "Usa uma chave da API da OpenAI (cobrada à parte do ChatGPT Plus).",
  },
  {
    id: "openrouter",
    nome: "OpenRouter (vários modelos)",
    endereco: "https://openrouter.ai/api/v1",
    modelo: "google/gemini-2.5-flash",
    chave: "sim",
    linkChave: "https://openrouter.ai/keys",
    dica: "Uma chave só para usar modelos de várias empresas.",
  },
  {
    id: "ollama",
    enderecoLivre: true,
    nome: "Ollama (no seu computador)",
    endereco: "http://localhost:11434/v1",
    modelo: "qwen3",
    chave: "nao",
    dica: "Roda offline. Instale o Ollama e baixe um modelo com ferramentas (ex.: ollama pull qwen3).",
  },
  {
    id: "personalizado",
    enderecoLivre: true,
    nome: "Outra (compatível com OpenAI)",
    endereco: "http://localhost:1234/v1",
    modelo: "",
    chave: "opcional",
    dica: "LM Studio, Groq, DeepSeek, Mistral, Together... qualquer API no formato da OpenAI.",
  },
];
const provedor = (id) => PROVEDORES.find((p) => p.id === id) || PROVEDORES[0];

// config.ia = { provedor, modelos: { id: "..." }, enderecos: { id: "..." } } (tudo opcional)
function escolhaAtual(ia) {
  const p = provedor(ia?.provedor);
  return {
    p,
    modelo: (ia?.modelos?.[p.id] || p.modelo || "").trim(),
    // Gemini, OpenAI e OpenRouter usam sempre o endereço oficial: assim a chave deles nunca vai
    // para outro servidor, mesmo que alguém mexa na configuração ou na página do chat.
    endereco: ((p.enderecoLivre && ia?.enderecos?.[p.id]) || p.endereco || "").trim(),
  };
}

// A chave só pode ir por https, ou por http para o próprio computador (Ollama, LM Studio...).
function podeMandarChave(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

function enderecoValido(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// Mesma interface do ChatClaude, mas troca de IA conforme a configuração.
class Conversa {
  constructor({ pegarConfig, cofre }) {
    this.pegarConfig = pegarConfig;
    this.cofre = cofre;
    this.atual = null;
    this.assinatura = null;
  }

  // cria (ou reaproveita) a conversa da IA escolhida; trocar de IA/modelo começa uma conversa nova
  conversa() {
    const { p, modelo, endereco } = escolhaAtual(this.pegarConfig());
    const chave = p.id === "claude" ? "" : this.cofre.pegar(p.id);
    const assinatura = JSON.stringify([p.id, modelo, endereco, chave]);
    if (assinatura !== this.assinatura) {
      this.atual =
        p.id === "claude"
          ? new ChatClaude()
          : new ChatCompativel({
              nome: p.nome.replace(/ \(.*\)$/, ""),
              endereco,
              modelo,
              chave,
              cabecalhos: p.id === "openrouter" ? { "X-Title": "Mascote Desktop" } : {},
            });
      this.assinatura = assinatura;
    }
    return { conversa: this.atual, p, modelo, endereco, chave };
  }

  novaConversa() {
    this.atual?.novaConversa();
  }

  parar() {
    this.atual?.parar();
  }

  enviar(mensagem, contexto, eventos) {
    if (this.atual?.ocupado) return this.atual.enviar(mensagem, contexto, eventos); // ele mesmo avisa
    const { conversa, p, modelo, endereco, chave } = this.conversa();
    if (p.id !== "claude") {
      const erro = !modelo
        ? `Escolha um modelo para ${p.nome} em Ajustes, IA.`
        : !enderecoValido(endereco)
          ? `O endereço de ${p.nome} não é válido. Confira em Ajustes, IA.`
          : p.chave === "sim" && !chave
            ? `Falta a chave de API de ${p.nome}. Cole a chave em Ajustes, IA.`
            : chave && !podeMandarChave(endereco)
              ? `Por segurança, a chave de ${p.nome} só é enviada por https:// (ou para o seu próprio computador). Confira o endereço em Ajustes, IA.`
              : null;
      if (erro) {
        eventos.erro(erro);
        return eventos.fim();
      }
    }
    return conversa.enviar(mensagem, { ...contexto, personagem: promptDoPersonagem(contexto.pet) }, eventos);
  }
}

// O que a página do chat vê (nunca a chave em si).
function estado(ia, cofre) {
  const atual = escolhaAtual(ia).p.id;
  return {
    atual,
    cofreSeguro: cofre.seguro(),
    provedores: PROVEDORES.map((p) => {
      const e = escolhaAtual({ ...ia, provedor: p.id });
      return {
        id: p.id,
        nome: p.nome,
        dica: p.dica,
        linkChave: p.linkChave || null,
        chave: p.chave || "nao",
        temChave: p.chave ? cofre.tem(p.id) : false,
        chaveSalva: p.chave ? cofre.salva(p.id) : false,
        variaveis: cofre.variaveis(p.id),
        modelo: e.modelo,
        modeloPadrao: p.modelo || "",
        endereco: e.endereco,
        enderecoPadrao: p.endereco || "",
        enderecoLivre: Boolean(p.enderecoLivre), // só Ollama e "Outra" mostram o campo de endereço
      };
    }),
  };
}

// Valida o que a página pediu para mudar e devolve o novo config.ia.
// pedido: { provedor, modelo?, endereco?, chave?, apagarChave? }
function aplicar(ia, pedido, cofre) {
  if (!pedido || typeof pedido !== "object") throw new Error("Pedido inválido.");
  const p = PROVEDORES.find((x) => x.id === pedido.provedor);
  if (!p) throw new Error("IA desconhecida.");
  const novo = { provedor: p.id, modelos: { ...(ia?.modelos || {}) }, enderecos: { ...(ia?.enderecos || {}) } };
  if (p.id !== "claude") {
    if (typeof pedido.modelo === "string") {
      const m = pedido.modelo.trim().slice(0, 200);
      if (m && m !== p.modelo) novo.modelos[p.id] = m;
      else delete novo.modelos[p.id];
    }
    if (typeof pedido.endereco === "string" && p.enderecoLivre) {
      const u = pedido.endereco.trim();
      if (u && !enderecoValido(u)) throw new Error("O endereço precisa começar com http:// ou https://");
      if (u && u !== p.endereco) novo.enderecos[p.id] = u;
      else delete novo.enderecos[p.id];
    }
    if (pedido.apagarChave === true) cofre.apagar(p.id);
    if (typeof pedido.chave === "string" && pedido.chave.trim()) {
      const c = pedido.chave.trim();
      if (c.length > 500 || /\s/.test(c)) throw new Error("Essa chave não parece válida.");
      cofre.salvar(p.id, c);
    }
  }
  return novo;
}

// Lista os modelos que a API oferece (para a pessoa não precisar adivinhar o nome).
async function listarModelos(ia, id, cofre) {
  const { p, endereco } = escolhaAtual({ ...ia, provedor: id });
  if (p.id === "claude" || !enderecoValido(endereco)) return [];
  const chave = cofre.pegar(p.id);
  if (chave && !podeMandarChave(endereco)) throw new Error("Por segurança, a chave só é enviada por https:// (ou para o seu próprio computador).");
  const r = await fetch(endereco.replace(/\/+$/, "") + "/models", {
    headers: chave ? { Authorization: `Bearer ${chave}` } : {},
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${p.nome} respondeu ${r.status} ao listar os modelos.`);
  const json = await r.json();
  return (json?.data || [])
    .map((m) => String(m.id || "").replace(/^models\//, ""))
    .filter(Boolean)
    .sort()
    .slice(0, 500);
}

module.exports = { Conversa, estado, aplicar, listarModelos, podeMandarChave, PROVEDORES };
