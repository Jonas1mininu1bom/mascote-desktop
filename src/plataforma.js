// O que muda de um sistema para outro (Windows, macOS, Linux), num lugar só.
// - iniciar junto com o sistema;
// - permissões (Acessibilidade no Mac);
// - Linux: sessão Wayland, que não deixa apps mexerem no mouse/teclado nem saberem onde o mouse está.
const { app, systemPreferences, shell } = require("electron");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";
const LINUX = process.platform === "linux";

// Sessão Wayland (GNOME/KDE novos). O app roda pelo XWayland para conseguir se posicionar na tela,
// mas o Wayland ainda isola o resto: teclas falsas e mover o mouse não chegam nos outros programas.
const wayland = () => LINUX && (process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY));

const nomeSistema = () => (WIN ? "Windows" : MAC ? "macOS" : "Linux");

// ---------- iniciar com o sistema ----------
// Windows e Mac: o próprio Electron registra. Linux: um arquivo .desktop em ~/.config/autostart
// (padrão do freedesktop, vale para GNOME, KDE, XFCE, Cinnamon...).
const arqAutostart = () =>
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "autostart", "mascote-desktop.desktop");

// Como abrir este mesmo app de novo: AppImage, instalado (.deb) ou rodando pelo código (npm start).
function comandoDoApp() {
  const exe = process.env.APPIMAGE || process.execPath;
  const args = app.isPackaged ? [] : [app.getAppPath()];
  if (LINUX) args.push("--ozone-platform=x11");
  return { exe, args };
}
const aspas = (s) => `"${String(s).replace(/(["`$\\])/g, "\\$1")}"`;

function textoDesktop() {
  const { exe, args } = comandoDoApp();
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Mascote Desktop",
    "Comment=Um bichinho que mora na sua tela",
    `Exec=${[exe, ...args].map(aspas).join(" ")}`,
    `Icon=${path.join(__dirname, "..", "assets", "icone.png")}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

// No Mac, só o app empacotado (.app) pode entrar nos itens de login: rodando pelo código,
// o sistema abriria o Electron "vazio", sem o mascote.
const iniciarDisponivel = () => WIN || LINUX || (MAC && app.isPackaged);

function itemLoginWin() {
  const { exe, args } = comandoDoApp();
  return { path: exe, args };
}

function iniciarComSistema() {
  try {
    if (WIN) return app.getLoginItemSettings(itemLoginWin()).openAtLogin;
    if (MAC) return app.isPackaged && app.getLoginItemSettings().openAtLogin;
    if (LINUX) return fs.existsSync(arqAutostart());
  } catch {}
  return false;
}

function definirIniciarComSistema(ligar) {
  if (!iniciarDisponivel()) return;
  if (WIN) app.setLoginItemSettings({ ...itemLoginWin(), openAtLogin: ligar });
  else if (MAC) app.setLoginItemSettings({ openAtLogin: ligar });
  else if (LINUX) {
    if (ligar) {
      fs.mkdirSync(path.dirname(arqAutostart()), { recursive: true });
      fs.writeFileSync(arqAutostart(), textoDesktop());
    } else fs.rmSync(arqAutostart(), { force: true });
  }
}

// ---------- Acessibilidade (Mac) ----------
// O macOS só deixa um app apertar teclas por você (Cmd+Tab das travessuras) se ele estiver em
// Ajustes do Sistema → Privacidade e Segurança → Acessibilidade. Mover o mouse não precisa disso.
function acessibilidade() {
  if (!MAC) return true;
  try {
    return systemPreferences.isTrustedAccessibilityClient(false);
  } catch {
    return false;
  }
}
function pedirAcessibilidade() {
  if (!MAC) return true;
  let ok = false;
  try {
    ok = systemPreferences.isTrustedAccessibilityClient(true); // mostra o aviso do próprio macOS
  } catch {}
  if (!ok) shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  return ok;
}

// ---------- telas no Mac ----------
// Com "Monitores têm Spaces separados" (o padrão do macOS), uma janela não aparece em dois monitores
// ao mesmo tempo. Aí o pet mora só no monitor do chat (e muda junto quando o chat muda de monitor).
let separados = null;
function macMonitoresSeparados() {
  if (!MAC) return false;
  if (separados === null) {
    try {
      // "spans-displays" = 1 quando a opção está DESLIGADA (uma área só para todos os monitores)
      separados = execFileSync("defaults", ["read", "com.apple.spaces", "spans-displays"], { encoding: "utf8", timeout: 2000 }).trim() !== "1";
    } catch {
      separados = true; // a chave não existe enquanto a pessoa nunca mexeu: vale o padrão (separados)
    }
  }
  return separados;
}

module.exports = {
  WIN,
  MAC,
  LINUX,
  wayland,
  nomeSistema,
  iniciarDisponivel,
  iniciarComSistema,
  definirIniciarComSistema,
  acessibilidade,
  pedirAcessibilidade,
  macMonitoresSeparados,
};
