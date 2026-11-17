// Every sound is synthesised with WebAudio oscillators and a noise buffer — no audio files, no
// network. The context is created lazily on the first user gesture (browsers refuse it sooner),
// and every call is safe before that: silent. M toggles mute; the choice lasts the visit only.

const MASTER = 0.16;

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let lastShoot = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(ctx.destination);
    return true;
  }

  /** One oscillator blip: freq slides from f0 to f1 over `dur` seconds. */
  function blip(type, f0, f1, dur, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A short filtered noise burst, for explosions and impacts. */
  function noise(dur, vol, freq, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  return {
    /** Call from any click or key press: browsers only allow sound after a gesture. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : MASTER;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      if (!ctx) return;
      const now = performance.now();
      if (now - lastShoot < 45) return; // a held trigger would otherwise stack into a roar
      lastShoot = now;
      blip('square', 880, 320, 0.07, 0.10);
    },
    enemyHit() {
      blip('triangle', 300, 180, 0.05, 0.08);
    },
    boom(big = false) {
      noise(big ? 0.5 : 0.22, big ? 0.5 : 0.25, big ? 900 : 1400);
      blip('sine', big ? 160 : 220, 40, big ? 0.45 : 0.2, 0.3);
    },
    hurt() {
      blip('sawtooth', 200, 60, 0.18, 0.25);
      noise(0.12, 0.15, 700);
    },
    gem() {
      blip('sine', 990, 1560, 0.08, 0.07);
    },
    levelup() {
      [523, 659, 784, 1046].forEach((f, i) => blip('triangle', f, f, 0.14, 0.16, i * 0.07));
    },
    wave() {
      blip('triangle', 392, 392, 0.1, 0.14);
      blip('triangle', 587, 587, 0.16, 0.14, 0.09);
    },
    boss() {
      blip('sawtooth', 98, 49, 0.7, 0.3);
      blip('sawtooth', 110, 55, 0.7, 0.22, 0.08);
    },
    click() {
      blip('sine', 660, 660, 0.05, 0.1);
    },
    win() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => blip('triangle', f, f, 0.22, 0.16, i * 0.11));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => blip('sawtooth', f, f * 0.94, 0.24, 0.14, i * 0.13));
    },
  };
}
