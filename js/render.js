// Drawing. The world is painted onto a small low-resolution canvas and scaled
// up with smoothing off, which gives the chunky pixel look. Text and HUD are
// drawn on top at full resolution so they stay crisp and readable.
import { LM, tuning } from './game.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const FONT = '"Trebuchet MS", "Avenir Next", system-ui, sans-serif';

export const CHARACTERS = [
  { id: 'fox', name: 'Fox', body: '#ff8a2a', limb: '#e0661a', head: '#ff8a2a', belly: '#fff3e0' },
  { id: 'frog', name: 'Frog', body: '#4cc94c', limb: '#2f9e3a', head: '#4cc94c', belly: '#c9f5a8' },
  { id: 'robot', name: 'Robot', body: '#9aa7b8', limb: '#6b788a', head: '#b8c4d4', belly: '#5be0ff' },
  { id: 'bunny', name: 'Bunny', body: '#f4f4f8', limb: '#d8d8e4', head: '#f4f4f8', belly: '#ffc4d6' },
  { id: 'panda', name: 'Panda', body: '#2b2b33', limb: '#2b2b33', head: '#f8f8f8', belly: '#f8f8f8' },
  { id: 'dino', name: 'Dino', body: '#9b6bff', limb: '#7444d8', head: '#9b6bff', belly: '#e2d4ff' },
];

export const THEMES = {
  forest: { name: 'Forest', sky: ['#5ec8f2', '#c8f0ff'], grass: ['#6cc644', '#5fb83b'], road: ['#d9b980', '#cfad70'], edge: '#a8864e', prop: 'pine', cloud: '#ffffff' },
  snow: { name: 'Snow', sky: ['#8fb8de', '#e8f4ff'], grass: ['#f2f7fb', '#e3edf5'], road: ['#a9c7e0', '#9dbcd6'], edge: '#7a9cba', prop: 'snowpine', cloud: '#ffffff' },
  desert: { name: 'Desert', sky: ['#ff9e5e', '#ffe0a3'], grass: ['#f2cf7a', '#e8c36a'], road: ['#c98e52', '#bf8448'], edge: '#9a6534', prop: 'cactus', cloud: '#fff4e0' },
  space: { name: 'Space', sky: ['#0b0b2a', '#3a1e6e'], grass: ['#3b3561', '#332e56'], road: ['#6a5fa8', '#5f549c'], edge: '#9d8cff', prop: 'crystal', cloud: '#ffffff' },
};

const KIND_INFO = {
  log: { word: 'JUMP!', color: '#ffb02e' },
  crate: { word: 'PUNCH!', color: '#ffe14d' },
  bird: { word: 'LEAN!', color: '#ff5d73' },
  rope: { word: 'HANDS UP!', color: '#7df9ff' },
};

// Lane geometry for slot i of n inside a w x h canvas.
export function laneBox(i, n, w, h) {
  const lw = w / n;
  const x = i * lw;
  const horizon = h * 0.3;
  const ground = h * 0.93;
  const depth = ground - horizon;
  const S = Math.min(depth * 0.15, lw * 0.19); // avatar "torso" size in px
  return { x, w: lw, cx: x + lw / 2, h, horizon, ground, depth, S };
}

// z: 1 at the horizon, 0 at the player, negative once past.
function project(L, z) {
  const p = 1 / (1 + 5 * Math.max(z, -0.17));
  const y = L.horizon + (L.ground - L.horizon) * (p - 1 / 6) / (5 / 6);
  return { y, s: p };
}

function roadHalf(L, y) {
  const k = (y - L.horizon) / (L.ground - L.horizon);
  return L.w * (0.05 + 0.31 * k);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => clamp(Math.round(c + 255 * amt), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const R = Math.round;
function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)));
}

// A block with a lighter top face, so it reads as a cube.
function block(ctx, x, y, w, h, color, top = 0.28) {
  const t = Math.max(1, h * top);
  rect(ctx, x, y + t, w, h - t, color);
  rect(ctx, x, y, w, t, shade(color, 0.16));
  rect(ctx, x, y + h - Math.max(1, h * 0.1), w, Math.max(1, h * 0.1), shade(color, -0.18));
}

// ---------------- World (low-res canvas) ----------------

export function drawLaneWorld(ctx, L, p, time, character, theme = THEMES.forest) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x, 0, L.w, L.h);
  ctx.clip();
  if (p.shake > 0) ctx.translate(R(Math.sin(time * 90) * L.S * 0.18 * p.shake / 0.3), R(Math.cos(time * 70) * L.S * 0.12 * p.shake / 0.3));

  // Sky in flat bands.
  const top = shade(theme.sky[0], 0), bottom = shade(theme.sky[1], 0);
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const k = b / (bands - 1);
    ctx.fillStyle = mix(top, bottom, k);
    ctx.fillRect(L.x, R((L.horizon * b) / bands), L.w, R(L.horizon / bands) + 1);
  }
  if (theme.prop === 'crystal') {
    for (let k = 0; k < 9; k++) {
      const sx = L.x + ((k * 37 + p.index * 13) % 100) / 100 * L.w, sy = ((k * 53) % 90) / 100 * L.horizon;
      rect(ctx, sx, sy, Math.max(1, L.S * 0.08), Math.max(1, L.S * 0.08), Math.sin(time * 3 + k) > 0 ? '#ffffff' : '#9d8cff');
    }
  }
  // Blocky clouds drifting.
  for (let c = 0; c < 2; c++) {
    const cx = L.x + ((c * 0.55 + time * 0.012 * (c + 1) + p.index * 0.3) % 1.2) * L.w - L.w * 0.1;
    const cy = L.horizon * (0.5 + 0.22 * c);
    const u = L.S * 0.35;
    ctx.globalAlpha = theme.prop === 'crystal' ? 0.25 : 1;
    rect(ctx, cx, cy, u * 4, u, theme.cloud);
    rect(ctx, cx + u, cy - u, u * 2, u, theme.cloud);
    ctx.globalAlpha = 1;
  }

  // Ground rows that scroll toward the player.
  const speed = 1 / tuning(p.skill).travel;
  const dist = (p.run ?? p.clock) * speed;
  const dz = 0.08;
  const offset = dist % (dz * 2);
  const baseRow = Math.floor(dist / dz);
  for (let r = -3; r < 14; r++) {
    const z0 = r * dz - (offset % dz), z1 = z0 + dz;
    if (z0 > 1) break;
    const a = project(L, Math.min(z1, 1)), b = project(L, Math.max(z0, -0.17));
    const odd = ((r + baseRow) & 1) === 0;
    rect(ctx, L.x, a.y, L.w, b.y - a.y + 1, theme.grass[odd ? 0 : 1]);
    // Road tiles: two tones.
    const ha = roadHalf(L, a.y), hb = roadHalf(L, b.y);
    ctx.fillStyle = theme.road[odd ? 0 : 1];
    ctx.beginPath();
    ctx.moveTo(L.cx - ha, R(a.y)); ctx.lineTo(L.cx + ha, R(a.y));
    ctx.lineTo(L.cx + hb, R(b.y) + 1); ctx.lineTo(L.cx - hb, R(b.y) + 1);
    ctx.fill();
  }
  // Road edges.
  ctx.strokeStyle = theme.edge;
  ctx.lineWidth = Math.max(1, L.S * 0.08);
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(L.cx + sgn * roadHalf(L, L.horizon), L.horizon);
    ctx.lineTo(L.cx + sgn * roadHalf(L, L.h), L.h);
    ctx.stroke();
  }

  // Things in depth order: trees, obstacles, the avatar.
  const items = [];
  const treeGap = 0.3, treeOff = dist % treeGap;
  for (let k = -1; k < 5; k++) {
    const z = k * treeGap - treeOff + 0.12;
    if (z > 1 || z < -0.15) continue;
    items.push({ z, draw: () => drawTree(ctx, L, z, (k + Math.floor(dist / treeGap)) & 1 ? -1 : 1, theme.prop) });
  }
  for (const o of p.obstacles) {
    const z = (o.arrive - p.clock) / o.travel;
    if (z <= 1.02) items.push({ z, draw: () => drawObstacle(ctx, L, o, z) });
  }
  if (p.throwing) items.push({ z: TOWER_Z, draw: () => drawTower(ctx, L, p.throwing) });
  items.push({ z: 0.015, draw: () => drawAvatar(ctx, L, p, time, character) });
  items.sort((a, b) => b.z - a.z).forEach(it => it.draw());
  if (p.throwing) drawBalls(ctx, L, p.throwing);

  drawBursts(ctx, L, p);

  if (p.paused) {
    ctx.fillStyle = 'rgba(10,15,35,0.55)';
    ctx.fillRect(L.x, 0, L.w, L.h);
  }
  ctx.restore();
  // Lane divider.
  rect(ctx, L.x + L.w - 1, 0, 2, L.h, '#1b2340');
}

function mix(a, b, k) {
  const pa = a.match(/\d+/g).map(Number), pb = b.match(/\d+/g).map(Number);
  return `rgb(${pa.map((v, i) => R(v + (pb[i] - v) * k)).join(',')})`;
}

function drawTree(ctx, L, z, side, prop) {
  const { y, s } = project(L, z);
  const u = L.S * s;
  const x = L.cx + side * (roadHalf(L, y) + u * 0.9);
  if (prop === 'cactus') {
    block(ctx, x - u * 0.25, y - u * 2.2, u * 0.5, u * 2.2, '#3f9e4a', 0.08);
    block(ctx, x - u * 0.75, y - u * 1.6, u * 0.3, u * 0.7, '#3f9e4a', 0.15);
    rect(ctx, x - u * 0.75, y - u * 1.0, u * 0.5, u * 0.25, '#3f9e4a');
    block(ctx, x + u * 0.45, y - u * 1.9, u * 0.3, u * 0.8, '#3f9e4a', 0.15);
    rect(ctx, x + u * 0.25, y - u * 1.2, u * 0.5, u * 0.25, '#3f9e4a');
    return;
  }
  if (prop === 'crystal') {
    block(ctx, x - u * 0.35, y - u * 1.8, u * 0.7, u * 1.8, '#7df9ff', 0.2);
    block(ctx, x - u * 0.8, y - u * 1.0, u * 0.45, u * 1.0, '#c77dff', 0.2);
    block(ctx, x + u * 0.4, y - u * 1.3, u * 0.4, u * 1.3, '#ff7de9', 0.2);
    return;
  }
  const leaf = prop === 'snowpine' ? '#2d7d5a' : '#2f9e44';
  rect(ctx, x - u * 0.2, y - u * 1.0, u * 0.4, u * 1.0, '#7a4a24');
  block(ctx, x - u * 0.7, y - u * 2.4, u * 1.4, u * 1.5, leaf);
  block(ctx, x - u * 0.45, y - u * 3.0, u * 0.9, u * 0.7, shade(leaf, 0.06));
  if (prop === 'snowpine') {
    rect(ctx, x - u * 0.7, y - u * 2.4, u * 1.4, u * 0.3, '#ffffff');
    rect(ctx, x - u * 0.45, y - u * 3.0, u * 0.9, u * 0.25, '#ffffff');
  }
}

function drawObstacle(ctx, L, o, z) {
  const { y, s } = project(L, z);
  const u = L.S * s;
  ctx.save();
  if (z < 0) ctx.globalAlpha = clamp(1 + z * 6, 0, 1) * 0.85;
  if (o.result === 'miss') ctx.globalAlpha *= 0.55;

  if (o.kind === 'log') {
    // A low brick wall to jump over.
    const w = roadHalf(L, y) * 2.1, hh = u * 0.8;
    const x0 = L.cx - w / 2;
    block(ctx, x0, y - hh, w, hh, '#e0662f', 0.25);
    const bw = w / 5;
    for (let k = 1; k < 5; k++) rect(ctx, x0 + bw * k, y - hh * 0.7, Math.max(1, u * 0.06), hh * 0.65, '#a8431a');
    rect(ctx, x0, y - hh * 0.4, w, Math.max(1, u * 0.06), '#a8431a');
  } else if (o.kind === 'bird') {
    // A crazy bird flying at head height on one side: lean the other way.
    const dir = o.side === 'left' ? -1 : 1;
    const flap = Math.floor((o.arrive - z * o.travel) * 8 + z * 40) % 2;
    const bx = L.cx + dir * u * 0.55 + Math.sin(z * 30) * u * 0.15, by = y - u * 3.35;
    const b = u * 0.95;
    block(ctx, bx - b / 2, by - b / 2, b, b * 0.85, '#ff5d73', 0.2);        // body
    rect(ctx, bx - b * 0.15, by + b * 0.05, b * 0.3, b * 0.25, '#ffd0d8');    // belly
    rect(ctx, bx - b * 0.75, by - b * (flap ? 0.55 : 0.05), b * 0.3, b * 0.45, '#c9304a'); // wings
    rect(ctx, bx + b * 0.45, by - b * (flap ? 0.55 : 0.05), b * 0.3, b * 0.45, '#c9304a');
    rect(ctx, bx - b * 0.3, by - b * 0.25, b * 0.2, b * 0.22, '#ffffff');    // eyes
    rect(ctx, bx + b * 0.1, by - b * 0.25, b * 0.2, b * 0.22, '#ffffff');
    rect(ctx, bx - b * 0.24, by - b * 0.19, b * 0.1, b * 0.12, '#1b1b22');
    rect(ctx, bx + b * 0.16, by - b * 0.19, b * 0.1, b * 0.12, '#1b1b22');
    rect(ctx, bx - b * 0.35, by - b * 0.36, b * 0.28, b * 0.07, '#1b1b22');  // angry brows
    rect(ctx, bx + b * 0.07, by - b * 0.36, b * 0.28, b * 0.07, '#1b1b22');
    rect(ctx, bx - b * 0.1, by - b * 0.02, b * 0.2, b * 0.18, '#ffb02e');    // beak
    rect(ctx, bx - b * 0.1, by - b * 0.6, b * 0.08, b * 0.18, '#c9304a');    // tuft
    rect(ctx, bx + b * 0.04, by - b * 0.66, b * 0.08, b * 0.24, '#c9304a');
  } else if (o.kind === 'rope') {
    // A muddy puddle with a rope hanging over it: grab it with both hands.
    const w = roadHalf(L, y) * 1.9, d = Math.max(2, u * 0.45);
    rect(ctx, L.cx - w / 2, y - d * 0.6, w, d, '#3f86d6');
    rect(ctx, L.cx - w * 0.42, y - d * 0.85, w * 0.84, d * 0.3, '#5aa7f0');
    rect(ctx, L.cx - w * 0.3, y - d * 0.45, w * 0.12, Math.max(1, d * 0.15), '#bfe3ff');
    rect(ctx, L.cx + w * 0.1, y - d * 0.3, w * 0.18, Math.max(1, d * 0.15), '#bfe3ff');
    const top = y - u * 5.6, hang = y - u * 3.7;
    block(ctx, L.cx - w * 0.6, top - u * 0.35, w * 1.2, u * 0.4, '#7a4a24', 0.25);   // branch
    if (o.result !== 'hit') {
      rect(ctx, L.cx - Math.max(1, u * 0.08), top, Math.max(2, u * 0.16), hang - top, '#d9b16a');
      rect(ctx, L.cx - u * 0.16, hang - u * 0.1, u * 0.32, u * 0.3, '#b88a3e');       // knot
    }
  } else if (o.kind === 'crate') {
    const off = o.side === 'left' ? -1.2 : o.side === 'right' ? 1.2 : 0;
    const size = u * 1.1;
    const cx = L.cx + off * u, cy = y - u * 2.55;
    block(ctx, cx - size / 2, cy - size / 2, size, size, '#d08a3a', 0.22);
    const b = Math.max(1, size * 0.1);
    rect(ctx, cx - size / 2, cy - size * 0.28, b, size * 0.78, '#8a5220');
    rect(ctx, cx + size / 2 - b, cy - size * 0.28, b, size * 0.78, '#8a5220');
    rect(ctx, cx - size / 2, cy + size * 0.1, size, b, '#8a5220');
    if (o.side !== 'mid') pixelArrow(ctx, cx, cy + size * 0.12, size * 0.5, o.side === 'left' ? -1 : 1, '#ffe14d');
  }
  ctx.restore();
}

// Throw time: a pyramid of cans on a little table down the road.
const TOWER_Z = 0.3;
function canBox(L, c) {
  const { y, s } = project(L, TOWER_Z);
  const u = L.S * s, cw = u * 0.72, ch = u * 0.9;
  return { x: L.cx + c.x * cw * 1.08, y: y - u * 1.1 + c.y * ch, cw, ch, u, ground: y };
}
function drawTower(ctx, L, T) {
  const { y, s } = project(L, TOWER_Z);
  const u = L.S * s;
  block(ctx, L.cx - u * 1.4, y - u * 1.1, u * 2.8, u * 0.3, '#8a5220', 0.3);
  rect(ctx, L.cx - u * 1.2, y - u * 0.8, u * 0.2, u * 0.8, '#6b3e18');
  rect(ctx, L.cx + u, y - u * 0.8, u * 0.2, u * 0.8, '#6b3e18');
  for (const c of T.cans) {
    const b = canBox(L, c);
    ctx.save();
    ctx.translate(b.x, b.y - b.ch / 2);
    ctx.rotate(c.rot);
    rect(ctx, -b.cw / 2, -b.ch / 2, b.cw, b.ch, c.color);
    rect(ctx, -b.cw / 2, -b.ch / 2, b.cw, Math.max(1, b.ch * 0.14), '#d8dce6');
    rect(ctx, -b.cw / 2, b.ch * 0.36, b.cw, Math.max(1, b.ch * 0.14), '#d8dce6');
    rect(ctx, -b.cw / 2, -b.ch * 0.1, b.cw, Math.max(1, b.ch * 0.18), '#ffffff');
    ctx.restore();
  }
}
function drawBalls(ctx, L, T) {
  for (const b of T.balls) {
    const k = Math.min(1, b.t / b.dur);
    const c = canBox(L, b.target);
    const sx = L.cx + b.side * L.S * 0.7, sy = L.ground - L.S * 3.4;
    // A miss sails just over the top of the pyramid.
    const tx = c.x, ty = b.hit ? c.y - c.ch / 2 : c.y - c.ch * 3;
    const x = sx + (tx - sx) * k, y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * L.S * 1.6;
    const r = L.S * (0.32 - 0.2 * k);
    if (b.t > b.dur) continue;
    rect(ctx, x - r, y - r, r * 2, r * 2, '#ffffff');
    rect(ctx, x - r, y - r * 0.2, r * 2, r * 0.4, '#ff5d73');
  }
}

function pixelArrow(ctx, cx, cy, size, dir, color) {
  const c = size / 4;
  // Shaft then head, pointing left (-1) or right (+1).
  rect(ctx, cx - c * 1.5, cy - c * 0.5, c * 2, c, color);
  rect(ctx, cx + dir * c * 0.5 - c * 0.5, cy - c * 1.5, c, c * 3, color);
  rect(ctx, cx + dir * c * 1.5 - c * 0.5, cy - c * 0.5, c, c, color);
}

function drawBursts(ctx, L, p) {
  for (const e of p.fx) {
    if (e.type !== 'burst') continue;
    const k = e.t / e.life;
    const off = e.side === 'left' ? -1.2 : e.side === 'right' ? 1.2 : 0;
    const cx = L.cx + off * L.S, cy = L.ground - L.S * 2.55;
    for (const q of e.parts) {
      const d = q.sp * k * L.S * 2.4;
      const sz = Math.max(1, q.r * L.S * 1.6 * (1 - k * 0.5));
      rect(ctx, cx + Math.cos(q.a) * d, cy + Math.sin(q.a) * d + k * k * L.S * 2, sz, sz,
        q.r > 0.1 ? '#d08a3a' : '#ffe14d');
    }
  }
  for (const e of p.fx) {
    const k = e.t / e.life;
    if (e.type === 'confetti') {
      // Confetti pops up from the avatar and rains down.
      for (const q of e.parts) {
        const x = L.cx + (q.x + q.vx * e.t * 2.2) * L.S * 2, y = L.ground - L.S * 3 + (q.vy * e.t + 1.4 * e.t * e.t) * L.S * 3;
        const sz = Math.max(1, q.r * L.S * 1.4);
        rect(ctx, x, y, sz, sz * (Math.floor(e.t * 12 + q.x * 10) % 2 ? 1 : 0.5), q.c);
      }
    } else if (e.type === 'splash') {
      for (const q of e.parts) {
        const d = q.sp * k * L.S * 1.8;
        const sz = Math.max(1, q.r * L.S * 1.8);
        rect(ctx, L.cx + Math.cos(q.a) * d, L.ground - L.S * 0.3 - Math.abs(Math.sin(q.a)) * d * 1.5 + k * k * L.S * 2, sz, sz, q.r > 0.1 ? '#3f86d6' : '#bfe3ff');
      }
    }
  }
}

// ---------------- Avatars ----------------

// Neutral standing pose in torso units, hip centre at (0,0), y down.
// l/r here mean screen-left / screen-right.
const STAND = {
  nose: [0, -1.5], ls: [-0.38, -1], rs: [0.38, -1], le: [-0.5, -0.52], re: [0.5, -0.52],
  lw: [-0.52, -0.08], rw: [0.52, -0.08], lh: [-0.22, 0], rh: [0.22, 0],
  lk: [-0.24, 0.8], rk: [0.24, 0.8], la: [-0.24, 1.6], ra: [0.24, 1.6],
};

// Cartoon pose from a set of moves (keyboard mode, lobby previews).
export function cartoonPose(act = {}, bob = 0) {
  const P = Object.fromEntries(Object.entries(STAND).map(([k, v]) => [k, [...v]]));
  for (const k of ['nose', 'ls', 'rs', 'le', 're', 'lw', 'rw']) P[k][1] += bob;
  const dy = act.duck ? 0.8 : 0;
  if (act.duck) {
    for (const k of ['nose', 'ls', 'rs', 'le', 're', 'lw', 'rw', 'lh', 'rh']) P[k][1] += dy;
    P.lk = [-0.6, 1.0]; P.rk = [0.6, 1.0];
  }
  if (act.jump) { P.lk = [-0.32, 0.55]; P.rk = [0.32, 0.55]; P.la = [-0.28, 1.2]; P.ra = [0.28, 1.2]; }
  if (act.reach) {
    P.le = [-0.55, -1.65 + dy]; P.re = [0.55, -1.65 + dy]; P.lw = [-0.6, -2.2 + dy]; P.rw = [0.6, -2.2 + dy];
  }
  if (act.left) { P.le = [-0.9, -1 + dy]; P.lw = [-1.4, -1.05 + dy]; }
  if (act.right) { P.re = [0.9, -1 + dy]; P.rw = [1.4, -1.05 + dy]; }
  const lean = act.leanL ? -1 : act.leanR ? 1 : 0;
  if (lean) {
    // Bend at the hips: the higher up, the further it moves.
    for (const k of ['nose', 'ls', 'rs', 'le', 're', 'lw', 'rw']) P[k][0] += lean * 0.4 * -P[k][1];
  }
  return P;
}

// Real pose from the camera, relative to the kid's calibrated standing pose.
function cameraPose(p) {
  const B = p.base, pts = p.pts, t = B.torso;
  const g = i => [clamp((pts[i].x - B.hipX) / t, -2.2, 2.2), clamp((pts[i].y - B.hipY) / t, -2.6, 2)];
  // The image is mirrored, so the person's right side shows on screen-left.
  const P = {
    nose: g(LM.nose), ls: g(LM.rSh), rs: g(LM.lSh), le: g(LM.rEl), re: g(LM.lEl),
    lw: g(LM.rWr), rw: g(LM.lWr), lh: g(LM.rHip), rh: g(LM.lHip),
    lk: g(LM.rKn), rk: g(LM.lKn), la: g(LM.rAn), ra: g(LM.lAn),
  };
  // Legs are often out of frame: fall back to cartoon legs under the hips.
  const legsOk = Math.min(pts[LM.lKn].v, pts[LM.rKn].v, pts[LM.lAn].v, pts[LM.rAn].v) > 0.5;
  if (!legsOk) {
    const bend = clamp(P.lh[1] * 0.6, 0, 0.6);
    P.lk = [P.lh[0] - 0.05 - bend * 0.6, P.lh[1] + 0.8 - bend * 0.3];
    P.rk = [P.rh[0] + 0.05 + bend * 0.6, P.rh[1] + 0.8 - bend * 0.3];
    P.la = [P.lh[0] - 0.02, Math.max(P.lk[1] + 0.3, 1.6)];
    P.ra = [P.rh[0] + 0.02, Math.max(P.rk[1] + 0.3, 1.6)];
  }
  return P;
}

function drawAvatar(ctx, L, p, time, ch) {
  let P;
  if (p.pts && p.base) P = cameraPose(p);
  else P = cartoonPose(p.act, Math.sin(time * 8 + p.index) * 0.04);
  const S = L.S;
  let lift = p.lift * S * 0.9;
  let dx = 0;
  if (p.swing > 0) {
    // Tarzan swing over the puddle: an arc up and back down, hanging from a rope.
    const k = 1 - p.swing / 0.9;
    lift += Math.sin(k * Math.PI) * S * 1.8;
    dx = Math.sin(k * Math.PI * 2) * S * 0.6;
    if (!(p.pts && p.base)) P = cartoonPose({ reach: true, jump: true });
    const handY = L.ground - 1.65 * S - lift - 2.2 * S;
    ctx.strokeStyle = '#d9b16a';
    ctx.lineWidth = Math.max(2, S * 0.16);
    ctx.beginPath();
    ctx.moveTo(L.cx, 0);
    ctx.lineTo(L.cx + dx, handY);
    ctx.stroke();
  }
  const shake = p.bonk > 0 ? Math.sin(time * 60) * S * 0.1 * (p.bonk / 0.5) : 0;
  // Shadow stays on the ground.
  const sw = S * (1.3 - p.lift * 0.4);
  rect(ctx, L.cx - sw / 2, L.ground - S * 0.12, sw, S * 0.24, 'rgba(0,0,0,0.25)');
  const flash = p.bonk > 0 && Math.floor(time * 12) % 2 === 0;
  drawCharacter(ctx, L.cx + shake + dx, L.ground - 1.65 * S - lift, S, P, ch, flash);
}

// Draws a blocky character with hip centre at (ox, oy).
export function drawCharacter(ctx, ox, oy, S, P, ch, flash = false) {
  const X = v => ox + v[0] * S, Y = v => oy + v[1] * S;
  const body = flash ? '#ffffff' : ch.body;
  const limbCol = flash ? '#ffffff' : ch.limb;
  const limb = (a, b, c, w, col) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, w);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); ctx.lineTo(X(c), Y(c));
    ctx.stroke();
  };
  limb(P.lh, P.lk, P.la, S * 0.34, limbCol);
  limb(P.rh, P.rk, P.ra, S * 0.34, limbCol);
  for (const a of [P.la, P.ra]) rect(ctx, X(a) - S * 0.24, Y(a) - S * 0.08, S * 0.48, S * 0.2, '#2b2b33');

  // Torso as a quad between shoulders and hips.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(X(P.ls) - S * 0.08, Y(P.ls));
  ctx.lineTo(X(P.rs) + S * 0.08, Y(P.rs));
  ctx.lineTo(X(P.rh) + S * 0.1, Y(P.rh) + S * 0.12);
  ctx.lineTo(X(P.lh) - S * 0.1, Y(P.lh) + S * 0.12);
  ctx.closePath();
  ctx.fill();
  const cx = (X(P.ls) + X(P.rs) + X(P.lh) + X(P.rh)) / 4, cy = (Y(P.ls) + Y(P.rs) + Y(P.lh) + Y(P.rh)) / 4;
  rect(ctx, cx - S * 0.2, cy - S * 0.2, S * 0.4, S * 0.45, flash ? '#fff' : ch.belly);

  limb(P.ls, P.le, P.lw, S * 0.28, limbCol);
  limb(P.rs, P.re, P.rw, S * 0.28, limbCol);
  for (const w of [P.lw, P.rw]) rect(ctx, X(w) - S * 0.17, Y(w) - S * 0.17, S * 0.34, S * 0.34, flash ? '#fff' : ch.limb === ch.body ? shade(ch.body, 0.2) : ch.body);

  // Head: a cube sitting on the shoulders, following the nose.
  const neck = [(P.ls[0] + P.rs[0]) / 2, (P.ls[1] + P.rs[1]) / 2];
  const hcx = X([neck[0] * 0.4 + P.nose[0] * 0.6, 0]);
  const hcy = Math.min(Y(P.nose), Y(neck) - S * 0.45);
  drawHead(ctx, hcx, hcy, S, ch, flash);
}

function drawHead(ctx, x, y, S, ch, flash) {
  const hs = S * 1.0; // head size
  const left = x - hs / 2, top = y - hs / 2;
  const head = flash ? '#ffffff' : ch.head;
  const u = hs / 8; // head "pixel"
  const px = (i, j, w, h, c) => rect(ctx, left + i * u, top + j * u, w * u, h * u, c);

  // Things behind/above the head.
  if (ch.id === 'fox') { px(0, -2, 2, 2, ch.body); px(6, -2, 2, 2, ch.body); px(0, -2, 1, 1, '#3a2a20'); px(7, -2, 1, 1, '#3a2a20'); }
  if (ch.id === 'bunny') { px(1, -5, 2, 5, head); px(5, -5, 2, 5, head); px(1.5, -4.5, 1, 4, '#ffc4d6'); px(5.5, -4.5, 1, 4, '#ffc4d6'); }
  if (ch.id === 'panda') { px(-0.5, -1, 2.5, 2.5, '#2b2b33'); px(6, -1, 2.5, 2.5, '#2b2b33'); }
  if (ch.id === 'robot') { px(3.5, -3, 1, 3, '#6b788a'); px(3, -4, 2, 1.5, '#ff4d4d'); }
  if (ch.id === 'dino') { px(1, -1.5, 1.5, 1.5, '#ffd23f'); px(3.3, -2, 1.5, 2, '#ffd23f'); px(5.6, -1.5, 1.5, 1.5, '#ffd23f'); }

  block(ctx, left, top, hs, hs, head, 0.18);

  // Faces.
  const eye = (i, j) => { px(i, j, 1.4, 1.6, '#1b1b22'); px(i + 0.2, j + 0.2, 0.6, 0.6, '#ffffff'); };
  switch (ch.id) {
    case 'fox':
      px(1, 4.5, 6, 3.5, '#fff3e0'); eye(1.5, 3); eye(5.1, 3); px(3.5, 5, 1, 0.8, '#1b1b22');
      break;
    case 'frog':
      px(0, -1.6, 3, 2.4, head); px(5, -1.6, 3, 2.4, head);
      px(0.6, -1.2, 1.8, 1.8, '#ffffff'); px(5.6, -1.2, 1.8, 1.8, '#ffffff');
      px(1.1, -0.7, 0.9, 0.9, '#1b1b22'); px(6.1, -0.7, 0.9, 0.9, '#1b1b22');
      px(1.5, 5.2, 5, 0.7, '#1f6e2a');
      break;
    case 'robot':
      px(1, 2.5, 6, 2.5, '#203040'); px(1.6, 3.1, 1.6, 1.3, '#5be0ff'); px(4.8, 3.1, 1.6, 1.3, '#5be0ff');
      px(2, 6, 4, 0.8, '#6b788a');
      break;
    case 'bunny':
      eye(1.5, 3); eye(5.1, 3); px(3.4, 5, 1.2, 0.9, '#ff8fb1'); px(1, 5.5, 1, 0.8, '#ffc4d6'); px(6, 5.5, 1, 0.8, '#ffc4d6');
      break;
    case 'panda':
      px(1, 2.6, 2.4, 2.6, '#2b2b33'); px(4.6, 2.6, 2.4, 2.6, '#2b2b33');
      px(1.8, 3.2, 0.8, 0.8, '#ffffff'); px(5.4, 3.2, 0.8, 0.8, '#ffffff'); px(3.5, 5.6, 1, 0.8, '#2b2b33');
      break;
    case 'dino':
      eye(1.5, 2.8); eye(5.1, 2.8); px(1.5, 5.6, 5, 0.6, '#4a2a9a'); px(2.2, 6.2, 0.6, 0.6, '#ffffff'); px(5.2, 6.2, 0.6, 0.6, '#ffffff');
      break;
  }
}

// ---------------- HUD (full-res canvas) ----------------

export function text(ctx, str, x, y, size, color, align = 'center') {
  ctx.font = `bold ${R(size)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.strokeStyle = 'rgba(10,14,30,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function drawLaneHud(ctx, L, p, ch, opts) {
  const pad = clamp(L.w * 0.03, 8, 20);
  const fs = clamp(L.w * 0.07, 16, 40);

  // Name + score plate.
  ctx.fillStyle = 'rgba(10,14,30,0.55)';
  ctx.fillRect(L.x + pad, pad, L.w - pad * 2, fs * 2.7);
  ctx.fillStyle = p.color;
  ctx.fillRect(L.x + pad, pad, fs * 0.3, fs * 2.7);
  text(ctx, p.name, L.x + pad * 2 + fs * 0.3, pad + fs * 0.8, fs, '#ffffff', 'left');

  // Level bar (fills as they improve within the level).
  const by = pad + fs * 1.55, bh = fs * 0.75;
  const bx = L.x + pad * 2 + fs * 0.3, bw = (L.w - pad * 4) * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#ffe14d';
  ctx.fillRect(bx, by, Math.max(bh * 0.4, bw * (p.skill % 1)), bh);
  text(ctx, `LV ${p.level}`, bx + bh * 0.3, by + bh / 2, fs * 0.6, '#ffffff', 'left');
  if (p.streak >= 3) text(ctx, `x${p.streak}`, L.x + L.w - pad * 2, by + bh / 2, fs * 0.7, '#ffb02e', 'right');

  // Picture cue for the next obstacle, so non-readers know what to do.
  const next = p.obstacles
    .map(o => ({ o, z: (o.arrive - p.clock) / o.travel }))
    .filter(e => !e.o.result && e.z > -0.05 && e.z < 0.8)
    .sort((a, b) => a.z - b.z)[0];
  if (p.throwing) {
    const size = clamp(L.w * 0.1, 22, 64);
    const y = L.horizon * 0.66;
    const bob = Math.sin(performance.now() / 150) * size * 0.08;
    cueIcon(ctx, { kind: 'throw' }, L.cx, y - size * 0.3 + bob, size);
    text(ctx, 'THROW!', L.cx, y + size * 0.85, size * 0.62, '#ffb02e');
  } else if (next) {
    const k = 1 - next.z / 0.8;
    const info = KIND_INFO[next.o.kind];
    const size = clamp(L.w * 0.1, 22, 64) * (0.85 + 0.35 * k);
    const y = L.horizon * 0.66;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * k;
    cueIcon(ctx, next.o, L.cx, y - size * 0.3, size);
    text(ctx, info.word, L.cx, y + size * 0.85, size * 0.62, info.color);
    ctx.restore();
  }

  // Over-the-top score effects.
  for (const e of p.fx) {
    const k = e.t / e.life;
    if (e.type === 'kapow') {
      // Comic-book starburst with a big silly word.
      const pop = k < 0.12 ? k / 0.12 * 1.25 : k < 0.22 ? 1.25 - (k - 0.12) * 2.5 : 1;
      const r = Math.min(L.w * 0.3, L.h * 0.17) * pop;
      const cx = L.cx + Math.sin(e.hue) * L.w * 0.08, cy = L.horizon + L.depth * 0.22;
      ctx.save();
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.translate(cx, cy);
      ctx.rotate(e.rot + Math.sin(e.t * 30) * 0.04);
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, rr = i % 2 ? r * 0.62 : r;
        ctx.lineTo(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.85);
      }
      ctx.closePath();
      ctx.fillStyle = `hsl(${e.hue},100%,55%)`;
      ctx.fill();
      ctx.lineWidth = Math.max(3, r * 0.07);
      ctx.strokeStyle = '#1b1b22';
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + 0.13, rr = i % 2 ? r * 0.45 : r * 0.72;
        ctx.lineTo(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.85);
      }
      ctx.closePath();
      ctx.fillStyle = `hsl(${(e.hue + 50) % 360},100%,65%)`;
      ctx.fill();
      text(ctx, e.text, 0, 0, Math.min(r * 0.42, (r * 2.3) / Math.max(4, e.text.length) * 1.6), '#ffffff');
      ctx.restore();
      continue;
    }
    if (e.type === 'points') {
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      const hue = (e.t * 900) % 360;
      text(ctx, e.text, L.cx + L.w * 0.22, L.horizon + L.depth * 0.42 - k * L.h * 0.1, clamp(L.w * 0.11, 20, 60) * (1.3 - 0.3 * k), `hsl(${hue},100%,60%)`);
      ctx.restore();
      continue;
    }
    if (e.type === 'fire') {
      // Streak milestone: wobbling flame-coloured text and pixel flames.
      ctx.save();
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      const cols = ['#ff3b30', '#ff9f1c', '#ffe14d'];
      const size = clamp(L.w * 0.13, 24, 80) * (1 + 0.08 * Math.sin(e.t * 20));
      text(ctx, e.text, L.cx + Math.sin(e.t * 25) * 4, L.h * 0.5, size, cols[Math.floor(e.t * 12) % 3]);
      const fw = L.w / 14;
      for (let i = 0; i < 14; i++) {
        const fh = (0.5 + 0.5 * Math.abs(Math.sin(e.t * 9 + i * 1.7))) * L.h * 0.12;
        ctx.fillStyle = cols[i % 3];
        ctx.fillRect(R(L.x + i * fw), R(L.h - fh), R(fw * 0.8), R(fh));
      }
      ctx.restore();
      continue;
    }
    if (e.type === 'levelup') {
      ctx.save();
      if (k < 0.25) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - k / 0.25)})`;
        ctx.fillRect(L.x, 0, L.w, L.h);
      }
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      const cy = L.h * 0.36;
      ctx.translate(L.cx, cy);
      ctx.rotate(e.t * 1.5);
      ctx.fillStyle = 'rgba(255,225,77,0.35)';
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(0, -L.w * 0.03, L.w * 0.6, L.w * 0.06);
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      text(ctx, e.text, L.cx, cy, clamp(L.w * 0.12, 22, 70) * (k < 0.15 ? 0.5 + k / 0.3 : 1), '#ffe14d');
      ctx.restore();
      continue;
    }
    if (e.type !== 'text') continue;
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    text(ctx, e.text, L.cx, L.horizon + L.depth * 0.2 - k * L.h * 0.08, clamp(L.w * 0.12, 22, 64) * (1 + 0.25 * (1 - k)), e.color);
    ctx.restore();
  }

  drawBubble(ctx, L, p);

  if (p.paused) text(ctx, p.paused, L.cx, L.h * 0.5, clamp(L.w * 0.075, 18, 44), '#ffffff');

  if (opts.debug) {
    const a = p.act;
    const on = ['jump', 'left', 'right', 'reach', 'leanL', 'leanR', 'throw'].filter(k => a[k]).join(' ') || '-';
    ctx.font = `${R(fs * 0.5)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(`skill ${p.skill.toFixed(2)}  ${on}`, L.x + pad * 2, by + bh + fs * 0.6);
    ctx.fillText(`hit ${p.hits}  miss ${p.misses}`, L.x + pad * 2, by + bh + fs * 1.2);
  }
}

// Face bubble in the lane's bottom corner: score as a notification badge,
// heart rate underneath (filled in after the heart check).
function drawBubble(ctx, L, p) {
  const r = clamp(Math.min(L.w * 0.11, L.h * 0.065), 22, 70);
  const x = L.x + r + clamp(L.w * 0.04, 8, 24), y = L.h - r - L.h * 0.07;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  if (p.faceImg?.complete && p.faceImg.naturalWidth) {
    ctx.save();
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(p.faceImg, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  } else {
    text(ctx, String(p.index + 1), x, y, r, '#ffffff');
  }
  ctx.lineWidth = Math.max(3, r * 0.12);
  ctx.strokeStyle = p.color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

  // Notification badge with the score.
  const label = p.score >= 10000 ? `${Math.round(p.score / 1000)}k` : p.score.toLocaleString();
  const bf = r * 0.48;
  ctx.font = `bold ${R(bf)}px ${FONT}`;
  const bw = Math.max(bf * 1.6, ctx.measureText(label).width + bf * 0.9), bh = bf * 1.45;
  const bx = x + r * 0.55, by = y - r * 1.05;
  ctx.fillStyle = '#ff3b30';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, bf * 0.12);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, bh / 2) : ctx.rect(bx, by, bw, bh);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + bw / 2, by + bh / 2 + 1);

  // Heart rate slot.
  text(ctx, `♥ ${p.heartRate ? p.heartRate : '--'}`, x, y + r + r * 0.42, r * 0.5, '#ff6b81');
  ctx.restore();
}

// Chunky icon drawn at full res (squares, so it matches the world).
function cueIcon(ctx, o, x, y, size) {
  const c = size / 5;
  const sq = (i, j, col) => { ctx.fillStyle = col; ctx.fillRect(R(x + (i - 2.5) * c), R(y + (j - 2.5) * c), R(c) + 1, R(c) + 1); };
  const draw = (rows, col) => rows.forEach((r, j) => [...r].forEach((ch, i) => ch === '#' && sq(i, j, col)));
  const outline = (rows) => {
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,30,0.85)';
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '#') ctx.fillRect(R(x + (i - 2.5) * c - c * 0.25), R(y + (j - 2.5) * c - c * 0.25), R(c * 1.5), R(c * 1.5));
    }));
    ctx.restore();
  };
  const UP = ['..#..', '.###.', '#####', '.###.', '.###.'];
  const LEFT = ['..#..', '.##..', '#####', '.##..', '..#..'];
  const RIGHT = LEFT.map(r => [...r].reverse().join(''));
  const BOTH = ['.#.#.', '##.##', '#####', '##.##', '.#.#.'];
  const HANDS = ['#...#', '#...#', '#.#.#', '.###.', '..#..'];
  const BALL = ['.###.', '#####', '#####', '#####', '.###.'];
  const color = o.kind === 'throw' ? '#ffb02e' : KIND_INFO[o.kind].color;
  let rows;
  if (o.kind === 'log') rows = UP;
  else if (o.kind === 'rope') rows = HANDS;
  else if (o.kind === 'throw') rows = BALL;
  else if (o.kind === 'bird') rows = o.side === 'left' ? RIGHT : LEFT; // lean away from the bird
  else rows = o.side === 'left' ? LEFT : o.side === 'right' ? RIGHT : BOTH;
  outline(rows);
  draw(rows, color);
}

// ---------------- Camera view ----------------

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];

// Draws the mirrored camera image fitted into (x, y, w, h), plus skeletons.
// people: [{ pts, color, label }]
export function drawCamera(ctx, video, aspect, x, y, w, h, people) {
  if (!video.videoWidth) return null;
  let dw = w, dh = w / aspect;
  if (dh > h) { dh = h; dw = h * aspect; }
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  ctx.save();
  ctx.translate(dx + dw, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, dw, dh);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeRect(dx, dy, dw, dh);
  for (const person of people) {
    const pts = person.pts;
    ctx.strokeStyle = person.color;
    ctx.lineWidth = Math.max(3, dh * 0.012);
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      if (pts[a].v < 0.3 || pts[b].v < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(dx + pts[a].x * dh, dy + pts[a].y * dh);
      ctx.lineTo(dx + pts[b].x * dh, dy + pts[b].y * dh);
      ctx.stroke();
    }
    if (person.label) {
      const n = pts[0];
      text(ctx, person.label, dx + n.x * dh, dy + Math.max(n.y * dh - dh * 0.1, dh * 0.05), Math.max(16, dh * 0.06), person.color);
    }
  }
  return { dx, dy, dw, dh };
}
