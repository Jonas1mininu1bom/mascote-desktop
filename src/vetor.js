// Desenho "fofinho" dos pets padrão: formas vetoriais suaves com contorno fino, sombreado leve,
// sombra macia no chão e pernas animadas (no estilo de desenho dos pets de desktop modernos).
// Cada função desenha o pet olhando para a DIREITA numa caixa w×h, com os pés em y = h.
// O overlay cuida de posicionar e espelhar.
(() => {
  const TAU = Math.PI * 2;

  // ---------- utilidades ----------
  function oval(g, x, y, rx, ry, rot = 0) {
    g.beginPath();
    g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  }
  function pintar(g, cor, contorno, largura = 1.6) {
    if (cor) {
      g.fillStyle = cor;
      g.fill();
    }
    if (contorno) {
      g.strokeStyle = contorno;
      g.lineWidth = largura;
      g.stroke();
    }
  }
  function linha(g, x1, y1, x2, y2, cor, largura) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokeStyle = cor;
    g.lineWidth = largura;
    g.lineCap = "round";
    g.stroke();
  }
  // sombra macia: três elipses translúcidas umas sobre as outras
  function sombra(g, x, y, larg) {
    for (const [k, a] of [[1, 0.05], [0.8, 0.07], [0.55, 0.08]]) {
      oval(g, x, y, larg * k, larg * 0.22 * k);
      g.fillStyle = `rgba(30,34,32,${a})`;
      g.fill();
    }
  }
  function olho(g, x, y, r, s, cor = "#2b2d42") {
    if (s.olhosFechados) {
      g.beginPath();
      g.arc(x, y - r * 0.3, r, 0.15 * Math.PI, 0.85 * Math.PI);
      g.strokeStyle = cor;
      g.lineWidth = 1.4;
      g.lineCap = "round";
      g.stroke();
      return;
    }
    oval(g, x, y, r * 0.85, r);
    pintar(g, cor);
    oval(g, x + r * 0.3, y - r * 0.35, r * 0.32, r * 0.32);
    pintar(g, "#ffffff");
  }
  function bochecha(g, x, y, r) {
    oval(g, x, y, r, r * 0.6);
    pintar(g, "rgba(255,140,160,0.55)");
  }

  // Estado de animação compartilhado: passo das pernas, balanço do corpo, piscar...
  function ritmo(s) {
    const anda = { andando: 9, arrastando: 6, correndo: 15, segurando: 15, trabalhando: 15 }[s.anim] || 0;
    const fase = s.t * anda;
    const passo = anda ? Math.sin(fase) : 0;
    const quique = anda ? Math.abs(Math.sin(fase)) * (anda > 10 ? 2.2 : 1.4) : 0;
    const pulo = s.anim === "feliz" || s.anim === "carregado" ? Math.abs(Math.sin(s.t * 7)) * 5 : 0;
    const respira = Math.sin(s.t * 2.2) * 0.6;
    // pisca pelo relógio geral (o t da animação zera a cada troca de estado)
    const pisca = s.anim !== "dormindo" && (s.relogio ?? s.t) % 3.7 > 3.58;
    return { passo, quique, pulo, respira, olhosFechados: s.anim === "dormindo" || pisca, anda };
  }

  // ---------- Pato ----------
  function pato(g, s) {
    const { w, h } = s;
    const r = ritmo(s);
    const k = w / 64; // tudo foi desenhado numa caixa 64×64
    g.scale(k, h / 64);
    sombra(g, 32, 62.5, 20);
    const sobe = -r.quique - r.pulo;
    // pernas e pés (atrás do corpo)
    for (const [lado, cor] of [[1, "#e06a12"], [-1, "#ff8a1f"]]) {
      const desloc = r.passo * 5 * lado;
      const quadril = { x: 30 + lado * 3, y: 52 + sobe };
      const pe = { x: 30 + lado * 3 + desloc, y: 61.5 - Math.max(0, -r.passo * lado) * 2.5 };
      linha(g, quadril.x, quadril.y, pe.x, pe.y, cor, 2.6);
      g.beginPath();
      g.moveTo(pe.x - 3, pe.y + 0.5);
      g.quadraticCurveTo(pe.x + 4, pe.y - 2.5, pe.x + 7, pe.y + 1);
      g.quadraticCurveTo(pe.x + 2, pe.y + 2.5, pe.x - 3, pe.y + 0.5);
      pintar(g, cor, "#c0560e", 1);
    }
    g.translate(0, sobe);
    const contorno = "#c99a1c";
    // rabinho
    g.beginPath();
    g.moveTo(14, 36);
    g.quadraticCurveTo(4, 30, 6, 26);
    g.quadraticCurveTo(12, 30, 18, 33);
    pintar(g, "#ffd84d", contorno);
    // corpo
    oval(g, 30, 41 + r.respira * 0.3, 20, 14.5 + r.respira * 0.3);
    pintar(g, "#ffd84d", contorno);
    // barriga mais clara
    oval(g, 33, 46, 13, 7);
    pintar(g, "#ffe88a");
    // pescoço + cabeça
    oval(g, 41, 30, 7, 9);
    pintar(g, "#ffd84d");
    const cabY = s.anim === "dormindo" ? 25 : 20;
    oval(g, 43, cabY, 11.5, 11);
    pintar(g, "#ffd84d", contorno);
    oval(g, 41, 31, 6.2, 7.5);
    pintar(g, "#ffd84d"); // esconde a emenda do contorno
    // asa (bate quando acena ou está feliz)
    const bate = ["acenando", "feliz", "travessura"].includes(s.anim) ? Math.sin(s.t * 14) * 0.5 - 0.3 : r.anda ? Math.sin(s.t * 9) * 0.08 : 0;
    g.save();
    g.translate(24, 37);
    g.rotate(-0.25 + bate);
    oval(g, 2, 3, 11, 7);
    pintar(g, "#f5c531", contorno, 1.3);
    g.restore();
    // bico
    const by = cabY + 3;
    g.beginPath();
    g.moveTo(52, by - 3.5);
    g.quadraticCurveTo(62, by - 3, 62, by + 0.5);
    g.quadraticCurveTo(58, by + 3.5, 52, by + 3);
    g.closePath();
    pintar(g, "#ff9a2e", "#d4691a", 1.2);
    linha(g, 53, by + 0.3, 60, by + 0.6, "#d4691a", 0.9);
    // rosto
    olho(g, 46, cabY - 3, 2.4, r);
    bochecha(g, 47.5, cabY + 3.5, 2.8);
  }

  // ---------- Palito ----------
  function palito(g, s) {
    const { w, h } = s;
    const r = ritmo(s);
    g.scale(w / 64, h / 96);
    sombra(g, 32, 94.5, 15);
    const tinta = "#2b2d42";
    const sobe = -r.quique - r.pulo;
    // pernas
    const quadril = { x: 32, y: 68 + sobe };
    for (const lado of [-1, 1]) {
      const desloc = r.passo * 9 * lado;
      const pe = { x: 32 + lado * 6 + desloc, y: 92 - Math.max(0, r.passo * lado) * 3 };
      const joelho = { x: (quadril.x + pe.x) / 2 + 2, y: (quadril.y + pe.y) / 2 };
      g.beginPath();
      g.moveTo(quadril.x, quadril.y);
      g.quadraticCurveTo(joelho.x, joelho.y, pe.x, pe.y);
      g.strokeStyle = tinta;
      g.lineWidth = 3.4;
      g.lineCap = "round";
      g.stroke();
      oval(g, pe.x + 2.5, pe.y + 0.5, 4.5, 2.4);
      pintar(g, tinta);
    }
    g.translate(0, sobe);
    // corpo
    linha(g, 32, 40, 32, 68, tinta, 3.6);
    // braços (o da frente acena)
    const ombro = { x: 32, y: 47 };
    const balanca = r.passo * 7;
    const acena = ["acenando", "travessura"].includes(s.anim);
    const maoTras = { x: 14 - balanca * 0.4, y: 58 + Math.abs(balanca) * 0.2 };
    const maoFrente = acena
      ? { x: 47 + Math.sin(s.t * 12) * 4, y: 32 }
      : s.anim === "feliz"
        ? { x: 48, y: 36 }
        : { x: 50 + balanca * 0.4, y: 58 - Math.abs(balanca) * 0.2 };
    for (const m of [maoTras, maoFrente]) {
      g.beginPath();
      g.moveTo(ombro.x, ombro.y);
      g.quadraticCurveTo((ombro.x + m.x) / 2, (ombro.y + m.y) / 2 + 3, m.x, m.y);
      g.strokeStyle = tinta;
      g.lineWidth = 3.2;
      g.lineCap = "round";
      g.stroke();
      oval(g, m.x, m.y, 2.6, 2.6);
      pintar(g, tinta);
    }
    // cabeça
    const cy = s.anim === "dormindo" ? 25 : 22;
    oval(g, 33, cy, 16, 15.5 + r.respira * 0.2);
    pintar(g, "#ffffff", tinta, 2.4);
    olho(g, 31, cy - 2, 2.3, r, tinta);
    olho(g, 41, cy - 2, 2.3, r, tinta);
    bochecha(g, 27, cy + 4, 3.2);
    bochecha(g, 44, cy + 4, 3.2);
    // boca: sorriso (ou "o" pensando, ou boquinha de dormir)
    g.beginPath();
    if (s.anim === "pensando") oval(g, 36, cy + 6, 1.6, 1.8);
    else if (s.anim === "dormindo") g.arc(36, cy + 7, 1.4, 0, TAU);
    else g.arc(36, cy + 3.5, 3.6, 0.2 * Math.PI, 0.8 * Math.PI);
    g.strokeStyle = "#ef476f";
    g.lineWidth = 1.6;
    g.lineCap = "round";
    g.stroke();
  }

  // ---------- Tartaruga ----------
  function tartaruga(g, s) {
    const { w, h } = s;
    const r = ritmo(s);
    g.scale(w / 80, h / 48);
    sombra(g, 40, 46.5, 28);
    const pele = "#a7d36a";
    const peleBorda = "#6f9a3e";
    const sobe = -r.quique * 0.5 - r.pulo * 0.6;
    // pernas (4 toquinhos que andam em pares cruzados)
    for (const [x, fase, atras] of [[22, 1, true], [52, -1, true], [28, -1, false], [58, 1, false]]) {
      const d = r.passo * 3.5 * fase;
      oval(g, x + d, 42.5 - Math.max(0, r.passo * fase) * 1.5, 5, 4.2);
      pintar(g, atras ? "#93bf58" : pele, peleBorda, 1.3);
    }
    g.translate(0, sobe);
    // rabinho
    g.beginPath();
    g.moveTo(12, 36);
    g.quadraticCurveTo(4, 38, 5, 40);
    g.quadraticCurveTo(10, 40, 15, 39);
    pintar(g, pele, peleBorda, 1.2);
    // cabeça (recolhe um pouco dormindo)
    const recolhe = s.anim === "dormindo" ? -6 : 0;
    const balanço = r.anda ? Math.sin(s.t * 9) * 0.8 : 0;
    const hx = 69 + recolhe;
    const hy = 28 + balanço;
    oval(g, hx - 7, hy + 6, 8, 5.5);
    pintar(g, pele, peleBorda, 1.3);
    oval(g, hx, hy, 9.5, 8.5);
    pintar(g, pele, peleBorda, 1.5);
    olho(g, hx + 3.5, hy - 2, 2.1, r);
    bochecha(g, hx + 5, hy + 3, 2.2);
    g.beginPath();
    g.arc(hx + 4.5, hy + 1.5, 2.6, 0.15 * Math.PI, 0.7 * Math.PI);
    g.strokeStyle = "#3d5a1f";
    g.lineWidth = 1.1;
    g.stroke();
    // casco: borda clara + domo verde com placas
    oval(g, 36, 38, 27, 5.5);
    pintar(g, "#f1d27a", "#b8963a", 1.3);
    g.beginPath();
    g.moveTo(10, 38);
    g.bezierCurveTo(10, 12, 62, 12, 62, 38);
    g.closePath();
    const grad = g.createLinearGradient(0, 14, 0, 38);
    grad.addColorStop(0, "#5cc08a");
    grad.addColorStop(1, "#2f8f63");
    pintar(g, grad, "#1f6f4c", 1.6);
    g.save();
    g.clip();
    g.strokeStyle = "rgba(20,80,55,0.55)";
    g.lineWidth = 1.2;
    for (const [x, y, rx, ry] of [[36, 26, 8, 6], [21, 31, 6, 5], [51, 31, 6, 5]]) {
      oval(g, x, y, rx, ry);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fill();
      g.stroke();
    }
    g.restore();
    // brilho no casco
    oval(g, 28, 21, 7, 2.6, -0.3);
    pintar(g, "rgba(255,255,255,0.35)");
  }

  window.Vetor = { pato, palito, tartaruga };
})();
