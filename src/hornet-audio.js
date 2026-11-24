// Sons da Hornet, sintetizados na hora (Web Audio API, sem arquivos de áudio).
window.HornetSom = (() => {
  let audio = null;
  function contexto() {
    if (!audio) {
      // window.AudioContext: o three.cjs declara uma "class AudioContext" global que esconde a nativa
      audio = new window.AudioContext();
      const mestre = audio.createGain();
      mestre.gain.value = 0.7;
      mestre.connect(audio.destination);
      audio.mestre = mestre;
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
  }
  function ruido(c, segundos, cor = 1) {
    const n = Math.max(1, Math.floor(c.sampleRate * segundos));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * cor;
    const fonte = c.createBufferSource();
    fonte.buffer = buf;
    return fonte;
  }
  function envelope(c, t, pico, ataque, fim) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pico, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fim);
    return g;
  }

  // ---------- voz: síntese por formantes ----------
  // Uma "corda vocal" (onda dente-de-serra com o tom subindo e descendo, um pouco de vibrato e de
  // sopro) passa por 3 filtros que imitam as ressonâncias da boca (formantes F1, F2, F3): cada vogal
  // é uma combinação dessas 3 frequências. Consoantes: ruído filtrado ("sh", "h"), estalos curtos
  // ("d", "g") e murmúrio nasal ("n", "m"). Voz feminina aguda, curta e firme, como a dela.
  const VOGAIS = {
    a: [850, 1350, 2850], e: [560, 2150, 2900], i: [330, 2750, 3300],
    o: [520, 950, 2750], u: [380, 900, 2650], ó: [660, 1050, 2800], // ó = o "aw" do "shaw"
    n: [270, 1500, 2600], m: [260, 1100, 2500], l: [380, 1300, 2700],
  };
  // fonema: [tipo, duração (s), vogal/formantes, tom inicial (Hz), tom final, volume]
  // tipos: v = vogal, n = nasal, l = líquida, sh = chiado, h = sopro, p = estalo (d/g)
  const PALAVRAS = {
    shaw: [["sh", 0.12, "ó"], ["v", 0.3, "ó", 560, 330, 1]],
    adino: [["v", 0.09, "a", 430, 470, 0.9], ["p", 0.035, "i", 3800], ["v", 0.08, "i", 500, 520, 0.85], ["n", 0.05, "n", 470, 450, 0.5], ["v", 0.2, "o", 470, 320, 1]],
    hegale: [["h", 0.05, "e"], ["v", 0.09, "e", 440, 470, 0.85], ["p", 0.03, "a", 1700], ["v", 0.1, "a", 500, 520, 1], ["l", 0.045, "l", 480, 470, 0.6], ["v", 0.19, "e", 470, 330, 0.95]],
    ha: [["h", 0.04, "a"], ["v", 0.13, "a", 470, 380, 0.9]],
    hup: [["h", 0.03, "u"], ["v", 0.09, "u", 430, 480, 0.8], ["p", 0.04, "u", 900]],
    hm: [["n", 0.22, "m", 300, 260, 0.45]],
  };
  const VOLUME = { shaw: 1.6, adino: 2, hegale: 2.2, ha: 2.6, hup: 3.2, hm: 2.2 };
  function voz(c, nome, tom = 1) {
    const seq = PALAVRAS[nome];
    const t0 = c.currentTime + 0.01;
    const total = seq.reduce((s, f) => s + f[1], 0) + 0.06;
    const saida = c.createGain();
    saida.gain.value = VOLUME[nome]; // iguala o volume das palavras (e fica junto com os efeitos)
    saida.connect(c.mestre);
    // fonte vozeada: dente-de-serra suavizada + vibrato leve
    const cordas = c.createOscillator();
    cordas.type = "sawtooth";
    const vib = c.createOscillator(), vibG = c.createGain();
    vib.frequency.value = 6.5;
    vibG.gain.value = 7;
    vib.connect(vibG).connect(cordas.frequency);
    const suave = c.createBiquadFilter();
    suave.type = "lowpass";
    suave.frequency.value = 4200;
    const gVoz = c.createGain();
    gVoz.gain.setValueAtTime(0, t0);
    cordas.connect(suave).connect(gVoz);
    // sopro (ruído) que também passa pelas formantes: o "h" e a respiração da voz
    const sopro = ruido(c, total + 0.1);
    const gSopro = c.createGain();
    gSopro.gain.setValueAtTime(0, t0);
    sopro.connect(gSopro);
    // banco de formantes em paralelo
    const formantes = [0, 1, 2].map((k) => {
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = [7, 11, 14][k];
      const g = c.createGain();
      g.gain.value = [1, 0.55, 0.28][k];
      gVoz.connect(f);
      gSopro.connect(f);
      f.connect(g).connect(saida);
      return f;
    });
    // chiados e estalos: ruído num filtro próprio
    const chiado = ruido(c, total + 0.1);
    const fChiado = c.createBiquadFilter();
    fChiado.type = "bandpass";
    fChiado.Q.value = 2.2;
    const gChiado = c.createGain();
    gChiado.gain.setValueAtTime(0, t0);
    chiado.connect(fChiado).connect(gChiado).connect(saida);

    let t = t0;
    const rampa = (param, v, quando) => param.linearRampToValueAtTime(v, quando);
    for (const [tipo, dur, chave, p0, p1, vol = 1] of seq) {
      const F = VOGAIS[chave];
      // coarticulação: as formantes deslizam para a próxima vogal em ~25 ms
      formantes.forEach((f, k) => f.frequency.setTargetAtTime(F[k], t, 0.012));
      if (tipo === "v" || tipo === "n" || tipo === "l") {
        cordas.frequency.setValueAtTime(p0 * tom, t);
        cordas.frequency.linearRampToValueAtTime(p1 * tom, t + dur);
        rampa(gVoz.gain, 0.5 * vol, t + 0.015);
        rampa(gSopro.gain, 0.04, t + 0.015);
        rampa(gChiado.gain, 0, t + 0.01);
        rampa(gVoz.gain, 0.5 * vol, t + dur - 0.012);
      } else if (tipo === "sh") {
        fChiado.frequency.setValueAtTime(3300, t);
        rampa(gChiado.gain, 0.55, t + 0.03);
        rampa(gChiado.gain, 0.45, t + dur - 0.02);
        rampa(gVoz.gain, 0, t + 0.01);
      } else if (tipo === "h") {
        rampa(gSopro.gain, 0.35, t + 0.02);
        rampa(gVoz.gain, 0, t + 0.01);
        rampa(gChiado.gain, 0, t + 0.01);
      } else if (tipo === "p") {
        // boca fechada (silêncio) e o estalo da soltura no fim
        rampa(gVoz.gain, 0, t + 0.008);
        rampa(gSopro.gain, 0, t + 0.008);
        fChiado.frequency.setValueAtTime(p0, t);
        gChiado.gain.setValueAtTime(0, t + dur - 0.012);
        rampa(gChiado.gain, 0.5, t + dur - 0.004);
        rampa(gChiado.gain, 0, t + dur + 0.012);
      }
      t += dur;
    }
    // final da palavra: solta o ar e some
    rampa(gVoz.gain, 0, t + 0.05);
    rampa(gSopro.gain, 0, t + 0.05);
    rampa(gChiado.gain, 0, t + 0.03);
    for (const fonte of [cordas, vib, sopro, chiado]) {
      fonte.start(t0);
      fonte.stop(t + 0.08);
    }
  }

  // Thread Storm: chiado de seda girando, subindo de tom
  function storm(c) {
    const t = c.currentTime;
    const n = ruido(c, 1.3, 0.7);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 5;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 18; // o "fru-fru-fru" dos fios girando
    lfoG.gain.value = 0.12;
    const g = envelope(c, t, 0.25, 0.08, 1.3);
    lfo.connect(lfoG).connect(g.gain);
    n.connect(f).connect(g).connect(c.mestre);
    n.start(t);
    lfo.start(t);
    lfo.stop(t + 1.3);
  }
  // corte da agulha: "fiu" metálico rápido
  function golpe(c) {
    const t = c.currentTime;
    const n = ruido(c, 0.12);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
    n.connect(f).connect(envelope(c, t, 0.35, 0.005, 0.12)).connect(c.mestre);
    n.start(t);
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.08);
    o.connect(envelope(c, t, 0.12, 0.003, 0.09)).connect(c.mestre);
    o.start(t);
    o.stop(t + 0.1);
  }
  // acerto: pancada grave
  function hit(c) {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    o.connect(f).connect(envelope(c, t, 0.45, 0.003, 0.16)).connect(c.mestre);
    o.start(t);
    o.stop(t + 0.17);
    const n = ruido(c, 0.06);
    n.connect(envelope(c, t, 0.25, 0.002, 0.06)).connect(c.mestre);
    n.start(t);
  }
  // capa abrindo: lufada de vento
  function glide(c) {
    const t = c.currentTime;
    const n = ruido(c, 1.2);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(350, t + 1.1);
    n.connect(f).connect(envelope(c, t, 0.3, 0.05, 1.2)).connect(c.mestre);
    n.start(t);
  }
  // arrancada rápida
  function dash(c) {
    const t = c.currentTime;
    const n = ruido(c, 0.25);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.2);
    n.connect(f).connect(envelope(c, t, 0.18, 0.02, 0.25)).connect(c.mestre);
    n.start(t);
  }
  // pulo: "tup" curto subindo
  function pulo(c) {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.1);
    o.connect(envelope(c, t, 0.2, 0.005, 0.13)).connect(c.mestre);
    o.start(t);
    o.stop(t + 0.14);
  }
  // inimigo estourando: casca rachando
  function morte(c) {
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const n = ruido(c, 0.05);
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 4;
      f.frequency.value = 1400 - i * 350;
      n.connect(f).connect(envelope(c, t + i * 0.04, 0.3, 0.002, 0.05)).connect(c.mestre);
      n.start(t + i * 0.04);
    }
  }

  // pouso: baque abafado e um sopro de tecido
  function pouso(c) {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    o.connect(envelope(c, t, 0.3, 0.004, 0.14)).connect(c.mestre);
    o.start(t);
    o.stop(t + 0.15);
    const n = ruido(c, 0.25);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    n.connect(f).connect(envelope(c, t, 0.12, 0.01, 0.25)).connect(c.mestre);
    n.start(t);
  }

  const tocar = (fn) => () => {
    try {
      fn(contexto());
    } catch (e) {
      console.warn("[hornet] som falhou:", e.message);
    }
  };
  const vozDe = (nome) => tocar((c) => voz(c, nome, 0.96 + Math.random() * 0.08)); // tom varia um pouquinho a cada vez
  return {
    shaw: vozDe("shaw"), adino: vozDe("adino"), hegale: vozDe("hegale"), ha: vozDe("ha"), hup: vozDe("hup"), hm: vozDe("hm"),
    // para testes: sintetiza uma fala num contexto qualquer (ex.: OfflineAudioContext com .mestre)
    sintetizar: (c, nome) => voz(c, nome),
    storm: tocar(storm), golpe: tocar(golpe), hit: tocar(hit), glide: tocar(glide), dash: tocar(dash), pulo: tocar(pulo), morte: tocar(morte), pouso: tocar(pouso) };
})();
