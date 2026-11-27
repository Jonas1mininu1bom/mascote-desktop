// Hornet: comportamentos só dela. Em vez de pegar o mouse, ela luta com ele (o cursor ricocheteia
// pela tela a cada golpe); em vez de comer, enfrenta um Caranid (golpe ou pogo, e desce
// planando com a capa); chacoalhada, solta o Thread Storm.
// Usa o estado e as funções do overlay.js e do vida.js.
window.Hornet = (() => {
  const ativo = () => pet?.desenho === "hornet";
  const som = (n) => window.HornetSom?.[n]?.();
  const lerp = (a, b, k) => a + (b - a) * k;
  const esc = () => alturaPx() / 110; // tamanho dos efeitos e do inimigo acompanha o dela

  // ação de ataque em andamento (a pose do modelo 3D depende dela)
  function acao(tipo, dur, ataque) {
    P.acao = { tipo, inicio: relogio, fim: relogio + dur, ...ataque };
  }
  function acao3d() {
    if (!ativo() || !P.acao || relogio >= P.acao.fim) return null;
    const { tipo, inicio, mira, angulo, contato } = P.acao;
    return { tipo, t: relogio - inicio, mira, angulo, contato };
  }
  const planando = () => ativo() && P.estado === "planar" && P.abriu;

  // ---------- efeitos (cortes e faíscas) ----------
  let efeitos = [];
  function corte(x, y, ang) {
    efeitos.push({ tipo: "corte", x, y, ang, vida: 0.2, max: 0.2 });
  }
  function faiscas(x, y, cores, n = 9) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(120, 320) * esc();
      efeitos.push({ tipo: "faisca", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, vida: rand(0.3, 0.6), max: 0.6, cor: escolha(cores), tam: rand(2, 4.5) * esc() });
    }
  }

  // ---------- Thread Storm ----------
  function storm() {
    som("storm");
    som("hegale");
    acao("storm", 1.3);
    mudar("storm", 1.3);
  }
  // chacoalhada no ar: escapa da mão e solta o Thread Storm
  function chacoalhada() {
    segurado = null;
    storm();
  }
  function atualizarStorm() {
    if (inimigo?.vivo && Math.hypot(inimigo.x - P.x, inimigo.y - (P.y - alturaPx() * 0.4)) < raioStorm()) matar();
    if (P.tempo > 0) return;
    P.x = limitarX(P.x);
    if (window.Vida?.precisaCair()) return Vida.cair();
    P.y = limitarY(P.y);
    mudar("bravo", 2.5);
  }

  // Tocou o chão depois de cair ou planar: agacha e a capa assenta.
  function pousou() {
    acao("pouso", 0.45);
    som("pouso");
    if (Math.random() < 0.35) som("hm");
    mudar("parado", 0.9);
  }

  // ---------- combate com o mouse ----------
  const DIRECOES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  let numeroDuelo = 0;
  const dentroDoMonitor = (p, a) => Math.round(p.x) >= a.x && Math.round(p.x) < a.x + a.w &&
    Math.round(p.y) >= a.y && Math.round(p.y) < a.y + a.h;
  const monitorDoCursor = (p) => monitores().find((a) => dentroDoMonitor(p, a));
  function acertouMouse() {
    if (!monitorDoCursor(cursor)) return mudar("parado", 1);
    som("shaw");
    mudar("combate", rand(5, 6.5), {
      mouse: {
        id: `${performance.timeOrigin}:${++numeroDuelo}`, x: cursor.x, y: cursor.y,
        vx: 0, vy: 0, arrasto: 1.8, golpes: 0, direcoes: [...DIRECOES],
      },
    });
    prepararGolpeMouse();
    P.tempo += P.acao.contato; // O primeiro preparo não consome o tempo de duelo.
  }
  function prepararGolpeMouse() {
    const M = P.mouse;
    const horizontal = faixaDoCursor(M, "x", "y", "w", "h");
    const vertical = faixaDoCursor(M, "y", "x", "h", "w");
    if (!horizontal || !vertical) return;
    if (!M.direcoes.length) M.direcoes = [...DIRECOES];
    const forte = (M.golpes + 1) % 3 === 0;
    const espaco = [horizontal.max - M.x, vertical.max - M.y, M.x - horizontal.min, M.y - vertical.min];
    const comEspaco = M.direcoes.filter((d) => espaco[DIRECOES.indexOf(d)] > 70);
    const comRicochete = forte ? comEspaco.filter((d) => espaco[DIRECOES.indexOf(d)] < 440) : [];
    const direcao = escolha(comRicochete.length ? comRicochete : comEspaco.length ? comEspaco : M.direcoes);
    M.direcoes = M.direcoes.filter((d) => d !== direcao);
    const angulo = direcao + rand(-0.45, 0.45);
    const forca = forte ? rand(2300, 2750) : rand(1340, 1740);
    const pogo = direcao === Math.PI / 2 && M.y > P.y - alturaPx() * 0.42;
    M.golpe = { angulo, forca, forte, pogo };
    M.proxGolpe = relogio + (forte ? 1.05 : rand(0.47, 0.62));
    if (Math.abs(Math.cos(angulo)) > 0.45) P.olhando = Math.sign(Math.cos(angulo));
    acao(pogo ? "pogo" : "golpe", pogo ? 0.3 : 0.38, { angulo, mira: -Math.sin(angulo), contato: pogo ? 0.10 : 0.18 });
  }

  function atingirMouse(M) {
    const { angulo, forca, forte, pogo } = M.golpe;
    M.golpe = null;
    M.vx = Math.cos(angulo) * forca;
    M.vy = Math.sin(angulo) * forca;
    M.arrasto = forte ? 1.25 : 1.8;
    M.golpes++;
    // Mantém o quadro de contato mesmo se a atualização passou do instante exato.
    const atraso = relogio - (P.acao.inicio + P.acao.contato);
    P.acao.inicio += atraso;
    P.acao.fim += atraso;
    if (pogo) P.y -= 20 * esc();
    som("golpe");
    som("hit");
    if (forte) som("hup");
    corte(M.x, M.y, angulo);
    faiscas(M.x, M.y, ["#ffffff", "#f4e9c8", "#e8eef7"], forte ? 18 : 9);
    if (forte) corte(M.x, M.y, angulo + 0.65);
  }

  // Une trechos de monitores contíguos em cada eixo. Um vão é parede, a emenda entre telas não.
  function faixaDoCursor(p, eixo, outro, tamanho, outroTamanho) {
    const pixel = Math.round(p[eixo]);
    const linha = Math.round(p[outro]);
    const faixas = monitores()
      .filter((a) => linha >= a[outro] && linha < a[outro] + a[outroTamanho])
      .sort((a, b) => a[eixo] - b[eixo]);
    let min = Infinity, max = -Infinity;
    for (const a of faixas) {
      const inicio = a[eixo], fim = inicio + a[tamanho] - 1;
      if (inicio > max + 1) {
        if (pixel >= min && pixel <= max) return { min, max };
        if (inicio > pixel) return null;
        min = inicio;
        max = fim;
      } else max = Math.max(max, fim);
    }
    return pixel >= min && pixel <= max ? { min, max } : null;
  }

  function rebater(M, dt, eixo, outro, tamanho, outroTamanho) {
    const faixa = faixaDoCursor(M, eixo, outro, tamanho, outroTamanho);
    if (!faixa) return false;
    const { min, max } = faixa;
    const vel = "v" + eixo;
    // Na emenda, o pixel pode pertencer à faixa antes da coordenada fracionária.
    const inicio = Math.max(min, Math.min(M[eixo], max));
    const alvo = inicio + M[vel] * dt;
    const borda = Math.max(min, Math.min(alvo, max));
    M[eixo] = borda;
    if (borda === alvo) return false;
    M[eixo] = Math.max(min, Math.min(2 * borda - alvo, max));
    M[vel] *= -0.93;
    return true;
  }

  function encerrarCombate(id = P.mouse?.id) {
    if (P.estado !== "combate" || id !== P.mouse?.id) return;
    P.x = limitarX(P.x);
    if (window.Vida?.precisaCair()) return Vida.cair();
    P.y = limitarY(P.y);
    mudar("acenando", 1.6);
  }

  function atualizarCombate(dt) {
    const M = P.mouse;
    if (!M || P.tempo <= 0 || !pegarMouseLigado() || !monitorDoCursor(M)) return encerrarCombate();
    const atrito = Math.exp(-M.arrasto * dt);
    M.vx *= atrito;
    M.vy *= atrito;
    const rebateuX = rebater(M, dt, "x", "y", "w", "h");
    const rebateuY = rebater(M, dt, "y", "x", "h", "w");
    if (rebateuX || rebateuY) {
      const impacto = Math.hypot(M.vx, M.vy);
      faiscas(M.x, M.y, ["#e0b3be", "#fff5eb"], impacto > 950 ? 10 : 5);
      if (impacto > 950) corte(M.x, M.y, Math.atan2(M.vy, M.vx));
    }
    window.api.enviar("pet:moverCursor", { x: Math.round(M.x), y: Math.round(M.y), duelo: M.id, origem: tela.origem });
    if (!acao3d()) virarPara(M.x);
    // Mira pelo corpo: a ponta da agulha muda de lado ao animar e atrapalhava a perseguição.
    const alvo = prenderNaTela({ x: M.x, y: M.y + alturaPx() * 0.48 }, 0, alturaPx() * 0.5, alturaPx() * 0.42);
    andarAte(alvo, dt, Math.max(2.2, (VEL_PERSEGUIR + 170) / velocidade()), false);
    if (M.golpe && relogio >= P.acao.inicio + P.acao.contato) atingirMouse(M);
    if (!M.golpe && relogio >= M.proxGolpe && Math.hypot(alvo.x - P.x, alvo.y - P.y) < 53 * esc()) prepararGolpeMouse();
  }

  // ---------- inimigo (no lugar da comida) ----------
  // Caranid: besourinho voador em bola, que paira na altura do peito dela. x, y = centro do corpo.
  let inimigo = null; // { x, y, chao, dir, vivo, t, morte, vx, vy, giro }
  const alturaVoo = (I) => I.chao - alturaPx() * 0.5 + Math.sin(I.t * 3) * 10 * esc();
  function invocarInimigo() {
    if (inimigo?.vivo) return;
    const lado = Math.random() < 0.5 ? -1 : 1;
    let x = limitarX(P.x + lado * rand(170, 280) * esc());
    if (Math.abs(x - P.x) < 120) x = limitarX(P.x - lado * rand(170, 280) * esc());
    const chao = noChao() ? chaoDe(x) : P.y;
    inimigo = { x, y: chao - alturaPx() * 0.5 - 170, chao, dir: x > P.x ? -1 : 1, vivo: true, t: 0 }; // chega voando de cima
    mudar("cacar", 14);
  }
  function matar() {
    const I = inimigo;
    if (!I?.vivo) return;
    Object.assign(I, { vivo: false, morte: 0, vx: Math.sign(I.x - P.x || 1) * 160, vy: -380, giro: 0 });
    som("hit");
    som("morte");
    faiscas(I.x, I.y, ["#3a3742", "#6d6875", "#d9d6dc", "#ffffff"], 14);
  }
  function fisicaInimigo(dt) {
    const I = inimigo;
    I.t += dt;
    if (!I.vivo) {
      I.morte += dt;
      I.vy += 1500 * dt;
      I.x += I.vx * dt;
      I.y += I.vy * dt;
      I.giro += dt * 9;
      if (I.morte > 1.1) inimigo = null;
      return;
    }
    if (noChao()) I.chao = chaoDe(I.x);
    // desce até a altura do voo e fica zanzando de um lado para o outro, balançando
    I.y += (alturaVoo(I) - I.y) * Math.min(1, dt * 3);
    I.x += I.dir * 40 * esc() * dt;
    const { min, max } = limites();
    if (I.x < min + 30 || I.x > max - 30 || Math.random() < dt * 0.3) I.dir *= -1;
  }
  function atualizarCacar(dt) {
    const I = inimigo;
    if (!I?.vivo) return mudar("parado", 0.8);
    if (P.tempo <= 0) {
      inimigo = null; // fugiu
      return mudar("parado", 1);
    }
    const dx = I.x - P.x;
    const alcance = larguraPx() * 0.35 + 22 * esc();
    if (Math.abs(dx) > alcance + 12 || Math.abs(I.y - alturaVoo(I)) > 25) {
      const y = noChao() ? chaoDe(I.x) : I.chao;
      andarAte({ x: limitarX(I.x - Math.sign(dx || 1) * alcance), y }, dt, 2.4);
      return;
    }
    P.olhando = dx >= 0 ? 1 : -1;
    if (Math.random() < 0.5) {
      // golpe direto
      acao("golpe", 0.38);
      som("golpe");
      if (Math.random() < 0.6) som("ha");
      corte(I.x, I.y, dx >= 0 ? 0 : Math.PI);
      matar();
      mudar("acenando", 1.6);
    } else iniciarPogo();
  }

  // ---------- pogo: pula para trás e para cima, mergulha na diagonal (45°) com a agulha,
  // e ao acertar dá um mortal para trás, quica e desce planando com a capa ----------
  function iniciarPogo() {
    const lado = Math.sign(inimigo.x - P.x) || 1;
    P.olhando = lado;
    P.pogo = { x0: P.x, y0: P.y, t: 0, lado };
    acao("salto", 0.4);
    som("pulo");
    som("hup");
    mudar("pogo", 3);
  }
  function atualizarPogo(dt) {
    const G = P.pogo, I = inimigo;
    G.t += dt;
    const alvo = I?.vivo ? { x: I.x, y: I.y - 10 * esc() } : { x: G.x0 + G.lado * 120 * esc(), y: G.y0 - alturaPx() * 0.3 };
    const D = 150 * esc(); // distância da diagonal do mergulho
    const SUBIDA = 0.38;
    if (G.t < SUBIDA) {
      // sobe até um ponto em cima e atrás do alvo, na linha de 45°
      const k = G.t / SUBIDA, e = 1 - (1 - k) * (1 - k);
      const pico = { x: alvo.x - G.lado * (D + alturaPx() * 0.3), y: alvo.y - D - alturaPx() * 0.25 };
      P.x = lerp(G.x0, pico.x, k);
      P.y = lerp(G.y0, pico.y, e);
      return;
    }
    if (!G.mergulho) {
      G.mergulho = true;
      acao("pogo", 1);
      som("golpe");
      som("adino");
    }
    // mergulha guiando a ponta da agulha até o alvo (a linha já sai em ~45°)
    const ponta = mao();
    const dx = alvo.x - ponta.x, dy = alvo.y - ponta.y, d = Math.hypot(dx, dy);
    const passo = 1100 * esc() * dt;
    const chao = I ? I.chao : G.y0;
    if (d > 20 * esc() && G.t < SUBIDA + 0.6 && P.y < chao) {
      P.x += (dx / (d || 1)) * Math.min(passo, d);
      P.y += (dy / (d || 1)) * Math.min(passo, d);
      return;
    }
    if (I?.vivo && d <= 40 * esc()) {
      corte(alvo.x, alvo.y, Math.atan2(1, G.lado));
      matar();
    }
    // mortal para trás: quica para cima e para trás; a capa abre quando começa a cair
    mudar("planar", 8, { vy: -560, vx: -G.lado * 170, chaoAlvo: chao, abriu: false });
    acao("mortal", 0.82);
  }
  function atualizarPlanar(dt) {
    if (!P.abriu) {
      // no mortal ela "fica pendurada" no alto (gravidade menor); a capa só abre depois da volta
      const noMortal = P.acao?.tipo === "mortal" && relogio < P.acao.fim;
      P.vy += (noMortal ? 1000 : 1500) * dt;
      if (P.vy > 0 && !noMortal) {
        P.abriu = true;
        som("glide");
      }
    } else {
      P.vy += (85 - P.vy) * Math.min(1, dt * 4);
      P.vx += (P.olhando * 100 - P.vx) * Math.min(1, dt * 2);
    }
    P.x = limitarX(P.x + P.vx * dt);
    P.y += P.vy * dt;
    const chao = noChao() ? chaoDe(P.x) : P.chaoAlvo;
    if ((P.abriu && P.y >= chao) || P.tempo <= 0) {
      P.y = chao;
      P.ancora = { x: P.x, y: P.y };
      pousou();
    }
  }

  // ---------- andar como no jogo: corre e às vezes dá uma arrancada ----------
  function atualizarAndar(dt) {
    let mult = 1.3;
    if ((P.dashAte || 0) > relogio) mult = 3.4;
    else if (Math.random() < dt * 0.45) {
      P.dashAte = relogio + 0.3;
      acao("dash", 0.3);
      som("dash");
    }
    if (andarAte(P.alvo, dt, mult) || P.tempo <= 0) proximoEstado();
  }

  // ---------- laço ----------
  // física do inimigo e dos efeitos: roda sempre, mesmo se ela estiver fazendo outra coisa
  function passo(dt) {
    if (!ativo()) {
      inimigo = null;
      efeitos = [];
      return;
    }
    if (inimigo) fisicaInimigo(dt);
    for (const e of efeitos) {
      e.vida -= dt;
      if (e.tipo === "faisca") {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += 700 * dt;
      }
    }
    efeitos = efeitos.filter((e) => e.vida > 0);
  }
  // estados só da Hornet; devolve true se cuidou do quadro
  function atualizar(dt) {
    if (!ativo()) return false;
    switch (P.estado) {
      case "combate": atualizarCombate(dt); return true;
      case "cacar": atualizarCacar(dt); return true;
      case "pogo": atualizarPogo(dt); return true;
      case "planar": atualizarPlanar(dt); return true;
      case "storm": atualizarStorm(dt); return true;
      case "andar": atualizarAndar(dt); return true;
    }
    // foi interrompida (arrastada, carinho...) com o inimigo ainda vivo: volta para a caça
    if (inimigo?.vivo && ["parado", "feliz", "acenando"].includes(P.estado) && P.tempo <= 0) {
      mudar("cacar", 12);
      return true;
    }
    return false;
  }

  // ---------- desenho ----------
  // Caranid: bola cinza-escura com faixas e espinhos, máscara clara com duas pontinhas,
  // olhos pretos e dentinhos, e asas zumbindo dos lados
  function desenharInimigo() {
    const I = inimigo;
    // sombra no chão, que encolhe quanto mais alto ele voa
    const alto = Math.max(0, I.chao - I.y), k = Math.max(0.3, 1 - alto / 400);
    if (I.vivo) {
      ctx.save();
      ctx.fillStyle = "rgba(20,22,35,0.16)";
      ctx.beginPath();
      ctx.ellipse(I.x, I.chao, 20 * esc() * k, 6 * esc() * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // em 3D, como a Hornet; o desenho 2D abaixo fica de reserva (sem WebGL)
    const img = window.Pet3D?.desenharObjeto({ tipo: "caranid", x: I.x, y: I.y, tamPx: alturaPx() * 0.7, dir: I.dir, t: I.t, vivo: I.vivo, giro: I.giro || 0, dpr: window.devicePixelRatio || 1 });
    if (img) {
      ctx.save();
      if (!I.vivo) ctx.globalAlpha = Math.max(0, 1 - I.morte / 1.1);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img.canvas, img.x, img.y, img.w, img.h);
      ctx.restore();
      return;
    }
    const s = esc() * 1.25;
    ctx.save();
    ctx.translate(I.x, I.y);
    if (!I.vivo) {
      ctx.globalAlpha = Math.max(0, 1 - I.morte / 1.1);
      ctx.rotate(I.giro);
    }
    ctx.scale(I.dir * s, s);
    ctx.lineJoin = "round";
    // asas: borrões translúcidos batendo rápido
    if (I.vivo) {
      const bate = 0.55 + Math.abs(Math.sin(I.t * 45)) * 0.45;
      ctx.fillStyle = "rgba(215,215,222,0.55)";
      for (const lado of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(lado * 17, -8, 14, 7 * bate, lado * -0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = "#121216";
    ctx.lineWidth = 2;
    // espinhos curtos em volta
    ctx.fillStyle = "#26242c";
    for (const a of [0.5, 1.3, 2.2, 2.9, 4.0]) {
      const c = Math.cos(a), sn = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(c * 13 - sn * 3, sn * 13 + c * 3);
      ctx.lineTo(c * 20, sn * 20);
      ctx.lineTo(c * 13 + sn * 3, sn * 13 - c * 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // corpo em bola, com faixas
    const grad = ctx.createRadialGradient(-4, -6, 2, 0, 0, 16);
    grad.addColorStop(0, "#5a5662");
    grad.addColorStop(1, "#1e1c23");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(10,10,14,0.8)";
    ctx.lineWidth = 1.5;
    for (const r of [8, 12]) {
      ctx.beginPath();
      ctx.arc(-r * 0.6, 0, r, -1.1, 1.1);
      ctx.stroke();
    }
    // máscara clara virada para a frente, com duas pontinhas para cima
    ctx.fillStyle = "#d8d5dc";
    ctx.strokeStyle = "#121216";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-1, -6);
    ctx.lineTo(-4, -17);
    ctx.lineTo(3, -10);
    ctx.lineTo(10, -10);
    ctx.lineTo(16, -17);
    ctx.quadraticCurveTo(17, -6, 15, 2);
    ctx.quadraticCurveTo(10, 10, 4, 8);
    ctx.quadraticCurveTo(-2, 6, -1, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#101014";
    for (const [ex, ang] of [[4, 0.3], [11, -0.3]]) {
      ctx.beginPath();
      ctx.ellipse(ex, -3, 2.3, 3.2, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    // dentinhos
    ctx.strokeStyle = "#101014";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(3, 3.5);
    for (let i = 1; i <= 5; i++) ctx.lineTo(3 + i * 2, i % 2 ? 5.5 : 3.5);
    ctx.stroke();
    ctx.restore();
  }
  // Thread Storm: laços enormes de seda brilhante em volta dela (como no jogo, várias vezes a altura dela)
  const raioStorm = () => alturaPx() * 1.5;
  function desenharFios() {
    const t = relogio - P.acao.inicio;
    const cresce = Math.min(1, t / 0.18), some = t > 1.0 ? Math.max(0, 1 - (t - 1.0) / 0.3) : 1;
    const cx = P.x, cy = P.y - alturaPx() * 0.4, R = raioStorm() * (0.4 + 0.6 * cresce);
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 14;
    // dois "nós" de seda (curvas de Lissajous) girando e se desenhando como um rastro
    for (const [a, b, fase, vel, giro] of [[3, 2, 0, 9, 1.6], [2, 3, 1.7, -7, -1.1]]) {
      const rot = t * giro;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const ini = t * vel, comp = 2.2 + 3.6 * cresce;
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const u = ini + (i / 90) * comp;
        const x = Math.sin(a * u + fase) * R, y = Math.sin(b * u) * R * 0.85;
        const px = cx + x * cos - y * sin, py = cy + x * sin + y * cos;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.globalAlpha = 0.95 * some;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(3, alturaPx() * 0.035);
      ctx.stroke();
    }
    ctx.restore();
  }
  function desenhar() {
    if (!ativo()) return;
    if (inimigo) desenharInimigo();
    if (P.acao?.tipo === "storm" && relogio < P.acao.fim) desenharFios();
    ctx.save();
    for (const e of efeitos) {
      const a = Math.max(0, e.vida / e.max);
      if (e.tipo === "corte") {
        // meia-lua branca do golpe
        const r = 30 * esc();
        ctx.globalAlpha = a;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 + 5 * a;
        ctx.beginPath();
        ctx.arc(e.x - Math.cos(e.ang) * r * 0.6, e.y - Math.sin(e.ang) * r * 0.6, r, e.ang - 1.1, e.ang + 1.1);
        ctx.stroke();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = e.cor;
        ctx.fillRect(e.x - e.tam / 2, e.y - e.tam / 2, e.tam, e.tam);
      }
    }
    ctx.restore();
  }

  return { ativo, pousou, acertouMouse, encerrarCombate, chacoalhada, storm, invocarInimigo, passo, atualizar, desenhar, acao3d, planando, som };
})();
