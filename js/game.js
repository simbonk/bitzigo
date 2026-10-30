// Game rules: body-move detection, obstacles, and per-player adaptive difficulty.

export const COLORS = ['#ff5a5f', '#3fa7ff', '#3ddc84', '#b57bff'];
export const MAX_SKILL = 10;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

// Pose landmark indices (MediaPipe BlazePose).
export const LM = {
  nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28,
};

// Where a kid of this age starts. Everyone starts a bit below their age and
// the game climbs quickly in the first few obstacles to find their level.
export function startSkill(age) {
  return clamp((age - 4) * 0.8, 0, 6);
}

// Everything that gets harder with skill lives here.
export function tuning(skill) {
  const t = clamp(skill / MAX_SKILL, 0, 1);
  return {
    travel: lerp(4.4, 1.7, t),   // seconds from horizon to the player
    gap: lerp(3.6, 1.05, t),     // seconds between obstacles
    window: lerp(0.65, 0.3, t),  // timing forgiveness, seconds either side
    sides: skill >= 2.5,         // crates come left or right (not just middle)
    stars: skill >= 4,           // both-hands-up stars
    combos: skill >= 6.5,        // quick pairs like duck-then-jump
  };
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

export function features(pts) {
  const sh = mid(pts[LM.lSh], pts[LM.rSh]);
  const hip = mid(pts[LM.lHip], pts[LM.rHip]);
  if (sh.v < 0.4 || hip.v < 0.3) return null;
  const torso = Math.hypot(sh.x - hip.x, sh.y - hip.y);
  if (torso < 0.03) return null;
  return { nose: pts[LM.nose], sh, hip, torso, wrists: [pts[LM.lWr], pts[LM.rWr]] };
}

const ACTS = ['jump', 'duck', 'left', 'right', 'reach'];

export class Player {
  constructor(index, { name, age }) {
    this.index = index;
    this.name = name || `Player ${index + 1}`;
    this.age = age;
    this.color = COLORS[index];
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
    this.counts = { jump: 0, duck: 0, punch: 0, reach: 0 };
    this.typeStats = {};
    this.obstacles = [];
    this.clock = 0;
    this.nextSpawn = 2.5;
    this.lastArrive = 0;
    this.lastType = null;
    this.act = Object.fromEntries(ACTS.map(k => [k, false]));
    this.since = Object.fromEntries(ACTS.map(k => [k, 0]));
    this.lastTrue = Object.fromEntries(ACTS.map(k => [k, -9]));
    this.fx = [];
    this.bonk = 0;
    this.lift = 0;
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
    const raw = {
      jump: B.hipY - f.hip.y > 0.13 * t && B.noseY - f.nose.y > 0.1 * t,
      duck: f.nose.y - B.noseY > 0.3 * t,
      left: false, right: false, reach: false,
    };
    let up = 0;
    for (const w of f.wrists) {
      if (w.v < 0.3) continue;
      // An arm counts as "punching" when the hand is lifted to chest height or
      // above, or thrown out to the side. The side is judged on screen.
      const lifted = w.y < f.sh.y + 0.35 * t;
      const out = Math.abs(w.x - f.sh.x) > 0.85 * t;
      if (lifted || out) raw[w.x < f.sh.x ? 'left' : 'right'] = true;
      if (w.y < f.nose.y) up++;
    }
    raw.reach = up === 2;

    // Short latch so a single noisy frame does not flicker the move.
    const latched = {};
    for (const k of ACTS) {
      if (raw[k]) this.lastTrue[k] = now;
      latched[k] = now - this.lastTrue[k] < 0.15;
    }
    this.setActions(latched);

    // Slowly follow the kid if they drift closer/further while standing normally.
    if (!latched.jump && !latched.duck) {
      const a = 0.02;
      B.hipX = lerp(B.hipX, f.hip.x, 0.05);
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
      this.base = { hipX: f.hip.x, hipY: f.hip.y, noseY: f.nose.y, torso: f.torso };
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
    this.fx = this.fx.filter(e => (e.t += dt) < e.life);
    if (!playing) return;

    this.clock += dt;
    if (!this.tutorial && this.clock >= this.nextSpawn) this.spawn();

    for (const o of this.obstacles) {
      if (o.result) continue;
      const d = this.clock - o.arrive;
      if (d < -o.window) continue;
      if (d <= o.window * 0.75) {
        if (this.matches(o)) this.succeed(o);
      } else {
        this.fail(o);
      }
    }
    // Smashed crates and grabbed stars vanish; everything else rolls past.
    this.obstacles = this.obstacles.filter(o => this.clock - o.arrive < 1.2 &&
      !(o.result === 'hit' && (o.kind === 'crate' || o.kind === 'star')));
  }

  // Tutorial: one slow, scripted obstacle that does not affect skill.
  teach(kind, travel) {
    const arrive = this.clock + travel;
    this.obstacles.push({ kind, side: 'mid', arrive, travel, window: 0.9, result: null, tutorial: true });
    this.lastArrive = arrive;
  }

  startRound() {
    this.tutorial = false;
    this.missRun = 0;
    this.nextSpawn = this.clock + 1.5;
  }

  // A move only counts if it started recently, so a kid can't just stay crouched.
  fresh(k) {
    return this.act[k] && this.clock - this.since[k] < 2.2;
  }

  matches(o) {
    switch (o.kind) {
      case 'log': return this.fresh('jump');
      case 'bar': return this.fresh('duck');
      case 'star': return this.fresh('reach');
      case 'crate':
        if (o.side === 'mid') return this.fresh('left') || this.fresh('right');
        return this.fresh(o.side);
    }
    return false;
  }

  pickKind(tn) {
    const kinds = ['log', 'bar', 'crate'];
    if (tn.stars) kinds.push('star');
    // After two misses in a row, give them the move they are best at.
    if (this.missRun >= 2) {
      let best = 'crate', bestRate = -1;
      for (const k of ['log', 'bar', 'crate']) {
        const s = this.typeStats[k];
        const rate = s ? (s.hit + 1) / (s.hit + s.miss + 2) : 0.5;
        if (rate > bestRate) { best = k; bestRate = rate; }
      }
      return best;
    }
    let k;
    do { k = kinds[Math.floor(Math.random() * kinds.length)]; }
    while (k === this.lastType && Math.random() < 0.6);
    return k;
  }

  spawn() {
    const tn = tuning(this.skill + (this.ramp || 0));
    const kind = this.pickKind(tn);
    this.lastType = kind;
    const side = kind === 'crate' ? (tn.sides ? (Math.random() < 0.5 ? 'left' : 'right') : 'mid') : null;
    const arrive = Math.max(this.clock + tn.travel, this.lastArrive + 0.9);
    this.obstacles.push({ kind, side, arrive, travel: arrive - this.clock, window: tn.window, result: null });
    this.lastArrive = arrive;

    let gap = tn.gap * rand(0.85, 1.2);
    if (this.missRun >= 2) gap *= 1.6;          // breathing room after misses
    else if (tn.combos && Math.random() < 0.25) gap *= 0.55; // quick pair
    this.nextSpawn = this.clock + gap;
  }

  record(o, ok) {
    const s = (this.typeStats[o.kind] ||= { hit: 0, miss: 0 });
    ok ? s.hit++ : s.miss++;
    if (!o.tutorial) this.judged++;
  }

  succeed(o) {
    o.result = 'hit';
    o.resultAt = this.clock;
    this.record(o, true);
    this.hits++;
    this.streak++;
    this.missRun = 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const pts = (o.kind === 'star' ? 150 : 100) + 10 * Math.min(this.streak, 20);
    const gained = Math.round(pts * (this.rush ? 2 : 1));
    this.score += gained;
    this.counts[o.kind === 'log' ? 'jump' : o.kind === 'bar' ? 'duck' : o.kind === 'crate' ? 'punch' : 'reach']++;
    // Climb fast while we are still finding their level, then gently.
    // Up +0.2 / down -0.8 settles around an 80% success rate.
    if (!o.tutorial) this.setSkill(this.skill + (this.judged <= 8 ? 0.45 : 0.2));
    const words = ['Nice!', 'Great!', 'Awesome!', 'Woo!', 'Super!', 'Yes!'];
    this.pop(this.streak >= 5 && this.streak % 5 === 0 ? `${this.streak} in a row!` : words[Math.floor(Math.random() * words.length)], '#fff');
    this.fx.push({ type: 'points', text: `+${gained}`, t: 0, life: 0.9 });
    if (o.kind === 'crate' || o.kind === 'star') this.burst(o);
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
    if (!o.tutorial) this.setSkill(this.skill - (o.kind === 'star' ? 0.2 : 0.8));
    this.pop(o.tutorial ? 'Try again!' : 'Oops!', '#ffd0d0');
    this.onEvent?.('miss', o);
  }

  setSkill(s) {
    const prevLevel = this.level;
    this.skill = clamp(s, 0, MAX_SKILL);
    this.peakSkill = Math.max(this.peakSkill, this.skill);
    if (this.level > prevLevel) {
      this.pop(`Level ${this.level}!`, '#ffd23f');
      this.onEvent?.('level');
    }
  }

  get level() { return Math.floor(this.skill) + 1; }

  pop(text, color) { this.fx.push({ type: 'text', text, color, t: 0, life: 1.1 }); }

  burst(o) {
    const parts = [];
    for (let i = 0; i < 14; i++) {
      parts.push({ a: rand(0, Math.PI * 2), sp: rand(0.6, 1.6), r: rand(0.06, 0.14) });
    }
    this.fx.push({ type: 'burst', kind: o.kind, side: o.side, parts, t: 0, life: 0.7 });
  }
}

// Keyboard test controls: [up, left, down, right] for players 1..4.
export const KEYMAP = [
  ['KeyW', 'KeyA', 'KeyS', 'KeyD'],
  ['KeyT', 'KeyF', 'KeyG', 'KeyH'],
  ['KeyI', 'KeyJ', 'KeyK', 'KeyL'],
  ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
];

export function keyActions(keys, i) {
  const [u, l, d, r] = KEYMAP[i];
  const L = keys.has(l), R = keys.has(r);
  return { jump: keys.has(u), duck: keys.has(d), left: L && !R, right: R && !L, reach: L && R };
}
