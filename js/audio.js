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

export function setMuted(m) {
  muted = m;
  if (music.bus) music.bus.gain.value = m ? 0 : 0.35;
}

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
  // Bird dodged: whoosh past plus a cross squawk.
  dodge() { noise(0.3, { vol: 0.5, from: 600, to: 3500, q: 2 }); tone(1400, 0.08, { type: 'sawtooth', vol: 0.1, slide: 0.6, delay: 0.12 }); tone(1300, 0.08, { type: 'sawtooth', vol: 0.1, slide: 0.6, delay: 0.22 }); },
  // Rope swing: a rising-falling slide whistle.
  swing() { tone(400, 0.35, { type: 'sine', vol: 0.3, slide: 3 }); tone(1200, 0.35, { type: 'sine', vol: 0.25, slide: 0.4, delay: 0.35 }); },
  splash() { noise(0.45, { vol: 0.6, from: 1800, to: 200, q: 0.7 }); },
  squawk() { tone(900, 0.12, { type: 'sawtooth', vol: 0.15, slide: 1.4 }); tone(800, 0.15, { type: 'sawtooth', vol: 0.15, slide: 0.7, delay: 0.12 }); },
  throw() { noise(0.18, { vol: 0.35, from: 900, to: 2600, q: 3 }); },
  knock() { noise(0.2, { vol: 0.5, from: 4000, to: 900, q: 2 }); tone(520, 0.06, { vol: 0.12 }); tone(390, 0.08, { vol: 0.12, delay: 0.07 }); },
  strike() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, { vol: 0.16, delay: i * 0.06 })); },
  streak() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.2, delay: i * 0.05 })); },
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
  else if (kind === 'bird') sfx.dodge();
  else if (kind === 'rope') sfx.swing();
}

export function missSound(kind) {
  if (kind === 'rope') sfx.splash();
  else if (kind === 'bird') sfx.squawk();
  else sfx.miss();
}

// ---------- Music: a bouncy chiptune loop, scheduled ahead on the audio clock ----------

const music = { on: false, bpm: 128, step: 0, next: 0, timer: null, bus: null, intense: 0 };
// Four-bar progression in A minor: Am F C G (root notes, MIDI).
const ROOTS = [57, 53, 48, 55];
const LEAD = [0, 7, 12, 7, 15, 12, 7, 12, 0, 7, 12, 14, 15, 14, 12, 7];
const hz = m => 440 * 2 ** ((m - 69) / 12);

function note(freq, t, dur, type, vol) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(music.bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function drum(t, kind) {
  if (kind === 'kick') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(music.bus);
    o.start(t); o.stop(t + 0.16);
    return;
  }
  const len = Math.ceil(ac.sampleRate * (kind === 'snare' ? 0.15 : 0.04));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = kind === 'snare' ? 1200 : 7000;
  const g = ac.createGain();
  g.gain.value = kind === 'snare' ? 0.45 : 0.18;
  src.connect(f).connect(g).connect(music.bus);
  src.start(t);
}

function schedule() {
  const spb = 60 / (music.bpm + music.intense * 24) / 4; // seconds per 16th note
  while (music.next < ac.currentTime + 0.15) {
    const s = music.step % 64, beat = s % 16, bar = Math.floor(s / 16);
    const root = ROOTS[bar], t = music.next;
    if (beat % 4 === 0) drum(t, 'kick');
    if (beat === 4 || beat === 12) drum(t, 'snare');
    if (beat % 2 === 1) drum(t, 'hat');
    if (music.intense > 0.5 && beat % 4 === 2) drum(t, 'hat');
    // Octave-bouncing bass on every 8th note.
    if (beat % 2 === 0) note(hz(root - 12 + (beat % 4 === 2 ? 12 : 0)), t, spb * 1.8, 'square', 0.16);
    // Lead arpeggio, busier as the workout heats up.
    if (beat % 2 === 0 || music.intense > 0.3) note(hz(root + 12 + LEAD[beat]), t, spb * 0.9, 'square', 0.06);
    music.next += spb;
    music.step++;
  }
}

export function startMusic() {
  if (!ac || music.on) return;
  if (!music.bus) {
    music.bus = ac.createGain();
    music.bus.connect(master);
  }
  music.bus.gain.value = muted ? 0 : 0.35;
  music.on = true;
  music.next = ac.currentTime + 0.05;
  music.timer = setInterval(schedule, 40);
}

export function stopMusic() {
  music.on = false;
  clearInterval(music.timer);
}

// 0..1: speeds the music up and fills it out as the timer runs down.
export function setIntensity(v) { music.intense = Math.max(0, Math.min(1, v)); }

// Spoken cue using the device's built-in voice, if it has one.
// cartoon: a squeaky, fast voice for the in-game move calls.
export function say(text, { cartoon = false } = {}) {
  if (muted || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = cartoon ? 1.25 : 1.0;
    u.pitch = cartoon ? 2 : 1.25;
    speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}
