// Game rules: body-move detection, obstacles, and per-player adaptive difficulty.
import { MINI, startMini, updateMini, handsMini } from './minigames.js';

export const COLORS = ['#ff5a5f', '#3fa7ff', '#3ddc84', '#b57bff'];
export const MAX_SKILL = 10;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

// Pose landmark indices (MediaPipe BlazePose).
export const LM = {
  nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
};

// Obstacles and the move that beats each one.
//   log   - brick wall on the ground: JUMP
//   crate - flying crate on one side: PUNCH that side (any arm in the middle)
//   bird  - crazy bird flying at your head from one side: LEAN the other way
//   rope  - puddle with a rope over it: BOTH HANDS UP to grab and swing
export const KINDS = ['log', 'crate', 'bird', 'rope'];

// Stop-and-do breaks. Cans and the snowman are thrown at, boards are chopped
// (same overhand arm swing), bubbles are popped by flapping up to them, and
// fires are put out by pointing an arm to aim a water hose.
export const BREAKS = ['karate', 'bubbles', 'fire', 'cans', 'snowman', ...MINI];

// Hats and accessories that float down the road now and then. Running into
// one puts it on; the newest one in each slot replaces the old one.
export const GEAR = [
  { id: 'crown', slot: 'hat', name: 'Crown' },
  { id: 'tophat', slot: 'hat', name: 'Top hat' },
  { id: 'cowboy', slot: 'hat', name: 'Cowboy hat' },
  { id: 'party', slot: 'hat', name: 'Party hat' },
  { id: 'pirate', slot: 'hat', name: 'Pirate hat' },
  { id: 'viking', slot: 'hat', name: 'Viking helmet' },
  { id: 'wizard', slot: 'hat', name: 'Wizard hat' },
  { id: 'propeller', slot: 'hat', name: 'Propeller cap' },
  { id: 'shades', slot: 'face', name: 'Cool shades' },
  { id: 'cape', slot: 'back', name: 'Super cape' },
];

// A streak this long electrifies the kid: crackling sparks and bonus points.
export const SUPER_STREAK = 8;

// Where a kid of this age starts. Everyone starts a bit below their age and
// the game climbs quickly in the first few obstacles to find their level.
export function startSkill(age) {
  return clamp((age - 4) * 0.7, 0, 5.5);
}

// Everything that gets harder with skill lives here.
export function tuning(skill) {
  const t = clamp(skill / MAX_SKILL, 0, 1);
  return {
    travel: lerp(4.4, 1.7, t),   // seconds from horizon to the player
    gap: lerp(3.6, 1.05, t),     // seconds between obstacles
    window: lerp(0.65, 0.3, t),  // timing forgiveness, seconds either side
    sides: skill >= 2.5,         // crates come left or right (not just middle)
    birds: skill >= 1.5,         // head-dodging birds
    ropes: skill >= 3,           // rope swings
    combos: skill >= 6.5,        // quick pairs
  };
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

export function features(pts) {
  const sh = mid(pts[LM.lSh], pts[LM.rSh]);
  if (sh.v < 0.4) return null;
  let hip = mid(pts[LM.lHip], pts[LM.rHip]);
  let torso;
  if (hip.v >= 0.3) {
    torso = Math.hypot(sh.x - hip.x, sh.y - hip.y);
  } else {
    // Only the upper body is in view (camera too close): estimate the hips
    // from shoulder width so tracking keeps working.
    torso = Math.hypot(pts[LM.lSh].x - pts[LM.rSh].x, pts[LM.lSh].y - pts[LM.rSh].y) / 0.72;
    hip = { x: sh.x, y: sh.y + torso, v: 0 };
  }
  if (torso < 0.03) return null;
  return { nose: pts[LM.nose], sh, hip, torso, wrists: [pts[LM.lWr], pts[LM.rWr]] };
}

const ACTS = ['jump', 'left', 'right', 'reach', 'leanL', 'leanR', 'throw'];

export class Player {
  constructor(index, { name, age }) {
    this.index = index;
    this.name = name || `Player ${index + 1}`;
    this.age = age;
    this.color = COLORS[index];
    this.gear = {}; // kept between rounds
    this.reset();
  }

  reset() {
    this.skill = startSkill(this.age);
    this.startSkill = this.skill;
    this.peakSkill = this.skill;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.hits = 0;
    this.misses = 0;
    this.judged = 0;
    this.missRun = 0;
    this.counts = { jump: 0, punch: 0, dodge: 0, swing: 0, knock: 0, chop: 0, pop: 0, gear: 0, fire: 0, dance: 0, stomp: 0, bugs: 0, saves: 0, climb: 0, stack: 0 };
    this.typeStats = {};
    this.obstacles = [];
    this.clock = 0;
    this.run = 0;
    this.nextSpawn = 2.5;
    this.lastArrive = 0;
    this.lastType = null;
    this.act = Object.fromEntries(ACTS.map(k => [k, false]));
    this.since = Object.fromEntries(ACTS.map(k => [k, 0]));
    this.lastTrue = Object.fromEntries(ACTS.map(k => [k, -9]));
    this.fx = [];
    this.bonk = 0;
    this.lift = 0;
    this.swing = 0;
    this.shake = 0;
    this.throwing = null;
    this.wristUp = [-9, -9];
    this.wristHigh = [-9, -9];
    this.bump = 0;
    this.lastGear = 0;
  }

  // ---------- Body tracking ----------

  // Called each frame in camera mode with this player's pose (or null).
  trackPose(pts, now) {
    if (!pts) { this.pts = null; return; }
    const f = features(pts);
    if (!f) { this.pts = null; return; }
    this.pts = pts;
    this.f = f;
    this.lastSeen = now;

    if (!this.base) { this.calibrate(f, now); return; }

    const B = this.base;
    const t = B.torso;
    const lean = f.nose.x - B.noseX;
    const raw = {
      jump: B.hipY - f.hip.y > 0.13 * t && B.noseY - f.nose.y > 0.1 * t,
      left: false, right: false, reach: false,
      leanL: lean < -0.3 * t,
      leanR: lean > 0.3 * t,
      throw: false,
    };
    let up = 0, flap = false;
    f.wrists.forEach((w, i) => {
      if (w.v < 0.3) return;
      // An arm counts as "punching" when the hand is lifted to chest height or
      // above, or thrown out to the side. The side is judged on screen.
      const lifted = w.y < f.sh.y + 0.35 * t;
      const out = Math.abs(w.x - f.sh.x) > 0.85 * t;
      if (lifted || out) raw[w.x < f.sh.x ? 'left' : 'right'] = true;
      if (w.y < f.nose.y) { up++; this.wristUp[i] = now; }
      // Throw: a hand that was up by the head comes down in front within a moment.
      else if (w.y > f.sh.y + 0.15 * t && now - this.wristUp[i] < 0.6) { raw.throw = true; this.wristUp[i] = -9; }
      // Flap: an arm swings from above the shoulder down past the chest.
      if (w.y < f.sh.y - 0.05 * t) this.wristHigh[i] = now;
      else if (w.y > f.sh.y + 0.3 * t && now - this.wristHigh[i] < 0.7) { flap = true; this.wristHigh[i] = -9; }
    });
    raw.reach = up === 2;

    // Short latch so a single noisy frame does not flicker the move.
    const latched = {};
    for (const k of ACTS) {
      if (raw[k]) this.lastTrue[k] = now;
      latched[k] = now - this.lastTrue[k] < 0.15;
    }
    if (this.charged && !this.throwing) this.watchSpin(pts, now);
    const brk = this.throwing?.type;
    // Hands around the body, for the hand-zone break games.
    this.hands = f.wrists.map(w => (w.v >= 0.3 ? { x: (w.x - f.hip.x) / t, y: (w.y - B.hipY) / t } : null));
    this.hipShift = clamp((f.hip.x - B.hipX) / t, -1, 1);
    if (MINI.includes(brk)) handsMini(this, this.throwing, this.hands, now);
    if (brk === 'fire') this.aimHose(f);
    if (brk === 'bubbles') { if (flap) this.flap(); }
    // A karate chop is any hand coming down hard from shoulder height or above.
    else if (raw.throw || (brk === 'karate' && flap)) this.onThrow();
    this.setActions(latched);

    // Slowly follow the kid if they drift closer/further while standing normally.
    if (!latched.jump && !latched.leanL && !latched.leanR && brk !== 'tray') {
      const a = 0.02;
      B.hipX = lerp(B.hipX, f.hip.x, 0.008); // slow, so a little wiggle shows on screen
      B.noseX = lerp(B.noseX, f.nose.x, 0.02);
      B.hipY = lerp(B.hipY, f.hip.y, a);
      B.noseY = lerp(B.noseY, f.nose.y, a);
      B.torso = lerp(B.torso, f.torso, a);
    }
  }

  // Standing still for ~1.2s captures this kid's normal standing pose.
  calibrate(f, now) {
    const c = this.calib;
    const moved = c && (Math.abs(f.hip.y - c.hipY) > 0.12 * f.torso ||
      Math.abs(f.nose.y - c.noseY) > 0.12 * f.torso);
    if (!c || moved) {
      this.calib = { start: now, hipY: f.hip.y, noseY: f.nose.y };
      return;
    }
    this.calibProgress = (now - c.start) / 1.2;
    if (this.calibProgress >= 1) {
      this.base = { hipX: f.hip.x, hipY: f.hip.y, noseX: f.nose.x, noseY: f.nose.y, torso: f.torso };
      this.calib = null;
    }
  }

  clearCalibration() {
    this.base = null;
    this.calib = null;
    this.calibProgress = 0;
  }

  setActions(next) {
    for (const k of ACTS) {
      if (next[k] && !this.act[k]) this.since[k] = this.clock;
      this.act[k] = !!next[k];
    }
  }

  // ---------- Obstacles ----------

  // ramp: extra difficulty added as the workout timer runs down (0..~1.5).
  update(dt, playing, ramp = 0) {
    this.ramp = ramp;
    this.lift = lerp(this.lift, this.act.jump ? 1 : 0, Math.min(1, dt * 14));
    this.bonk = Math.max(0, this.bonk - dt);
    this.swing = Math.max(0, this.swing - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.bump = Math.max(0, this.bump - dt);
    this.spin = Math.max(0, (this.spin || 0) - dt);
    this.fx = this.fx.filter(e => (e.t += dt) < e.life);
    if (this.throwing) this.updateThrow(dt);
    if (!playing) return;

    this.clock += dt;
    if (this.throwing) return;
    this.run += dt; // how far down the road we've run (stands still in throw time)
    if (!this.tutorial && !this.shared && this.clock >= this.nextSpawn) this.spawn();

    for (const o of this.obstacles) {
      if (o.result) continue;
      const d = this.clock - o.arrive;
      if (o.kind === 'gear') { if (d >= 0) this.collect(o); continue; }
      // On a shared course, a kid out of view lets things pass without a miss.
      if (this.absent) { if (d > o.window) o.result = 'skip'; continue; }
      if (d < -o.window) continue;
      if (d <= o.window * 0.75) {
        if (this.matches(o)) this.succeed(o);
      } else {
        this.fail(o);
      }
    }
    // Smashed crates vanish; everything else rolls past.
    this.obstacles = this.obstacles.filter(o => this.clock - o.arrive < 1.2 &&
      !(o.result === 'hit' && (o.kind === 'crate' || o.kind === 'gear')));
  }

  // Tutorial: one slow, scripted obstacle that does not affect skill.
  teach(kind, side, travel) {
    const arrive = this.clock + travel;
    this.obstacles.push({ kind, side, arrive, travel, window: 0.9, result: null, tutorial: true });
    this.lastArrive = arrive;
  }

  startRound() {
    this.tutorial = false;
    this.missRun = 0;
    this.nextSpawn = this.clock + 1.5;
  }

  // A move only counts if it started recently, so a kid can't just hold a pose.
  fresh(k) {
    return this.act[k] && this.clock - this.since[k] < 2.2;
  }

  matches(o) {
    switch (o.kind) {
      case 'log': return this.fresh('jump');
      case 'rope': return this.fresh('reach');
      // A bird on the left means lean right, and the other way round.
      case 'bird': return this.fresh(o.side === 'left' ? 'leanR' : 'leanL');
      case 'crate':
        if (o.side === 'mid') return this.fresh('left') || this.fresh('right');
        return this.fresh(o.side);
    }
    return false;
  }

  pickKind(tn) {
    const kinds = ['log', 'crate'];
    if (tn.birds) kinds.push('bird');
    if (tn.ropes) kinds.push('rope');
    // After two misses in a row, give them the move they are best at.
    if (this.missRun >= 2) {
      let best = 'crate', bestRate = -1;
      for (const k of kinds) {
        const s = this.typeStats[k];
        const rate = s ? (s.hit + 1) / (s.hit + s.miss + 2) : 0.5;
        if (rate > bestRate) { best = k; bestRate = rate; }
      }
      return best;
    }
    let k;
    do { k = pick(kinds); } while (k === this.lastType && Math.random() < 0.6);
    return k;
  }

  spawn() {
    const tn = tuning(this.skill + (this.ramp || 0));
    // Now and then a hat floats down the road instead: a free prize.
    if (this.judged >= 4 && this.clock - this.lastGear > 22 && Math.random() < 0.4) {
      const worn = new Set(Object.values(this.gear));
      const item = pick(GEAR.filter(g => !worn.has(g.id)));
      const arrive = Math.max(this.clock + tn.travel, this.lastArrive + 0.9);
      this.obstacles.push({ kind: 'gear', item, arrive, travel: arrive - this.clock, window: 0.3, result: null, called: true });
      this.lastArrive = arrive;
      this.lastGear = this.clock;
      this.nextSpawn = this.clock + tn.gap * 0.7;
      return;
    }
    const kind = this.pickKind(tn);
    this.lastType = kind;
    const lr = () => (Math.random() < 0.5 ? 'left' : 'right');
    const side = kind === 'crate' ? (tn.sides ? lr() : 'mid') : kind === 'bird' ? lr() : null;
    const arrive = Math.max(this.clock + tn.travel, this.lastArrive + 0.9);
    this.obstacles.push({ kind, side, arrive, travel: arrive - this.clock, window: tn.window, result: null });
    this.lastArrive = arrive;

    let gap = tn.gap * rand(0.85, 1.2);
    if (this.missRun >= 2) gap *= 1.6;          // breathing room after misses
    else if (tn.combos && Math.random() < 0.25) gap *= 0.55; // quick pair
    this.nextSpawn = this.clock + gap;
  }

  // Break time: obstacles pause and each kid gets a stop-and-do game.
  startBreak(type = 'cans') {
    this.obstacles = [];
    const B = { type, balls: [], cooldown: 0, cleared: 0 };
    if (type === 'bubbles') { B.alt = 0; B.target = 0; B.vel = 0; B.falling = false; B.flapAt = -9; B.bubble = this.newBubble(); B.pops = []; }
    else if (type === 'karate') B.boards = boards();
    else if (type === 'fire') { B.fires = this.newFires(); B.aim = 0; B.aimTarget = 0; B.on = false; B.hiss = 0; }
    else if (MINI.includes(type)) startMini(this, B);
    else B.cans = type === 'snowman' ? snowman() : tower();
    this.throwing = B;
  }

  stopThrowing() {
    this.throwing = null;
    this.nextSpawn = this.clock + 1.5;
    this.lastArrive = this.clock;
  }

  // Break points follow the kid's level too, so older kids aren't outscored.
  get breakMult() { return 0.6 + 0.08 * this.skill; }

  // An overhand arm swing: throws a ball, or chops a board in karate time.
  onThrow() {
    const T = this.throwing;
    if (!T || T.cooldown > 0) return;
    if (T.type === 'bubbles') { this.flap(); return; }
    if (MINI.includes(T.type)) return;
    T.cooldown = 0.35;
    if (T.type === 'karate') { this.chop(); return; }
    const alive = T.cans.filter(c => !c.down);
    if (!alive.length) return;
    // A snowman is hit from the top down; cans are anybody's guess.
    const target = T.type === 'snowman' ? alive[alive.length - 1] : pick(alive);
    T.balls.push({ t: 0, dur: 0.55, target, hit: Math.random() < 0.85, side: this.act.left ? -1 : this.act.right ? 1 : 0 });
    this.onEvent?.('throw');
  }

  chop() {
    const T = this.throwing;
    const board = T.boards.find(b => !b.down);
    if (!board) return;
    board.down = true;
    board.vx = rand(1.5, 3); board.vy = rand(-3, -1.5); board.spin = rand(4, 9);
    this.counts.chop++;
    this.addPoints(60 * this.breakMult, Math.random() < 0.35 ? pick(['CHOP!', 'HI-YAH!', 'KRAK!']) : false);
    this.onEvent?.('chop');
  }

  // Bubble time: each flap climbs one step toward the bubble overhead. The
  // last step pops it, then the kid drops back to the ground for the next one.
  flap() {
    const T = this.throwing;
    if (!T || T.type !== 'bubbles' || T.cooldown > 0 || T.falling || !T.bubble) return;
    T.cooldown = 0.18;
    T.flapAt = this.clock;
    const b = T.bubble;
    b.done = Math.min(b.flaps, b.done + 1);
    T.target = (b.h * b.done) / b.flaps;
    this.onEvent?.('flap');
  }

  // Fire time: the hose follows whichever arm is held up and out the most.
  aimHose(f) {
    const t = f.torso;
    let best = null;
    for (const w of f.wrists) {
      if (w.v < 0.3 || w.y > f.hip.y - 0.2 * t) continue;
      const ext = (w.x - f.sh.x) / t;
      if (!best || Math.abs(ext) > Math.abs(best)) best = ext;
    }
    this.hoseInput(best == null ? null : clamp(best / 1.1, -1, 1));
  }

  // aim: -1 (screen left) .. 1 (screen right), or null when no arm is up.
  hoseInput(aim) {
    const T = this.throwing;
    if (T?.type !== 'fire') return;
    T.on = aim != null;
    if (T.on) T.aimTarget = aim;
  }

  // Three fires on the house; older kids' fires take a little longer to put out.
  newFires() {
    const spots = [-1, -0.5, 0, 0.5, 1].sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => a - b);
    const max = 0.9 + this.skill * 0.06;
    return spots.map(x => ({ x, hp: max, max, out: false, outT: 0 }));
  }

  // Older kids get a higher bubble that takes more flaps.
  newBubble() {
    const flaps = Math.round(clamp(3 + this.skill * 0.45, 3, 8));
    return { h: clamp(0.35 + flaps * 0.07, 0.4, 0.92), flaps, done: 0, t: 0, x: 0 };
  }

  updateThrow(dt) {
    const T = this.throwing;
    T.cooldown = Math.max(0, T.cooldown - dt);
    if (MINI.includes(T.type)) { updateMini(this, T, dt); return; }
    if (T.type === 'bubbles') {
      T.pops = T.pops.filter(q => (q.t += dt) < 0.6);
      if (T.falling) {
        T.vel -= 2.6 * dt;
        T.alt += T.vel * dt;
        if (T.alt <= 0) {
          T.alt = 0; T.vel = 0; T.target = 0; T.falling = false;
          T.next = this.clock + 0.5;
          this.onEvent?.('land');
        }
        return;
      }
      T.alt += (T.target - T.alt) * Math.min(1, dt * 7);
      const b = T.bubble;
      if (b) {
        b.t += dt;
        if (b.done >= b.flaps && T.alt >= b.h - 0.03) {
          T.pops.push({ h: b.h, x: b.x, t: 0 });
          T.bubble = null;
          T.falling = true;
          T.vel = 0.3;
          T.cleared++;
          this.counts.pop++;
          this.addPoints(150 * this.breakMult, pick(['POP!', 'BLOOP!', 'SPLOOSH!']));
          this.onEvent?.('pop');
        }
      } else if (this.clock >= T.next) {
        T.bubble = this.newBubble();
      }
      return;
    }
    if (T.type === 'fire') {
      T.aim += (T.aimTarget - T.aim) * Math.min(1, dt * 8);
      if (T.on && (T.hiss -= dt) <= 0) { T.hiss = 0.25; this.onEvent?.('spray'); }
      for (const fire of T.fires) {
        if (fire.out) { fire.outT += dt; continue; }
        if (T.on && Math.abs(T.aim - fire.x) < 0.38) fire.hp -= dt * 1.1;
        else fire.hp = Math.min(fire.max, fire.hp + dt * 0.12);
        if (fire.hp <= 0) {
          fire.out = true;
          this.counts.fire++;
          this.addPoints(100 * this.breakMult, Math.random() < 0.5 ? pick(['SPLOOSH!', 'FSSSHH!', 'DOUSED!']) : false);
          this.onEvent?.('sizzle');
        }
      }
      if (T.fires.every(fi => fi.out) && !T.refill) {
        T.refill = this.clock + 1.4;
        T.cleared++;
        this.addPoints(300 * this.breakMult, "FIRE'S OUT!");
        this.onEvent?.('strike');
      }
      if (T.refill && this.clock >= T.refill) { T.fires = this.newFires(); T.refill = 0; }
      return;
    }
    if (T.type === 'karate') {
      for (const c of T.boards) if (c.down) { c.vy += 9 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.spin * dt; }
      if (T.boards.every(c => c.down) && !T.refill) {
        T.refill = this.clock + 1.2;
        T.cleared++;
        this.addPoints(300 * this.breakMult, 'BLACK BELT!');
        this.onEvent?.('strike');
      }
      if (T.refill && this.clock >= T.refill) { T.boards = boards(); T.refill = 0; }
      return;
    }
    for (const b of T.balls) {
      b.t += dt;
      if (b.t >= b.dur && !b.done) {
        b.done = true;
        if (b.hit && !b.target.down) this.knock(b.target);
        else if (!b.hit) this.pop('Whoosh!', '#ffffff');
      }
    }
    T.balls = T.balls.filter(b => b.t < b.dur + 0.4);
    for (const c of T.cans) {
      if (!c.down) continue;
      c.vy += 9 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.spin * dt;
    }
    if (T.cans.every(c => c.down) && !T.refill) {
      T.refill = this.clock + 1.2;
      T.cleared++;
      this.addPoints(300 * this.breakMult, T.type === 'snowman' ? 'SNOW-PLOSION!' : 'STRIKE!');
      this.onEvent?.('strike');
    }
    if (T.refill && this.clock >= T.refill) { T.cans = T.type === 'snowman' ? snowman() : tower(); T.refill = 0; }
  }

  knock(can) {
    const T = this.throwing;
    // Knocking a can also topples the ones resting on it.
    const fall = [can, ...T.cans.filter(c => !c.down && c.row > can.row && Math.abs(c.col - can.col) <= 0.5)];
    for (const c of fall) {
      c.down = true;
      c.vx = rand(-3, 3); c.vy = rand(-4, -1.5); c.spin = rand(-12, 12);
    }
    this.counts.knock += fall.length;
    this.addPoints(50 * fall.length * this.breakMult, false);
    this.onEvent?.('knock');
  }

  // Ran into a floating hat: put it on.
  collect(o) {
    o.result = 'hit';
    this.gear[o.item.slot] = o.item.id;
    this.counts.gear++;
    this.addPoints(200 * this.breakMult, false);
    this.fx.push({ type: 'gear', text: o.item.name.toUpperCase() + '!', t: 0, life: 1.6 });
    this.onEvent?.('gear', o);
  }

  get charged() { return this.streak >= SUPER_STREAK; }

  // Super spin: while super charged, turning all the way round cashes the
  // charge in for a big bonus. Turning away makes the shoulders look narrow
  // to the camera; they widen again on the way back to the front.
  watchSpin(pts, now) {
    const sw = Math.abs(pts[LM.lSh].x - pts[LM.rSh].x);
    const normal = this.base.torso * 0.72;
    if (sw < 0.4 * normal) {
      this.spinNarrow ??= now;
    } else if (sw > 0.75 * normal) {
      const turned = this.spinNarrow != null && now - this.spinNarrow > 0.12 && now - this.spinNarrow < 2.5;
      this.spinNarrow = null;
      if (turned) this.superSpin();
    }
  }

  superSpin() {
    if (!this.charged) return;
    const bonus = 80 * this.streak * this.breakMult;
    this.spin = 0.8;
    this.streak = 0;
    this.addPoints(bonus, 'SUPER SPIN!');
    this.fx.push({ type: 'super', text: 'MEGA BONUS!', t: 0, life: 1.8 });
    for (let i = 0; i < 3; i++) this.confetti();
    this.onEvent?.('spin');
  }

  record(o, ok) {
    const s = (this.typeStats[o.kind] ||= { hit: 0, miss: 0 });
    ok ? s.hit++ : s.miss++;
    if (!o.tutorial) this.judged++;
  }

  addPoints(pts, word) {
    const mult = (this.rush ? 2 : 1) * (this.charged ? 1.5 : 1);
    const gained = Math.max(10, Math.round((pts * mult) / 10) * 10);
    this.score += gained;
    this.shake = 0.3;
    this.bump = 0.5;
    this.fx.push({ type: 'points', text: `+${gained}`, t: 0, life: 1.0 });
    // word: the comic-book word to show; left out picks a random one, false shows none.
    if (word !== false) this.fx.push({ type: 'kapow', text: word || pick(BIG_WORDS), t: 0, life: 0.85, rot: rand(-0.25, 0.25), hue: Math.floor(rand(0, 360)) });
    this.confetti();
    return gained;
  }

  succeed(o) {
    o.result = 'hit';
    o.resultAt = this.clock;
    this.record(o, true);
    this.hits++;
    this.streak++;
    this.missRun = 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    // Harder levels are worth more, so a younger kid on an easier level
    // doesn't run away with the score.
    const base = (50 + 12 * (this.skill + (this.ramp || 0))) * (o.kind === 'rope' ? 1.4 : 1);
    if (this.streak === SUPER_STREAK) {
      this.fx.push({ type: 'super', text: 'SUPER CHARGED!', t: 0, life: 1.8 });
      this.onEvent?.('super');
    }
    this.addPoints(base + 5 * Math.min(this.streak, 20), WORDS[o.kind] && Math.random() < 0.5 ? pick(WORDS[o.kind]) : null);
    this.counts[{ log: 'jump', crate: 'punch', bird: 'dodge', rope: 'swing' }[o.kind]]++;
    if (o.kind === 'rope') this.swing = 0.9;
    // Climb fast while we are still finding their level, then gently.
    // Up +0.2 / down -0.8 settles around an 80% success rate.
    if (!o.tutorial) this.setSkill(this.skill + (this.judged <= 8 ? 0.45 : 0.2));
    if (this.streak >= 5 && this.streak % 5 === 0 && this.streak !== SUPER_STREAK) {
      this.fx.push({ type: 'fire', text: this.streak >= 15 ? 'UNSTOPPABLE!' : this.streak >= 10 ? 'ON FIRE!' : `${this.streak} IN A ROW!`, t: 0, life: 1.6 });
      this.onEvent?.('streak');
    }
    if (o.kind === 'crate') this.burst(o);
    this.onEvent?.('hit', o);
  }

  fail(o) {
    o.result = 'miss';
    o.resultAt = this.clock;
    this.record(o, false);
    this.misses++;
    this.streak = 0;
    this.missRun++;
    this.bonk = 0.5;
    if (!o.tutorial) this.setSkill(this.skill - 0.8);
    this.pop(o.tutorial ? 'Try again!' : o.kind === 'rope' ? 'SPLASH!' : o.kind === 'bird' ? 'Squawk!' : 'Oops!', '#ffd0d0');
    if (o.kind === 'rope') this.fx.push({ type: 'splash', parts: sprinkle(16), t: 0, life: 0.8 });
    this.onEvent?.('miss', o);
  }

  setSkill(s) {
    const prevLevel = this.level;
    this.skill = clamp(s, 0, MAX_SKILL);
    this.peakSkill = Math.max(this.peakSkill, this.skill);
    if (this.level > prevLevel) {
      this.fx.push({ type: 'levelup', text: `LEVEL ${this.level}!`, t: 0, life: 1.3 });
      this.onEvent?.('level');
    }
  }

  get level() { return Math.floor(this.skill) + 1; }

  pop(text, color) { this.fx.push({ type: 'text', text, color, t: 0, life: 1.1 }); }

  burst(o) {
    this.fx.push({ type: 'burst', kind: o.kind, side: o.side, parts: sprinkle(14), t: 0, life: 0.7 });
  }

  confetti() {
    const parts = [];
    for (let i = 0; i < 26; i++) {
      parts.push({ x: rand(-0.5, 0.5), vx: rand(-0.6, 0.6), vy: rand(-1.6, -0.7), r: rand(0.08, 0.16), c: pick(CONFETTI) });
    }
    this.fx.push({ type: 'confetti', parts, t: 0, life: 1.2 });
  }
}

// Together mode: one course for the whole squad, so everyone meets the same
// thing at the same moment. The pace sits between the group's average and its
// youngest player, while each kid keeps their own timing leeway (window),
// their own level and their own points.
export class Course {
  constructor() { this.nextSpawn = 2.5; this.lastArrive = 0; this.lastType = null; this.lastGear = 0; }

  // Call when the round starts and after each break.
  resume(clock) { this.nextSpawn = clock + 1.5; this.lastArrive = clock; }

  paceSkill(players) {
    const avg = players.reduce((a, p) => a + p.skill, 0) / players.length;
    const low = Math.min(...players.map(p => p.skill));
    return (avg + low) / 2;
  }

  update(players, ramp = 0) {
    const ref = players[0];
    if (!ref) return;
    const pace = this.paceSkill(players);
    players.forEach(p => { p.paceSkill = pace; });
    if (ref.throwing || ref.tutorial || ref.clock < this.nextSpawn) return;
    const clock = ref.clock;
    const tn = tuning(pace + ramp);
    const arrive = Math.max(clock + tn.travel, this.lastArrive + 0.9);
    const judged = Math.min(...players.map(p => p.judged));
    if (judged >= 4 && clock - this.lastGear > 22 && Math.random() < 0.4) {
      for (const p of players) {
        const worn = new Set(Object.values(p.gear));
        const item = pick(GEAR.filter(g => !worn.has(g.id)));
        p.obstacles.push({ kind: 'gear', item, arrive, travel: arrive - clock, window: 0.3, result: null, called: true });
      }
      this.lastGear = clock;
      this.lastArrive = arrive;
      this.nextSpawn = clock + tn.gap * 0.7;
      return;
    }
    const kinds = ['log', 'crate'];
    if (tn.birds) kinds.push('bird');
    if (tn.ropes) kinds.push('rope');
    let kind;
    do { kind = pick(kinds); } while (kind === this.lastType && Math.random() < 0.6);
    this.lastType = kind;
    const lr = () => (Math.random() < 0.5 ? 'left' : 'right');
    const side = kind === 'crate' ? (tn.sides ? lr() : 'mid') : kind === 'bird' ? lr() : null;
    for (const p of players) {
      p.obstacles.push({ kind, side, arrive, travel: arrive - clock, window: tuning(p.skill).window, result: null });
      p.lastArrive = arrive;
    }
    this.lastArrive = arrive;
    let gap = tn.gap * rand(0.85, 1.2);
    if (players.some(p => p.missRun >= 2)) gap *= 1.3;   // a breather when someone is struggling
    else if (tn.combos && Math.random() < 0.25) gap *= 0.55;
    this.nextSpawn = clock + gap;
  }
}

const BIG_WORDS = ['KAPOW!', 'BOOM!', 'WHAM!', 'ZOINKS!', 'BAM!', 'YEEHAW!', 'WOWZA!', 'BONKERS!', 'ZAP!', 'KABLAM!'];
const WORDS = {
  crate: ['SMASH!', 'KAPOW!', 'CRUNCH!'],
  log: ['BOING!', 'SPROING!', 'HOP!'],
  bird: ['DODGED!', 'NOPE!', 'SWOOSH!'],
  rope: ['AAAH-AH-AAAH!', 'WHEEE!', 'SWING!'],
};
const CONFETTI = ['#ff5d73', '#ffe14d', '#3ddc84', '#3fa7ff', '#b57bff', '#ff9f1c', '#ffffff'];

function sprinkle(n) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push({ a: rand(0, Math.PI * 2), sp: rand(0.6, 1.6), r: rand(0.06, 0.14) });
  return parts;
}

// A snowman: three snowballs, smallest on top, wearing a hat.
function snowman() {
  return [[0, 1.25], [1, 1], [2, 0.75]].map(([row, size]) =>
    ({ row, col: 0, size, x: 0, y: -row, rot: 0, down: false, color: '#ffffff' }));
}

// A stack of five boards for karate time, chopped from the top.
function boards() {
  return [4, 3, 2, 1, 0].map(i => ({ i, x: 0, y: 0, rot: 0, down: false }));
}

// A 3-2-1 pyramid of cans, in can-sized units around the tower centre.
function tower() {
  const cans = [];
  [[0, -1], [0, 0], [0, 1], [1, -0.5], [1, 0.5], [2, 0]].forEach(([row, col]) =>
    cans.push({ row, col, x: col, y: -row, rot: 0, down: false, color: pick(['#ff5d73', '#3fa7ff', '#ffe14d', '#3ddc84']) }));
  return cans;
}

// Keyboard test controls: [up, left, down, right] for players 1..4.
// Up jumps (or throws in throw time), left/right punch, both = hands up,
// and down plus left/right leans.
export const KEYMAP = [
  ['KeyW', 'KeyA', 'KeyS', 'KeyD'],
  ['KeyT', 'KeyF', 'KeyG', 'KeyH'],
  ['KeyI', 'KeyJ', 'KeyK', 'KeyL'],
  ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
];

export function keyActions(keys, i) {
  const [u, l, d, r] = KEYMAP[i];
  const L = keys.has(l), R = keys.has(r), D = keys.has(d);
  return {
    spin: D && !L && !R && !keys.has(u),
    jump: keys.has(u),
    left: L && !R && !D, right: R && !L && !D, reach: L && R && !D,
    leanL: D && L, leanR: D && R,
  };
}
