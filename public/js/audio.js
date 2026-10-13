/* Audio : tout est synthétisé avec WebAudio (aucun fichier requis).
 * Si public/audio/manifest.json existe, ses fichiers remplacent les sons synthétisés correspondants.
 *   { "sfx": { "explosion": "sfx/boom.ogg", "hit": "sfx/clang.wav" }, "music": { "0": "music/calm.ogg", "2": "music/combat.ogg" } }
 */
(function () {
  const A = { ctx: null, on: false, vol: { master: 0.8, music: 0.55, sfx: 0.9, amb: 0.5 }, level: 0, samples: {}, musicBufs: {}, engines: {} };
  const PHRY = [0, 1, 3, 5, 7, 8, 10, 12];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- briques de base ---------- */
  function noiseBuffer(c, secs = 2, kind = 'white') {
    const n = Math.floor(c.sampleRate * secs), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let l = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
    return b;
  }
  function curve(amount = 30) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x)); }
    return c;
  }
  function env(g, t, a, peak, d, r, sus = 0) {
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  }
  function osc(c, dest, o) { // { type, f0, f1, t, dur, gain, a, r, filter:{type,f,q}, detune }
    const t = o.t, dur = o.dur;
    const os = c.createOscillator(); os.type = o.type || 'sine';
    os.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) os.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), t + dur);
    if (o.detune) os.detune.value = o.detune;
    const g = c.createGain(); env(g, t, o.a || 0.005, o.gain || 0.3, Math.max(0.01, dur - (o.a || 0.005)), o.r || 0.05);
    let last = os;
    if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filter.type; f.frequency.value = o.filter.f; f.Q.value = o.filter.q || 0.7; last.connect(f); last = f; }
    if (o.vib) { const l = c.createOscillator(); l.frequency.value = o.vib[0]; const lg = c.createGain(); lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + dur + 0.2); }
    last.connect(g); g.connect(dest);
    os.start(t); os.stop(t + dur + (o.r || 0.05) + 0.05);
    return g;
  }
  function burst(c, dest, o) { // bruit filtré : { t, dur, gain, f0, f1, q, type, kind, a }
    const s = c.createBufferSource(); s.buffer = o.buf || noiseBuffer(c, Math.max(0.3, o.dur + 0.1), o.kind || 'white');
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0, o.t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur);
    const g = c.createGain(); env(g, o.t, o.a || 0.003, o.gain || 0.4, o.dur, o.r || 0.05);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(o.t); s.stop(o.t + o.dur + (o.r || 0.05) + 0.1);
    return g;
  }
  function thump(c, dest, t, f0 = 120, f1 = 38, gain = 0.8, dur = 0.28) {
    osc(c, dest, { type: 'sine', f0, f1, t, dur, gain, a: 0.002, r: 0.08 });
  }

  /* ---------- bibliothèque de sons synthétisés : f(c, t, dest, o) ---------- */
  const SYN = {
    click(c, t, d) { osc(c, d, { type: 'square', f0: 1600, f1: 900, t, dur: 0.03, gain: 0.08, filter: { type: 'lowpass', f: 4000 } }); },
    uiOpen(c, t, d) { osc(c, d, { type: 'triangle', f0: 380, f1: 760, t, dur: 0.12, gain: 0.12 }); },
    step(c, t, d) { burst(c, d, { t, dur: 0.06, f0: 500, type: 'lowpass', gain: 0.2 }); thump(c, d, t, 90, 50, 0.25, 0.08); },
    dice(c, t, d) { for (let i = 0; i < 9; i++) { const tt = t + i * 0.045 + Math.random() * 0.02; burst(c, d, { t: tt, dur: 0.025, f0: 1800 + Math.random() * 3000, q: 4, gain: 0.16 * (1 - i / 11) }); osc(c, d, { type: 'sine', f0: 900 + Math.random() * 500, f1: 600, t: tt, dur: 0.03, gain: 0.05 }); } },

    hit(c, t, d) { burst(c, d, { t, dur: 0.12, f0: 1800, f1: 400, q: 0.8, gain: 0.5 }); thump(c, d, t, 160, 45, 0.9, 0.22); osc(c, d, { type: 'sawtooth', f0: 140, f1: 70, t, dur: 0.1, gain: 0.15, filter: { type: 'lowpass', f: 500 } }); },
    metal(c, t, d) { burst(c, d, { t, dur: 0.08, f0: 3200, q: 1.2, gain: 0.45 }); for (const [f, g] of [[820, 0.28], [1330, 0.2], [2150, 0.15], [3470, 0.1]]) osc(c, d, { type: 'sine', f0: f * (0.98 + Math.random() * 0.04), t, dur: 0.5, gain: g * 0.6, r: 0.4 }); thump(c, d, t, 110, 50, 0.45, 0.14); },
    ricochet(c, t, d) { for (const [f, dl] of [[2600, 0], [3700, 0.02], [5100, 0.04]]) osc(c, d, { type: 'sine', f0: f, f1: f * 0.8, t: t + dl, dur: 0.35, gain: 0.15, r: 0.25 }); burst(c, d, { t, dur: 0.05, f0: 6000, q: 2, gain: 0.3 }); osc(c, d, { type: 'sine', f0: 2200, f1: 5200, t: t + 0.02, dur: 0.12, gain: 0.07 }); },
    slash(c, t, d) { burst(c, d, { t, dur: 0.22, f0: 900, f1: 5200, q: 2, gain: 0.32 }); burst(c, d, { t: t + 0.15, dur: 0.1, f0: 300, type: 'lowpass', gain: 0.2 }); },
    miss(c, t, d) { burst(c, d, { t, dur: 0.28, f0: 400, f1: 2400, q: 1.5, gain: 0.22 }); },
    crit(c, t, d) { SYN.hit(c, t, d); thump(c, d, t, 90, 28, 1, 0.6); osc(c, d, { type: 'sawtooth', f0: 220, f1: 880, t, dur: 0.4, gain: 0.12, filter: { type: 'lowpass', f: 2200 } }); burst(c, d, { t: t + 0.02, dur: 0.5, f0: 6000, f1: 800, q: 0.8, gain: 0.25 }); },
    bump(c, t, d) { thump(c, d, t, 90, 35, 0.9, 0.3); burst(c, d, { t, dur: 0.15, f0: 400, type: 'lowpass', gain: 0.4 }); },
    ram(c, t, d) { SYN.explosion(c, t, d, { small: true }); SYN.metal(c, t, d); osc(c, d, { type: 'sawtooth', f0: 80, f1: 30, t, dur: 0.6, gain: 0.35, filter: { type: 'lowpass', f: 300 } }); },
    explosion(c, t, d, o = {}) {
      const L = o.small ? 0.7 : 1.5;
      burst(c, d, { t, dur: L, f0: 5000, f1: 90, type: 'lowpass', q: 0.6, gain: 1.0, r: L * 0.6 });
      burst(c, d, { t, dur: L * 0.5, f0: 800, f1: 120, type: 'bandpass', gain: 0.5 });
      thump(c, d, t, 95, 24, 1.2, L * 0.8);
      osc(c, d, { type: 'sawtooth', f0: 70, f1: 20, t, dur: L, gain: 0.35, filter: { type: 'lowpass', f: 160 } });
      if (!o.small) for (let i = 0; i < 5; i++) burst(c, d, { t: t + 0.25 + i * 0.13, dur: 0.1, f0: 2500 - i * 300, type: 'highpass', q: 0.5, gain: 0.12 });
    },
    destroy(c, t, d) { SYN.explosion(c, t, d); SYN.explosion(c, t + 0.35, d, { small: true }); for (let i = 0; i < 6; i++) SYN.metal(c, t + 0.5 + i * 0.17, d); },
    harpoon(c, t, d) { burst(c, d, { t, dur: 0.12, f0: 800, type: 'lowpass', gain: 0.5 }); thump(c, d, t, 200, 60, 0.7, 0.14); burst(c, d, { t: t + 0.03, dur: 0.4, f0: 600, f1: 3500, q: 2, gain: 0.28 }); osc(c, d, { type: 'sawtooth', f0: 420, f1: 300, t: t + 0.05, dur: 0.5, gain: 0.07, vib: [28, 14], filter: { type: 'bandpass', f: 900, q: 6 } }); },
    tetherHit(c, t, d) { SYN.metal(c, t, d); burst(c, d, { t: t + 0.05, dur: 0.3, f0: 200, type: 'lowpass', gain: 0.4 }); osc(c, d, { type: 'triangle', f0: 180, f1: 120, t: t + 0.05, dur: 0.4, gain: 0.12, vib: [40, 8] }); },
    reel(c, t, d) { for (let i = 0; i < 10; i++) { const tt = t + i * 0.08; burst(c, d, { t: tt, dur: 0.035, f0: 2200, q: 5, gain: 0.22 }); osc(c, d, { type: 'square', f0: 140, f1: 120, t: tt, dur: 0.04, gain: 0.06, filter: { type: 'lowpass', f: 500 } }); } },
    cut(c, t, d) { SYN.metal(c, t, d); burst(c, d, { t, dur: 0.18, f0: 5000, f1: 1500, q: 1, gain: 0.3 }); osc(c, d, { type: 'sine', f0: 700, f1: 160, t: t + 0.04, dur: 0.3, gain: 0.15 }); },
    fireball(c, t, d) { burst(c, d, { t, dur: 0.6, f0: 300, f1: 2400, q: 1.2, gain: 0.45, a: 0.05 }); osc(c, d, { type: 'sawtooth', f0: 90, f1: 260, t, dur: 0.5, gain: 0.2, filter: { type: 'lowpass', f: 900 } }); },
    ray(c, t, d) { for (let i = 0; i < 3; i++) { const tt = t + i * 0.09; osc(c, d, { type: 'sawtooth', f0: 1400, f1: 180, t: tt, dur: 0.22, gain: 0.12, filter: { type: 'lowpass', f: 3500 } }); burst(c, d, { t: tt, dur: 0.2, f0: 3000, f1: 400, q: 1, gain: 0.3 }); } },
    bolt(c, t, d) { burst(c, d, { t, dur: 0.1, f0: 1200, f1: 3500, q: 2, gain: 0.25 }); osc(c, d, { type: 'triangle', f0: 600, f1: 250, t, dur: 0.12, gain: 0.1 }); },
    roar(c, t, d) { // sanglier : growl grave + grain
      const L = 1.0;
      osc(c, d, { type: 'sawtooth', f0: 95, f1: 55, t, dur: L, gain: 0.5, a: 0.06, r: 0.3, vib: [32, 10], filter: { type: 'bandpass', f: 520, q: 1.5 } });
      osc(c, d, { type: 'sawtooth', f0: 190, f1: 90, t, dur: L, gain: 0.25, a: 0.06, r: 0.3, vib: [26, 18], filter: { type: 'bandpass', f: 1100, q: 2 } });
      burst(c, d, { t, dur: L, f0: 900, q: 0.9, gain: 0.3, a: 0.05, r: 0.3 });
      burst(c, d, { t: t + 0.05, dur: 0.5, f0: 220, type: 'lowpass', gain: 0.5, kind: 'brown' });
    },
    squeal(c, t, d) { osc(c, d, { type: 'sawtooth', f0: 900, f1: 1500, t, dur: 0.5, gain: 0.2, a: 0.03, vib: [18, 90], filter: { type: 'bandpass', f: 1800, q: 3 } }); osc(c, d, { type: 'triangle', f0: 1300, f1: 800, t: t + 0.25, dur: 0.3, gain: 0.12, vib: [22, 60] }); },
    horn(c, t, d) { // cor de guerre lointain
      for (const [f, g] of [[58, 0.35], [87, 0.25], [116, 0.18]]) osc(c, d, { type: 'sawtooth', f0: f * 0.97, f1: f, t, dur: 2.4, gain: g, a: 0.5, r: 1.2, filter: { type: 'lowpass', f: 700, q: 0.8 }, vib: [5, 1.5] });
      burst(c, d, { t, dur: 2.2, f0: 400, type: 'lowpass', gain: 0.15, a: 0.6, r: 1, kind: 'brown' });
    },
    engineSurge(c, t, d) { osc(c, d, { type: 'sawtooth', f0: 40, f1: 130, t, dur: 1.2, gain: 0.4, a: 0.1, r: 0.6, filter: { type: 'lowpass', f: 900 }, vib: [22, 6] }); burst(c, d, { t, dur: 1.3, f0: 300, f1: 1800, q: 1, gain: 0.2, a: 0.2, r: 0.5 }); },
    dash(c, t, d) { SYN.engineSurge(c, t, d); },
    overdrive(c, t, d) { osc(c, d, { type: 'sawtooth', f0: 300, f1: 1400, t, dur: 0.9, gain: 0.1, a: 0.1, r: 0.3, filter: { type: 'lowpass', f: 3000 } }); osc(c, d, { type: 'sine', f0: 880, f1: 1760, t: t + 0.4, dur: 0.5, gain: 0.12 }); SYN.coin(c, t, d); burst(c, d, { t: t + 0.1, dur: 0.8, f0: 1200, f1: 5000, q: 1, gain: 0.2 }); },
    coin(c, t, d) { osc(c, d, { type: 'sine', f0: 1568, t, dur: 0.5, gain: 0.18, r: 0.4 }); osc(c, d, { type: 'sine', f0: 2349, t: t + 0.06, dur: 0.6, gain: 0.14, r: 0.5 }); osc(c, d, { type: 'sine', f0: 3136, t: t + 0.06, dur: 0.6, gain: 0.07, r: 0.5 }); },
    mishap(c, t, d) { for (let i = 0; i < 4; i++) osc(c, d, { type: 'square', f0: i % 2 ? 880 : 660, t: t + i * 0.16, dur: 0.12, gain: 0.1, filter: { type: 'lowpass', f: 2500 } }); burst(c, d, { t, dur: 0.8, f0: 3000, f1: 200, type: 'lowpass', gain: 0.5 }); thump(c, d, t, 80, 30, 0.8, 0.4); for (let i = 0; i < 3; i++) SYN.metal(c, t + 0.2 + i * 0.12, d); },
    jam(c, t, d) { SYN.metal(c, t, d); burst(c, d, { t: t + 0.05, dur: 0.4, f0: 2500, f1: 600, q: 3, gain: 0.25 }); },
    lava(c, t, d) { burst(c, d, { t, dur: 0.9, f0: 6000, f1: 800, type: 'bandpass', gain: 0.4 }); thump(c, d, t, 70, 30, 0.5, 0.5); SYN.explosion(c, t + 0.1, d, { small: true }); },
    relentless(c, t, d) { for (let i = 0; i < 3; i++) thump(c, d, t + i * 0.22, 70, 40, 0.8, 0.2); osc(c, d, { type: 'sawtooth', f0: 70, f1: 120, t: t + 0.1, dur: 0.7, gain: 0.25, filter: { type: 'lowpass', f: 400 } }); },
    death(c, t, d) { SYN.roar(c, t, d); thump(c, d, t + 0.1, 70, 25, 1, 0.7); },
    down(c, t, d) { thump(c, d, t, 100, 35, 1, 0.5); osc(c, d, { type: 'sawtooth', f0: 300, f1: 90, t, dur: 0.8, gain: 0.2, filter: { type: 'lowpass', f: 700 } }); },
    heal(c, t, d) { [523, 659, 784, 1047].forEach((f, i) => osc(c, d, { type: 'triangle', f0: f, t: t + i * 0.07, dur: 0.4, gain: 0.12, r: 0.3 })); },
    tether(c, t, d) { SYN.tetherHit(c, t, d); },
    turn(c, t, d) { thump(c, d, t, 130, 45, 0.9, 0.3); thump(c, d, t + 0.14, 110, 40, 0.8, 0.3); burst(c, d, { t, dur: 0.25, f0: 600, type: 'lowpass', gain: 0.25 }); osc(c, d, { type: 'sine', f0: 392, t: t + 0.16, dur: 0.7, gain: 0.07, r: 0.5 }); },
    myTurn(c, t, d) { SYN.turn(c, t, d); osc(c, d, { type: 'triangle', f0: 784, t: t + 0.3, dur: 0.5, gain: 0.12, r: 0.4 }); osc(c, d, { type: 'triangle', f0: 1175, t: t + 0.4, dur: 0.6, gain: 0.1, r: 0.5 }); },
    round(c, t, d) { // gong
      for (const [f, g] of [[110, 0.4], [166, 0.25], [247, 0.2], [411, 0.12], [690, 0.07]]) osc(c, d, { type: 'sine', f0: f * 1.003, f1: f, t, dur: 2.2, gain: g, a: 0.01, r: 1 });
      burst(c, d, { t, dur: 0.3, f0: 2000, f1: 500, q: 0.7, gain: 0.3 });
    },
    init(c, t, d) { SYN.dice(c, t, d); SYN.metal(c, t + 0.4, d); },
    fanfareHit(c, t, d) { thump(c, d, t, 100, 30, 1, 0.4); },
    victory(c, t, d) { [[0, 196], [0.22, 262], [0.44, 330], [0.66, 392], [1.0, 523]].forEach(([dt, f]) => { osc(c, d, { type: 'sawtooth', f0: f, t: t + dt, dur: 0.9, gain: 0.14, a: 0.02, r: 0.5, filter: { type: 'lowpass', f: 1800 } }); osc(c, d, { type: 'sawtooth', f0: f / 2, t: t + dt, dur: 0.9, gain: 0.1, a: 0.02, r: 0.5, filter: { type: 'lowpass', f: 900 } }); }); thump(c, d, t, 90, 35, 0.9, 0.5); SYN.round(c, t + 1.0, d); },
    defeat(c, t, d) { [[0, 196], [0.5, 185], [1.0, 165], [1.7, 131]].forEach(([dt, f]) => osc(c, d, { type: 'sawtooth', f0: f, t: t + dt, dur: 1.1, gain: 0.14, a: 0.05, r: 0.8, filter: { type: 'lowpass', f: 700 } })); thump(c, d, t, 70, 25, 1, 0.9); },
    siren(c, t, d) { for (let i = 0; i < 3; i++) osc(c, d, { type: 'sawtooth', f0: 500, f1: 900, t: t + i * 0.5, dur: 0.45, gain: 0.07, filter: { type: 'lowpass', f: 1800 } }); },
  };

  /* ---------- initialisation / contexte ---------- */
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (A.ctx = new AC());
    A.master = c.createGain(); A.master.gain.value = A.vol.master;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.master.connect(comp); comp.connect(c.destination);
    A.sfxBus = c.createGain(); A.sfxBus.gain.value = A.vol.sfx; A.sfxBus.connect(A.master);
    A.musicBus = c.createGain(); A.musicBus.gain.value = A.vol.music; A.musicBus.connect(A.master);
    A.ambBus = c.createGain(); A.ambBus.gain.value = A.vol.amb; A.ambBus.connect(A.master);
    // réverbération (impulsion générée)
    const len = c.sampleRate * 1.8, imp = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const conv = c.createConvolver(); conv.buffer = imp;
    A.wet = c.createGain(); A.wet.gain.value = 0.28; A.sfxBus.connect(conv); conv.connect(A.wet); A.wet.connect(A.master);
    A.on = true;
    A.startAmbient();
    A.loadSamples();
    A.startMusic();
  };
  A.setVol = function (k, v) {
    A.vol[k] = v;
    if (!A.ctx) return;
    const node = { master: A.master, music: A.musicBus, sfx: A.sfxBus, amb: A.ambBus }[k];
    if (node) node.gain.setTargetAtTime(v, A.ctx.currentTime, 0.05);
  };

  A.loadSamples = async function () {
    try {
      const r = await fetch('/audio/manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const man = await r.json();
      for (const [name, url] of Object.entries(man.sfx || {})) {
        try { const b = await (await fetch('/audio/' + url)).arrayBuffer(); A.samples[name] = await A.ctx.decodeAudioData(b); } catch (e) { /* fichier absent : on garde la synthèse */ }
      }
      for (const [lv, url] of Object.entries(man.music || {})) {
        try { const b = await (await fetch('/audio/' + url)).arrayBuffer(); A.musicBufs[lv] = await A.ctx.decodeAudioData(b); } catch (e) { /* idem */ }
      }
      if (Object.keys(A.musicBufs).length) A.useMusicFiles();
    } catch (e) { /* pas de manifeste */ }
  };

  /* ---------- lecture d'un effet ---------- */
  // o : { pan (-1..1), vol (0..1), rate }
  A.play = function (name, o = {}) {
    if (!A.on || !A.ctx) return;
    const c = A.ctx;
    const t = c.currentTime + 0.005;
    const out = c.createGain(); out.gain.value = o.vol === undefined ? 1 : o.vol;
    let dest = out;
    if (o.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); out.connect(p); p.connect(A.sfxBus); } else out.connect(A.sfxBus);
    if (A.samples[name]) {
      const s = c.createBufferSource(); s.buffer = A.samples[name]; if (o.rate) s.playbackRate.value = o.rate; s.connect(dest); s.start(t); return;
    }
    const f = SYN[name]; if (f) { try { f(c, t, dest, o); } catch (e) { console.warn('son', name, e); } }
  };
  A.has = (name) => !!SYN[name];

  /* ---------- ambiance : vent, lave, grondement ---------- */
  A.startAmbient = function () {
    const c = A.ctx;
    const mk = (kind, f, q, gain, lfoF, lfoD) => {
      const s = c.createBufferSource(); s.buffer = noiseBuffer(c, 4, kind); s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      if (lfoF) { const l = c.createOscillator(); l.frequency.value = lfoF; const lg = c.createGain(); lg.gain.value = lfoD; l.connect(lg); lg.connect(g.gain); l.start(); }
      s.connect(fl); fl.connect(g); g.connect(A.ambBus); s.start();
    };
    mk('white', 520, 0.6, 0.07, 0.11, 0.05);   // vent
    mk('white', 1400, 1.2, 0.025, 0.07, 0.015); // sifflement
    mk('brown', 90, 0.8, 0.5, 0.05, 0.15);      // grondement de lave
    mk('brown', 240, 1.5, 0.18, 0.9, 0.1);      // bouillonnement
  };

  /* ---------- voix de moteur par véhicule ---------- */
  A.engineStart = function (id, side) {
    if (!A.on || A.engines[id]) return;
    const c = A.ctx, enemy = side === 'enemy';
    const base = enemy ? 36 : 31;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square';
    o1.frequency.value = base; o2.frequency.value = base * 1.012; o3.frequency.value = base / 2;
    const mixg = c.createGain(); mixg.gain.value = 0.5;
    o1.connect(mixg); o2.connect(mixg); o3.connect(mixg);
    const ws = c.createWaveShaper(); ws.curve = curve(enemy ? 60 : 24);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 2;
    const chug = c.createGain(); chug.gain.value = 0.7;
    const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 9;
    const lfoG = c.createGain(); lfoG.gain.value = 0.3; lfo.connect(lfoG); lfoG.connect(chug.gain);
    mixg.connect(ws); ws.connect(lp); lp.connect(chug);
    // souffle d'échappement
    const ns = c.createBufferSource(); ns.buffer = noiseBuffer(c, 2, 'brown'); ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 200; nf.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.35; ns.connect(nf); nf.connect(ng); ng.connect(chug);
    const vol = c.createGain(); vol.gain.value = 0;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    chug.connect(vol); if (pan) { vol.connect(pan); pan.connect(A.sfxBus); } else vol.connect(A.sfxBus);
    [o1, o2, o3, lfo, ns].forEach((n) => n.start());
    A.engines[id] = {
      set(rpm, v, p) { // rpm 0..1, v volume 0..1, p pan
        const t = c.currentTime;
        const f = base * (1 + rpm * 1.25);
        o1.frequency.setTargetAtTime(f, t, 0.1); o2.frequency.setTargetAtTime(f * 1.012, t, 0.1); o3.frequency.setTargetAtTime(f / 2, t, 0.1);
        lfo.frequency.setTargetAtTime(8 + rpm * 20, t, 0.15);
        lp.frequency.setTargetAtTime(300 + rpm * 700, t, 0.1);
        nf.frequency.setTargetAtTime(180 + rpm * 500, t, 0.1);
        vol.gain.setTargetAtTime((0.05 + rpm * 0.09) * v * (enemy ? 1.1 : 1), t, 0.1);
        if (pan) pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), t, 0.1);
      },
      stop() { try { vol.gain.setTargetAtTime(0, c.currentTime, 0.3); setTimeout(() => [o1, o2, o3, lfo, ns].forEach((n) => { try { n.stop(); } catch (e) { /* ok */ } }), 1200); } catch (e) { /* ok */ } },
    };
  };
  A.engineSet = (id, rpm, v, p) => { const e = A.engines[id]; if (e) e.set(rpm, v, p); };
  A.engineStop = (id) => { const e = A.engines[id]; if (e) { e.stop(); delete A.engines[id]; } };

  /* ---------- musique générative indus / métal ---------- */
  const BPM = 142, STEP = 60 / BPM / 4;
  const BASS = [0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 0, 5, 3, 1, 0, -2];
  const LEAD = [24, 0, 25, 0, 27, 0, 25, 0, 24, 0, 22, 0, 20, 0, 22, 25];
  const music = { step: 0, next: 0, timer: null, layers: null, fileSrc: {} };

  A.startMusic = function () {
    const c = A.ctx;
    music.layers = ['drone', 'pulse', 'drums', 'lead'].reduce((o, k) => { const g = c.createGain(); g.gain.value = 0; g.connect(A.musicBus); o[k] = g; return o; }, {});
    // nappe permanente
    for (const [f, dt] of [[41.2, 0], [43.65, 6], [82.4, -5]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 3;
      const l = c.createOscillator(); l.frequency.value = 0.07 + dt * 0.003; const lg = c.createGain(); lg.gain.value = 90; l.connect(lg); lg.connect(lp.frequency);
      const g = c.createGain(); g.gain.value = 0.16; o.connect(lp); lp.connect(g); g.connect(music.layers.drone); o.start(); l.start();
    }
    A.setLevel(A.level, true);
    music.next = c.currentTime + 0.1;
    music.timer = setInterval(A._tick, 40);
  };
  A.setLevel = function (lv, instant) {
    A.level = lv;
    if (!music.layers) return;
    const t = A.ctx.currentTime, k = instant ? 0.01 : 0.6;
    const tg = { drone: 1, pulse: lv >= 1 ? 1 : 0, drums: lv >= 2 ? 1 : 0, lead: lv >= 3 ? 1 : 0 };
    for (const key of Object.keys(tg)) music.layers[key].gain.setTargetAtTime(tg[key], t, k);
    A.crossfadeFiles();
  };
  A._tick = function () {
    const c = A.ctx; if (!c || !A.on) return;
    while (music.next < c.currentTime + 0.15) { A._step(music.step, music.next); music.step = (music.step + 1) % 64; music.next += STEP; }
  };
  A._step = function (s, t) {
    const c = A.ctx, L = music.layers, lv = A.level, i = s % 16, bar = Math.floor(s / 16);
    if (Object.keys(A.musicBufs).length) return; // fichiers musicaux : on ne synthétise pas
    // grosse caisse + caisse claire
    if (lv >= 2) {
      if (i % 4 === 0 || (lv >= 3 && i % 8 === 6)) { thump(c, L.drums, t, 150, 42, 0.9, 0.22); burst(c, L.drums, { t, dur: 0.03, f0: 3500, q: 1, gain: 0.25 }); }
      if (i === 4 || i === 12) { burst(c, L.drums, { t, dur: 0.17, f0: 1800, q: 0.7, gain: 0.5 }); osc(c, L.drums, { type: 'triangle', f0: 230, f1: 160, t, dur: 0.1, gain: 0.3 }); }
      if (i % 2 === 1 || lv >= 3) burst(c, L.drums, { t, dur: 0.035, f0: 7500, type: 'highpass', q: 0.5, gain: lv >= 3 ? 0.13 : 0.09 });
      if (i === 14 && bar % 2 === 1) { for (const f of [2300, 3400]) burst(c, L.drums, { t, dur: 0.5, f0: f, q: 3, gain: 0.07 }); }
      if (i === 0 && bar === 0 && lv >= 3) burst(c, L.drums, { t, dur: 1.3, f0: 6500, type: 'highpass', gain: 0.22, r: 0.8 });
    }
    // basse : pulsations (niveau 1) puis riff phrygien (niveau 2+)
    if (lv >= 1) {
      const n = lv >= 2 ? BASS[i] : 0, on = lv >= 2 ? true : i % 2 === 0;
      if (on && (lv >= 2 || i % 4 === 0 || i % 4 === 2)) {
        const f = mtof(28 + n), g = c.createGain();
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = f / 2;
        const ws = c.createWaveShaper(); ws.curve = curve(lv >= 2 ? 70 : 20);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(lv >= 2 ? 700 : 260, t); lp.frequency.exponentialRampToValueAtTime(lv >= 2 ? 260 : 120, t + STEP * 1.8); lp.Q.value = 4;
        env(g, t, 0.004, lv >= 2 ? 0.34 : 0.26, STEP * 1.5, 0.05);
        o.connect(ws); o2.connect(ws); ws.connect(lp); lp.connect(g); g.connect(L.pulse);
        o.start(t); o2.start(t); o.stop(t + STEP * 2.2); o2.stop(t + STEP * 2.2);
      }
      if (i % 4 === 2) burst(c, L.pulse, { t, dur: 0.04, f0: 5200, q: 4, gain: 0.07 });
    }
    // ligne soliste (niveau 3) : arpège aigu avec vibrato
    if (lv >= 3 && LEAD[i] && bar % 2 === 1) {
      const f = mtof(40 + LEAD[i]);
      osc(c, L.lead, { type: 'sawtooth', f0: f, t, dur: STEP * 1.6, gain: 0.07, a: 0.01, r: 0.08, vib: [6, f * 0.012], filter: { type: 'lowpass', f: 3200, q: 2 } });
      osc(c, L.lead, { type: 'square', f0: f * 2.003, t, dur: STEP * 1.6, gain: 0.025, a: 0.01, r: 0.08, filter: { type: 'lowpass', f: 4200 } });
    }
  };
  // fichiers de musique fournis par le MJ : boucle par niveau avec fondu enchaîné
  A.useMusicFiles = function () {
    const c = A.ctx;
    for (const [lv, buf] of Object.entries(A.musicBufs)) {
      if (music.fileSrc[lv]) continue;
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const g = c.createGain(); g.gain.value = 0; s.connect(g); g.connect(A.musicBus); s.start();
      music.fileSrc[lv] = g;
    }
    A.crossfadeFiles();
  };
  A.crossfadeFiles = function () {
    const keys = Object.keys(music.fileSrc); if (!keys.length) return;
    const pick = Math.max(...keys.map(Number).filter((k) => k <= A.level), Math.min(...keys.map(Number)));
    for (const k of keys) music.fileSrc[k].gain.setTargetAtTime(Number(k) === pick ? 1 : 0, A.ctx.currentTime, 0.8);
  };

  /* ---------- test hors-ligne (utilisé par les tests automatisés) ---------- */
  A._renderTest = async function (name, secs = 2) {
    const oc = new OfflineAudioContext(1, 44100 * secs, 44100);
    const g = oc.createGain(); g.connect(oc.destination);
    if (!SYN[name]) return null;
    SYN[name](oc, 0.01, g, {});
    const buf = await oc.startRendering();
    const d = buf.getChannelData(0);
    let sum = 0, peak = 0; for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
    return { rms: Math.sqrt(sum / d.length), peak };
  };
  A.names = () => Object.keys(SYN);

  window.AvAudio = A;
})();
