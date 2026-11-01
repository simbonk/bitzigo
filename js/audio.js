// Little synthesised sound effects and music, plus a short announcer clip
// (voice/*.mp3) for each move, with a synthesised cue as the fallback.
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
    // iPhone/iPad: play even with the ring switch on silent.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { }
    loadVoices();
    // iPhone only lets a page talk after it has spoken once from a tap:
    // say nothing, silently, now (unlockAudio runs from a tap).
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis?.speak(u); } catch { }
  }
  if (!held && ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => { });
}

// Pause: freeze every sound and the music exactly where they are.
let held = false;
export function holdAudio(on) {
  held = on;
  if (!ac) return;
  (on ? ac.suspend() : ac.resume()).catch(() => { });
}

export function setMuted(m) {
  muted = m;
  if (music.bus) music.bus.gain.value = m ? 0 : 0.45;
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
  smash() {
    tone(70, 0.22, { type: 'sine', vol: 0.65, slide: 0.5 });                 // thump
    noise(0.32, { vol: 0.7, from: 1200, to: 150 });                          // crunch
    [0.04, 0.09, 0.15, 0.22].forEach(d => noise(0.06, { vol: 0.3, from: 1800, to: 700, q: 2, delay: d })); // splinters
    tone(330, 0.08, { vol: 0.1, delay: 0.02 }); tone(440, 0.1, { vol: 0.08, delay: 0.07 });
  },
  // Jump: springy boing.
  jump() { tone(260, 0.25, { type: 'triangle', vol: 0.35, slide: 3 }); noise(0.2, { vol: 0.25, from: 500, to: 2500, q: 2 }); tone(523, 0.08, { vol: 0.12, delay: 0.22 }); tone(784, 0.1, { vol: 0.12, delay: 0.28 }); },
  // Bird ducked: it whooshes overhead.
  dodge() { noise(0.3, { vol: 0.45, from: 600, to: 3500, q: 2 }); },
  // Rope swing: a rising-falling slide whistle.
  swing() { tone(400, 0.35, { type: 'sine', vol: 0.3, slide: 3 }); tone(1200, 0.35, { type: 'sine', vol: 0.25, slide: 0.4, delay: 0.35 }); },
  splash() { tone(150, 0.2, { type: 'sine', vol: 0.4, slide: 0.4 }); noise(0.6, { vol: 0.7, from: 1800, to: 200, q: 0.7 }); [0.2, 0.32, 0.45].forEach(d => tone(900 + d * 1000, 0.05, { type: 'sine', vol: 0.15, slide: 1.6, delay: d })); },
  // On the beat: a bright chime that climbs a scale as the beat combo grows.
  chime(n = 0) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 523 * 2 ** (scale[Math.min(n, scale.length - 1)] / 12);
    tone(f, 0.18, { type: 'triangle', vol: 0.22 }); tone(f * 2, 0.12, { type: 'sine', vol: 0.1, delay: 0.03 });
  },
  // Boss fight: a bomb going off on Captain Squawk.
  boom() { tone(65, 0.45, { type: 'sine', vol: 0.75, slide: 0.4 }); noise(0.55, { vol: 0.7, from: 2500, to: 120, q: 0.6 }); tone(880, 0.06, { type: 'square', vol: 0.08, delay: 0.03 }); },
  // Super Eagle's cry, and his gulp when he eats a lump of points.
  screech() { tone(1400, 0.5, { type: 'sawtooth', vol: 0.1, slide: 0.55 }); tone(1800, 0.35, { type: 'square', vol: 0.05, slide: 0.6, delay: 0.05 }); noise(0.4, { vol: 0.2, from: 5000, to: 2000, q: 3 }); },
  gulp() { tone(300, 0.14, { type: 'sine', vol: 0.4, slide: 0.45 }); [1047, 1319, 1568].forEach((f, i) => tone(f, 0.06, { type: 'triangle', vol: 0.12, delay: 0.1 + i * 0.04 })); },
  // Points pinched by the bird: coins tumbling down the scale.
  steal() { [1568, 1319, 1047, 784, 659, 523].forEach((f, i) => tone(f, 0.07, { type: 'triangle', vol: 0.14, delay: 0.25 + i * 0.09 })); },
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
  pop() { tone(500, 0.08, { type: 'sine', vol: 0.35, slide: 3 }); noise(0.08, { vol: 0.3, from: 5000, to: 2000, q: 2, delay: 0.03 }); },
  chop() { noise(0.14, { vol: 0.7, from: 1400, to: 300, q: 1.2 }); tone(110, 0.14, { vol: 0.3, slide: 0.5 }); },
  splat() { noise(0.18, { vol: 0.6, from: 900, to: 200, q: 0.8 }); tone(160, 0.12, { type: 'sine', vol: 0.3, slide: 0.4 }); },
  save() { tone(220, 0.06, { vol: 0.3 }); noise(0.1, { vol: 0.5, from: 1500, to: 600, q: 1 }); tone(660, 0.12, { type: 'triangle', vol: 0.2, slide: 1.5, delay: 0.05 }); },
  swat() { noise(0.15, { vol: 0.4, from: 600, to: 2500, q: 2 }); tone(500, 0.3, { type: 'sawtooth', vol: 0.1, slide: 0.3, delay: 0.05 }); },
  stomp() { tone(55, 0.35, { type: 'sine', vol: 0.8, slide: 0.5 }); noise(0.5, { vol: 0.6, from: 800, to: 100, q: 0.7 }); },
  climb() { tone(400 + Math.random() * 200, 0.07, { type: 'triangle', vol: 0.2, slide: 1.3 }); },
  catch() { tone(300, 0.08, { type: 'sine', vol: 0.35, slide: 0.7 }); tone(600, 0.08, { type: 'triangle', vol: 0.15, delay: 0.05 }); },
  bonk() { tone(150, 0.15, { type: 'square', vol: 0.25, slide: 0.5 }); },
  dance() { [523, 659, 784].forEach((f, i) => tone(f, 0.08, { type: 'square', vol: 0.12, delay: i * 0.04 })); },
  beat() { tone(880, 0.04, { type: 'sine', vol: 0.12 }); },
  flap() { noise(0.14, { vol: 0.25, from: 400, to: 1400, q: 2 }); },
  super() { [0, 0.07, 0.14, 0.21].forEach((d, i) => tone(1200 + i * 300, 0.06, { type: 'sawtooth', vol: 0.1, slide: 0.5, delay: d })); noise(0.4, { vol: 0.25, from: 6000, to: 1500, q: 4 }); },
  gear() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.09, { type: 'triangle', vol: 0.18, delay: i * 0.05 })); },
  spin() { tone(300, 0.6, { type: 'sawtooth', vol: 0.12, slide: 4 }); [784, 988, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.2, delay: 0.3 + i * 0.07 })); noise(0.6, { vol: 0.3, from: 800, to: 6000, q: 3 }); },
  land() { tone(120, 0.12, { type: 'sine', vol: 0.4, slide: 0.6 }); noise(0.1, { vol: 0.3, from: 600, to: 200 }); },
  sizzle() { noise(0.45, { vol: 0.35, from: 6000, to: 2500, q: 0.8 }); tone(180, 0.15, { type: 'sine', vol: 0.2, slide: 0.5 }); },
  spray() { noise(0.12, { vol: 0.08, from: 4000, to: 3000, q: 0.6 }); },
  finish() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, { vol: 0.18, delay: i * 0.12 })); },
};

// Played as each obstacle gets close, under the announcer's call.
export function approachSound(kind, side) {
  const pan = side === 'left' ? -0.8 : side === 'right' ? 0.8 : 0;
  if (kind === 'bird') panned(pan, () => {
    // Soft flapping wings (the announcer says "Duck!").
    for (let i = 0; i < 5; i++) noise(0.05, { vol: 0.18, from: 700, to: 300, q: 1, delay: i * 0.08 });
  });
  else if (kind === 'crate') panned(pan, () => tone(1400, 0.35, { type: 'sine', vol: 0.12, slide: 0.45 })); // incoming whistle
  else if (kind === 'log') { tone(70, 0.25, { type: 'sine', vol: 0.4 }); tone(70, 0.25, { type: 'sine', vol: 0.4, delay: 0.3 }); } // stomp stomp
  else if (kind === 'rope') { tone(220, 0.25, { type: 'triangle', vol: 0.12, slide: 1.3 }); tone(286, 0.25, { type: 'triangle', vol: 0.12, slide: 0.8, delay: 0.25 }); } // creaky rope
}

export function hitSound(kind) {
  if (kind === 'crate') sfx.smash();
  else if (kind === 'log') sfx.jump();
  else if (kind === 'bird') sfx.dodge();
  else if (kind === 'rope') sfx.swing();
}

export function missSound(kind) {
  if (kind === 'rope') sfx.splash();
  else sfx.miss();
}

// ---------- Music: an energetic chiptune track for each world, scheduled ahead on the audio clock ----------

const music = { on: false, step: 0, next: 0, timer: null, bus: null, echo: null, intense: 0, song: null };
const hz = m => 440 * 2 ** ((m - 69) / 12);
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = n => { const m = /^([A-G])(#|b)?(\d)$/.exec(n); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
// A melody line: one token per 8th note, '.' rests, '-' holds the last note.
// Turns it into 16th-note steps: { n: midi, len: steps } on note starts.
function line(str) {
  const tok = str.replace(/\|/g, ' ').trim().split(/\s+/), out = [];
  tok.forEach((t, i) => {
    if (t === '-') { for (let j = out.length - 1; j >= 0; j--) if (out[j]) { out[j].len += 2; break; } }
    else if (t !== '.') out[i * 2] = { n: midi(t), len: 2 };
  });
  out.length = tok.length * 2;
  return out;
}
// Chords: "Am F C G" (one per bar) -> bass root (MIDI, around A2) and chord tones.
function chords(str) {
  return str.trim().split(/\s+/).map(c => {
    const m = /^([A-G](?:#|b)?)(m?)$/.exec(c), root = midi(m[1] + '2');
    return { root: root < 40 ? root + 12 : root, tones: m[2] ? [0, 3, 7, 12, 15, 19] : [0, 4, 7, 12, 16, 19] };
  });
}

// Eight-bar songs: chords per bar (four, played twice), a melody for bars
// 1-4 (A) and 5-8 (B), and 16-step drum and bass patterns.
// bass: r root, o octave up, f fifth, '.' rest.
// Every song is made for jumping about: 144-170 beats a minute, and faster
// still as the timer runs down.
const SONG_DEFS = {
  forest: { name: 'Treetop Sprint', bpm: 150, chords: 'Am F C G', lead: 'square', echo: true, arp: 'triangle',
    A: 'A4 . C5 E5 A5 - G5 E5 | F5 - E5 C5 A4 . C5 F5 | E5 - G5 - C6 - B5 G5 | D5 . G5 B5 D6 - B5 G5',
    B: 'E6 - D6 C6 A5 - C6 D6 | C6 - A5 F5 C6 - A5 F5 | G5 E5 G5 C6 E6 - D6 C6 | B5 - G5 D5 G5 A5 B5 D6',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'r.o.r.o.r.o.r.o.' },
  snow: { name: 'Snowball Blitz', bpm: 156, chords: 'C G Am F', lead: 'triangle', lead2: 'square', echo: true,
    A: 'C5 E5 G5 E5 C6 - G5 E5 | D5 G5 B5 G5 D6 - B5 G5 | E5 A5 C6 A5 E6 - C6 A5 | F5 A5 C6 A5 F5 . G5 A5',
    B: 'G5 - G5 - G5 - E5 F5 | G5 - D5 - B4 - D5 G5 | A5 - A5 - C6 - B5 A5 | F5 - E5 - D5 - C5 .',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '', jingle: 'x.x.x.x.x.x.x.xx', bass: 'r...f...r...f.o.', ping: true },
  desert: { name: 'Sand Viper', bpm: 146, chords: 'Dm Eb Dm C', lead: 'sawtooth', detune: true,
    A: 'D5 . A4 D5 F5 E5 D5 C#5 | Eb5 - G5 - Bb5 - G5 Eb5 | D5 F5 A5 - G5 F5 E5 D5 | C5 E5 G5 - E5 - C#5 .',
    B: 'A5 - Bb5 A5 G5 F5 E5 F5 | G5 - Bb5 - Eb6 - D6 Bb5 | A5 - F5 - D5 - F5 A5 | G5 E5 C5 E5 G5 - A5 .',
    kick: 'x.....x...x.....', snare: '....x.......x..x', hat: 'x.xxx.xxx.xxx.xx', bass: 'r.rr..r.r.rr.fo.', tom: '...........x.x.x' },
  space: { name: 'Comet Chase', bpm: 156, chords: 'Cm Ab Eb Bb', lead: 'sawtooth', voice: 'synth', bassVoice: 'saw', pad: true, bigSnare: true, echo: true, arp: 'triangle',
    A: 'G5 - - G5 Bb5 - C6 - | Eb6 - D6 C6 - Bb5 C6 - | G5 - - G5 Bb5 - Eb6 - | F6 - Eb6 D6 - Bb5 D6 F6',
    B: 'C6 - Eb6 - G6 - F6 Eb6 | C6 - - Ab5 - C6 Eb6 - | Bb5 - - G5 Eb5 - G5 Bb5 | D6 - F6 - Bb6 - - .',
    kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', bass: 'roorroorroorroor', laser: true },
  beach: { name: 'Fiesta Splash', bpm: 152, chords: 'C F G C', voice: 'steel', voiceB: 'brass', bassVoice: 'round', echo: true, shaker: true,
    A: 'E5 G5 . E5 G5 . C6 . | A5 . A5 G5 F5 . A5 . | B5 D6 . B5 G5 . D6 . | C6 . E6 . C6 G5 E5 .',
    B: 'C6 - C6 E6 G6 - E6 C6 | A5 - C6 - F6 - C6 A5 | B5 - D6 G6 - F6 D6 B5 | C6 - G5 - C6 - - .',
    kick: 'x.......x.......', snare: '', hat: '', bongo: '..x..xx...x..xx.', clave: 'x..x..x...x.x...', coco: 'h.l.h.l.h.l.hhl.', stabs: '...x..x....x..x.', bass: 'r..f..r.r..f..o.' },
  candy: { name: 'Sugar Rush', bpm: 168, chords: 'G Em C D', lead: 'square', arp: 'square', echo: true,
    A: 'G5 B5 D6 B5 G5 B5 D6 G6 | E5 G5 B5 G5 E5 G5 B5 E6 | C6 - E6 - G6 - E6 C6 | D6 - F#6 - A6 - F#6 D6',
    B: 'B5 - D6 - B5 - G5 A5 | B5 - G5 - E5 - G5 B5 | C6 B5 A5 G5 E5 G5 C6 E6 | D6 - - C6 B5 A5 F#5 A5',
    kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x.x.', hat: '..x...x...x...x.', bass: 'r.o.r.o.f.o.r.o.' },
  spooky: { name: 'Monster Dash', bpm: 144, chords: 'Em Em C B', lead: 'square', lead2: 'triangle', echo: true,
    A: 'E5 . G5 . B5 Bb5 A5 G5 | E5 . G5 . B5 - E6 . | C6 . B5 A5 G5 . E5 . | D#5 . F#5 . B5 - - .',
    B: 'E6 - D#6 E6 B5 - G5 B5 | E6 - D#6 E6 G6 - E6 . | C6 - B5 C6 E6 - C6 . | B5 A5 G5 F#5 D#5 - B4 .',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'r...f...o...f...', bell: true },
  boss: { name: "Captain Squawk's Showdown", bpm: 170, chords: 'Dm Bb C A', lead: 'sawtooth', detune: true, echo: true, arp: 'square',
    A: 'D5 D5 F5 D5 A5 D5 G5 F5 | D5 D5 F5 D5 Bb5 F5 D5 . | E5 E5 G5 E5 C6 G5 E5 . | C#5 E5 A5 C#6 E6 - C#6 A5',
    B: 'D6 - A5 - F5 - A5 D6 | F6 - D6 - Bb5 - F5 Bb5 | G6 - E6 - C6 - G5 E5 | A5 - C#6 - E6 - A6 .',
    kick: 'x.x.x.x.x.x.x.xx', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', bass: 'rrrrrrrrrrrrrrro', laser: true },
};
export const SONGS = Object.entries(SONG_DEFS).map(([id, d]) => ({ id, ...d, bars: chords(d.chords), melody: [...line(d.A), ...line(d.B)] }));

function note(freq, t, dur, type, vol, dest = music.bus, detune = 0) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Special instruments for some worlds.
let crunch = null;
function voice(kind, freq, t, dur, vol, dest) {
  const g = ac.createGain(), out = [];
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  let into = g;
  if (kind === 'synth' || kind === 'pad') {
    // Three detuned saws through a resonant low-pass that closes on each note.
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = kind === 'pad' ? 1 : 5;
    if (kind === 'pad') f.frequency.setValueAtTime(1100, t);
    else { f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(900, t + Math.max(0.08, dur)); }
    f.connect(g); into = f;
    for (const d of [-12, 0, 12]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); o.detune.value = d; out.push(o); }
    if (kind === 'pad') { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  } else if (kind === 'guitar') {
    // Overdriven surf guitar: two saws into a soft clipper and a mid-range band-pass.
    if (!crunch) { crunch = new Float32Array(1025); for (let i = 0; i < 1025; i++) crunch[i] = Math.tanh((i / 512 - 1) * 6); } // odd length: 0 in, 0 out
    const ws = ac.createWaveShaper(), bp = ac.createBiquadFilter(), lp = ac.createBiquadFilter();
    ws.curve = crunch; bp.type = 'peaking'; bp.frequency.value = 1400; bp.gain.value = 8; lp.type = 'lowpass'; lp.frequency.value = 3800;
    ws.connect(bp).connect(lp).connect(g); into = ws;
    for (const d of [-7, 7]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); o.detune.value = d; out.push(o); }
  } else if (kind === 'saw') {
    // Plucky filtered saw bass.
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(2000, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    f.connect(g); into = f;
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); out.push(o);
  } else {
    // 'round': a warm, thumpy bass.
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); out.push(o);
    const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(freq, t); out.push(o2);
  }
  g.connect(dest);
  for (const o of out) { o.connect(into); o.start(t); o.stop(t + dur + 0.05); }
}

// Fiesta instruments: steel drum, trumpets, and wooden clops.
function steel(freq, t, vol, dest) {
  // A steel pan: a bright ping of a few partials that rings and fades.
  for (const [m, v, d] of [[1, 1, 0.55], [2, 0.5, 0.35], [3.01, 0.22, 0.2], [4.2, 0.08, 0.1]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * m, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(g).connect(dest); o.start(t); o.stop(t + d + 0.02);
  }
}
function brass(freq, t, dur, vol, dest) {
  // A trumpet: a saw whose filter blares open, with a little vibrato.
  const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
  o.type = o2.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); o2.frequency.setValueAtTime(freq, t); o2.detune.value = 8;
  lfo.frequency.value = 6; lg.gain.value = freq * 0.006; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.05); f.frequency.exponentialRampToValueAtTime(1800, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, t + Math.max(0.04, dur - 0.05)); g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.04);
  o.connect(f); o2.connect(f); f.connect(g).connect(dest);
  for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.08); }
}
function clop(freq, t, vol) {
  // Coconut shells or a clave: a short hollow knock.
  const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.85, t + 0.04);
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
  o.connect(f).connect(g).connect(music.drums); o.start(t); o.stop(t + 0.08);
}

let noiseBuf = null;
function noiseHit(t, len, type, freq, vol, q = 1) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f).connect(g).connect(music.drums);
  src.start(t); src.stop(t + len + 0.02);
}

function drum(t, kind) {
  if (kind === 'kick' || kind === 'tom' || kind === 'bongo') {
    const [f0, f1, len, vol] = { kick: [150, 40, 0.15, 0.9], tom: [220, 90, 0.18, 0.5], bongo: [420, 260, 0.09, 0.35] }[kind];
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.8);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(music.drums);
    o.start(t); o.stop(t + len + 0.02);
    return;
  }
  if (kind === 'snare') return noiseHit(t, 0.15, 'highpass', 1200, 0.45);
  if (kind === 'clap') { for (const d of [0, 0.012, 0.024]) noiseHit(t + d, 0.1, 'bandpass', 1500, 0.35, 0.8); return; }
  if (kind === 'jingle') { noiseHit(t, 0.08, 'bandpass', 9000, 0.22, 2); noiseHit(t + 0.03, 0.06, 'bandpass', 7000, 0.15, 2); return; }
  noiseHit(t, 0.04, 'highpass', 7000, 0.18); // hat
}

const hit = (pat, beat) => pat && pat[beat] === 'x';
function schedule() {
  const S = music.song;
  const spb = 60 / (S.bpm + music.intense * 20) / 4; // seconds per 16th note
  while (music.next < ac.currentTime + 0.15) {
    const s = music.step % 128, beat = s % 16, bar = Math.floor(s / 16);
    const ch = S.bars[bar % S.bars.length], t = music.next, hot = music.intense;
    // Drums.
    if (hit(S.kick, beat)) drum(t, 'kick');
    if (hit(S.snare, beat)) { if (S.bigSnare) { noiseHit(t, 0.35, 'bandpass', 1800, 0.55, 0.6); noiseHit(t, 0.08, 'highpass', 3000, 0.3); } else drum(t, 'snare'); }
    if (hit(S.clave, beat)) clop(2400, t, 0.5);
    if (S.coco && S.coco[beat] !== '.') clop(S.coco[beat] === 'h' ? 1100 : 750, t, 0.55);
    if (hit(S.stabs, beat) && bar % 8 < 4) for (const k of [0, 1, 2]) brass(hz(ch.root + 24 + ch.tones[k]), t, spb * 1.1, 0.02, music.lead);
    if (S.shaker && beat % 2 === 0) noiseHit(t, 0.05, 'highpass', 9000, beat % 4 ? 0.1 : 0.16);
    if (S.pad && beat === 0) for (const k of [0, 1, 2]) voice('pad', hz(ch.root + 12 + ch.tones[k]), t, spb * 16, 0.03, music.bus);
    if (hit(S.clap, beat)) drum(t, 'clap');
    if (hit(S.hat, beat) || (hot > 0.5 && beat % 2 === 1 && !S.jingle)) drum(t, 'hat');
    if (hit(S.jingle, beat)) drum(t, 'jingle');
    if (hit(S.bongo, beat)) drum(t, 'bongo');
    if (hit(S.tom, beat) && bar % 2 === 1) drum(t, 'tom');
    // A drum fill into every fourth bar.
    if (bar % 4 === 3 && beat >= 12) drum(t, beat % 2 ? 'tom' : 'snare');
    // Bass.
    const b = S.bass[beat];
    if (b && b !== '.') {
      const bf = hz(ch.root - 12 + (b === 'o' ? 12 : b === 'f' ? 7 : 0));
      if (S.bassVoice) voice(S.bassVoice, bf, t, spb * (S.bassVoice === 'round' ? 2.4 : 1.4), S.bassVoice === 'round' ? 0.34 : 0.2, music.bus);
      else note(bf, t, spb * 1.6, 'square', 0.15);
    }
    // Chord arpeggio in 16ths, filling out as the timer runs down.
    if (S.arp && (hot > 0.2 || beat % 2 === 0)) note(hz(ch.root + 24 + ch.tones[[0, 1, 2, 3, 2, 1][s % 6]]), t, spb * 0.8, S.arp, 0.035);
    // Lead melody, with a second voice an octave down on some songs.
    const m = S.melody[s];
    if (m) {
      const dur = spb * m.len * 0.92;
      const vc = bar >= 4 && S.voiceB ? S.voiceB : S.voice;
      if (vc === 'steel') { steel(hz(m.n), t, 0.09, music.lead); if (m.len > 2) steel(hz(m.n), t + spb * 2, 0.06, music.lead); }
      else if (vc === 'brass') { brass(hz(m.n), t, dur, 0.045, music.lead); steel(hz(m.n - 12), t, 0.04, music.lead); }
      else if (S.voice) {
        if (S.tremolo) for (let k = 0; k < m.len; k++) voice(S.voice, hz(m.n), t + k * spb, spb * 0.9, 0.06, music.lead);
        else voice(S.voice, hz(m.n), t, Math.max(dur, spb * 1.5), 0.05, music.lead);
      }
      else if (S.tremolo) for (let k = 0; k < m.len; k++) note(hz(m.n), t + k * spb, spb * 0.85, S.lead, 0.05, music.lead);
      else note(hz(m.n), t, dur, S.lead, S.lead === 'sawtooth' ? 0.04 : 0.06, music.lead);
      if (S.detune) note(hz(m.n), t, dur, S.lead, 0.03, music.lead, 12);
      if (S.lead2) note(hz(m.n - 12), t, dur, S.lead2, 0.05, music.lead);
    }
    // Little world touches.
    if (S.laser && beat === 0 && bar % 2 === 1) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.25); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26); o.connect(g).connect(music.bus); o.start(t); o.stop(t + 0.28); }
    if (S.ping && beat === 14) note(hz(ch.root + 36), t, 0.4, 'sine', 0.06);
    if (S.bell && beat === 0) note(hz(ch.root + 31), t, 0.9, 'triangle', 0.06);
    music.next += spb;
    music.step++;
  }
}

// song: a world's id (forest, snow, …, or 'boss'), or a number to pick in turn.
export function startMusic(song = 0) {
  if (!ac || music.on) return;
  music.song = SONGS.find(x => x.id === song) || SONGS[((+song || 0) % SONGS.length + SONGS.length) % SONGS.length];
  music.step = 0;
  if (!music.bus) {
    music.bus = ac.createGain();
    // Keep sub-bass rumble and any DC out of the speakers.
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 35;
    music.bus.connect(hp).connect(master);
    // Drums a bit back, melody up front, so the tune carries over the beat.
    music.drums = ac.createGain(); music.drums.gain.value = 0.62; music.drums.connect(music.bus);
    // The lead goes through a little echo, for that big-arcade sound.
    music.lead = ac.createGain();
    music.lead.gain.value = 2.0;
    const d = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();
    fb.gain.value = 0.3; wet.gain.value = 0.35;
    music.lead.connect(music.bus);
    music.lead.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(music.bus);
    music.delay = d; music.wet = wet;
  }
  music.delay.delayTime.value = 60 / music.song.bpm * 0.75; // a dotted 8th
  music.wet.gain.value = music.song.echo ? 0.35 : 0;
  music.bus.gain.value = muted ? 0 : 0.45;
  music.on = true;
  music.next = ac.currentTime + 0.05;
  music.timer = setInterval(schedule, 40);
}

// Where the music's beats fall, so obstacles can land right on one.
// Returns the audio clock now, the time of a beat, and the beat length, or
// null when no music is playing.
export function beatInfo() {
  if (!ac || !music.on || !music.song) return null;
  const spb = 60 / (music.song.bpm + music.intense * 20) / 4;
  return { now: ac.currentTime, t0: music.next - (music.step % 4) * spb, period: spb * 4 };
}
// 1 right on a beat, fading to 0 just before the next one: for things that pulse with the music.
export function beatPulse() {
  const b = beatInfo();
  if (!b) return 0;
  const ph = (((b.now - b.t0) / b.period) % 1 + 1) % 1;
  return 1 - ph;
}

export function stopMusic() {
  music.on = false;
  clearInterval(music.timer);
}

// 0..1: speeds the music up and fills it out as the timer runs down.
export function setIntensity(v) { music.intense = Math.max(0, Math.min(1, v)); }

// ---------- Cues: a little sound for each thing coming, no voice ----------

// Like tone(), but panned left (-1) or right (+1).
function panned(pan, fn) {
  if (!ac || muted) return;
  const prev = master;
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  if (p) { p.pan.value = pan; p.connect(prev); master = p; }
  try { fn(); } finally { master = prev; }
}

const CUES = {
  // Jump: two springy hops going up.
  jump() { tone(330, 0.12, { type: 'triangle', vol: 0.35, slide: 2 }); tone(440, 0.14, { type: 'triangle', vol: 0.35, slide: 2.2, delay: 0.13 }); },
  // Punch: a double "pow", from the side to punch.
  punch(pan = 0) { panned(pan, () => { tone(160, 0.09, { vol: 0.35, slide: 0.5 }); noise(0.07, { vol: 0.4, from: 1800, to: 500 }); tone(200, 0.09, { vol: 0.35, slide: 0.5, delay: 0.12 }); noise(0.07, { vol: 0.4, from: 1800, to: 500, delay: 0.12 }); }); },
  // Duck: angry tweets, then a slide whistle dropping down.
  duck() { [0, 0.1, 0.2].forEach(d => tone(2200, 0.06, { type: 'sine', vol: 0.25, slide: 1.4, delay: d })); tone(900, 0.4, { type: 'sine', vol: 0.3, slide: 0.35, delay: 0.3 }); },
  // Rope: a slide whistle up and down, Tarzan style.
  rope() { tone(300, 0.25, { type: 'sine', vol: 0.3, slide: 3 }); tone(900, 0.25, { type: 'sine', vol: 0.3, slide: 0.5, delay: 0.25 }); tone(450, 0.3, { type: 'sine', vol: 0.3, slide: 2.5, delay: 0.5 }); },
  // Break games: a fanfare, plus something that sounds like the game.
  fanfare() { [523, 523, 659, 784].forEach((f, i) => tone(f, i === 3 ? 0.3 : 0.1, { vol: 0.2, delay: i * 0.11 })); },
  gong() { tone(98, 1.4, { type: 'sine', vol: 0.5 }); tone(196, 1.0, { type: 'sine', vol: 0.25 }); tone(293, 0.8, { type: 'triangle', vol: 0.12 }); },
  bubbles() { [400, 520, 650, 800, 980].forEach((f, i) => tone(f, 0.07, { type: 'sine', vol: 0.3, slide: 1.8, delay: i * 0.08 })); },
  siren() { [0, 0.35, 0.7].forEach(d => { tone(700, 0.17, { type: 'square', vol: 0.12, delay: d }); tone(950, 0.17, { type: 'square', vol: 0.12, delay: d + 0.17 }); }); },
};

const CUE_FOR = {
  jump: () => CUES.jump(), lesson_log: () => CUES.jump(),
  punch: () => CUES.punch(0), lesson_crate: () => CUES.punch(0),
  punch_left: () => CUES.punch(-0.8), punch_right: () => CUES.punch(0.8),
  duck: () => CUES.duck(), lesson_duck: () => CUES.duck(),
  rope: () => CUES.rope(), lesson_rope: () => CUES.rope(),
  throw_time: () => CUES.fanfare(), snowball_time: () => CUES.fanfare(),
  karate_time: () => { CUES.fanfare(); setTimeout(CUES.gong, 450); },
  bubble_time: () => { CUES.fanfare(); setTimeout(CUES.bubbles, 450); },
  fire_time: () => { CUES.fanfare(); setTimeout(CUES.siren, 450); },
  dance_time: () => CUES.fanfare(), kaiju_time: () => { CUES.fanfare(); setTimeout(() => sfx.stomp(), 450); },
  bugs_time: () => CUES.fanfare(), goalie_time: () => CUES.fanfare(), climb_time: () => CUES.fanfare(), tray_time: () => CUES.fanfare(), wyr_time: () => CUES.fanfare(),
  final_rush: () => CUES.siren(),
  back: () => sfx.ready(), got_it: () => sfx.level(),
};

// ---------- Announcer clips, decoded once and played on the audio clock ----------

const VOICE_LINES = [
  'jump', 'punch', 'punch_left', 'punch_right', 'duck', 'rope',
  'go', 'three', 'two', 'one', 'throw_time', 'karate_time', 'snowball_time', 'bubble_time', 'fire_time',
  'dance_time', 'kaiju_time', 'bugs_time', 'goalie_time', 'climb_time', 'tray_time', 'rain_time', 'fly_time', 'chops_time', 'wyr_time', 'swim_time',
  'back', 'final_rush', 'great', 'ready', 'lesson_log', 'lesson_crate', 'lesson_duck', 'lesson_rope',
  'got_it', 'lobby', 'heart', 'champions', 'boss_time', 'boss_win', 'eagle_time', 'feed_time', 'eagle_level',
];
const clips = {};
let current = null;

function loadClip(name, path = `voice/${name}.mp3`) {
  if (!ac || clips[name]) return;
  fetch(path)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    // Older Safari only has the callback form of decodeAudioData.
    .then(buf => new Promise((ok, bad) => ac.decodeAudioData(buf, ok, bad)))
    .then(b => { clips[name] = b; })
    .catch(() => { /* falls back to the synthesised cue */ });
}

function loadVoices() {
  for (const name of VOICE_LINES) loadClip(name);
}

// Extra lines fetched only when needed, like the Would You Rather questions.
export function preloadLine(name, path) { loadClip(name, path); }
// Plays a loaded line and returns how long it runs, in seconds (0 if it can't play).
export function say(name) {
  if (!ac || muted || !clips[name]) return 0;
  playClip(name);
  return clips[name].duration;
}

function playClip(name) {
  const t = ac.currentTime;
  if (current && current.end > t) { try { current.src.stop(); } catch { } }
  const src = ac.createBufferSource();
  src.buffer = clips[name];
  const g = ac.createGain();
  g.gain.value = 1.6;
  src.connect(g).connect(master);
  src.start(t);
  current = { src, end: t + clips[name].duration };
}

let announcer = true;
export function setAnnouncer(on) { announcer = on; }

// Lines with no recorded clip yet: the browser's own voice says them, so the
// kids still hear what to do. A recorded voice/<name>.mp3 takes over.
const SPOKEN = {
  duck: 'Duck!', lesson_duck: 'Crazy bird! Duck under it!',
  boss_time: 'Boss time! Captain Squawk is here! Throw bombs at him, and duck when he swoops!',
  boss_win: 'Super Eagle knocked out Captain Squawk!',
  eagle_time: "Look! It's Super Eagle, the crazy bird's arch enemy!",
  feed_time: 'Feed Super Eagle! Throw your points into his beak!',
  eagle_level: 'Super Eagle leveled up!',
};
function speak(text) {
  try {
    const s = window.speechSynthesis;
    if (!s) return false;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 1.05; u.pitch = 1.3; u.volume = 1;
    s.speak(u);
    return true;
  } catch { return false; }
}

// Plays what a game moment calls for: the announcer clip if there is one
// (and the announcer is on), otherwise its synthesised sound cue.
export function cue(name) {
  if (!ac || muted) return;
  if (announcer && clips[name]) {
    if (name.endsWith('_time')) CUES.fanfare();
    playClip(name);
    return;
  }
  if (announcer && SPOKEN[name] && speak(SPOKEN[name])) return;
  CUE_FOR[name]?.();
}
