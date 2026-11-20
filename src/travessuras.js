// Travessuras do modo bagunça: o pet aperta teclas (ex.: Alt+Tab) ou abre o navegador.
// Cada travessura precisa ser ligada pela pessoa em ⚙️ (todas começam desligadas).
// As padrão ficam em travessuras/padrao.json; a pessoa pode criar mais na pasta
// "travessuras" do usuário. Tudo é validado aqui: só teclas "inofensivas" e só links http(s).
const fs = require("node:fs");
const path = require("node:path");

// ---------- teclas permitidas ----------
// Só teclas que não apagam, não enviam e não fecham nada. Sem Ctrl, Enter, Delete, F4, letras soltas...
// [código virtual do Windows, é "estendida"?]
const TECLAS = {
  alt: [0x12, false], tab: [0x09, false], shift: [0x10, false], win: [0x5b, true],
  esquerda: [0x25, true], cima: [0x26, true], direita: [0x27, true], baixo: [0x28, true],
  d: [0x44, false], m: [0x4d, false],
};
const ROTULOS = { alt: "Alt", tab: "Tab", shift: "Shift", win: "⊞ Win", esquerda: "←", cima: "↑", direita: "→", baixo: "↓", d: "D", m: "M" };
const MAX_VEZES = 10;
const INTERVALO_MIN = 3 * 60 * 1000; // no mínimo 3 minutos entre travessuras

// ---------- apertar teclas (só Windows por enquanto) ----------
let keybd = null;
try {
  if (process.platform === "win32") {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const f = user32.func("void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)");
    keybd = (nome, soltar) => {
      const [vk, ext] = TECLAS[nome];
      f(vk, 0, (soltar ? 2 : 0) | (ext ? 1 : 0), 0);
    };
  }
} catch (e) {
  console.warn("[travessuras] teclado indisponível:", e.message);
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Segura todas as teclas menos a última e toca a última "vezes" vezes (Alt segurado + Tab, Tab, Tab).
// aoTocar(i) é chamado a cada toque, para o pet animar junto.
async function apertar(teclas, vezes, aoTocar) {
  const seguradas = teclas.slice(0, -1);
  const ultima = teclas[teclas.length - 1];
  const apertadas = [];
  try {
    for (const t of seguradas) {
      keybd(t, false);
      apertadas.push(t);
      await esperar(40);
    }
    for (let i = 0; i < vezes; i++) {
      aoTocar?.(i);
      keybd(ultima, false);
      await esperar(60);
      keybd(ultima, true);
      await esperar(380);
    }
  } finally {
    // sempre solta o que segurou, mesmo se algo der errado
    for (const t of apertadas.reverse()) keybd(t, true);
  }
}

// ---------- leitura e validação ----------
function linkValido(s) {
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && s.length <= 500;
  } catch {
    return false;
  }
}

function normalizar(t) {
  if (!t || typeof t !== "object" || typeof t.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(t.id)) return null;
  const nome = typeof t.nome === "string" && t.nome.trim() ? t.nome.trim().slice(0, 60) : t.id;
  if (t.tipo === "teclas") {
    if (!Array.isArray(t.teclas) || t.teclas.length < 1 || t.teclas.length > 4) return null;
    const teclas = t.teclas.map((k) => String(k).toLowerCase());
    if (!teclas.every((k) => k in TECLAS)) {
      console.warn(`[travessuras] "${t.id}" ignorada: tecla não permitida (use: ${Object.keys(TECLAS).join(", ")})`);
      return null;
    }
    const [a, b] = Array.isArray(t.vezes) ? t.vezes : [t.vezes ?? 1, t.vezes ?? 1];
    const min = Math.max(1, Math.min(MAX_VEZES, Math.round(Number(a)) || 1));
    const max = Math.max(min, Math.min(MAX_VEZES, Math.round(Number(b)) || min));
    return { id: t.id, nome, tipo: "teclas", teclas, vezes: [min, max] };
  }
  if (t.tipo === "abrir") {
    const links = (Array.isArray(t.links) ? t.links : []).filter((l) => typeof l === "string" && linkValido(l));
    if (!links.length) return null;
    return { id: t.id, nome, tipo: "abrir", links };
  }
  return null;
}

function lerArquivo(arq) {
  try {
    const dados = JSON.parse(fs.readFileSync(arq, "utf8"));
    return (Array.isArray(dados) ? dados : dados?.travessuras || []).map(normalizar).filter(Boolean);
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`[travessuras] problema em ${arq}: ${e.message}`);
    return [];
  }
}

const LEIA_ME = `Travessuras do modo bagunça 😈
=============================

Edite travessuras.json para criar as suas. Depois ligue cada uma em ⚙️ no chat.
Uma travessura com o mesmo "id" de uma padrão substitui a padrão.

Apertar teclas (só no Windows por enquanto):
  { "id": "minimiza-tudo", "nome": "Minimizar tudo", "tipo": "teclas", "teclas": ["win", "d"], "vezes": 1 }
  { "id": "alt-tab-doido", "nome": "Alt+Tab doido", "tipo": "teclas", "teclas": ["alt", "tab"], "vezes": [3, 8] }

  - As teclas, menos a última, ficam seguradas; a última é apertada "vezes" vezes
    (um número, ou [mínimo, máximo] para sortear). Máximo: ${MAX_VEZES}.
  - Teclas permitidas: ${Object.keys(TECLAS).join(", ")}.
    (Ctrl, Enter, Delete, F4 e letras ficam de fora para ele nunca apagar, enviar ou fechar nada.)

Abrir um link no navegador:
  { "id": "patos", "nome": "Fotos de patos", "tipo": "abrir", "links": ["https://www.google.com/search?q=patos+fofos"] }

  - Só links http:// ou https://. Ele sorteia um da lista.

"id": letras minúsculas, números e "-". Ele faz no máximo uma travessura a cada 3 minutos.
`;
const EXEMPLO = { travessuras: [] };

function prepararPasta(pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, "travessuras.json");
  if (!fs.existsSync(arq)) fs.writeFileSync(arq, JSON.stringify(EXEMPLO, null, 2) + "\n");
  const leia = path.join(pasta, "LEIA-ME.txt");
  if (!fs.existsSync(leia)) fs.writeFileSync(leia, LEIA_ME);
}

// Padrão + da pessoa (mesmo id substitui).
function listar({ arqPadrao, pastaUsuario }) {
  const mapa = new Map();
  for (const t of [...lerArquivo(arqPadrao), ...lerArquivo(path.join(pastaUsuario, "travessuras.json"))]) mapa.set(t.id, t);
  return [...mapa.values()].filter((t) => t.tipo !== "teclas" || keybd);
}

// ---------- sorteio com intervalo mínimo ----------
let ultima = Date.now(); // conta a partir da abertura: nada de travessura logo que o app abre
let pendente = null; // travessura sorteada esperando o pet chegar na hora de executar

function sortear(lista, ligadas, { semIntervalo = false } = {}) {
  if (pendente && Date.now() < pendente.ate) return null; // já tem uma em andamento
  if (!semIntervalo && Date.now() - ultima < INTERVALO_MIN) return null;
  const ativas = lista.filter((t) => ligadas[t.id] === true);
  if (!ativas.length) return null;
  const t = ativas[Math.floor(Math.random() * ativas.length)];
  const vezes = t.tipo === "teclas" ? t.vezes[0] + Math.floor(Math.random() * (t.vezes[1] - t.vezes[0] + 1)) : 1;
  ultima = Date.now();
  pendente = { ...t, vezes, token: Math.random().toString(36).slice(2), ate: Date.now() + 15000 };
  const rotulos = t.tipo === "teclas" ? t.teclas.map((k) => ROTULOS[k]) : ["🌐"];
  return { token: pendente.token, tipo: t.tipo, nome: t.nome, rotulos, vezes };
}

// Executa a travessura sorteada (só uma vez, e só se o token bater).
async function executar(token, { abrirLink, aoTocar }) {
  const t = pendente;
  if (!t || t.token !== token || Date.now() > t.ate) return false;
  pendente = null;
  if (t.tipo === "teclas") await apertar(t.teclas, t.vezes, aoTocar);
  else {
    aoTocar?.(0);
    await abrirLink(t.links[Math.floor(Math.random() * t.links.length)]);
  }
  return true;
}

module.exports = { listar, sortear, executar, prepararPasta, teclasDisponiveis: () => Boolean(keybd) };
