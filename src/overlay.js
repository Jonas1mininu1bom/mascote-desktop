// O "cérebro" do pet: estados, movimento e desenho.
const cv = document.getElementById("tela");
const ctx = cv.getContext("2d");

let pet, petReserva, config, tela, mouseNativo, debug;
let sprites = {}; // nome da animação -> [{normal, espelhado}]
let tamGrade = { w: 16, h: 24 }; // tamanho do sprite em "pixels do pet"

const P = {
  x: 0, y: 0, // ponto dos pés (centro embaixo)
  olhando: -1, // 1 = direita, -1 = esquerda
  estado: "parado", tempo: 2, alvo: null, anim: "parado", tAnim: 0,
  ancora: null, // onde ele fica quando não pode passear
  fala: null, // { texto, ate }
  humor: null,
  bilhete: null, // { id, largura, altura }
};
let cursor = { x: -999, y: -999 };
let segurado = null; // usuário arrastando o pet: { dx, dy, inicio }
let ignorando = true;
let coracoes = [];
let relogio = 0;

const rand = (a, b) => a + Math.random() * (b - a);
const escolha = (lista) => lista[Math.floor(Math.random() * lista.length)];
const larguraPx = () => tamGrade.w * pet.escala;
const alturaPx = () => tamGrade.h * pet.escala;
const velocidade = () => pet.velocidade * 60; // pixels por segundo
const VEL_PERSEGUIR = 900; // px/s correndo atrás do mouse
const RAIO_PEGAR = 26; // distância da mão até o mouse para "pegar"
// Pegar o mouse: morde o cursor, guarda a distância boca→mouse e corre levando o mouse junto.
// O pet manda: mesmo que a pessoa mexa o mouse, ele segura até o tempo da pegada acabar.
const VEL_ARRASTAR = 560; // px/s em disparada com o mouse
const CHANCE_PEGAR = 0.1; // chance, a cada decisão no modo bagunça, de ir atrás do mouse
const VEL_VOLTAR = 450; // px/s voltando para casa
let ficarAte = 0; // depois de "chamar de volta", fica em casa até este tempo (relógio)

// ficar: true só no botão "Chamar de volta" (fica quietinho em casa um tempo, mesmo com passeio ligado).
// Quando a casa só muda de lugar (chat aberto, fechado ou arrastado), ele vai junto e continua passeando.
function chamarDeVolta(segundos, { ficar = true } = {}) {
  if (ficar) ficarAte = relogio + 45;
  mudar("voltar", segundos, { alvo: { x: tela.casa.x, y: noChao() ? limitarY(tela.casa.y, tela.casa.x) : tela.casa.y } });
}
const seguirMouseLigado = () => config.bagunca && config.travessuras?.["seguir-mouse"] === true;
const pegarMouseLigado = () => config.bagunca && mouseNativo && config.travessuras?.["pegar-mouse"] !== false;

// ---------- sprites ----------
function quadroPixel(pet, linhas) {
  const c = document.createElement("canvas");
  c.width = pet.largura * pet.escala;
  c.height = pet.altura * pet.escala;
  const g = c.getContext("2d");
  linhas.forEach((linha, y) => {
    [...linha].forEach((ch, x) => {
      const cor = pet.paleta?.[ch];
      if (!cor) return;
      g.fillStyle = cor;
      g.fillRect(x * pet.escala, y * pet.escala, pet.escala, pet.escala);
    });
  });
  return c;
}

function espelhar(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.translate(img.width, 0);
  g.scale(-1, 1);
  g.drawImage(img, 0, 0);
  return c;
}

function carregarImagem(url) {
  return new Promise((ok, falha) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error("não carregou " + url));
    i.src = url;
  });
}

async function prepararSprites(pet) {
  const quadrosPorAnimacao = Object.create(null);
  if (pet.tipo === "pixel") {
    for (const [nome, a] of Object.entries(pet.animacoes)) {
      quadrosPorAnimacao[nome] = a.quadros.map((q) => {
        const normal = quadroPixel(pet, q);
        return { normal, espelhado: espelhar(normal) };
      });
    }
  } else {
    for (const [nome, a] of Object.entries(pet.animacoes)) {
      const quadros = [];
      for (const url of a.quadros) {
        let img;
        try {
          img = await carregarImagem(url);
        } catch (e) {
          console.warn("[sprites]", e.message);
          continue;
        }
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * pet.escala));
        c.height = Math.max(1, Math.round(img.naturalHeight * pet.escala));
        const g = c.getContext("2d");
        g.imageSmoothingEnabled = !pet.pixelado;
        g.drawImage(img, 0, 0, c.width, c.height);
        quadros.push({ normal: c, espelhado: espelhar(c) });
      }
      if (quadros.length) quadrosPorAnimacao[nome] = quadros;
    }
  }
  const primeiro = quadrosPorAnimacao.parado?.[0].normal || quadrosPorAnimacao.andando?.[0].normal;
  if (!primeiro) throw new Error("nenhum quadro válido em parado ou andando");
  return {
    quadros: quadrosPorAnimacao,
    grade: { w: primeiro.width / pet.escala, h: primeiro.height / pet.escala },
  };
}

const RESERVA = {
  correndo: ["andando"], segurando: ["correndo", "andando"], arrastando: ["andando"],
  carregado: ["feliz", "parado"], acenando: ["feliz", "parado"], pensando: ["parado"],
  dormindo: ["parado"], feliz: ["parado"], trabalhando: ["correndo", "andando"],
  travessura: ["acenando", "feliz", "parado"],
  caindo: ["carregado", "acenando", "parado"], tonto: ["parado"], bravo: ["parado"],
  comendo: ["feliz", "parado"], brincando: ["correndo", "andando"], dancando: ["feliz", "parado"],
  combate: ["correndo", "andando"], cacar: ["correndo", "andando"], planar: ["caindo", "carregado"], pogo: ["caindo", "carregado"],
};
// Pets que sabem dançar: o desenho vetorial tem a dancinha (Pato) ou o pet.json tem "dancando".
const sabeDancar = () => pet.desenho === "pato" || !!pet.animacoes?.dancando;
const VEL_VOO = 110; // px/s subindo ou descendo, quando o pato voa com o bilhete
// Na barra de tarefas, o pato vai buscar o bilhete voando: assim o papel no bico fica acima do chat.
const vaiVoar = () => noChao() && pet.desenho === "pato";
function voarNaAlturaDoBilhete(dt) {
  if (!P.voando) Object.assign(P, { voando: true, tVoo: 0 });
  P.tVoo += dt;
  const m = maoTras();
  const a = areaBilhete();
  const altura = P.bilhete?.altura ?? Math.min(tela.alturaBilhete, a.h);
  // primeiro bate as asas um instante no chão, depois sobe devagar (nada de pulo)
  const alvoY = P.tVoo < 0.5 ? P.y : tetoBilhete(a, altura) + 24 + (P.y - m.y) + Math.sin(relogio * 5) * 6;
  P.y += Math.max(-VEL_VOO, Math.min(VEL_VOO, (alvoY - P.y) * 3)) * dt;
  if (P.alvo) P.alvo.y = P.y;
}
const CHANCE_DANCAR = 0.04; // aleatória, fora do intervalo das bagunças
function animacao(nome) {
  if (sprites[nome]) return nome;
  for (const r of RESERVA[nome] || []) if (sprites[r]) return r;
  return sprites.parado ? "parado" : "andando";
}

// ---------- estados ----------
function animarPet(anim) {
  if (P.anim !== anim) P.tAnim = 0;
  P.anim = anim;
}

function mudar(estado, tempo, extra = {}) {
  if (debug && estado !== P.estado) console.warn(`[debug] ${P.estado} -> ${estado} x=${Math.round(P.x)} y=${Math.round(P.y)} cursor=${cursor.x},${cursor.y}`);
  if (estado !== "arrastando" && P.bilhete) {
    window.api.enviar("bilhete:mover", { id: P.bilhete.id, solto: true });
    P.bilhete = null;
    P.bilheteNaCabeca = false;
  }
  if (estado !== "buscar") P.buscandoBilhete = false;
  // voando com o bilhete: decola para buscar, pega (parado no ar), volta puxando e pousa
  const noVoo = ["buscar", "arrastando", "pousando"].includes(estado);
  if (!noVoo) P.voando = false;
  P.estado = estado;
  P.tempo = tempo;
  Object.assign(P, extra);
  animarPet({ andar: "andando", perseguir: "correndo", seguir: "andando", buscar: "andando", voltar: "andando" }[estado] || estado);
}

function falar(texto, segundos = 3.5) {
  P.fala = { texto, ate: relogio + segundos };
}

// ---------- onde ele pode andar ----------
// Telas em que ele pode andar (todas, ou a escolhida em ⚙️ → Telas).
const areas = () => (tela.areas?.length ? tela.areas : [tela.area]);
function limites() {
  const l = areas();
  return { min: Math.min(...l.map((a) => a.x)), max: Math.max(...l.map((a) => a.x + a.w)) };
}
// Monitor em que um x está (ou o mais próximo, se cair num vão entre monitores). Se dois monitores
// têm o mesmo x (um em cima do outro), desempata pela altura em que o pet está.
function areaDe(x, y = P.y) {
  const l = areas();
  const fora = (v, ini, tam) => (v < ini ? ini - v : v > ini + tam ? v - ini - tam : 0);
  const dist = (a) => fora(x, a.x, a.w) * 10000 + fora(y, a.y, a.h + alturaPx());
  return l.reduce((melhor, a) => (dist(a) < dist(melhor) ? a : melhor), l[0]);
}
// Com monitores de tamanhos diferentes (ou um em pé, na vertical), o retângulo que junta todos tem
// "buracos" sem monitor nenhum. Isto prende um ponto no monitor mais próximo, com uma folga para os
// pés poderem ir até a borda de baixo (pegando o mouse lá embaixo, por exemplo) e uma margem no
// topo (pés pelo menos tanto abaixo do alto da tela, senão o corpo fica todo para fora, acima).
const monitores = () => (tela.monitores?.length ? tela.monitores : areas());
function prenderNaTela(p, folgaX = 0, folgaBaixo = 0, margemCima = 0) {
  const lista = monitores();
  const caixa = (a) => ({ x0: a.x - folgaX, x1: a.x + a.w + folgaX, y0: a.y + margemCima, y1: a.y + a.h + folgaBaixo });
  const dist = (a) => {
    const c = caixa(a);
    return Math.hypot(Math.max(c.x0 - p.x, 0, p.x - c.x1), Math.max(c.y0 - p.y, 0, p.y - c.y1));
  };
  const c = caixa(lista.reduce((m, a) => (dist(a) < dist(m) ? a : m), lista[0]));
  return { x: Math.max(c.x0, Math.min(c.x1, p.x)), y: Math.max(c.y0, Math.min(c.y1, p.y)) };
}
const dentro = (p, a) => p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h + 8;

function limitarX(x) {
  const m = larguraPx() / 2;
  const { min, max } = limites();
  return Math.max(min + m, Math.min(max - m, x));
}
// "Chão" em ⚙️: "barra" = anda só em cima da barra de tarefas (o fim da área útil da tela);
// "tela" = anda pela tela inteira.
const noChao = () => config?.chao === "barra";
const chaoDe = (x = P.x) => { const a = areaDe(x); return a.y + a.h; };
function limitarY(y, x = P.x) {
  const a = areaDe(x);
  if (noChao()) return a.y + a.h;
  return Math.max(a.y + alturaPx(), Math.min(a.y + a.h, y));
}

function pontoAleatorio() {
  const a = escolha(areas());
  const x = limitarX(rand(a.x, a.x + a.w));
  return { x, y: limitarY(rand(a.y + a.h * 0.15, a.y + a.h), x) };
}

// Atividades (pegar/seguir o mouse, buscar bilhete, travessura): uma de cada vez, com um intervalo
// entre uma e a próxima que a pessoa escolhe em Configurações → Frequência (3 min por padrão).
// A primeira vem na metade do intervalo depois de abrir. Andar, cochilar, acenar e dançar são livres.
const intervaloAtividade = () => (Number(config.frequencia) || 3) * 60;
let ultimaAtividade = null;
const podeAtividade = () => Boolean(debug) || relogio >= (ultimaAtividade ?? -intervaloAtividade() / 2) + intervaloAtividade();
const comecouAtividade = () => (ultimaAtividade = relogio);

function proximoEstado() {
  if (P.humor === "pensando") return mudar("pensando", 999);
  if (P.humor === "trabalhando") return mudar("trabalhando", 999, { alvo: { x: limitarX(P.x + rand(-40, 40)), y: P.y } });

  const r = Math.random();
  if (debug === "perseguir" && mouseNativo) return mudar("perseguir", 10);
  if (debug === "seguir") return mudar("seguir", 10);
  if (debug === "dancar" && sabeDancar()) return mudar("dancando", 6);
  if (debug === "travessura" && config.bagunca) pedirTravessura();
  if (!config.passear || relogio < ficarAte) {
    const a = P.ancora || tela.casa;
    if (sabeDancar() && Math.random() < CHANCE_DANCAR) return mudar("dancando", 5.1); // um ciclo inteiro da dança
    if (r < 0.5) return mudar("parado", rand(3, 7));
    if (r < 0.62) return mudar("acenando", 1.6);
    if (r < 0.9) {
      const x = limitarX(a.x + rand(-60, 60));
      return mudar("andar", 6, { alvo: { x, y: noChao() ? limitarY(a.y, x) : a.y } });
    }
    if (r < 0.96) return mudar("dormindo", rand(6, 12));
    falar(escolha(pet.falas.length ? pet.falas : ["🙂"]));
    return mudar("parado", 3.5);
  }

  // sorteio separado: não pode "roubar" a faixa do r que é dos bilhetes e travessuras
  if (pegarMouseLigado() && podeAtividade() && Math.random() < CHANCE_PEGAR) {
    console.info("[mouse] vou pegar o mouse");
    comecouAtividade();
    return mudar("perseguir", 10);
  }
  if (seguirMouseLigado() && podeAtividade() && Math.random() < 0.08) {
    comecouAtividade();
    return mudar("seguir", rand(6, 10));
  }
  if (config.bagunca && podeAtividade() && r >= 0.35 && r < 0.4) pedirTravessura(); // raro (e o app ainda respeita o mesmo intervalo)
  if (config.bagunca && ((podeAtividade() && r < 0.35) || debug === "bilhete")) {
    comecouAtividade();
    const { min, max } = limites();
    const lado = P.x < (min + max) / 2 ? -1 : 1;
    const x = lado < 0 ? min + larguraPx() / 2 - larguraPx() * 0.6 : max - larguraPx() / 2 + larguraPx() * 0.6;
    const a = areaDe(x);
    // na tela inteira, nada de buscar lá embaixo: com o papel pendurado no bico, ele ficaria em cima
    // da barra de tarefas. A boca fica a ~70% da altura do pet, e o papel começa 24 px acima dela.
    const altura = Math.min(tela.alturaBilhete, a.h);
    const yMax = tetoBilhete(a, altura) + 24 + alturaPx() * 0.7 - 20; // folga: o passo balança a boca
    const y = limitarY(Math.min(rand(a.y + 220, a.y + a.h), yMax), x);
    return mudar("buscar", 20, { alvo: { x, y }, lado, telaBilheteId: a.id });
  }
  if (sabeDancar() && Math.random() < CHANCE_DANCAR) return mudar("dancando", 5.1); // dança quando der vontade
  if (r < 0.45) return mudar("parado", rand(2, 5));
  if (r < 0.85) return mudar("andar", 12, { alvo: pontoAleatorio() });
  if (r < 0.92) return mudar("dormindo", rand(6, 12));
  falar(escolha(pet.falas.length ? pet.falas : ["🙂"]));
  return mudar("parado", 3.5);
}

// ---------- travessuras ----------
let travessura = null; // { token, tipo, rotulos, vezes, tocadas, apertadaAte }
let pedindo = false;
async function pedirTravessura() {
  if (pedindo || travessura) return;
  pedindo = true;
  const t = await window.api.invocar("travessura:pedir").finally(() => (pedindo = false));
  if (!t || travessura || segurado || ["perseguir", "seguir", "segurando", "buscar", "arrastando"].includes(P.estado)) return;
  travessura = { ...t, tocadas: 0, apertadaAte: 0 };
  comecouAtividade();
  falar(escolha(t.tipo === "abrir" ? ["Olha isso! 😈", "Pesquisei pra você 🌐"] : ["Hehe 😈", "Ops...", "Segura essa!"]), 2.5);
  mudar("travessura", 15);
  // um tempinho para a pessoa ver as teclas antes de ele apertar
  setTimeout(() => travessura && window.api.enviar("travessura:executar", travessura.token), 1300);
}
window.api.ouvir("travessura:tecla", (i) => {
  if (!travessura) return;
  travessura.tocadas = i + 1;
  travessura.apertadaAte = relogio + 0.22;
  P.tAnim = 0;
});
window.api.ouvir("travessura:fim", () => {
  if (!travessura) return;
  travessura = null;
  if (P.estado === "travessura") {
    falar(escolha(["Hihi 🙃", "Não fui eu!", "Foi sem querer 😇"]), 2);
    mudar("feliz", 1.5);
  }
});

// Teclas desenhadas ao lado do pet: metade de cada lado (Alt de um lado, Tab do outro).
function desenharTeclas(topo) {
  if (!travessura || P.estado !== "travessura") return;
  const apertada = relogio < travessura.apertadaAte;
  const r = travessura.rotulos;
  ctx.font = "bold 13px system-ui, sans-serif";
  const larg = r.map((t) => Math.max(38, ctx.measureText(t).width + 18));
  // metade de cada lado; se do lado direito não couber (chat ou fim da tela), vão todas para a esquerda
  let metade = Math.ceil(r.length / 2);
  const direita = r.slice(metade).reduce((s, _t, i) => s + larg[metade + i] + 6, 0);
  const pertoDoChat = Math.abs(P.y - tela.casa.y) < 120 && P.x <= tela.casa.x + 5; // em casa, à esquerda do chat
  const limiteDir = Math.min(limites().max, limiteBalao ?? Infinity, pertoDoChat ? tela.casa.x + 38 : Infinity);
  if (P.x + larguraPx() / 2 + 10 + direita > limiteDir) metade = r.length;
  const y0 = P.y - 34;
  const pos = [];
  let xe = P.x - larguraPx() / 2 - 10;
  for (let i = metade - 1; i >= 0; i--) {
    xe -= larg[i];
    pos[i] = xe;
    xe -= 6;
  }
  let xd = P.x + larguraPx() / 2 + 10;
  for (let i = metade; i < r.length; i++) {
    pos[i] = xd;
    xd += larg[i] + 6;
  }
  r.forEach((rotulo, i) => {
    // as seguradas ficam afundadas depois do 1º toque; a última pisca a cada toque
    const afundada = i < r.length - 1 ? travessura.tocadas > 0 : apertada;
    const d = afundada ? 3 : 0;
    ctx.fillStyle = "#9aa0b4";
    ctx.beginPath();
    ctx.roundRect(pos[i], y0 + 3, larg[i], 28, 6);
    ctx.fill();
    ctx.fillStyle = afundada ? "#dfe3ee" : "#f7f8fc";
    ctx.strokeStyle = "#2b2d42";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pos[i], y0 + d, larg[i], 28 - (afundada ? 0 : 3), 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2b2d42";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(rotulo, pos[i] + larg[i] / 2, y0 + d + 12);
    ctx.textAlign = "start";
  });
  // contador em cima da tecla que está sendo tocada (fica longe do balão de fala)
  if (travessura.tipo === "teclas" && travessura.vezes > 1) {
    const u = r.length - 1;
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillStyle = "#ef476f";
    ctx.textAlign = "center";
    ctx.fillText(`${travessura.tocadas}/${travessura.vezes}`, pos[u] + larg[u] / 2, y0 - 10);
    ctx.textAlign = "start";
  }
}

// Anda em direção ao alvo; devolve true quando chega.
// virar = false: quem chama decide para onde ele olha (ex.: seguindo o mouse, com virarPara).
function andarAte(alvo, dt, mult = 1, virar = true) {
  const dx = alvo.x - P.x;
  const dy = alvo.y - P.y;
  const d = Math.hypot(dx, dy);
  const passo = velocidade() * mult * dt;
  if (virar && Math.abs(dx) > 1) P.olhando = dx > 0 ? 1 : -1;
  if (d <= passo) {
    P.x = alvo.x;
    P.y = alvo.y;
    return true;
  }
  // não entra nos "buracos" entre monitores: se o passo cair fora de todos, desliza pela borda.
  // Atrás do mouse ele pode encostar nas bordas (a mão alcança o cursor lá); andando, o corpo fica
  // inteiro na tela: atravessando para um monitor em pé mais alto, ele subia com os pés no topo
  // do outro monitor e sumia (corpo todo acima da tela).
  const atrasDoMouse = ["perseguir", "seguir", "segurando", "combate"].includes(P.estado);
  const q = prenderNaTela({ x: P.x + (dx / d) * passo, y: P.y + (dy / d) * passo }, larguraPx() / 2, atrasDoMouse ? alturaPx() : 0, atrasDoMouse ? 0 : alturaPx());
  P.x = q.x;
  P.y = q.y;
  return false;
}

// Olha para o lado de x, com uma "zona morta" no meio: só vira se x estiver claramente de um lado.
// Sem isso, com o mouse bem em cima/embaixo dele, mirar com a mão fazia ele virar sem parar
// (virar troca a mão de lado, que muda o alvo, que faz ele virar de volta...).
function virarPara(x) {
  const margem = larguraPx() * 0.25;
  if (x > P.x + margem) P.olhando = 1;
  else if (x < P.x - margem) P.olhando = -1;
}

// Ponto da mão do pet na tela (coluna/linha do sprite em pet.mao, ou "maoTras").
function ponto(campo, padrao) {
  const [cx, cy] = pet[campo] || padrao;
  const col = P.olhando > 0 ? cx : tamGrade.w - 1 - cx;
  return {
    x: P.x - larguraPx() / 2 + (col + 0.5) * pet.escala,
    y: P.y - alturaPx() + (cy + 0.5) * pet.escala,
  };
}
// Com o modelo 3D, o ponto que segura as coisas é a "boca" que ele informa a cada quadro
// (bico do Pato, boca da Tartaruga, mão do Palito): ela muda de lugar quando ele gira.
let boca3d = null;
const boca = () => (boca3d && relogio - boca3d.em < 0.3 ? { x: boca3d.x, y: boca3d.y } : null);
const mao = () => boca() || ponto("mao", [tamGrade.w - 1, Math.floor(tamGrade.h * 0.6)]);
function maoTras() {
  const m = boca();
  if (m) return { x: P.x + (m.x - boca3d.peX), y: P.y + (m.y - boca3d.peY) };
  return ponto("maoTras", [2, Math.floor(tamGrade.h * 0.6)]);
}

const areaBilhete = () => areas().find((a) => a.id === P.telaBilheteId) || areaDe(P.x);
const tetoBilhete = (a, altura) => Math.max(a.y, a.y + a.h - altura - 10);

function puxarBilhete(b) {
  const a = areaBilhete();
  const lado = P.lado;
  const naCabeca = !P.voando && maoTras().y - 24 > tetoBilhete(a, b.altura);
  const metadePet = Math.min(larguraPx(), a.w) / 2;
  const espacoPapel = naCabeca ? b.largura / 2 : b.largura + metadePet;
  // O pet anda para dentro pelo menos o suficiente para trazer a outra ponta do papel.
  const dist = Math.min(a.w - metadePet, Math.max(rand(a.w * 0.12, a.w * 0.3), espacoPapel));
  const x = lado < 0 ? a.x + dist : a.x + a.w - dist;
  const tempo = Math.max(20, Math.abs(P.x - x) / (velocidade() * 0.7) + 2);
  mudar("arrastando", tempo, { alvo: { x, y: P.y }, bilhete: b, bilheteNaCabeca: naCabeca });
}

function moverBilhete() {
  const b = P.bilhete;
  if (!b) return;
  const a = areaBilhete();
  let x, y;
  if (P.bilheteNaCabeca) {
    x = P.x - b.largura / 2;
    y = P.y - alturaPx() - b.altura + 12 + Math.sin(relogio * 9) * 3;
  } else {
    const m = maoTras();
    x = P.lado < 0 ? m.x - b.largura + 8 : m.x - 8;
    y = m.y - 24;
  }
  window.api.enviar("bilhete:mover", { id: b.id, x, y: Math.max(a.y, Math.min(y, tetoBilhete(a, b.altura))) });
  return x;
}

function faltaPuxarBilhete(x) {
  const a = areaBilhete();
  const falta = P.lado < 0 ? a.x - x : x + P.bilhete.largura - (a.x + a.w);
  if (falta <= 0.5) return false;
  // A mão ou a agulha do modelo 3D pode ficar mais longe do corpo do que no sprite.
  const espaco = Math.min(larguraPx(), a.w) / 2;
  const xNovo = Math.max(a.x + espaco, Math.min(P.x - P.lado * (falta + 8), a.x + a.w - espaco));
  if ((P.x - xNovo) * P.lado < 1) return false;
  P.alvo.x = xNovo;
  return true;
}

// Resgate: se ele ficar fora de todas as telas (ou a posição virar NaN), volta para casa.
let foraHa = 0;
function resgatar(dt) {
  const quebrado = !Number.isFinite(P.x) || !Number.isFinite(P.y);
  const visivel = !quebrado && tela.areas.some((a) => P.x > a.x - larguraPx() / 2 && P.x < a.x + a.w + larguraPx() / 2 && P.y > a.y && P.y < a.y + a.h + alturaPx());
  foraHa = visivel ? 0 : foraHa + dt;
  if (quebrado || foraHa > 3) {
    console.warn(`[resgate] pet sumiu (estado=${P.estado}, x=${P.x}, y=${P.y}); voltando para casa`);
    Object.assign(P, { x: tela.casa.x, y: tela.casa.y, ancora: { ...tela.casa } });
    foraHa = 0;
    mudar("acenando", 2);
  }
}

// depuração: conta quantas vezes ele vira de lado (para pegar "tremedeira")
let viradas = 0, olhandoAntes = 0, contagemDesde = 0;
function contarViradas() {
  if (P.olhando !== olhandoAntes) viradas++;
  olhandoAntes = P.olhando;
  if (relogio - contagemDesde >= 2) {
    console.warn(`[debug] viradas em 2 s: ${viradas} (estado=${P.estado})`);
    viradas = 0;
    contagemDesde = relogio;
  }
}

function atualizar(dt) {
  if (debug === "seguir") contarViradas();
  if (!segurado && P.estado !== "buscar" && P.estado !== "arrastando") resgatar(dt);
  P.tempo -= dt;
  P.tAnim += dt;

  window.Hornet?.passo(dt);
  if (segurado) {
    const ponta = window.Hornet?.ativo() && boca();
    if (ponta) {
      // a Hornet fica pendurada pela ponta da agulha: leva a ponta até o cursor (rápido, mas sem tranco)
      const k = Math.min(1, dt * 18);
      P.x += (cursor.x - ponta.x) * k;
      P.y += (cursor.y - ponta.y) * k;
    } else {
      P.x = cursor.x - segurado.dx;
      P.y = cursor.y - segurado.dy;
    }
    window.Vida?.segurando(dt); // percebe se a pessoa está chacoalhando
    return;
  }
  if (window.Vida?.atualizar(dt)) return; // queda, tontura, bravo, comer, brincar, menu
  if (window.Hornet?.atualizar(dt)) return; // combate, inimigo, pogo, planar, Thread Storm

  switch (P.estado) {
    case "andar":
      if (andarAte(P.alvo, dt) || P.tempo <= 0) proximoEstado();
      return;
    case "voltar": {
      // volta correndo (de outro monitor pode ser longe) e fica um tempo em casa
      const mult = Math.max(1.5, VEL_VOLTAR / velocidade());
      if (andarAte(P.alvo, dt, mult) || P.tempo <= 0) {
        if (P.tempo <= 0) Object.assign(P, { x: P.alvo.x, y: P.alvo.y }); // demorou demais: aparece em casa
        P.ancora = { ...P.alvo };
        mudar("acenando", 1.5);
      }
      return;
    }
    case "trabalhando":
      if (andarAte(P.alvo, dt, 1.4)) P.alvo = { x: limitarX(P.x + rand(-40, 40)), y: P.y };
      return;
    case "perseguir": {
      virarPara(cursor.x);
      const m = mao();
      // perseguindo, ele vai a qualquer lugar da tela (topo, barra de tarefas...), não só no "chão"
      // os pés podem sair da tela (a mão fica acima dos pés; senão o mouse na borda de baixo fica fora de alcance)
      const alvo = {
        x: Math.max(limites().min - larguraPx() / 2, Math.min(limites().max + larguraPx() / 2, P.x + (cursor.x - m.x))),
        y: Math.max(alturaPx() * 0.5, Math.min(tela.altura + alturaPx(), P.y + (cursor.y - m.y))),
      };
      // corre rápido, independente da velocidade do pet (senão um pet lento nunca alcança o mouse)
      const mult = Math.max(2.2, VEL_PERSEGUIR / velocidade());
      andarAte(alvo, dt, mult, false);
      const m2 = mao();
      if (Math.hypot(cursor.x - m2.x, cursor.y - m2.y) < RAIO_PEGAR || sobreOPet(cursor)) {
        if (window.Hornet?.ativo()) return Hornet.acertouMouse(); // ela não pega: luta com o mouse
        console.info(`[mouse] peguei em ${(10 - P.tempo).toFixed(1)}s`);
        falar(escolha(["Peguei! 😈", "É meu agora!", "Hehe"]), 2);
        // o mouse não "pula" para a mão: fica onde foi mordido, e anda junto com ela
        const offset = { x: cursor.x - m2.x, y: cursor.y - m2.y };
        return mudar("segurando", rand(2.5, 4), { alvo: pontoAleatorio(), offset, bocaRel: null, cursorEsperado: { ...cursor } });
      }
      if (P.tempo <= 0) {
        const m3 = mao();
        console.info(`[mouse] desisti: mão a ${Math.round(Math.hypot(cursor.x - m3.x, cursor.y - m3.y))}px do mouse (pet ${Math.round(P.x)},${Math.round(P.y)} mouse ${cursor.x},${cursor.y})`);
        falar("Ufa, cansei...", 2);
        proximoEstado();
      }
      return;
    }
    case "seguir": {
      // vai atrás do mouse (sem pegar), parando um pouquinho antes, como um bichinho curioso
      virarPara(cursor.x);
      const m = mao();
      const d = Math.hypot(cursor.x - m.x, cursor.y - m.y);
      if (d > 50) {
        const alvo = {
          x: Math.max(limites().min, Math.min(limites().max, P.x + (cursor.x - m.x))),
          y: Math.max(alturaPx() * 0.5, Math.min(tela.altura, P.y + (cursor.y - m.y))),
        };
        andarAte(alvo, dt, 1.6, false);
      }
      if (P.tempo <= 0) {
        P.x = limitarX(P.x);
        if (window.Vida?.precisaCair()) return Vida.cair();
        P.y = limitarY(P.y);
        proximoEstado();
      }
      return;
    }
    case "segurando": {
      // corre em disparada para pontos aleatórios, puxando o mouse andando de costas
      // (mesmo que a pessoa mexa o mouse: a cada quadro ele volta para a boca do pet)
      const chegou = andarAte(P.alvo, dt, Math.max(1, VEL_ARRASTAR / velocidade()), false);
      if (Math.abs(P.alvo.x - P.x) > 2) P.olhando = P.alvo.x > P.x ? -1 : 1;
      if (chegou) P.alvo = pontoAleatorio();
      const m = mao();
      // O cursor escorrega de onde foi mordido para dentro do bico. A posição da boca em relação
      // ao corpo é suavizada (quando o pet vira, a boca dá a volta nele e o cursor dava um "chicote"),
      // mas o andar do pet não: assim o cursor não fica para trás quando ele corre.
      const k = 1 - Math.exp(-12 * dt);
      P.offset.x *= Math.exp(-5 * dt);
      P.offset.y *= Math.exp(-5 * dt);
      const rel = { x: m.x - P.x, y: m.y - P.y };
      P.bocaRel = P.bocaRel ? { x: P.bocaRel.x + (rel.x - P.bocaRel.x) * k, y: P.bocaRel.y + (rel.y - P.bocaRel.y) * k } : rel;
      // sempre dentro de um monitor (senão o Windows prende o cursor na borda e ele desgruda do bico)
      const c = prenderNaTela({ x: P.x + P.bocaRel.x + P.offset.x, y: P.y + P.bocaRel.y + P.offset.y });
      P.cursorEsperado = { x: Math.round(c.x), y: Math.round(c.y) };
      window.api.enviar("pet:moverCursor", P.cursorEsperado);
      if (P.tempo <= 0 || !pegarMouseLigado()) {
        P.x = limitarX(P.x);
        if (window.Vida?.precisaCair()) return Vida.cair();
        mudar("feliz", 1.2);
        P.y = limitarY(P.y); // se estava no topo/barra de tarefas, volta para o chão
      }
      return;
    }
    case "buscar": {
      if (P.buscandoBilhete) return;
      if (vaiVoar()) voarNaAlturaDoBilhete(dt); // o pato vai voando buscar o bilhete
      if (andarAte(P.alvo, dt, 1.3)) {
        P.buscandoBilhete = true;
        const busca = P.alvo;
        const a = areaBilhete();
        const y = Math.min(P.y - 60, tetoBilhete(a, Math.min(tela.alturaBilhete, a.h)));
        window.api.invocar("bilhete:criar", { telaId: a.id, lado: P.lado, y }).catch((erro) => {
          console.warn("[bilhete] não consegui abrir o recado:", erro.message);
          return null;
        }).then((b) => {
          if (P.estado !== "buscar" || P.alvo !== busca) {
            if (b) window.api.enviar("bilhete:mover", { id: b.id, solto: true });
            return;
          }
          P.buscandoBilhete = false;
          if (!b) return P.voando ? mudar("pousando", 6) : proximoEstado();
          P.olhando = -P.lado;
          puxarBilhete(b);
        });
      } else if (P.tempo <= 0) P.voando ? mudar("pousando", 6) : proximoEstado();
      return;
    }
    case "arrastando": {
      // anda de costas para dentro da tela, puxando o bilhete
      const olhar = P.olhando;
      // na barra de tarefas o pato sai voando, batendo as asas, na altura em que o bilhete
      // pendurado no bico fica acima do chat (os outros pets levam o papel na cabeça)
      if (vaiVoar() && P.bilhete) voarNaAlturaDoBilhete(dt);
      const chegou = andarAte(P.alvo, dt, 0.7);
      P.olhando = olhar;
      const x = moverBilhete();
      if (chegou && P.tempo > 0 && P.bilhete && faltaPuxarBilhete(x)) return;
      if (chegou || P.tempo <= 0 || !P.bilhete) {
        // com o papel em cima da cabeça, o balão de fala cobriria o texto dele
        if (P.bilhete && !P.bilheteNaCabeca) falar(escolha(["Trouxe pra você!", "Um presente 💌", "Leia isso!"]), 2.5);
        if (P.voando) return mudar("pousando", 6); // desce batendo as asas
        mudar("feliz", 1.5);
      }
      return;
    }
    case "pousando": {
      // desce devagar batendo as asas até o chão (a barra de tarefas)
      const chao = chaoDe();
      P.y = Math.min(chao, P.y + VEL_VOO * 0.8 * dt);
      if (P.y >= chao || P.tempo <= 0) {
        P.y = chao;
        P.ancora = { x: P.x, y: P.y };
        mudar("feliz", 1.5);
      }
      return;
    }
    case "travessura":
      if (P.tempo <= 0) {
        travessura = null;
        proximoEstado();
      }
      return;
    default:
      if (P.tempo <= 0) proximoEstado();
  }
}

// ---------- mouse ----------
function sobreOPet(p) {
  if (!pet) return false;
  const w = larguraPx();
  const h = alturaPx();
  return p.x > P.x - w / 2 - 4 && p.x < P.x + w / 2 + 4 && p.y > P.y - h - 4 && p.y < P.y + 4;
}

// botão direito no pet: abre o pop-up na posição do clique, em coordenadas do overlay.
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (!pet) return;
  const j = janela();
  const ponto = { x: j.x + e.clientX, y: j.y + e.clientY };
  if (sobreOPet(ponto)) window.Vida?.abrirMenu(ponto);
});

function atualizarCliques() {
  const deveIgnorar = !(segurado || sobreOPet(cursor) || window.Vida?.sobreBola(cursor));
  if (deveIgnorar !== ignorando) {
    ignorando = deveIgnorar;
    window.api.enviar("pet:ignorar", ignorando);
  }
}

window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  window.api.enviar("barra:fecharPet");
  if (window.Vida?.cliqueNaBola(cursor)) return; // chutou a bola
  if (!sobreOPet(cursor)) return;
  window.Vida?.pegou();
  segurado = { dx: cursor.x - P.x, dy: cursor.y - P.y, inicio: { ...cursor } };
  if (window.Hornet?.ativo()) {
    P.acao = null;
    boca3d = null;
  }
  mudar("carregado", 999);
});

window.addEventListener("mouseup", () => {
  if (!segurado) return;
  const moveu = Math.hypot(cursor.x - segurado.inicio.x, cursor.y - segurado.inicio.y) > 5;
  segurado = null;
  if (window.Vida?.soltou(moveu)) return; // caiu, ficou tonto...
  if (!moveu) {
    if (window.Vida?.carinhoRecusado()) return; // bravo: nada de carinho
    // clique: carinho!
    for (let i = 0; i < 5; i++) coracoes.push({ x: P.x + rand(-15, 15), y: P.y - alturaPx(), vy: rand(30, 60), vx: rand(-15, 15), vida: 1.4 });
    if (Math.random() < 0.4 && pet.falas.length) falar(escolha(pet.falas));
    if (P.humor === "pensando" || P.humor === "trabalhando") return mudar(P.humor, 999);
    if (window.Vida?.voltarAoJogo()) return; // estava jogando bola: continua o jogo
    return mudar("feliz", 1.4);
  }
  P.x = limitarX(P.x);
  P.y = limitarY(Math.max(P.y, areaDe(P.x).y + alturaPx()));
  P.ancora = { x: P.x, y: P.y };
  falar(window.Hornet?.ativo() ? Hornet.texto("solta") : escolha(["Uhul!", "De novo!", "Que passeio!"]), 1.8); // só se irrita no chacoalhão
  if (window.Vida?.voltarAoJogo()) return;
  mudar("feliz", 1.2);
});

// ---------- desenho ----------
function balao(texto, x, y) {
  ctx.font = "13px system-ui, sans-serif";
  const palavras = String(texto).split(/\s+/);
  const linhas = [];
  let atual = "";
  for (const p of palavras) {
    const t = atual ? atual + " " + p : p;
    if (ctx.measureText(t).width > 190 && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = t;
  }
  linhas.push(atual);
  const w = Math.max(...linhas.map((l) => ctx.measureText(l).width)) + 20;
  const h = linhas.length * 17 + 12;
  const j = janela();
  const limite = limiteBalao != null && x < limiteBalao ? limiteBalao : j.x + j.w - 4;
  let bx = Math.max(j.x + 4, Math.min(limite - w, x - w / 2));
  let by = Math.max(j.y + 4, y - h - 12);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#2b2d42";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 6, by + h - 1);
  ctx.lineTo(x, by + h + 9);
  ctx.lineTo(x + 6, by + h - 1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2b2d42";
  ctx.textBaseline = "top";
  linhas.forEach((l, i) => ctx.fillText(l, bx + 10, by + 7 + i * 17));
}

function desenhar(dt) {
  const j = janela();
  ctx.clearRect(j.x, j.y, j.w, j.h);
  if (!pet) return;

  // Pets do app: modelo 3D de verdade (pet3d.js, three.js). Se o WebGL falhar, usa o desenho
  // com volume de vetor.js. Pets da comunidade continuam em pixel art ou imagens.
  if (window.Pet3D?.tem(pet.desenho) && desenhar3D(dt)) return;
  const vetor = pet.desenho && window.Vetor?.[pet.desenho];
  if (vetor) return desenharVetor(vetor, dt);
  const nome = animacao(P.anim);
  const quadros = sprites[nome];
  const fps = pet.animacoes[nome]?.fps || 4;
  const q = quadros[Math.floor(P.tAnim * fps) % quadros.length];
  const img = P.olhando > 0 ? q.normal : q.espelhado;
  const andando = ["andando", "correndo"].includes(nome);
  const pulo = andando ? -Math.abs(Math.sin(P.tAnim * fps * Math.PI)) * 2 : 0;
  const dx = Math.round(P.x - img.width / 2);
  const dy = Math.round(P.y - img.height + pulo);

  // sombrinha
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(P.x, P.y, img.width * 0.35, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, dx, dy);

  desenharExtras(dy, dt);
}

function desenharExtras(topo, dt) {
  window.Vida?.desenhar(topo, dt);
  window.Hornet?.desenhar();
  desenharTeclas(topo);
  if (P.estado === "dormindo") {
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.fillStyle = "#5c6b8a";
    for (let i = 0; i < 3; i++) {
      const f = (relogio * 0.6 + i / 3) % 1;
      ctx.globalAlpha = 1 - f;
      ctx.fillText("z", P.x + 10 + f * 18, topo - f * 30);
    }
    ctx.globalAlpha = 1;
  }
  if (P.estado === "pensando") balao(".".repeat(1 + (Math.floor(relogio * 3) % 3)), P.x, topo);
  else if (P.estado === "trabalhando") balao("trabalhando… 🔧", P.x, topo);
  else if (P.fala && relogio < P.fala.ate) balao(P.fala.texto, P.x, topo);

  coracoes = coracoes.filter((c) => (c.vida -= dt) > 0);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "#ef476f";
  for (const c of coracoes) {
    c.y -= c.vy * dt;
    c.x += c.vx * dt;
    ctx.globalAlpha = Math.min(1, c.vida);
    ctx.fillText("♥", c.x, c.y);
  }
  ctx.globalAlpha = 1;
}

function desenhar3D(dt) {
  let img;
  try {
    img = window.Pet3D.desenhar({
      desenho: pet.desenho, anim: P.anim, estado: P.estado, t: P.tAnim, relogio, x: P.x, y: P.y,
      olhando: P.olhando, alturaPx: alturaPx(), dpr: window.devicePixelRatio || 1,
      planando: (P.estado === "caindo" && P.aberto && !!window.Vida?.plana()) || !!window.Hornet?.planando(),
      voando: !!P.voando,
      acao: window.Hornet?.acao3d() || null,
      deCostas: P.estado === "segurando" || P.estado === "arrastando", // puxando: anda de costas
    });
    boca3d = img?.boca ? { ...img.boca, em: relogio, peX: P.x, peY: P.y } : null;
  } catch (e) {
    console.error("[3d] falhou, voltando para o 2D:", e);
    window.Pet3D = null;
    boca3d = null;
    return false;
  }
  if (!img) return false;
  // sombra macia no chão (encolhe quando ele está no ar)
  const pulando = P.estado === "pogo" || P.estado === "planar"; // a Hornet no pogo e planando
  const noAr = P.estado === "caindo" || P.voando || pulando ? 0.6 : 1;
  // no ar, a sombra fica lá no chão
  let ySombra = P.voando ? chaoDe() : P.y;
  if (pulando) ySombra = noChao() ? chaoDe() : (P.chaoAlvo ?? P.pogo?.y0 ?? P.y);
  ctx.save();
  ctx.fillStyle = "rgba(20,22,35,0.18)";
  ctx.beginPath();
  ctx.ellipse(P.x, ySombra, larguraPx() * 0.42 * noAr, larguraPx() * 0.12 * noAr, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img.canvas, img.x, img.y, img.w, img.h);
  ctx.restore();
  desenharExtras(Math.round(img.topo), dt);
  return true;
}

// Reserva sem WebGL: desenho com volume (vetor.js) em vez do modelo 3D.
function desenharVetor(vetor, dt) {
  const w = larguraPx();
  const h = alturaPx();
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(Math.round(P.x - w / 2), Math.round(P.y - h));
  if (P.estado === "tonto") {
    // cambaleia de um lado para o outro, girando nos pés
    ctx.translate(w / 2, h);
    ctx.rotate(Math.sin(relogio * 7) * 0.12);
    ctx.translate(-w / 2, -h);
  }
  if (P.estado === "dancando" && !vetor.danca) {
    // dancinha genérica: rebola em volta dos pés e quica no ritmo
    const f = P.tAnim * Math.PI * 4;
    ctx.translate(w / 2, h);
    ctx.rotate(Math.sin(f / 2) * 0.14);
    ctx.translate(-w / 2, -h - Math.abs(Math.sin(f)) * 4);
  }
  if (P.olhando < 0) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  try {
    vetor(ctx, { w, h, anim: P.anim, t: P.tAnim, relogio, espelhado: P.olhando < 0, planando: P.estado === "caindo" && P.aberto && !!window.Vida?.plana() });
  } catch (e) {
    console.error("[vetor] falhou, voltando para a pixel art:", e);
    pet.desenho = null;
  }
  ctx.restore();
  desenharExtras(Math.round(P.y - h), dt);
}

// A janela mostra só um monitor (o monitor em que o pet está), mas o pet continua pensando em
// coordenadas de todos os monitores juntos: o canvas é deslocado para o pedaço que esta janela cobre.
const janela = () => tela.janela || { x: 0, y: 0, w: tela.largura, h: tela.altura };
function ajustarCanvas() {
  const r = window.devicePixelRatio || 1;
  const j = janela();
  cv.width = Math.round(j.w * r);
  cv.height = Math.round(j.h * r);
  cv.style.width = j.w + "px";
  cv.style.height = j.h + "px";
  ctx.setTransform(r, 0, 0, r, -j.x * r, -j.y * r);
  ctx.imageSmoothingEnabled = false;
  dprAtual = r;
}
let dprAtual = 1;

// Conta ao processo principal onde o pet está, para a janela ir junto quando ele muda de monitor.
let ondeAvisado = null;
let ondeTempo = 0;
function avisarOnde(dt) {
  ondeTempo -= dt;
  if (ondeTempo > 0 || !pet) return;
  ondeTempo = segurado ? 0.05 : 0.15;
  const p = { x: Math.round(P.x), y: Math.round(P.y - alturaPx() / 2) };
  if (ondeAvisado && ondeAvisado.x === p.x && ondeAvisado.y === p.y) return;
  ondeAvisado = p;
  const j = janela();
  // só avisa quando o centro do pet saiu do monitor desta janela
  if (p.x >= j.x && p.x < j.x + j.w && p.y >= j.y && p.y < j.y + j.h) return;
  window.api.enviar("pet:onde", p);
}

// ---------- laço principal ----------
let ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min(0.05, (agora - ultimo) / 1000);
  ultimo = agora;
  if (!pet) return requestAnimationFrame(quadro);
  relogio += dt;
  atualizar(dt);
  avisarOnde(dt);
  // a janela mudou de monitor (escala diferente): refaz o canvas na nitidez certa
  if ((window.devicePixelRatio || 1) !== dprAtual) ajustarCanvas();
  atualizarCliques();
  desenhar(dt);
  requestAnimationFrame(quadro);
}

let ultimaTroca = 0;
async function trocarPet(novo) {
  const troca = ++ultimaTroca;
  let preparo;
  try {
    preparo = await prepararSprites(novo);
  } catch (e) {
    if (troca !== ultimaTroca) return;
    console.warn(`[sprites] não consegui carregar ${novo.nome}: ${e.message}`);
    if (pet) return falar(`Não consegui carregar ${novo.nome}.`, 3);
    if (petReserva && novo !== petReserva) return trocarPet(petReserva);
    return;
  }
  // A troca mais recente ganha, mesmo se outro conjunto de imagens terminar depois.
  if (troca !== ultimaTroca) return;
  pet = novo;
  sprites = preparo.quadros;
  tamGrade = preparo.grade;
  boca3d = null;
  P.acao = null;
  P.dashAte = 0;
  P.tAnim = 0;
  falar(pet.desenho === "hornet" ? "Saudações. Eu sou Hornet." : `Oi! Eu sou ${pet.nome} 👋`, 3);
  mudar("acenando", 2);
}

window.api.ouvir("cursor", (c) => (cursor = c));
window.api.ouvir("config", (c) => {
  config = c;
  if (!config.passear && ["andar", "perseguir", "seguir", "segurando", "buscar", "arrastando", "combate", "cacar"].includes(P.estado)) {
    mudar("voltar", 20, { alvo: P.ancora || tela.casa });
  }
});
window.addEventListener("error", (e) => console.error("[overlay]", e.message, e.filename + ":" + e.lineno));
window.addEventListener("unhandledrejection", (e) => console.error("[overlay] promessa:", e.reason?.message || e.reason));
window.api.ouvir("tela", (t) => {
  if (!tela) return;
  // Se um monitor mudou (girou, foi ligado, mudou de resolução), o canto do overlay pode ter mudado.
  // As posições são contadas a partir dele: converte tudo, senão o pet "pula" para outro lugar.
  const dx = (tela.origem?.x ?? t.origem?.x ?? 0) - (t.origem?.x ?? 0);
  const dy = (tela.origem?.y ?? t.origem?.y ?? 0) - (t.origem?.y ?? 0);
  if (dx || dy) {
    for (const p of [P, P.ancora, P.alvo, P.cursorEsperado]) if (p) Object.assign(p, { x: p.x + dx, y: p.y + dy });
    if (segurado?.inicio) Object.assign(segurado.inicio, { x: segurado.inicio.x + dx, y: segurado.inicio.y + dy });
    window.Vida?.deslocar?.(dx, dy);
  }
  const antiga = { x: tela.casa.x + dx, y: tela.casa.y + dy };
  tela = t;
  ajustarCanvas();
  // o painel abre no alto da tela: só limita o balão se ele descer até perto de onde o pet mora
  limiteBalao = t.painel && t.painel.y + t.painel.h > t.casa.y - 200 ? t.painel.x - 6 : null;
  if (!pet) {
    Object.assign(P, t.casa, { ancora: { ...t.casa } });
    return;
  }
  // a casa mudou (chat arrastado, aberto ou fechado): se ele estava em casa, vai junto
  const mudou = Math.hypot(antiga.x - t.casa.x, antiga.y - t.casa.y) > 1;
  const emCasa = P.ancora && Math.hypot(P.ancora.x - antiga.x, P.ancora.y - antiga.y) < 1;
  if (mudou && emCasa) P.ancora = { ...t.casa };
  const ocupado = segurado || ["perseguir", "segurando", "buscar", "arrastando", "pousando", "travessura", "combate", "pogo", "planar", "storm"].includes(P.estado);
  const foraDasTelas = !t.areas.some((a) => dentro(P, a));
  if (!segurado && foraDasTelas) chamarDeVolta(8, { ficar: false }); // a tela onde ele estava deixou de ser permitida
  else if (mudou && !ocupado && (Math.hypot(P.x - antiga.x, P.y - antiga.y) < 140 || !config.passear)) chamarDeVolta(8, { ficar: false });
  else if (!ocupado) {
    P.x = limitarX(P.x);
    P.y = limitarY(P.y);
  }
});
window.api.ouvir("pet:trocar", trocarPet);
window.api.ouvir("pet:interagir", (id) => window.Vida?.interagir(id));
// o Windows não deixou mexer no cursor (janela de administrador na frente): solta e explica
let avisouMouse = -999;
window.api.ouvir("mouse:bloqueado", ({ janelaAdmin } = {}) => {
  if (!["segurando", "perseguir", "combate"].includes(P.estado)) return;
  if (relogio - avisouMouse > 120) {
    avisouMouse = relogio;
    falar(
      janelaAdmin
        ? "Não consigo puxar o mouse nessa janela: ela é de administrador. Em ⚙️ dá para me dar permissão."
        : "Ué, o mouse não quis vir comigo... 😕",
      5
    );
  }
  mudar("parado", 2);
});
window.api.ouvir("pet:voltar", () => {
  travessura = null;
  falar(escolha(["Tô indo!", "Voltei!", "Já vou!"]), 2);
  chamarDeVolta(20);
});
window.api.ouvir("bilhete:fechado", (id) => {
  if (P.bilhete?.id === id) P.bilhete = null;
});
let limiteBalao = null; // não deixa o balão ficar atrás do chat aberto
window.api.ouvir("pet:humor", (h) => {
  if (segurado) return;
  if (P.estado === "voltar") {
    // termina de andar até o chat; o humor entra quando chegar
    P.humor = h === "pensando" || h === "trabalhando" ? h : null;
    return;
  }
  P.humor = h === "pensando" || h === "trabalhando" ? h : null;
  if (P.humor) return proximoEstado();
  if (h === "falando") return mudar("acenando", 1.5);
  if (h === "feliz") return mudar("feliz", 1.5);
});

(async () => {
  const d = await window.api.invocar("inicio");
  config = d.config;
  tela = d.tela;
  petReserva = d.petReserva;
  mouseNativo = d.mouseNativo;
  debug = d.debug;
  if (debug) console.warn("[debug] modo", debug, "mouseNativo=", mouseNativo, "telas=", JSON.stringify(d.tela.areas));
  ajustarCanvas();
  P.x = tela.casa.x;
  P.y = tela.casa.y;
  P.ancora = { ...tela.casa };
  await trocarPet(d.pet);
  if (debug === "voltar") {
    const a = tela.areas[0];
    Object.assign(P, { x: a.x + 300, y: a.y + a.h });
    mudar("parado", 99);
  }
  requestAnimationFrame(quadro);
})();
