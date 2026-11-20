// "Vida" do pet: cair de paraquedas, ficar tonto/bravo quando chacoalhado e o menuzinho
// (botão direito) para dar comida e brincar. Usa o estado e as funções do overlay.js.
window.Vida = (() => {
  const GRAVIDADE = 1500; // px/s²
  const VEL_PARAQUEDAS = 85; // px/s descendo com o paraquedas aberto
  const ALTURA_PARAQUEDAS = 90; // de quantos px de altura ele já abre o paraquedas
  const COMIDAS = { pato: "🍞", palito: "🍕", tartaruga: "🥬" };

  let bravoAte = 0; // até quando ele fica emburrado (recusa carinho)
  let depoisDeCair = null; // "tonto" se caiu depois de ser chacoalhado
  let fome = 30;
  let ultimaQueixa = 0;
  const chacoalho = { amostras: [], ultimo: null, viradas: [], tonto: false };
  let menu = null; // { x, y, itens, ate }
  let comida = null; // { x, y, vy, chao, mordidas, emoji }
  let bola = null; // { x, y, vx, vy, chao, giro }

  const ESTADOS = ["caindo", "tonto", "bravo", "comendo", "brincando"];
  // o Pato não usa paraquedas: abre as asas e plana, indo para a frente
  const plana = () => pet.desenho === "pato";
  const ocioso = () => ["parado", "andar", "acenando", "dormindo", "feliz", "dancando"].includes(P.estado);
  const chao = () => chaoDe(P.x);
  const coracao = (n = 5) => {
    for (let i = 0; i < n; i++) coracoes.push({ x: P.x + rand(-15, 15), y: P.y - alturaPx(), vy: rand(30, 60), vx: rand(-15, 15), vida: 1.4 });
  };

  // ---------- queda ----------
  function precisaCair() {
    return noChao() && P.y < chao() - 4;
  }
  function cair(vx = 0, vy = 0) {
    mudar("caindo", 30);
    Object.assign(P, { vx, vy, quedaInicio: P.y, paraquedas: 0, aberto: false });
  }
  function atualizarQueda(dt) {
    const c = chao();
    if (!P.aberto) {
      P.vy += GRAVIDADE * dt;
      // abre o paraquedas se ainda tem bastante chão pela frente
      if (P.y - P.quedaInicio > 40 && c - P.y > ALTURA_PARAQUEDAS * 0.6) P.aberto = true;
    } else {
      P.paraquedas = Math.min(1, P.paraquedas + dt * 3);
      P.vy += (VEL_PARAQUEDAS - P.vy) * Math.min(1, dt * 4);
      if (plana()) P.vx += (P.olhando * 110 - P.vx) * Math.min(1, dt * 2); // plana para a frente
      else P.vx += Math.sin(relogio * 1.8) * 25 * dt; // balança com o vento
    }
    if (!(P.aberto && plana())) P.vx *= 1 - Math.min(1, dt * (P.aberto ? 1.2 : 0.4));
    P.x = limitarX(P.x + P.vx * dt);
    P.y += P.vy * dt;
    if (Math.abs(P.vx) > 20) P.olhando = P.vx > 0 ? 1 : -1;
    if (P.y < c) return;
    // pousou
    P.y = c;
    const pancada = !P.aberto && P.vy > 900;
    P.paraquedas = 0;
    P.ancora = { x: P.x, y: P.y };
    if (depoisDeCair === "tonto" || pancada) {
      depoisDeCair = null;
      return ficarTonto();
    }
    if (P.aberto) falar(escolha(plana() ? ["Quá! Pouso de pato!", "Voei!", "Quem precisa de paraquedas?"] : ["Ufa! 🪂", "Pouso perfeito!", "Que vista!"]), 2);
    mudar(P.aberto ? "feliz" : "parado", P.aberto ? 1.4 : 0.6);
  }

  // ---------- chacoalhar ----------
  function pegou() {
    Object.assign(chacoalho, { ultimo: { ...cursor }, viradas: [], sinal: { x: 0, y: 0 }, tonto: false });
    fecharMenu();
  }
  // Conta "viradas" bruscas de direção enquanto ele está no ar: 5 em ~1,5 s = chacoalhão.
  function segurando(dt) {
    if (!chacoalho.ultimo || dt <= 0) return;
    const vx = (cursor.x - chacoalho.ultimo.x) / dt;
    const vy = (cursor.y - chacoalho.ultimo.y) / dt;
    chacoalho.ultimo = { ...cursor };
    for (const [eixo, v] of [["x", vx], ["y", vy]]) {
      if (Math.abs(v) < 600) continue;
      const s = Math.sign(v);
      if (chacoalho.sinal[eixo] && s !== chacoalho.sinal[eixo]) chacoalho.viradas.push(relogio);
      chacoalho.sinal[eixo] = s;
    }
    chacoalho.viradas = chacoalho.viradas.filter((t) => relogio - t < 1.5);
    if (!chacoalho.tonto && chacoalho.viradas.length >= 5) {
      chacoalho.tonto = true;
      falar(escolha(["Aaaaah!", "Para, para, paraaa!", "Tô ficando tonto!"]), 1.5);
    }
    if (chacoalho.tonto) P.anim = "tonto";
  }
  // Devolve true se cuidou de tudo (queda/tontura); false deixa o overlay seguir como antes.
  function soltou(moveu) {
    const tonto = chacoalho.tonto;
    chacoalho.tonto = false;
    chacoalho.ultimo = null;
    if (precisaCair() && (moveu || tonto)) {
      depoisDeCair = tonto ? "tonto" : null;
      cair();
      return true;
    }
    if (tonto) {
      P.x = limitarX(P.x);
      P.y = limitarY(P.y);
      ficarTonto();
      return true;
    }
    return false;
  }
  function ficarTonto() {
    falar(escolha(["Tudo girando... 😵‍💫", "Ui... onde eu tô?", "Vejo estrelinhas..."]), 2.5);
    mudar("tonto", 3);
  }
  function ficarBravo() {
    bravoAte = relogio + 25;
    P.olhando = cursor.x >= P.x ? 1 : -1;
    falar(escolha(["Para de me chacoalhar! 😠", "Hmph! Não gostei!", "Tô bravo com você! 😤"]), 3);
    mudar("bravo", 5);
  }
  function carinhoRecusado() {
    if (relogio >= bravoAte) return false;
    falar(escolha(["Hmph! 😤", "Não quero carinho agora.", "Ainda tô bravo..."]), 1.8);
    mudar("bravo", 1.5);
    return true;
  }

  // ---------- menu ----------
  function abrirMenu() {
    if (ESTADOS.includes(P.estado) && P.estado !== "bravo") return;
    const itens = [
      { id: "comida", rotulo: `${COMIDAS[pet.id] || "🍎"}  Dar comida` },
      { id: "brincar", rotulo: "⚽  Brincar" },
      { id: "carinho", rotulo: "💗  Carinho" },
    ];
    const w = 138;
    const { min, max } = limites();
    let x = P.x + larguraPx() / 2 + 8;
    if (x + w > max - 4) x = P.x - larguraPx() / 2 - 8 - w;
    montarMenu(itens, Math.max(min + 4, x), P.y - alturaPx() - 6);
    if (ocioso()) mudar("parado", 8);
  }
  // Menu do botão de brinquedos (ao lado do chat): aparece logo acima do botão.
  function abrirMenuBrinquedos(ponto) {
    if (P.estado === "caindo" || P.estado === "tonto") return;
    const itens = [
      { id: "comida", rotulo: `${COMIDAS[pet.id] || "🍎"}  Comida` },
      { id: "brincar", rotulo: "⚽  Bola de futebol" },
    ];
    const w = 150;
    montarMenu(itens, ponto.x - w / 2, ponto.y - 17 - 8 - (itens.length * 28 + 10), w);
  }
  function montarMenu(itens, x, y, w = 138) {
    const h = itens.length * 28 + 10;
    x = Math.max(4, Math.min(tela.largura - w - 4, x));
    y = Math.max(4, Math.min(tela.altura - h - 4, y));
    menu = { x, y, w, h, itens, ate: relogio + 8 };
  }
  function fecharMenu() {
    menu = null;
  }
  function itemSob(p) {
    if (!menu || p.x < menu.x || p.x > menu.x + menu.w) return null;
    const i = Math.floor((p.y - menu.y - 5) / 28);
    return i >= 0 && i < menu.itens.length ? menu.itens[i] : null;
  }
  const sobreMenu = (p) => Boolean(menu) && p.x >= menu.x && p.x <= menu.x + menu.w && p.y >= menu.y && p.y <= menu.y + menu.h;
  function cliqueNoMenu(p) {
    if (!sobreMenu(p)) return false;
    const item = itemSob(p);
    fecharMenu();
    if (item?.id === "comida") darComida();
    else if (item?.id === "brincar") brincar();
    else if (item?.id === "carinho" && !carinhoRecusado()) {
      coracao(6);
      falar(escolha(pet.falas.length ? pet.falas : ["Hehe ❤"]), 2);
      mudar("feliz", 1.4);
    }
    return true;
  }

  // ---------- comida ----------
  function darComida() {
    const lado = P.olhando || 1;
    const x = limitarX(P.x + lado * (larguraPx() / 2 + 34));
    comida = { x, y: P.y - alturaPx() - 80, vy: 0, chao: noChao() ? chaoDe(x) : P.y, mordidas: 0, emoji: COMIDAS[pet.id] || "🍎" };
    falar(escolha(["Oba, comida!", "Hmmm! 😋", "É pra mim?"]), 1.8);
    mudar("comendo", 12, { fase: "esperando" });
  }
  function atualizarComida(dt) {
    if (!comida) return mudar("parado", 1);
    if (comida.y < comida.chao) {
      comida.vy += GRAVIDADE * 0.7 * dt;
      comida.y = Math.min(comida.chao, comida.y + comida.vy * dt);
    }
    const perto = Math.abs(comida.x - P.x) < larguraPx() / 2 + 10;
    if (!perto) {
      andarAte({ x: comida.x - Math.sign(comida.x - P.x) * (larguraPx() / 2 + 6), y: P.y }, dt, 1.4);
      P.anim = "andando";
      return;
    }
    if (comida.y < comida.chao) return; // espera cair
    P.olhando = comida.x >= P.x ? 1 : -1;
    P.anim = "comendo";
    if (P.tAnim > 0.55) {
      P.tAnim = 0;
      comida.mordidas++;
    }
    if (comida.mordidas >= 4) {
      comida = null;
      fome = 0;
      if (relogio < bravoAte) {
        bravoAte = 0;
        falar("Tá bom... te perdoo 😌", 2.5);
      } else falar(escolha(["Nham! Valeu! 😋", "Delícia!", "Barriga cheia ❤"]), 2.2);
      coracao(6);
      if (bola) mudar("brincando", 15); // a bola continua em campo: volta para o jogo
      else mudar("feliz", 1.6);
    } else if (P.tempo <= 0) {
      comida = null;
      if (bola) mudar("brincando", 15);
      else mudar("parado", 1);
    }
  }

  // ---------- bola ----------
  // Você chuta clicando nela (ela vai para o lado oposto de onde você clicou, como um chute de verdade);
  // o pet corre atrás e chuta de volta na direção do seu mouse. Sem chutes seus por 15 s, ele cansa.
  const R_BOLA = 11;
  // A bola segue a opção de chão do pet:
  // - "barra": vista de lado, com gravidade, quicando em cima da barra de tarefas;
  // - "tela": vista de cima (como o pet anda), sem gravidade: rola pela tela toda e rebate nas bordas.
  function brincar() {
    if (relogio < bravoAte) {
      falar("Não quero brincar com você agora. 😤", 2);
      return mudar("bravo", 1.5);
    }
    const x = limitarX(P.x + (P.olhando || 1) * 70);
    const y = noChao() ? P.y - alturaPx() - 60 : P.y - R_BOLA; // na barra ela cai do alto; na tela, aparece nos pés dele
    bola = { x, y, vx: 0, vy: 0, giro: 0, r: R_BOLA, chutePet: 0, jogou: relogio };
    falar(escolha(["Bola! ⚽", "Vamos jogar!", "Chuta pra mim!"]), 1.8);
    mudar("brincando", 15);
  }
  const sobreBola = (p) => Boolean(bola) && Math.hypot(p.x - bola.x, p.y - bola.y) <= bola.r + 8;
  function cliqueNaBola(p) {
    if (!sobreBola(p)) return false;
    let dx = bola.x - p.x;
    let dy = bola.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) [dx, dy] = [rand(-0.3, 0.3), -1]; // bem no meio: vai para cima
    else [dx, dy] = [dx / d, dy / d];
    bola.vx = dx * 780;
    bola.vy = dy * 780 - (noChao() ? 160 : 0); // na barra, um pouco de "levantada", como num chute
    if (P.estado === "brincando") P.tempo = Math.max(P.tempo, 15); // você está jogando: ele continua
    else if (ocioso()) mudar("brincando", 15); // ele tinha parado: volta a jogar
    if (debug) console.warn(`[debug] chute seu: vx=${Math.round(bola.vx)} vy=${Math.round(bola.vy)}`);
    if (Math.random() < 0.35) falar(escolha(["Uau, que chute!", "Lá vou eu!", "Essa é minha!"]), 1.4);
    return true;
  }
  // física da bola na barra de tarefas (de lado, com gravidade)
  function bolaNaBarra(dt) {
    const chao = chaoDe(bola.x);
    bola.vy += GRAVIDADE * dt;
    bola.x += bola.vx * dt;
    bola.y += bola.vy * dt;
    if (bola.y >= chao - bola.r) {
      bola.y = chao - bola.r;
      bola.vy = Math.abs(bola.vy) > 80 ? -bola.vy * 0.55 : 0;
      bola.vx *= 1 - Math.min(1, dt * 1.6); // atrito no chão
    }
    if (bola.y < bola.r) {
      bola.y = bola.r; // bateu no teto
      bola.vy = Math.abs(bola.vy) * 0.6;
    }
  }
  // física da bola na tela inteira (vista de cima, sem gravidade)
  function bolaNaTela(dt) {
    bola.x += bola.vx * dt;
    bola.y += bola.vy * dt;
    const atrito = Math.exp(-1.3 * dt); // rolando, perde velocidade aos poucos
    bola.vx *= atrito;
    bola.vy *= atrito;
    if (Math.hypot(bola.vx, bola.vy) < 8) bola.vx = bola.vy = 0;
    const a = areaDe(bola.x);
    if (bola.y < a.y + bola.r || bola.y > a.y + a.h - bola.r) {
      bola.y = Math.max(a.y + bola.r, Math.min(a.y + a.h - bola.r, bola.y));
      bola.vy = -bola.vy * 0.75;
    }
  }
  // Física da bola: roda sempre que tem bola em campo, mesmo se o pet estiver fazendo outra coisa
  // (antes, dar comida no meio do jogo congelava a bola no ar para sempre).
  function fisicaBola(dt) {
    if (debug && relogio - (bola.log || 0) > 0.15) {
      bola.log = relogio;
      console.warn(`[debug] bola ${Math.round(bola.x)},${Math.round(bola.y)}`);
    }
    const naBarra = noChao();
    if (naBarra) bolaNaBarra(dt);
    else bolaNaTela(dt);
    bola.giro += (Math.hypot(bola.vx, bola.vy) / bola.r) * Math.sign(bola.vx || 1) * dt;
    const { min, max } = limites();
    if (bola.x < min + bola.r || bola.x > max - bola.r) {
      bola.x = Math.max(min + bola.r, Math.min(max - bola.r, bola.x));
      bola.vx = -bola.vx * 0.7;
    }
  }
  function atualizarBola(dt) {
    if (!bola) return mudar("parado", 1);
    bola.jogou = relogio;
    const naBarra = noChao();
    // o pet corre atrás e chuta de volta na direção do seu mouse
    const alcance = naBarra
      ? Math.abs(bola.x - P.x) < larguraPx() / 2 + bola.r && bola.y > chaoDe(bola.x) - alturaPx() * 0.8
      : Math.abs(bola.x - P.x) < larguraPx() / 2 + bola.r && Math.abs(bola.y - (P.y - bola.r)) < bola.r + 14;
    if (alcance && relogio - bola.chutePet > 0.6) {
      bola.chutePet = relogio;
      const dx = cursor.x - bola.x;
      const dy = cursor.y - bola.y;
      const d = Math.hypot(dx, dy) || 1;
      const forca = Math.min(820, 380 + d * 0.6); // mouse longe: chute mais forte
      bola.vx = (dx / d) * forca;
      bola.vy = naBarra ? Math.min((dy / d) * forca, -300) : (dy / d) * forca; // na barra, sempre sobe um pouco
      P.olhando = dx >= 0 ? 1 : -1;
      P.anim = "feliz";
      if (debug) console.warn(`[debug] chute do pet para o mouse: vx=${Math.round(bola.vx)} vy=${Math.round(bola.vy)}`);
      if (Math.random() < 0.3) falar(escolha(["Toma! ⚽", "Pra você!", "Gol!"]), 1.2);
    } else if (!alcance) {
      // na barra ele corre pelo chão; na tela, vai até onde a bola estiver (com os pés na altura dela)
      const alvo = naBarra ? { x: limitarX(bola.x), y: chaoDe(bola.x) } : { x: limitarX(bola.x), y: limitarY(bola.y + bola.r, bola.x) };
      andarAte(alvo, dt, 2.4);
      P.anim = "correndo";
    }
    if (P.tempo <= 0) {
      bola = null;
      falar(escolha(["Cansei, foi divertido!", "Ufa! Valeu! ❤", "De novo depois?"]), 2.2);
      coracao(4);
      mudar("feliz", 1.4);
    }
  }

  // ---------- laço ----------
  function atualizar(dt) {
    if (menu && (relogio > menu.ate || Math.hypot(cursor.x - menu.x - menu.w / 2, cursor.y - menu.y - menu.h / 2) > 320)) fecharMenu();
    fome = Math.min(100, fome + dt / 20); // ~1 ponto a cada 20 s
    if (fome > 70 && ocioso() && relogio - ultimaQueixa > 90) {
      ultimaQueixa = relogio;
      falar(escolha(["Tô com fome... 🍽️", "Minha barriga roncou...", "Me dá comida? (botão direito em mim)"]), 3);
    }
    if (bola) {
      fisicaBola(dt);
      // ficou 20 s fora do jogo (foi arrastado, caiu, ficou tonto...): a bola vai embora
      if (P.estado !== "brincando" && P.estado !== "comendo" && relogio - bola.jogou > 20) bola = null;
    }
    switch (P.estado) {
      case "caindo":
        atualizarQueda(dt);
        return true;
      case "tonto":
        if (P.tempo <= 0) ficarBravo();
        return true;
      case "bravo":
        virarPara(cursor.x); // encara você (com zona morta, para não tremer)
        if (P.tempo <= 0) proximoEstado();
        return true;
      case "comendo":
        atualizarComida(dt);
        return true;
      case "brincando":
        atualizarBola(dt);
        return true;
    }
    // trocou o chão para "barra" e ele estava no meio da tela: desce de paraquedas
    if (ocioso() && precisaCair()) {
      cair();
      return true;
    }
    return false;
  }

  // ---------- desenho ----------
  function desenharParaquedas(topo) {
    const k = P.paraquedas;
    if (!k) return;
    const w = larguraPx();
    const larg = Math.max(70, w * 1.5) * (0.4 + 0.6 * k);
    const cx = P.x;
    const cy = topo - 46 * k;
    ctx.save();
    ctx.translate(cx, P.y - alturaPx() / 2);
    ctx.rotate(Math.sin(relogio * 1.8) * 0.12);
    ctx.translate(-cx, -(P.y - alturaPx() / 2));
    // cordinhas
    ctx.strokeStyle = "rgba(60,60,60,0.7)";
    ctx.lineWidth = 1;
    for (const f of [-0.5, -0.17, 0.17, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(cx + f * larg, cy);
      ctx.lineTo(cx + f * w * 0.5, topo + alturaPx() * 0.35);
      ctx.stroke();
    }
    // cúpula em gomos laranja/creme
    const gomos = 6;
    for (let i = 0; i < gomos; i++) {
      const a0 = Math.PI + (i / gomos) * Math.PI;
      const a1 = Math.PI + ((i + 1) / gomos) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.ellipse(cx, cy, larg / 2, larg * 0.32, 0, a0, a1);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "#faf9f5" : "#d97757";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, larg / 2, larg * 0.32, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = "#a8502f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  function desenharEstrelas(topo) {
    ctx.save();
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 3; i++) {
      const a = relogio * 4 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = "#ffd23f";
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 1;
      const x = P.x + Math.cos(a) * larguraPx() * 0.42;
      const y = topo + 4 + Math.sin(a) * 6;
      ctx.strokeText("★", x, y);
      ctx.fillText("★", x, y);
    }
    ctx.restore();
  }
  function desenharFumaca(topo) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const f = (relogio * 0.9 + i / 4) % 1;
      const lado = i % 2 ? 1 : -1;
      ctx.globalAlpha = 0.55 * (1 - f);
      ctx.fillStyle = "#9aa0a6";
      ctx.beginPath();
      ctx.arc(P.x + lado * (larguraPx() * 0.3 + f * 10), topo + 6 - f * 26, 3 + f * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("💢", P.x + larguraPx() * 0.28, topo - 2);
    ctx.restore();
  }
  function desenharMenu() {
    if (!menu) return;
    const sob = itemSob(cursor);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#faf9f5";
    ctx.beginPath();
    ctx.roundRect(menu.x, menu.y, menu.w, menu.h, 10);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#e4dfd3";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "13px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    menu.itens.forEach((it, i) => {
      const y = menu.y + 5 + i * 28;
      if (it === sob) {
        ctx.fillStyle = "#d97757";
        ctx.beginPath();
        ctx.roundRect(menu.x + 4, y, menu.w - 8, 26, 7);
        ctx.fill();
      }
      ctx.fillStyle = it === sob ? "#ffffff" : "#2b2d42";
      ctx.fillText(it.rotulo, menu.x + 12, y + 13);
    });
    ctx.restore();
  }
  function desenhar(topo) {
    if (P.estado === "caindo" && !plana()) desenharParaquedas(topo);
    if (P.estado === "tonto" || (segurado && chacoalho.tonto)) desenharEstrelas(topo);
    if (P.estado === "bravo") desenharFumaca(topo);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (comida) {
      ctx.font = `${22 - comida.mordidas * 3}px system-ui, sans-serif`;
      ctx.fillText(comida.emoji, comida.x, comida.y);
    }
    if (bola) {
      ctx.translate(bola.x, bola.y);
      ctx.rotate(bola.giro);
      ctx.textBaseline = "middle";
      ctx.font = `${bola.r * 2.2}px system-ui, sans-serif`;
      ctx.fillText("⚽", 0, 1);
    }
    ctx.restore();
    desenharMenu();
  }

  return {
    precisaCair, cair, pegou, segurando, soltou, carinhoRecusado,
    abrirMenu, abrirMenuBrinquedos, sobreMenu, cliqueNoMenu, sobreBola, cliqueNaBola, atualizar, desenhar, plana,
  };
})();
