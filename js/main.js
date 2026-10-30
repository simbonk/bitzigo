import { Player, Course, COLORS, BREAKS, KEYMAP, features, keyActions } from './game.js';
import { MINI, keyHands, handsMini } from './minigames.js';
import { laneBox, drawLaneWorld, drawLaneHud, drawCharacter, cartoonPose, drawCamera, text, CHARACTERS, THEMES } from './render.js';
import { unlockAudio, sfx, hitSound, missSound, approachSound, cue, setAnnouncer, setMuted, startMusic, stopMusic, setIntensity } from './audio.js';
import { startCamera, stopCamera, createTracker } from './pose.js';
import { runHeartCheck, awake } from './heart.js';

const $ = s => document.querySelector(s);
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const low = document.createElement('canvas'); // chunky pixel world
const lctx = low.getContext('2d');
const video = $('#cam');

const settings = {
  count: 4, mode: 'camera', facing: 'user', seconds: 120, theme: 'forest', intro: true, course: 'together',
  players: [
    { name: 'Player 1', age: 10 }, { name: 'Player 2', age: 8 },
    { name: 'Player 3', age: 6 }, { name: 'Player 4', age: 4 },
  ],
};
try { Object.assign(settings, JSON.parse(localStorage.getItem('bitzigo') || '{}')); } catch { }
const save = () => { try { localStorage.setItem('bitzigo', JSON.stringify(settings)); } catch { } };

let state = 'setup';   // setup | loading | lobby | ready | tutorial | play | end | heart
let players = [];
let slotChar = [0, 1, 2, 3];
let tracker = null;
let camFacing = null;   // which camera the running stream uses
const watch = { time: -1, since: 0, busy: false }; // camera freeze watchdog
let frame = null;       // latest pose result
let keys = new Set();
let showCam = true, debug = false, muted = false;
let W = 0, H = 0, PX = 4;
let stateT = 0;         // time entered current state
let roundT = 0;         // seconds into the workout
let banner = null;      // { text, sub, until }
let tut = null;
let lobby = [];         // per slot lobby state

// ---------------- Setup screen ----------------

function seg(id, attr, key, parse = v => v) {
  const el = $(id);
  el.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', String(settings[key]) === String(parse(b.dataset[attr])));
    b.onclick = () => {
      settings[key] = parse(b.dataset[attr]);
      el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (key === 'count') renderPlayerRows();
      if (key === 'mode') $('#camRow').classList.toggle('hidden', settings.mode !== 'camera');
      save();
    };
  });
}

function renderPlayerRows() {
  const box = $('#players');
  box.innerHTML = '';
  for (let i = 0; i < settings.count; i++) {
    const p = settings.players[i];
    const row = document.createElement('div');
    row.className = 'player';
    const ages = [4, 5, 6, 7, 8, 9, 10, 11, 12].map(a => `<option value="${a}" ${a === p.age ? 'selected' : ''}>${a === 12 ? 'adult' : `age ${a}`}</option>`).join('');
    row.innerHTML = `<span class="dot" style="background:${COLORS[i]}"></span><input maxlength="12" value=""><select>${ages}</select>`;
    const input = row.querySelector('input');
    input.value = p.name;
    input.oninput = () => { p.name = input.value; save(); };
    row.querySelector('select').onchange = e => { p.age = Number(e.target.value); save(); };
    box.appendChild(row);
  }
}

seg('#count', 'n', 'count', Number);
seg('#mode', 'mode', 'mode');
seg('#facing', 'facing', 'facing');
seg('#length', 'sec', 'seconds', Number);
seg('#theme', 'theme', 'theme');
seg('#intro', 'intro', 'intro', v => v === '1');
seg('#course', 'course', 'course');
$('#camRow').classList.toggle('hidden', settings.mode !== 'camera');
renderPlayerRows();

// Full screen: real fullscreen where the browser allows it (Chrome, iPad
// Safari, desktop). iPhone Safari doesn't, so it points to Add to Home Screen,
// which opens the game with no browser bars.
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const canFs = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function enterFullscreen() {
  const el = document.documentElement;
  if (fsEl() || standalone) return;
  try {
    const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    r?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => { })).catch(() => { });
  } catch { }
}
function toggleFullscreen() {
  if (!canFs) { $('#fsTip').classList.toggle('hidden'); return; }
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else enterFullscreen();
}
if (standalone) $('#fs').classList.add('hidden');
$('#fs').onclick = toggleFullscreen;
$('#helpBtn').onclick = () => { $('#setup').classList.add('hidden'); $('#help').classList.remove('hidden'); };
$('#helpClose').onclick = () => { $('#help').classList.add('hidden'); $('#setup').classList.remove('hidden'); };
$('#btnFs').onclick = toggleFullscreen;
if (standalone || !canFs) $('#btnFs').classList.add('hidden');

const exitFullscreen = () => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
document.addEventListener('fullscreenchange', updateFsNudge);
document.addEventListener('webkitfullscreenchange', updateFsNudge);
$('#fsNudge').onclick = () => { enterFullscreen(); setTimeout(updateFsNudge, 500); };
function updateFsNudge() {
  $('#fsNudge').classList.toggle('hidden', state !== 'lobby' || !canFs || standalone || !!fsEl());
}

// Starts (or restarts) the camera stream and builds the body tracker once.
// The tracker is reused between rounds: building a new one each time used up
// the phone's graphics memory, which froze the camera on the second game.
async function ensureCamera() {
  watch.busy = true;
  try { await openCamera(); } finally { watch.busy = false; watch.since = now(); }
}
async function openCamera() {
  const live = video.srcObject?.getVideoTracks().some(t => t.readyState === 'live');
  if (!live || camFacing !== settings.facing) {
    stopCamera(video);
    await startCamera(video, settings.facing);
    camFacing = settings.facing;
  } else if (video.paused) {
    await video.play();
  }
  if (!tracker || tracker.players !== settings.count) {
    tracker?.close();
    tracker = null;
    tracker = await createTracker(video, settings.count);
  }
}

$('#go').onclick = async () => {
  unlockAudio();
  $('#status').textContent = '';
  awake.start();
  players = settings.players.slice(0, settings.count).map((cfg, i) => new Player(i, cfg));
  players.forEach(p => { p.gear = { ...(slotGear[p.index] || {}) }; });
  if (settings.mode === 'camera') {
    // Ask for the camera before going full screen: on iPad the permission
    // prompt gets lost behind a full screen page.
    if (!video.srcObject && fsEl()) { try { await exitFullscreen(); } catch { } }
    $('#go').disabled = true;
    $('#status').textContent = 'Starting camera and loading the body tracker…';
    try {
      await ensureCamera();
    } catch (e) {
      console.error(e);
      $('#status').textContent = `Couldn't start the camera: ${e.message || e}. You can try Keyboard test instead.`;
      $('#go').disabled = false;
      stopCamera(video);
      return;
    }
    $('#go').disabled = false;
  } else {
    stopCamera(video);
  }
  // After a camera prompt some browsers refuse full screen; the lobby then
  // shows a big button for it.
  if (canFs) enterFullscreen();
  $('#setup').classList.add('hidden');
  enterLobby();
};

function playerEvent(type, o) {
  if (type === 'hit') hitSound(o.kind);
  else if (type === 'miss') missSound(o.kind);
  else if (sfx[type]) sfx[type]();
}

// ---------------- States ----------------

function setState(s) {
  state = s;
  stateT = now();
  $('#hudButtons').classList.toggle('hidden', !['lobby', 'ready', 'tutorial', 'play'].includes(s));
  $('#btnStart').classList.toggle('hidden', s !== 'lobby');
  updateFsNudge();
}

function enterLobby() {
  course = null;
  together = false;
  setAnnouncer(true);
  lobby = players.map(() => ({ found: false, ready: false, upSince: 0, armLatch: false }));
  players.forEach(p => { p.reset(); p.clearCalibration(); p.trackX = null; p.homeX = null; p.heartRate = null; p.onEvent = playerEvent; });
  tracks = [];
  if (settings.mode === 'camera') ensureCamera().catch(e => console.error(e));
  setState('lobby');
  updateFsNudge();
  if (settings.mode === 'camera') cue('lobby');
}

function startReady() {
  // Everyone found (or the parent pressed Start): calibrate and count down.
  players.forEach(p => { p.clearCalibration(); p.character = CHARACTERS[slotChar[p.index]]; });
  setHomes();
  together = settings.course !== 'own' && players.length > 1;
  setState('ready');
  showBanner('Arms down, stand tall!', 'Get ready…', 2.4);
  cue('ready');
}

function startTutorial() {
  setState('tutorial');
  startMusic(songTurn);
  players.forEach(p => { p.tutorial = true; });
  tut = { step: -1, next: now() + 0.3 };
}

const LESSONS = [
  { kind: 'log', title: 'Brick wall? JUMP!' },
  { kind: 'crate', side: 'mid', title: 'Crate? PUNCH it!' },
  { kind: 'bird', side: 'left', title: 'Crazy bird? LEAN away!' },
  { kind: 'rope', title: 'Puddle? GRAB the rope!' },
];

// Short calls from the cartoon announcer as each obstacle gets close.
function callFor(o) {
  if (o.kind === 'log') return 'jump';
  if (o.kind === 'rope') return 'rope';
  if (o.kind === 'bird') return o.side === 'left' ? 'lean_right' : 'lean_left';
  return o.side === 'mid' ? 'punch' : `punch_${o.side}`;
}
let lastCall = 0;
function callMoves(t) {
  let best = null;
  for (const p of players) {
    for (const o of p.obstacles) {
      if (o.called || o.result) continue;
      const z = (o.arrive - p.clock) / o.travel;
      if (z < 0.5 && (!best || z < best.z)) best = { o, z };
    }
  }
  if (!best || t - lastCall < 1.1) return;
  // Mark everything due now as called, so the cues don't fall behind.
  for (const p of players) for (const o of p.obstacles) if (!o.called && (o.arrive - p.clock) / o.travel < 0.5) o.called = true;
  lastCall = t;
  approachSound(best.o.kind, best.o.side);
  cue(callFor(best.o));
}

// Stop-and-do breaks: once in a 1 minute workout, more in longer ones.
function planThrows(dur) {
  if (!dur) return [...Array(60)].map((_, i) => 35 + i * 45);
  if (dur < 60) return [];
  const n = dur >= 180 ? 4 : dur >= 120 ? 3 : 1;
  return [...Array(n)].map((_, i) => Math.round((dur * (i + 1)) / (n + 1)));
}
const THROW_SECS = 13;
const BREAK_INFO = {
  cans: { title: 'THROW TIME!', sub: 'Throw the ball to knock down the cans!', clip: 'throw_time' },
  karate: { title: 'KARATE TIME!', sub: 'Chop down hard to break the boards!', clip: 'karate_time' },
  bubbles: { title: 'BUBBLE TIME!', sub: 'Flap your arms to fly up and pop the bubbles!', clip: 'bubble_time' },
  snowman: { title: 'SNOWBALL TIME!', sub: 'Throw snowballs to knock down the snowman!', clip: 'snowball_time' },
  fire: { title: 'FIRE TIME!', sub: 'Point your arm to spray the hose and put the fires out!', clip: 'fire_time' },
  dance: { title: 'DANCE OFF!', sub: 'Copy the dance move on the card, in time!', clip: 'dance_time' },
  kaiju: { title: 'MONSTER TIME!', sub: 'Both arms up and SLAM the buildings! Swat the helicopters!', clip: 'kaiju_time' },
  bugs: { title: 'BUG SPLAT!', sub: 'Slap the bugs wherever they pop up!', clip: 'bugs_time' },
  goalie: { title: 'GOALIE TIME!', sub: 'Block the balls with your hands!', clip: 'goalie_time' },
  climb: { title: 'BEANSTALK CLIMB!', sub: 'Reach up with one hand, then the other!', clip: 'climb_time' },
  tray: { title: 'PANCAKE TOWER!', sub: 'Move your hands to catch pancakes. Dodge the boots!', clip: 'tray_time' },
};
let throwPlan = [], throwEnd = 0;
// Breaks come out of a shuffled bag, so every game is different and nothing
// repeats until they've all had a turn.
let breakBag = [];
function nextBreak() {
  if (!breakBag.length) {
    breakBag = BREAKS.filter(b => b !== (settings.theme === 'snow' ? 'cans' : 'snowman')).sort(() => Math.random() - 0.5);
  }
  return breakBag.shift();
}
let slotGear = [];      // hats each player slot has collected

function startPlay() {
  setState('play');
  startMusic(songTurn);
  roundT = 0;
  throwPlan = planThrows(settings.seconds);
  throwEnd = 0;
  if (together) {
    // Line every lane up on the same clock before the course starts.
    const c = Math.max(...players.map(p => p.clock));
    players.forEach(p => { p.clock = c; p.obstacles = []; });
  }
  players.forEach(p => { p.startRound(); p.shared = together; p.paceSkill = null; });
  course = together ? new Course() : null;
  // The announcer only calls moves when everyone shares one course; with
  // separate courses it would talk over itself, so each move gets a sound.
  setAnnouncer(together || players.length === 1);
  course?.resume(players[0].clock);
  showBanner('GO!', settings.seconds ? `${Math.round(settings.seconds / 60)} minute workout` : 'Endless mode', 1.4);
  cue('go');
  sfx.beep(true);
}

function endRound() {
  setState('end');
  stopMusic();
  songTurn++;
  players.forEach(p => p.throwing && p.stopThrowing());
  sfx.finish();
  cue('great');
  players.forEach(p => { slotGear[p.index] = { ...p.gear }; });
  showResults();
}

function showBanner(textStr, sub = '', secs = 2) {
  banner = { text: textStr, sub, until: now() + secs, from: now() };
}


// ---------------- End screen ----------------

function showResults() {
  const box = $('#results');
  box.innerHTML = '';
  const awards = pickAwards(players);
  [...players].sort((a, b) => b.score - a.score).forEach(p => {
    const div = document.createElement('div');
    div.className = 'result';
    const face = p.face ? `<img class="face" src="${p.face}" alt="">` : `<span class="face noface" style="background:${p.color}">${p.index + 1}</span>`;
    div.innerHTML = `<span class="bubble" style="border-color:${p.color}">${face}<span class="badge">${shortScore(p.score)}</span></span>
      <div class="who"><div class="name"></div><div class="award"></div>
      <div class="sub">Level ${Math.floor(p.peakSkill) + 1} · ${p.hits} moves · best streak ${p.bestStreak}</div></div>
      <div class="nums"><div class="score">${p.score.toLocaleString()}</div>
      <div class="hr">♥ ${p.heartRate ? `${p.heartRate} bpm` : '--'}</div></div>`;
    div.querySelector('.name').textContent = `${p.name} the ${p.character?.name || 'Mover'}`;
    div.querySelector('.award').textContent = awards.get(p);
    box.appendChild(div);
  });
  const hasHR = players.some(p => p.heartRate);
  $('#heart').textContent = hasHR ? '♥ Redo heart check' : '♥ Heart check';
  $('#splash').innerHTML = splashHtml();
  $('#end').classList.remove('hidden');
}

function shortScore(n) {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// The champions banner: top score and (after the heart check) biggest heartbeat.
function splashHtml() {
  if (!players.length) return '';
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const face = p => p.face ? `<img class="face" src="${p.face}" alt="">` : `<span class="face noface" style="background:${p.color}">${p.index + 1}</span>`;
  const top = players.reduce((a, b) => (b.score > a.score ? b : a));
  let html = `<div class="champ"><div class="bubble lg" style="border-color:${top.color}">${face(top)}</div>
    <div><div class="label">Highest score</div><div class="champName">${esc(top.name)}</div><div class="champVal">${top.score.toLocaleString()}</div></div></div>`;
  const hrs = players.filter(p => p.heartRate);
  if (hrs.length) {
    const h = hrs.reduce((a, b) => (b.heartRate > a.heartRate ? b : a));
    html += `<div class="champ"><div class="bubble lg" style="border-color:${h.color}">${face(h)}</div>
      <div><div class="label">Hardest working heart</div><div class="champName">${esc(h.name)}</div><div class="champVal">♥ ${h.heartRate} bpm</div></div></div>`;
  }
  return html;
}

// Every kid gets a different award, so nobody walks away empty-handed.
function pickAwards(ps) {
  const pool = [
    ['Top Score', p => p.score],
    ['Streak Star', p => p.bestStreak],
    ['Crate Smasher', p => p.counts.punch],
    ['Super Jumper', p => p.counts.jump],
    ['Bird Dodger', p => p.counts.dodge],
    ['Jungle Swinger', p => p.counts.swing],
    ['Sharp Shooter', p => p.counts.knock],
    ['Karate Master', p => p.counts.chop],
    ['Bubble Popper', p => p.counts.pop],
    ['Hat Collector', p => p.counts.gear],
    ['Fire Hero', p => p.counts.fire],
    ['Dance Star', p => p.counts.dance],
    ['City Stomper', p => p.counts.stomp],
    ['Bug Squasher', p => p.counts.bugs],
    ['Super Goalie', p => p.counts.saves],
    ['Beanstalk Climber', p => p.counts.climb],
    ['Pancake Stacker', p => p.counts.stack],
    ['Level Climber', p => p.peakSkill - p.startSkill],
  ];
  const out = new Map();
  for (const [name, fn] of pool) {
    const free = ps.filter(p => !out.has(p) && fn(p) > 0);
    if (!free.length) continue;
    const best = free.reduce((a, b) => (fn(b) > fn(a) ? b : a));
    out.set(best, `🏆 ${name}`);
  }
  const cheers = ['Great Mover', 'Super Trier', 'Rising Star', 'Never Gave Up'];
  ps.forEach((p, i) => out.has(p) || out.set(p, `🏆 ${cheers[i % cheers.length]}`));
  return out;
}

$('#again').onclick = () => { $('#end').classList.add('hidden'); unlockAudio(); enterLobby(); };
$('#menu').onclick = () => { $('#end').classList.add('hidden'); setState('setup'); $('#setup').classList.remove('hidden'); };
$('#heart').onclick = async () => {
  $('#end').classList.add('hidden');
  // The camera rests during the heart check; the tracker is kept for later.
  stopCamera(video);
  frame = null;
  setState('heart');
  document.body.classList.add('heart-mode');
  await runHeartCheck(players, { cue, sfx });
  document.body.classList.remove('heart-mode');
  setState('end');
  showResults();
  if (players.some(p => p.heartRate)) cue('champions');
};

// ---------------- Input ----------------

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code.startsWith('Arrow') && state !== 'setup') e.preventDefault();
  if (e.code === 'KeyV') showCam = !showCam;
  if (e.code === 'Backquote') debug = !debug;
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyC' && (state === 'play' || state === 'tutorial')) recalibrate();
  if (e.code === 'Enter' && state === 'lobby') startReady();
  if (e.code === 'Escape' && ['lobby', 'ready', 'tutorial', 'play'].includes(state)) endRound();
});
addEventListener('keyup', e => keys.delete(e.code));
$('#btnStart').onclick = () => state === 'lobby' && startReady();
$('#btnCam').onclick = () => { showCam = !showCam; };
$('#btnMute').onclick = toggleMute;
$('#btnStop').onclick = () => endRound();

function toggleMute() {
  muted = !muted;
  setMuted(muted);
  $('#btnMute').textContent = muted ? 'Sound off' : 'Sound';
}

function recalibrate() {
  players.forEach(p => p.clearCalibration());
  showBanner('Stand still!', 'Re-learning your normal stance', 1.5);
}

// ---------------- Tracking ----------------

function poseX(pts, aspect) {
  const f = features(pts);
  return f ? { x: f.hip.x / aspect, f } : null;
}

// People in view, smoothed over brief detection drop-outs.
let course = null;      // shared course in together mode
let together = false;
let songTurn = 0;       // a different song each round   // everyone on one course and one clock (from the countdown on)
let tracks = [];
let trackWidth = 0.1;   // typical torso length, as a fraction of the picture width
function updateTracks(t) {
  if (!frame || frame === updateTracks.last) return;
  updateTracks.last = frame;
  const all = frame.poses.map(pts => ({ pts, ...poseX(pts, frame.aspect) })).filter(o => o.f);
  // One kid seen twice (the tracker looks at overlapping slices of the
  // picture) would otherwise count as two people: keep the bigger one.
  const found = [];
  for (const o of all.sort((a, b) => b.f.torso - a.f.torso)) {
    const w = o.f.torso / frame.aspect; // torso length as a fraction of the picture width
    if (!found.some(k => Math.abs(k.x - o.x) < 0.45 * w)) found.push(o);
  }
  trackWidth = found.length ? found.reduce((a, o) => a + o.f.torso, 0) / found.length / frame.aspect : trackWidth;
  for (const o of found) {
    let best = null, bd = 0.08;
    for (const tr of tracks) {
      const d = Math.abs(tr.x - o.x);
      if (d < bd && tr.stamp !== t) { bd = d; best = tr; }
    }
    if (!best) tracks.push(best = {});
    Object.assign(best, { x: o.x, pts: o.pts, f: o.f, seen: t, stamp: t });
  }
  tracks = tracks.filter(tr => t - tr.seen < 0.8);
}

// Lobby: whoever is in view, left to right, becomes players 1..n.
function assignLobby(t) {
  updateTracks(t);
  // Once everyone has been seen together, each kid keeps their own spot, so a
  // brief miss doesn't shuffle characters between kids.
  if (players.every(p => p.homeX != null)) {
    assignHomes(t, 0.1);
    return tracks.length;
  }
  const chosen = [...tracks].sort((a, b) => b.f.torso - a.f.torso).slice(0, players.length).sort((a, b) => a.x - b.x);
  players.forEach((p, i) => {
    const o = chosen[i];
    p.pts = o ? o.pts : null;
    p.trackX = o ? o.x : null;
    if (o) p.lastSeen = t;
  });
  // Lock spots only once everyone is clearly standing apart.
  const apart = chosen.every((o, k) => k === 0 || o.x - chosen[k - 1].x > 0.6 * trackWidth);
  if (chosen.length === players.length && apart) setHomes();
  return tracks.length;
}

// In play: every kid has a home spot, set when the lobby ends. Kids stand in
// place and never pass each other, so people in view are matched to homes
// keeping their left-to-right order, each person to the nearest free home.
// That way two kids can't swap characters, a kid who drops out of view is
// picked up again at their own spot, and a double detection of one kid can't
// steal a neighbour's character. Homes slowly follow the kids, which keeps
// the spots fresh if someone shuffles over a little.
let homeReach = 0.2;   // how far (fraction of the picture) from home still counts
function setHomes() {
  const n = players.length;
  players.forEach(p => { p.homeX = p.trackX ?? (p.index + 0.5) / n; });
  // Keep homes in player order (player 1 is furthest left).
  const xs = players.map(p => p.homeX).sort((a, b) => a - b);
  players.forEach((p, i) => { p.homeX = xs[i]; });
  updateReach();
}

// Never reach past halfway to a neighbour's spot.
function updateReach() {
  const xs = players.map(p => p.homeX).sort((a, b) => a - b);
  let gap = 1;
  for (let i = 1; i < xs.length; i++) gap = Math.min(gap, xs[i] - xs[i - 1]);
  homeReach = Math.max(0.06, Math.min(0.2, gap * 0.55));
}

function assignPlay(t) {
  updateTracks(t);
  assignHomes(t, 0.02);
}

// follow: how quickly homes move to where the kids are now standing.
function assignHomes(t, follow) {
  const HOME_REACH = homeReach;
  const ps = [...players].sort((a, b) => a.homeX - b.homeX);
  const os = [...tracks].sort((a, b) => a.x - b.x);
  const n = ps.length, m = os.length;
  // best[i][j]: lowest cost placing the first i kids using the first j people.
  // Leaving a kid without anyone costs a fixed amount, as does ignoring a person.
  const MISS = HOME_REACH, EXTRA = 0.02;
  const best = [...Array(n + 1)].map(() => Array(m + 1).fill(Infinity));
  const how = [...Array(n + 1)].map(() => Array(m + 1).fill(0));
  best[0][0] = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const c = best[i][j];
    if (c === Infinity) continue;
    if (i < n && c + MISS < best[i + 1][j]) { best[i + 1][j] = c + MISS; how[i + 1][j] = 1; }
    if (j < m && c + EXTRA < best[i][j + 1]) { best[i][j + 1] = c + EXTRA; how[i][j + 1] = 2; }
    if (i < n && j < m) {
      const d = Math.abs(os[j].x - ps[i].homeX);
      if (d < HOME_REACH && c + d < best[i + 1][j + 1]) { best[i + 1][j + 1] = c + d; how[i + 1][j + 1] = 3; }
    }
  }
  const match = new Map();
  for (let i = n, j = m; i > 0 || j > 0;) {
    const h = how[i][j];
    if (h === 3) { match.set(ps[i - 1], os[j - 1]); i--; j--; }
    else if (h === 1) i--;
    else j--;
  }
  // Re-scan: a kid nobody has been matched to for a while takes over a person
  // standing in the gap between their neighbours, and that becomes their spot.
  const used = new Set(match.values());
  let moved = false;
  ps.forEach((p, k) => {
    if (match.has(p) || t - (p.lastSeen ?? -9) < 1.2) return;
    const left = k > 0 ? (match.get(ps[k - 1])?.x ?? ps[k - 1].homeX) : -1;
    const right = k < n - 1 ? (match.get(ps[k + 1])?.x ?? ps[k + 1].homeX) : 2;
    const gapMin = 0.6 * trackWidth;
    const free = os.filter(o => !used.has(o) && o.x > left + gapMin && o.x < right - gapMin)
      .sort((a, b) => Math.abs(a.x - p.homeX) - Math.abs(b.x - p.homeX))[0];
    if (free) { used.add(free); match.set(p, free); p.homeX = free.x; moved = true; }
  });
  if (moved) updateReach();
  for (const p of players) {
    const o = match.get(p);
    if (!o) { p.trackPose(null, t); continue; }
    p.trackX = o.x;
    p.homeX += (o.x - p.homeX) * follow;
    if (o.stamp === t) p.trackPose(o.pts, t);
  }
}

function lobbyGesture(pts) {
  const f = features(pts);
  if (!f) return null;
  const t = f.torso;
  let left = false, right = false, up = 0;
  for (const w of f.wrists) {
    if (w.v < 0.3) continue;
    if (w.y < f.nose.y) { up++; continue; }
    if (w.y < f.hip.y && w.x < f.sh.x - 0.9 * t) left = true;
    if (w.y < f.hip.y && w.x > f.sh.x + 0.9 * t) right = true;
  }
  return { left: left && !right, right: right && !left, up: up === 2 };
}

// Snapshot of the kid's face from the camera, used for their bubble and results.
function captureFace(p) {
  const f = p.pts && features(p.pts);
  if (!f || !video.videoWidth || !frame) return;
  const vw = video.videoWidth, vh = video.videoHeight;
  const nose = p.pts[0];
  const size = Math.min(vh, f.torso * 1.05 * vh);
  const cx = (1 - nose.x / frame.aspect) * vw, cy = nose.y * vh - size * 0.05;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  g.translate(160, 0);
  g.scale(-1, 1); // mirror, to match what they see
  g.drawImage(video, cx - size / 2, cy - size / 2, size, size, 0, 0, 160, 160);
  p.face = c.toDataURL('image/jpeg', 0.85);
  const img = new Image();
  img.src = p.face;
  p.faceImg = img;
}

// ---------------- Main loop ----------------

const now = () => performance.now() / 1000;
let last = now();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = Math.round(innerWidth * dpr);
  H = Math.round(innerHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  PX = Math.max(2, Math.round(H / 270));
  const lw = Math.ceil(W / PX), lh = Math.ceil(H / PX);
  if (low.width !== lw || low.height !== lh) { low.width = lw; low.height = lh; }
}

function loop() {
  requestAnimationFrame(loop);
  resize();
  const t = now();
  const dt = Math.min(0.05, t - last);
  last = t;
  if (state === 'heart') return; // the heart check draws its own screens

  if (tracker && state !== 'setup' && state !== 'end') {
    try { frame = tracker.detect(t * 1000) || frame; } catch (e) { console.warn(e); }
    watchCamera(t);
  }

  if (state === 'lobby') updateLobby(t);
  else if (['ready', 'tutorial', 'play'].includes(state)) updateGame(t, dt);

  draw(t);
}

// If the picture stops moving, nudge the video; if that doesn't help,
// restart the camera stream (the tracker stays).
function watchCamera(t) {
  if (settings.mode !== 'camera' || watch.busy) return;
  if (video.currentTime !== watch.time) { watch.time = video.currentTime; watch.since = t; return; }
  const stuck = t - watch.since;
  if (stuck > 1.5 && stuck < 1.6) video.play().catch(() => { });
  if (stuck > 4) {
    stopCamera(video);
    ensureCamera().catch(e => console.error(e));
  }
}

function updateLobby(t) {
  if (settings.mode === 'camera') {
    lobby.found = assignLobby(t);
  } else {
    lobby.found = players.length;
  }
  let allReady = true;
  players.forEach((p, i) => {
    const L = lobby[i];
    let g = null;
    if (settings.mode === 'camera') g = p.pts ? lobbyGesture(p.pts) : null;
    else {
      const a = keyActions(keys, i);
      g = { left: a.left, right: a.right, up: a.jump || a.reach };
    }
    L.found = !!g;
    if (!g) { L.ready = false; L.upSince = 0; allReady = false; return; }
    // Pointing must be held briefly (camera noise shouldn't flip characters),
    // then the arm comes back down before the next change.
    const side = g.left ? -1 : g.right ? 1 : 0;
    if (side !== L.pointSide) { L.pointSide = side; L.pointSince = t; }
    const held = settings.mode === 'camera' ? 0.3 : 0;
    if (side && !L.armLatch && !L.ready && t - L.pointSince >= held) {
      slotChar[i] = (slotChar[i] + side + CHARACTERS.length) % CHARACTERS.length;
      sfx.select();
      L.armLatch = true;
    }
    if (!side) L.armLatch = false;
    if (g.up) {
      L.upSince ||= t;
      if (!L.ready && t - L.upSince > 0.8) {
        L.ready = true;
        sfx.ready();
        if (settings.mode === 'camera') captureFace(p);
      }
    } else {
      L.upSince = 0;
    }
    if (!L.ready) allReady = false;
  });
  if (allReady && t - stateT > 1) startReady();
}

function updateGame(t, dt) {
  const cam = settings.mode === 'camera';
  if (cam) assignPlay(t);
  for (const p of players) {
    if (!cam) {
      const a = keyActions(keys, p.index);
      if (p.throwing && a.jump && !p.act.jump) p.onThrow(); // up key throws in throw time
      if (a.spin && p.charged && !p.throwing) p.superSpin(); // down alone spins when super charged
      if (MINI.includes(p.throwing?.type)) {
        const [u, l, d, r] = KEYMAP[p.index];
        p.hands = keyHands(keys.has(u), keys.has(l), keys.has(d), keys.has(r));
        handsMini(p, p.throwing, p.hands, t);
      }
      if (p.throwing?.type === 'fire') {
        const [, l, , r] = KEYMAP[p.index];
        p.hoseInput(keys.has(l) && !keys.has(r) ? -1 : keys.has(r) && !keys.has(l) ? 1 : 0);
      }
      p.setActions(a);
      if (!p.base) p.base = { hipX: 0, hipY: 0, noseX: 0, noseY: 0, torso: 1 };
    }
    const seen = !cam || (p.lastSeen != null && t - p.lastSeen < 1.2);
    p.paused = !seen ? 'Come back to your spot!' : !p.base ? 'Stand still…' : null;
  }

  if (state === 'ready') {
    const el = t - stateT;
    const allSet = players.every(p => p.base || !(t - (p.lastSeen ?? -9) < 1.2));
    if (el > 2.4 && !banner?.count) {
      if (allSet || el > 7) {
        banner = { count: 3, at: t };
        sfx.beep(false);
        cue('three');
      }
    }
    if (banner?.count) {
      const n = 3 - Math.floor(t - banner.at);
      if (n !== banner.count) {
        banner.count = n;
        if (n > 0) { sfx.beep(false); cue(['one', 'two', 'three'][n - 1]); }
      }
      if (n <= 0) {
        banner = null;
        settings.intro ? startTutorial() : startPlay();
      }
    }
  }

  if (state === 'tutorial') {
    const tn = t;
    if (tn >= tut.next) {
      tut.step++;
      if (tut.step >= LESSONS.length) {
        showBanner("You've got it!", 'Now the real thing…', 2);
        cue('got_it');
        tut.next = Infinity;
        setTimeout(() => state === 'tutorial' && startPlay(), 2200);
      } else {
        const L = LESSONS[tut.step];
        showBanner(L.title, '', 4.2);
        cue(`lesson_${L.kind}`);
        players.forEach(p => p.teach(L.kind, L.side || null, 4));
        tut.next = tn + 5.6;
      }
    }
  }

  let ramp = 0;
  if (state === 'play') {
    roundT += dt;
    const dur = settings.seconds;
    if (throwPlan.length && roundT >= throwPlan[0] && !throwEnd && (!dur || dur - roundT > THROW_SECS + 15)) {
      throwPlan.shift();
      throwEnd = roundT + THROW_SECS;
      const type = nextBreak();
      players.forEach(p => p.startBreak(type));
      const info = BREAK_INFO[type];
      showBanner(info.title, info.sub, 2.8);
      cue(info.clip);
    } else if (throwPlan.length && dur && roundT >= throwPlan[0] && !throwEnd) {
      throwPlan.shift();
    }
    if (throwEnd && roundT >= throwEnd) {
      throwEnd = 0;
      players.forEach(p => p.stopThrowing());
      course?.resume(players[0].clock);
      showBanner('Back to running!', '', 1.6);
      cue('back');
    }
    if (!throwEnd) callMoves(t);
    setIntensity(dur ? roundT / dur : Math.min(1, roundT / 180));
    if (dur) {
      const left = dur - roundT;
      ramp = 1.5 * Math.min(1, roundT / dur);
      const rush = left <= 15;
      if (rush && !players[0].rush) {
        setIntensity(1);
        showBanner('FINAL RUSH!', 'Double points!', 2);
        cue('final_rush');
      }
      players.forEach(p => { p.rush = rush; });
      if (left <= 3 && Math.ceil(left) !== Math.ceil(left + dt)) sfx.beep(false);
      if (left <= 0) { endRound(); return; }
    }
  }
  const moving = state === 'play' || state === 'tutorial';
  if (course && state === 'play') course.update(players, ramp);
  for (const p of players) {
    // On a shared course every clock keeps running so the lanes stay in sync,
    // even for a kid the camera has lost for a moment.
    p.absent = !!(together && p.paused);
    p.update(dt, moving && (together || !p.paused), ramp);
  }
  if (together) players.forEach(p => { p.clock = players[0].clock; });
}

// ---------------- Drawing ----------------

function draw(t) {
  ctx.imageSmoothingEnabled = false;
  if (state === 'setup' || state === 'end') {
    drawAttract(t);
    return;
  }
  if (state === 'lobby') {
    drawLobby(t);
    return;
  }
  const theme = THEMES[settings.theme] || THEMES.forest;
  const n = players.length;
  lctx.clearRect(0, 0, low.width, low.height);
  for (const p of players) drawLaneWorld(lctx, laneBox(p.index, n, low.width, low.height), p, t, p.character || CHARACTERS[0], theme);
  ctx.drawImage(low, 0, 0, low.width * PX, low.height * PX);
  for (const p of players) drawLaneHud(ctx, laneBox(p.index, n, W, H), p, p.character, { debug });

  // Timer.
  if (state === 'play' && settings.seconds) {
    const left = Math.max(0, settings.seconds - roundT);
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    const size = H * 0.05;
    text(ctx, `${m}:${String(s).padStart(2, '0')}`, W / 2, hudBottom(n) + size * 0.7, size, left <= 15 ? '#ff5d73' : '#ffffff');
  }

  if (showCam && frame && tracker) {
    const cw = W * 0.18, ch = cw * 0.6;
    const L0 = laneBox(0, n, W, H);
    const x = n % 2 === 0 ? W / 2 - cw / 2 : W - cw - 12;
    const y = hudBottom(n) + (settings.seconds && state === 'play' ? H * 0.075 : H * 0.01);
    const people = players.filter(p => p.pts).map(p => ({ pts: p.pts, color: p.color, label: String(p.index + 1) }));
    drawCamera(ctx, video, frame.aspect, x, y, cw, ch, people);
  }

  drawBanner(t);
}

// Bottom edge of the name plates at the top of each lane.
function hudBottom(n) {
  const L = laneBox(0, n, W, H);
  const pad = Math.max(8, Math.min(20, L.w * 0.03)), fs = Math.max(16, Math.min(40, L.w * 0.07));
  return pad + fs * 2.7;
}

function drawBanner(t) {
  if (banner?.count) {
    const k = (t - banner.at) % 1;
    text(ctx, String(banner.count), W / 2, H * 0.45, H * (0.22 - 0.06 * k), '#ffe14d');
    text(ctx, 'Arms down, stand tall!', W / 2, H * 0.62, H * 0.05, '#ffffff');
    return;
  }
  if (!banner || t > banner.until) return;
  const k = Math.min(1, (t - banner.from) * 5);
  const size = H * 0.085 * (0.7 + 0.3 * k);
  ctx.fillStyle = 'rgba(10,14,30,0.55)';
  ctx.fillRect(0, H * 0.4, W, H * (banner.sub ? 0.2 : 0.14));
  text(ctx, banner.text, W / 2, H * 0.47, size, '#ffe14d');
  if (banner.sub) text(ctx, banner.sub, W / 2, H * 0.555, H * 0.04, '#ffffff');
}

// Behind the setup and results panels: the squad running along.
function drawAttract(t) {
  const theme = THEMES[settings.theme] || THEMES.forest;
  const n = 4;
  lctx.clearRect(0, 0, low.width, low.height);
  for (let i = 0; i < n; i++) {
    const fake = attractPlayers[i];
    fake.clock = t;
    drawLaneWorld(lctx, laneBox(i, n, low.width, low.height), fake, t, CHARACTERS[slotChar[i] ?? i], theme);
  }
  ctx.drawImage(low, 0, 0, low.width * PX, low.height * PX);
  ctx.fillStyle = 'rgba(10,14,30,0.35)';
  ctx.fillRect(0, 0, W, H);
}
const attractPlayers = [0, 1, 2, 3].map(i => ({
  index: i, color: COLORS[i], skill: 3, clock: 0, obstacles: [], fx: [], act: {}, lift: 0, bonk: 0,
}));

function drawLobby(t) {
  const theme = THEMES[settings.theme] || THEMES.forest;
  const n = players.length;
  const cam = settings.mode === 'camera';

  // Backdrop + big characters in their lanes (pixel layer).
  lctx.clearRect(0, 0, low.width, low.height);
  lctx.fillStyle = theme.sky[0];
  lctx.fillRect(0, 0, low.width, low.height);
  lctx.fillStyle = theme.grass[0];
  lctx.fillRect(0, low.height * 0.66, low.width, low.height * 0.34);
  players.forEach((p, i) => {
    const L = laneBox(i, n, low.width, low.height);
    const st = lobby[i];
    const S = Math.min(low.height * 0.05, L.w * 0.12);
    const act = st.ready ? { reach: Math.floor(t * 3) % 2 === 0 } : {};
    const P = cartoonPose(act, Math.sin(t * 6 + i) * 0.05);
    lctx.globalAlpha = st.found ? 1 : 0.35;
    drawCharacter(lctx, L.cx, low.height * 0.765 - 1.65 * S, S, P, CHARACTERS[slotChar[i]], false, p.gear);
    lctx.globalAlpha = 1;
  });
  ctx.drawImage(low, 0, 0, low.width * PX, low.height * PX);

  // Camera view on top.
  const top = H * 0.155;
  if (cam && frame) {
    const people = players.filter(p => p.pts).map(p => ({ pts: p.pts, color: p.color, label: `${p.index + 1}` }));
    drawCamera(ctx, video, frame.aspect, W * 0.2, top, W * 0.6, H * 0.4, people);
  } else if (cam) {
    text(ctx, 'Waking up the camera…', W / 2, H * 0.35, H * 0.04, '#ffffff');
  }

  // Headline.
  const found = lobby.found ?? 0;
  let headline, sub;
  if (cam && found < n) {
    headline = found === 0 ? 'Step into the picture!' : `Found ${found} of ${n}`;
    sub = 'Spread out so the camera can see everyone, head to knees';
  } else if (cam && found > n) {
    headline = `I see ${found} people`;
    sub = `Only ${n} can play. Extra people, step out of the picture please`;
  } else {
    headline = 'Everyone is here!';
    sub = cam ? 'Point an arm to the side to change character. Both hands up when ready!'
      : 'Left/right to change character. Up when ready!';
  }
  text(ctx, headline, W / 2, H * 0.06, H * 0.065, '#ffe14d');
  text(ctx, sub, W / 2, H * 0.125, H * 0.032, '#ffffff');

  // Name cards under each character.
  players.forEach((p, i) => {
    const L = laneBox(i, n, W, H);
    const st = lobby[i];
    const fs = Math.min(H * 0.04, L.w * 0.085);
    ctx.fillStyle = p.color;
    ctx.fillRect(L.x + L.w * 0.1, H * 0.80, L.w * 0.8, H * 0.08);
    text(ctx, `${p.name} · ${CHARACTERS[slotChar[i]].name}`, L.cx, H * 0.825, fs, '#ffffff');
    let status, col = '#ffffff';
    if (!st.found) { status = 'Not found yet'; col = '#ffd0d0'; }
    else if (st.ready) { status = 'READY!'; col = '#3ddc84'; }
    else if (st.upSince) { status = 'Hold it…'; col = '#ffe14d'; }
    else status = '◀ point to change ▶';
    text(ctx, status, L.cx, H * 0.86, fs * 0.8, col);
    if (st.found && !st.ready) {
      const k = st.upSince ? Math.min(1, (t - st.upSince) / 0.8) : 0;
      if (k > 0) {
        ctx.fillStyle = '#3ddc84';
        ctx.fillRect(L.x + L.w * 0.1, H * 0.79, L.w * 0.8 * k, H * 0.01);
      }
    }
  });
}

requestAnimationFrame(loop);

// Test hook: open with ?debug to inspect tracking from the console.
if (new URLSearchParams(location.search).has('debug')) {
  window.qs = {
    get frame() { return frame; }, get players() { return players; }, get state() { return state; },
    get tracker() { return tracker; }, advance(sec) { roundT += sec; },
    startBreak(type) { throwEnd = roundT + THROW_SECS; players.forEach(p => p.startBreak(type)); },
  };
}
