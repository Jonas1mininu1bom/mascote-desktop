// Pets em 3D de verdade (three.js), no estilo dos pets de desktop clássicos: vistos de cima
// na diagonal, com sombreado de desenho animado (toon) e contorno, girando para QUALQUER
// direção em que andam. Cada pet é montado com formas simples (esferas, cápsulas, cones) e
// animado por código, então não há arquivos de modelo.
//
// O overlay continua sendo um canvas 2D: aqui a cena é renderizada num canvas WebGL pequeno
// (só do tamanho do pet) e o overlay copia a imagem para a posição dele.
window.Pet3D = (() => {
  const T = window.THREE;
  if (!T) return null;
  const TAU = Math.PI * 2;
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAng = (a, b, k) => a + (((((b - a) % TAU) + TAU * 1.5) % TAU) - Math.PI) * k;

  // ---------- materiais ----------
  const degraus = (() => {
    const d = new Uint8Array([90, 170, 255]);
    const tx = new T.DataTexture(d, 3, 1, T.RedFormat);
    tx.minFilter = tx.magFilter = T.NearestFilter;
    tx.needsUpdate = true;
    return tx;
  })();
  const cacheMat = new Map();
  const toon = (cor) => {
    if (!cacheMat.has(cor)) cacheMat.set(cor, new T.MeshToonMaterial({ color: cor, gradientMap: degraus }));
    return cacheMat.get(cor);
  };
  const matContorno = new T.MeshBasicMaterial({ color: 0x1d1d26, side: T.BackSide });
  const basico = (cor) => new T.MeshBasicMaterial({ color: cor });

  // mesh com contorno (casca preta um pouco maior, só com as faces de trás)
  function parte(geo, cor, { contorno = 0.06, pai, pos, esc, rot } = {}) {
    const m = new T.Mesh(geo, typeof cor === "number" ? toon(cor) : cor);
    if (contorno) {
      const c = new T.Mesh(geo, matContorno);
      c.scale.setScalar(1 + contorno);
      m.add(c);
    }
    if (pos) m.position.set(...pos);
    if (esc) m.scale.set(...esc);
    if (rot) m.rotation.set(...rot);
    if (pai) pai.add(m);
    return m;
  }
  const pivo = (pai, pos = [0, 0, 0]) => {
    const g = new T.Group();
    g.position.set(...pos);
    pai.add(g);
    return g;
  };
  const esfera = (seg = 20) => new T.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const capsula = (r, comp) => new T.CapsuleGeometry(r, comp, 6, 12);

  // ---------- Pato: branco, pescoço comprido, bico e pés amarelos ----------
  function montarPato() {
    const raiz = new T.Group();
    const corpo = pivo(raiz, [0, 0.42, 0]); // gira para gingar
    const BRANCO = 0xfbfaf4, AMARELO = 0xf6c12c, LARANJA = 0xf0a020;
    // corpo em gota, meio em pé (peito para cima), como o pato do GIF
    parte(esfera(), BRANCO, { pai: corpo, esc: [0.29, 0.31, 0.4], rot: [-0.3, 0, 0] });
    parte(esfera(), BRANCO, { pai: corpo, pos: [0, -0.04, -0.12], esc: [0.27, 0.25, 0.3], contorno: 0.04 });
    // rabinho pontudo para cima, atrás
    parte(new T.ConeGeometry(1, 1, 12), BRANCO, { pai: corpo, pos: [0, 0.08, -0.42], esc: [0.11, 0.22, 0.1], rot: [-1.1, 0, 0] });
    // asas com pivô no ombro (abrem para os lados)
    const asas = [-1, 1].map((l) => {
      const p = pivo(corpo, [0.25 * l, 0.1, 0.04]);
      parte(esfera(), 0xf2f1ea, { pai: p, pos: [0.02 * l, -0.05, -0.1], esc: [0.05, 0.15, 0.26], rot: [0.3, 0, 0] });
      // penas da ponta
      for (const [dy, dz] of [[-0.14, -0.28], [-0.09, -0.33], [-0.03, -0.35]]) {
        parte(esfera(10), 0xf2f1ea, { pai: p, pos: [0.02 * l, dy, dz], esc: [0.04, 0.045, 0.08], contorno: 0.1 });
      }
      return p;
    });
    // pescoço e cabeça
    const pescoco = pivo(corpo, [0, 0.2, 0.2]);
    parte(capsula(0.095, 0.42), BRANCO, { pai: pescoco, pos: [0, 0.25, 0.02], rot: [0.08, 0, 0] });
    const cabeca = pivo(pescoco, [0, 0.56, 0.05]);
    parte(esfera(), BRANCO, { pai: cabeca, esc: [0.16, 0.15, 0.17] });
    const bico = pivo(cabeca, [0, -0.02, 0.12]);
    const bicoCima = parte(esfera(), AMARELO, { pai: bico, pos: [0, 0.01, 0.09], esc: [0.085, 0.03, 0.13] });
    const bicoBaixo = parte(esfera(), 0xe8a518, { pai: bico, pos: [0, -0.025, 0.07], esc: [0.065, 0.022, 0.1] });
    const olhos = [-1, 1].map((l) => {
      const o = parte(esfera(12), basico(0x16161c), { pai: cabeca, pos: [0.095 * l, 0.04, 0.11], esc: [0.026, 0.032, 0.026], contorno: 0 });
      parte(esfera(8), basico(0xffffff), { pai: o, pos: [0.3, 0.35, 0.6], esc: [0.35, 0.35, 0.35], contorno: 0 });
      return o;
    });
    // pernas com pivô no quadril e pés de pato
    const pernas = [-1, 1].map((l) => {
      const p = pivo(raiz, [0.11 * l, 0.3, 0.02]);
      parte(new T.CylinderGeometry(0.03, 0.03, 0.28, 8), LARANJA, { pai: p, pos: [0, -0.14, 0] });
      const pe = pivo(p, [0, -0.28, 0.02]);
      const forma = new T.Shape();
      forma.moveTo(0, -0.04);
      forma.lineTo(-0.11, 0.15);
      forma.quadraticCurveTo(-0.05, 0.12, 0, 0.17);
      forma.quadraticCurveTo(0.05, 0.12, 0.11, 0.15);
      forma.closePath();
      const geoPe = new T.ExtrudeGeometry(forma, { depth: 0.025, bevelEnabled: false });
      parte(geoPe, LARANJA, { pai: pe, rot: [Math.PI / 2, 0, 0], pos: [0, 0.01, 0], contorno: 0.08 });
      return { p, pe };
    });
    return { raiz, corpo, asas, pescoco, cabeca, bicoBaixo, bicoCima, olhos, pernas, tipo: "pato", altura: 1.3 };
  }

  // ---------- Palito: bonequinho de tubos com cachecol ----------
  function montarPalito() {
    const raiz = new T.Group();
    const TINTA = 0x2e3150, BRANCO = 0xfafafa, VERMELHO = 0xe5385f;
    const corpo = pivo(raiz, [0, 0.55, 0]);
    parte(capsula(0.045, 0.42), TINTA, { pai: corpo, pos: [0, 0.22, 0] });
    // cachecol: anel no pescoço + ponta
    parte(new T.TorusGeometry(0.1, 0.045, 10, 20), VERMELHO, { pai: corpo, pos: [0, 0.47, 0], rot: [Math.PI / 2, 0, 0] });
    const ponta = pivo(corpo, [0.05, 0.45, -0.08]);
    parte(new T.BoxGeometry(0.09, 0.24, 0.025), VERMELHO, { pai: ponta, pos: [0, -0.12, 0] });
    const cabeca = pivo(corpo, [0, 0.72, 0]);
    parte(esfera(), BRANCO, { pai: cabeca, esc: [0.24, 0.23, 0.22] });
    const olhos = [-1, 1].map((l) => {
      const o = parte(esfera(12), basico(0x1d1d26), { pai: cabeca, pos: [0.08 * l, 0.03, 0.2], esc: [0.032, 0.04, 0.02], contorno: 0 });
      parte(esfera(8), basico(0xffffff), { pai: o, pos: [0.3, 0.35, 0.6], esc: [0.35, 0.35, 0.35], contorno: 0 });
      return o;
    });
    for (const l of [-1, 1]) parte(esfera(10), basico(0xffb3c1), { pai: cabeca, pos: [0.15 * l, -0.06, 0.16], esc: [0.045, 0.025, 0.02], contorno: 0 });
    const boca = parte(new T.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), basico(0xd63a60), { pai: cabeca, pos: [0, -0.06, 0.205], rot: [0, 0, Math.PI], contorno: 0 });
    const membro = (pai, pos, comp, raio) => {
      const p = pivo(pai, pos);
      parte(capsula(raio, comp), TINTA, { pai: p, pos: [0, -comp / 2, 0] });
      parte(esfera(10), TINTA, { pai: p, pos: [0, -comp - raio, 0.01], esc: [raio * 1.6, raio * 1.4, raio * 2.2] });
      return p;
    };
    const bracos = [-1, 1].map((l) => membro(corpo, [0.05 * l, 0.36, 0], 0.32, 0.035));
    const pernas = [-1, 1].map((l) => membro(raiz, [0.06 * l, 0.56, 0], 0.48, 0.04));
    return { raiz, corpo, cabeca, olhos, boca, bracos, pernas, ponta, tipo: "palito", altura: 1.55 };
  }

  // ---------- Tartaruga: cabeção verde e casco marrom em placas ----------
  function texturaCasco() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#b8692e";
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "#5a2e10";
    g.lineWidth = 5;
    for (let fila = 0; fila < 3; fila++) {
      for (let i = 0; i < 6; i++) {
        const cx = i * 46 + (fila % 2) * 23, cy = 22 + fila * 38, r = 22;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85);
        }
        g.closePath();
        g.fillStyle = (i + fila) % 2 ? "#c47a3a" : "#b06228";
        g.fill();
        g.stroke();
      }
    }
    const tx = new T.CanvasTexture(c);
    tx.colorSpace = T.SRGBColorSpace;
    return tx;
  }
  function montarTartaruga() {
    const raiz = new T.Group();
    const VERDE = 0x8fd157;
    const corpo = pivo(raiz, [0, 0.16, 0]);
    // casco (meia esfera) + borda + barriga
    const casco = new T.MeshToonMaterial({ map: texturaCasco(), gradientMap: degraus });
    parte(new T.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI / 2), casco, { pai: corpo, pos: [0, 0.05, 0], esc: [0.5, 0.42, 0.58] });
    parte(new T.TorusGeometry(0.52, 0.05, 8, 30), 0xe8c08a, { pai: corpo, pos: [0, 0.05, 0], esc: [1, 1.13, 1], rot: [Math.PI / 2, 0, 0] });
    parte(new T.CylinderGeometry(0.5, 0.46, 0.08, 24), 0xf3dfa8, { pai: corpo, pos: [0, 0.01, 0], esc: [1, 1, 1.13] });
    // cabeça, patas e rabo: cada um num pivô que recolhe para dentro do casco
    const cabecaP = pivo(corpo, [0, 0.12, 0.55]);
    parte(capsula(0.12, 0.14), VERDE, { pai: cabecaP, pos: [0, 0.06, 0.04], rot: [0.9, 0, 0] });
    const cabeca = pivo(cabecaP, [0, 0.26, 0.18]);
    parte(esfera(), VERDE, { pai: cabeca, esc: [0.3, 0.28, 0.28] });
    const olhos = [-1, 1].map((l) => {
      const o = parte(esfera(12), basico(0x1d1d26), { pai: cabeca, pos: [0.12 * l, 0.05, 0.24], esc: [0.04, 0.05, 0.03], contorno: 0 });
      parte(esfera(8), basico(0xffffff), { pai: o, pos: [0.3, 0.35, 0.6], esc: [0.35, 0.35, 0.35], contorno: 0 });
      return o;
    });
    for (const l of [-1, 1]) parte(esfera(10), basico(0xffaaa0), { pai: cabeca, pos: [0.19 * l, -0.05, 0.2], esc: [0.05, 0.03, 0.02], contorno: 0 });
    const boca = parte(new T.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), basico(0x2f5512), { pai: cabeca, pos: [0, -0.06, 0.27], rot: [0, 0, Math.PI], contorno: 0 });
    const patas = [[0.34, 0.32], [-0.34, 0.32], [0.34, -0.3], [-0.34, -0.3]].map(([x, z]) => {
      const p = pivo(corpo, [x, -0.02, z]);
      parte(capsula(0.08, 0.06), VERDE, { pai: p, pos: [0, -0.06, 0] });
      return p;
    });
    const rabo = pivo(corpo, [0, 0.02, -0.6]);
    parte(new T.ConeGeometry(0.05, 0.14, 8), VERDE, { pai: rabo, pos: [0, 0, -0.05], rot: [-Math.PI / 2, 0, 0] });
    return { raiz, corpo, cabecaP, cabeca, olhos, boca, patas, rabo, tipo: "tartaruga", altura: 0.8 };
  }

  const MONTAR = { pato: montarPato, palito: montarPalito, tartaruga: montarTartaruga };

  // ---------- cena ----------
  let renderer = null, cena = null, camera = null, modelo = null, desenhoAtual = null;
  const estado = { yaw: 0.5, alvoYaw: 0.5, ultX: null, ultY: null, esconde: 0, ultRelogio: 0, pisca: 0 };
  const ELEVACAO = 0.62; // ~35° olhando de cima, como nos pets de desktop clássicos
  const VISTA = 2.2; // largura da cena em unidades (o pet tem ~1 de altura)

  function iniciar() {
    if (renderer) return true;
    try {
      const canvas = document.createElement("canvas");
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      cena = new T.Scene();
      cena.add(new T.AmbientLight(0xffffff, 1.4));
      const sol = new T.DirectionalLight(0xffffff, 2.2);
      sol.position.set(-2, 4, 3); // alto, à esquerda, na frente
      cena.add(sol);
      camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
      return true;
    } catch (e) {
      console.error("[3d] WebGL indisponível, voltando para o 2D:", e);
      renderer = false;
      return false;
    }
  }

  function trocarModelo(desenho) {
    if (desenhoAtual === desenho) return;
    if (modelo) cena.remove(modelo.raiz);
    modelo = MONTAR[desenho]();
    desenhoAtual = desenho;
    cena.add(modelo.raiz);
  }

  // ---------- animação ----------
  const ANDANDO = { andar: 1, voltar: 1, buscar: 1, seguir: 1, perseguir: 1.6, arrastando: 0.8, segurando: 1.6, brincando: 1.6, trabalhando: 1.3 };
  function animar(m, s, dt) {
    const anim = s.anim;
    const t = s.t;
    const anda = ANDANDO[s.estado] ? (anim === "correndo" || ANDANDO[s.estado] > 1.2 ? 15 : 9) : 0;
    const f = t * anda;
    const passo = anda ? Math.sin(f) : 0;
    // valores padrão (tudo parado)
    m.raiz.position.set(0, 0, 0);
    m.raiz.rotation.set(0, 0, 0);
    m.corpo.rotation.set(0, 0, 0);
    const respira = Math.sin(s.relogio * 2.2) * 0.012;
    // piscar
    const pisca = anim !== "dormindo" && s.relogio % 3.7 > 3.58;
    const fechado = anim === "dormindo" || pisca;
    for (const o of m.olhos) o.scale.y = (fechado ? 0.15 : 1) * (m.tipo === "pato" ? 0.032 : 0.04);
    const extraYaw = { v: 0 };

    if (m.tipo === "pato") {
      m.corpo.position.y = 0.42 + respira;
      m.pescoco.rotation.set(0, 0, 0);
      m.cabeca.rotation.set(0, 0, 0);
      m.bicoBaixo.rotation.set(0, 0, 0);
      m.bicoBaixo.position.y = -0.03;
      for (const [i, a] of m.asas.entries()) a.rotation.set(0, 0, 0);
      for (const p of m.pernas) {
        p.p.rotation.set(0, 0, 0);
        p.pe.rotation.set(0, 0, 0);
      }
      const asa = (abre, bate = 0) => m.asas.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * -(abre + bate)));
      if (anda) {
        // gingado: o corpo rola para o lado do pé no chão, o pé que sobe vai para trás
        m.raiz.rotation.z = passo * 0.14;
        m.corpo.position.y += Math.abs(passo) * 0.03;
        m.pernas.forEach(({ p, pe }, i) => {
          const l = i ? 1 : -1;
          p.rotation.x = passo * l * 0.55;
          pe.rotation.x = Math.max(0, passo * l) * 0.9;
        });
        m.pescoco.rotation.x = 0.15 + Math.sin(f * 2) * 0.06;
        asa(0.05, Math.abs(passo) * 0.08);
        if (s.estado === "segurando" || s.estado === "arrastando") m.bicoBaixo.rotation.x = 0.35;
      } else if (anim === "dancando") {
        const T5 = t % 5.1;
        if (T5 < 2.6) {
          // desfile marcando o passo, e no fim dá uma volta inteira no lugar
          const p = Math.sin(T5 * TAU * 1.25);
          m.raiz.rotation.z = p * 0.12;
          m.pernas.forEach(({ p: pp, pe }, i) => {
            const l = i ? 1 : -1;
            pp.rotation.x = -Math.max(0, p * l) * 1.1;
            pe.rotation.x = Math.max(0, p * l) * 0.6;
          });
          m.corpo.position.y += Math.abs(p) * 0.04;
          asa(0.35, Math.sin(T5 * TAU * 2.5) * 0.25);
          m.pescoco.rotation.x = Math.sin(T5 * TAU * 2.5) * 0.15;
          if (T5 >= 1.6) extraYaw.v = ((T5 - 1.6) / 1.0) * TAU;
        } else {
          // rebolado de asas abertas, cabeça inclinando para o outro lado
          const lado = Math.sin((T5 - 2.6) * TAU);
          m.raiz.rotation.z = lado * 0.18;
          m.raiz.position.x = lado * 0.05;
          m.corpo.position.y += Math.abs(Math.sin((T5 - 2.6) * TAU * 2)) * 0.05;
          asa(1.0 + Math.max(0, lado) * 0.2, Math.sin(T5 * TAU * 3) * 0.3);
          m.cabeca.rotation.z = -lado * 0.3;
          m.pescoco.rotation.x = Math.sin((T5 - 2.6) * TAU * 2) * 0.12;
          m.bicoBaixo.rotation.x = Math.sin(T5 * TAU * 2.5) > 0.7 ? 0.3 : 0;
        }
      } else if (anim === "caindo") {
        if (s.planando) {
          asa(1.45, Math.sin(s.relogio * 3) * 0.08);
          m.corpo.rotation.x = 0.25;
          m.pernas.forEach(({ p }) => (p.rotation.x = -0.9));
        } else {
          asa(1.0, Math.sin(s.relogio * 22) * 0.5);
          m.pernas.forEach(({ p }, i) => (p.rotation.x = Math.sin(s.relogio * 18 + i * 3) * 0.5));
        }
      } else if (anim === "carregado") {
        asa(0.8, Math.sin(s.relogio * 20) * 0.4);
        m.pernas.forEach(({ p }, i) => (p.rotation.x = Math.sin(s.relogio * 10 + i * 3) * 0.4));
      } else if (anim === "dormindo") {
        m.pescoco.rotation.x = 0.75; // cabeça baixa, encostada no peito
        m.cabeca.rotation.x = 0.4;
        m.corpo.position.y = 0.36 + respira * 2;
      } else if (anim === "comendo") {
        m.pescoco.rotation.x = 0.9 + Math.max(0, Math.sin(t * 11)) * 0.4; // bicando
        m.bicoBaixo.rotation.x = Math.sin(t * 11) > 0 ? 0.3 : 0;
      } else if (anim === "acenando" || anim === "travessura") {
        m.asas[1].rotation.z = -(1.1 + Math.sin(t * 14) * 0.4);
      } else if (anim === "feliz") {
        m.raiz.position.y = Math.abs(Math.sin(t * 7)) * 0.12;
        asa(0.6, Math.sin(t * 14) * 0.4);
      } else if (anim === "bravo") {
        m.pescoco.rotation.x = 0.55;
        m.cabeca.rotation.x = -0.3;
        m.bicoBaixo.rotation.x = 0.35;
        m.raiz.position.y = Math.abs(Math.sin(t * 12)) * 0.03;
        asa(0.5, Math.abs(Math.sin(t * 12)) * 0.2);
      } else if (anim === "tonto") {
        m.raiz.rotation.z = Math.sin(s.relogio * 7) * 0.2;
        m.cabeca.rotation.y = Math.sin(s.relogio * 9) * 0.6;
      } else if (anim === "pensando") {
        m.cabeca.rotation.z = 0.25;
      }
    } else if (m.tipo === "palito") {
      m.corpo.position.y = 0.55;
      m.cabeca.rotation.set(0, 0, 0);
      m.ponta.rotation.x = 0.3 + (anda ? Math.sin(f) * 0.25 + 0.3 : Math.sin(s.relogio * 2) * 0.08);
      for (const b of [...m.bracos, ...m.pernas]) b.rotation.set(0, 0, 0);
      m.bracos[0].rotation.z = -0.35;
      m.bracos[1].rotation.z = 0.35;
      m.boca.rotation.z = anim === "bravo" || anim === "tonto" ? 0 : Math.PI;
      m.boca.position.y = anim === "bravo" || anim === "tonto" ? -0.1 : -0.06;
      if (anda) {
        m.pernas.forEach((p, i) => (p.rotation.x = passo * (i ? 1 : -1) * 0.7));
        m.bracos.forEach((b, i) => (b.rotation.x = -passo * (i ? 1 : -1) * 0.6));
        m.corpo.position.y += Math.abs(passo) * 0.03;
      } else if (anim === "acenando" || anim === "travessura") {
        m.bracos[1].rotation.z = 2.5 + Math.sin(t * 12) * 0.3;
      } else if (anim === "feliz" || anim === "carregado") {
        m.raiz.position.y = Math.abs(Math.sin(t * 7)) * 0.12;
        m.bracos[0].rotation.z = -2.4;
        m.bracos[1].rotation.z = 2.4;
      } else if (anim === "caindo") {
        m.bracos[0].rotation.z = -2.6;
        m.bracos[1].rotation.z = 2.6;
        m.pernas.forEach((p, i) => (p.rotation.x = Math.sin(s.relogio * 18 + i * 3) * 0.5));
      } else if (anim === "dormindo") {
        m.cabeca.rotation.z = 0.35;
        m.corpo.position.y = 0.53 + respira;
      } else if (anim === "bravo") {
        m.raiz.position.y = Math.abs(Math.sin(t * 12)) * 0.03;
        m.bracos[0].rotation.z = -0.15;
        m.bracos[1].rotation.z = 0.15;
      } else if (anim === "tonto") {
        m.raiz.rotation.z = Math.sin(s.relogio * 7) * 0.15;
      } else if (anim === "pensando") {
        m.bracos[1].rotation.z = 2.2;
        m.bracos[1].rotation.x = -0.6;
        m.cabeca.rotation.z = 0.2;
      }
    } else if (m.tipo === "tartaruga") {
      // esconder no casco: dormindo, caindo ou chacoalhada (tonta)
      const quer = ["dormindo", "caindo", "tonto"].includes(anim) ? 1 : 0;
      estado.esconde = lerp(estado.esconde, quer, Math.min(1, dt * 8));
      const k = 1 - estado.esconde;
      m.corpo.position.y = 0.16 * k + 0.06 * (1 - k) + respira * 0.5;
      m.cabecaP.position.set(0, 0.12, 0.25 + 0.3 * k);
      m.cabecaP.scale.setScalar(Math.max(0.001, k));
      m.rabo.scale.setScalar(Math.max(0.001, k));
      m.patas.forEach((p) => p.scale.setScalar(Math.max(0.001, k)));
      m.cabeca.rotation.set(0, 0, 0);
      m.boca.rotation.z = anim === "bravo" ? 0 : Math.PI;
      m.boca.position.y = anim === "bravo" ? -0.09 : -0.06;
      if (anda) {
        m.patas.forEach((p, i) => (p.rotation.x = Math.sin(f + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.5));
        m.cabeca.rotation.y = Math.sin(f * 0.5) * 0.1;
        m.raiz.rotation.z = passo * 0.04;
      } else {
        m.patas.forEach((p) => (p.rotation.x = 0));
        if (anim === "feliz") m.raiz.position.y = Math.abs(Math.sin(t * 7)) * 0.06;
        if (anim === "comendo") m.cabeca.rotation.x = Math.max(0, Math.sin(t * 11)) * 0.4;
        if (anim === "acenando") m.patas[0].rotation.z = -1 - Math.sin(t * 12) * 0.3;
        if (anim === "tonto") m.raiz.rotation.y = s.relogio * 4; // casco rodando
      }
    }
    return extraYaw.v;
  }

  // ---------- renderização ----------
  // Devolve { canvas, x, y, w, h } (em px de tela) para o overlay copiar, ou null se não deu.
  function desenhar(s) {
    if (!MONTAR[s.desenho] || !iniciar()) return null;
    trocarModelo(s.desenho);
    const dt = Math.min(0.1, Math.max(0, s.relogio - estado.ultRelogio));
    estado.ultRelogio = s.relogio;

    // direção: para onde ele está andando na tela (qualquer ângulo); parado, vira um pouco
    // para a pessoa, do lado em que estava olhando
    if (estado.ultX != null && dt > 0) {
      const vx = (s.x - estado.ultX) / dt;
      const vy = (s.y - estado.ultY) / dt;
      const movendo = ANDANDO[s.estado] && Math.hypot(vx, vy) > 15;
      if (movendo) estado.alvoYaw = Math.atan2(vx, vy / ELEVACAO);
      else if (!ANDANDO[s.estado] && s.anim !== "caindo") estado.alvoYaw = s.olhando > 0 ? 0.75 : -0.75;
    }
    estado.ultX = s.x;
    estado.ultY = s.y;
    if (s.yaw != null) estado.alvoYaw = estado.yaw = s.yaw; // para testes e prévias
    estado.yaw = lerpAng(estado.yaw, estado.alvoYaw, Math.min(1, dt * 7));
    const extra = animar(modelo, s, dt);
    modelo.raiz.rotation.y = estado.yaw + extra;

    // tamanho: a altura do modelo vira a altura do pet em px
    const pxPorUnidade = s.alturaPx / modelo.altura;
    const larg = Math.ceil(VISTA * pxPorUnidade);
    const alt = larg;
    const dpr = s.dpr || 1;
    if (renderer.domElement.width !== Math.round(larg * dpr) || renderer.domElement.height !== Math.round(alt * dpr)) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(larg, alt, false);
    }
    // câmera ortográfica olhando de cima na diagonal; os pés (origem) ficam a 18% do fundo
    const meia = VISTA / 2;
    camera.left = -meia;
    camera.right = meia;
    camera.top = meia;
    camera.bottom = -meia;
    const dir = new T.Vector3(0, Math.sin(ELEVACAO), Math.cos(ELEVACAO));
    const alvo = new T.Vector3(0, 0, 0);
    camera.position.copy(dir.clone().multiplyScalar(10));
    camera.up.set(0, 1, 0);
    camera.lookAt(alvo);
    camera.updateMatrixWorld();
    // desloca a vista para cima, para os pés ficarem perto do fundo da imagem
    const sobe = meia * 0.64;
    camera.top = meia + sobe;
    camera.bottom = -meia + sobe;
    camera.updateProjectionMatrix();
    renderer.render(cena, camera);
    // a origem (pés) cai em y = 82% da imagem, no meio da largura
    return { canvas: renderer.domElement, x: s.x - larg / 2, y: s.y - alt * 0.82, w: larg, h: alt, topo: s.y - s.alturaPx };
  }

  return { tem: (d) => !!MONTAR[d], desenhar };
})();
