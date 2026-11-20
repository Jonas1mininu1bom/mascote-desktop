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
  // lado: para onde fica o meio do rosto (1 = direita, -1 = esquerda). A sobrancelha brava desce para lá.
  function olho(g, x, y, r, s, cor = "#2b2d42", lado = 1) {
    if (s.modoOlho === "espiral") {
      // tonto: olho em espiral girando
      g.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.3) {
        const rr = (a / (Math.PI * 4)) * r * 1.2;
        const ang = a + (s.relogio || 0) * 8;
        const px = x + Math.cos(ang) * rr;
        const py = y + Math.sin(ang) * rr;
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.strokeStyle = cor;
      g.lineWidth = 1.2;
      g.stroke();
      return;
    }
    if (s.modoOlho === "bravo") {
      // sobrancelha franzida: alta do lado de fora, baixa do lado do meio do rosto
      linha(g, x - lado * r * 1.3, y - r * 2.1, x + lado * r * 1.3, y - r * 1.15, cor, 1.6);
    }
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
    const pulo =
      s.anim === "feliz" || s.anim === "carregado"
        ? Math.abs(Math.sin(s.t * 7)) * 5
        : s.anim === "bravo"
          ? Math.abs(Math.sin(s.t * 12)) * 2.5 // batendo o pé
          : 0;
    const respira = Math.sin(s.t * 2.2) * 0.6;
    // pisca pelo relógio geral (o t da animação zera a cada troca de estado)
    const pisca = s.anim !== "dormindo" && (s.relogio ?? s.t) % 3.7 > 3.58;
    const caindo = s.anim === "caindo";
    return {
      passo: caindo ? Math.sin(s.t * 18) * 0.5 : passo, // pernas balançando no ar
      quique,
      pulo,
      respira,
      olhosFechados: s.anim === "dormindo" || (pisca && !["tonto", "bravo"].includes(s.anim)),
      anda,
      modoOlho: s.anim === "tonto" ? "espiral" : s.anim === "bravo" ? "bravo" : null,
      mastiga: s.anim === "comendo" && Math.sin(s.t * 11) > 0,
      relogio: s.relogio ?? s.t,
      anim: s.anim,
    };
  }

  // ---------- Visual 3D ----------
  // Volume falso, sem 3D de verdade: cada parte é pintada como um tubo ou uma esfera iluminada,
  // com luz vindo sempre do alto à esquerda da TELA, sombra de contato no chão e as partes de trás
  // mais escuras. Custa quase o mesmo que o desenho 2D (nenhuma biblioteca, nada pré-renderizado).
  // s.espelhado diz se o overlay virou o desenho, para a luz não trocar de lado quando ele vira.
  const luzX = (s) => (s.espelhado ? 1 : -1); // lado da luz no espaço do desenho

  // sombra no chão que encolhe e clareia quando ele sobe (pulo, queda)
  function sombra3d(g, x, y, larg, altura = 0) {
    const k = Math.max(0.45, 1 - altura / 60);
    const gr = g.createRadialGradient(x, y, 0, x, y, larg * k);
    gr.addColorStop(0, `rgba(20,22,35,${0.32 * k})`);
    gr.addColorStop(0.6, `rgba(20,22,35,${0.14 * k})`);
    gr.addColorStop(1, "rgba(20,22,35,0)");
    g.save();
    g.translate(x, y);
    g.scale(1, 0.28);
    g.translate(-x, -y);
    g.beginPath();
    g.arc(x, y, larg * k, 0, TAU);
    g.fillStyle = gr;
    g.fill();
    g.restore();
  }

  // tubo iluminado ao longo de um caminho já montado com caminho(g)
  function tubo(g, caminho, largura, cores, s, fundo = false) {
    const [borda, base, brilho] = cores;
    const lx = luzX(s);
    g.lineCap = "round";
    g.lineJoin = "round";
    caminho(g);
    g.strokeStyle = borda;
    g.lineWidth = largura + 1.6;
    g.stroke();
    caminho(g);
    g.strokeStyle = base;
    g.lineWidth = largura;
    g.stroke();
    // reflexo fino deslocado para o lado da luz
    g.save();
    g.translate(lx * largura * 0.22, -largura * 0.22);
    caminho(g);
    g.strokeStyle = brilho;
    g.globalAlpha = fundo ? 0.25 : 0.55;
    g.lineWidth = largura * 0.32;
    g.stroke();
    g.restore();
  }

  // esfera com gradiente radial, contorno e ponto de brilho
  function esfera(g, x, y, rx, ry, cores, s, contorno = 1.4) {
    const [clara, media, escura, borda] = cores;
    const lx = luzX(s);
    const gr = g.createRadialGradient(x + lx * rx * 0.38, y - ry * 0.42, rx * 0.08, x, y, Math.max(rx, ry) * 1.05);
    gr.addColorStop(0, clara);
    gr.addColorStop(0.55, media);
    gr.addColorStop(1, escura);
    oval(g, x, y, rx, ry);
    pintar(g, gr, borda, contorno);
    oval(g, x + lx * rx * 0.42, y - ry * 0.5, rx * 0.22, ry * 0.14, lx * -0.5);
    pintar(g, "rgba(255,255,255,0.75)");
  }

  function olho3d(g, x, y, r, s, lado) {
    if (s.modoOlho || s.olhosFechados) return olho(g, x, y, r, s, "#23253a", lado);
    oval(g, x, y, r * 0.9, r * 1.1);
    const gr = g.createRadialGradient(x, y - r * 0.4, 0, x, y, r * 1.2);
    gr.addColorStop(0, "#4a4f73");
    gr.addColorStop(1, "#151624");
    pintar(g, gr);
    oval(g, x - luzX(s) * -r * 0.3, y - r * 0.45, r * 0.36, r * 0.36);
    pintar(g, "#ffffff");
    oval(g, x - r * 0.25, y + r * 0.45, r * 0.15, r * 0.15);
    pintar(g, "rgba(255,255,255,0.6)");
  }

  // ---------- Palito 3D ----------
  function palito3d(g, s) {
    const { w, h } = s;
    const r = ritmo(s);
    r.espelhado = s.espelhado;
    g.scale(w / 64, h / 96);
    const sobe = -r.quique - r.pulo;
    sombra3d(g, 32, 93.5, 17, -sobe + (s.anim === "caindo" ? 30 : 0));
    const MEMBRO = ["#14151f", "#363a55", "#9aa0c8"];
    const MEMBRO_TRAS = ["#0f1018", "#262838", "#6b7092"];
    const MAO = ["#7d82a8", "#3a3e5a", "#1d1f2e", "#14151f"];
    const quadril = { x: 32, y: 68 + sobe };
    // pernas: a de trás primeiro e mais escura
    const pernas = [-1, 1].map((lado) => {
      const desloc = r.passo * 9 * lado;
      const pe = { x: 32 + lado * 6 + desloc, y: 91.5 - Math.max(0, r.passo * lado) * 3 };
      return { lado, pe, joelho: { x: (quadril.x + pe.x) / 2 + 2.5, y: (quadril.y + pe.y) / 2 } };
    });
    for (const { lado, pe, joelho } of pernas) {
      const tras = lado < 0;
      tubo(g, (c) => { c.beginPath(); c.moveTo(quadril.x, quadril.y); c.quadraticCurveTo(joelho.x, joelho.y, pe.x, pe.y); }, 4, tras ? MEMBRO_TRAS : MEMBRO, r, tras);
      // sapato: meia esfera achatada
      esfera(g, pe.x + 2.5, pe.y + 0.2, 4.8, 2.7, tras ? ["#5b5f80", "#25273a", "#111219", "#0d0e14"] : MAO, r, 1);
    }
    g.translate(0, sobe);
    const ombro = { x: 32, y: 47 };
    const balanca = r.passo * 7;
    const acena = ["acenando", "travessura"].includes(s.anim);
    const maoTras = s.anim === "caindo" ? { x: 22, y: 30 } : { x: 14 - balanca * 0.4, y: 58 + Math.abs(balanca) * 0.2 };
    const maoFrente = s.anim === "caindo"
      ? { x: 43, y: 30 }
      : acena
        ? { x: 47 + Math.sin(s.t * 12) * 4, y: 32 }
        : s.anim === "feliz"
          ? { x: 48, y: 36 }
          : { x: 50 + balanca * 0.4, y: 58 - Math.abs(balanca) * 0.2 };
    const braco = (m, tras) => {
      tubo(g, (c) => { c.beginPath(); c.moveTo(ombro.x, ombro.y); c.quadraticCurveTo((ombro.x + m.x) / 2, (ombro.y + m.y) / 2 + 3, m.x, m.y); }, 3.6, tras ? MEMBRO_TRAS : MEMBRO, r, tras);
      esfera(g, m.x, m.y, 3, 3, tras ? ["#5b5f80", "#25273a", "#111219", "#0d0e14"] : MAO, r, 1);
    };
    braco(maoTras, true);
    // tronco: tubo mais grosso
    tubo(g, (c) => { c.beginPath(); c.moveTo(32, 40); c.lineTo(32, 68); }, 4.6, MEMBRO, r);
    // cachecol: ponta balançando atrás + volta no pescoço
    const vento = r.anda ? Math.sin(s.t * r.anda) * 2.5 : Math.sin((s.relogio || 0) * 2) * 0.8;
    const caindo = s.anim === "caindo" ? -6 : 0;
    g.beginPath();
    g.moveTo(28, 40);
    g.quadraticCurveTo(22, 44 + caindo, 17 - (r.anda ? 3 : 0), 47 + vento + caindo);
    g.lineTo(15.5 - (r.anda ? 3 : 0), 52 + vento + caindo);
    g.quadraticCurveTo(22, 49 + caindo, 29, 44);
    g.closePath();
    const grPonta = g.createLinearGradient(15, 40, 29, 52);
    grPonta.addColorStop(0, "#9e1f3c");
    grPonta.addColorStop(1, "#d93a5c");
    pintar(g, grPonta, "#6e1229", 1.1);
    const grCach = g.createLinearGradient(0, 36, 0, 44);
    grCach.addColorStop(0, "#ff7a95");
    grCach.addColorStop(0.45, "#ef476f");
    grCach.addColorStop(1, "#a3203f");
    g.beginPath();
    g.ellipse(32.5, 40, 9.5, 3.6, 0, 0, TAU);
    pintar(g, grCach, "#6e1229", 1.1);
    linha(g, 26, 39, 39, 39.4, "rgba(255,255,255,0.35)", 0.9);
    // cabeça: esfera branca com sombra própria
    const cy = s.anim === "dormindo" ? 25 : 22;
    esfera(g, 33, cy, 16, 15.5 + r.respira * 0.2, ["#ffffff", "#eceef5", "#aeb2c6", "#23253a"], r, 2);
    // luz de borda fria do lado da sombra
    g.save();
    oval(g, 33, cy, 16, 15.5);
    g.clip();
    const rx = 33 - luzX(r) * 15, ry = cy + 8;
    const borda = g.createRadialGradient(rx, ry, 0, rx, ry, 12);
    borda.addColorStop(0, "rgba(150,175,255,0.22)");
    borda.addColorStop(1, "rgba(150,175,255,0)");
    oval(g, rx, ry, 12, 12);
    pintar(g, borda);
    g.restore();
    olho3d(g, 31, cy - 2, 2.5, r, 1);
    olho3d(g, 41, cy - 2, 2.5, r, -1);
    bochecha(g, 27, cy + 4, 3.2);
    bochecha(g, 44, cy + 4, 3.2);
    g.beginPath();
    if (r.mastiga) oval(g, 36, cy + 6, 2.6, 2.2);
    else if (s.anim === "comendo") g.arc(36, cy + 6, 2.2, 0, TAU);
    else if (s.anim === "bravo" || s.anim === "tonto") g.arc(36, cy + 9.5, 3.4, 1.15 * Math.PI, 1.85 * Math.PI);
    else if (s.anim === "pensando") oval(g, 36, cy + 6, 1.6, 1.8);
    else if (s.anim === "dormindo") g.arc(36, cy + 7, 1.4, 0, TAU);
    else g.arc(36, cy + 3.5, 3.6, 0.2 * Math.PI, 0.8 * Math.PI);
    g.strokeStyle = "#d63a60";
    g.lineWidth = 1.7;
    g.lineCap = "round";
    g.stroke();
    // braço da frente por cima de tudo
    braco(maoFrente, false);
  }


  // ---------- Pato 3D ----------
  // Pato gordinho de óculos escuros, com a mesma luz/volume do Palito 3D, gingado de pato no
  // andar e uma dancinha (desfile, volta no lugar e rebolado de asas abertas).
  function pato3d(g, s) {
    const { w, h } = s;
    const r = ritmo(s);
    r.espelhado = s.espelhado;
    g.scale(w / 64, h / 64);
    const danca = s.anim === "dancando";
    const plana = !!s.planando; // caindo com as asas abertas (no lugar do paraquedas)
    const andando = !danca && !plana && r.anda > 0;

    // ---- pose do momento ----
    // A dança segue o vídeo de referência em 3 partes (ciclo de 5,1 s):
    //  1) desfile: passos marcados levantando bem os pés, asas um pouco abertas;
    //  2) dá uma volta no lugar (gira) sem parar de marchar;
    //  3) rebola de um lado para o outro com as asas abertas e a cabeça inclinando.
    // O andar é um gingado de pato: o corpo rola para o lado do pé que está no chão e o
    // pé que sobe vai para trás mostrando a sola.
    const pose = { lado: 0, rot: 0, giro: 1, quica: 0, asaFrente: null, asaTras: null, inclina: 0, bob: 0, pes: {} };
    const T = danca ? s.t % 5.1 : 0;
    const marchar = (freq, alto) => {
      const p = Math.sin(T * TAU * freq);
      pose.rot = p * 0.1 + 0.05;
      pose.quica = Math.abs(p) * 1.5;
      for (const ld of [-1, 1]) {
        const sobe = Math.max(0, p * ld);
        pose.pes[ld] = { levanta: sobe * alto, anda: p * ld * 3.5, ang: -sobe * 0.5 };
      }
      const bate = Math.sin(T * TAU * freq * 2);
      pose.asaFrente = 0.45 + bate * 0.2;
      pose.asaTras = -0.45 - bate * 0.2;
      pose.bob = Math.sin(T * TAU * freq * 2 + 0.6) * 1.4;
    };
    if (danca && T < 2.6) {
      marchar(1.25, 8);
      if (T >= 1.6) pose.giro = Math.cos(((T - 1.6) / 1.0) * TAU); // uma volta inteira
    } else if (danca) {
      const lado = Math.sin((T - 2.6) * TAU);
      pose.lado = lado;
      pose.rot = lado * 0.15;
      pose.quica = Math.abs(Math.sin((T - 2.6) * TAU * 2)) * 2.4;
      const flap = Math.sin(T * TAU * 3) * 0.22;
      pose.asaFrente = 1.15 + flap + Math.max(0, lado) * 0.3;
      pose.asaTras = -0.85 - flap - Math.max(0, -lado) * 0.3;
      pose.inclina = -lado * 0.22;
      pose.bob = Math.sin((T - 2.6) * TAU * 2 + 0.6) * 1.6;
      for (const ld of [-1, 1]) pose.pes[ld] = { levanta: Math.max(0, -lado * ld) * 2.5, anda: lado * 2, ang: 0 };
    } else if (andando) {
      pose.rot = r.passo * 0.12;
      for (const ld of [-1, 1]) {
        const sobe = Math.max(0, -r.passo * ld);
        pose.pes[ld] = { levanta: sobe * 5.5, anda: r.passo * 5 * ld, ang: sobe * 0.7 };
      }
    }
    const lado = pose.lado;
    const quica = pose.quica;
    const sobe = -r.quique - r.pulo - quica;
    sombra3d(g, 32 + lado * 2, 62.5, 19 * (0.75 + 0.25 * Math.abs(pose.giro)), -sobe + (s.anim === "caindo" ? 30 : 0));
    // girando: espelha tudo em volta do meio (fica fininho no meio da volta)
    g.translate(32, 0);
    g.scale(Math.abs(pose.giro) < 0.12 ? 0.12 * Math.sign(pose.giro || 1) : pose.giro, 1);
    g.translate(-32, 0);

    const AMARELO = ["#fff7c2", "#ffd84d", "#e3a614", "#a8780f"];
    const LARANJA = ["#ffc58a", "#ff9a2e", "#d4691a", "#9c4a0f"];
    // pés grandes e chatos de pato
    for (const [px, ld] of [[25, -1], [39, 1]]) {
      const pe = pose.pes[ld] || { levanta: plana ? 5 : 0, anda: plana ? -4 : 0, ang: plana ? 0.5 : 0 };
      const fx = px + pe.anda + lado * 2.5;
      const fy = 61.5 - pe.levanta;
      tubo(g, (c) => { c.beginPath(); c.moveTo(px + lado * 3, 53 + sobe * 0.6); c.lineTo(fx, fy); }, 2.8, ["#9c4a0f", "#f08a26", "#ffd0a0"], r, ld < 0);
      g.save();
      g.translate(fx, fy);
      g.rotate(pe.ang);
      g.beginPath();
      g.moveTo(-3.5, 0.8);
      g.quadraticCurveTo(3, -3.2, 8.5, 0.6);
      g.quadraticCurveTo(7, 2.4, 5.5, 1.6);
      g.quadraticCurveTo(4, 3, 2, 2.2);
      g.quadraticCurveTo(-1, 3, -3.5, 0.8);
      const gp = g.createLinearGradient(0, -3, 0, 2.5);
      gp.addColorStop(0, ld < 0 ? "#e8892c" : "#ffb04a");
      gp.addColorStop(1, "#c0560e");
      pintar(g, gp, "#8a3f0c", 1);
      g.restore();
    }

    g.save();
    // gira o corpo todo em volta dos pés (gingado/rebolado), quica e achata um pouco ao "pousar"
    g.translate(32, 60);
    g.rotate(pose.rot + (plana ? 0.18 + Math.sin(s.t * 3) * 0.05 : 0));
    const achata = danca ? 1 - Math.max(0, Math.cos(T * TAU * 2.5)) * 0.05 : 1;
    g.scale(2 - achata, achata);
    g.translate(-32 + lado * 2.5, -60 + sobe);

    // asa de trás (aparece do outro lado do corpo)
    const abreTras = plana || pose.asaTras != null;
    g.save();
    g.translate(40, 40);
    g.rotate(plana ? -0.9 + Math.sin(s.t * 3) * 0.08 : pose.asaTras ?? 0.35);
    oval(g, abreTras ? 7 : 3, -2, abreTras ? (plana ? 15 : 11) : 8, 5.2);
    pintar(g, "#d9a31a", "#a8780f", 1.1);
    g.restore();
    // rabinho
    g.beginPath();
    g.moveTo(16, 40);
    g.quadraticCurveTo(6, 34, 8, 29);
    g.quadraticCurveTo(13, 34, 20, 36);
    pintar(g, "#f2c233", "#a8780f", 1.2);
    // corpo gordinho
    esfera(g, 31, 43 + r.respira * 0.3, 18, 15.5 + r.respira * 0.3, AMARELO, r, 1.6);
    oval(g, 34, 49, 11, 6.5);
    pintar(g, "rgba(255,250,215,0.55)");
    // cabeça (balança contra o corpo, no contratempo)
    const bob = pose.bob;
    const inclina = pose.inclina;
    const cabY = (s.anim === "dormindo" ? 24 : 21) + bob;
    g.save();
    g.translate(38, cabY);
    g.rotate(inclina);
    g.translate(-38, -cabY);
    // topetinho
    for (const [x, a] of [[33, -0.5], [36, -0.15]]) {
      g.save();
      g.translate(x, cabY - 11.5);
      g.rotate(a + (danca ? Math.sin(T * TAU * 2.5) * 0.25 : 0));
      oval(g, 0, -2.5, 1.8, 3.6);
      pintar(g, "#ffd84d", "#a8780f", 1);
      g.restore();
    }
    esfera(g, 38, cabY, 13, 12.5, AMARELO, r, 1.6);
    // bico largo de pato
    const by = cabY + 4;
    const abre = r.mastiga ? 3 : danca && Math.sin(T * TAU * 2.5) > 0.7 ? 1.5 : 0; // "canta" na batida
    g.beginPath();
    g.moveTo(47, by - 3);
    g.bezierCurveTo(56, by - 5.5, 62, by - 3, 61.5, by + 0.5);
    g.bezierCurveTo(60, by + 1.5, 52, by + 1.5, 47, by + 1);
    g.closePath();
    const gb = g.createLinearGradient(0, by - 5, 0, by + 1.5);
    gb.addColorStop(0, LARANJA[0]);
    gb.addColorStop(0.5, LARANJA[1]);
    gb.addColorStop(1, LARANJA[2]);
    pintar(g, gb, LARANJA[3], 1.2);
    g.beginPath();
    g.moveTo(47, by + 1 + abre * 0.3);
    g.bezierCurveTo(53, by + 2 + abre, 59, by + 1.5 + abre, 60, by + 1 + abre * 0.6);
    g.bezierCurveTo(56, by + 4.5 + abre, 50, by + 4.5 + abre, 47, by + 3 + abre * 0.5);
    g.closePath();
    pintar(g, "#e0761c", LARANJA[3], 1.1);
    oval(g, 54, by - 2.8, 4, 0.9, -0.08);
    pintar(g, "rgba(255,255,255,0.45)");
    // bochecha
    bochecha(g, 44, by + 4, 2.6);
    // óculos escuros (no lugar dos olhos); bravo ganha sobrancelha, tonto fica torto
    g.save();
    if (s.anim === "tonto") {
      g.translate(44, cabY - 3);
      g.rotate(Math.sin((s.relogio || 0) * 6) * 0.35);
      g.translate(-44, -cabY + 3);
    }
    linha(g, 31, cabY - 4.5, 38, cabY - 3.5, "#1b1c26", 1.4); // haste
    const lente = (x, larg) => {
      g.beginPath();
      g.roundRect(x, cabY - 7, larg, 6.5, [1.5, 1.5, 3.2, 3.2]);
      const gl = g.createLinearGradient(x, cabY - 7, x + larg, cabY - 0.5);
      gl.addColorStop(0, "#4b4f6b");
      gl.addColorStop(0.5, "#16171f");
      gl.addColorStop(1, "#2a2c3d");
      pintar(g, gl, "#0b0c12", 1.1);
      // reflexo diagonal
      g.save();
      g.clip();
      linha(g, x + larg * 0.25, cabY - 0.5, x + larg * 0.65, cabY - 7, "rgba(255,255,255,0.45)", 1.3);
      g.restore();
    };
    lente(38, 7.5);
    lente(46.5, 6.5);
    linha(g, 45.5, cabY - 5.5, 46.5, cabY - 5.5, "#0b0c12", 1.4); // ponte
    if (s.anim === "bravo") {
      linha(g, 39, cabY - 10, 45, cabY - 7.5, "#7a5208", 1.6);
      linha(g, 53, cabY - 10, 48, cabY - 7.5, "#7a5208", 1.6);
    }
    g.restore();
    g.restore();

    // asa da frente: na dança sobe e desce no ritmo, oposta à de trás
    const bate = plana
      ? 1.0 + Math.sin(s.t * 3) * 0.08
      : pose.asaFrente != null
      ? pose.asaFrente
      : s.anim === "caindo"
        ? Math.sin(s.t * 22) * 0.6 - 0.4
        : ["acenando", "feliz", "travessura"].includes(s.anim)
          ? Math.sin(s.t * 14) * 0.5 - 0.3
          : r.anda ? Math.sin(s.t * 9) * 0.08 : 0;
    g.save();
    g.translate(24, 39);
    g.rotate(-0.2 + bate);
    if (plana) {
      // asa aberta: comprida, com as penas da ponta separadas
      esfera(g, -8, 3, 17, 6.5, ["#fff3a8", "#f7c832", "#d39a14", "#a8780f"], r, 1.3);
      for (const [dx, dy] of [[-24, 1.5], [-22, 5], [-19, 8]]) {
        oval(g, dx, dy, 4, 1.8, 0.2);
        pintar(g, "#f2bd2a", "#a8780f", 1);
      }
      linha(g, -18, 4, 0, 4.5, "rgba(168,120,15,0.5)", 0.9);
    } else {
      esfera(g, 3, 3, 10.5, 6.8, ["#fff3a8", "#f7c832", "#d39a14", "#a8780f"], r, 1.3);
      linha(g, -2, 4, 7, 5.5, "rgba(168,120,15,0.5)", 0.9);
      linha(g, -1, 6.5, 6, 7.5, "rgba(168,120,15,0.4)", 0.9);
    }
    g.restore();
    g.restore();
  }


  // ---------- Tartaruga 3D ----------
  // Tartaruguinha de cabeção redondo e casco marrom em placas. Dormindo, caindo ou tonta
  // (chacoalhada) ela recolhe cabeça, patas e rabo para dentro do casco.
  function tartaruga3d(g, s) {
    const { w, h } = s;
    const r = ritmo(s);
    r.espelhado = s.espelhado;
    g.scale(w / 80, h / 48);
    const escondida = ["dormindo", "caindo", "tonto"].includes(s.anim);
    const k = escondida ? Math.min(1, s.t * 5) : 0; // quanto já entrou no casco (0..1)
    const fora = escondida ? 1 - k : 1;
    const sobe = escondida ? 0 : -r.quique * 0.5 - r.pulo * 0.6;
    sombra3d(g, 40, 46.5, 30, -sobe + (s.anim === "caindo" ? 30 : 0));
    const PELE = ["#e6f7a8", "#9fd65a", "#5f9e2c", "#3f7419"];
    const PELE_TRAS = ["#c9e48a", "#86bd47", "#4d8423", "#335f14"];
    const desce = escondida ? k * 4 : 0; // casco encosta no chão quando ela se esconde

    // patas (4 toquinhos que andam em pares cruzados), encolhem para dentro
    if (fora > 0.05) {
      for (const [x, fase, tras] of [[24, 1, true], [52, -1, true], [30, -1, false], [58, 1, false]]) {
        const d = r.passo * 3.5 * fase * fora;
        const px = 40 + (x - 40) * (0.75 + 0.25 * fora) + d;
        const py = 41 + (1 - fora) * 4 - Math.max(0, r.passo * fase) * 1.5;
        esfera(g, px, py, 5.2 * fora + 1, 5 * fora + 0.5, tras ? PELE_TRAS : PELE, r, 1.2);
        if (!tras && fora > 0.6) {
          for (const dx of [-2, 0, 2]) {
            oval(g, px + dx, py + 3.4, 0.6, 0.6);
            pintar(g, "rgba(63,116,25,0.6)");
          }
        }
      }
    }
    g.translate(0, sobe + desce);
    // rabinho
    if (fora > 0.2) {
      g.beginPath();
      g.moveTo(15, 34);
      g.quadraticCurveTo(15 - 9 * fora, 36, 15 - 8 * fora, 39);
      g.quadraticCurveTo(13, 38.5, 17, 38);
      pintar(g, PELE[1], PELE[3], 1.1);
    }
    // cabeça: sai de baixo da frente do casco
    const balanço = r.anda ? Math.sin(s.t * 9) * 0.8 : 0;
    const hx = 57 + 9 * fora;
    const hy = 31 - 4 * fora + balanço;
    if (fora > 0.05) {
      // pescoço
      tubo(g, (c) => { c.beginPath(); c.moveTo(54, 35); c.quadraticCurveTo(58 + 4 * fora, 33, hx - 4 * fora, hy + 4 * fora); }, 7 * fora + 2, [PELE[3], PELE[1], PELE[0]], r);
    }
    // barriga (plastrão) creme aparecendo embaixo do casco
    oval(g, 39, 37.5, 25, 4.6);
    const gbar = g.createLinearGradient(0, 33, 0, 42);
    gbar.addColorStop(0, "#fbe9b7");
    gbar.addColorStop(1, "#d9b878");
    pintar(g, gbar, "#a9874a", 1.2);
    // casco: domo marrom com borda clara e placas
    g.beginPath();
    g.moveTo(11, 36);
    g.bezierCurveTo(10, 6, 66, 4, 66, 36);
    g.closePath();
    const lx = luzX(r);
    const gc = g.createRadialGradient(38 + lx * 9, 13, 2, 38, 26, 32);
    gc.addColorStop(0, "#e9ad6c");
    gc.addColorStop(0.5, "#b8692e");
    gc.addColorStop(1, "#6e3814");
    pintar(g, gc, "#4f280d", 1.7);
    g.save();
    g.clip();
    // placas: hexágono do meio + vizinhas
    const hexa = (cx, cy, rr) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = cx + Math.cos(a) * rr * 1.25;
        const py = cy + Math.sin(a) * rr * 0.8;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = "rgba(255,220,170,0.10)";
      g.fill();
      g.strokeStyle = "rgba(70,34,10,0.75)";
      g.lineWidth = 1.3;
      g.stroke();
    };
    hexa(38, 20, 7);
    for (const [cx, cy] of [[22, 27], [54, 27], [30, 9], [46, 9], [38, 33], [14, 18], [62, 18]]) hexa(cx, cy, 7);
    g.restore();
    // borda clara do casco
    g.beginPath();
    g.moveTo(10, 35);
    g.quadraticCurveTo(38, 40.5, 67, 35);
    g.quadraticCurveTo(68, 38.5, 64, 39);
    g.quadraticCurveTo(38, 43.5, 12, 39);
    g.quadraticCurveTo(8.5, 38, 10, 35);
    const gb = g.createLinearGradient(0, 34, 0, 42);
    gb.addColorStop(0, "#f0c98f");
    gb.addColorStop(1, "#b98549");
    pintar(g, gb, "#6e4416", 1.2);
    // brilho no casco
    oval(g, 38 + lx * 10, 15, 7, 2.4, lx * 0.3);
    pintar(g, "rgba(255,240,215,0.4)");
    // cabeça por cima do casco (o pescoço ficou atrás)
    if (fora > 0.05) {
      const rc = 4 + 9 * fora;
      esfera(g, hx, hy, rc, rc * 0.95, PELE, r, 1.5);
      if (fora > 0.7) {
        const sR = { ...r };
        olho3d(g, hx - 1, hy - 1.5, 2.3, sR, 1);
        olho3d(g, hx + 6.5, hy - 1.5, 1.9, sR, -1);
        if (s.anim === "bravo") {
          linha(g, hx - 4, hy - 6.5, hx + 1.5, hy - 4.6, "#2f5512", 1.5);
          linha(g, hx + 9, hy - 6.2, hx + 5, hy - 4.6, "#2f5512", 1.5);
        }
        bochecha(g, hx - 3.5, hy + 3.2, 2.2);
        bochecha(g, hx + 8.5, hy + 3, 1.8);
        g.beginPath();
        if (r.mastiga) oval(g, hx + 3, hy + 4, 1.9, 1.7);
        else if (s.anim === "bravo") g.arc(hx + 3, hy + 6.2, 2.2, 1.2 * Math.PI, 1.8 * Math.PI);
        else g.arc(hx + 3, hy + 2, 2.4, 0.2 * Math.PI, 0.8 * Math.PI);
        g.strokeStyle = "#2f5512";
        g.lineWidth = 1.2;
        g.lineCap = "round";
        g.stroke();
      }
    }
    // escondida: buraco escuro na frente; dormindo, os olhinhos fechados espiam lá de dentro
    if (escondida && k > 0.6) {
      oval(g, 62, 33.5, 4.6, 3.2);
      pintar(g, "#2a1606");
      if (s.anim === "dormindo") {
        g.beginPath();
        g.arc(61.2, 33, 1.1, 0.15 * Math.PI, 0.85 * Math.PI);
        g.arc(63.6, 33, 1.1, 0.15 * Math.PI, 0.85 * Math.PI);
        g.strokeStyle = "#9fd65a";
        g.lineWidth = 0.9;
        g.stroke();
      } else if (s.anim === "tonto") {
        for (const ex of [60.8, 63.4]) {
          oval(g, ex, 33.3, 0.9, 0.9);
          pintar(g, "#ffffff");
        }
      }
    }
  }

  pato3d.danca = true; // a dança já vem no desenho (os outros só balançam, pelo overlay)
  // Reserva para quando o WebGL não funciona: desenho com volume (sem three.js).
  window.Vetor = { palito: palito3d, pato: pato3d, tartaruga: tartaruga3d };
})();
