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
  // casco marrom com poucas placas grandes e curvas (estilo desenho animado)
  function texturaCasco() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#7d4b33";
    g.fillRect(0, 0, 256, 128);
    // placas: faixas em volta do domo (u = volta, v = do topo para a borda)
    g.strokeStyle = "#4a2a1c";
    g.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      const x = i * 51.2;
      g.fillStyle = i % 2 ? "#94603f" : "#8a5638";
      g.beginPath();
      g.moveTo(x + 4, 40);
      g.quadraticCurveTo(x + 25.6, 30, x + 47, 40);
      g.lineTo(x + 49, 118);
      g.quadraticCurveTo(x + 25.6, 126, x + 2, 118);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // placa de cima
    g.fillStyle = "#9b6644";
    g.fillRect(0, 0, 256, 36);
    g.beginPath();
    g.moveTo(0, 38);
    g.lineTo(256, 38);
    g.stroke();
    // brilhos claros nas placas
    g.strokeStyle = "rgba(255,220,190,0.35)";
    g.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(i * 51.2 + 14, 52);
      g.quadraticCurveTo(i * 51.2 + 24, 46, i * 51.2 + 36, 52);
      g.stroke();
    }
    const tx = new T.CanvasTexture(c);
    tx.colorSpace = T.SRGBColorSpace;
    return tx;
  }
  // Tartaruguinha "fofa": cabeção redondo do tamanho do casco, olhos grandes, barriga amarela,
  // patas grossas e casco pequeno atrás.
  function montarTartaruga() {
    const raiz = new T.Group();
    const VERDE = 0x7ed957, VERDE_ESC = 0x5cb93c;
    const corpo = pivo(raiz, [0, 0.3, 0]); // a animação ajusta (desce quando se esconde no casco)
    // barriga amarela (aparece embaixo do casco e na frente)
    parte(esfera(), 0xf0cf4a, { pai: corpo, pos: [0, -0.04, 0.06], esc: [0.32, 0.14, 0.38] });
    // casco (meia esfera um pouco mais funda que meia) + borda
    const casco = new T.MeshToonMaterial({ map: texturaCasco(), gradientMap: degraus });
    parte(new T.SphereGeometry(1, 28, 16, 0, TAU, 0, Math.PI * 0.56), casco, { pai: corpo, pos: [0, 0.02, -0.06], esc: [0.4, 0.4, 0.46], rot: [-0.18, 0, 0] });
    parte(new T.TorusGeometry(0.4, 0.045, 8, 30), 0x6e4029, { pai: corpo, pos: [0, -0.02, -0.06], esc: [1, 1.15, 1], rot: [Math.PI / 2 - 0.18, 0, 0] });
    // cabeça, patas e rabo: cada um num pivô que recolhe para dentro do casco
    const cabecaP = pivo(corpo, [0, 0.1, 0.32]);
    parte(capsula(0.13, 0.2), VERDE, { pai: cabecaP, pos: [0, 0.16, 0.06], rot: [0.35, 0, 0] });
    const cabeca = pivo(cabecaP, [0, 0.5, 0.14]);
    // cabeção: domo alto em cima, achatado embaixo
    parte(esfera(28), VERDE, { pai: cabeca, esc: [0.35, 0.31, 0.33] });
    parte(esfera(20), VERDE_ESC, { pai: cabeca, pos: [0, -0.1, 0.02], esc: [0.3, 0.17, 0.3], contorno: 0 });
    parte(esfera(12), basico(0xb8f08f), { pai: cabeca, pos: [-0.12, 0.2, 0.12], esc: [0.08, 0.04, 0.05], rot: [0, 0, 0.4], contorno: 0 }); // brilho
    const olhos = [-1, 1].map((l) => {
      const o = parte(esfera(14), basico(0x2a1d38), { pai: cabeca, pos: [0.13 * l, 0.04, 0.295], esc: [0.055, 0.07, 0.04], contorno: 0 });
      parte(esfera(8), basico(0xffffff), { pai: o, pos: [0.3, 0.4, 0.7], esc: [0.38, 0.32, 0.3], contorno: 0 });
      parte(esfera(8), basico(0xffffff), { pai: o, pos: [-0.25, -0.35, 0.7], esc: [0.16, 0.14, 0.2], contorno: 0 });
      return o;
    });
    // sobrancelhas finas
    for (const l of [-1, 1]) parte(capsula(0.008, 0.05), basico(0x2a1d38), { pai: cabeca, pos: [0.14 * l, 0.165, 0.29], rot: [0, 0, Math.PI / 2 - l * 0.18], contorno: 0 });
    for (const l of [-1, 1]) parte(esfera(10), basico(0x6fc24a), { pai: cabeca, pos: [0.2 * l, -0.06, 0.24], esc: [0.05, 0.03, 0.02], contorno: 0 });
    const boca = parte(new T.TorusGeometry(0.035, 0.009, 6, 16, Math.PI), basico(0x2a1d38), { pai: cabeca, pos: [0.03, -0.07, 0.315], rot: [0, 0, Math.PI], contorno: 0 });
    // focinho: risquinho em cima da boca
    parte(new T.TorusGeometry(0.03, 0.008, 6, 12, Math.PI * 0.8), basico(0x2a1d38), { pai: cabeca, pos: [-0.01, -0.01, 0.325], rot: [0, 0, 0.3], contorno: 0 });
    // patas grossas e compridas o bastante para aparecerem bem embaixo do casco
    const patas = [[0.3, 0.22], [-0.3, 0.22], [0.28, -0.24], [-0.28, -0.24]].map(([x, z]) => {
      const p = pivo(corpo, [x, -0.02, z]);
      parte(capsula(0.12, 0.14), VERDE, { pai: p, pos: [0, -0.12, 0] });
      return p;
    });
    const rabo = pivo(corpo, [0, 0, -0.48]);
    parte(new T.ConeGeometry(0.05, 0.14, 8), VERDE, { pai: rabo, pos: [0, 0, -0.05], rot: [-Math.PI / 2, 0, 0] });
    return { raiz, corpo, cabecaP, cabeca, olhos, boca, patas, rabo, tipo: "tartaruga", altura: 1.25 };
  }

  // ---------- Hornet: máscara branca com chifres, corpo preto, capa vermelha e agulha ----------
  // peça fina (perna, braço, chifre, agulha) de a até b, com contorno de espessura fixa
  // (a casca escalada do parte() some em peças finas e alongaria as pontas)
  // lados: 10 = redondo; 4 = seção quadrada (lâmina facetada)
  function tubo(pai, a, b, ra, rb, cor, contorno = 0.012, lados = 10) {
    const A = new T.Vector3(...a), B = new T.Vector3(...b);
    const dir = B.clone().sub(A);
    const comp = dir.length();
    const g = new T.Group();
    g.position.copy(A).add(B).multiplyScalar(0.5);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    let geo = new T.CylinderGeometry(rb, ra, comp, lados);
    if (lados <= 6) {
      // faces chapadas: sem vértices compartilhados nas quinas, cada face tem a própria normal
      geo = geo.toNonIndexed();
      geo.computeVertexNormals();
    }
    g.add(new T.Mesh(geo, typeof cor === "number" ? toon(cor) : cor));
    if (contorno) g.add(new T.Mesh(new T.CylinderGeometry(rb + contorno, ra + contorno, comp + contorno, lados), matContorno));
    pai.add(g);
    return g;
  }

  function montarHornet() {
    const raiz = new T.Group();
    raiz.rotation.order = "YXZ"; // inclinar (x) no eixo dela, depois de virar (y)
    const MASCARA = 0xf6f2e9, PRETO = 0x1c1b25, VERMELHO = 0xc0232d, PRATA = 0xdfe3ea, LINHA = 0xf4f0e6;
    // articulação fininha (bolinha preta da grossura do membro, para a dobra não abrir buraco)
    const junta = (pai, r) => parte(esfera(10), PRETO, { pai, esc: [r, r, r], contorno: 0.01 / r });
    // pernas pretas finíssimas que terminam em ponta: coxa (pivô no quadril) e canela (pivô no joelho)
    const joelhos = [];
    const pernas = [-1, 1].map((l) => {
      const p = pivo(raiz, [0.045 * l, 0.44, 0]);
      tubo(p, [0, 0, 0], [0, -0.22, 0], 0.024, 0.017, PRETO, 0.01);
      const j = pivo(p, [0, -0.22, 0]);
      junta(j, 0.017);
      tubo(j, [0, 0, 0], [0, -0.22, 0.01], 0.017, 0.002, PRETO, 0.01);
      joelhos.push(j);
      return p;
    });
    const corpo = pivo(raiz, [0, 0.44, 0]); // pivô no quadril: o tronco inclina para correr
    parte(capsula(0.06, 0.3), PRETO, { pai: corpo, pos: [0, 0.27, 0], esc: [1, 1, 0.85] });
    tubo(corpo, [0, 0.5, 0], [0, 0.64, 0], 0.03, 0.026, PRETO, 0.01);

    // capinha franzida: curta (termina na cintura), bem aberta, com dobras arredondadas na barra.
    // Os vértices são mexidos a cada quadro pela animação (tecido).
    const SAIA_RAD = 56, SAIA_SEG = 8, SAIA_H = 0.31; // 7 pétalas × 8 segmentos
    const saiaGeo = new T.CylinderGeometry(0.09, 0.42, SAIA_H, SAIA_RAD, SAIA_SEG, true);
    const saia = pivo(corpo, [0, 0.56, 0]);
    // cor por vértice: vincos vinho-escuro, meio das pétalas vermelho vivo (pintada a cada quadro)
    saiaGeo.setAttribute("color", new T.Float32BufferAttribute(new Float32Array(saiaGeo.attributes.position.count * 3), 3));
    saia.add(new T.Mesh(saiaGeo, new T.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: degraus })));
    // por dentro a capa é magenta escuro (aparece nas dobras e quando ela abre a cúpula)
    saia.add(new T.Mesh(saiaGeo, new T.MeshToonMaterial({ color: 0x7c1840, gradientMap: degraus, side: T.BackSide })));
    const contornoSaia = new T.Mesh(saiaGeo, matContorno);
    contornoSaia.scale.setScalar(1.045);
    saia.add(contornoSaia);
    parte(new T.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI * 0.5), VERMELHO, { pai: corpo, pos: [0, 0.53, -0.005], esc: [0.13, 0.08, 0.12], contorno: 0.08 });

    // máscara: uma peça só em "U" alto (queixo redondo embaixo, os "chifres" são as duas pontas
    // da própria máscara, grossas na base, com um entalhe em U entre elas)
    const cabeca = pivo(corpo, [0, 0.6, 0]);
    const contornoU = new T.Shape();
    // (a borda arredondada da extrusão engorda o desenho em 0,03 para todos os lados)
    contornoU.moveTo(0, 0.03);
    contornoU.bezierCurveTo(0.11, 0.03, 0.16, 0.12, 0.16, 0.28);
    contornoU.bezierCurveTo(0.16, 0.5, 0.168, 0.72, 0.145, 0.84);
    contornoU.quadraticCurveTo(0.125, 0.885, 0.105, 0.84);
    contornoU.bezierCurveTo(0.095, 0.7, 0.088, 0.53, 0.072, 0.45);
    contornoU.quadraticCurveTo(0, 0.32, -0.072, 0.45);
    contornoU.bezierCurveTo(-0.088, 0.53, -0.095, 0.7, -0.105, 0.84);
    contornoU.quadraticCurveTo(-0.125, 0.885, -0.145, 0.84);
    contornoU.bezierCurveTo(-0.168, 0.72, -0.16, 0.5, -0.16, 0.28);
    contornoU.bezierCurveTo(-0.16, 0.12, -0.11, 0.03, 0, 0.03);
    // pouca espessura e borda bem grossa e arredondada: de lado parece uma pastilha, não um bloco
    const geoMascara = new T.ExtrudeGeometry(contornoU, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.095, bevelSize: 0.03, bevelSegments: 8, curveSegments: 28 });
    geoMascara.computeBoundingBox();
    const centro = geoMascara.boundingBox.getCenter(new T.Vector3());
    geoMascara.center(); // centralizada, para o contorno (casca escalada) ficar por igual em volta
    // inclinada para trás, de frente para a câmera (que olha de cima): assim o U aparece aberto
    const rosto = pivo(cabeca);
    rosto.rotation.x = -0.42;
    parte(geoMascara, MASCARA, { pai: rosto, pos: [centro.x, centro.y, 0], contorno: 0.035 });
    // olhos grandes e ovais perto do queixo, inclinados para fora no alto
    const olhos = [-1, 1].map((l) =>
      parte(esfera(14), basico(0x101016), { pai: rosto, pos: [0.07 * l, 0.17, 0.112], esc: [0.05, 0.075, 0.03], rot: [0, 0.2 * l, -0.38 * l], contorno: 0 })
    );

    // braços pretos finíssimos e compridos (a mão fica para fora da capa), terminando em ponta:
    // braço (pivô no ombro) e antebraço (pivô no cotovelo)
    const cotovelos = [];
    const bracos = [-1, 1].map((l) => {
      const p = pivo(corpo, [0.09 * l, 0.5, 0]);
      tubo(p, [0, 0, 0], [0, -0.2, 0], 0.02, 0.014, PRETO, 0.01);
      const c = pivo(p, [0, -0.2, 0]);
      junta(c, 0.014);
      tubo(c, [0, 0, 0], [0, -0.22, 0], 0.014, 0.004, PRETO, 0.01);
      cotovelos.push(c);
      return p;
    });
    // agulha na mão direita (o eixo +Y aponta para a ponta), toda prateada: lâmina longa de seção
    // quadrada e facetada, ombro chanfrado, haste fina redonda (onde ela segura) e o olho na ponta de trás
    const agulha = pivo(cotovelos[1], [0, -0.2, 0]); // na mão (fim do antebraço)
    tubo(agulha, [0, 0.12, 0], [0, 0.92, 0], 0.042, 0.002, PRATA, 0.012, 4);
    tubo(agulha, [0, 0.07, 0], [0, 0.12, 0], 0.013, 0.042, PRATA, 0.012, 4);
    tubo(agulha, [0, -0.25, 0], [0, 0.07, 0], 0.012, 0.012, PRATA);
    parte(new T.TorusGeometry(0.04, 0.009, 8, 20), PRATA, { pai: agulha, pos: [0, -0.29, 0], contorno: 0.22 });
    const ponta = pivo(agulha, [0, 0.92, 0]);
    // linha de seda presa no olho da agulha
    const linha = pivo(agulha, [0, -0.33, 0]);
    const curva = new T.CatmullRomCurve3([[0, 0, 0], [0.03, -0.09, -0.02], [-0.01, -0.19, -0.06], [-0.05, -0.28, -0.04]].map((p) => new T.Vector3(...p)));
    linha.add(new T.Mesh(new T.TubeGeometry(curva, 16, 0.006, 5), basico(LINHA)));

    return {
      raiz, corpo, cabeca, olhos, bracos, cotovelos, pernas, joelhos, saia, saiaGeo, agulha, ponta, linha,
      saiaR0: 0.09, saiaR1: 0.42, saiaH: SAIA_H, saiaRad: SAIA_RAD, saiaSeg: SAIA_SEG,
      abre: 0, arrasto: 0, vento: 0.15,
      tipo: "hornet", altura: 1.92,
    };
  }

  const MONTAR = { pato: montarPato, palito: montarPalito, tartaruga: montarTartaruga, hornet: montarHornet };

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
  // para abrir as asas do pato (girar em volta de eixos, sem criar objetos a cada quadro)
  const EIXO_Y = T ? new T.Vector3(0, 1, 0) : null, EIXO_Z = T ? new T.Vector3(0, 0, 1) : null;
  const qBate = T ? new T.Quaternion() : null, qAbre = T ? new T.Quaternion() : null, qDeita = T ? new T.Quaternion() : null;
  const ANDANDO = { andar: 1, voltar: 1, buscar: 1, seguir: 1, perseguir: 1.6, arrastando: 0.8, segurando: 1.6, brincando: 1.6, trabalhando: 1.3, combate: 1.6, cacar: 1.6 };
  // Tecido da saia: cada vértice é recalculado a cada quadro. d = 0 no ombro, 1 na barra.
  // abre: planando (a capa abre como um paraquedas); arrasto: correndo (a barra vai para trás);
  // vento: o quanto a barra ondula e tremula.
  // Vestido: gola franzida em sino. Abre rápido a partir do pescoço e a barra forma 7 pétalas
  // arredondadas; os vincos entre elas começam lá no pescoço (aparece o magenta de dentro).
  // d = 0 no pescoço, 1 na barra. abre: planando (cúpula de água-viva); arrasto: correndo
  // (a barra vai para trás); vento: o quanto o tecido ondula e tremula.
  const COR_PETALA = T ? new T.Color(0xd02a36) : null, COR_VINCO = T ? new T.Color(0x6e1027) : null;
  function vestirHornet(m, abre, arrasto, vento, tempo) {
    const pos = m.saiaGeo.attributes.position, cor = m.saiaGeo.attributes.color;
    const N = m.saiaRad + 1;
    const balanco = Math.sin(tempo * 1.3) * 0.25;
    for (let i = 0; i < pos.count; i++) {
      const lin = Math.floor(i / N), col = i % N;
      const d = lin / m.saiaSeg, d2 = d * d;
      const th = (col / m.saiaRad) * TAU;
      const petala = 0.5 + 0.5 * Math.sin(th * 7 + balanco); // 1 no meio da pétala, 0 no vinco
      const franzido = 1 - abre * 0.92; // aberta em cúpula, o tecido fica liso (como no jogo)
      // perfil: sino fechado ou cúpula aberta
      // cúpula: topo largo e redondo logo abaixo da cabeça, borda curvando um pouco para dentro
      const fi = d * Math.PI * 0.58;
      let r = lerp(m.saiaR0 + (m.saiaR1 - m.saiaR0) * Math.sin(d * Math.PI / 2), 0.08 + 0.34 * Math.sin(fi), abre);
      let y = lerp(-d * m.saiaH, -0.36 * (1 - Math.cos(fi)), abre);
      // pétalas: avançam e descem na barra; vincos: entram e sobem
      r += d ** 0.8 * (0.065 * petala - 0.03) * franzido;
      y -= d2 * 0.05 * petala * franzido;
      // tecido no vento (suave, por cima das pétalas)
      r += d ** 1.5 * vento * (0.022 * Math.sin(th * 3 + tempo * 5.5) + 0.012 * Math.sin(th * 5 - tempo * 9));
      y += d2 * (arrasto * 0.12 + vento * 0.018 * Math.sin(th * 4 + tempo * 8));
      pos.setXYZ(i, Math.sin(th) * r, y, Math.cos(th) * r - arrasto * d2 * 0.22);
      // perto do pescoço quase sem contraste; na barra, vinco bem escuro
      const k = lerp(1, petala ** 0.7, Math.min(1, d * 1.5) * franzido);
      cor.setXYZ(i, lerp(COR_VINCO.r, COR_PETALA.r, k), lerp(COR_VINCO.g, COR_PETALA.g, k), lerp(COR_VINCO.b, COR_PETALA.b, k));
    }
    pos.needsUpdate = true;
    cor.needsUpdate = true;
    m.saiaGeo.computeVertexNormals();
  }

  // Inclina a Hornet inteira para a frente (ang > 0) ou para trás em volta do centro do corpo
  // (e não dos pés): usado no mergulho do pogo e no mortal.
  function girarNoCentro(m, ang, c = 0.75) {
    m.raiz.rotation.x = ang;
    const z = -c * Math.sin(ang);
    m.raiz.position.x += z * Math.sin(estado.yaw);
    m.raiz.position.y += c - c * Math.cos(ang);
    m.raiz.position.z += z * Math.cos(estado.yaw);
  }

  // Aponta a agulha numa direção dada no espaço do corpo (x = direita, y = cima, z = frente),
  // em vez de um ângulo relativo ao braço: assim ela fica sempre para fora da saia.
  // pega: onde fica o cabo (no espaço do corpo); sem pega, fica na mão.
  const _q = T ? new T.Quaternion() : null, _v = T ? new T.Vector3() : null, _Y = T ? new T.Vector3(0, 1, 0) : null, _M = T ? new T.Matrix4() : null;
  const _q2 = T ? new T.Quaternion() : null;
  function apontarAgulha(m, x, y, z, pega) {
    // a agulha está no antebraço: a rotação dele no espaço do corpo é ombro × cotovelo
    const b = m.bracos[1], c = m.cotovelos[1];
    b.updateMatrix();
    c.updateMatrix();
    _q.setFromUnitVectors(_Y, _v.set(x, y, z).normalize());
    _q2.copy(b.quaternion).multiply(c.quaternion);
    m.agulha.quaternion.copy(_q2).invert().multiply(_q);
    if (pega) m.agulha.position.set(...pega).applyMatrix4(_M.multiplyMatrices(b.matrix, c.matrix).invert());
    else m.agulha.position.set(0, -0.2, 0);
  }

  function animarHornet(m, s, dt, anda, t, extraYaw) {
    const anim = s.anim, rel = s.relogio;
    const tipo = s.acao?.tipo, ta = s.acao?.t || 0;
    const correndo = anda && (estado.vel || 0) > 20;
    const PI = Math.PI;
    // perna: quadril (para a frente < 0), joelho (dobra para trás > 0), abertura para o lado
    const perna = (i, quadril, joelho, lado = 0) => {
      m.pernas[i].rotation.set(quadril, 0, lado);
      m.joelhos[i].rotation.x = joelho;
    };
    // braço: ombro para a frente (< 0), abertura para o lado, cotovelo (dobra para a frente < 0)
    const braco = (i, frente, lado, cotovelo = 0) => {
      m.bracos[i].rotation.set(frente, 0, lado);
      m.cotovelos[i].rotation.x = cotovelo;
    };
    // pose base: em pé com os joelhos soltos, agulha cruzando a frente do corpo
    m.corpo.position.set(0, 0.44 + Math.sin(rel * 2.2) * 0.005, 0);
    m.cabeca.rotation.set(0, Math.sin(rel * 0.7) * 0.08, 0);
    perna(0, -0.04, 0.08, -0.03);
    perna(1, -0.02, 0.06, 0.03);
    braco(0, 0.1, -0.35, -0.25 - Math.sin(rel * 2.2) * 0.03);
    braco(1, -0.5, 0.12, -0.15);
    let agulha = [-0.75, -0.38, 0.32], pega = null;
    let abre = 0, arrasto = 0, vento = 0.15;

    if (tipo === "storm") {
      // gira no lugar com a agulha para o alto; os laços de seda são desenhados em 2D pelo overlay
      extraYaw.v = ta * 24;
      m.raiz.position.y = 0.06;
      braco(1, -2.9, 0.15, -0.2);
      agulha = [0, 1, 0.15];
      braco(0, 0, -1.3, -0.5);
      perna(0, -0.5, 0.9);
      perna(1, 0.2, 0.4);
      abre = 0.55;
      vento = 1;
    } else if (tipo === "golpe") {
      // estocada: o braço estica de uma vez, avança a perna da frente e a de trás dobra
      const p = ta < 0.07 ? ta / 0.07 : Math.max(0, 1 - (ta - 0.16) / 0.14);
      const k = Math.min(1, ta / 0.07);
      m.corpo.rotation.x = 0.4 * p;
      braco(1, lerp(0.9, -1.6, k), 0.15, lerp(-1.4, 0, k));
      agulha = [0.05, lerp(-0.6, 0.05, p), 1];
      braco(0, 0.9 * p, -0.3, -0.6);
      perna(0, -0.8 * p, 0.35 * p);
      perna(1, 0.55 * p, 0.7 * p);
      m.raiz.position.z = 0.14 * p;
      arrasto = 0.7;
      vento = 0.7;
    } else if (tipo === "pogo") {
      // mergulho na diagonal (45°): corpo inclinado, joelhos encolhidos, agulha no eixo do corpo
      girarNoCentro(m, 0.78);
      perna(0, -0.7, 1.3);
      perna(1, -0.35, 1.5);
      braco(1, -0.35, 0.12);
      agulha = [0, -1, 0.12];
      pega = [0.03, 0.06, 0.26];
      braco(0, 0.6, -0.6, -0.9);
      abre = 0.3;
      vento = 1;
    } else if (tipo === "mortal") {
      // como no jogo: vira rápido de cabeça para baixo, fica pendurada invertida no alto do
      // quique (a capa abre para cima como pétalas) e só então completa a volta e se endireita
      let ang;
      if (ta < 0.15) ang = -PI * Math.sin((ta / 0.15) * PI / 2);
      else if (ta < 0.6) ang = -PI + Math.sin((ta - 0.15) * 9) * 0.06;
      else ang = -PI - PI * Math.sin(Math.min(1, (ta - 0.6) / 0.22) * PI / 2);
      girarNoCentro(m, ang);
      const encolhe = ta < 0.15 || ta > 0.6 ? 1 : 0.4; // invertida, as pernas soltam um pouco
      perna(0, -1.3 * encolhe, 2.0 * encolhe);
      perna(1, -1.1 * encolhe, 2.1 * encolhe);
      braco(0, -0.8, -0.5, -1.0);
      braco(1, -0.6, 0.4, -0.6);
      agulha = [0.6, -0.4, 0.6];
      abre = ta > 0.15 && ta < 0.6 ? 0.55 : 0.25;
      vento = 1;
    } else if (tipo === "salto") {
      // impulso: pernas dobradas para cima
      m.corpo.rotation.x = 0.2;
      perna(0, -1.1, 1.6);
      perna(1, -0.5, 1.2);
      braco(0, 0.7, -0.5, -0.6);
      braco(1, 0.6, 0.6, -0.3);
      agulha = [0.4, -0.5, -0.6];
      abre = 0.3;
      vento = 0.8;
    } else if (tipo === "dash") {
      // sprint como no jogo: tronco quase deitado para a frente, cabeça olhando à frente,
      // passada bem rápida, capa reta para trás e a agulha junto às costas apontando para trás
      const f = t * 22;
      for (const i of [0, 1]) {
        const fase = f + i * PI;
        perna(i, -Math.sin(fase) * 0.95 - 0.15, 0.3 + Math.max(0, Math.cos(fase)) * 1.7);
      }
      m.corpo.rotation.set(0.85, 0, 0);
      m.cabeca.rotation.set(0.15, 0, 0); // a máscara vai inclinada para a frente, como no jogo
      m.raiz.position.y = Math.abs(Math.cos(f)) * 0.03 - 0.04;
      braco(0, 1.2, -0.25, -0.3);
      braco(1, 1.1, 0.3, -0.2);
      agulha = [0.1, 0.3, -1];
      arrasto = 1;
      vento = 1;
    } else if (tipo === "pouso") {
      // agacha ao tocar o chão: joelhos dobram e o corpo desce; a capa assenta
      const p = Math.sin(Math.min(1, ta / 0.4) * PI);
      m.corpo.position.y -= 0.14 * p;
      m.corpo.rotation.x = 0.3 * p;
      perna(0, -0.9 * p, 1.6 * p, -0.25 * p);
      perna(1, -0.6 * p, 1.4 * p, 0.25 * p);
      braco(0, -0.3 * p, -0.6 - 0.4 * p, -0.5);
      braco(1, -0.2, 0.5 + 0.5 * p, -0.2);
      agulha = [0.7, -0.55, 0.3];
      abre = 0.25 * (1 - Math.min(1, ta / 0.4));
      vento = 0.8;
    } else if (s.planando) {
      // como no jogo: cúpula lisa com a cabeça em cima, pernas juntas e retas penduradas,
      // agulha passando por baixo da cúpula quase na horizontal (ponta um pouco para baixo, à frente)
      perna(0, 0.04 + Math.sin(rel * 2.1) * 0.03, 0.06, 0.03);
      perna(1, 0.08 + Math.sin(rel * 2.1 + 1.5) * 0.03, 0.08, -0.03);
      // as mãos ficam escondidas dentro da cúpula
      braco(0, 0, 0.15, -1.2);
      braco(1, 0, -0.15, -1.2);
      agulha = [0.82, -0.32, 0.42];
      pega = [-0.24, -0.04, 0.2];
      m.corpo.rotation.x = 0.05;
      m.cabeca.rotation.x = 0.06;
      m.raiz.rotation.z = Math.sin(rel * 1.7) * 0.05;
      m.raiz.position.y = Math.sin(rel * 2.3) * 0.025;
      abre = 1;
      vento = 0.7;
    } else if (anim === "caindo") {
      braco(0, 0, -2.4 + Math.sin(rel * 16) * 0.3, -0.4);
      braco(1, 0, 2.0 + Math.sin(rel * 16 + 2) * 0.3, -0.3);
      agulha = [0.7, 0.5, 0.3];
      for (const i of [0, 1]) perna(i, Math.sin(rel * 14 + i * 3) * 0.5, 0.5 + Math.sin(rel * 14 + i * 3 + 1) * 0.5);
      abre = 0.4;
      vento = 1;
    } else if (correndo) {
      // corrida elegante: braços baixos junto do corpo (a capa cai por cima sem embolar),
      // passada fluida, tronco firme e cabeça estável; só as pernas fazem o trabalho
      const f = t * 14;
      for (const i of [0, 1]) {
        const fase = f + i * PI;
        // o quadril é -sen(fase): a perna vai para a frente quando cos(fase) > 0, e é aí que o
        // joelho dobra (perna recolhida passando por baixo); no chão ela fica esticada e empurra para trás
        const joelho = 0.2 + Math.max(0, Math.cos(fase)) * 1.4;
        perna(i, -Math.sin(fase) * 0.75, joelho);
      }
      m.corpo.rotation.set(0.32, Math.sin(f) * 0.05, Math.sin(f) * 0.02);
      m.cabeca.rotation.set(-0.16, -Math.sin(f) * 0.04, 0);
      m.raiz.position.y = Math.abs(Math.cos(f)) * 0.025;
      braco(0, 0.25 + Math.sin(f) * 0.12, -0.18, -0.15);
      braco(1, 0.15 - Math.sin(f) * 0.08, 0.2, -0.1);
      agulha = [0.15, -0.45, 0.88]; // baixa, apontando para a frente, por baixo da barra da capa
      arrasto = 0.6;
      vento = 0.6;
    } else if (anim === "carregado") {
      // pendurada pela ponta da agulha, segurada acima da cabeça, balançando as pernas
      braco(1, 0, 2.55, -0.15);
      agulha = [0.3, 1, 0.1]; // ao lado da cabeça, sem sumir atrás das pontas da máscara
      braco(0, 0, -0.5 + Math.sin(rel * 3) * 0.1, -0.5);
      for (const i of [0, 1]) perna(i, Math.sin(rel * 5 + i * 2) * 0.35, 0.35 + Math.sin(rel * 5 + i * 2 + 1.2) * 0.35);
      m.raiz.rotation.z = Math.sin(rel * 2.4) * 0.08;
      m.cabeca.rotation.x = -0.15;
      abre = 0.2;
      vento = 0.5;
    } else if (anim === "bravo" || anim === "travessura") {
      // guarda: base larga com os joelhos flexionados, agulha apontada para a frente
      m.corpo.position.y -= 0.05;
      m.corpo.rotation.x = 0.18;
      perna(0, -0.45, 0.6, -0.22);
      perna(1, 0.25, 0.5, 0.22);
      braco(1, -1.35 + (anim === "travessura" ? Math.sin(t * 14) * 0.15 : 0), 0.3, -0.2);
      agulha = [0.1, 0.1, 1];
      braco(0, 0.2, -0.65, -0.9);
      m.raiz.position.y = Math.abs(Math.sin(t * 8)) * 0.012;
      m.cabeca.rotation.x = 0.1;
      vento = 0.3;
    } else if (anim === "acenando") {
      // reverência educada: inclina, dobra um pouco os joelhos e leva a mão livre ao peito
      const p = Math.sin(Math.min(1, t / 1.4) * PI);
      m.corpo.rotation.x = 0.32 * p;
      m.cabeca.rotation.x = 0.22 * p;
      perna(0, -0.15 * p, 0.3 * p);
      perna(1, 0.2 * p, 0.35 * p);
      braco(0, -0.7 * p, -0.3 + 0.5 * p, -1.4 * p);
      agulha = [0.35, -0.9, 0.15];
    } else if (anim === "feliz") {
      // pulinhos: os joelhos dobram na hora de tocar o chão
      const pulo = Math.abs(Math.sin(t * 7));
      m.raiz.position.y = pulo * 0.07;
      for (const i of [0, 1]) perna(i, -0.2 * (1 - pulo), 0.5 * (1 - pulo));
      m.corpo.position.y -= 0.04 * (1 - pulo);
      m.cabeca.rotation.z = Math.sin(t * 5) * 0.08;
      vento = 0.4;
    } else if (anim === "dormindo") {
      m.corpo.rotation.x = 0.22;
      m.corpo.position.y -= 0.04;
      m.cabeca.rotation.set(0.45, 0, 0.1);
      perna(0, -0.15, 0.3);
      perna(1, -0.1, 0.3);
      braco(0, 0, -0.2, -0.3);
      agulha = [0.3, -0.9, 0.2];
      vento = 0.05;
    } else if (anim === "pensando") {
      m.cabeca.rotation.z = 0.25;
      braco(0, -1.1, 0.3, -1.6); // mão no queixo
    } else if (anim === "tonto") {
      m.raiz.rotation.z = Math.sin(rel * 7) * 0.15;
      m.cabeca.rotation.y = Math.sin(rel * 9) * 0.5;
      for (const i of [0, 1]) perna(i, Math.sin(rel * 7 + i) * 0.2, 0.3);
    }

    apontarAgulha(m, ...agulha, pega);
    m.abre = lerp(m.abre, abre, Math.min(1, dt * (abre > m.abre ? 16 : 6))); // abre de estalo, fecha devagar
    m.arrasto = lerp(m.arrasto, arrasto, Math.min(1, dt * 6));
    m.vento = lerp(m.vento, vento, Math.min(1, dt * 5));
    vestirHornet(m, m.abre, m.arrasto, m.vento, rel);
    m.linha.rotation.set(m.arrasto * 0.6, 0, Math.sin(rel * 3) * 0.3);
  }

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
    for (const o of m.olhos) o.scale.y = (fechado ? 0.15 : 1) * ({ pato: 0.032, tartaruga: 0.07, hornet: 0.07 }[m.tipo] || 0.04);
    const extraYaw = { v: 0 };

    if (m.tipo === "pato") {
      m.corpo.position.y = 0.42 + respira;
      m.pescoco.rotation.set(0, 0, 0);
      m.cabeca.rotation.set(0, 0, 0);
      m.bicoBaixo.rotation.set(0, 0, 0);
      m.bicoBaixo.position.y = -0.03;
      for (const a of m.asas) {
        a.rotation.order = "XYZ";
        a.rotation.set(0, 0, 0);
      }
      for (const p of m.pernas) {
        p.p.rotation.set(0, 0, 0);
        p.pe.rotation.set(0, 0, 0);
      }
      const asa = (abre, bate = 0) => m.asas.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * -(abre + bate)));
      // asas abertas de verdade: a parte comprida (que aponta para trás) gira para o lado
      // e a ponta sobe. abre 0..1 (1 = esticada para o lado), sobe em radianos.
      // A asa é uma placa em pé encostada no corpo, com a ponta para trás. Para abrir: deita a placa
      // (gira no próprio comprimento), aponta a ponta para fora e bate em volta do eixo do corpo.
      const abrir = (abre, sobe = 0) =>
        m.asas.forEach((a, i) => {
          const l = i ? 1 : -1;
          qBate.setFromAxisAngle(EIXO_Z, l * sobe);
          qAbre.setFromAxisAngle(EIXO_Y, -l * (Math.PI / 2) * abre);
          qDeita.setFromAxisAngle(EIXO_Z, -l * (Math.PI / 2) * abre);
          a.quaternion.copy(qBate).multiply(qAbre).multiply(qDeita);
        });
      if (s.voando) {
        // voando: asas abertas batendo rápido, patinhas recolhidas, corpo subindo e descendo
        const bate = Math.sin(s.relogio * 16);
        abrir(1, 0.15 + bate * 0.65);
        m.corpo.rotation.x = 0.2;
        m.corpo.position.y += bate * 0.03;
        m.pernas.forEach(({ p, pe }) => {
          p.rotation.x = -0.8;
          pe.rotation.x = 0.6;
        });
        m.pescoco.rotation.x = 0.1;
        m.bicoBaixo.rotation.x = 0.35; // segurando o papel
      } else if (anda) {
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
          abrir(0.75, 0.2 + Math.sin(T5 * TAU * 3) * 0.3 + Math.max(0, lado) * 0.15);
          m.cabeca.rotation.z = -lado * 0.3;
          m.pescoco.rotation.x = Math.sin((T5 - 2.6) * TAU * 2) * 0.12;
          m.bicoBaixo.rotation.x = Math.sin(T5 * TAU * 2.5) > 0.7 ? 0.3 : 0;
        }
      } else if (anim === "caindo") {
        if (s.planando) {
          abrir(1, 0.25 + Math.sin(s.relogio * 3) * 0.12);
          m.corpo.rotation.x = 0.25;
          m.pernas.forEach(({ p }) => (p.rotation.x = -0.9));
        } else {
          asa(1.0, Math.sin(s.relogio * 22) * 0.5);
          m.pernas.forEach(({ p }, i) => (p.rotation.x = Math.sin(s.relogio * 18 + i * 3) * 0.5));
        }
      } else if (anim === "carregado") {
        abrir(0.9, Math.sin(s.relogio * 20) * 0.5);
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
        abrir(0.8, Math.sin(t * 14) * 0.45);
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
      m.corpo.position.y = 0.3 * k + 0.08 * (1 - k) + respira * 0.5; // em pé, as patas seguram o corpo mais alto
      m.cabecaP.position.set(0, 0.1 - 0.05 * (1 - k), 0.05 + 0.27 * k);
      m.cabecaP.scale.setScalar(Math.max(0.001, k));
      m.rabo.scale.setScalar(Math.max(0.001, k));
      m.patas.forEach((p) => p.scale.setScalar(Math.max(0.001, k)));
      m.cabeca.rotation.set(0, 0, 0);
      m.boca.rotation.z = anim === "bravo" ? 0 : Math.PI;
      m.boca.position.y = anim === "bravo" ? -0.1 : -0.07;
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
    } else if (m.tipo === "hornet") {
      animarHornet(m, s, dt, anda, t, extraYaw);
    }
    return extraYaw.v;
  }

  // ---------- renderização ----------
  // Devolve { canvas, x, y, w, h } (em px de tela) para o overlay copiar, ou null se não deu.
  // ponto do mundo 3D que segura as coisas (já com a posição/rotação deste quadro)
  function pontoDaBoca(m) {
    // um pouco além da ponta do bico: a seta do mouse fica na frente da cara, e não por cima da cabeça
    if (m.tipo === "pato") return m.bicoCima.localToWorld(new T.Vector3(0, -0.5, 2.2));
    if (m.tipo === "tartaruga") return m.cabeca.localToWorld(new T.Vector3(0.03, -0.07, 0.33));
    if (m.tipo === "palito") return m.bracos[1].localToWorld(new T.Vector3(0, -0.36, 0));
    if (m.tipo === "hornet") return m.ponta.localToWorld(new T.Vector3(0, 0, 0));
    return null;
  }

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
      estado.vel = Math.hypot(vx, vy);
      const movendo = ANDANDO[s.estado] && estado.vel > 15;
      // puxando algo (mouse, bilhete), ele anda de costas: olha para o lado contrário do movimento
      if (movendo) estado.alvoYaw = Math.atan2(vx, vy / ELEVACAO) + (s.deCostas ? Math.PI : 0);
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
    const x0 = s.x - larg / 2, y0 = s.y - alt * 0.82;
    // onde fica a "boca" na tela (bico do Pato, boca da Tartaruga, mão do Palito): é com ela que ele
    // morde/segura o mouse e os bilhetes. Muda com o ângulo, então é calculada a cada quadro.
    const p = pontoDaBoca(modelo);
    let boca = null;
    if (p) {
      p.project(camera);
      boca = { x: x0 + ((p.x + 1) / 2) * larg, y: y0 + ((1 - p.y) / 2) * alt };
    }
    return { canvas: renderer.domElement, x: x0, y: y0, w: larg, h: alt, topo: s.y - s.alturaPx, boca };
  }

  // ---------- objetos soltos na tela (o Caranid que a Hornet enfrenta) ----------
  // Têm cena e renderizador próprios: são desenhados depois do pet, cada um no seu lugar.
  // Caranid: besourinho voador em bola, casca cinza-escura em gomos, espinhos, máscara clara
  // com duas pontinhas, olhos pretos, dentinhos e asas zumbindo. Fica centrado na origem, olhando para +z.
  function montarCaranid() {
    const raiz = new T.Group();
    const CASCA = 0x34313b, ESCURO = 0x16151b, MASCARA = 0xdcd9e0;
    const corpo = pivo(raiz);
    parte(esfera(28), CASCA, { pai: corpo, esc: [0.32, 0.3, 0.32], contorno: 0.05 });
    // gomos da casca: anéis em volta do corpo, nas costas
    for (const z of [-0.06, -0.17]) {
      const r = Math.sqrt(0.32 * 0.32 - z * z) * 0.98;
      parte(new T.TorusGeometry(r, 0.014, 6, 32), ESCURO, { pai: corpo, pos: [0, 0, z], esc: [1, 0.94, 1], contorno: 0 });
    }
    // espinhos curtos apontando para fora
    for (const [x, y, z] of [[0.9, 0.2, -0.4], [-0.9, 0.2, -0.4], [0.7, -0.6, -0.2], [-0.7, -0.6, -0.2], [0, -0.9, -0.4], [0, 0.6, -0.8], [0.4, -0.2, -0.9], [-0.4, -0.2, -0.9]]) {
      const d = new T.Vector3(x, y, z).normalize();
      const e = parte(new T.ConeGeometry(0.045, 0.14, 8), ESCURO, { pai: corpo, contorno: 0.12 });
      e.position.copy(d).multiplyScalar(0.33);
      e.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
    }
    // máscara na frente, com duas pontinhas para cima e para fora
    const rosto = pivo(corpo, [0, 0.03, 0.24]);
    parte(esfera(24), MASCARA, { pai: rosto, esc: [0.25, 0.2, 0.12], contorno: 0.06 });
    for (const l of [-1, 1]) {
      parte(new T.ConeGeometry(0.06, 0.17, 12), MASCARA, { pai: rosto, pos: [0.15 * l, 0.2, -0.01], rot: [0, 0, -0.45 * l], contorno: 0.08 });
    }
    for (const l of [-1, 1]) {
      parte(esfera(12), basico(0x0f0f13), { pai: rosto, pos: [0.085 * l, 0.03, 0.1], esc: [0.05, 0.065, 0.03], rot: [0, 0, 0.3 * l], contorno: 0 });
    }
    // boca com dentinhos
    parte(new T.BoxGeometry(0.15, 0.028, 0.01), basico(0x0f0f13), { pai: rosto, pos: [0, -0.085, 0.108], contorno: 0 });
    for (let i = 0; i < 4; i++) {
      parte(new T.ConeGeometry(0.014, 0.03, 4), basico(0xffffff), { pai: rosto, pos: [-0.052 + i * 0.035, -0.08, 0.112], rot: [Math.PI, 0, 0], contorno: 0 });
    }
    // asas translúcidas nas costas (batem muito rápido)
    const matAsa = new T.MeshBasicMaterial({ color: 0xe8e8f0, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
    const asas = [-1, 1].map((l) => {
      const p = pivo(corpo, [0.12 * l, 0.22, -0.12]);
      const asa = new T.Mesh(new T.CircleGeometry(1, 20), matAsa);
      asa.scale.set(0.3, 0.13, 1);
      asa.position.set(0.26 * l, 0.04, 0);
      asa.rotation.set(-0.5, 0, 0.35 * l);
      p.add(asa);
      return p;
    });
    return { raiz, corpo, asas };
  }

  let rObj = null, cenaObj = null, camObj = null;
  const OBJETOS = { caranid: montarCaranid };
  const objetos = {};
  // s = { tipo, x, y (centro na tela), tamPx, dir (1 = olha para a direita), t, vivo, giro, dpr }
  // Devolve { canvas, x, y, w, h } para o overlay copiar, ou null se não deu.
  function desenharObjeto(s) {
    if (!OBJETOS[s.tipo]) return null;
    if (!rObj) {
      if (rObj === false) return null;
      try {
        rObj = new T.WebGLRenderer({ canvas: document.createElement("canvas"), alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
        rObj.setClearColor(0x000000, 0);
        cenaObj = new T.Scene();
        cenaObj.add(new T.AmbientLight(0xffffff, 1.4));
        const sol = new T.DirectionalLight(0xffffff, 2.2);
        sol.position.set(-2, 4, 3);
        cenaObj.add(sol);
        const meia = 0.7;
        camObj = new T.OrthographicCamera(-meia, meia, meia, -meia, 0.1, 50);
        camObj.position.set(0, Math.sin(ELEVACAO), Math.cos(ELEVACAO)).multiplyScalar(10);
        camObj.lookAt(0, 0, 0);
      } catch (e) {
        console.error("[3d] objetos sem WebGL:", e);
        rObj = false;
        return null;
      }
    }
    let m = objetos[s.tipo];
    if (!m) {
      m = objetos[s.tipo] = OBJETOS[s.tipo]();
      cenaObj.add(m.raiz);
    }
    for (const [k, o] of Object.entries(objetos)) o.raiz.visible = k === s.tipo;
    // olha de lado (3/4) para onde está indo; morto, gira caindo
    m.raiz.rotation.set(0, s.dir > 0 ? 0.95 : -0.95, s.vivo ? Math.sin(s.t * 4) * 0.12 : s.giro);
    m.corpo.position.y = s.vivo ? Math.sin(s.t * 6) * 0.02 : 0;
    const bate = s.vivo ? Math.sin(s.t * 70) * 0.6 : 0;
    m.asas.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * bate));
    const px = Math.max(8, Math.round(s.tamPx)), dpr = s.dpr || 1;
    if (rObj.domElement.width !== Math.round(px * dpr)) {
      rObj.setPixelRatio(dpr);
      rObj.setSize(px, px, false);
    }
    rObj.render(cenaObj, camObj);
    return { canvas: rObj.domElement, x: s.x - px / 2, y: s.y - px / 2, w: px, h: px };
  }

  return { tem: (d) => !!MONTAR[d], desenhar, desenharObjeto };
})();