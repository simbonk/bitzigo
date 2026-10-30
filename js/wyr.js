// Would You Rather: a break where the whole squad gets the same funny question
// and each kid picks an answer by holding a pose. Every answer is a good one,
// so everyone who picks scores; the fun is seeing who picked the same thing.
//
// Poses use the same hand space as the other break games (torso units around
// the hips, x to screen-right, y down, the head near y = -2).
import { QUESTIONS } from './wyr-questions.js';

const pick = a => a[Math.floor(Math.random() * a.length)];

export const WYR_SECS = 30;          // longest a Would You Rather break can run
const INTRO = 2.8;                   // the title banner, before the first question
const ASK = 10;                      // most time to answer one question
const REVEAL = 3.2;                  // showing who picked what
const HOLD = 0.9;                    // hold a pose this long to pick that answer

// The pose for each answer card, left to right on screen.
export function posesFor(n) {
  return n === 2 ? ['left', 'right'] : n === 3 ? ['left', 'up', 'right'] : ['left', 'up', 'clap', 'right'];
}

// One hand up on a side points at that side's card; both hands up picks the
// middle card; hands together in front of the chest picks the other one.
export function poseOf(hands) {
  const hs = hands.filter(Boolean);
  if (hs.length === 2) {
    const [a, b] = hs;
    if (Math.abs(a.x - b.x) < 0.6 && Math.max(a.y, b.y) < -0.5 && Math.min(a.y, b.y) > -1.7) return 'clap';
    if (a.y < -1.6 && b.y < -1.6) return 'up';
  }
  const raised = hs.filter(h => h.y < -0.8);
  if (raised.length === 1) return raised[0].x < 0 ? 'left' : 'right';
  return null;
}

// Pictures are tiny pixel sprites made once by tools/wyr.py; until one loads
// (or if it's missing) the card shows the answer's emoji instead.
const imgs = {};
export function wyrImage(id, k) {
  const key = `${id}-${k}`;
  let im = imgs[key];
  if (!im) {
    im = imgs[key] = new Image();
    im.src = `img/wyr/${String(id).padStart(3, '0')}-${k}.png`;
  }
  return im.complete && im.naturalWidth ? im : null;
}

// Questions this device hasn't seen yet come first, so they rarely repeat.
const SEEN_KEY = 'bitzigo.wyrSeen';
function pickQuestions(n) {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch { }
  let fresh = QUESTIONS.filter(q => !seen.includes(q.id));
  if (fresh.length < n) { seen = []; fresh = QUESTIONS.slice(); }
  const out = [];
  while (out.length < n) {
    const q = pick(fresh);
    fresh = fresh.filter(x => x !== q);
    out.push(q);
  }
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...out.map(q => q.id)])); } catch { }
  return out;
}

// Start the shared round. secs is how long the break may run.
export function startWyr(players, secs = WYR_SECS) {
  const count = Math.max(1, Math.min(3, Math.floor((secs - INTRO) / (ASK + REVEAL))));
  const S = { qs: pickQuestions(count), i: 0, phase: 'intro', t: 0, picks: [], lastPick: 0, done: false, colors: [] };
  players.forEach(p => { S.colors[p.index] = p.color; });
  S.qs.forEach(q => q.c.forEach((_, k) => wyrImage(q.id, k)));
  players.forEach(p => { if (p.throwing) p.throwing.wyr = S; });
  return S;
}

function ask(S, players) {
  S.phase = 'ask';
  S.t = 0;
  S.picks = [];
  players.forEach(p => Object.assign(p.throwing || {}, { cand: -1, since: 0, hold: 0 }));
}

function reveal(S, players) {
  S.phase = 'reveal';
  S.t = 0;
  const votes = {};
  S.picks.forEach(c => { if (c != null) votes[c] = (votes[c] || 0) + 1; });
  for (const p of players) {
    const c = S.picks[p.index];
    if (c == null) continue;
    p.counts.wyr++;
    const twin = votes[c] > 1;
    p.addPoints((twin ? 150 : 120) * p.breakMult, twin ? pick(['SAME!', 'TWINSIES!', 'GREAT MINDS!']) : pick(['GOOD PICK!', 'OOH!', 'NICE ONE!']));
  }
  players[0]?.onEvent?.('level');
}

// Advances the shared round once per frame.
export function updateWyr(S, players, dt) {
  if (S.done) return;
  S.t += dt;
  if (S.phase === 'intro') {
    if (S.t >= INTRO) ask(S, players);
  } else if (S.phase === 'ask') {
    const here = players.filter(p => !p.paused);
    const allIn = here.length && here.every(p => S.picks[p.index] != null);
    if ((allIn && S.t - S.lastPick > 0.8) || S.t >= ASK) reveal(S, players);
  } else if (S.phase === 'reveal' && S.t >= REVEAL) {
    if (++S.i >= S.qs.length) { S.phase = 'done'; S.done = true; } else ask(S, players);
  }
}

// How long the current question has left, 0..1, for the countdown bar.
export function askLeft(S) { return S.phase === 'ask' ? Math.max(0, 1 - S.t / ASK) : 0; }

// Called with each kid's hands: holding a card's pose for a moment picks it.
// A kid can change their mind until everyone has picked.
export function holdWyr(p, B, hands, now) {
  const S = B.wyr;
  if (!S || S.phase !== 'ask') { B.hold = 0; return; }
  const q = S.qs[S.i];
  const c = posesFor(q.c.length).indexOf(poseOf(hands));
  if (c !== B.cand) { B.cand = c; B.since = now; }
  B.hold = c >= 0 && S.picks[p.index] !== c ? Math.min(1, (now - B.since) / HOLD) : 0;
  if (B.hold >= 1) {
    S.picks[p.index] = c;
    S.lastPick = S.t;
    B.hold = 0;
    p.onEvent?.('ready');
  }
}
