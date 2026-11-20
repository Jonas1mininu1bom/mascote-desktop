// Permissão de administrador (só Windows). Tudo é opcional: o mascote funciona sem.
// Sem admin, o Windows (UIPI) bloqueia teclas "falsas" quando a janela da frente é de administrador
// (Gerenciador de Tarefas, terminal admin...). Com admin, as travessuras funcionam nelas também.
const { execFile } = require("node:child_process");

let api = null;
try {
  if (process.platform === "win32") {
    const koffi = require("koffi");
    const shell32 = koffi.load("shell32.dll");
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    const advapi32 = koffi.load("advapi32.dll");
    api = {
      IsUserAnAdmin: shell32.func("bool __stdcall IsUserAnAdmin()"),
      GetForegroundWindow: user32.func("void * __stdcall GetForegroundWindow()"),
      GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)"),
      OpenProcess: kernel32.func("void * __stdcall OpenProcess(uint32_t acesso, bool herdar, uint32_t pid)"),
      CloseHandle: kernel32.func("bool __stdcall CloseHandle(void *h)"),
      OpenProcessToken: advapi32.func("bool __stdcall OpenProcessToken(void *proc, uint32_t acesso, _Out_ void **token)"),
      GetTokenInformation: advapi32.func(
        "bool __stdcall GetTokenInformation(void *token, int classe, _Out_ uint32_t *info, uint32_t tam, _Out_ uint32_t *usado)"
      ),
    };
  }
} catch (e) {
  console.warn("[admin] indisponível:", e.message);
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const TOKEN_QUERY = 0x0008;
const TokenElevation = 20;

function ehAdmin() {
  try {
    return Boolean(api?.IsUserAnAdmin());
  } catch {
    return false;
  }
}

// A janela da frente é de um programa rodando como administrador?
// Se não der para descobrir (acesso negado), assume que sim: é o caso típico de janela elevada.
function janelaDaFrenteEhAdmin() {
  if (!api) return false;
  const hwnd = api.GetForegroundWindow();
  if (!hwnd) return false;
  const pid = [0];
  api.GetWindowThreadProcessId(hwnd, pid);
  if (!pid[0] || pid[0] === process.pid) return false;
  const proc = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
  if (!proc) return true;
  try {
    const token = [null];
    if (!api.OpenProcessToken(proc, TOKEN_QUERY, token)) return true;
    try {
      const elevado = [0];
      const usado = [0];
      if (!api.GetTokenInformation(token[0], TokenElevation, elevado, 4, usado)) return true;
      return elevado[0] !== 0;
    } finally {
      api.CloseHandle(token[0]);
    }
  } finally {
    api.CloseHandle(proc);
  }
}

// Abre o app de novo pedindo permissão ao Windows (aparece a janelinha do UAC).
// Resolve true se a pessoa aceitou (o app novo está abrindo), false se cancelou.
function reabrirComoAdmin({ exe, args, pasta }) {
  const q = (s) => String(s).replace(/'/g, "''");
  // Start-Process junta os argumentos com espaço, então cada um vai entre aspas duplas
  const lista = args.length ? ` -ArgumentList ${args.map((a) => `'"${q(a)}"'`).join(",")}` : "";
  const cmd = `Start-Process -FilePath '${q(exe)}'${lista} -WorkingDirectory '${q(pasta)}' -Verb RunAs`;
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { windowsHide: true }, (erro) =>
      resolve(!erro)
    );
  });
}

module.exports = { disponivel: () => Boolean(api), ehAdmin, janelaDaFrenteEhAdmin, reabrirComoAdmin };
