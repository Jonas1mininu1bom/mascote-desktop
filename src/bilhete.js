// Bilhetinho trazido pelo pet. Os dados já chegam validados pelo processo principal.
const parametros = new URLSearchParams(location.search);
const dados = JSON.parse(parametros.get("dados") || "{}");
const el = document.getElementById("conteudo");

// ---------- cor ----------
const hex = /^#[0-9a-f]{6}$/i.test(dados.cor || "") ? dados.cor : "#fff8b8";
const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const escurecer = (f) => `rgb(${rgb.map((c) => Math.round(c * f)).join(",")})`;
const claro = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.55;
const s = document.documentElement.style;
s.setProperty("--fundo", hex);
s.setProperty("--topo", escurecer(0.9));
s.setProperty("--borda", escurecer(0.78));
s.setProperty("--texto", claro ? "#3b3a30" : "#ffffff");

// ---------- conteúdo ----------
function mostrarTexto(t) {
  el.textContent = t || "Oi!";
  // diminui a fonte até caber
  let tam = 17;
  while (tam > 11 && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) el.style.fontSize = --tam + "px";
}
if (typeof dados.imagem === "string" && dados.imagem.startsWith("file:")) {
  const i = document.createElement("img");
  i.alt = dados.texto || "";
  i.onerror = () => mostrarTexto(dados.texto);
  i.src = dados.imagem;
  el.appendChild(i);
} else mostrarTexto(typeof dados.texto === "string" ? dados.texto : "");

document.getElementById("x").onclick = () => window.api.enviar("bilhete:fechar");

// No Linux, janelas fora do alternador de tarefas não ganham o arrasto do gerenciador.
if (parametros.get("arrastoManual") === "1") {
  const topo = document.querySelector("header");
  topo.classList.add("arrasto-manual");
  topo.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    topo.setPointerCapture(e.pointerId);
    window.api.enviar("bilhete:arrastar", { fase: "inicio", x: e.screenX, y: e.screenY });
  });
  topo.addEventListener("pointermove", (e) => {
    if (topo.hasPointerCapture(e.pointerId)) window.api.enviar("bilhete:arrastar", { fase: "mover", x: e.screenX, y: e.screenY });
  });
  topo.addEventListener("lostpointercapture", () => window.api.enviar("bilhete:arrastar", { fase: "fim" }));
}
