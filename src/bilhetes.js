// Bilhetes que o pet traz no modo bagunça.
// Vêm de três lugares: os padrão (bilhetes/padrao.json), os do pet (pet.json) e os da
// comunidade (pasta "bilhetes" do usuário, com bilhetes.json e imagens).
// Tudo é validado aqui, no processo principal: a página do bilhete só recebe dados limpos.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_TEXTO = 120;
const MAX_IMAGEM = 5 * 1024 * 1024; // 5 MB
const IMAGENS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const COR = /^#[0-9a-f]{6}$/i;

// Cores de post-it usadas quando o bilhete não escolhe uma.
const CORES = ["#fff8b8", "#ffd6e0", "#d4f1ff", "#d8f5d0", "#e8dcff", "#ffe2c4", "#c9f2ec", "#fbe0f5"];

// true se "alvo" está dentro de "pasta" (sem truques como ../ ou pasta-irmã com prefixo igual).
function estaDentro(pasta, alvo) {
  const rel = path.relative(path.resolve(pasta), path.resolve(alvo));
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

// Converte uma entrada (texto ou objeto) num bilhete válido, ou null.
function normalizar(entrada, pasta) {
  const b = typeof entrada === "string" ? { texto: entrada } : entrada;
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const limpo = {};
  if (typeof b.texto === "string" && b.texto.trim()) limpo.texto = b.texto.trim().slice(0, MAX_TEXTO);
  if (typeof b.imagem === "string" && pasta) {
    const abs = path.resolve(pasta, b.imagem);
    try {
      if (estaDentro(pasta, abs) && IMAGENS.has(path.extname(abs).toLowerCase())) {
        const st = fs.statSync(abs);
        if (st.isFile() && st.size <= MAX_IMAGEM) limpo.imagem = pathToFileURL(abs).href;
      }
    } catch {}
    if (!limpo.imagem) console.warn(`[bilhetes] imagem ignorada: ${b.imagem}`);
  }
  if (typeof b.cor === "string" && COR.test(b.cor)) limpo.cor = b.cor;
  return limpo.texto || limpo.imagem ? limpo : null;
}

const normalizarLista = (lista, pasta) => (Array.isArray(lista) ? lista.map((b) => normalizar(b, pasta)).filter(Boolean) : []);

// Lê um arquivo de bilhetes: pode ser uma lista, ou { substituir, bilhetes: [...] }.
function lerArquivo(arq) {
  try {
    const dados = JSON.parse(fs.readFileSync(arq, "utf8"));
    const lista = Array.isArray(dados) ? dados : dados?.bilhetes;
    return { substituir: dados?.substituir === true, bilhetes: normalizarLista(lista, path.dirname(arq)) };
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`[bilhetes] problema em ${arq}: ${e.message}`);
    return { substituir: false, bilhetes: [] };
  }
}

const EXEMPLO = {
  substituir: false,
  bilhetes: [
    "Escreva aqui as suas mensagens!",
    { texto: "Bilhete com cor própria 💜", cor: "#e8dcff" },
  ],
};

const LEIA_ME = `Bilhetes da comunidade 💌
=========================

Edite o arquivo bilhetes.json desta pasta para escolher o que o pet traz no modo bagunça.
As mudanças valem no próximo bilhete, sem reiniciar o app.

Cada bilhete pode ser:
  "Só um texto"
  { "texto": "Texto com cor", "cor": "#ffd6e0" }
  { "imagem": "gatinho.png" }
  { "imagem": "gatinho.png", "texto": "legenda (usada se a imagem falhar)", "cor": "#d4f1ff" }

- Coloque as imagens nesta mesma pasta (png, jpg, gif ou webp, até 5 MB).
- "cor" é opcional, no formato #rrggbb. Sem cor, ele sorteia uma cor de post-it.
- Textos com mais de ${MAX_TEXTO} caracteres são cortados.
- "substituir": true usa SÓ os seus bilhetes. Com false, eles se juntam aos bilhetes padrão.
`;

// Garante que a pasta do usuário existe, com um exemplo para a pessoa editar.
function prepararPasta(pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, "bilhetes.json");
  if (!fs.existsSync(arq)) fs.writeFileSync(arq, JSON.stringify(EXEMPLO, null, 2) + "\n");
  const leia = path.join(pasta, "LEIA-ME.txt");
  if (!fs.existsSync(leia)) fs.writeFileSync(leia, LEIA_ME);
}

// Sorteia um bilhete. Lê os arquivos na hora, então editar o bilhetes.json vale na hora.
function sortear({ arqPadrao, pastaUsuario, pet }) {
  const usuario = lerArquivo(path.join(pastaUsuario, "bilhetes.json"));
  const ehExemplo = (b) => EXEMPLO.bilhetes.some((e) => (typeof e === "string" ? e : e.texto) === b.texto);
  const daComunidade = usuario.bilhetes.filter((b) => !ehExemplo(b));
  const todos = usuario.substituir && daComunidade.length
    ? daComunidade
    : [...lerArquivo(arqPadrao).bilhetes, ...(pet?.bilhetes || []), ...daComunidade];
  const b = todos.length ? todos[Math.floor(Math.random() * todos.length)] : { texto: "Oi!" };
  return { ...b, cor: b.cor || CORES[Math.floor(Math.random() * CORES.length)] };
}

module.exports = { normalizar, normalizarLista, estaDentro, prepararPasta, sortear };
