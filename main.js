// Mascote Desktop: processo principal do Electron.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, globalShortcut, session } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { listarPets, quadroParaBitmap } = require("./src/pets");
const { ChatClaude } = require("./src/claude");
const bilhetesMod = require("./src/bilhetes");
const travessuras = require("./src/travessuras");

if (process.platform === "linux") app.commandLine.appendSwitch("enable-transparent-visuals");
if (!app.requestSingleInstanceLock()) app.quit();

// ---------- log ----------
// Grava em <userData>/logs/mascote.log tudo do processo principal e das páginas (overlay, chat).
let arqLog = null;
function log(origem, nivel, ...partes) {
  const linha = `${new Date().toISOString()} [${origem}] ${nivel}: ${partes.map((p) => (p instanceof Error ? p.stack : typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
  (nivel === "error" ? console.error : console.log)(linha);
  try {
    if (!arqLog) {
      const pasta = path.join(app.getPath("userData"), "logs");
      fs.mkdirSync(pasta, { recursive: true });
      arqLog = path.join(pasta, "mascote.log");
      if (fs.existsSync(arqLog) && fs.statSync(arqLog).size > 1024 * 1024) fs.renameSync(arqLog, arqLog + ".1");
    }
    fs.appendFileSync(arqLog, linha + "\n");
  } catch {}
}
process.on("uncaughtException", (e) => log("main", "error", e));
process.on("unhandledRejection", (e) => log("main", "error", e));

// Repassa o console de uma página para o log, e avisa se ela cair ou travar.
function vigiar(nome, w) {
  const wc = w.webContents;
  wc.on("console-message", (e) => {
    if (e.level === "debug" || (e.level === "info" && !String(e.message).startsWith("[mouse]"))) return;
    log(nome, e.level, e.message, `(${path.basename(e.sourceId || "")}:${e.lineNumber})`);
  });
  wc.on("render-process-gone", (_e, d) => log(nome, "error", "a página caiu:", d.reason, "código", d.exitCode));
  w.on("unresponsive", () => log(nome, "warning", "a página parou de responder"));
  w.on("responsive", () => log(nome, "info", "a página voltou a responder"));
}

// ---------- configuração ----------
const PADRAO = { pet: "palito", passear: false, bagunca: false, pasta: os.homedir(), travessuras: {}, telas: "todas" };
let config = { ...PADRAO };
const arqConfig = () => path.join(app.getPath("userData"), "config.json");
const pastaPetsUsuario = () => path.join(app.getPath("userData"), "pets");
const pastaBilhetesUsuario = () => path.join(app.getPath("userData"), "bilhetes");
const pastaTravessurasUsuario = () => path.join(app.getPath("userData"), "travessuras");
const listaTravessuras = () =>
  travessuras.listar({ arqPadrao: path.join(__dirname, "travessuras", "padrao.json"), pastaUsuario: pastaTravessurasUsuario() });
function abrirPastaTravessuras() {
  travessuras.prepararPasta(pastaTravessurasUsuario());
  shell.openPath(pastaTravessurasUsuario());
}
function abrirPastaBilhetes() {
  bilhetesMod.prepararPasta(pastaBilhetesUsuario());
  travessuras.prepararPasta(pastaTravessurasUsuario());
  shell.openPath(pastaBilhetesUsuario());
}

function carregarConfig() {
  try {
    config = { ...PADRAO, ...JSON.parse(fs.readFileSync(arqConfig(), "utf8")) };
  } catch {
    config = { ...PADRAO };
  }
  if (!fs.existsSync(config.pasta)) config.pasta = os.homedir();
  if (!config.travessuras || typeof config.travessuras !== "object" || Array.isArray(config.travessuras)) config.travessuras = {};
}
function salvarConfig() {
  fs.mkdirSync(path.dirname(arqConfig()), { recursive: true });
  fs.writeFileSync(arqConfig(), JSON.stringify(config, null, 2));
}

// ---------- pets ----------
let pets = [];
const petAtual = () => pets.find((p) => p.id === config.pet) || pets.find((p) => p.id === "palito") || pets[0];
function recarregarPets() {
  fs.mkdirSync(pastaPetsUsuario(), { recursive: true });
  pets = listarPets([path.join(__dirname, "pets"), pastaPetsUsuario()]);
}

// ---------- janelas ----------
let overlay = null; // tela inteira, transparente, onde o pet vive
let chat = null; // botão/painel de chat fixo no canto
let tray = null;
let chatAberto = false;
const bilhetes = new Map();
let proxIdBilhete = 1;
const MARGEM = 16;
const BOTAO = 64;
const PAINEL = { w: 360, h: 520 };

const tela = () => screen.getPrimaryDisplay();

// O overlay cobre todos os monitores juntos; as coordenadas do pet são relativas a este retângulo.
function areaTotal() {
  const ds = screen.getAllDisplays().map((d) => d.bounds);
  const x = Math.min(...ds.map((b) => b.x));
  const y = Math.min(...ds.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...ds.map((b) => b.x + b.width)) - x,
    height: Math.max(...ds.map((b) => b.y + b.height)) - y,
  };
}

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));
const centroBotao = (b) => ({ x: b.x + BOTAO / 2, y: b.y + BOTAO / 2 });

// Posição do botão do chat (pode ser arrastado; fica salvo em config.chatPos). Sem posição salva: canto inferior direito.
function posBotao() {
  const p = config.chatPos;
  if (p && num(p.x) && num(p.y)) {
    const wa = screen.getDisplayNearestPoint(centroBotao(p)).workArea; // se o monitor sumiu, cai no mais próximo
    return {
      x: Math.round(limitar(p.x, wa.x, wa.x + wa.width - BOTAO)),
      y: Math.round(limitar(p.y, wa.y, wa.y + wa.height - BOTAO)),
    };
  }
  const wa = tela().workArea;
  return { x: wa.x + wa.width - BOTAO - MARGEM, y: wa.y + wa.height - BOTAO - MARGEM };
}
const telaDoChat = () => screen.getDisplayNearestPoint(centroBotao(posBotao()));

// O painel abre a partir do botão, crescendo para o lado em que há mais espaço.
function boundsChat(aberto) {
  const b = posBotao();
  if (!aberto) return { ...b, width: BOTAO, height: BOTAO };
  const wa = telaDoChat().workArea;
  const c = centroBotao(b);
  const x = c.x < wa.x + wa.width / 2 ? b.x : b.x + BOTAO - PAINEL.w;
  const y = c.y < wa.y + wa.height / 2 ? b.y : b.y + BOTAO - PAINEL.h;
  return {
    x: Math.round(limitar(x, wa.x, wa.x + wa.width - PAINEL.w)),
    y: Math.round(limitar(y, wa.y, wa.y + wa.height - PAINEL.h)),
    width: PAINEL.w,
    height: PAINEL.h,
  };
}

// Onde o pet fica: ao lado do chat (à esquerda; se não couber, à direita), com os pés na base dele.
function casaPara(r) {
  const o = areaTotal();
  const wa = telaDoChat().workArea;
  const esquerda = r.x - 44 > wa.x + 40;
  return { x: (esquerda ? r.x - 44 : r.x + r.width + 44) - o.x, y: Math.min(r.y + r.height, wa.y + wa.height) - o.y - 2 };
}

// Telas em que o pet pode ficar: todas, ou só a escolhida em ⚙️ (config.telas = id do monitor).
function telasPermitidas() {
  const ds = screen.getAllDisplays();
  const escolhida = config.telas !== "todas" && ds.find((d) => String(d.id) === String(config.telas));
  return escolhida ? [escolhida] : ds; // se a tela escolhida foi desconectada, volta para todas
}
function listarTelas() {
  const prim = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({ id: String(d.id), nome: `Tela ${i + 1} (${d.size.width}x${d.size.height}${d.id === prim ? ", principal" : ""})` }));
}

// Informações da tela no sistema de coordenadas do overlay.
function infoTela() {
  const o = areaTotal();
  const rel = (r) => ({ x: r.x - o.x, y: r.y - o.y, w: r.width, h: r.height });
  const permitidas = telasPermitidas();
  const chatD = telaDoChat();
  // a casa é ao lado do chat; se o chat estiver numa tela onde o pet não pode ficar, é no canto da tela dele
  const casaD = permitidas.find((d) => d.id === chatD.id) || permitidas[0];
  const wa = casaD.workArea;
  const casa =
    casaD.id === chatD.id
      ? casaPara(boundsChat(chatAberto))
      : { x: wa.x + wa.width - 60 - o.x, y: wa.y + wa.height - 2 - o.y };
  return {
    largura: o.width,
    altura: o.height,
    area: rel(wa), // tela da casa
    areas: permitidas.map((d) => rel(d.workArea)), // onde ele pode andar
    casa,
    painel: chatAberto ? rel(boundsChat(true)) : null,
  };
}

// Todas as janelas: sem Node na página, isoladas e em sandbox.
function prefsSeguras() {
  return {
    preload: path.join(__dirname, "src/preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    spellcheck: false,
  };
}

// Só aceita mensagens vindas das páginas do próprio app.
const PASTA_SRC = pathToFileURL(path.join(__dirname, "src")).href + "/";
function origemConfiavel(e) {
  const url = e.senderFrame?.url || "";
  if (url.startsWith(PASTA_SRC)) return true;
  console.warn("[ipc] mensagem recusada de", url || "(desconhecido)");
  return false;
}
const num = (v) => typeof v === "number" && Number.isFinite(v);

const naoFocavel = { focusable: false, skipTaskbar: true, hasShadow: false };

function criarOverlay() {
  overlay = new BrowserWindow({
    ...areaTotal(),
    ...naoFocavel,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: prefsSeguras(),
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  // o Windows limita janelas novas ao tamanho de um monitor; reaplicar depois de criada cobre todos
  overlay.setBounds(areaTotal());
  overlay.once("ready-to-show", () => overlay.setBounds(areaTotal()));
  overlay.loadFile(path.join(__dirname, "src/overlay.html"));
  vigiar("overlay", overlay);
  // se a página do pet cair, cria de novo (senão ele some até reiniciar o app)
  overlay.webContents.on("render-process-gone", () => {
    setTimeout(() => {
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      criarOverlay();
      log("overlay", "warning", "overlay recriado depois de cair");
    }, 1000);
  });
}

function criarChat() {
  chat = new BrowserWindow({
    ...boundsChat(false),
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: prefsSeguras(),
  });
  chat.setAlwaysOnTop(true, "screen-saver");
  chat.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  chat.loadFile(path.join(__dirname, "src/chat.html"));
  vigiar("chat", chat);
}

function abrirChat(aberto) {
  chatAberto = aberto;
  posicionarChat();
  chat.webContents.send("chat:estado", aberto);
  if (aberto) chat.focus();
}

let posicionando = false;
function posicionarChat() {
  posicionando = true;
  chat.setBounds(boundsChat(chatAberto));
  setTimeout(() => (posicionando = false), 100);
  // o pet acompanha o chat (e não fica escondido atrás do painel)
  overlay?.webContents.send("tela", infoTela());
}

// Arrastar o botão: a página avisa início/fim; o processo principal segue o mouse.
let arrasto = null;
function arrastarChat(ativo) {
  if (process.env.MASCOTE_DEBUG) log("main", "info", "[debug] arrastarChat", ativo, Boolean(arrasto));
  if (ativo && !arrasto) {
    const c = screen.getCursorScreenPoint();
    const [x, y] = chat.getPosition();
    arrasto = { dx: c.x - x, dy: c.y - y, inicio: c, moveu: false };
    arrasto.timer = setInterval(() => {
      const p = screen.getCursorScreenPoint();
      if (!arrasto.moveu && Math.hypot(p.x - arrasto.inicio.x, p.y - arrasto.inicio.y) < 5) return;
      arrasto.moveu = true;
      chat.setPosition(p.x - arrasto.dx, p.y - arrasto.dy);
    }, 16);
  } else if (!ativo && arrasto) {
    clearInterval(arrasto.timer);
    const moveu = arrasto.moveu;
    arrasto = null;
    if (!moveu) return false;
    const [x, y] = chat.getPosition();
    if (chatAberto) {
      // arrastou o painel aberto: o botão fica no canto do painel que corresponde ao lado em que ele abre
      const wa = screen.getDisplayNearestPoint({ x: x + PAINEL.w / 2, y: y + PAINEL.h / 2 }).workArea;
      const bx = x + PAINEL.w / 2 < wa.x + wa.width / 2 ? x : x + PAINEL.w - BOTAO;
      const by = y + PAINEL.h / 2 < wa.y + wa.height / 2 ? y : y + PAINEL.h - BOTAO;
      config.chatPos = { x: bx, y: by };
    } else config.chatPos = { x, y };
    salvarConfig();
    posicionarChat();
    return true;
  }
  return false;
}

function enviarParaTodos(canal, dados) {
  for (const w of [overlay, chat]) if (w && !w.isDestroyed()) w.webContents.send(canal, dados);
}

// Envia a posição do mouse para o overlay (~60 vezes por segundo).
function iniciarCursor() {
  setInterval(() => {
    if (!overlay || overlay.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const o = areaTotal();
    overlay.webContents.send("cursor", { x: p.x - o.x, y: p.y - o.y });
  }, 16);
}

// ---------- bandeja ----------
function iconeBandeja() {
  const pet = petAtual();
  try {
    if (pet.tipo === "pixel") {
      const { buf, w, h } = quadroParaBitmap(pet, pet.animacoes.parado.quadros[0], 1);
      return nativeImage.createFromBitmap(buf, { width: w, height: h }).resize({ height: 22 });
    }
    return nativeImage.createFromPath(new URL(pet.animacoes.parado.quadros[0]).pathname).resize({ height: 22 });
  } catch {
    return nativeImage.createEmpty();
  }
}

function montarBandeja() {
  const menu = Menu.buildFromTemplate([
    { label: petAtual().nome, enabled: false },
    { label: "Abrir o chat", click: () => abrirChat(true) },
    { label: "Chamar o pet de volta", click: () => overlay.webContents.send("pet:voltar") },
    { label: "Chat de volta para o canto", click: () => ((config.chatPos = undefined), salvarConfig(), posicionarChat()) },
    { type: "separator" },
    { label: "Passear pela tela", type: "checkbox", checked: config.passear, click: (i) => mudarConfig({ passear: i.checked }) },
    { label: "Modo bagunça (pega o mouse, traz bilhetes)", type: "checkbox", checked: config.bagunca, click: (i) => mudarConfig({ bagunca: i.checked }) },
    { type: "separator" },
    {
      label: "Escolher pet",
      submenu: pets.map((p) => ({ label: p.nome, type: "radio", checked: p.id === petAtual().id, click: () => escolherPet(p.id) })),
    },
    { label: "Abrir pasta de pets…", click: () => shell.openPath(pastaPetsUsuario()) },
    { label: "Abrir pasta de bilhetes…", click: abrirPastaBilhetes },
    { label: "Abrir pasta de travessuras…", click: abrirPastaTravessuras },
    { label: "Recarregar pets", click: () => escolherPet(config.pet) },
    { type: "separator" },
    { label: "Sair", click: () => app.quit() },
  ]);
  try {
    if (!tray) tray = new Tray(iconeBandeja());
    else tray.setImage(iconeBandeja());
    tray.setToolTip("Mascote Desktop");
    tray.setContextMenu(menu);
  } catch (e) {
    console.warn("[bandeja] indisponível:", e.message);
  }
}

function mudarConfig(parcial) {
  config = { ...config, ...parcial };
  if (!config.passear) config.bagunca = false; // bagunça precisa que ele possa andar
  if (parcial.bagunca) config.passear = true;
  salvarConfig();
  enviarParaTodos("config", config);
  if ("telas" in parcial) overlay?.webContents.send("tela", infoTela());
  montarBandeja();
}

function escolherPet(id) {
  const trocou = id !== config.pet;
  recarregarPets();
  if (trocou) conversa.novaConversa(); // cada personagem começa a própria conversa
  mudarConfig({ pet: id });
  enviarParaTodos("pet:trocar", petAtual());
}

// ---------- bilhetes ----------
function criarBilhete({ x, y }) {
  const conteudo = bilhetesMod.sortear({
    arqPadrao: path.join(__dirname, "bilhetes", "padrao.json"),
    pastaUsuario: pastaBilhetesUsuario(),
    pet: petAtual(),
  });
  const id = proxIdBilhete++;
  const o = areaTotal();
  const w = new BrowserWindow({
    x: Math.round(o.x + x),
    y: Math.round(o.y + y),
    width: 240,
    height: 150,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: prefsSeguras(),
  });
  w.setAlwaysOnTop(true, "floating");
  w.loadFile(path.join(__dirname, "src/bilhete.html"), { query: { dados: JSON.stringify(conteudo) } });
  w.once("ready-to-show", () => w.showInactive());
  w.on("closed", () => {
    bilhetes.delete(id);
    overlay?.webContents.send("bilhete:fechado", id);
  });
  bilhetes.set(id, w);
  return { id, largura: 240, altura: 150 };
}

// ---------- IPC ----------
const conversa = new ChatClaude();
const pedidosPermissao = new Map();
let proxPermissao = 1;

function registrarIpc() {
  const on = (canal, fn) => ipcMain.on(canal, (e, ...a) => origemConfiavel(e) && fn(e, ...a));
  const handle = (canal, fn) => ipcMain.handle(canal, (e, ...a) => (origemConfiavel(e) ? fn(e, ...a) : null));
  handle("inicio", () => ({ pet: petAtual(), config, tela: infoTela(), mouseNativo: require("./src/cursor").disponivel(), debug: process.env.MASCOTE_DEBUG || null }));
  on("pet:ignorar", (_e, ignorar) => overlay?.setIgnoreMouseEvents(ignorar === true, { forward: true }));
  on("pet:moverCursor", (_e, { x, y } = {}) => {
    if (!config.bagunca || config.travessuras?.["pegar-mouse"] === false || !num(x) || !num(y)) return;
    const o = areaTotal();
    require("./src/cursor").moverCursor(o.x + x, o.y + y);
  });
  handle("bilhete:criar", (_e, dados) =>
    config.bagunca && bilhetes.size < 5 && dados && num(dados.x) && num(dados.y) ? criarBilhete(dados) : null
  );
  on("bilhete:mover", (_e, { id, x, y } = {}) => {
    if (!num(x) || !num(y)) return;
    const w = bilhetes.get(id);
    const o = areaTotal();
    if (w && !w.isDestroyed()) w.setPosition(Math.round(o.x + x), Math.round(o.y + y));
  });
  on("bilhete:fechar", (e) => BrowserWindow.fromWebContents(e.sender)?.close());

  on("config:mudar", (_e, parcial) => {
    const limpo = filtrarConfigDaPagina(parcial);
    if (Object.keys(limpo).length) mudarConfig(limpo);
  });
  handle("pets:listar", () => pets.map((p) => ({ id: p.id, nome: p.nome })));
  handle("telas:listar", () => listarTelas());
  on("pets:escolher", (_e, id) => typeof id === "string" && pets.some((p) => p.id === id) && escolherPet(id));
  on("pets:abrirPasta", () => shell.openPath(pastaPetsUsuario()));
  on("bilhetes:abrirPasta", abrirPastaBilhetes);
  on("travessuras:abrirPasta", abrirPastaTravessuras);

  // ---------- travessuras ----------
  // "Pegar o mouse" não é executada aqui (é o pet que corre atrás), mas liga/desliga igual às outras.
  // Diferente das outras, vem ligada (era o comportamento original do modo bagunça).
  const PEGAR_MOUSE = { id: "pegar-mouse", nome: "Pegar o mouse", tipo: "mouse" };
  handle("travessuras:listar", () => [
    ...(require("./src/cursor").disponivel() ? [{ ...PEGAR_MOUSE, ligada: config.travessuras?.["pegar-mouse"] !== false }] : []),
    ...listaTravessuras().map((t) => ({ id: t.id, nome: t.nome, tipo: t.tipo, ligada: config.travessuras?.[t.id] === true })),
  ]);
  on("travessuras:ligar", (_e, { id, ligada } = {}) => {
    if (typeof ligada !== "boolean" || (id !== PEGAR_MOUSE.id && !listaTravessuras().some((t) => t.id === id))) return;
    mudarConfig({ travessuras: { ...config.travessuras, [id]: ligada } });
  });
  handle("travessura:pedir", () => {
    if (!config.bagunca) return null;
    const t = travessuras.sortear(listaTravessuras(), config.travessuras || {}, { semIntervalo: process.env.MASCOTE_DEBUG === "travessura" });
    if (t) log("main", "info", "travessura:", t.nome, "x" + t.vezes);
    return t;
  });
  on("travessura:executar", async (_e, token) => {
    if (!config.bagunca || typeof token !== "string") return;
    try {
      await travessuras.executar(token, {
        abrirLink: (url) => shell.openExternal(url),
        aoTocar: (i) => overlay?.webContents.send("travessura:tecla", i),
      });
    } catch (e) {
      log("main", "error", "travessura falhou:", e);
    }
    overlay?.webContents.send("travessura:fim");
  });
  on("pet:voltar", () => overlay?.webContents.send("pet:voltar"));
  on("app:sair", () => app.quit());

  on("chat:abrir", (_e, aberto) => (process.env.MASCOTE_DEBUG && log("main", "info", "[debug] chat:abrir", aberto), abrirChat(aberto === true)));
  handle("chat:arrastar", (_e, ativo) => arrastarChat(ativo === true));
  on("chat:posicaoPadrao", () => {
    delete config.chatPos;
    salvarConfig();
    posicionarChat();
  });
  handle("chat:escolherPasta", async () => {
    const r = await dialog.showOpenDialog(chat, { properties: ["openDirectory"], defaultPath: config.pasta });
    if (!r.canceled && r.filePaths[0]) {
      mudarConfig({ pasta: r.filePaths[0] });
      conversa.novaConversa();
    }
    return config.pasta;
  });
  on("chat:nova", () => conversa.novaConversa());
  on("chat:parar", () => conversa.parar());
  on("chat:responderPermissao", (_e, { id, ok } = {}) => {
    pedidosPermissao.get(id)?.(ok === true);
    pedidosPermissao.delete(id);
  });
  on("chat:enviar", (_e, texto) => {
    if (typeof texto !== "string" || !texto.trim() || texto.length > 20000) return;
    const pet = petAtual();
    const humor = (h) => overlay?.webContents.send("pet:humor", h);
    humor("pensando");
    conversa.enviar(
      texto,
      { pasta: config.pasta, pet },
      {
        texto: (t) => {
          chat.webContents.send("chat:texto", t);
          humor("falando");
        },
        ferramenta: (r) => {
          chat.webContents.send("chat:ferramenta", r);
          humor("trabalhando");
        },
        permissao: (dados) =>
          new Promise((resolve) => {
            const id = proxPermissao++;
            pedidosPermissao.set(id, resolve);
            if (!chatAberto) abrirChat(true);
            chat.webContents.send("chat:permissao", { id, ...dados });
            humor("pensando");
          }),
        erro: (m) => chat.webContents.send("chat:erro", m),
        fim: () => {
          chat.webContents.send("chat:fim");
          humor("feliz");
        },
      }
    );
  });
}

// ---------- blindagem ----------
// Nenhuma janela navega para outro lugar, abre pop-ups, pede permissões ou ganha <webview>.
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-navigate", (ev) => ev.preventDefault());
  wc.on("will-redirect", (ev) => ev.preventDefault());
  wc.on("will-attach-webview", (ev) => ev.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
});

// O que a página do chat pode mudar na configuração.
// (a pasta de trabalho e o pet têm canais próprios, com diálogo/validação no processo principal)
const CONFIG_DA_PAGINA = ["passear", "bagunca"]; // allowlist: chave nova fica bloqueada por padrão
function filtrarConfigDaPagina(parcial) {
  if (!parcial || typeof parcial !== "object" || Array.isArray(parcial)) return {};
  const limpo = {};
  for (const chave of CONFIG_DA_PAGINA) {
    if (typeof parcial[chave] === "boolean") limpo[chave] = parcial[chave];
  }
  // telas: "todas" ou o id de um monitor conectado
  if (parcial.telas === "todas" || (typeof parcial.telas === "string" && listarTelas().some((t) => t.id === parcial.telas))) {
    limpo.telas = parcial.telas;
  }
  return limpo;
}

// ---------- início ----------
app.whenReady().then(() => {
  log("main", "info", `iniciando v${app.getVersion()} (Electron ${process.versions.electron}), telas:`, screen.getAllDisplays().map((d) => d.bounds));
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, ok) => ok(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  carregarConfig();
  recarregarPets();
  bilhetesMod.prepararPasta(pastaBilhetesUsuario());
  travessuras.prepararPasta(pastaTravessurasUsuario());
  if (pets.length === 0) {
    dialog.showErrorBox("Mascote Desktop", "Nenhum pet encontrado na pasta pets/.");
    return app.quit();
  }
  registrarIpc();
  // teste do "chamar de volta": o overlay põe o pet longe e aqui chamamos pelo mesmo canal do botão
  if (process.env.MASCOTE_DEBUG === "voltar") setTimeout(() => overlay?.webContents.send("pet:voltar"), 4000);
  criarOverlay();
  criarChat();
  montarBandeja();
  iniciarCursor();
  globalShortcut.register("CommandOrControl+Alt+Shift+Q", () => app.quit());
  const telasMudaram = () => {
    log("main", "info", "telas mudaram:", screen.getAllDisplays().map((d) => d.bounds));
    overlay?.setBounds(areaTotal());
    if (chat) posicionarChat();
    else overlay?.webContents.send("tela", infoTela());
  };
  for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.on(ev, telasMudaram);
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
