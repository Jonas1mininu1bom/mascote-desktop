// Move o cursor do mouse (usado só no "modo bagunça").
// Usa a biblioteca koffi para chamar a função nativa de cada sistema.
// Se algo falhar, o pet simplesmente não pega o mouse.
const { screen } = require("electron");

let mover = null;
let motivo = "";

try {
  const koffi = require("koffi");
  if (process.platform === "win32") {
    const user32 = koffi.load("user32.dll");
    const SetCursorPos = user32.func("bool __stdcall SetCursorPos(int x, int y)");
    mover = (x, y) => {
      const p = screen.dipToScreenPoint({ x, y }); // Windows usa pixels físicos
      SetCursorPos(Math.round(p.x), Math.round(p.y));
    };
  } else if (process.platform === "darwin") {
    const cg = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
    const CGPoint = koffi.struct("CGPoint", { x: "double", y: "double" });
    const warp = cg.func("int CGWarpMouseCursorPosition(CGPoint p)");
    const assoc = cg.func("int CGAssociateMouseAndMouseCursorPosition(int conectado)");
    mover = (x, y) => {
      warp({ x, y });
      assoc(1);
    };
  } else if (process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) {
    motivo = "Wayland não permite que apps movam o mouse";
  } else {
    const x11 = koffi.load("libX11.so.6");
    const XOpenDisplay = x11.func("void *XOpenDisplay(const char *nome)");
    const XDefaultRootWindow = x11.func("unsigned long XDefaultRootWindow(void *dpy)");
    const XWarpPointer = x11.func(
      "int XWarpPointer(void *dpy, unsigned long src, unsigned long dst, int sx, int sy, unsigned int sw, unsigned int sh, int dx, int dy)"
    );
    const XFlush = x11.func("int XFlush(void *dpy)");
    const dpy = XOpenDisplay(null);
    if (!dpy) throw new Error("não abriu o display X11");
    const raiz = XDefaultRootWindow(dpy);
    mover = (x, y) => {
      const f = screen.getDisplayNearestPoint({ x, y }).scaleFactor || 1;
      XWarpPointer(dpy, 0, raiz, 0, 0, 0, 0, Math.round(x * f), Math.round(y * f));
      XFlush(dpy);
    };
  }
} catch (e) {
  motivo = e.message;
}

if (!mover) console.warn(`[cursor] o pet não vai conseguir pegar o mouse: ${motivo}`);

module.exports = {
  disponivel: () => Boolean(mover),
  moverCursor: (x, y) => {
    try {
      mover?.(x, y);
    } catch (e) {
      console.warn("[cursor]", e.message);
    }
  },
};
