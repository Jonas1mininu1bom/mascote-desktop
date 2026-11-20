// O "cérebro" do pet: estados, movimento e desenho.
const cv = document.getElementById("tela");
const ctx = cv.getContext("2d");

let pet, config, tela, mouseNativo;
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
};
function animacao(nome) {
  if (sprites[nome]) return nome;
  for (const r of RESERVA[nome] || []) if (sprites[r]) return r;
  return "parado";
}

// ---------- estados ----------
function mudar(estado, tempo, extra = {}) {
  P.estado = estado;
  P.tempo = tempo;
  Object.assign(P, extra);
  const anim = { andar: "andando", perseguir: "correndo", buscar: "andando", voltar: "andando" }[estado] || estado;
  if (P.anim !== anim) P.tAnim = 0;
  P.anim = anim;
}

function falar(texto, segundos = 3.5) {
  P.fala = { texto, ate: relogio + segundos };
}

function limitarX(x) {
  const m = larguraPx() / 2;
  return Math.max(m, Math.min(tela.largura - m, x));
}
function limitarY(y) {
  return Math.max(tela.area.y + alturaPx(), Math.min(tela.area.y + tela.area.h, y));
}

function pontoAleatorio() {
  return { x: limitarX(rand(0, tela.largura)), y: limitarY(rand(tela.area.y + tela.area.h * 0.15, tela.area.y + tela.area.h)) };
}

function proximoEstado() {
  if (P.humor === "pensando") return mudar("pensando", 999);
  if (P.humor === "trabalhando") return mudar("trabalhando", 999, { alvo: { x: limitarX(P.x + rand(-40, 40)), y: P.y } });

  const r = Math.random();
  if (!config.passear) {
    const a = P.ancora || tela.casa;
    if (r < 0.5) return mudar("parado", rand(3, 7));
    if (r < 0.62) return mudar("acenando", 1.6);
    if (r < 0.9) return mudar("andar", 6, { alvo: { x: limitarX(a.x + rand(-60, 60)), y: a.y } });
    if (r < 0.96) return mudar("dormindo", rand(6, 12));
    falar(escolha(pet.falas.length ? pet.falas : ["🙂"]));
    return mudar("parado", 3.5);
  }

  if (config.bagunca && mouseNativo && r < 0.12) return mudar("perseguir", 7);
  if (config.bagunca && r < 0.2) {
    const lado = P.x < tela.largura / 2 ? -1 : 1;
    const x = lado < 0 ? larguraPx() / 2 - larguraPx() * 0.6 : tela.largura - larguraPx() / 2 + larguraPx() * 0.6;
    return mudar("buscar", 15, { alvo: { x, y: limitarY(rand(tela.area.y + 220, tela.area.y + tela.area.h)) }, lado });
  }
  if (r < 0.45) return mudar("parado", rand(2, 5));
  if (r < 0.85) return mudar("andar", 12, { alvo: pontoAleatorio() });
  if (r < 0.92) return mudar("dormindo", rand(6, 12));
  falar(escolha(pet.falas.length ? pet.falas : ["🙂"]));
  return mudar("parado", 3.5);
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

function atualizar(dt) {
  P.tempo -= dt;
  P.tAnim += dt;

  if (segurado) {
    P.x = cursor.x - segurado.dx;
    P.y = cursor.y - segurado.dy;
    return;
  }

  switch (P.estado) {
    case "andar":
    case "voltar":
      if (andarAte(P.alvo, dt) || P.tempo <= 0) {
        if (P.estado === "voltar") P.ancora = { ...tela.casa };
        proximoEstado();
      }
      return;
    case "trabalhando":
      if (andarAte(P.alvo, dt, 1.4)) P.alvo = { x: limitarX(P.x + rand(-40, 40)), y: P.y };
      return;
    case "perseguir": {
      const m = mao();
      const alvo = { x: P.x + (cursor.x - m.x), y: P.y + (cursor.y - m.y) };
      if (andarAte(alvo, dt, 2.2)) {
        falar(escolha(["Peguei! 😈", "É meu agora!", "Hehe"]), 2);
        return mudar("segurando", rand(2.5, 4.5), { alvo: pontoAleatorio() });
      }
      if (P.tempo <= 0) {
        falar("Ufa, cansei...", 2);
        proximoEstado();
      }
      return;
    }
    case "segurando": {
      andarAte(P.alvo, dt, 0.9);
      const m = mao();
      window.api.enviar("pet:moverCursor", { x: m.x, y: m.y });
      if (P.tempo <= 0) mudar("feliz", 1.2);
      return;
    }
    case "buscar":
      if (andarAte(P.alvo, dt, 1.3)) {
        mudar("parado", 99);
        const ladoInicial = P.lado;
        window.api.invocar("bilhete:criar", { x: ladoInicial < 0 ? -260 : tela.largura + 20, y: P.y - 60, conteudo: escolha(pet.bilhetes.length ? pet.bilhetes : [{ texto: "Oi!" }]) }).then((b) => {
          if (!b || P.estado !== "parado") return proximoEstado();
          P.bilhete = b;
          P.olhando = -ladoInicial;
          mudar("arrastando", 20, { alvo: { x: limitarX(rand(tela.largura * 0.25, tela.largura * 0.75)), y: P.y } });
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

function atualizarCliques() {
  const deveIgnorar = !(segurado || sobreOPet(cursor));
  if (deveIgnorar !== ignorando) {
    ignorando = deveIgnorar;
    window.api.enviar("pet:ignorar", ignorando);
  }
}

window.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || !sobreOPet(cursor)) return;
  segurado = { dx: cursor.x - P.x, dy: cursor.y - P.y, inicio: { ...cursor } };
  if (P.bilhete) P.bilhete = null;
  mudar("carregado", 999);
});

window.addEventListener("mouseup", () => {
  if (!segurado) return;
  const moveu = Math.hypot(cursor.x - segurado.inicio.x, cursor.y - segurado.inicio.y) > 5;
  segurado = null;
  if (!moveu) {
    // clique: carinho!
    for (let i = 0; i < 5; i++) coracoes.push({ x: P.x + rand(-15, 15), y: P.y - alturaPx(), vy: rand(30, 60), vx: rand(-15, 15), vida: 1.4 });
    if (Math.random() < 0.4 && pet.falas.length) falar(escolha(pet.falas));
    if (P.humor === "pensando" || P.humor === "trabalhando") return mudar(P.humor, 999);
    return mudar("feliz", 1.4);
  }
  P.y = Math.max(P.y, tela.area.y + alturaPx());
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
  let bx = Math.max(4, Math.min((limiteBalao ?? tela.largura - 4) - w, x - w / 2));
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

  const topo = dy;
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
  if (!config.passear && ["andar", "perseguir", "segurando", "buscar", "arrastando"].includes(P.estado)) {
    P.bilhete = null;
    mudar("voltar", 20, { alvo: P.ancora || tela.casa });
  }
});
window.api.ouvir("tela", (t) => {
  tela = t;
  ajustarCanvas();
  P.x = limitarX(P.x);
  P.y = limitarY(P.y);
});
window.api.ouvir("pet:trocar", trocarPet);
window.api.ouvir("pet:voltar", () => mudar("voltar", 30, { alvo: { ...tela.casa } }));
window.api.ouvir("bilhete:fechado", (id) => {
  if (P.bilhete?.id === id) P.bilhete = null;
});
let limiteBalao = null; // não deixa o balão ficar atrás do chat aberto
window.api.ouvir("chat:estado", ({ aberto, esquerda }) => {
  limiteBalao = aberto ? esquerda - 6 : null;
  const antiga = { ...tela.casa };
  tela.casa.x = esquerda - 50;
  const perto = Math.hypot(P.x - antiga.x, P.y - antiga.y) < 120;
  if (perto && !segurado && !["perseguir", "segurando", "buscar", "arrastando"].includes(P.estado)) {
    mudar("voltar", 10, { alvo: { ...tela.casa } });
  } else if (P.ancora && Math.hypot(P.ancora.x - antiga.x, P.ancora.y - antiga.y) < 1) {
    P.ancora = { ...tela.casa };
  }
});
window.api.ouvir("pet:humor", (h) => {
  if (segurado) return;
  if (P.estado === "voltar") {
    // termina de andar até o chat; o humor entra quando chegar
    P.humor = h === "pensando" || h === "trabalhando" ? h : null;
    return;
  }
  P.humor = h === "pensando" || h === "trabalhando" ? h : null;
  if (["perseguir", "segurando", "buscar", "arrastando"].includes(P.estado)) P.bilhete = null;
  if (P.humor) return proximoEstado();
  if (h === "falando") return mudar("acenando", 1.5);
  if (h === "feliz") return mudar("feliz", 1.5);
});

(async () => {
  const d = await window.api.invocar("inicio");
  config = d.config;
  tela = d.tela;
  mouseNativo = d.mouseNativo;
  ajustarCanvas();
  P.x = tela.casa.x;
  P.y = tela.casa.y;
  P.ancora = { ...tela.casa };
  await trocarPet(d.pet);
  requestAnimationFrame(quadro);
})();
