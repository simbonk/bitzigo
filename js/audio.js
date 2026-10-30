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
  smash() {
    tone(90, 0.18, { type: 'sine', vol: 0.6, slide: 0.5 });                 // thump
    noise(0.3, { vol: 0.7, from: 2500, to: 300 });                          // crunch
    [0.04, 0.09, 0.15, 0.22].forEach(d => noise(0.05, { vol: 0.35, from: 5000, to: 2500, q: 3, delay: d })); // splinters
    tone(660, 0.08, { vol: 0.12, delay: 0.02 }); tone(990, 0.1, { vol: 0.1, delay: 0.07 });
  },
  // Jump: springy boing.
  jump() { tone(260, 0.25, { type: 'triangle', vol: 0.35, slide: 3 }); noise(0.2, { vol: 0.25, from: 500, to: 2500, q: 2 }); tone(523, 0.08, { vol: 0.12, delay: 0.22 }); tone(784, 0.1, { vol: 0.12, delay: 0.28 }); },
  // Bird dodged: whoosh past plus a cross squawk.
  dodge() { noise(0.3, { vol: 0.5, from: 600, to: 3500, q: 2 }); tone(1400, 0.08, { type: 'sawtooth', vol: 0.1, slide: 0.6, delay: 0.12 }); tone(1300, 0.08, { type: 'sawtooth', vol: 0.1, slide: 0.6, delay: 0.22 }); },
  // Rope swing: a rising-falling slide whistle.
  swing() { tone(400, 0.35, { type: 'sine', vol: 0.3, slide: 3 }); tone(1200, 0.35, { type: 'sine', vol: 0.25, slide: 0.4, delay: 0.35 }); },
  splash() { tone(150, 0.2, { type: 'sine', vol: 0.4, slide: 0.4 }); noise(0.6, { vol: 0.7, from: 1800, to: 200, q: 0.7 }); [0.2, 0.32, 0.45].forEach(d => tone(900 + d * 1000, 0.05, { type: 'sine', vol: 0.15, slide: 1.6, delay: d })); },
  squawk() { tone(900, 0.12, { type: 'sawtooth', vol: 0.2, slide: 1.4 }); tone(800, 0.18, { type: 'sawtooth', vol: 0.2, slide: 0.6, delay: 0.12 }); noise(0.25, { vol: 0.3, from: 1200, to: 3000, q: 2, delay: 0.05 }); [0, 0.07, 0.14].forEach(d => noise(0.04, { vol: 0.25, from: 600, to: 400, q: 1, delay: 0.3 + d })); },
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
  chop() { noise(0.12, { vol: 0.7, from: 3000, to: 600, q: 1.5 }); tone(180, 0.1, { vol: 0.25, slide: 0.5 }); },
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
    // Flapping wings and an angry caw.
    for (let i = 0; i < 6; i++) noise(0.05, { vol: 0.3, from: 700, to: 300, q: 1, delay: i * 0.08 });
    tone(1100, 0.14, { type: 'sawtooth', vol: 0.12, slide: 0.7, delay: 0.15 });
    tone(1000, 0.16, { type: 'sawtooth', vol: 0.12, slide: 0.6, delay: 0.32 });
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
  else if (kind === 'bird') sfx.squawk();
  else sfx.miss();
}

// ---------- Music: a bouncy chiptune loop, scheduled ahead on the audio clock ----------

const music = { on: false, bpm: 128, step: 0, next: 0, timer: null, bus: null, intense: 0, song: null };
const hz = m => 440 * 2 ** ((m - 69) / 12);
// Chord tones for the lead to pick from: major (M) or minor (m).
const TONES = { M: [0, 4, 7, 12, 16, 19], m: [0, 3, 7, 12, 15, 19] };
// Four-bar loops. roots: bass note per bar (MIDI); q: chord quality per bar;
// lead: 16 steps of chord-tone indexes (-1 rests); beat: drum pattern.
export const SONGS = [
  { name: 'Forest Run', bpm: 128, roots: [57, 53, 48, 55], q: 'mMMM', lead: [0, 2, 3, 2, 4, 3, 2, 3, 0, 2, 3, 4, 5, 4, 3, 2], wave: 'square', beat: 'four' },
  { name: 'Snow Dash', bpm: 140, roots: [48, 55, 57, 53], q: 'MMmM', lead: [3, -1, 2, 3, 4, -1, 3, 2, 1, 2, 3, -1, 4, 5, 4, 3], wave: 'triangle', beat: 'four' },
  { name: 'Desert Zoom', bpm: 132, roots: [50, 46, 48, 45], q: 'mMMM', lead: [0, 1, 2, 1, 3, 2, 1, 2, 0, -1, 2, 3, 4, 3, 2, 1], wave: 'sawtooth', beat: 'break' },
  { name: 'Space Hop', bpm: 120, roots: [52, 48, 55, 50], q: 'mMMM', lead: [0, 2, 4, 2, 0, 2, 4, 5, 3, 2, 4, 2, 3, 4, 5, 4], wave: 'square', beat: 'break' },
  { name: 'Hyper Rush', bpm: 150, roots: [54, 50, 57, 52], q: 'mMMM', lead: [3, 3, 2, 3, 4, 3, 2, 1, 3, 3, 2, 3, 5, 4, 3, 2], wave: 'square', beat: 'four' },
];

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
  const song = music.song;
  const spb = 60 / (song.bpm + music.intense * 24) / 4; // seconds per 16th note
  while (music.next < ac.currentTime + 0.15) {
    const s = music.step % 64, beat = s % 16, bar = Math.floor(s / 16);
    const root = song.roots[bar], t = music.next;
    if (song.beat === 'four' ? beat % 4 === 0 : beat === 0 || beat === 6 || beat === 10) drum(t, 'kick');
    if (beat === 4 || beat === 12) drum(t, 'snare');
    if (beat % 2 === 1) drum(t, 'hat');
    if (music.intense > 0.5 && beat % 4 === 2) drum(t, 'hat');
    // Octave-bouncing bass on every 8th note.
    if (beat % 2 === 0) note(hz(root - 12 + (beat % 4 === 2 ? 12 : 0)), t, spb * 1.8, 'square', 0.16);
    // Lead arpeggio, busier as the workout heats up.
    const li = song.lead[beat];
    if (li >= 0 && (beat % 2 === 0 || music.intense > 0.3)) note(hz(root + 12 + TONES[song.q[bar]][li]), t, spb * 0.9, song.wave, song.wave === 'sawtooth' ? 0.04 : 0.06);
    music.next += spb;
    music.step++;
  }
}

export function startMusic(songIndex = 0) {
  if (!ac || music.on) return;
  music.song = SONGS[((songIndex % SONGS.length) + SONGS.length) % SONGS.length];
  music.step = 0;
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
  // Bird: angry tweets from the side the bird comes from.
  bird(pan = 0) { panned(pan, () => [0, 0.1, 0.2].forEach(d => tone(2200, 0.06, { type: 'sine', vol: 0.25, slide: 1.4, delay: d }))); },
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
  // lean_right means the bird is on the left.
  lean_right: () => CUES.bird(-0.8), lean_left: () => CUES.bird(0.8), lesson_bird: () => CUES.bird(-0.8),
  rope: () => CUES.rope(), lesson_rope: () => CUES.rope(),
  throw_time: () => CUES.fanfare(), snowball_time: () => CUES.fanfare(),
  karate_time: () => { CUES.fanfare(); setTimeout(CUES.gong, 450); },
  bubble_time: () => { CUES.fanfare(); setTimeout(CUES.bubbles, 450); },
  fire_time: () => { CUES.fanfare(); setTimeout(CUES.siren, 450); },
  final_rush: () => CUES.siren(),
  back: () => sfx.ready(), got_it: () => sfx.level(),
};

// ---------- Announcer clips, decoded once and played on the audio clock ----------

const VOICE_LINES = [
  'jump', 'punch', 'punch_left', 'punch_right', 'lean_left', 'lean_right', 'rope',
  'go', 'three', 'two', 'one', 'throw_time', 'karate_time', 'snowball_time', 'bubble_time', 'fire_time',
  'back', 'final_rush', 'great', 'ready', 'lesson_log', 'lesson_crate', 'lesson_bird', 'lesson_rope',
  'got_it', 'lobby', 'heart', 'champions',
];
const clips = {};
let current = null;

function loadVoices() {
  for (const name of VOICE_LINES) {
    fetch(`voice/${name}.mp3`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      // Older Safari only has the callback form of decodeAudioData.
      .then(buf => new Promise((ok, bad) => ac.decodeAudioData(buf, ok, bad)))
      .then(b => { clips[name] = b; })
      .catch(() => { /* falls back to the synthesised cue */ });
  }
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

// Plays what a game moment calls for: the announcer clip if there is one
// (and the announcer is on), otherwise its synthesised sound cue.
export function cue(name) {
  if (!ac || muted) return;
  if (announcer && clips[name]) {
    if (name.endsWith('_time')) CUES.fanfare();
    playClip(name);
    return;
  }
  CUE_FOR[name]?.();
}
