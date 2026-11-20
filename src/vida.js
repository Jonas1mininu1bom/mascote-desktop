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
  const ocioso = () => ["parado", "andar", "acenando", "dormindo", "feliz"].includes(P.estado);
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
      P.vx += Math.sin(relogio * 1.8) * 25 * dt; // balança com o vento
    }
    P.vx *= 1 - Math.min(1, dt * (P.aberto ? 1.2 : 0.4));
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
    if (P.aberto) falar(escolha(["Ufa! 🪂", "Pouso perfeito!", "Que vista!"]), 2);
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
    const h = itens.length * 28 + 10;
    const { min, max } = limites();
    let x = P.x + larguraPx() / 2 + 8;
    if (x + w > max - 4) x = P.x - larguraPx() / 2 - 8 - w;
    x = Math.max(min + 4, x);
    const y = Math.max(4, Math.min(tela.altura - h - 4, P.y - alturaPx() - 6));
    menu = { x, y, w, h, itens, ate: relogio + 8 };
    if (ocioso()) mudar("parado", 8);
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
      mudar("feliz", 1.6);
    } else if (P.tempo <= 0) {
      comida = null;
      mudar("parado", 1);
    }
  }

  // ---------- bola ----------
  function brincar() {
    if (relogio < bravoAte) {
      falar("Não quero brincar com você agora. 😤", 2);
      return mudar("bravo", 1.5);
    }
    const x = limitarX(P.x + (P.olhando || 1) * 70);
    const c = noChao() ? chaoDe(x) : P.y;
    bola = { x, y: c - alturaPx() - 60, vx: 0, vy: 0, chao: c, giro: 0, r: 10 };
    falar(escolha(["Bola! ⚽", "Vamos jogar!", "Chuta pra mim!"]), 1.8);
    mudar("brincando", 12);
  }
  function atualizarBola(dt) {
    if (!bola) return mudar("parado", 1);
    const { min, max } = limites();
    bola.vy += GRAVIDADE * dt;
    bola.x += bola.vx * dt;
    bola.y += bola.vy * dt;
    bola.giro += (bola.vx / bola.r) * dt;
    if (bola.y >= bola.chao - bola.r) {
      bola.y = bola.chao - bola.r;
      bola.vy = Math.abs(bola.vy) > 80 ? -bola.vy * 0.55 : 0;
      bola.vx *= 1 - Math.min(1, dt * 1.6); // atrito no chão
    }
    if (bola.x < min + bola.r || bola.x > max - bola.r) {
      bola.x = Math.max(min + bola.r, Math.min(max - bola.r, bola.x));
      bola.vx = -bola.vx * 0.7;
    }
    if (noChao()) bola.chao = chaoDe(bola.x);
    // o pet corre atrás e chuta quando alcança
    const perto = Math.abs(bola.x - P.x) < larguraPx() / 2 + bola.r && bola.y > bola.chao - bola.r - 30;
    if (perto) {
      const lado = bola.x >= P.x ? 1 : -1;
      bola.vx = lado * rand(260, 460);
      bola.vy = -rand(280, 520);
      P.olhando = lado;
      if (Math.random() < 0.3) falar(escolha(["Gol! ⚽", "Toma!", "Hehe!"]), 1.2);
    } else {
      andarAte({ x: limitarX(bola.x), y: noChao() ? chaoDe(bola.x) : P.y }, dt, 2.2);
      P.anim = "correndo";
    }
    if (P.tempo <= 0) {
      bola = null;
      falar(escolha(["De novo amanhã!", "Cansei, foi divertido!", "Ufa! Valeu! ❤"]), 2.2);
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
    switch (P.estado) {
      case "caindo":
        atualizarQueda(dt);
        return true;
      case "tonto":
        if (P.tempo <= 0) ficarBravo();
        return true;
      case "bravo":
        P.olhando = cursor.x >= P.x ? 1 : -1; // encara você
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
    if (P.estado === "caindo") desenharParaquedas(topo);
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

  return { precisaCair, cair, pegou, segurando, soltou, carinhoRecusado, abrirMenu, sobreMenu, cliqueNoMenu, atualizar, desenhar };
})();
