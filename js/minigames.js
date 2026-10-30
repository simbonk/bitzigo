// More stop-and-do break games, all driven by where the kid's hands are.
//
// Hands are in torso units around the hips, the same space the avatar is
// drawn in: x grows to screen-right, y grows down, the shoulders sit near
// y = -1, the top of the head near -2 and the hips at 0.
import { holdWyr } from './wyr.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (h, x, y) => Math.hypot(h.x - x, h.y - y);

// (The dance-off is still here but out of the rotation: its moves were too fiddly.)
export const MINI = ['kaiju', 'bugs', 'goalie', 'climb', 'tray', 'rain', 'fly', 'chops', 'wyr', 'swim'];

// Keyboard stand-in for hands: [up, left, down, right] held.
export function keyHands(u, l, d, r) {
  if (d && l) return [{ x: -1.4, y: 0 }, { x: 0.5, y: -0.1 }];
  if (d && r) return [{ x: -0.5, y: -0.1 }, { x: 1.4, y: 0 }];
  if (d) return [{ x: -0.15, y: -1.2 }, { x: 0.15, y: -1.2 }];
  if (u && l) return [{ x: -1.4, y: -2.0 }, { x: 0.5, y: -0.1 }];
  if (u && r) return [{ x: -0.5, y: -0.1 }, { x: 1.4, y: -2.0 }];
  if (u) return [{ x: -0.6, y: -2.2 }, { x: 0.6, y: -2.2 }];
  if (l && r) return [{ x: -1.4, y: -1.0 }, { x: 1.4, y: -1.0 }];
  if (l) return [{ x: -1.0, y: -2.2 }, { x: 0.6, y: -0.2 }];
  if (r) return [{ x: -0.6, y: -0.2 }, { x: 1.0, y: -2.2 }];
  return [{ x: -0.5, y: -0.1 }, { x: 0.5, y: -0.1 }];
}

// The keyboard's hands for a break: in the rainstorm, up makes the roof and
// left/right tips it that way.
export function keyHandsFor(type, u, l, d, r) {
  if (type === 'rain' && u) {
    const s = l && !r ? -1.1 : r && !l ? 1.1 : 0;
    return [{ x: -0.5 + s, y: -2.2 }, { x: 0.5 + s, y: -2.2 }];
  }
  return keyHands(u, l, d, r);
}

// Dance moves: each is a check on the hands, plus a pose for the picture card.
export const DANCE = {
  up: { name: 'HANDS UP!', ok: ([a, b]) => a.y < -1.75 && b.y < -1.75, pose: { reach: true } },
  wide: { name: 'BIG T!', ok: ([a, b]) => Math.min(a.x, b.x) < -1.05 && Math.max(a.x, b.x) > 1.05 && a.y > -1.7 && b.y > -1.7 && a.y < -0.4 && b.y < -0.4, pose: { left: true, right: true } },
  discoL: { name: 'DISCO!', ok: hs => hs.some(h => h.x < -0.3 && h.y < -1.75) && hs.some(h => h.x > 0.2 && h.y > -0.9), pose: { discoL: true } },
  discoR: { name: 'DISCO!', ok: hs => hs.some(h => h.x > 0.3 && h.y < -1.75) && hs.some(h => h.x < -0.2 && h.y > -0.9), pose: { discoR: true } },
  clap: { name: 'CLAP!', ok: ([a, b]) => Math.abs(a.x - b.x) < 0.55 && Math.abs(a.y - b.y) < 0.5 && a.y < -0.8 && a.y > -2.0, pose: { clap: true } },
};
const DANCE_KEYS = Object.keys(DANCE);

// Spots around the body where bugs pop up: high, wide, low and centre.
const BUG_SPOTS = [[-1.3, -2.1], [0, -2.6], [1.3, -2.1], [-1.7, -1.0], [1.7, -1.0], [-1.3, 0.1], [1.3, 0.1], [0, 0.4]];
const GOAL_ZONES = [[-1.4, -2.0], [1.4, -2.0], [-1.5, -0.3], [1.5, -0.3], [0, -2.5]];
export const CITY_X = [-2.4, -1.4, 1.4, 2.4];

export function startMini(p, B) {
  switch (B.type) {
    case 'dance': Object.assign(B, { next: 0.8, move: null, moves: 0, flash: 0 }); break;
    case 'kaiju': Object.assign(B, { city: newCity(), copters: [], copterT: 1.5, slamUp: -9, dust: [] }); break;
    case 'bugs': Object.assign(B, { bugs: [], spawnT: 0.4, splats: [] }); break;
    case 'goalie': Object.assign(B, { shots: [], shotT: 1.0 }); break;
    case 'fly': Object.assign(B, { flaps: 0, up: false, pan: 0, flapAt: -9 }); break;
    case 'chops': Object.assign(B, { chops: 0, up: [false, false], upAt: [-9, -9], flash: 0 }); break;
    case 'swim': Object.assign(B, { dist: 0, goal: Math.round(clamp(10 + p.skill * 0.6, 10, 16)), lastHand: -1, wasUp: [false, false], shown: 0, crossed: 0, splash: 0 }); break;
    case 'climb': Object.assign(B, { height: 0, lastHand: -1, wasUp: [false, false], pan: 0, reachAt: -9 }); break;
    case 'tray': Object.assign(B, { x: 0, items: [], stack: [], dropT: 1.0, wobble: 0 }); break;
    case 'wyr': Object.assign(B, { cand: -1, since: 0, hold: 0 }); break; // the question itself is shared: see wyr.js
    case 'rain': Object.assign(B, { roof: false, tilt: 0, water: 0, want: Math.random() < 0.5 ? -1 : 1, buckets: { '-1': 0, '1': 0 }, pour: null, tip: null, poured: false }); break;
  }
}

function newCity() {
  return CITY_X.map(x => ({ x, h: rand(1.0, 1.9), down: false, downT: 0, color: pick(['#9aa7b8', '#c8b08a', '#8fb8de', '#d68a6a']) }));
}

// Called each frame with the kid's hands (camera or keyboard) to score hits.
export function handsMini(p, B, hands, now) {
  const hs = hands.filter(Boolean);
  const R = p.keyboard ? 1.0 : 0.6;
  if (B.type === 'wyr') { holdWyr(p, B, hands, now); return; }
  if (B.type === 'bugs') {
    for (const bug of B.bugs) {
      if (bug.dead || bug.t < 0.15) continue;
      if (hs.some(h => dist(h, bug.x, bug.y) < R)) {
        bug.dead = true;
        B.splats.push({ x: bug.x, y: bug.y, t: 0 });
        p.counts.bugs++;
        p.addPoints(80 * p.breakMult, Math.random() < 0.4 ? pick(['SPLAT!', 'SQUISH!', 'GOTCHA!']) : false);
        p.onEvent?.('splat');
      }
    }
  } else if (B.type === 'goalie') {
    for (const s of B.shots) {
      if (s.done || s.t < s.dur - 0.4) continue;
      if (hs.some(h => dist(h, s.x, s.y) < R + 0.2)) {
        s.done = 'saved';
        s.doneT = 0;
        p.counts.saves++;
        p.addPoints(90 * p.breakMult, Math.random() < 0.5 ? pick(['SAVED!', 'BLOCKED!', 'NOPE!']) : false);
        p.onEvent?.('save');
      }
    }
  } else if (B.type === 'kaiju') {
    for (const c of B.copters) {
      if (c.done || c.t < 0.3) continue;
      if (hs.some(h => dist(h, c.x, c.y) < R + 0.1)) {
        c.done = true; c.doneT = 0;
        p.counts.stomp++;
        p.addPoints(80 * p.breakMult, Math.random() < 0.4 ? 'SWAT!' : false);
        p.onEvent?.('swat');
      }
    }
    // Slam: both hands up above the head, then both down low, quickly.
    // Any big downward smash counts: one or both hands from up high to down
    // low. (Jumping also stomps; see updateMini.)
    if (hs.some(h => h.y < -1.3)) B.slamUp = now;
    else if (hs.some(h => h.y > -0.6) && now - B.slamUp < 1.0) { B.slamUp = -9; slam(p, B); }
  } else if (B.type === 'fly') {
    // Fly high: every flap (both arms up, then both down) lifts you higher.
    if (hs.length === 2 && hs.every(h => h.y < -1.4)) B.up = true;
    else if (B.up && hs.length === 2 && hs.every(h => h.y > -0.9)) {
      B.up = false;
      B.flaps++;
      p.counts.fly++;
      B.flapAt = now;
      const ten = B.flaps % 10 === 0;
      p.addPoints((ten ? 150 : 25) * p.breakMult, ten ? pick(['HIGHER!', 'SKY HIGH!', 'WHOOSH!']) : false);
      p.onEvent?.('flap');
    }
  } else if (B.type === 'chops') {
    // Karate frenzy: every hand that comes down hard from up high is a chop.
    hands.forEach((h, i) => {
      if (!h) return;
      if (h.y < -1.4) { B.up[i] = true; B.upAt[i] = now; }
      else if (B.up[i] && h.y > -0.6 && now - B.upAt[i] < 0.8) {
        B.up[i] = false;
        B.chops++;
        p.counts.chop++;
        B.flash = 0.15;
        const ten = B.chops % 10 === 0;
        p.addPoints((ten ? 150 : 20) * p.breakMult, ten ? pick(['HI-YAH!', 'KRAK!', 'NINJA!']) : false);
        p.onEvent?.('chop');
      }
    });
  } else if (B.type === 'swim') {
    // Swim: big arm strokes, one arm over the head then the other.
    hands.forEach((h, i) => {
      if (!h) return;
      const up = h.y < -1.7;
      if (up && !B.wasUp[i] && i !== B.lastHand) {
        B.lastHand = i;
        B.dist++;
        B.splash = 0.3;
        p.counts.swim++;
        p.addPoints(20 * p.breakMult, false);
        p.onEvent?.('splat');
        if (B.dist >= B.goal) {
          B.crossed++;
          B.dist = 0;
          B.shown = -0.3;
          p.addPoints(250 * p.breakMult, pick(['MADE IT!', 'SPLASH DOWN!', 'SUPER SWIMMER!']));
          p.onEvent?.('save');
        }
      }
      if (up) B.wasUp[i] = true;
      else if (h.y > -1.2) B.wasUp[i] = false;
    });
  } else if (B.type === 'climb') {
    // Climb: reach one hand above the head, then the other.
    hands.forEach((h, i) => {
      if (!h) return;
      const up = h.y < -1.85;
      if (up && !B.wasUp[i] && i !== B.lastHand) {
        B.lastHand = i;
        B.height++;
        B.reachAt = now;
        p.counts.climb++;
        const ten = B.height % 10 === 0;
        p.addPoints((ten ? 150 : 25) * p.breakMult, ten ? 'HIGHER!' : false);
        p.onEvent?.('climb');
      }
      if (up) B.wasUp[i] = true;
      else if (h.y > -1.4) B.wasUp[i] = false;
    });
  } else if (B.type === 'tray') {
    // The tray follows the hands (and the kid stepping side to side).
    if (hs.length) {
      const mx = hs.reduce((a, h) => a + h.x, 0) / hs.length + (p.hipShift || 0);
      B.target = clamp(mx / 1.0, -1, 1);
    }
  } else if (B.type === 'rain') {
    // Rainstorm: both hands over the head make a roof that catches rain;
    // tip it (lean or shift the hands) to pour into the bucket on that side.
    B.roof = hs.length === 2 && hs.every(h => h.y < -1.6) && Math.abs(hs[0].x - hs[1].x) < 1.8;
    B.tilt = B.roof ? (hs[0].x + hs[1].x) / 2 + (p.hipShift || 0) : 0;
    const side = B.tilt < -0.6 ? -1 : B.tilt > 0.6 ? 1 : 0;
    if (!side) B.poured = false;
    if (B.roof && side && !B.poured && B.water > 0.35) {
      B.poured = true;
      const amt = B.water;
      B.water = 0;
      B.pour = { side, t: 0 };
      if (side !== B.want) { p.pop('Other bucket!', '#d0e8ff'); p.onEvent?.('splat'); return; }
      B.buckets[side] = Math.min(1, B.buckets[side] + amt * 0.4);
      p.counts.rain++;
      p.addPoints(60 * p.breakMult, false);
      p.onEvent?.('spray');
      if (B.buckets[side] >= 0.99) {
        p.addPoints(250 * p.breakMult, pick(['BUCKET FULL!', 'SPLOOSH!', 'FILLED UP!']));
        p.onEvent?.('save');
        B.tip = { side, t: 0 };
        B.want = -side;
      }
    }
  } else if (B.type === 'dance') {
    const m = B.move;
    if (m && !m.done && hs.length === 2 && m.t > 0.1 && DANCE[m.key].ok(hs)) {
      m.done = true;
      B.flash = 0.4;
      p.counts.dance++;
      p.addPoints(80 * p.breakMult, pick(['GROOVY!', 'NICE MOVES!', 'FUNKY!', 'BOOGIE!']));
      p.onEvent?.('dance');
    }
  }
}

function slam(p, B) {
  const b = B.city.find(c => !c.down);
  if (!b) return;
  b.down = true;
  p.counts.stomp++;
  p.shake = 0.5;
  p.addPoints(60 * p.breakMult, pick(['STOMP!', 'CRASH!', 'KABOOM!']));
  for (let i = 0; i < 8; i++) B.dust.push({ x: b.x + rand(-0.4, 0.4), y: 1.4, vx: rand(-0.8, 0.8), vy: rand(-2.5, -1), t: 0 });
  p.onEvent?.('stomp');
}

export function updateMini(p, B, dt) {
  const sk = p.skill;
  switch (B.type) {
    case 'dance': {
      B.flash = Math.max(0, B.flash - dt);
      B.next -= dt;
      if (B.move) B.move.t += dt;
      if (B.next <= 0) {
        // A new move every two beats or so, quicker on higher levels.
        let key;
        do { key = pick(DANCE_KEYS); } while (B.move && key === B.move.key);
        B.move = { key, t: 0, dur: clamp(1.9 - sk * 0.08, 1.2, 1.9), done: false };
        B.next = B.move.dur;
        B.moves++;
        p.onEvent?.('beat');
      }
      break;
    }
    case 'kaiju': {
      if (p.act?.jump && !B.jumped) { B.jumped = true; slam(p, B); }
      if (!p.act?.jump) B.jumped = false;
      B.copterT -= dt;
      if (B.copterT <= 0 && B.copters.filter(c => !c.done).length < 2) {
        const side = Math.random() < 0.5 ? -1 : 1;
        B.copters.push({ x: side * rand(1.3, 1.8), y: rand(-2.6, -1.7), side, t: 0, life: clamp(3.2 - sk * 0.12, 1.8, 3.2) });
        B.copterT = rand(1.0, 2.0);
      }
      for (const c of B.copters) { c.t += dt; if (c.done) c.doneT += dt; }
      B.copters = B.copters.filter(c => (c.done ? c.doneT < 0.8 : c.t < c.life));
      for (const b of B.city) if (b.down) b.downT += dt;
      for (const d of B.dust) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 5 * dt; }
      B.dust = B.dust.filter(d => d.t < 0.9);
      if (B.city.every(b => b.down) && !B.refill) {
        B.refill = p.clock + 1.2;
        p.addPoints(200 * p.breakMult, 'CITY STOMPED!');
        p.onEvent?.('strike');
      }
      if (B.refill && p.clock >= B.refill) { B.city = newCity(); B.refill = 0; }
      break;
    }
    case 'bugs': {
      B.spawnT -= dt;
      if (B.spawnT <= 0 && B.bugs.filter(b => !b.dead).length < 2) {
        const taken = new Set(B.bugs.filter(b => !b.dead).map(b => b.spot));
        const free = BUG_SPOTS.map((s, i) => i).filter(i => !taken.has(i));
        const spot = pick(free);
        B.bugs.push({ spot, x: BUG_SPOTS[spot][0], y: BUG_SPOTS[spot][1], t: 0, life: clamp(2.4 - sk * 0.12, 1.2, 2.4), dead: false });
        B.spawnT = clamp(1.0 - sk * 0.04, 0.5, 1.0);
      }
      for (const b of B.bugs) b.t += dt;
      B.bugs = B.bugs.filter(b => !b.dead && b.t < b.life);
      for (const s of B.splats) s.t += dt;
      B.splats = B.splats.filter(s => s.t < 0.7);
      break;
    }
    case 'goalie': {
      B.shotT -= dt;
      if (B.shotT <= 0) {
        const z = pick(GOAL_ZONES);
        B.shots.push({ x: z[0], y: z[1], t: 0, dur: clamp(1.6 - sk * 0.06, 0.9, 1.6), done: null, doneT: 0 });
        B.shotT = clamp(1.7 - sk * 0.07, 0.9, 1.7);
      }
      for (const s of B.shots) {
        s.t += dt;
        if (s.done) s.doneT += dt;
        else if (s.t > s.dur + 0.12) { s.done = 'goal'; s.doneT = 0; p.pop('GOAL!', '#ffd0d0'); }
      }
      B.shots = B.shots.filter(s => !s.done || s.doneT < 0.6);
      break;
    }
    case 'rain': {
      // The roof fills in about a second of holding it up.
      if (B.roof && Math.abs(B.tilt) <= 0.6) B.water = Math.min(1, B.water + dt / clamp(1.1 - sk * 0.03, 0.8, 1.1));
      if (B.pour && (B.pour.t += dt) > 0.6) B.pour = null;
      if (B.tip && (B.tip.t += dt) > 0.9) { B.buckets[B.tip.side] = 0; B.tip = null; }
      break;
    }
    case 'fly':
      B.pan += (B.flaps * 0.8 - B.pan) * Math.min(1, dt * 4);
      break;
    case 'chops':
      B.flash = Math.max(0, B.flash - dt);
      break;
    case 'swim':
      B.shown += (B.dist / B.goal - B.shown) * Math.min(1, dt * 5);
      B.splash = Math.max(0, B.splash - dt);
      break;
    case 'climb':
      B.pan += (B.height - B.pan) * Math.min(1, dt * 6);
      break;
    case 'tray': {
      if (B.target != null) B.x += (B.target - B.x) * Math.min(1, dt * 10);
      B.wobble = Math.max(0, B.wobble - dt);
      B.dropT -= dt;
      if (B.dropT <= 0) {
        const boot = Math.random() < 0.2;
        B.items.push({ x: pick([-1, -0.5, 0, 0.5, 1]), kind: boot ? 'boot' : 'pancake', t: 0, dur: clamp(1.8 - sk * 0.06, 1.1, 1.8) });
        B.dropT = clamp(1.2 - sk * 0.05, 0.6, 1.2);
      }
      for (const it of B.items) {
        it.t += dt;
        if (it.t >= it.dur && !it.done) {
          it.done = true;
          const caught = Math.abs(it.x - B.x) < 0.38;
          if (caught && it.kind === 'pancake') {
            B.stack.push(pick(['#e8b060', '#d89a48', '#f0c070']));
            p.counts.stack++;
            p.addPoints((50 + 5 * Math.min(B.stack.length, 20)) * p.breakMult, B.stack.length % 5 === 0 ? 'TALL STACK!' : false);
            p.onEvent?.('catch');
          } else if (caught) {
            B.stack.splice(Math.floor(B.stack.length / 2));
            B.wobble = 0.6;
            p.pop('BONK!', '#ffd0d0');
            p.onEvent?.('bonk');
          }
        }
      }
      B.items = B.items.filter(it => it.t < it.dur + (it.done ? 0.05 : 1));
      break;
    }
  }
}
