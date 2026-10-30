// Game rules: body-move detection, obstacles, and per-player adaptive difficulty.

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
// (same overhand arm swing), and bubbles are popped by flapping up to them.
export const BREAKS = ['cans', 'karate', 'bubbles', 'snowman'];

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
    this.counts = { jump: 0, punch: 0, dodge: 0, swing: 0, knock: 0, chop: 0, pop: 0, gear: 0 };
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
    if (this.throwing?.type === 'bubbles') { if (flap) this.flap(); }
    else if (raw.throw) this.onThrow();
    this.setActions(latched);

    // Slowly follow the kid if they drift closer/further while standing normally.
    if (!latched.jump && !latched.leanL && !latched.leanR) {
      const a = 0.02;
      B.hipX = lerp(B.hipX, f.hip.x, 0.05);
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
    this.fx = this.fx.filter(e => (e.t += dt) < e.life);
    if (this.throwing) this.updateThrow(dt);
    if (!playing) return;

    this.clock += dt;
    if (this.throwing) return;
    this.run += dt; // how far down the road we've run (stands still in throw time)
    if (!this.tutorial && this.clock >= this.nextSpawn) this.spawn();

    for (const o of this.obstacles) {
      if (o.result) continue;
      const d = this.clock - o.arrive;
      if (o.kind === 'gear') { if (d >= 0) this.collect(o); continue; }
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
    if (type === 'bubbles') { B.alt = 0; B.vel = 0; B.bubble = this.newBubble(); B.pops = []; }
    else if (type === 'karate') B.boards = boards();
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

  flap() {
    const T = this.throwing;
    if (!T || T.type !== 'bubbles' || T.cooldown > 0) return;
    T.cooldown = 0.15;
    T.vel = Math.min(T.vel + 1.15, 1.7);
    this.onEvent?.('flap');
  }

  // Bubbles float higher for kids on higher levels.
  newBubble() {
    return { h: clamp(rand(0.3, 0.5 + 0.045 * this.skill), 0.25, 0.92), t: 0, x: rand(-0.5, 0.5) };
  }

  updateThrow(dt) {
    const T = this.throwing;
    T.cooldown = Math.max(0, T.cooldown - dt);
    if (T.type === 'bubbles') {
      T.vel -= 1.9 * dt;
      T.alt += T.vel * dt;
      if (T.alt <= 0) { T.alt = 0; T.vel = Math.max(0, T.vel); }
      if (T.alt >= 1) { T.alt = 1; T.vel = Math.min(0, T.vel); }
      T.pops = T.pops.filter(q => (q.t += dt) < 0.6);
      const b = T.bubble;
      if (b) {
        b.t += dt;
        if (Math.abs(T.alt - b.h) < 0.09) {
          T.pops.push({ h: b.h, x: b.x, t: 0 });
          T.bubble = null;
          T.next = this.clock + 0.6;
          T.cleared++;
          this.counts.pop++;
          this.addPoints(120 * this.breakMult, pick(['POP!', 'BLOOP!', 'SPLOOSH!']));
          this.onEvent?.('pop');
        }
      } else if (this.clock >= T.next) {
        T.bubble = this.newBubble();
      }
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
    jump: keys.has(u),
    left: L && !R && !D, right: R && !L && !D, reach: L && R && !D,
    leanL: D && L, leanR: D && R,
  };
}
