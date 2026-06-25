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
    dry.gain.value = 0.8;
    comp.connect(dry);
    dry.connect(ctx.destination);

    const convolver = ctx.createConvolver();
    convolver.buffer = getReverbIR(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    comp.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);

    return master;
  };

  // Additive synthesis tuned toward plucked guitar: rounder lows, less top sparkle.
  const note = (ctx, freq, when, dest) => {
    const partials = [
      { mult: 1, amp: 1.0,  dur: 3.2 },
      { mult: 2, amp: 0.40, dur: 2.0 },
      { mult: 3, amp: 0.18, dur: 1.2 },
      { mult: 4, amp: 0.04, dur: 0.6 },
      { mult: 5, amp: 0.015, dur: 0.35 },
    ];

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    tone.Q.value = 0.5;
    tone.connect(dest);

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * p.mult;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(p.amp * 0.5, when + 0.013);
      g.gain.exponentialRampToValueAtTime(0.0001, when + p.dur);

      osc.connect(g);
      g.connect(tone);
      osc.start(when);
      osc.stop(when + p.dur + 0.1);
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
