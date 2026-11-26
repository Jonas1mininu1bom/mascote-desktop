// Mascote Desktop: processo principal do Electron.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, dialog, globalShortcut, session, safeStorage, powerMonitor } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { lerPet, listarPets, copiarPetsPadrao, quadroParaBitmap } = require("./src/pets");
const provedores = require("./src/provedores");
const { criarCofre } = require("./src/provedores/chaves");
const bilhetesMod = require("./src/bilhetes");
const travessuras = require("./src/travessuras");
const admin = require("./src/admin");
const plataforma = require("./src/plataforma");
const { validarImagens } = require("./src/imagens");

// Duas versões do instalador: a completa (com o chat do Claude Code) e a "só o mascote", sem o chat
// e sem o SDK do Claude Code embutido (bem menor). O instalador da só-mascote grava edicao: "so-mascote"
// no package.json do app (veja electron-builder-so-mascote.js). Pelo código: npm run start:mascote.
const COM_CHAT = require("./package.json").edicao !== "so-mascote" && !process.argv.includes("--so-mascote");

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
// traz o mascote de volta (se estava escondido) e abre o chat (na só-mascote, os ajustes).
app.on("second-instance", () => {
  if (!chat || chat.isDestroyed()) return;
  mostrarTudo();
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
const PADRAO = { pet: "palito", passear: false, bagunca: false, pasta: os.homedir(), travessuras: {}, telas: "todas", chao: "tela", frequencia: 3, barraLado: "cima" };
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
let chat = null;
let barra = null; // pop-up de atalhos, ajustes e ações do pet
let tray = null;
let chatAberto = false;
let escondido = false; // "esconder": pet, chat e bilhetes somem e o pet não apronta nada (a bandeja traz de volta)
let avisouBandeja = false;
const bilhetes = new Map();
const LIMITE_BILHETES = 50; // passou disso, o mais antigo sai (eles ficam na tela até a pessoa fechar)
let proxIdBilhete = 1;
const PAINEL = { w: 360, h: 520 };
const TAM_BILHETE = { width: 240, height: 150 };
// Telas pequenas (ex.: notebook 1366x768 com escala de 125%): o painel encolhe para caber.
const painelEm = (wa) => ({ w: Math.min(PAINEL.w, wa.width), h: Math.max(240, Math.min(PAINEL.h, wa.height)) });

// Monitores que o overlay cobre: todos, menos no Mac com "Monitores têm Spaces separados" (o padrão),
// em que uma janela só aparece num monitor. Aí é o monitor do chat.
function telasDoOverlay() {
  const todas = screen.getAllDisplays();
  if (todas.length > 1 && plataforma.macMonitoresSeparados()) return [screen.getPrimaryDisplay()];
  return todas;
}

// As coordenadas do pet são relativas a este retângulo (todos os monitores juntos).
// A JANELA do overlay, porém, cobre um monitor só (o monitor em que o pet está; veja telaDaJanela):
// no Windows, uma janela que atravessa monitores com escalas diferentes (100% num, 125% no outro)
// fica com as coordenadas desencontradas. O clique não acerta o pet, ele aparece fora do lugar e
// a janela pode até ficar "piscando" de tamanho sem parar.
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

// Monitor em que a janela do overlay está agora (muda quando o pet anda para outro monitor).
let idTelaJanela = null;
function telaDaJanela() {
  const ds = telasDoOverlay();
  return ds.find((d) => d.id === idTelaJanela) || ds.find((d) => d.id === telaDaCasa().id) || ds[0];
}
const mesmoRet = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
// Põe a janela do overlay no monitor certo. No Windows, mudar de um monitor para outro com escala
// diferente às vezes deixa a janela com o tamanho errado na primeira tentativa: confere e reaplica.
function aplicarJanelaOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  const alvo = telaDaJanela().bounds;
  if (!mesmoRet(overlay.getBounds(), alvo)) overlay.setBounds(alvo);
  setTimeout(() => {
    if (!overlay || overlay.isDestroyed()) return;
    const b = telaDaJanela().bounds;
    if (!mesmoRet(overlay.getBounds(), b)) overlay.setBounds(b);
  }, 120);
}
// O overlay avisa onde o pet está; se ele foi para outro monitor, a janela vai junto.
// Só para monitores em que ele pode ficar: com só uma tela escolhida em ⚙️, o centro do pet às vezes
// passa uns pixels da borda; ir junto mandava a tela de novo, o overlay via o pet "fora das telas" e
// chamava ele de volta para o chat.
function petEm(x, y) {
  const o = areaTotal();
  const d = screen.getDisplayNearestPoint({ x: Math.round(o.x + x), y: Math.round(o.y + y) });
  if (!telasPermitidas().some((t) => t.id === d.id) || d.id === telaDaJanela().id) return;
  idTelaJanela = d.id;
  aplicarJanelaOverlay();
  overlay?.webContents.send("tela", infoTela());
}

const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

// Monitor em que o painel abre: o do mouse na hora de abrir (normalmente o do pop-up do topo).
let idTelaPainel = null;
const telaDoPainel = () => screen.getAllDisplays().find((d) => d.id === idTelaPainel) || screen.getPrimaryDisplay();

// O painel abre no alto, no meio do monitor (logo abaixo de onde o pop-up desce). Se a pessoa
// arrastou o painel pelo topo, abre onde ela deixou (config.painelPos, canto de cima à esquerda).
function boundsChat() {
  const p = config.painelPos;
  const salvo = p && num(p.x) && num(p.y);
  // se o monitor sumiu, cai no mais próximo
  const wa = salvo ? screen.getDisplayNearestPoint({ x: p.x + PAINEL.w / 2, y: p.y + 20 }).workArea : telaDoPainel().workArea;
  const pn = painelEm(wa);
  const x = salvo ? p.x : wa.x + (wa.width - pn.w) / 2;
  const y = salvo ? p.y : wa.y + 8;
  return {
    x: Math.round(limitar(x, wa.x, wa.x + wa.width - pn.w)),
    y: Math.round(limitar(y, wa.y, wa.y + wa.height - pn.h)),
    width: pn.w,
    height: pn.h,
  };
}

// Casa do pet: canto de baixo, à direita, do monitor principal (ou do primeiro em que ele pode ficar).
function telaDaCasa() {
  const permitidas = telasPermitidas();
  return permitidas.find((d) => d.id === screen.getPrimaryDisplay().id) || permitidas[0];
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
  const wa = telaDaCasa().workArea;
  const casa = { x: wa.x + wa.width - 60 - o.x, y: wa.y + wa.height - 2 - o.y };
  return {
    origem: { x: o.x, y: o.y }, // canto do overlay na área de trabalho (muda quando um monitor muda)
    largura: o.width,
    altura: o.height,
    area: rel(wa), // tela da casa
    janela: rel(telaDaJanela().bounds), // pedaço que a janela do overlay mostra (um monitor)
    areas: permitidas.map((d) => ({ ...rel(d.workArea), id: d.id })), // onde ele pode andar
    monitores: permitidas.map((d) => rel(d.bounds)), // a tela inteira de cada um (com a barra de tarefas)
    alturaBilhete: TAM_BILHETE.height,
    casa,
    painel: chatAberto ? rel(boundsChat()) : null,
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
    ...telaDaJanela().bounds,
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
  segurarTopo(overlay);
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  // no Windows, uma janela criada num monitor com escala diferente da do principal pode nascer com
  // o tamanho errado: reaplica depois de criada
  aplicarJanelaOverlay();
  overlay.once("ready-to-show", aplicarJanelaOverlay);
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
    ...boundsChat(),
    show: false, // só aparece aberto (pelo pop-up do topo ou pela bandeja)
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
  segurarTopo(chat);
  chat.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  chat.loadFile(path.join(__dirname, "src/chat.html"));
  vigiar("chat", chat);
  // se a página do chat cair, carrega de novo (senão o painel abre vazio).
  // Pedidos de permissão pendentes são negados: quem ia responder era a página que caiu.
  chat.webContents.on("render-process-gone", () => {
    for (const responder of pedidosPermissao.values()) responder(false);
    pedidosPermissao.clear();
    setTimeout(() => {
      if (!chat || chat.isDestroyed()) return;
      if (chatAberto) abrirChat(false);
      chat.webContents.reload();
      log("chat", "warning", "chat recarregado depois de cair");
    }, 1000);
  });
}

// ---------- pop-up de atalhos ----------
// Encostar o mouse numa borda da tela (no meio dela) e deixar lá um instante faz aparecer um pop-up
// com os atalhos (conversar, brinquedos, chamar, ajustes, esconder, fechar). Some quando o mouse sai.
// A borda é escolhida em Ajustes (cima, baixo, esquerda ou direita) e vale para cada monitor.
// Só no meio da borda e com uma pequena espera: nos cantos de cima ficam as abas e o X das janelas.
const LADOS_BARRA = ["cima", "baixo", "esquerda", "direita"];
const BARRA = { botao: 66, alto: 80, botaoEmPe: 56, larguraEmPe: 92 };
const MENU_PET = { width: 222, height: 78, folga: 8 };
const TAM_AJUSTES = { width: 412, height: 434 };
// entre: a borda escolhida encosta em outro monitor (o mouse passa direto para ele), então vale
// parar rente à divisa, numa faixa um pouco mais larga e por um pouco mais de tempo
const TOPO = { espera: 250, esperaEmbaixo: 400, esperaEntre: 550, faixa: 0.2, faixaEntre: 4, saida: 450, folga: 28 };
const botoesDaBarra = () => 4 + (COM_CHAT ? 1 : 0) + (tray ? 1 : 0);
const ladoBarra = () => (LADOS_BARRA.includes(config.barraLado) ? config.barraLado : "cima");
const barraEmPe = () => ladoBarra() === "esquerda" || ladoBarra() === "direita";
// tamanho da janela: deitada (cima/baixo) ou em pé, com os botões empilhados (esquerda/direita)
const tamanhoBarra = () =>
  barraEmPe()
    ? { width: BARRA.larguraEmPe, height: botoesDaBarra() * BARRA.botaoEmPe + 26 }
    : { width: botoesDaBarra() * BARRA.botao + 26, height: BARRA.alto };
const estadoBarra = (visivel) => ({
  visivel, comChat: COM_CHAT, podeEsconder: Boolean(tray), lado: ladoBarra(),
  noPet: barraOrigem === "pet",
  ajustes: barraOrigem === "ajustes",
  voltar: voltarDosAjustes,
  config: barraOrigem === "ajustes" ? config : undefined,
  comida: petAtual().desenho === "hornet" ? "desafiar" : "comida", // a Hornet não come: enfrenta um inimigo
});
let barraOrigem = null;
let topoDesde = 0;
let saiuDesde = 0;
let ocultarBarra = null;
let telaAjustesId = null;
let voltarDosAjustes = false;
let esperarNoMenuAte = 0;

function criarBarra() {
  barra = new BrowserWindow({
    icon: ICONE_APP,
    ...tamanhoBarra(),
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: prefsSeguras(),
  });
  barra.setAlwaysOnTop(true, "screen-saver");
  segurarTopo(barra);
  barra.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  barra.on("blur", () => { if (barraOrigem === "pet") esconderBarra(); });
  barra.webContents.on("did-finish-load", () => {
    if (barraOrigem) barra.webContents.send("barra:estado", estadoBarra(true));
  });
  barra.loadFile(path.join(__dirname, "src/barra.html"));
  vigiar("barra", barra);
  barra.webContents.on("render-process-gone", () => setTimeout(() => barra && !barra.isDestroyed() && barra.webContents.reload(), 1000));
}

// Encostado na borda escolhida da área útil do monitor (no Mac, abaixo da barra de menus; embaixo,
// acima da barra de tarefas), no meio dela.
function boundsNaBorda(d, tamanho) {
  const a = d.workArea, b = d.bounds;
  const width = Math.min(tamanho.width, a.width), height = Math.min(tamanho.height, a.height);
  const meioX = Math.round(limitar(b.x + (b.width - width) / 2, a.x, a.x + a.width - width));
  const meioY = Math.round(limitar(b.y + (b.height - height) / 2, a.y, a.y + a.height - height));
  const pos = {
    cima: { x: meioX, y: a.y },
    baixo: { x: meioX, y: a.y + a.height - height },
    esquerda: { x: a.x, y: meioY },
    direita: { x: a.x + a.width - width, y: meioY },
  }[ladoBarra()];
  return { ...pos, width, height };
}

function mostrarBarra(d) {
  apresentarBarra("borda", boundsNaBorda(d, tamanhoBarra()));
}

function mostrarAjustes(d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), voltar = false) {
  telaAjustesId = d.id;
  voltarDosAjustes = voltar;
  apresentarBarra("ajustes", boundsNaBorda(d, TAM_AJUSTES));
}

function telaDosAjustes() {
  return screen.getAllDisplays().find((d) => d.id === telaAjustesId) || screen.getPrimaryDisplay();
}

function reposicionarAjustes() {
  barra.setBounds(boundsNaBorda(telaDosAjustes(), TAM_AJUSTES));
  barra.webContents.send("barra:estado", estadoBarra(true));
}

function mostrarBarraNoPet(p) {
  if (escondido || arrasto || !num(p?.x) || !num(p?.y)) return;
  const o = areaTotal();
  const x = Math.round(o.x + p.x), y = Math.round(o.y + p.y);
  const a = screen.getDisplayNearestPoint({ x, y }).workArea;
  const width = Math.min(MENU_PET.width, a.width), height = Math.min(MENU_PET.height, a.height);
  const f = MENU_PET.folga;
  const esquerda = x + f + width <= a.x + a.width ? x + f : x - f - width;
  const cima = y + f + height <= a.y + a.height ? y + f : y - f - height;
  apresentarBarra("pet", {
    x: limitar(esquerda, a.x, a.x + a.width - width),
    y: limitar(cima, a.y, a.y + a.height - height),
    width, height,
  });
}

function apresentarBarra(origem, bounds) {
  if (!barra || barra.isDestroyed()) return;
  clearTimeout(ocultarBarra);
  barraOrigem = origem;
  saiuDesde = 0;
  esperarNoMenuAte = 0;
  barra.setBounds(bounds);
  if (origem === "borda") barra.showInactive(); // passar o mouse mantém o foco no aplicativo atual
  else {
    barra.show();
    if (plataforma.MAC) app.focus({ steal: true });
    barra.focus();
  }
  barra.moveTop();
  barra.webContents.send("barra:estado", estadoBarra(true));
}

function esconderBarra() {
  topoDesde = 0;
  if (!barraOrigem) return;
  const estado = estadoBarra(false);
  barraOrigem = null;
  voltarDosAjustes = false;
  if (!barra || barra.isDestroyed()) return;
  barra.webContents.send("barra:estado", estado);
  ocultarBarra = setTimeout(() => barra && !barra.isDestroyed() && barra.hide(), 180);
}

// Chamado junto com a posição do mouse (~60 vezes por segundo).
function vigiarTopoDaTela(p) {
  if (escondido || arrasto) return esconderBarra();
  if (barraOrigem === "ajustes") return; // permite editar e abrir os diálogos do sistema
  if (chatAberto && barraOrigem !== "pet") return esconderBarra();
  if (Date.now() < esperarNoMenuAte) return;
  if (!barraOrigem) {
    const d = screen.getDisplayNearestPoint(p);
    const borda = naBordaDaBarra(p, d);
    if (!borda) return void (topoDesde = 0);
    if (!topoDesde) topoDesde = Date.now();
    else if (Date.now() - topoDesde >= borda.espera) mostrarBarra(d);
    return;
  }
  const r = barra.getBounds();
  const f = TOPO.folga;
  const perto = p.x >= r.x - f && p.x <= r.x + r.width + f && p.y >= r.y - f && p.y <= r.y + r.height + f;
  if (perto) saiuDesde = 0;
  else if (!saiuDesde) saiuDesde = Date.now();
  else if (Date.now() - saiuDesde >= TOPO.saida) esconderBarra();
}

// O mouse está encostado na borda escolhida deste monitor, no meio dela? Devolve a espera que vale
// (ou null). Se a borda encosta em outro monitor, aceita uma faixa rente à divisa e espera mais.
function naBordaDaBarra(p, d) {
  const b = d.bounds, lado = ladoBarra();
  const deitada = lado === "cima" || lado === "baixo";
  const noMeio = deitada
    ? Math.abs(p.x - (b.x + b.width / 2)) <= b.width * TOPO.faixa
    : Math.abs(p.y - (b.y + b.height / 2)) <= b.height * TOPO.faixa;
  if (!noMeio) return null;
  // ponto logo além da borda: se cair em outro monitor, a borda é uma divisa entre telas
  const alem = { cima: { x: p.x, y: b.y - 2 }, baixo: { x: p.x, y: b.y + b.height + 1 }, esquerda: { x: b.x - 2, y: p.y }, direita: { x: b.x + b.width + 1, y: p.y } }[lado];
  const entre = screen.getAllDisplays().some((o) => o.id !== d.id && alem.x >= o.bounds.x && alem.x < o.bounds.x + o.bounds.width && alem.y >= o.bounds.y && alem.y < o.bounds.y + o.bounds.height);
  const faixa = entre ? TOPO.faixaEntre : 1;
  const dist = { cima: p.y - b.y, baixo: b.y + b.height - 1 - p.y, esquerda: p.x - b.x, direita: b.x + b.width - 1 - p.x }[lado];
  if (dist > faixa) return null;
  return { espera: entre ? TOPO.esperaEntre : lado === "baixo" ? TOPO.esperaEmbaixo : TOPO.espera };
}

function acaoDaBarra(acao) {
  if (!barraOrigem) return;
  if (barraOrigem === "ajustes") {
    if (acao === "atalhos" && voltarDosAjustes) {
      mostrarBarra(telaDosAjustes());
      voltarDosAjustes = false;
      esperarNoMenuAte = Date.now() + 1800;
    } else if (acao === "dispensar") esconderBarra();
    return;
  }
  if (barraOrigem === "borda" && acao === "ajustes") {
    return mostrarAjustes(screen.getDisplayMatching(barra.getBounds()), true);
  }
  const noPet = barraOrigem === "pet";
  esconderBarra();
  if (acao === "comida" || acao === "bola" || (noPet && acao === "carinho")) {
    return overlay?.webContents.send("pet:interagir", acao);
  }
  if (noPet) return;
  if (acao === "chat" && COM_CHAT) abrirChat(true);
  else if (acao === "voltar") overlay?.webContents.send("pet:voltar");
  else if (acao === "esconder" && tray) esconderMascote(true); // sem ícone na bandeja, não teria como voltar
  else if (acao === "sair") app.quit();
}

// Traz de volta o que estiver escondido.
function mostrarTudo() {
  if (escondido) esconderMascote(false);
}

function avisarBandeja(texto) {
  if (avisouBandeja || !tray || process.platform !== "win32") return;
  avisouBandeja = true;
  try {
    tray.displayBalloon({ title: "Mascote Desktop", content: texto, noSound: true });
  } catch {}
}

// Esconder (pop-up do topo ou bandeja): pet, chat e bilhetes somem e fica só o ícone. Clicar nele traz de volta.
function esconderMascote(esconder) {
  escondido = esconder;
  if (esconder) esconderBarra();
  const janelas = [overlay, ...janelasBilhetes()].filter((w) => w && !w.isDestroyed());
  for (const w of janelas) {
    if (esconder) w.hide();
    else w.showInactive();
  }
  if (chat && !chat.isDestroyed()) {
    if (esconder) chat.hide();
    else if (chatAberto) chat.show();
  }
  if (!esconder) overlay?.setIgnoreMouseEvents(true, { forward: true });
  montarBandeja();
  if (esconder) avisarBandeja("Estou aqui na bandeja, perto do relógio. Clique no ícone para me trazer de volta.");
  log("main", "info", esconder ? "mascote escondido na bandeja" : "mascote de volta na tela");
}

function abrirChat(aberto) {
  if (!COM_CHAT) {
    if (aberto) mostrarAjustes();
    return;
  }
  if (!chat || chat.isDestroyed()) return;
  chatAberto = aberto;
  if (aberto) {
    // abre no monitor em que o mouse está (o do pop-up), se a pessoa não arrastou o painel antes
    idTelaPainel = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    esconderBarra();
    posicionarChat();
    chat.show();
    if (plataforma.MAC) app.focus({ steal: true }); // sem ícone no Dock, o Mac não passa o teclado sozinho
    chat.focus();
  } else {
    chat.hide();
    overlay?.webContents.send("tela", infoTela());
  }
  chat.webContents.send("chat:estado", { aberto });
}

function posicionarChat() {
  if (chatAberto && chat && !chat.isDestroyed()) {
    const alvo = boundsChat();
    chat.setBounds(alvo);
    // Windows com monitores de escalas diferentes: a primeira tentativa pode sair do tamanho errado
    setTimeout(() => {
      if (chat && !chat.isDestroyed() && !arrasto && !mesmoRet(chat.getBounds(), alvo)) chat.setBounds(alvo);
    }, 100);
  }
  aplicarJanelaOverlay();
  // o pet não fica escondido atrás do painel
  overlay?.webContents.send("tela", infoTela());
}

// Arrastar o painel pelo topo: a página avisa início/fim; o processo principal segue o mouse.
let arrasto = null;
function arrastarChat(ativo) {
  if (ativo && !arrasto) {
    const c = screen.getCursorScreenPoint();
    const { x, y, width, height } = chat.getBounds();
    // o tamanho fica guardado: no Windows, setPosition entre monitores com escalas diferentes
    // muda o tamanho da janela a cada chamada (o painel ia crescendo ou encolhendo no caminho)
    arrasto = { dx: c.x - x, dy: c.y - y, inicio: c, moveu: false, width, height };
    arrasto.timer = setInterval(() => {
      const p = screen.getCursorScreenPoint();
      if (!arrasto.moveu && Math.hypot(p.x - arrasto.inicio.x, p.y - arrasto.inicio.y) < 5) return;
      arrasto.moveu = true;
      chat.setBounds({ x: p.x - arrasto.dx, y: p.y - arrasto.dy, width: arrasto.width, height: arrasto.height });
    }, 16);
  } else if (!ativo && arrasto) {
    clearInterval(arrasto.timer);
    const { moveu } = arrasto;
    arrasto = null;
    if (!moveu) return false;
    const [x, y] = chat.getPosition();
    config.painelPos = { x, y };
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
    vigiarTopoDaTela(p);
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
  // Menu simples: o resto (pastas, telas, travessuras...) fica em Ajustes.
  const menu = Menu.buildFromTemplate([
    { label: petAtual().nome, enabled: false },
    COM_CHAT ? { label: "Conversar", click: () => (mostrarTudo(), abrirChat(true)) } : null,
    { label: "Ajustes", click: () => (mostrarTudo(), mostrarAjustes()) },
    { label: "Chamar o pet de volta", click: () => (mostrarTudo(), overlay.webContents.send("pet:voltar")) },
    escondido
      ? { label: "Mostrar o mascote", click: () => esconderMascote(false) }
      : { label: plataforma.MAC ? "Esconder na barra de menus" : "Esconder na bandeja", click: () => esconderMascote(true) },
    { type: "separator" },
    {
      label: "Escolher pet",
      submenu: pets.map((p) => ({ label: p.nome, type: "radio", checked: p.id === petAtual().id, click: () => escolherPet(p.id) })),
    },
    { label: "Passear pela tela", type: "checkbox", checked: config.passear, click: (i) => mudarConfig({ passear: i.checked }) },
    { label: "Modo bagunça", type: "checkbox", checked: config.bagunca, click: (i) => mudarConfig({ bagunca: i.checked }) },
    {
      label: "Menu de atalhos aparece em",
      submenu: [["cima", "Cima"], ["baixo", "Baixo"], ["esquerda", "Esquerda"], ["direita", "Direita"]].map(([id, nome]) => ({
        label: nome, type: "radio", checked: ladoBarra() === id, click: () => mudarConfig({ barraLado: id }),
      })),
    },
    { type: "separator" },
    { label: "Sair", click: () => app.quit() },
  ].filter(Boolean));
  try {
    if (!tray) {
      tray = new Tray(iconeBandeja());
      // clique no ícone: traz o mascote de volta se estava escondido; senão abre o chat (ou os ajustes).
      // No Windows e no Linux; no macOS o clique abre o menu.
      tray.on("click", () => (escondido ? esconderMascote(false) : abrirChat(true)));
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
  if (barraOrigem === "ajustes") {
    barra.webContents.send("config", config);
    if ("barraLado" in parcial) reposicionarAjustes();
  } else if ("barraLado" in parcial) esconderBarra();
  montarBandeja();
}

function escolherPet(id) {
  const trocou = id !== config.pet;
  if (barraOrigem === "pet") esconderBarra();
  recarregarPets();
  if (trocou) conversa.novaConversa(); // cada personagem começa a própria conversa
  mudarConfig({ pet: id });
  enviarParaTodos("pet:trocar", petAtual());
}

// ---------- bilhetes ----------
const janelasBilhetes = () => Array.from(bilhetes.values(), (b) => b.janela);

function boundsBilhete(b, tela) {
  const a = tela.workArea;
  const width = Math.min(TAM_BILHETE.width, a.width);
  const height = Math.min(TAM_BILHETE.height, a.height);
  const direita = a.x + a.width;
  // Durante a entrada, o papel pode passar pela borda de onde veio se não houver barra desse lado.
  const minX = b.lado < 0 && a.x === tela.bounds.x ? a.x - width : a.x;
  const maxX = b.lado > 0 && direita === tela.bounds.x + tela.bounds.width ? direita : direita - width;
  return {
    x: limitar(Math.round(b.alvo.x), minX, maxX),
    y: limitar(Math.round(b.alvo.y), a.y, a.y + a.height - height),
    width,
    height,
  };
}

function posicionarBilhete(b) {
  let tela = telasDoOverlay().find((d) => d.id === b.telaId);
  if (!tela) {
    tela = telaDaCasa();
    b.telaId = tela.id;
    b.lado = 0;
  }
  // setBounds mantém o tamanho mesmo ao trocar de monitor com outra escala no Windows.
  b.janela.setBounds(boundsBilhete(b, tela));
}

function criarBilhete({ y, lado }, tela) {
  const conteudo = bilhetesMod.sortear({
    arqPadrao: path.join(__dirname, "bilhetes", "padrao.json"),
    pastaUsuario: pastaBilhetesUsuario(),
    pet: petAtual(),
  });
  const id = proxIdBilhete++;
  const a = tela.workArea;
  const x = lado < 0 ? a.x - TAM_BILHETE.width : a.x + a.width;
  const b = { telaId: tela.id, lado, alvo: { x, y: areaTotal().y + y } };
  const bounds = boundsBilhete(b, tela);
  const w = new BrowserWindow({
    icon: ICONE_APP,
    ...bounds,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: prefsSeguras(),
  });
  b.janela = w;
  w.setAlwaysOnTop(true, "floating");
  w.loadFile(path.join(__dirname, "src/bilhete.html"), { query: { dados: JSON.stringify(conteudo) } });
  w.once("ready-to-show", () => {
    if (!escondido) w.showInactive();
    // O arrasto pode ter avançado enquanto a página carregava.
    posicionarBilhete(b);
    // No Windows, o "sempre no topo" se perde quando a janela nasce escondida: reaplica ao mostrar,
    // senão o bilhete fica atrás das janelas maximizadas. O pet, o chat e o menu ficam acima dele.
    w.setAlwaysOnTop(true, "screen-saver");
    segurarTopo(w); // só depois de ligar o topo, senão o "floating" → "screen-saver" contaria como perda
    for (const j of [overlay, chat, barra]) if (j && !j.isDestroyed() && j.isVisible()) j.moveTop();
  });
  w.on("closed", () => {
    bilhetes.delete(id);
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send("bilhete:fechado", id); // no fechamento do app o overlay já foi
  });
  bilhetes.set(id, b);
  return { id, largura: bounds.width, altura: bounds.height };
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
  handle("inicio", () => {
    const pet = petAtual();
    const petReserva = pet.tipo === "imagens" ? lerPet(path.join(__dirname, "pets", "palito")) : null;
    return { pet, petReserva, config, tela: infoTela(), comChat: COM_CHAT, mouseNativo: require("./src/cursor").disponivel(), debug: process.env.MASCOTE_DEBUG || null };
  });
  on("pet:onde", (_e, { x, y } = {}) => num(x) && num(y) && petEm(x, y));
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
    if (escondido || !config.bagunca || !num(dados?.y) || ![-1, 1].includes(dados.lado)) return null;
    const tela = telasPermitidas().find((d) => d.id === dados.telaId);
    if (!tela) return null;
    if (bilhetes.size >= LIMITE_BILHETES) {
      const [idAntigo, { janela: antiga }] = bilhetes.entries().next().value;
      bilhetes.delete(idAntigo);
      if (!antiga.isDestroyed()) antiga.close();
      log("main", "info", `bilhete: já tinha ${LIMITE_BILHETES}, fechei o mais antigo`);
    }
    log("main", "info", `bilhete: trazendo um novo (${bilhetes.size + 1} na tela)`);
    return criarBilhete(dados, tela);
  });
  on("bilhete:mover", (_e, { id, x, y, solto } = {}) => {
    const b = bilhetes.get(id);
    if (!b || b.janela.isDestroyed()) return;
    if (num(x) && num(y)) {
      const o = areaTotal();
      b.alvo = { x: o.x + x, y: o.y + y };
    } else if (solto !== true) return;
    if (solto === true) b.lado = 0;
    posicionarBilhete(b);
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
      intervalo: (config.frequencia || 3) * 60 * 1000,
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
  on("barra:acao", (e, acao) => e.sender === barra?.webContents && typeof acao === "string" && acaoDaBarra(acao));
  on("barra:ajustes", (e) => {
    if (e.sender === chat?.webContents && chatAberto) mostrarAjustes(screen.getDisplayMatching(chat.getBounds()));
  });
  on("barra:abrirPet", (e, p) => e.sender === overlay?.webContents && mostrarBarraNoPet(p));
  on("barra:fecharPet", (e) => {
    if (e.sender === overlay?.webContents && barraOrigem === "pet") esconderBarra();
  });
  on("app:sair", () => app.quit());

  on("chat:abrir", (_e, aberto) => abrirChat(aberto === true));
  handle("chat:arrastar", (_e, ativo) => arrastarChat(ativo === true));
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
      const antes = config.ia?.provedor || "claude";
      mudarConfig({ ia: provedores.aplicar(config.ia, pedido, cofre()) });
      const estado = provedores.estado(config.ia, cofre());
      if (COM_CHAT && estado.atual !== antes) {
        chat?.webContents.send("chat:iaMudou", estado.provedores.find((p) => p.id === estado.atual).nome);
      }
      return { ok: true, estado };
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
    if (!COM_CHAT) return; // a só-mascote não tem chat
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
            // escondido ou fechado: volta para a tela, senão o pedido fica invisível e o Claude espera para sempre
            mostrarTudo();
            if (!chatAberto || barraOrigem === "ajustes") abrirChat(true);
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
const FREQUENCIAS = [1, 3, 5, 10];
const CONFIG_DA_PAGINA = ["passear", "bagunca"]; // allowlist: chave nova fica bloqueada por padrão
function filtrarConfigDaPagina(parcial) {
  if (!parcial || typeof parcial !== "object" || Array.isArray(parcial)) return {};
  const limpo = {};
  for (const chave of CONFIG_DA_PAGINA) {
    if (typeof parcial[chave] === "boolean") limpo[chave] = parcial[chave];
  }
  // chão: tela inteira ou só em cima da barra de tarefas
  if (parcial.chao === "tela" || parcial.chao === "barra") limpo.chao = parcial.chao;
  // borda da tela em que aparece o menu de atalhos
  if (LADOS_BARRA.includes(parcial.barraLado)) limpo.barraLado = parcial.barraLado;
  // minutos entre uma bagunça e outra
  if (FREQUENCIAS.includes(parcial.frequencia)) limpo.frequencia = parcial.frequencia;
  // telas: "todas" ou o id de um monitor conectado
  if (parcial.telas === "todas" || (typeof parcial.telas === "string" && listarTelas().some((t) => t.id === parcial.telas))) {
    limpo.telas = parcial.telas;
  }
  return limpo;
}

// Para o log: posição, tamanho, área útil e escala de cada monitor (ajuda a achar bugs de escala).
const resumoTelas = () =>
  screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, escala: d.scaleFactor, principal: d.id === screen.getPrimaryDisplay().id }));

// ---------- sempre no topo ----------
// Quando o app abre junto com o Windows, ele nasce antes da área de trabalho ficar pronta: a barra
// de tarefas e os outros programas da inicialização aparecem depois e o Windows tira o "sempre no
// topo" do pet e do chat (abrindo pela mão isso não acontece). Por isso reaplicamos o topo algumas
// vezes logo depois de abrir, depois de tempos em tempos, e quando o PC volta da suspensão, é
// desbloqueado ou os monitores mudam. Desligar e ligar de novo força o Windows a refazer a ordem;
// moveTop não rouba o foco de quem está digitando.
let ultimoReforco = 0;
// leve = só traz para a frente as janelas que ainda estão no topo (sem desliga-liga, não pisca);
// quem perdeu o topo leva o desliga-liga mesmo no modo leve
function reforcarTopo(motivo, { leve = false } = {}) {
  if (escondido) return;
  ultimoReforco = Date.now();
  const vivas = (lista) => lista.filter((w) => w && !w.isDestroyed() && w.isVisible());
  // O pet e o chat ficam acima dos bilhetes, e o menu visível fica acima de todos.
  for (const w of [...vivas(janelasBilhetes()), ...vivas([overlay, chat, barra])]) {
    if (!leve || !w.isAlwaysOnTop()) {
      w.setAlwaysOnTop(false);
      w.setAlwaysOnTop(true, "screen-saver");
    }
    w.moveTop();
  }
  if (motivo) log("main", "info", "topo reaplicado:", motivo);
}

function vigiarTopo() {
  // só no Windows: no Mac e no Linux o topo não se perde assim, e o desliga-liga pode piscar
  if (!plataforma.WIN) return;
  // logo depois de abrir (a área de trabalho pode levar até um minuto para terminar de carregar)
  for (const s of [1, 3, 6, 10, 20, 40, 60, 90]) setTimeout(() => reforcarTopo(`início +${s}s`), s * 1000);
  // de tempos em tempos, para pegar programas que se colocam no topo depois
  setInterval(() => reforcarTopo(null, { leve: true }), 15000);
  for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.on(ev, () => setTimeout(() => reforcarTopo(ev), 1000));
  for (const ev of ["resume", "unlock-screen", "user-did-become-active"]) {
    try {
      powerMonitor.on(ev, () => setTimeout(() => reforcarTopo(ev), 1500));
    } catch {}
  }
}

// se o sistema tirar o topo da janela, devolve (ignorando o desliga-liga do próprio reforcarTopo)
// Só no Windows, como o vigiarTopo. Várias janelas perdendo o topo juntas geram um reforço só.
let reforcoPendente = null;
function segurarTopo(w) {
  if (!plataforma.WIN) return;
  w.on("always-on-top-changed", (_e, noTopo) => {
    if (noTopo || escondido || reforcoPendente || Date.now() - ultimoReforco < 2000) return;
    reforcoPendente = setTimeout(() => {
      reforcoPendente = null;
      reforcarTopo("topo perdido");
    }, 500);
  });
}

// ---------- início ----------
app.whenReady().then(async () => {
  log("main", "info", `iniciando v${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform}), telas:`, resumoTelas());
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
  // teste do "chamar de volta": o overlay põe o pet longe e aqui chamamos pelo mesmo canal do pop-up
  if (process.env.MASCOTE_DEBUG === "voltar") setTimeout(() => overlay?.webContents.send("pet:voltar"), 4000);
  criarOverlay();
  criarChat();
  criarBarra();
  montarBandeja();
  iniciarCursor();
  globalShortcut.register("CommandOrControl+Alt+Shift+Q", () => app.quit());
  const telasMudaram = () => {
    log("main", "info", "telas mudaram:", resumoTelas());
    if (barraOrigem === "ajustes") reposicionarAjustes();
    else esconderBarra();
    for (const b of bilhetes.values()) {
      if (b.janela.isDestroyed()) continue;
      if (!b.lado) {
        // O usuário pode ter movido o bilhete depois que o pet o soltou.
        b.alvo = b.janela.getBounds();
        b.telaId = screen.getDisplayMatching(b.alvo).id;
      }
      posicionarBilhete(b);
    }
    aplicarJanelaOverlay();
    if (chat) posicionarChat();
    else overlay?.webContents.send("tela", infoTela());
  };
  for (const ev of ["display-metrics-changed", "display-added", "display-removed"]) screen.on(ev, telasMudaram);
  vigiarTopo();
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
