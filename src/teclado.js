// Aperta teclas "de mentira" para as travessuras, em cada sistema.
// - Windows: keybd_event (user32).
// - macOS: CGEventPost (CoreGraphics). Precisa da permissão de Acessibilidade.
//   "alt" vira Command (Cmd+Tab troca de app, como o Alt+Tab do Windows).
// - Linux: extensão XTest do X11. No Wayland não existe jeito de um app comum fazer isso.
// Os nomes das teclas são sempre os do travessuras.json (alt, tab, shift, win, setas, d, m).
const plataforma = require("./plataforma");

const NOMES = ["alt", "tab", "shift", "win", "esquerda", "cima", "direita", "baixo", "d", "m"];
const SETAS = ["esquerda", "cima", "direita", "baixo"];

let enviar = null; // (nomeNoSistema, soltar) => void
let motivo = "";
let teclasDoSistema = {}; // nome do json -> tecla no sistema
let rotulos = { alt: "Alt", tab: "Tab", shift: "Shift", win: "⊞ Win", esquerda: "←", cima: "↑", direita: "→", baixo: "↓", d: "D", m: "M" };

try {
  const koffi = require("koffi");
  if (plataforma.WIN) {
    // [código virtual, é "estendida"?]
    const VK = {
      alt: [0x12, false], tab: [0x09, false], shift: [0x10, false], win: [0x5b, true],
      esquerda: [0x25, true], cima: [0x26, true], direita: [0x27, true], baixo: [0x28, true],
      d: [0x44, false], m: [0x4d, false],
    };
    const user32 = koffi.load("user32.dll");
    const f = user32.func("void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)");
    teclasDoSistema = VK;
    enviar = ([vk, ext], soltar) => f(vk, 0, (soltar ? 2 : 0) | (ext ? 1 : 0), 0);
  } else if (plataforma.MAC) {
    // códigos de tecla do Mac (kVK_*) e a "bandeira" de modificador que cada um liga
    const CMD = 0x100000, SHIFT = 0x20000, CTRL = 0x40000;
    teclasDoSistema = {
      alt: [0x37, CMD], // Command
      win: [0x3b, CTRL], // Control (só com setas: Ctrl+setas troca de Space / abre o Mission Control)
      shift: [0x38, SHIFT],
      tab: [0x30, 0], esquerda: [0x7b, 0], direita: [0x7c, 0], baixo: [0x7d, 0], cima: [0x7e, 0],
      d: [0x02, 0], m: [0x2e, 0],
    };
    rotulos = { ...rotulos, alt: "⌘ Cmd", win: "⌃ Ctrl" };
    const cg = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
    const cf = koffi.load("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
    const CGEventCreateKeyboardEvent = cg.func("void *CGEventCreateKeyboardEvent(void *fonte, uint16_t tecla, bool desce)");
    const CGEventSetFlags = cg.func("void CGEventSetFlags(void *ev, uint64_t flags)");
    const CGEventPost = cg.func("void CGEventPost(uint32_t onde, void *ev)");
    const CFRelease = cf.func("void CFRelease(void *obj)");
    let flags = 0; // modificadores segurados agora
    enviar = ([codigo, bandeira], soltar) => {
      if (bandeira) flags = soltar ? flags & ~bandeira : flags | bandeira;
      const ev = CGEventCreateKeyboardEvent(null, codigo, !soltar);
      if (!ev) return;
      try {
        CGEventSetFlags(ev, flags);
        CGEventPost(0, ev); // kCGHIDEventTap: como se viesse do teclado de verdade
      } finally {
        CFRelease(ev);
      }
    };
  } else if (plataforma.wayland()) {
    motivo = "o Wayland não deixa apps apertarem teclas em outros programas";
  } else {
    // keysyms do X11
    const KS = {
      alt: 0xffe9, tab: 0xff09, shift: 0xffe1, win: 0xffeb,
      esquerda: 0xff51, cima: 0xff52, direita: 0xff53, baixo: 0xff54, d: 0x64, m: 0x6d,
    };
    rotulos = { ...rotulos, win: "Super" };
    const x11 = koffi.load("libX11.so.6");
    const xtst = koffi.load("libXtst.so.6");
    const XOpenDisplay = x11.func("void *XOpenDisplay(const char *nome)");
    const XKeysymToKeycode = x11.func("uint8_t XKeysymToKeycode(void *dpy, unsigned long ks)");
    const XFlush = x11.func("int XFlush(void *dpy)");
    const XTestFakeKeyEvent = xtst.func("int XTestFakeKeyEvent(void *dpy, unsigned int tecla, int desce, unsigned long atraso)");
    const dpy = XOpenDisplay(null);
    if (!dpy) throw new Error("não abriu o display X11");
    for (const [nome, ks] of Object.entries(KS)) {
      const kc = XKeysymToKeycode(dpy, ks);
      if (kc) teclasDoSistema[nome] = kc;
    }
    enviar = (kc, soltar) => {
      XTestFakeKeyEvent(dpy, kc, soltar ? 0 : 1, 0);
      XFlush(dpy);
    };
  }
} catch (e) {
  enviar = null;
  motivo = e.message;
}
if (!enviar) console.warn(`[teclado] travessuras de teclado indisponíveis: ${motivo}`);

// Esta combinação funciona (e é inofensiva) neste sistema?
// No Mac, Cmd+D duplica arquivos no Finder e Ctrl+D/Ctrl+M apagam/enviam texto: essas ficam de fora.
function suportada(teclas) {
  if (!enviar || !teclas.every((t) => teclasDoSistema[t] !== undefined)) return false;
  if (plataforma.MAC) {
    if (teclas.includes("alt") && teclas.includes("d")) return false;
    if (teclas.includes("win") && !teclas.every((t) => t === "win" || t === "shift" || SETAS.includes(t))) return false;
  }
  return true;
}

// Nome da travessura do jeito deste sistema ("Alt+Tab" vira "Cmd+Tab" no Mac).
function nomeLocal(nome) {
  if (plataforma.MAC) return nome.replace(/\bAlt\b/g, "Cmd").replace(/\bWin\b/g, "Ctrl");
  if (plataforma.LINUX) return nome.replace(/\bWin\b/g, "Super");
  return nome;
}

module.exports = {
  NOMES,
  disponivel: () => Boolean(enviar) && (!plataforma.MAC || plataforma.acessibilidade()),
  existe: () => Boolean(enviar), // no Mac pode existir mas ainda faltar a permissão
  motivo: () => motivo,
  suportada,
  nomeLocal,
  rotulo: (t) => rotulos[t] || t,
  apertar: (nome, soltar) => enviar(teclasDoSistema[nome], soltar),
};
