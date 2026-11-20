// O "cérebro" do pet: estados, movimento e desenho.
const cv = document.getElementById("tela");
const ctx = cv.getContext("2d");

let pet, config, tela, mouseNativo, debug;
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
// Pegar o mouse no estilo do Desktop Goose: guarda a distância mão→mouse na hora da mordida,
// corre em disparada levando o mouse junto, e solta se a pessoa puxar o mouse com força.
const VEL_ARRASTAR = 560; // px/s em disparada com o mouse
const RAIO_SOLTAR = 200; // se o mouse ficar mais longe que isso do lugar esperado, a pessoa ganhou
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
function quadroPixel(linhas) {
  const c = document.createElement("canvas");
  c.width = tamGrade.w * pet.escala;
  c.height = tamGrade.h * pet.escala;
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

async function prepararSprites() {
  sprites = {};
  if (pet.tipo === "pixel") {
    tamGrade = { w: pet.largura, h: pet.altura };
    for (const [nome, a] of Object.entries(pet.animacoes)) {
      sprites[nome] = a.quadros.map((q) => {
        const normal = quadroPixel(q);
        return { normal, espelhado: espelhar(normal) };
      });
    }
  } else {
    for (const [nome, a] of Object.entries(pet.animacoes)) {
      sprites[nome] = [];
      for (const url of a.quadros) {
        const img = await carregarImagem(url);
        const c = document.createElement("canvas");
        c.width = img.naturalWidth * pet.escala;
        c.height = img.naturalHeight * pet.escala;
        const g = c.getContext("2d");
        g.imageSmoothingEnabled = !pet.pixelado;
        g.drawImage(img, 0, 0, c.width, c.height);
        sprites[nome].push({ normal: c, espelhado: espelhar(c) });
      }
    }
    const primeiro = sprites.parado[0].normal;
    tamGrade = { w: primeiro.width / pet.escala, h: primeiro.height / pet.escala };
  }
}

const RESERVA = {
  correndo: ["andando"], segurando: ["correndo", "andando"], arrastando: ["andando"],
  carregado: ["feliz", "parado"], acenando: ["feliz", "parado"], pensando: ["parado"],
  dormindo: ["parado"], feliz: ["parado"], trabalhando: ["correndo", "andando"],
  travessura: ["acenando", "feliz", "parado"],
  caindo: ["carregado", "acenando", "parado"], tonto: ["parado"], bravo: ["parado"],
  comendo: ["feliz", "parado"], brincando: ["correndo", "andando"],
};
function animacao(nome) {
  if (sprites[nome]) return nome;
  for (const r of RESERVA[nome] || []) if (sprites[r]) return r;
  return "parado";
}

// ---------- estados ----------
function mudar(estado, tempo, extra = {}) {
  if (debug && estado !== P.estado) console.warn(`[debug] ${P.estado} -> ${estado} x=${Math.round(P.x)} y=${Math.round(P.y)} cursor=${cursor.x},${cursor.y}`);
  P.estado = estado;
  P.tempo = tempo;
  Object.assign(P, extra);
  const anim = { andar: "andando", perseguir: "correndo", seguir: "andando", buscar: "andando", voltar: "andando" }[estado] || estado;
  if (P.anim !== anim) P.tAnim = 0;
  P.anim = anim;
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
// Monitor em que um x está (ou o mais próximo, se cair num vão entre monitores).
function areaDe(x) {
  const l = areas();
  const dist = (a) => (x < a.x ? a.x - x : x > a.x + a.w ? x - a.x - a.w : 0);
  return l.reduce((melhor, a) => (dist(a) < dist(melhor) ? a : melhor), l[0]);
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

function proximoEstado() {
  if (P.humor === "pensando") return mudar("pensando", 999);
  if (P.humor === "trabalhando") return mudar("trabalhando", 999, { alvo: { x: limitarX(P.x + rand(-40, 40)), y: P.y } });

  const r = Math.random();
  if (debug === "perseguir" && mouseNativo) return mudar("perseguir", 10);
  if (debug === "travessura" && config.bagunca) pedirTravessura();
  if (!config.passear || relogio < ficarAte) {
    const a = P.ancora || tela.casa;
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
  if (pegarMouseLigado() && Math.random() < CHANCE_PEGAR) {
    console.info("[mouse] vou pegar o mouse");
    return mudar("perseguir", 10);
  }
  if (seguirMouseLigado() && Math.random() < 0.08) return mudar("seguir", rand(6, 10));
  if (config.bagunca && r >= 0.35 && r < 0.4) pedirTravessura(); // raro (e o app ainda limita a 1 a cada 3 min)
  if (config.bagunca && r < 0.35) {
    const { min, max } = limites();
    const lado = P.x < (min + max) / 2 ? -1 : 1;
    const x = lado < 0 ? min + larguraPx() / 2 - larguraPx() * 0.6 : max - larguraPx() / 2 + larguraPx() * 0.6;
    const a = areaDe(x);
    return mudar("buscar", 20, { alvo: { x, y: limitarY(rand(a.y + 220, a.y + a.h), x) }, lado });
  }
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
function andarAte(alvo, dt, mult = 1) {
  const dx = alvo.x - P.x;
  const dy = alvo.y - P.y;
  const d = Math.hypot(dx, dy);
  const passo = velocidade() * mult * dt;
  if (Math.abs(dx) > 1) P.olhando = dx > 0 ? 1 : -1;
  if (d <= passo) {
    P.x = alvo.x;
    P.y = alvo.y;
    return true;
  }
  P.x += (dx / d) * passo;
  P.y += (dy / d) * passo;
  return false;
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
const mao = () => ponto("mao", [tamGrade.w - 1, Math.floor(tamGrade.h * 0.6)]);
const maoTras = () => ponto("maoTras", [2, Math.floor(tamGrade.h * 0.6)]);

function moverBilhete() {
  const b = P.bilhete;
  if (!b) return;
  const m = maoTras();
  const x = P.olhando > 0 ? m.x - b.largura + 6 : m.x - 6;
  window.api.enviar("bilhete:mover", { id: b.id, x, y: m.y - 24 });
}

// Resgate: se ele ficar fora de todas as telas (ou a posição virar NaN), volta para casa.
let foraHa = 0;
function resgatar(dt) {
  const quebrado = !Number.isFinite(P.x) || !Number.isFinite(P.y);
  const visivel = !quebrado && tela.areas.some((a) => P.x > a.x - larguraPx() / 2 && P.x < a.x + a.w + larguraPx() / 2 && P.y > a.y && P.y < a.y + a.h + alturaPx());
  foraHa = visivel ? 0 : foraHa + dt;
  if (quebrado || foraHa > 3) {
    console.warn(`[resgate] pet sumiu (estado=${P.estado}, x=${P.x}, y=${P.y}); voltando para casa`);
    Object.assign(P, { x: tela.casa.x, y: tela.casa.y, ancora: { ...tela.casa }, bilhete: null });
    foraHa = 0;
    mudar("acenando", 2);
  }
}

function atualizar(dt) {
  if (!segurado && P.estado !== "buscar" && P.estado !== "arrastando") resgatar(dt);
  P.tempo -= dt;
  P.tAnim += dt;

  if (segurado) {
    P.x = cursor.x - segurado.dx;
    P.y = cursor.y - segurado.dy;
    window.Vida?.segurando(dt); // percebe se a pessoa está chacoalhando
    return;
  }
  if (window.Vida?.atualizar(dt)) return; // queda, tontura, bravo, comer, brincar, menu

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
      const m = mao();
      // perseguindo, ele vai a qualquer lugar da tela (topo, barra de tarefas...), não só no "chão"
      // os pés podem sair da tela (a mão fica acima dos pés; senão o mouse na borda de baixo fica fora de alcance)
      const alvo = {
        x: Math.max(limites().min - larguraPx() / 2, Math.min(limites().max + larguraPx() / 2, P.x + (cursor.x - m.x))),
        y: Math.max(alturaPx() * 0.5, Math.min(tela.altura + alturaPx(), P.y + (cursor.y - m.y))),
      };
      // corre rápido, independente da velocidade do pet (senão um pet lento nunca alcança o mouse)
      const mult = Math.max(2.2, VEL_PERSEGUIR / velocidade());
      andarAte(alvo, dt, mult);
      const m2 = mao();
      if (Math.hypot(cursor.x - m2.x, cursor.y - m2.y) < RAIO_PEGAR || sobreOPet(cursor)) {
        console.info(`[mouse] peguei em ${(10 - P.tempo).toFixed(1)}s`);
        falar(escolha(["Peguei! 😈", "É meu agora!", "Hehe"]), 2);
        // o mouse não "pula" para a mão: fica onde foi mordido, e anda junto com ela
        const offset = { x: cursor.x - m2.x, y: cursor.y - m2.y };
        return mudar("segurando", rand(2.5, 4), { alvo: pontoAleatorio(), offset, cursorEsperado: { ...cursor } });
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
      const m = mao();
      const d = Math.hypot(cursor.x - m.x, cursor.y - m.y);
      if (d > 50) {
        const alvo = {
          x: Math.max(limites().min, Math.min(limites().max, P.x + (cursor.x - m.x))),
          y: Math.max(alturaPx() * 0.5, Math.min(tela.altura, P.y + (cursor.y - m.y))),
        };
        andarAte(alvo, dt, 1.6);
      } else P.olhando = cursor.x >= P.x ? 1 : -1;
      if (P.tempo <= 0) {
        P.x = limitarX(P.x);
        if (window.Vida?.precisaCair()) return Vida.cair();
        P.y = limitarY(P.y);
        proximoEstado();
      }
      return;
    }
    case "segurando": {
      // a pessoa puxou o mouse para longe (mais forte que o pet): ele solta
      const puxou = Math.hypot(cursor.x - P.cursorEsperado.x, cursor.y - P.cursorEsperado.y) > RAIO_SOLTAR;
      if (puxou) {
        console.info("[mouse] a pessoa puxou o mouse de volta");
        falar(escolha(["Ei! 😤", "Devolve!", "Tá bom, tá bom..."]), 2);
      }
      // corre em disparada para pontos aleatórios; chegando, escolhe outro
      if (!puxou && andarAte(P.alvo, dt, Math.max(1, VEL_ARRASTAR / velocidade()))) P.alvo = pontoAleatorio();
      const m = mao();
      const area = { w: tela.largura, h: tela.altura };
      P.cursorEsperado = {
        x: Math.max(0, Math.min(area.w - 1, m.x + P.offset.x)),
        y: Math.max(0, Math.min(area.h - 1, m.y + P.offset.y)),
      };
      if (!puxou) window.api.enviar("pet:moverCursor", P.cursorEsperado);
      if (puxou || P.tempo <= 0 || !pegarMouseLigado()) {
        P.x = limitarX(P.x);
        if (window.Vida?.precisaCair()) return Vida.cair();
        mudar("feliz", 1.2);
        P.y = limitarY(P.y); // se estava no topo/barra de tarefas, volta para o chão
      }
      return;
    }
    case "buscar":
      if (andarAte(P.alvo, dt, 1.3)) {
        mudar("parado", 99);
        const ladoInicial = P.lado;
        const lim = limites();
        window.api.invocar("bilhete:criar", { x: ladoInicial < 0 ? lim.min - 260 : lim.max + 20, y: P.y - 60 }).then((b) => {
          if (!b || P.estado !== "parado") return proximoEstado();
          P.bilhete = b;
          P.olhando = -ladoInicial;
          const { min, max } = limites();
          mudar("arrastando", 20, { alvo: { x: limitarX(rand(min + (max - min) * 0.25, min + (max - min) * 0.75)), y: P.y } });
        });
      } else if (P.tempo <= 0) proximoEstado();
      return;
    case "arrastando": {
      // anda de costas para dentro da tela, puxando o bilhete
      const olhar = P.olhando;
      const chegou = andarAte(P.alvo, dt, 0.7);
      P.olhando = olhar;
      moverBilhete();
      if (chegou || P.tempo <= 0 || !P.bilhete) {
        P.bilhete = null;
        falar(escolha(["Trouxe pra você!", "Um presente 💌", "Leia isso!"]), 2.5);
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
  const w = larguraPx();
  const h = alturaPx();
  return p.x > P.x - w / 2 - 4 && p.x < P.x + w / 2 + 4 && p.y > P.y - h - 4 && p.y < P.y + 4;
}

// botão direito no pet: menuzinho (comida, brincar, carinho)
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (sobreOPet(cursor)) window.Vida?.abrirMenu();
});

function atualizarCliques() {
  const deveIgnorar = !(segurado || sobreOPet(cursor) || window.Vida?.sobreMenu(cursor));
  if (deveIgnorar !== ignorando) {
    ignorando = deveIgnorar;
    window.api.enviar("pet:ignorar", ignorando);
  }
}

window.addEventListener("mousedown", (e) => {
  if (e.button === 0 && window.Vida?.cliqueNoMenu(cursor)) return;
  if (e.button !== 0 || !sobreOPet(cursor)) return;
  window.Vida?.pegou();
  segurado = { dx: cursor.x - P.x, dy: cursor.y - P.y, inicio: { ...cursor } };
  if (P.bilhete) P.bilhete = null;
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
    return mudar("feliz", 1.4);
  }
  P.x = limitarX(P.x);
  P.y = limitarY(Math.max(P.y, areaDe(P.x).y + alturaPx()));
  P.ancora = { x: P.x, y: P.y };
  falar(escolha(["Uhul!", "Ei! 😤", "De novo!"]), 1.8);
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
  const limite = limiteBalao != null && x < limiteBalao ? limiteBalao : tela.largura - 4;
  let bx = Math.max(4, Math.min(limite - w, x - w / 2));
  let by = Math.max(4, y - h - 12);
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
  ctx.clearRect(0, 0, tela.largura, tela.altura);
  if (!sprites.parado) return;

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

// Pets com "desenho": formas vetoriais suaves (vetor.js) em vez de pixel art.
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
  if (P.olhando < 0) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  try {
    vetor(ctx, { w, h, anim: P.anim, t: P.tAnim, relogio });
  } catch (e) {
    console.error("[vetor] falhou, voltando para a pixel art:", e);
    pet.desenho = null;
  }
  ctx.restore();
  desenharExtras(Math.round(P.y - h), dt);
}

function ajustarCanvas() {
  const r = window.devicePixelRatio || 1;
  cv.width = tela.largura * r;
  cv.height = tela.altura * r;
  cv.style.width = tela.largura + "px";
  cv.style.height = tela.altura + "px";
  ctx.setTransform(r, 0, 0, r, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// ---------- laço principal ----------
let ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min(0.05, (agora - ultimo) / 1000);
  ultimo = agora;
  relogio += dt;
  atualizar(dt);
  atualizarCliques();
  desenhar(dt);
  requestAnimationFrame(quadro);
}

async function trocarPet(novo) {
  pet = novo;
  await prepararSprites();
  P.fala = null;
  falar(`Oi! Eu sou ${pet.nome} 👋`, 3);
  mudar("acenando", 2);
}

window.api.ouvir("cursor", (c) => (cursor = c));
window.api.ouvir("config", (c) => {
  config = c;
  if (!config.passear && ["andar", "perseguir", "seguir", "segurando", "buscar", "arrastando"].includes(P.estado)) {
    P.bilhete = null;
    mudar("voltar", 20, { alvo: P.ancora || tela.casa });
  }
});
window.addEventListener("error", (e) => console.error("[overlay]", e.message, e.filename + ":" + e.lineno));
window.addEventListener("unhandledrejection", (e) => console.error("[overlay] promessa:", e.reason?.message || e.reason));
window.api.ouvir("tela", (t) => {
  const antiga = tela.casa;
  tela = t;
  ajustarCanvas();
  limiteBalao = t.painel ? t.painel.x - 6 : null;
  // a casa mudou (chat arrastado, aberto ou fechado): se ele estava em casa, vai junto
  const mudou = Math.hypot(antiga.x - t.casa.x, antiga.y - t.casa.y) > 1;
  const emCasa = P.ancora && Math.hypot(P.ancora.x - antiga.x, P.ancora.y - antiga.y) < 1;
  if (mudou && emCasa) P.ancora = { ...t.casa };
  const ocupado = segurado || ["perseguir", "segurando", "buscar", "arrastando", "travessura"].includes(P.estado);
  const foraDasTelas = !t.areas.some((a) => dentro(P, a));
  if (!segurado && foraDasTelas) chamarDeVolta(8, { ficar: false }); // a tela onde ele estava deixou de ser permitida
  else if (mudou && !ocupado && (Math.hypot(P.x - antiga.x, P.y - antiga.y) < 140 || !config.passear)) chamarDeVolta(8, { ficar: false });
  else if (!ocupado) {
    P.x = limitarX(P.x);
    P.y = limitarY(P.y);
  }
});
window.api.ouvir("pet:trocar", trocarPet);
window.api.ouvir("pet:voltar", () => {
  P.bilhete = null;
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
  if (["perseguir", "seguir", "segurando", "buscar", "arrastando"].includes(P.estado)) P.bilhete = null;
  if (P.humor) return proximoEstado();
  if (h === "falando") return mudar("acenando", 1.5);
  if (h === "feliz") return mudar("feliz", 1.5);
});

(async () => {
  const d = await window.api.invocar("inicio");
  config = d.config;
  tela = d.tela;
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
