import { STRING_FREQ } from './musicTheory'

export function useGuitarAudio() {
  let ctxRef = null;
  let irRef = null;

  const getCtx = () => {
    if (!ctxRef) ctxRef = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef;
  };

  const getReverbIR = (ctx) => {
    if (irRef) return irRef;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.0);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.0);
        d[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    irRef = ir;
    return ir;
  };

  const makeBus = (ctx) => {
    const master = ctx.createGain();
    master.gain.value = 0.5;

    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);

    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    comp.connect(dry);
    dry.connect(ctx.destination);

    const convolver = ctx.createConvolver();
    convolver.buffer = getReverbIR(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    comp.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);

    return master;
  };

  // Additive synthesis: warm fundamental + soft harmonics, no pluck transient.
  const note = (ctx, freq, when, dest) => {
    const dur = 3.0;

    // Relative amplitudes of harmonics 1..4 — fundamental dominant, highs gentle.
    const partials = [
      { mult: 1, amp: 1.0 },
      { mult: 2, amp: 0.32 },
      { mult: 3, amp: 0.14 },
      { mult: 4, amp: 0.06 },
    ];

    // Shared amplitude envelope: soft attack, smooth exponential decay.
    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0.0001, when);
    vca.gain.linearRampToValueAtTime(0.5, when + 0.025);
    vca.gain.exponentialRampToValueAtTime(0.18, when + 0.6);
    vca.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    // Gentle low-pass to keep everything mellow.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    tone.Q.value = 0.5;

    vca.connect(tone);
    tone.connect(dest);

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * p.mult;
      const g = ctx.createGain();
      g.gain.value = p.amp * 0.5;
      osc.connect(g);
      g.connect(vca);
      osc.start(when);
      osc.stop(when + dur + 0.1);
    });
  };

  const scheduleChord = (frets, when) => {
    const ctx = getCtx();
    const master = makeBus(ctx);
    let s = 0;
    frets.forEach((f, i) => {
      if (f < 0) return;
      const freq = STRING_FREQ[i] * Math.pow(2, f / 12);
      note(ctx, freq, when + s * 0.035, master);
      s++;
    });
  };

  const playChord = (frets) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    scheduleChord(frets, ctx.currentTime);
  };

  const scheduleClick = (when, accent) => {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = accent ? 2000 : 1300;
    osc.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.1, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.start(when); osc.stop(when + 0.06);
  };

  const playScale = (rootPc, intervals) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const master = makeBus(ctx);
    const base = 220 * Math.pow(2, (rootPc - 9) / 12);
    const up = [...intervals, 12];
    const seq = [...up, ...up.slice(0, -1).reverse()];
    const now = ctx.currentTime + 0.05;
    seq.forEach((semi, i) => {
      note(ctx, base * Math.pow(2, semi / 12), now + i * 0.30, master);
    });
  };

  return { getCtx, playChord, scheduleChord, scheduleClick, playScale };
}
