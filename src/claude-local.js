// Onde está o Claude Code que o chat usa.
// O SDK do Claude Code traz um executável próprio do Claude Code (~360 MB por sistema, mais da metade
// do app). Os instaladores NÃO levam esse executável: o app usa o Claude Code que a pessoa já instalou
// para fazer o login (o mesmo do comando "claude" no terminal). Rodando pelo código (npm start), o
// executável do SDK continua em node_modules e tem a preferência, como antes.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const WIN = process.platform === "win32";
const EXT = WIN ? ".exe" : "";

const executavel = (arq) => {
  try {
    const st = fs.statSync(arq);
    if (!st.isFile()) return false;
    if (!WIN) fs.accessSync(arq, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// O executável que vem com o SDK (só existe pelo código; os instaladores deixam de fora).
function doSdk() {
  const pacotes =
    process.platform === "linux"
      ? [`linux-${process.arch}`, `linux-${process.arch}-musl`]
      : [`${process.platform}-${process.arch}`];
  for (const p of pacotes) {
    try {
      const arq = require.resolve(`@anthropic-ai/claude-agent-sdk-${p}/claude${EXT}`);
      if (executavel(arq)) return arq;
    } catch {}
  }
  return null;
}

// Pastas onde os instaladores do Claude Code costumam pôr o "claude". Apps abertos pelo Finder ou pelo
// Menu Iniciar nem sempre recebem o PATH do terminal, então essas pastas são olhadas sempre.
function candidatos() {
  const casa = os.homedir();
  const lista = [];
  // 1) o que estiver no PATH (o mesmo "claude" do terminal)
  for (const pasta of (process.env.PATH || "").split(path.delimiter)) {
    if (pasta) lista.push(path.join(pasta, `claude${EXT}`));
  }
  // 2) instalador oficial (curl/irm ... install) e o instalador antigo "local"
  lista.push(path.join(casa, ".local", "bin", `claude${EXT}`));
  lista.push(path.join(casa, ".claude", "local", `claude${EXT}`));
  // 3) npm install -g @anthropic-ai/claude-code: o executável fica em .../@anthropic-ai/claude-code/bin/claude.exe
  //    (no Windows o PATH só tem o claude.cmd, que não dá para abrir direto; por isso o caminho do pacote)
  const prefixos = [];
  if (process.env.npm_config_prefix) prefixos.push(process.env.npm_config_prefix);
  if (WIN) {
    if (process.env.APPDATA) prefixos.push(path.join(process.env.APPDATA, "npm"));
  } else {
    prefixos.push("/usr/local", "/opt/homebrew", "/usr", path.join(casa, ".npm-global"));
  }
  for (const pre of prefixos) {
    const mods = WIN ? path.join(pre, "node_modules") : path.join(pre, "lib", "node_modules");
    lista.push(path.join(mods, "@anthropic-ai", "claude-code", "bin", "claude.exe"));
  }
  // 4) Homebrew e outros lugares comuns no Mac/Linux
  if (!WIN) lista.push("/opt/homebrew/bin/claude", "/usr/local/bin/claude");
  // 5) Windows: WinGet e Scoop
  if (WIN && process.env.LOCALAPPDATA) {
    lista.push(path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "claude.exe"));
  }
  if (WIN) lista.push(path.join(casa, "scoop", "shims", "claude.exe"));
  return lista;
}

let achado; // undefined = ainda não procurou
// Devolve o caminho do Claude Code ou null. MASCOTE_CLAUDE=/caminho/do/claude escolhe um à mão.
function acharClaude({ deNovo = false } = {}) {
  if (achado !== undefined && !deNovo) return achado;
  achado = null;
  const escolhido = process.env.MASCOTE_CLAUDE;
  if (escolhido && executavel(escolhido)) return (achado = escolhido);
  const sdk = doSdk();
  if (sdk) return (achado = sdk);
  for (const arq of candidatos()) {
    if (!executavel(arq)) continue;
    try {
      return (achado = fs.realpathSync(arq));
    } catch {
      return (achado = arq);
    }
  }
  return achado;
}

const COMO_INSTALAR = WIN
  ? "No PowerShell: irm https://claude.ai/install.ps1 | iex"
  : "No terminal: curl -fsSL https://claude.ai/install.sh | bash";

module.exports = { acharClaude, COMO_INSTALAR };
