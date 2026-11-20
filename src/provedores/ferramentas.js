// Ferramentas que o pet pode usar quando a IA não é o Claude Code (Gemini, OpenAI, Ollama...).
// O Claude Code já traz as dele; aqui é um conjunto pequeno com as mesmas regras do chat:
// - ler e procurar DENTRO da pasta de trabalho é livre;
// - qualquer coisa fora da pasta, escrever, editar ou rodar comando pede Permitir/Negar no chat.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_LEITURA = 100 * 1024; // o que volta para a IA de um arquivo
const MAX_SAIDA = 20 * 1024; // o que volta de um comando
const MAX_ESCRITA = 2 * 1024 * 1024;
const TEMPO_COMANDO = 120 * 1000;
const IGNORAR = new Set([".git", "node_modules", "dist", "build", ".next", "__pycache__", ".venv", "venv"]);

// Descrição no formato "function calling" (OpenAI, aceito também pelo Gemini e pelo Ollama).
const DEFINICOES = [
  {
    nome: "listar_arquivos",
    descricao: "Lista arquivos e pastas de um diretório (pastas terminam com /).",
    parametros: { caminho: { type: "string", description: "Diretório, relativo à pasta de trabalho. Padrão: ." } },
    obrigatorios: [],
  },
  {
    nome: "ler_arquivo",
    descricao: "Lê um arquivo de texto. Para arquivos grandes, use inicio e linhas.",
    parametros: {
      caminho: { type: "string", description: "Arquivo, relativo à pasta de trabalho." },
      inicio: { type: "integer", description: "Primeira linha (começa em 1). Opcional." },
      linhas: { type: "integer", description: "Quantas linhas ler. Opcional." },
    },
    obrigatorios: ["caminho"],
  },
  {
    nome: "buscar_texto",
    descricao: "Procura um texto (sem diferenciar maiúsculas) nos arquivos de um diretório e mostra arquivo:linha.",
    parametros: {
      texto: { type: "string", description: "O que procurar." },
      caminho: { type: "string", description: "Diretório onde procurar. Padrão: ." },
    },
    obrigatorios: ["texto"],
  },
  {
    nome: "escrever_arquivo",
    descricao: "Cria um arquivo ou substitui o conteúdo inteiro dele. Pede permissão à pessoa.",
    parametros: {
      caminho: { type: "string", description: "Arquivo, relativo à pasta de trabalho." },
      conteudo: { type: "string", description: "Conteúdo completo do arquivo." },
    },
    obrigatorios: ["caminho", "conteudo"],
  },
  {
    nome: "editar_arquivo",
    descricao: "Troca um trecho exato de um arquivo por outro. O trecho tem que aparecer uma vez só. Pede permissão à pessoa.",
    parametros: {
      caminho: { type: "string", description: "Arquivo, relativo à pasta de trabalho." },
      procurar: { type: "string", description: "Trecho exato que existe hoje no arquivo." },
      substituir: { type: "string", description: "Trecho novo." },
    },
    obrigatorios: ["caminho", "procurar", "substituir"],
  },
  {
    nome: "rodar_comando",
    descricao: "Roda um comando no terminal, dentro da pasta de trabalho. Pede permissão à pessoa.",
    parametros: { comando: { type: "string", description: "O comando completo." } },
    obrigatorios: ["comando"],
  },
];

const paraOpenAI = () =>
  DEFINICOES.map((d) => ({
    type: "function",
    function: {
      name: d.nome,
      description: d.descricao,
      parameters: { type: "object", properties: d.parametros, required: d.obrigatorios },
    },
  }));

// Caminho absoluto + se está dentro da pasta de trabalho (seguindo links, quando o arquivo existe).
function resolver(pasta, caminho) {
  const alvo = path.resolve(pasta, typeof caminho === "string" && caminho.trim() ? caminho.trim() : ".");
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  // arquivo novo: confere a pasta onde ele vai ficar
  let base = alvo;
  while (!fs.existsSync(base) && path.dirname(base) !== base) base = path.dirname(base);
  const raiz = real(pasta);
  const rel = path.relative(raiz, path.join(real(base), path.relative(base, alvo)));
  const dentro = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  return { alvo, dentro };
}

function cortar(texto, max) {
  return texto.length > max ? texto.slice(0, max) + `\n[... cortado: ${texto.length - max} caracteres a mais]` : texto;
}

function listar(alvo) {
  const itens = fs.readdirSync(alvo, { withFileTypes: true });
  const nomes = itens
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((i) => (i.isDirectory() ? i.name + "/" : i.name));
  return nomes.length > 500 ? nomes.slice(0, 500).join("\n") + `\n[... mais ${nomes.length - 500}]` : nomes.join("\n") || "(vazio)";
}

function ler(alvo, inicio, linhas) {
  const st = fs.statSync(alvo);
  if (st.isDirectory()) return listar(alvo);
  const buf = fs.readFileSync(alvo);
  if (buf.subarray(0, 8000).includes(0)) return `(arquivo binário, ${st.size} bytes)`;
  let texto = buf.toString("utf8");
  if (Number.isInteger(inicio) || Number.isInteger(linhas)) {
    const todas = texto.split("\n");
    const de = Math.max(1, Number.isInteger(inicio) ? inicio : 1);
    const ate = Number.isInteger(linhas) && linhas > 0 ? de - 1 + linhas : todas.length;
    texto = todas.slice(de - 1, ate).map((l, i) => `${de + i}: ${l}`).join("\n");
  }
  return cortar(texto, MAX_LEITURA);
}

function buscar(alvo, texto) {
  const agulha = String(texto || "").toLowerCase();
  if (!agulha) throw new Error("Diga o que procurar.");
  const achados = [];
  let vistos = 0;
  const andar = (dir) => {
    for (const i of fs.readdirSync(dir, { withFileTypes: true })) {
      if (achados.length >= 100 || vistos > 5000) return;
      const p = path.join(dir, i.name);
      if (i.isDirectory()) {
        if (!IGNORAR.has(i.name)) andar(p);
        continue;
      }
      if (!i.isFile()) continue;
      vistos++;
      let buf;
      try {
        if (fs.statSync(p).size > 1024 * 1024) continue;
        buf = fs.readFileSync(p);
      } catch {
        continue;
      }
      if (buf.subarray(0, 8000).includes(0)) continue;
      buf
        .toString("utf8")
        .split("\n")
        .forEach((l, n) => {
          if (achados.length < 100 && l.toLowerCase().includes(agulha)) {
            achados.push(`${path.relative(alvo, p) || path.basename(p)}:${n + 1}: ${l.trim().slice(0, 200)}`);
          }
        });
    }
  };
  if (fs.statSync(alvo).isDirectory()) andar(alvo);
  else return ler(alvo).split("\n").filter((l) => l.toLowerCase().includes(agulha)).slice(0, 100).join("\n") || "Nada encontrado.";
  return achados.length ? achados.join("\n") : "Nada encontrado.";
}

function rodar(comando, pasta, sinal) {
  return new Promise((ok) => {
    let saida = "";
    const filho = spawn(comando, { cwd: pasta, shell: true, windowsHide: true, env: process.env });
    const juntar = (d) => {
      if (saida.length < MAX_SAIDA * 2) saida += d.toString();
    };
    filho.stdout.on("data", juntar);
    filho.stderr.on("data", juntar);
    const parar = () => filho.kill();
    const relogio = setTimeout(() => {
      saida += `\n[parado: passou de ${TEMPO_COMANDO / 1000} s]`;
      parar();
    }, TEMPO_COMANDO);
    sinal?.addEventListener("abort", parar, { once: true });
    filho.on("error", (e) => (saida += `\n[erro: ${e.message}]`));
    filho.on("close", (codigo) => {
      clearTimeout(relogio);
      sinal?.removeEventListener("abort", parar);
      ok(`código de saída: ${codigo}\n${cortar(saida, MAX_SAIDA) || "(sem saída)"}`);
    });
  });
}

// Texto curto para o chat (igual ao do Claude Code: "Ferramenta: alvo").
function resumo(nome, a = {}) {
  const alvo = a.comando || a.caminho || a.texto || "";
  return alvo ? `${nome}: ${String(alvo).slice(0, 160)}` : nome;
}

// Roda uma ferramenta. permissao({nome, resumo}) -> Promise<boolean> mostra Permitir/Negar no chat.
// Sempre devolve um texto para a IA (inclusive erros e recusas), nunca lança.
async function executar(nome, args, { pasta, permissao, sinal }) {
  const a = args && typeof args === "object" ? args : {};
  const def = DEFINICOES.find((d) => d.nome === nome);
  if (!def) return `Ferramenta desconhecida: ${nome}`;
  try {
    const { alvo, dentro } = resolver(pasta, nome === "rodar_comando" ? "." : a.caminho);
    const soLeitura = ["listar_arquivos", "ler_arquivo", "buscar_texto"].includes(nome);
    // ler dentro da pasta é livre; o resto sempre pergunta
    if (!soLeitura || !dentro) {
      // no pedido de permissão vai o comando INTEIRO (o resumo curto poderia esconder o fim dele)
      if (nome === "rodar_comando" && String(a.comando ?? "").length > 4000) {
        return "Comando longo demais para a pessoa conferir. Divida em partes menores.";
      }
      let texto = nome === "rodar_comando" ? `${nome}: ${String(a.comando ?? "")}` : resumo(nome, a);
      if (!dentro) texto = `(fora da pasta de trabalho) ${texto}`;
      if (nome === "editar_arquivo") texto += `\n- ${String(a.procurar).slice(0, 300)}\n+ ${String(a.substituir).slice(0, 300)}`;
      if (nome === "escrever_arquivo") texto += ` (${String(a.conteudo ?? "").length} caracteres)`;
      const ok = await permissao({ nome, resumo: texto });
      if (!ok) return "A pessoa não permitiu esta ação.";
    }
    switch (nome) {
      case "listar_arquivos":
        return listar(alvo);
      case "ler_arquivo":
        return ler(alvo, a.inicio, a.linhas);
      case "buscar_texto":
        return buscar(alvo, a.texto);
      case "escrever_arquivo": {
        const conteudo = typeof a.conteudo === "string" ? a.conteudo : "";
        if (conteudo.length > MAX_ESCRITA) return "Conteúdo grande demais.";
        fs.mkdirSync(path.dirname(alvo), { recursive: true });
        fs.writeFileSync(alvo, conteudo);
        return `Arquivo salvo: ${path.relative(pasta, alvo) || alvo}`;
      }
      case "editar_arquivo": {
        const atual = fs.readFileSync(alvo, "utf8");
        const procurar = String(a.procurar ?? "");
        if (!procurar) return "Diga o trecho a procurar.";
        const vezes = atual.split(procurar).length - 1;
        if (vezes !== 1) return vezes ? `O trecho aparece ${vezes} vezes; mande um trecho maior, que seja único.` : "Não achei esse trecho no arquivo.";
        fs.writeFileSync(alvo, atual.replace(procurar, () => String(a.substituir ?? "")));
        return `Arquivo editado: ${path.relative(pasta, alvo) || alvo}`;
      }
      case "rodar_comando":
        if (typeof a.comando !== "string" || !a.comando.trim()) return "Comando vazio.";
        return await rodar(a.comando, pasta, sinal);
    }
  } catch (e) {
    return `Erro: ${e.message}`;
  }
}

module.exports = { paraOpenAI, executar, resumo, DEFINICOES };
