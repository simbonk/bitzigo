// Little synthesised sound effects (no audio files) plus a spoken voice for cues.
let ac = null;
let master = null;
let muted = false;

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
}

export function setMuted(m) { muted = m; }

function tone(freq, dur, { type = 'square', vol = 0.25, slide = 0, delay = 0 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.3, from = 3000, to = 300, delay = 0, q = 1 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  // Crate smash: crunchy noise and a bright pop.
  smash() { noise(0.25, { vol: 0.6, from: 2500, to: 400 }); tone(660, 0.08, { vol: 0.15 }); tone(990, 0.1, { vol: 0.12, delay: 0.05 }); },
  // Jump: springy boing.
  jump() { tone(260, 0.25, { type: 'triangle', vol: 0.35, slide: 3 }); },
  // Duck: whoosh overhead.
  duck() { noise(0.35, { vol: 0.5, from: 600, to: 3500, q: 2 }); },
  // Star: sparkly arpeggio.
  star() { [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.18, delay: i * 0.06 })); },
  // Miss: soft, friendly bonk (not scary).
  miss() { tone(220, 0.18, { type: 'sine', vol: 0.3, slide: 0.6 }); },
  level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, { vol: 0.16, delay: i * 0.08 })); },
  beep(high) { tone(high ? 880 : 440, 0.15, { vol: 0.2 }); },
  select() { tone(700, 0.06, { vol: 0.15 }); tone(1000, 0.06, { vol: 0.15, delay: 0.05 }); },
  ready() { tone(523, 0.1, { vol: 0.18 }); tone(784, 0.16, { vol: 0.18, delay: 0.08 }); },
  finish() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, { vol: 0.18, delay: i * 0.12 })); },
};

export function hitSound(kind) {
  if (kind === 'crate') sfx.smash();
  else if (kind === 'log') sfx.jump();
  else if (kind === 'bar') sfx.duck();
  else if (kind === 'star') sfx.star();
}

// Spoken cue using the device's built-in voice, if it has one.
export function say(text) {
  if (muted || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.25;
    speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}
