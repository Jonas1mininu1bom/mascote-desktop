// Mascote Desktop: processo principal do Electron.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, globalShortcut, session, safeStorage } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { listarPets, copiarPetsPadrao, quadroParaBitmap } = require("./src/pets");
const provedores = require("./src/provedores");
const { criarCofre } = require("./src/provedores/chaves");
const bilhetesMod = require("./src/bilhetes");
const travessuras = require("./src/travessuras");
const admin = require("./src/admin");
const plataforma = require("./src/plataforma");
const { validarImagens } = require("./src/imagens");

// Mesma pasta de dados rodando pelo código (npm start) ou instalado (o nome do app instalado tem espaço):
// ajustes, pets e bilhetes da pessoa continuam os mesmos.
// Quem passar --user-data-dir (testes, desenvolvimento) usa a pasta que escolheu, separada da sua.
if (!app.commandLine.hasSwitch("user-data-dir")) {
  app.setPath("userData", path.join(app.getPath("appData"), "mascote-desktop"));
}

if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-transparent-visuals");
  // No Wayland, um app não consegue escolher onde a própria janela fica nem saber onde o mouse está:
  // o pet não teria como cobrir a tela. Pelo XWayland (X11) isso funciona. Essa escolha só vale na
  // linha de comando (npm start e o atalho já mandam); se faltou, o app abre de novo com ela.
  // MASCOTE_WAYLAND=1 desliga isso.
  const temX11 = process.argv.some((a) => a === "--ozone-platform=x11");
  if (plataforma.wayland() && !temX11 && process.env.MASCOTE_WAYLAND !== "1") {
    app.relaunch({
      execPath: process.env.APPIMAGE || process.execPath, // AppImage: abre o arquivo .AppImage de novo
      args: [...process.argv.slice(1), "--ozone-platform=x11"],
    });
    app.exit(0);
  }
}
// No Windows, o Chromium para de PINTAR janelas que ele acha que estão cobertas por outras
// (ex.: navegador maximizado). A janela do pet é transparente e cobre as telas todas, então ele
// erra a conta: o pet "anda" por dentro mas a imagem congela, e os bilhetes não aparecem.
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
if (!app.requestSingleInstanceLock()) app.quit();
// Abriram o app de novo (atalho, Menu Iniciar) com ele já rodando: em vez de não fazer nada,
// traz o mascote de volta (se estava minimizado) e abre o chat.
app.on("second-instance", () => {
  if (!chat || chat.isDestroyed()) return;
  if (escondido) esconderMascote(false);
  abrirChat(true);
});

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
const PADRAO = { pet: "palito", passear: false, bagunca: false, pasta: os.homedir(), travessuras: {}, telas: "todas", chao: "tela" };
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
  copiarPetsPadrao(path.join(__dirname, "pets"), pastaPetsUsuario());
  pets = listarPets([path.join(__dirname, "pets"), pastaPetsUsuario()]);
}

// ---------- janelas ----------
let overlay = null; // tela inteira, transparente, onde o pet vive
let chat = null; // botão/painel de chat fixo no canto
let tray = null;
let chatAberto = false;
let escondido = false; // minimizado para a bandeja: pet, chat e bilhetes somem e o pet não apronta nada
let avisouBandeja = false;
const bilhetes = new Map();
const LIMITE_BILHETES = 50; // passou disso, o mais antigo sai (eles ficam na tela até a pessoa fechar)
let proxIdBilhete = 1;
const MARGEM = 16;
const BOTAO = 64;
// O botão de brinquedos fica à esquerda do botão do chat, na mesma janela (assim os dois se movem juntos).
const EXTRA_BRINQUEDOS = 42;
const PAINEL = { w: 360, h: 520 };

const tela = () => screen.getPrimaryDisplay();

// Monitores que o overlay cobre: todos, menos no Mac com "Monitores têm Spaces separados" (o padrão),
// em que uma janela só aparece num monitor. Aí é o monitor do chat.
function telasDoOverlay() {
  const todas = screen.getAllDisplays();
  if (todas.length > 1 && plataforma.macMonitoresSeparados()) return [telaDoChat()];
  return todas;
}

// O overlay cobre todos os monitores juntos; as coordenadas do pet são relativas a este retângulo.
function areaTotal() {
  const ds = telasDoOverlay().map((d) => d.bounds);
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
      x: Math.round(limitar(p.x, wa.x + EXTRA_BRINQUEDOS, wa.x + wa.width - BOTAO)),
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
  if (!aberto) return { x: b.x - EXTRA_BRINQUEDOS, y: b.y, width: BOTAO + EXTRA_BRINQUEDOS, height: BOTAO };
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
  const ds = telasDoOverlay();
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
    icon: ICONE_APP,
    ...areaTotal(),
    ...naoFocavel,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    enableLargerThanScreen: true, // no Mac, sem isso a janela não passa do tamanho de um monitor
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
    icon: ICONE_APP,
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
  // se a página do chat cair, carrega de novo (senão a janela fica vazia e o botão some/não responde).
  // Pedidos de permissão pendentes são negados: quem ia responder era a página que caiu.
  chat.webContents.on("render-process-gone", () => {
    for (const responder of pedidosPermissao.values()) responder(false);
    pedidosPermissao.clear();
    setTimeout(() => {
      if (!chat || chat.isDestroyed()) return;
      chatAberto = false;
      chat.setBounds(boundsChat(false));
      chat.webContents.reload();
      log("chat", "warning", "chat recarregado depois de cair");
    }, 1000);
  });
}

// Minimizar: esconde tudo e deixa só o ícone na bandeja (perto do relógio). Clicar nele traz de volta.
function esconderMascote(esconder) {
  escondido = esconder;
  const janelas = [overlay, chat, ...bilhetes.values()].filter((w) => w && !w.isDestroyed());
  for (const w of janelas) {
    if (esconder) w.hide();
    else if (w === chat) w.show();
    else w.showInactive();
  }
  if (!esconder) overlay?.setIgnoreMouseEvents(true, { forward: true });
  montarBandeja();
  if (esconder && !avisouBandeja && tray && process.platform === "win32") {
    avisouBandeja = true;
    try {
      tray.displayBalloon({
        title: "Mascote Desktop",
        content: "Estou aqui na bandeja, perto do relógio. Clique no ícone para me trazer de volta.",
        noSound: true,
      });
    } catch {}
  }
  log("main", "info", esconder ? "mascote minimizado para a bandeja" : "mascote de volta na tela");
}

function abrirChat(aberto) {
  chatAberto = aberto;
  posicionarChat();
  chat.webContents.send("chat:estado", aberto);
  if (aberto) {
    if (plataforma.MAC) app.focus({ steal: true }); // sem ícone no Dock, o Mac não passa o teclado sozinho
    chat.focus();
  }
}

let posicionando = false;
function posicionarChat() {
  posicionando = true;
  chat.setBounds(boundsChat(chatAberto));
  setTimeout(() => (posicionando = false), 100);
  // no Mac com monitores separados, o overlay muda de monitor junto com o chat
  const a = areaTotal();
  const b = overlay && !overlay.isDestroyed() ? overlay.getBounds() : a;
  if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) overlay.setBounds(a);
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
    } else config.chatPos = { x: x + EXTRA_BRINQUEDOS, y }; // a janela começa no botão de brinquedos
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
// A barra de menus do Mac é baixinha (ícones de 18 pontos); Windows e Linux usam 32 e reduzem sozinhos.
const LADO_BANDEJA = process.platform === "darwin" ? 18 : 32;
// Ícone do app (o Pato 3D): bandeja e janelas.
const ICONE_APP = path.join(__dirname, "assets", process.platform === "win32" ? "icone.ico" : "icone.png");
function iconeBandeja() {
  const pet = petAtual();
  try {
    if (pet.desenho) {
      // pets do app são 3D: na bandeja vai o ícone do app (a pixel art antiga não combina mais)
      return nativeImage.createFromPath(path.join(__dirname, "assets", "icone.png")).resize({ width: LADO_BANDEJA, height: LADO_BANDEJA, quality: "best" });
    }
    if (pet.tipo === "pixel") {
      // A bandeja do Windows espera um ícone quadrado: centraliza o boneco num quadrado transparente.
      const { buf, w, h } = quadroParaBitmap(pet, pet.animacoes.parado.quadros[0], 2);
      const lado = Math.max(w, h);
      const quadrado = Buffer.alloc(lado * lado * 4);
      const ox = Math.floor((lado - w) / 2), oy = Math.floor((lado - h) / 2);
      for (let y = 0; y < h; y++) buf.copy(quadrado, ((y + oy) * lado + ox) * 4, y * w * 4, (y + 1) * w * 4);
      return nativeImage.createFromBitmap(quadrado, { width: lado, height: lado }).resize({ width: LADO_BANDEJA, height: LADO_BANDEJA, quality: "best" });
    }
    return nativeImage.createFromPath(new URL(pet.animacoes.parado.quadros[0]).pathname).resize({ height: LADO_BANDEJA });
  } catch {
    return nativeImage.createEmpty();
  }
}

function montarBandeja() {
  const menu = Menu.buildFromTemplate([
    { label: petAtual().nome, enabled: false },
    escondido
      ? { label: "Mostrar o mascote", click: () => esconderMascote(false) }
      : { label: plataforma.MAC ? "Minimizar para a barra de menus" : "Minimizar para a bandeja", click: () => esconderMascote(true) },
    { label: "Abrir o chat", click: () => (escondido && esconderMascote(false), abrirChat(true)) },
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
    if (!tray) {
      tray = new Tray(iconeBandeja());
      // clique no ícone: mostra o mascote se estiver minimizado (no Windows; no macOS o clique abre o menu)
      tray.on("click", () => escondido && esconderMascote(false));
    } else tray.setImage(iconeBandeja());
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
    icon: ICONE_APP,
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
  w.once("ready-to-show", () => {
    w.showInactive();
    // No Windows, o "sempre no topo" se perde quando a janela nasce escondida: reaplica ao mostrar,
    // senão o bilhete fica atrás das janelas maximizadas. Depois o pet e o chat voltam para a frente
    // (o pet é desenhado por cima do papel que ele carrega).
    w.setAlwaysOnTop(true, "screen-saver");
    for (const j of [overlay, chat]) if (j && !j.isDestroyed() && j.isVisible()) j.moveTop();
  });
  w.on("closed", () => {
    bilhetes.delete(id);
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send("bilhete:fechado", id); // no fechamento do app o overlay já foi
  });
  bilhetes.set(id, w);
  return { id, largura: 240, altura: 150 };
}

// ---------- IPC ----------
// Chat: Claude Code por padrão, ou outra IA escolhida em Ajustes (config.ia). Chaves no cofre do sistema.
let cofreChaves = null;
const cofre = () => (cofreChaves ||= criarCofre({ arquivo: path.join(app.getPath("userData"), "chaves.json"), safeStorage }));
const conversa = new provedores.Conversa({ pegarConfig: () => config.ia, cofre: { pegar: (id) => cofre().pegar(id) } });
const pedidosPermissao = new Map();
let proxPermissao = 1;

let falhasCursor = 0;
let ultimoCursor = null;
let contaMoverCursor = 0;

function registrarIpc() {
  const on = (canal, fn) => ipcMain.on(canal, (e, ...a) => origemConfiavel(e) && fn(e, ...a));
  const handle = (canal, fn) => ipcMain.handle(canal, (e, ...a) => (origemConfiavel(e) ? fn(e, ...a) : null));
  handle("inicio", () => ({ pet: petAtual(), config, tela: infoTela(), mouseNativo: require("./src/cursor").disponivel(), debug: process.env.MASCOTE_DEBUG || null }));
  on("pet:ignorar", (_e, ignorar) => overlay?.setIgnoreMouseEvents(ignorar === true, { forward: true }));
  on("pet:moverCursor", (_e, { x, y } = {}) => {
    if (escondido || !config.bagunca || config.travessuras?.["pegar-mouse"] === false || !num(x) || !num(y)) return;
    const o = areaTotal();
    const alvo = { x: Math.round(o.x + x), y: Math.round(o.y + y) };
    require("./src/cursor").moverCursor(alvo.x, alvo.y);
    // O Windows ignora o pedido, sem dar erro, quando a janela da frente é de administrador e o app não é.
    // Bloqueado = o cursor fica PARADO no mesmo ponto enquanto mandamos ele ir para outro lugar.
    // (Se ele está se mexendo, é a mão da pessoa: aí quem decide é a regra de "puxou com força" do pet.)
    const p = screen.getCursorScreenPoint();
    if (process.env.MASCOTE_DEBUG && ++contaMoverCursor % 20 === 0) {
      log("main", "info", `[mouse] mandei o cursor para ${alvo.x},${alvo.y} e ele está em ${p.x},${p.y}`);
    }
    const longeDoAlvo = Math.hypot(p.x - alvo.x, p.y - alvo.y) > 4;
    const parado = ultimoCursor && Math.hypot(p.x - ultimoCursor.x, p.y - ultimoCursor.y) <= 1;
    ultimoCursor = p;
    falhasCursor = longeDoAlvo && parado ? falhasCursor + 1 : 0;
    if (falhasCursor >= 8) {
      falhasCursor = 0;
      const janelaAdmin = process.platform === "win32" && !admin.ehAdmin() && admin.janelaDaFrenteEhAdmin();
      log("main", "info", "[mouse] o cursor não obedeceu", janelaAdmin ? "(janela de administrador na frente)" : "");
      overlay?.webContents.send("mouse:bloqueado", { janelaAdmin });
    }
  });
  handle("bilhete:criar", (_e, dados) => {
    if (escondido || !config.bagunca || !dados || !num(dados.x) || !num(dados.y)) return null;
    // No máximo 5 na tela: o mais antigo sai para dar lugar ao novo (antes ele parava de trazer,
    // e bilhetes "perdidos", fora da vista, travavam tudo).
    if (bilhetes.size >= LIMITE_BILHETES) {
      const [idAntigo, antigo] = bilhetes.entries().next().value;
      bilhetes.delete(idAntigo);
      if (!antigo.isDestroyed()) antigo.close();
      log("main", "info", `bilhete: já tinha ${LIMITE_BILHETES}, fechei o mais antigo`);
    }
    log("main", "info", `bilhete: trazendo um novo (${bilhetes.size + 1} na tela)`);
    return criarBilhete(dados);
  });
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
  // Travessuras "do pet" (ele mesmo faz, não passam pelo sorteio daqui), mas ligam/desligam igual às outras.
  // padrao: como vem quando a pessoa nunca mexeu. admin: só pode ligar com o app rodando como administrador.
  const DO_PET = [
    {
      id: "pegar-mouse", nome: "Pegar o mouse", tipo: "mouse", padrao: true, precisa: () => require("./src/cursor").disponivel(),
      aviso: () =>
        process.platform === "win32" && !admin.ehAdmin()
          ? "Sem permissão de administrador, ele não consegue puxar o mouse quando uma janela de administrador está na frente."
          : null,
    },
    { id: "seguir-mouse", nome: "Seguir o mouse", tipo: "seguir", padrao: false },
    { id: "admin-janelas", nome: "Também em janelas de administrador", tipo: "admin", padrao: false, admin: true, precisa: () => travessuras.teclasDisponiveis() && admin.disponivel() },
  ];
  // Por que uma travessura está com cadeado: falta administrador (Windows) ou Acessibilidade (Mac).
  const bloqueio = (t) => {
    if (t.admin && !admin.ehAdmin()) return "precisa de administrador";
    if (t.tipo === "teclas" && plataforma.MAC && !plataforma.acessibilidade()) return "precisa de Acessibilidade";
    return null;
  };
  const ligada = (t) => (bloqueio(t) ? false : (config.travessuras?.[t.id] ?? t.padrao) === true);
  const todasTravessuras = () => [
    ...DO_PET.filter((t) => !t.precisa || t.precisa()),
    ...listaTravessuras().map((t) => ({ ...t, padrao: false })),
  ];
  handle("travessuras:listar", () =>
    todasTravessuras().map((t) => ({
      id: t.id,
      nome: t.nome,
      tipo: t.tipo,
      ligada: ligada(t),
      precisaAdmin: Boolean(t.admin),
      precisaAcessibilidade: t.tipo === "teclas" && plataforma.MAC,
      bloqueada: Boolean(bloqueio(t)),
      selo: bloqueio(t) || (t.admin ? "admin" : null),
      aviso: t.aviso?.() || null,
    }))
  );
  on("travessuras:ligar", (_e, { id, ligada: valor } = {}) => {
    const t = todasTravessuras().find((x) => x.id === id);
    if (typeof valor !== "boolean" || !t) return;
    if (valor && bloqueio(t)) return; // com cadeado: precisa pedir permissão antes
    mudarConfig({ travessuras: { ...config.travessuras, [id]: valor } });
  });

  // ---------- permissões e iniciar com o sistema (Windows, Mac e Linux) ----------
  const estadoSistema = () => ({
    sistema: plataforma.nomeSistema(),
    windows: plataforma.WIN,
    admin: admin.ehAdmin(),
    iniciarDisponivel: plataforma.iniciarDisponivel(),
    iniciarComSistema: plataforma.iniciarComSistema(),
    // Mac: permissão de Acessibilidade para as travessuras de teclado
    acessibilidade: plataforma.MAC ? plataforma.acessibilidade() : null,
    // Linux com Wayland: teclado e mouse dos outros programas ficam de fora (limite do próprio Wayland)
    wayland: plataforma.wayland(),
  });
  handle("sistema:estado", estadoSistema);
  handle("sistema:iniciarComSistema", (_e, valor) => {
    if (typeof valor === "boolean") {
      try {
        plataforma.definirIniciarComSistema(valor);
      } catch (e) {
        log("main", "error", "iniciar com o sistema falhou:", e);
      }
    }
    return estadoSistema();
  });
  handle("sistema:pedirAcessibilidade", () => {
    plataforma.pedirAcessibilidade();
    return estadoSistema();
  });
  handle("sistema:pedirAdmin", async () => {
    if (process.platform !== "win32" || admin.ehAdmin()) return estadoSistema();
    // solta a trava de "uma instância só" para o app novo (como admin) conseguir abrir
    app.releaseSingleInstanceLock();
    const aceitou = await admin.reabrirComoAdmin({ exe: process.execPath, args: process.argv.slice(1), pasta: process.cwd() });
    if (aceitou) {
      log("main", "info", "reabrindo como administrador");
      app.quit();
    } else {
      app.requestSingleInstanceLock();
      log("main", "info", "permissão de administrador cancelada");
    }
    return { ...estadoSistema(), cancelado: !aceitou };
  });
  handle("travessura:pedir", () => {
    if (escondido || !config.bagunca) return null;
    const t = travessuras.sortear(listaTravessuras(), config.travessuras || {}, {
      semIntervalo: process.env.MASCOTE_DEBUG === "travessura",
      admin: admin.ehAdmin(),
    });
    if (t) log("main", "info", "travessura:", t.nome, "x" + t.vezes);
    return t;
  });
  on("travessura:executar", async (_e, token) => {
    if (escondido || !config.bagunca || typeof token !== "string") return;
    try {
      await travessuras.executar(token, {
        abrirLink: (url) => shell.openExternal(url),
        aoTocar: (i) => overlay?.webContents.send("travessura:tecla", i),
        // janela de administrador na frente: só aperta teclas se o app for admin e a pessoa deixou
        podeTeclar: () => {
          if (!admin.janelaDaFrenteEhAdmin()) return true;
          const ok = admin.ehAdmin() && config.travessuras?.["admin-janelas"] === true;
          if (!ok) log("main", "info", "travessura pulada: a janela da frente é de administrador");
          return ok;
        },
      });
    } catch (e) {
      log("main", "error", "travessura falhou:", e);
    }
    overlay?.webContents.send("travessura:fim");
  });
  on("pet:voltar", () => overlay?.webContents.send("pet:voltar"));
  // botão de brinquedos: o overlay mostra o menu (comida, bola) logo acima dele
  on("brinquedos:abrir", () => {
    if (!overlay || overlay.isDestroyed() || chatAberto) return;
    const b = boundsChat(false);
    const o = areaTotal();
    overlay.webContents.send("brinquedos:abrir", { x: b.x + 4 + 17 - o.x, y: b.y + BOTAO - 6 - 17 - o.y });
  });
  on("app:sair", () => app.quit());
  on("app:minimizar", () => esconderMascote(true));

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
  // ---------- qual IA conversa ----------
  handle("ia:estado", () => provedores.estado(config.ia, cofre()));
  handle("ia:salvar", (_e, pedido) => {
    try {
      mudarConfig({ ia: provedores.aplicar(config.ia, pedido, cofre()) });
      return { ok: true, estado: provedores.estado(config.ia, cofre()) };
    } catch (e) {
      return { ok: false, erro: e.message, estado: provedores.estado(config.ia, cofre()) };
    }
  });
  handle("ia:modelos", async (_e, id) => {
    try {
      return { ok: true, modelos: await provedores.listarModelos(config.ia, id, cofre()) };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  });
  // só abre os links fixos de "onde pegar a chave", nunca um endereço vindo da página
  on("ia:abrirLink", (_e, id) => {
    const link = provedores.PROVEDORES.find((p) => p.id === id)?.linkChave;
    if (link) shell.openExternal(link);
  });
  on("chat:parar", () => conversa.parar());
  on("chat:responderPermissao", (_e, { id, ok } = {}) => {
    pedidosPermissao.get(id)?.(ok === true);
    pedidosPermissao.delete(id);
  });
  // A página manda { texto, imagens: [{ dados: base64 }] } (ou só o texto, como antes).
  on("chat:enviar", (_e, pedido) => {
    const texto = typeof pedido === "string" ? pedido : typeof pedido?.texto === "string" ? pedido.texto : "";
    if (texto.length > 20000) return;
    let imagens;
    try {
      imagens = validarImagens(typeof pedido === "object" ? pedido.imagens : null);
    } catch (e) {
      chat.webContents.send("chat:erro", e.message);
      return chat.webContents.send("chat:fim");
    }
    if (!texto.trim() && !imagens.length) return chat.webContents.send("chat:fim");
    const pet = petAtual();
    const humor = (h) => overlay?.webContents.send("pet:humor", h);
    humor("pensando");
    conversa.enviar(
      { texto, imagens },
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
            // minimizado na bandeja: volta para a tela, senão o pedido fica invisível e o Claude espera para sempre
            if (escondido) esconderMascote(false);
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
  // chão: tela inteira ou só em cima da barra de tarefas
  if (parcial.chao === "tela" || parcial.chao === "barra") limpo.chao = parcial.chao;
  // telas: "todas" ou o id de um monitor conectado
  if (parcial.telas === "todas" || (typeof parcial.telas === "string" && listarTelas().some((t) => t.id === parcial.telas))) {
    limpo.telas = parcial.telas;
  }
  return limpo;
}

// ---------- início ----------
app.whenReady().then(async () => {
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
  // Mac: o mascote mora na barra de menus, sem ícone no Dock (como os outros pets de desktop)
  if (plataforma.MAC) app.dock?.hide();
  // Linux: janelas transparentes criadas logo de cara às vezes saem com fundo preto
  if (plataforma.LINUX) await new Promise((r) => setTimeout(r, 300));
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
