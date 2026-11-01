// Drawing. The world is painted onto a small low-resolution canvas and scaled
// up with smoothing off, which gives the chunky pixel look. Text and HUD are
// drawn on top at full resolution so they stay crisp and readable.
import { LM, tuning } from './game.js';
import { MINI, DANCE, CITY_X } from './minigames.js';
import { posesFor, wyrImage, askLeft } from './wyr.js';

// How high (in lane heights) the sky view pans when a kid flies all the way up.
const SKY_PAN = 0.38;

// Notch / Dynamic Island insets in HUD canvas pixels (main.js keeps them up to date).
export const SAFE = { l: 0, r: 0 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// The same chunky rounded display font as the menus (loaded in index.html).
const FONT = '"Lilita One", "Trebuchet MS", "Avenir Next", system-ui, sans-serif';

export const CHARACTERS = [
  { id: 'fox', name: 'Fox', body: '#ff8a2a', limb: '#e0661a', head: '#ff8a2a', belly: '#fff3e0' },
  { id: 'frog', name: 'Frog', body: '#4cc94c', limb: '#2f9e3a', head: '#4cc94c', belly: '#c9f5a8' },
  { id: 'robot', name: 'Robot', body: '#9aa7b8', limb: '#6b788a', head: '#b8c4d4', belly: '#5be0ff' },
  { id: 'bunny', name: 'Bunny', body: '#f4f4f8', limb: '#d8d8e4', head: '#f4f4f8', belly: '#ffc4d6' },
  { id: 'panda', name: 'Panda', body: '#2b2b33', limb: '#2b2b33', head: '#f8f8f8', belly: '#f8f8f8' },
  { id: 'dino', name: 'Dino', body: '#9b6bff', limb: '#7444d8', head: '#9b6bff', belly: '#e2d4ff' },
  { id: 'ninja', name: 'Ninja', body: '#2b2b3a', limb: '#1f1f2a', head: '#2b2b3a', belly: '#e63946' },
  { id: 'hedgehog', name: 'Hedgehog', body: '#3f7fe0', limb: '#2f62b8', head: '#3f7fe0', belly: '#f5e2c0' },
  { id: 'axolotl', name: 'Axolotl', body: '#ff9ec7', limb: '#f27fb0', head: '#ff9ec7', belly: '#ffd6e8' },
  { id: 'firefighter', name: 'Firefighter', body: '#e8a92a', limb: '#d4951c', head: '#ffd2a8', belly: '#e8a92a', hand: '#3a3a44', stripes: true },
  { id: 'cow', name: 'Cow', body: '#f8f8f8', limb: '#2b2b33', head: '#f8f8f8', belly: '#ffc4d6' },
  { id: 'cat', name: 'Ginger Cat', body: '#f08a3c', limb: '#d9702a', head: '#f08a3c', belly: '#fff1e0' },
  { id: 'berner', name: 'Bernese Dog', body: '#2a2a32', limb: '#2a2a32', head: '#2a2a32', belly: '#ffffff', hand: '#c8692c' },
];

export const THEMES = {
  forest: { name: 'Forest', sky: ['#5ec8f2', '#c8f0ff'], grass: ['#6cc644', '#5fb83b'], road: ['#d9b980', '#cfad70'], edge: '#a8864e', prop: 'pine', cloud: '#ffffff' },
  snow: { name: 'Snow', sky: ['#8fb8de', '#e8f4ff'], grass: ['#f2f7fb', '#e3edf5'], road: ['#a9c7e0', '#9dbcd6'], edge: '#7a9cba', prop: 'snowpine', cloud: '#ffffff' },
  desert: { name: 'Desert', sky: ['#ff9e5e', '#ffe0a3'], grass: ['#f2cf7a', '#e8c36a'], road: ['#c98e52', '#bf8448'], edge: '#9a6534', prop: 'cactus', cloud: '#fff4e0' },
  space: { name: 'Space', sky: ['#0b0b2a', '#3a1e6e'], grass: ['#3b3561', '#332e56'], road: ['#6a5fa8', '#5f549c'], edge: '#9d8cff', prop: 'crystal', cloud: '#ffffff', stars: true },
  beach: { name: 'Beach', sky: ['#3fb6f0', '#b8ecff'], grass: ['#f6dfa0', '#eed291'], road: ['#c9935a', '#bd8850'], edge: '#8a5a2e', prop: 'palm', cloud: '#ffffff', sea: true },
  candy: { name: 'Candy', sky: ['#ff9fd6', '#ffe4f4'], grass: ['#a5ecc9', '#93e0b9'], road: ['#fff1d2', '#ffe4b3'], edge: '#ff5fa2', prop: 'lollipop', cloud: '#ffffff' },
  spooky: { name: 'Spooky', sky: ['#1b1033', '#5a2a6c'], grass: ['#34502e', '#2c4628'], road: ['#6e5c4a', '#625240'], edge: '#ff8c1a', prop: 'pumpkin', cloud: '#c9c3e6', stars: true, moon: true },
};

const KIND_INFO = {
  log: { word: 'JUMP!', color: '#ffb02e' },
  crate: { word: 'PUNCH!', color: '#ffe14d' },
  bird: { word: 'DUCK!', color: '#ff5d73' },
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
// Characters are smooth outlined cartoons drawn at full resolution (the world
// stays pixel art). While one is drawn, VEC is on and rect() makes rounded
// shapes instead of pixel blocks; in the 'outline' pass it only strokes the
// dark silhouette, so overlapping parts share one clean outline.
let VEC = 0, RMODE = 'fill', OLW = 1;
const INK = '#1a2a40';
function rect(ctx, x, y, w, h, color) {
  if (VEC) {
    roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.08);
    if (RMODE === 'outline') { ctx.lineWidth = OLW * 2; ctx.strokeStyle = INK; ctx.stroke(); }
    else { ctx.fillStyle = color; ctx.fill(); }
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)));
}

// Where characters go: drawn later on their own sharp canvas (see main.js),
// between the pixel world behind the runner and the bits that pass in front.
export const LAYERS = { world: null, front: null, queue: null };
function queueCharacter(ctx, clip, ...args) {
  if (LAYERS.queue && ctx.canvas === LAYERS.world) LAYERS.queue.push({ m: ctx.getTransform(), alpha: ctx.globalAlpha, clip, args });
  else drawCharacter(ctx, ...args);
}
export function queueLobbyCharacter(ctx, ...args) { queueCharacter(ctx, null, ...args); }
// k: character-canvas pixels per world pixel.
export function flushCharacters(cctx, k) {
  const q = LAYERS.queue || [];
  for (const it of q) {
    cctx.save();
    // Always restore, even if one character fails to draw: a left-over clip
    // would otherwise stay on this canvas for good, cutting every later
    // character off at that lane's edge (half a kid, or a missing one)
    // until the page was reloaded.
    try {
      cctx.setTransform(k, 0, 0, k, 0, 0);
      if (it.clip) { cctx.beginPath(); cctx.rect(it.clip.x, 0, it.clip.w, it.clip.h); cctx.clip(); }
      const m = it.m;
      cctx.setTransform(k * m.a, k * m.b, k * m.c, k * m.d, k * m.e, k * m.f);
      cctx.globalAlpha = it.alpha;
      drawCharacter(cctx, ...it.args);
    } catch (e) {
      if (!flushCharacters.warned) { flushCharacters.warned = true; console.error(e); }
    } finally { cctx.restore(); }
  }
  q.length = 0;
}

// A block with a lighter top face, so it reads as a cube.
function block(ctx, x, y, w, h, color, top = 0.28) {
  const t = Math.max(1, h * top);
  rect(ctx, x, y + t, w, h - t, color);
  rect(ctx, x, y, w, t, shade(color, 0.16));
  rect(ctx, x, y + h - Math.max(1, h * 0.1), w, Math.max(1, h * 0.1), shade(color, -0.18));
}

// A soft oval shadow on the ground, built from pixel rows so it stays on the grid.
function shadow(ctx, cx, y, w, h, alpha = 0.2) {
  const rows = Math.max(1, R(h));
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let i = 0; i < rows; i++) {
    const k = (i + 0.5) / rows * 2 - 1;
    const hw = R(w / 2 * Math.sqrt(1 - k * k));
    if (hw > 0) ctx.fillRect(R(cx) - hw, R(y - h / 2) + i, hw * 2, 1);
  }
}

// A filled polygon (convex), one pixel row at a time: no blurred edges.
function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  const ys = pts.map(p => p[1]);
  const y0 = R(Math.min(...ys)), y1 = R(Math.max(...ys));
  for (let y = y0; y < y1; y++) {
    const yc = y + 0.5;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((yc < ay) === (yc < by)) continue;
      const x = ax + (yc - ay) / (by - ay) * (bx - ax);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
    if (hi > lo) ctx.fillRect(R(lo), y, Math.max(1, R(hi) - R(lo)), 1);
  }
}

// A thick straight line stamped out of square blocks that snap to the grid,
// so rotated arms and legs stay crisp pixel art.
function pixLine(ctx, x0, y0, x1, y1, w, color) {
  ctx.fillStyle = color;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const s = Math.max(1, R(w)), h = s / 2;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    ctx.fillRect(R(x - h), R(y - h), s, s);
  }
}

// ---------------- World (low-res canvas) ----------------

export function drawLaneWorld(ctx, L, p, time, character, theme = THEMES.forest) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x, 0, L.w, L.h);
  ctx.clip();
  if (p.shake > 0) ctx.translate(R(Math.sin(time * 90) * L.S * 0.18 * p.shake / 0.3), R(Math.cos(time * 70) * L.S * 0.12 * p.shake / 0.3));

  // Bubble time: the view follows the kid up into the sky.
  const B = p.throwing?.type === 'bubbles' ? p.throwing : null;
  const C = p.throwing?.type === 'climb' || p.throwing?.type === 'fly' ? p.throwing : null;
  let pan = 0;
  if (C) {
    // Beanstalk: the world slides down as the kid climbs.
    pan = C.pan * L.S * 0.9;
    rect(ctx, L.x, 0, L.w, L.h, theme.sky[0]);
    ctx.translate(0, R(pan));
    for (let c = 0; c < 6; c++) {
      const u = L.S * 0.4, cy = -((c * 0.37 * L.h + 0.2 * L.h) % (L.h * 4));
      const cx = L.x + ((c * 0.41 + time * 0.02) % 1.2) * L.w - L.w * 0.1;
      rect(ctx, cx, cy, u * 5, u * 1.2, theme.cloud);
    }
  }
  if (B) {
    // Follow the kid up, and keep the bubble they're aiming for in view.
    let want = B.alt * L.h * SKY_PAN;
    if (B.bubble && !B.falling) want = Math.max(want, Math.min(L.h * 0.1, L.h * 0.2 + L.S - bubbleY(L, B.bubble.h)));
    B.pan = B.pan == null ? want : B.pan + (want - B.pan) * 0.12;
    pan = B.pan;
  }
  if (B) {
    rect(ctx, L.x, 0, L.w, L.h, mix(shade(theme.sky[0], -0.08), shade(theme.sky[0], 0), 0.5));
    ctx.translate(0, R(pan));
    // High clouds drift by as they climb.
    for (let c = 0; c < 5; c++) {
      const u = L.S * 0.4;
      const cx = L.x + ((c * 0.37 + time * 0.03 * (1 + c % 2)) % 1.3) * L.w - L.w * 0.15;
      const cy = -L.h * SKY_PAN * (c + 0.5) / 5;
      rect(ctx, cx, cy, u * 5, u * 1.2, theme.cloud);
      rect(ctx, cx + u, cy - u, u * 3, u, theme.cloud);
    }
  }

  // Sky in flat bands.
  const top = shade(theme.sky[0], 0), bottom = shade(theme.sky[1], 0);
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const k = b / (bands - 1);
    ctx.fillStyle = mix(top, bottom, k);
    ctx.fillRect(L.x, R((L.horizon * b) / bands), L.w, R(L.horizon / bands) + 1);
  }
  if (theme.moon) {
    const m = L.S * 0.7, mx = L.x + L.w * 0.72, my = L.horizon * 0.28;
    rect(ctx, mx - m / 2, my - m / 2, m, m, '#fff4c2');
    rect(ctx, mx - m * 0.65, my - m * 0.3, m * 1.3, m * 0.6, '#fff4c2');
    rect(ctx, mx - m * 0.3, my - m * 0.65, m * 0.6, m * 1.3, '#fff4c2');
    rect(ctx, mx + m * 0.05, my - m * 0.15, m * 0.2, m * 0.2, '#e8d890');
  }
  if (theme.stars) {
    for (let k = 0; k < 9; k++) {
      const sx = L.x + ((k * 37 + p.index * 13) % 100) / 100 * L.w, sy = ((k * 53) % 90) / 100 * L.horizon;
      rect(ctx, sx, sy, Math.max(1, L.S * 0.08), Math.max(1, L.S * 0.08), Math.sin(time * 3 + k) > 0 ? '#ffffff' : '#9d8cff');
    }
  }
  if (theme.sea) {
    const sh = L.horizon * 0.12, top = L.horizon - sh;
    // Far-off islands and a little sailboat break up the flat horizon line.
    const isl = (fx, w, h, col) => {
      const cx = L.x + fx * L.w, rows = Math.max(2, R(h));
      for (let i = 0; i < rows; i++) {
        const k = 1 - (i + 1) / rows, hw = R(w / 2 * Math.sqrt(1 - k * k) * (0.55 + 0.45 * (i + 1) / rows));
        rect(ctx, cx - hw, top - rows + i + 1, hw * 2, 1, col);
      }
    };
    isl(0.18 + p.index * 0.07, L.S * 2.4, sh * 0.55, '#6fa9c4');
    isl(0.3 + p.index * 0.07, L.S * 1.2, sh * 0.35, '#86bcd2');
    isl(0.82 - p.index * 0.05, L.S * 1.8, sh * 0.4, '#79b2cb');
    rect(ctx, L.x, top, L.w, sh + 1, '#1f8fd6');
    rect(ctx, L.x, top, L.w, Math.max(1, sh * 0.14), '#3aa6e6');
    const bx = L.x + ((0.62 + time * 0.006 + p.index * 0.21) % 1.2 - 0.1) * L.w, bu = Math.max(1, L.S * 0.12);
    rect(ctx, bx - bu * 2, top - bu * 0.5, bu * 4, bu, '#8a5a2e');
    fillPoly(ctx, [[bx, top - bu * 5], [bx, top - bu * 0.6], [bx + bu * 2.6, top - bu * 0.6]], '#ffffff');
    fillPoly(ctx, [[bx - bu * 0.4, top - bu * 3.6], [bx - bu * 0.4, top - bu * 0.6], [bx - bu * 1.8, top - bu * 0.6]], '#ffe14d');
    for (let k = 0; k < 6; k++) {
      const wx = L.x + (((k * 0.19 + time * 0.03) % 1.1) - 0.05) * L.w;
      rect(ctx, wx, top + sh * (0.3 + 0.3 * (k % 2)), L.S * (0.4 + 0.2 * (k % 3)), Math.max(1, sh * 0.1), '#bfe8ff');
    }
    // Cream foam where the sea meets the sand, washing gently in and out.
    const fh = Math.max(1, R(sh * 0.16)), seg = Math.max(2, R(L.S * 0.5));
    rect(ctx, L.x, L.horizon - fh, L.w, fh + 1, '#fff6dc');
    for (let x = L.x - seg * 2, i = 0; x < L.x + L.w; x += seg, i++) {
      const up = Math.sin(time * 1.6 + i * 0.9) > 0.2 ? fh : 0;
      if (up) rect(ctx, x + ((time * 6) % seg), L.horizon - fh - up, seg * 0.6, up, '#fffaf0');
    }
  }
  // Blocky clouds drifting.
  for (let c = 0; c < 2; c++) {
    const cx = L.x + ((c * 0.55 + time * 0.012 * (c + 1) + p.index * 0.3) % 1.2) * L.w - L.w * 0.1;
    const cy = L.horizon * (0.5 + 0.22 * c);
    const u = L.S * 0.35;
    ctx.globalAlpha = theme.stars ? 0.25 : 1;
    rect(ctx, cx, cy, u * 4, u, theme.cloud);
    rect(ctx, cx + u, cy - u, u * 2, u, theme.cloud);
    ctx.globalAlpha = 1;
  }

  // Ground rows that scroll toward the player.
  const speed = 1 / tuning(p.paceSkill ?? p.skill).travel;
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
    // Road tiles: two tones, one pixel row at a time so the edges step
    // like the sprites instead of blurring.
    ctx.fillStyle = theme.road[odd ? 0 : 1];
    for (let y = R(a.y); y <= R(b.y); y++) {
      const h = R(roadHalf(L, y + 0.5));
      ctx.fillRect(R(L.cx) - h, y, h * 2, 1);
    }
  }
  // Road edges: a stepped kerb, darker on the outside.
  const ew = Math.max(1, R(L.S * 0.08));
  ctx.fillStyle = theme.edge;
  for (let y = R(L.horizon); y < L.h; y++) {
    const h = R(roadHalf(L, y + 0.5)), w = Math.max(1, R(ew * (0.6 + 0.6 * (y - L.horizon) / L.depth)));
    ctx.fillRect(R(L.cx) - h - w, y, w, 1);
    ctx.fillRect(R(L.cx) + h, y, w, 1);
  }

  // Things in depth order: trees, obstacles, the avatar.
  const items = [];
  const treeGap = 0.3, treeOff = dist % treeGap;
  for (let k = -1; k < 5; k++) {
    const z = k * treeGap - treeOff + 0.12;
    if (z > 1 || z < -0.15 || p.throwing?.type === 'swim') continue;
    items.push({ z, draw: () => drawTree(ctx, L, z, (k + Math.floor(dist / treeGap)) & 1 ? -1 : 1, theme.prop) });
  }
  for (const o of p.obstacles) {
    const z = (o.arrive - p.clock) / o.travel;
    if (z <= 1.02) items.push({ z, draw: () => drawObstacle(ctx, L, o, z) });
  }
  const T = p.throwing;
  if (C?.type === 'climb') items.push({ z: 0.02, draw: () => drawVine(ctx, L, C, pan) });
  // Water over the swimmer's legs.
  if (T?.type === 'swim') items.push({ z: -0.2, draw: () => {
    const wy = L.ground - L.S * 1.1 + Math.sin(time * 4) * L.S * 0.05;
    rect(ctx, L.x, wy, L.w, L.h - wy, 'rgba(47,134,214,0.92)');
    rect(ctx, L.x, wy, L.w, Math.max(1, L.S * 0.08), '#bfe3ff');
    if (T.splash > 0) for (let i = 0; i < 6; i++) rect(ctx, L.cx + (i - 2.5) * L.S * 0.35, wy - L.S * (0.2 + 0.5 * T.splash) - (i % 2) * L.S * 0.2, L.S * 0.15, L.S * 0.15, '#e6f4ff');
  } });
  // The pond sits under everything; other break props draw over the kid.
  if (T && MINI.includes(T.type)) items.push({ z: T.type === 'swim' ? 1.5 : 0.01, draw: () => drawMini(ctx, L, p, T, time) });
  else if (T && T.type !== 'bubbles') {
    items.push(T.type === 'karate' ? { z: KARATE_Z, draw: () => drawBoards(ctx, L, T) }
      : T.type === 'fire' ? { z: TOWER_Z, draw: () => drawHouse(ctx, L, T, time) }
      : { z: TOWER_Z, draw: () => drawTower(ctx, L, T) });
  }
  // Everything after the runner (things passing in front, splashes, balls)
  // goes on the front world layer, above the character layer.
  const back = ctx, front = LAYERS.front && ctx.canvas === LAYERS.world ? LAYERS.front : null;
  const toFront = () => {
    if (!front) return;
    const m = ctx.getTransform();
    front.save();
    front.beginPath(); front.rect(L.x, 0, L.w, L.h); front.clip();
    front.setTransform(m);
    ctx = front;
  };
  items.push({ z: 0.015, draw: () => { drawAvatar(ctx, L, p, time, character); toFront(); } });
  items.sort((a, b) => b.z - a.z).forEach(it => it.draw());
  if (T?.balls) drawBalls(ctx, L, T);
  if (B) drawBubbles(ctx, L, B, time);
  if (T?.type === 'fire' && T.on) drawWater(ctx, L, T, time);

  drawBursts(ctx, L, p);

  if (p.paused) {
    ctx.fillStyle = 'rgba(10,15,35,0.55)';
    ctx.fillRect(L.x, 0, L.w, L.h);
  }
  ctx.restore();
  if (ctx !== back) { back.restore(); ctx = back; }
  // Lane divider (above the runners).
  rect(front || ctx, L.x + L.w - 1, 0, 2, L.h, '#1b2340');
}

function mix(a, b, k) {
  const pa = a.match(/\d+/g).map(Number), pb = b.match(/\d+/g).map(Number);
  return `rgb(${pa.map((v, i) => R(v + (pb[i] - v) * k)).join(',')})`;
}

function drawTree(ctx, L, z, side, prop) {
  const { y, s } = project(L, z);
  const u = L.S * s;
  const x = L.cx + side * (roadHalf(L, y) + u * 0.9);
  shadow(ctx, x + side * u * 0.15, y, u * (prop === 'palm' || prop === 'pine' || prop === 'snowpine' ? 1.9 : 1.5), Math.max(1, u * 0.32));
  if (prop === 'cactus') {
    block(ctx, x - u * 0.25, y - u * 2.2, u * 0.5, u * 2.2, '#3f9e4a', 0.08);
    block(ctx, x - u * 0.75, y - u * 1.6, u * 0.3, u * 0.7, '#3f9e4a', 0.15);
    rect(ctx, x - u * 0.75, y - u * 1.0, u * 0.5, u * 0.25, '#3f9e4a');
    block(ctx, x + u * 0.45, y - u * 1.9, u * 0.3, u * 0.8, '#3f9e4a', 0.15);
    rect(ctx, x + u * 0.25, y - u * 1.2, u * 0.5, u * 0.25, '#3f9e4a');
    return;
  }
  if (prop === 'palm') {
    const trunk = '#9a6a3a';
    for (let k = 0; k < 4; k++) rect(ctx, x - u * 0.18 + side * k * u * 0.06, y - u * (0.8 + k * 0.7), u * 0.36, u * 0.75, k % 2 ? trunk : shade(trunk, -0.08));
    const tx = x + side * u * 0.2, ty = y - u * 3.0;
    block(ctx, tx - u * 1.1, ty, u * 2.2, u * 0.35, '#2fa84f', 0.3);
    block(ctx, tx - u * 0.6, ty - u * 0.35, u * 1.2, u * 0.4, '#3cbf5c', 0.3);
    rect(ctx, tx - u * 1.3, ty + u * 0.3, u * 0.35, u * 0.35, '#2fa84f');
    rect(ctx, tx + u * 0.95, ty + u * 0.3, u * 0.35, u * 0.35, '#2fa84f');
    rect(ctx, tx - u * 0.25, ty + u * 0.35, u * 0.22, u * 0.22, '#6b4423');
    rect(ctx, tx + u * 0.05, ty + u * 0.4, u * 0.22, u * 0.22, '#6b4423');
    return;
  }
  if (prop === 'lollipop') {
    const c = side < 0 ? '#ff4f8b' : '#7a5cff';
    rect(ctx, x - u * 0.08, y - u * 2.0, u * 0.16, u * 2.0, '#ffffff');
    block(ctx, x - u * 0.7, y - u * 3.2, u * 1.4, u * 1.3, c, 0.15);
    rect(ctx, x - u * 0.45, y - u * 2.95, u * 0.9, u * 0.2, '#ffffff');
    rect(ctx, x - u * 0.45, y - u * 2.55, u * 0.9, u * 0.2, '#ffffff');
    rect(ctx, x - u * 0.15, y - u * 2.75, u * 0.3, u * 0.2, shade(c, 0.2));
    return;
  }
  if (prop === 'pumpkin') {
    if (side < 0) {
      block(ctx, x - u * 0.6, y - u * 0.9, u * 1.2, u * 0.9, '#ff8c1a', 0.15);
      rect(ctx, x - u * 0.25, y - u * 0.88, u * 0.08, u * 0.8, '#d96a00');
      rect(ctx, x + u * 0.17, y - u * 0.88, u * 0.08, u * 0.8, '#d96a00');
      rect(ctx, x - u * 0.08, y - u * 1.15, u * 0.16, u * 0.3, '#3f7a2a');
      rect(ctx, x - u * 0.4, y - u * 0.65, u * 0.2, u * 0.18, '#ffe14d');
      rect(ctx, x + u * 0.2, y - u * 0.65, u * 0.2, u * 0.18, '#ffe14d');
      rect(ctx, x - u * 0.3, y - u * 0.35, u * 0.6, u * 0.12, '#ffe14d');
    } else {
      block(ctx, x - u * 0.45, y - u * 1.4, u * 0.9, u * 1.4, '#8a8aa0', 0.12);
      rect(ctx, x - u * 0.3, y - u * 1.6, u * 0.6, u * 0.25, '#8a8aa0');
      rect(ctx, x - u * 0.05, y - u * 1.2, u * 0.1, u * 0.55, '#5c5c70');
      rect(ctx, x - u * 0.22, y - u * 1.05, u * 0.44, u * 0.1, '#5c5c70');
    }
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

// The crazy bird, centred on (bx, by), b pixels across. mood: null (on its way,
// cross), 'mad' (red in the face, steaming) or 'laugh' (eyes shut, beak open).
function drawBird(ctx, bx, by, b, flap, mood) {
  const body = mood === 'mad' ? '#ff2a3d' : '#ff5d73', wing = mood === 'mad' ? '#a8102a' : '#c9304a';
  block(ctx, bx - b / 2, by - b / 2, b, b * 0.85, body, 0.2);                 // body
  rect(ctx, bx - b * 0.15, by + b * 0.05, b * 0.3, b * 0.25, '#ffd0d8');      // belly
  rect(ctx, bx - b * 0.75, by - b * (flap ? 0.55 : 0.05), b * 0.3, b * 0.45, wing); // wings
  rect(ctx, bx + b * 0.45, by - b * (flap ? 0.55 : 0.05), b * 0.3, b * 0.45, wing);
  if (mood === 'laugh') {
    // Squeezed-shut eyes, a wide open beak, and happy tears.
    rect(ctx, bx - b * 0.32, by - b * 0.2, b * 0.24, b * 0.07, '#1b1b22');
    rect(ctx, bx + b * 0.08, by - b * 0.2, b * 0.24, b * 0.07, '#1b1b22');
    rect(ctx, bx - b * 0.36, by - b * 0.08, b * 0.08, b * 0.14, '#7df9ff');
    rect(ctx, bx + b * 0.28, by - b * 0.08, b * 0.08, b * 0.14, '#7df9ff');
    rect(ctx, bx - b * 0.14, by - b * 0.06, b * 0.28, b * 0.1, '#ffb02e');    // top beak
    rect(ctx, bx - b * 0.1, by + b * 0.04, b * 0.2, b * 0.12, '#7a1020');     // open mouth
    rect(ctx, bx - b * 0.12, by + b * 0.16, b * 0.24, b * 0.08, '#ffb02e');   // bottom beak
  } else {
    rect(ctx, bx - b * 0.3, by - b * 0.25, b * 0.2, b * 0.22, '#ffffff');    // eyes
    rect(ctx, bx + b * 0.1, by - b * 0.25, b * 0.2, b * 0.22, '#ffffff');
    rect(ctx, bx - b * 0.24, by - b * 0.19, b * 0.1, b * 0.12, '#1b1b22');
    rect(ctx, bx + b * 0.16, by - b * 0.19, b * 0.1, b * 0.12, '#1b1b22');
    // Angry brows, steeper when it's mad.
    const tilt = mood === 'mad' ? 0.1 : 0;
    rect(ctx, bx - b * 0.35, by - b * (0.36 + tilt), b * 0.14, b * 0.07, '#1b1b22');
    rect(ctx, bx - b * 0.21, by - b * 0.36, b * 0.14, b * 0.07, '#1b1b22');
    rect(ctx, bx + b * 0.07, by - b * 0.36, b * 0.14, b * 0.07, '#1b1b22');
    rect(ctx, bx + b * 0.21, by - b * (0.36 + tilt), b * 0.14, b * 0.07, '#1b1b22');
    rect(ctx, bx - b * 0.1, by - b * 0.02, b * 0.2, b * 0.18, '#ffb02e');    // beak
  }
  rect(ctx, bx - b * 0.1, by - b * 0.6, b * 0.08, b * 0.18, wing);           // tuft
  rect(ctx, bx + b * 0.04, by - b * 0.66, b * 0.08, b * 0.24, wing);
}

// After a bird passes it hangs about over the kid's head for a moment: hopping
// mad and steaming if they ducked it, rocking with laughter if it bonked them.
// Then it flaps off up and out of the lane.
function drawBirdMood(ctx, L, e) {
  const k = e.t / e.life, dir = e.side === 'left' ? -1 : 1, S = L.S;
  const leave = clamp((k - 0.7) / 0.3, 0, 1);
  const flap = Math.floor(e.t * (e.mood === 'mad' ? 16 : 10)) % 2;
  let bx = L.cx + dir * S * 1.1 + dir * leave * S * 3;
  let by = L.ground - S * 4.1 - leave * S * 3;
  if (e.mood === 'mad') bx += Math.sin(e.t * 60) * S * 0.07;                 // shaking with rage
  else by += Math.abs(Math.sin(e.t * 14)) * -S * 0.18;                       // bouncing with laughter
  const b = S * 1.0;
  drawBird(ctx, bx, by, b, flap, e.mood);
  if (e.mood === 'mad') {
    // Puffs of steam out of its head.
    for (let i = 0; i < 3; i++) {
      const q = (e.t * 1.6 + i / 3) % 1, sz = Math.max(1, b * (0.12 + q * 0.14));
      ctx.save();
      ctx.globalAlpha *= 0.85 * (1 - q);
      rect(ctx, bx + (i - 1) * b * 0.35 - sz / 2, by - b * (0.7 + q * 0.9), sz, sz, '#ffffff');
      ctx.restore();
    }
  } else {
    // Little "ha" notes bubbling up.
    for (let i = 0; i < 3; i++) {
      const q = (e.t * 1.3 + i / 3) % 1, sz = Math.max(1, b * 0.14);
      ctx.save();
      ctx.globalAlpha *= 1 - q;
      const hx = bx - dir * b * (0.6 + q * 0.6) + (i - 1) * b * 0.2, hy = by - b * (0.5 + q * 1.1);
      // A tiny pixel "H".
      rect(ctx, hx, hy, sz * 0.5, sz * 1.6, '#ffe14d');
      rect(ctx, hx + sz, hy, sz * 0.5, sz * 1.6, '#ffe14d');
      rect(ctx, hx, hy + sz * 0.55, sz * 1.5, sz * 0.5, '#ffe14d');
      ctx.restore();
    }
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
    shadow(ctx, L.cx, y + u * 0.05, w * 1.08, Math.max(1, u * 0.3));
    block(ctx, x0, y - hh, w, hh, '#e0662f', 0.25);
    const bw = w / 5;
    for (let k = 1; k < 5; k++) rect(ctx, x0 + bw * k, y - hh * 0.7, Math.max(1, u * 0.06), hh * 0.65, '#a8431a');
    rect(ctx, x0, y - hh * 0.4, w, Math.max(1, u * 0.06), '#a8431a');
  } else if (o.kind === 'bird') {
    // A crazy bird swooping in from one side at head height: duck under it.
    // Once it has passed, its reaction (mad or laughing) is drawn as an effect.
    if (!o.result) {
      const dir = o.side === 'left' ? -1 : 1;
      const flap = Math.floor((o.arrive - z * o.travel) * 8 + z * 40) % 2;
      const bx = L.cx + dir * u * (0.15 + clamp(z * 3, 0, 1) * 0.6) + Math.sin(z * 30) * u * 0.15, by = y - u * 3.35;
      shadow(ctx, bx, y, u * 1.05, Math.max(1, u * 0.22), 0.14);
      drawBird(ctx, bx, by, u * 0.95, flap, null);
    }
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
  } else if (o.kind === 'gear') {
    // A floating prize, bobbing and sparkling at head height.
    const hu = u * 1.3 / 8, bob = Math.sin(z * 25) * u * 0.2;
    const cx = L.cx, cy = y - u * 3.1 + bob;
    shadow(ctx, cx, y, u * 1.2, Math.max(1, u * 0.22), 0.14);
    ctx.globalAlpha *= 0.35;
    rect(ctx, cx - u * 0.9, cy - u * 0.9, u * 1.8, u * 1.8, '#ffffff');
    ctx.globalAlpha = 1;
    drawGearItem(ctx, o.item.id, cx - hu * 4, cy - hu * 1, hu);
    const tw = Math.floor(z * 30) % 2;
    rect(ctx, cx + u * (tw ? 0.8 : -0.9), cy - u * (tw ? 0.8 : 0.3), u * 0.18, u * 0.18, '#ffe14d');
  } else if (o.kind === 'crate') {
    const off = o.side === 'left' ? -1.2 : o.side === 'right' ? 1.2 : 0;
    const size = u * 1.1;
    const cx = L.cx + off * u, cy = y - u * 2.55;
    shadow(ctx, cx, y, size * 1.1, Math.max(1, u * 0.25), 0.16);
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
  if (T.type === 'snowman') { drawSnowman(ctx, L, T, u * SNOW_SCALE, y); return; }
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
// Snowman: three stacked snowballs, bigger than a can. Hit ones tumble away.
const SNOW_SCALE = 1.5;
function snowmanBox(L, c, u, ground) {
  let y = ground;
  for (let r = 0; r < c.row; r++) y -= u * [1.25, 1, 0.75][r] * 0.92;
  const d = u * c.size;
  return { x: L.cx + c.x * u, y: y + c.y * 0 - d / 2, d };
}
function drawSnowman(ctx, L, T, u, ground) {
  for (const c of T.cans) {
    const b = snowmanBox(L, c, u, ground);
    ctx.save();
    ctx.translate(b.x, b.y + (c.down ? (c.y + c.row) * u : 0));
    ctx.rotate(c.rot);
    const d = b.d;
    rect(ctx, -d / 2, -d * 0.35, d, d * 0.7, '#ffffff');
    rect(ctx, -d * 0.35, -d / 2, d * 0.7, d, '#ffffff');
    rect(ctx, -d * 0.35, d * 0.3, d * 0.7, d * 0.2, '#cfe3f5');
    if (c.row === 2) {
      rect(ctx, -d * 0.25, -d * 0.15, d * 0.12, d * 0.12, '#1b1b22');
      rect(ctx, d * 0.13, -d * 0.15, d * 0.12, d * 0.12, '#1b1b22');
      rect(ctx, -d * 0.05, 0, d * 0.35, d * 0.1, '#ff8a2a');
      rect(ctx, -d * 0.4, -d * 0.62, d * 0.8, d * 0.12, '#1b1b22');
      rect(ctx, -d * 0.25, -d * 1.0, d * 0.5, d * 0.4, '#1b1b22');
    } else if (c.row === 1) {
      rect(ctx, -d * 0.05, -d * 0.2, d * 0.1, d * 0.1, '#1b1b22');
      rect(ctx, -d * 0.05, d * 0.05, d * 0.1, d * 0.1, '#1b1b22');
      rect(ctx, -d * 0.5, -d * 0.45, d, d * 0.12, '#e63946');
    }
    ctx.restore();
  }
}
// Karate time: boards across two bricks. Chopped boards snap and fly.
const KARATE_Z = 0.12;
function drawBoards(ctx, L, T) {
  const { y, s } = project(L, KARATE_Z);
  const u = L.S * s;
  block(ctx, L.cx - u * 1.5, y - u * 1.0, u * 0.6, u * 1.0, '#9aa7b8', 0.2);
  block(ctx, L.cx + u * 0.9, y - u * 1.0, u * 0.6, u * 1.0, '#9aa7b8', 0.2);
  const bh = u * 0.24;
  for (const b of T.boards) {
    const by = y - u * 1.0 - bh * (b.i + 1) - u * 0.02 * b.i;
    if (!b.down) { block(ctx, L.cx - u * 1.6, by, u * 3.2, bh, '#e0b070', 0.3); continue; }
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(L.cx + side * (u * 0.8 + b.x * u * 0.8), by + b.y * u * 0.6);
      ctx.rotate(side * b.rot);
      rect(ctx, -u * 0.8, 0, u * 1.6, bh, '#e0b070');
      ctx.restore();
    }
  }
}
// Fire time: a little house with fires on it, and the kid's hose spray.
function houseGeom(L) {
  const { y, s } = project(L, TOWER_Z);
  const u = L.S * s * 1.5;
  return { y, u, fireX: x => L.cx + x * u * 1.3, fireY: y - u * 1.9 };
}
function drawHouse(ctx, L, T, time) {
  const { y, u, fireX, fireY } = houseGeom(L);
  block(ctx, L.cx - u * 1.9, y - u * 1.9, u * 3.8, u * 1.9, '#e8d3b0', 0.08);       // walls
  for (let k = 0; k < 4; k++) block(ctx, L.cx - u * (2.1 - k * 0.35), y - u * (2.3 + k * 0.32), u * (4.2 - k * 0.7), u * 0.36, '#b8452f', 0.3); // roof
  rect(ctx, L.cx - u * 0.3, y - u * 1.0, u * 0.6, u * 1.0, '#7a4a24');                // door
  for (const sx of [-1.25, 0.75]) { rect(ctx, L.cx + sx * u, y - u * 1.5, u * 0.5, u * 0.5, '#5aa7f0'); }
  for (const f of T.fires) {
    const x = fireX(f.x);
    if (f.out) {
      // Puffs of steam drifting up where the fire was.
      if (f.outT < 1.2) for (let i = 0; i < 4; i++) {
        const k = (f.outT + i * 0.25) % 1.2 / 1.2, sz = u * (0.3 + 0.3 * k);
        ctx.globalAlpha = 0.6 * (1 - k);
        rect(ctx, x - sz / 2 + Math.sin(i * 2 + f.outT * 3) * u * 0.2, fireY - k * u * 2, sz, sz, '#e8eef5');
      }
      ctx.globalAlpha = 1;
      continue;
    }
    const k = Math.max(0.25, f.hp / f.max), fl = Math.floor(time * 10 + f.x * 7) % 2;
    const w = u * 0.9 * k, h = u * 1.4 * k;
    rect(ctx, x - w / 2, fireY - h * 0.45, w, h * 0.45, '#ff3b30');
    rect(ctx, x - w * 0.35, fireY - h * (fl ? 0.8 : 0.72), w * 0.7, h * 0.4, '#ff9f1c');
    rect(ctx, x - w * 0.18, fireY - h * (fl ? 1.0 : 0.9), w * 0.36, h * 0.35, '#ffe14d');
    rect(ctx, x + (fl ? w * 0.25 : -w * 0.4), fireY - h * 0.65, w * 0.15, w * 0.15, '#ff9f1c');
  }
}
function drawWater(ctx, L, T, time) {
  const { fireX, fireY, u } = houseGeom(L);
  const S = L.S;
  const sx = L.cx + (T.aim < 0 ? -1 : 1) * S * 1.2, sy = L.ground - 3.0 * S;
  const tx = fireX(T.aim), ty = fireY - u * 0.4;
  for (let i = 0; i < 18; i++) {
    const k = (i / 18 + time * 2.2) % 1;
    const x = sx + (tx - sx) * k, y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * S * 1.4;
    const sz = Math.max(1, S * (0.26 - 0.14 * k));
    rect(ctx, x - sz / 2, y - sz / 2, sz, sz, i % 3 ? '#5ab4ff' : '#d8f0ff');
  }
  // Splash where it lands.
  for (let i = 0; i < 4; i++) {
    const a = time * 9 + i * 1.6;
    rect(ctx, tx + Math.cos(a) * u * 0.4, ty + Math.sin(a) * u * 0.25 - u * 0.1, S * 0.12, S * 0.12, '#bfe3ff');
  }
}

// Bubble time: a big wobbly bubble up in the sky, and the pops left behind.
function bubbleY(L, h) {
  return L.ground - 1.65 * L.S - h * (L.h * SKY_PAN + L.S * 2.2) - 2.2 * L.S;
}
function drawBubbles(ctx, L, T, time) {
  const b = T.bubble;
  if (b && !T.falling) {
    // A ladder of up arrows between the kid's head and the bubble: one per
    // flap still to do, the next one blinking.
    const left = b.flaps - b.done;
    const head = L.ground - 1.65 * L.S - T.alt * (L.h * SKY_PAN + L.S * 2.2) - 2.3 * L.S;
    const top = bubbleY(L, b.h) + L.S * 1.1;
    const a = L.S * 0.17, blink = Math.floor(time * 6) % 2;
    for (let k = 1; k <= left; k++) {
      const y = head + ((top - head) * k) / (left + 1);
      const col = k === 1 ? (blink ? '#ffe14d' : '#ff9f1c') : 'rgba(255,159,28,0.6)';
      rect(ctx, L.cx - a * 0.5, y - a, a, a, col);
      rect(ctx, L.cx - a * 1.5, y, a * 3, a, col);
      rect(ctx, L.cx - a * 2.5, y + a, a, a, col);
      rect(ctx, L.cx + a * 1.5, y + a, a, a, col);
    }
  }
  if (b) {
    const r = L.S * (0.95 + 0.06 * Math.sin(b.t * 6));
    const x = L.cx + b.x * L.S * 0.6, y = bubbleY(L, b.h) + Math.sin(b.t * 2.5) * L.S * 0.15;
    const hue = (time * 80) % 360;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190,240,255,0.3)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, L.S * 0.14);
    ctx.strokeStyle = `hsl(${hue},95%,72%)`;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, Math.PI * 0.1, Math.PI * 0.9);
    ctx.strokeStyle = `hsla(${(hue + 150) % 360},95%,72%,0.7)`;
    ctx.lineWidth = Math.max(1, L.S * 0.08);
    ctx.stroke();
    rect(ctx, x - r * 0.55, y - r * 0.55, r * 0.3, r * 0.22, '#ffffff');
    rect(ctx, x - r * 0.62, y - r * 0.28, r * 0.12, r * 0.18, '#ffffff');
    ctx.restore();
  }
  for (const q of T.pops) {
    const k = q.t / 0.6;
    const x = L.cx + q.x * L.S * 0.6, y = bubbleY(L, q.h);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, d = L.S * (0.6 + 1.6 * k);
      const sz = Math.max(1, L.S * 0.2 * (1 - k));
      rect(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, sz, sz, i % 2 ? '#ffffff' : '#9be7ff');
    }
  }
}
function drawBalls(ctx, L, T) {
  for (const b of T.balls) {
    const k = Math.min(1, b.t / b.dur);
    let c = canBox(L, b.target);
    if (T.type === 'snowman') {
      const { y: g, s } = project(L, TOWER_Z);
      const sb = snowmanBox(L, b.target, L.S * s * SNOW_SCALE, g);
      c = { x: sb.x, y: sb.y + sb.d / 2, ch: sb.d };
    }
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
    } else if (e.type === 'bird') {
      drawBirdMood(ctx, L, e);
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
  if (act.discoL) { P.le = [-0.7, -1.6]; P.lw = [-0.95, -2.2]; P.re = [0.55, -0.6]; P.rw = [0.75, -0.15]; }
  if (act.discoR) { P.re = [0.7, -1.6]; P.rw = [0.95, -2.2]; P.le = [-0.55, -0.6]; P.lw = [-0.75, -0.15]; }
  if (act.clap) { P.le = [-0.55, -1.0]; P.re = [0.55, -1.0]; P.lw = [-0.08, -1.3]; P.rw = [0.08, -1.3]; }
  const lean = act.leanL ? -1 : act.leanR ? 1 : 0;
  if (lean) {
    // Bend at the hips: the higher up, the further it moves.
    for (const k of ['nose', 'ls', 'rs', 'le', 're', 'lw', 'rw']) P[k][0] += lean * 0.4 * -P[k][1];
  }
  return P;
}

// Real pose from the camera, relative to the kid's calibrated standing pose.
// The avatar can wiggle a little side to side, but never wanders far from the
// middle of its lane. y is measured from their calibrated standing height.
function cameraPose(p) {
  const B = p.base, pts = p.pts, t = B.torso;
  const cur = p.f ? p.f.hip.x : B.hipX;
  const hipX = cur - clamp(cur - B.hipX, -0.7 * t, 0.7 * t);
  const g = i => [clamp((pts[i].x - hipX) / t, -2.2, 2.2), clamp((pts[i].y - B.hipY) / t, -2.6, 2)];
  // The image is mirrored, so the person's right side shows on screen-left.
  const P = {
    nose: g(LM.nose), ls: g(LM.rSh), rs: g(LM.lSh), le: g(LM.rEl), re: g(LM.lEl),
    lw: g(LM.rWr), rw: g(LM.lWr), lh: g(LM.rHip), rh: g(LM.lHip),
    lk: g(LM.rKn), rk: g(LM.lKn), la: g(LM.rAn), ra: g(LM.lAn),
  };
  // Legs are often out of frame: fall back to cartoon legs under the hips.
  // Knees alone are enough to show running on the spot; feet come later.
  P.kneesSeen = Math.min(pts[LM.lKn].v, pts[LM.rKn].v) > 0.5;
  const legsOk = P.kneesSeen && Math.min(pts[LM.lAn].v, pts[LM.rAn].v) > 0.5;
  if (P.kneesSeen && !legsOk) {
    P.la = [P.lk[0], P.lk[1] + 0.8]; P.ra = [P.rk[0], P.rk[1] + 0.8];
  } else if (!legsOk) {
    const bend = clamp(P.lh[1] * 0.6, 0, 0.6);
    P.lk = [P.lh[0] - 0.05 - bend * 0.6, P.lh[1] + 0.8 - bend * 0.3];
    P.rk = [P.rh[0] + 0.05 + bend * 0.6, P.rh[1] + 0.8 - bend * 0.3];
    P.la = [P.lh[0] - 0.02, Math.max(P.lk[1] + 0.3, 1.6)];
    P.ra = [P.rh[0] + 0.02, Math.max(P.rk[1] + 0.3, 1.6)];
  }
  return P;
}

// Camera poses stretch and shrink as a kid turns, bends or steps closer, which
// made the character look big one moment and small the next. Keep each body
// part close to the cartoon's own length and only take its direction from the
// camera, with a little of the real length mixed in so it still feels alive.
const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export function steadyPose(P, keepArms, crouch = 0) {
  // Fixed bone lengths: only the angles come from the camera, so arms and
  // legs never shrink or stretch when a kid leans in or turns.
  const firm = (m, ref) => ref;
  const toward = (from, a, b, ref, fallback) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy);
    if (m < 0.05) return [from[0] + fallback[0], from[1] + fallback[1]];
    const k = firm(m, ref) / m;
    return [from[0] + dx * k, from[1] + dy * k];
  };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const span = (c, a, b, w) => {
    let dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy);
    if (m < 0.05) { dx = 1; dy = 0; m = 1; }
    const hw = firm(m, w) / 2 / m;
    return [[c[0] - dx * hw, c[1] - dy * hw], [c[0] + dx * hw, c[1] + dy * hw]];
  };
  const S0 = STAND, out = {};
  const hc = mid(P.lh, P.rh);
  const sc = toward(hc, hc, mid(P.ls, P.rs), 1, [0, -1]);
  [out.lh, out.rh] = span(hc, P.lh, P.rh, segLen(S0.lh, S0.rh));
  [out.ls, out.rs] = span(sc, P.ls, P.rs, segLen(S0.ls, S0.rs));
  out.nose = toward(sc, mid(P.ls, P.rs), P.nose, 0.5, [0, -0.5]);
  // Feet on the ground: leaning toward the camera or stepping closer moves the
  // hips up and down in the picture, which made the character float off the
  // road, so the feet always stand on the ground line and the legs bend to
  // reach them. Real jumps come from the game's jump move, which lifts the
  // character separately and springs it back down. A kid who ducks (the
  // game's crouch: hips and head both clearly lower) crouches a little: the
  // body sinks and the knees bend out. A knee the camera sees lifted
  // (running on the spot) lifts that foot off the ground.
  const drop = clamp(crouch, 0, 0.5) - hc[1];
  for (const k in out) out[k] = [out[k][0], out[k][1] + drop];
  for (const [hp, kn, an, side] of [['lh', 'lk', 'la', -1], ['rh', 'rk', 'ra', 1]]) {
    // A thigh looks shorter to the camera as its knee comes up towards it.
    // Compared with the other leg, so a kid's own leg length doesn't matter
    // and one foot always stays down.
    const thigh = k => P[k][1] - P[k === 'lk' ? 'lh' : 'rh'][1];
    const lift = P.kneesSeen ? clamp((thigh(kn === 'lk' ? 'rk' : 'lk') - thigh(kn) - 0.12) * 1.4, 0, 0.75) : 0;
    const H = out[hp], foot = [H[0] + side * 0.02, STAND.la[1]];
    const len = segLen(H, foot) || 1, d = Math.min(len, 1.6), half = Math.sqrt(Math.max(0, 0.64 - (d / 2) ** 2));
    const ux = (foot[0] - H[0]) / len, uy = (foot[1] - H[1]) / len, A = [H[0] + ux * d, H[1] + uy * d];
    // Knee halfway down the leg, pushed out sideways (away from the body).
    let px = -uy, py = ux;
    if (px * side < 0) { px = -px; py = -py; }
    // A lifted knee comes up towards the camera: knee and foot both rise, so
    // the thigh looks short and the shin hangs under it, like running.
    out[kn] = [H[0] + ux * d / 2 + px * half, H[1] + uy * d / 2 + py * half - lift];
    out[an] = [A[0], A[1] - lift];
  }
  for (const [sh, el, wr] of [['ls', 'le', 'lw'], ['rs', 're', 'rw']]) {
    if (keepArms) {
      // Hand break games: the hands must stay exactly where the camera saw them.
      const dx = out[sh][0] - P[sh][0], dy = out[sh][1] - P[sh][1];
      out[el] = [P[el][0] + dx * 0.5, P[el][1] + dy * 0.5]; out[wr] = P[wr];
      continue;
    }
    out[el] = toward(out[sh], P[sh], P[el], segLen(S0[sh], S0[el]), [0, 0.48]);
    out[wr] = toward(out[el], P[el], P[wr], segLen(S0[el], S0[wr]), [0, 0.44]);
  }
  return out;
}

// 1-Euro filter (Casiez et al.) for one value. Units: torso lengths, seconds.
const EURO = { min: 1.0, beta: 0.9, d: 1.0 };
function oneEuro(state, key, x, t) {
  const s = state[key];
  if (!s || t - s.t > 0.5) { state[key] = { x, dx: 0, t }; return x; }
  const dt = t - s.t;
  if (dt <= 0) return s.x;
  const alpha = cut => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  s.dx += alpha(EURO.d) * ((x - s.x) / dt - s.dx);
  s.x += alpha(EURO.min + EURO.beta * Math.abs(s.dx)) * (x - s.x);
  s.t = t;
  return s.x;
}

function drawAvatar(ctx, L, p, time, ch) {
  let P;
  if (p.pts && p.base) {
    // Smooth out camera jitter so the character doesn't twitch.
    // A 1-Euro filter: heavy smoothing while still, almost none in fast moves.
    const raw = steadyPose(cameraPose(p), MINI.includes(p.throwing?.type), p.crouch);
    const f = p.poseFilter ??= {}, now = performance.now() / 1000;
    P = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, [oneEuro(f, k + 'x', v[0], now), oneEuro(f, k + 'y', v[1], now)]]));
    // One bad camera number would otherwise stick in the filter: start it afresh.
    if (!finitePose(P)) { p.poseFilter = {}; P = finitePose(raw) ? raw : cartoonPose(p.act); }
  }
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
    pixLine(ctx, L.cx, 0, L.cx + dx, handY, Math.max(2, S * 0.16), '#d9b16a');
  }
  const T = p.throwing;
  if (T?.type === 'bubbles') {
    lift += T.alt * (L.h * SKY_PAN + S * 2.2);
    if (!(p.pts && p.base)) P = cartoonPose({ reach: T.falling || p.clock - T.flapAt < 0.15, jump: T.alt > 0.02 });
  }
  if (T?.type === 'fire' && !(p.pts && p.base)) P = cartoonPose(T.aim < -0.2 ? { left: true } : { right: true });
  if (T?.type === 'climb' || T?.type === 'fly') lift += T.pan * S * 0.9;
  if (MINI.includes(T?.type) && !(p.pts && p.base) && p.hands) {
    // Keyboard: put the cartoon's hands where the keys say.
    P = cartoonPose({}, 0);
    const [a, b] = p.hands;
    if (a) { P.lw = [a.x, a.y]; P.le = [(P.ls[0] + a.x) / 2 - 0.15, (P.ls[1] + a.y) / 2]; }
    if (b) { P.rw = [b.x, b.y]; P.re = [(P.rs[0] + b.x) / 2 + 0.15, (P.rs[1] + b.y) / 2]; }
  }
  const shake = p.bonk > 0 ? Math.sin(time * 60) * S * 0.1 * (p.bonk / 0.5) : 0;
  // Shadow stays on the ground.
  const sw = S * (1.5 - p.lift * 0.5);
  shadow(ctx, L.cx + dx, L.ground + S * 0.02, sw, S * (0.34 - p.lift * 0.1), 0.22);
  const flash = p.bonk > 0 && Math.floor(time * 12) % 2 === 0;
  const ox = L.cx + shake + dx, oy = L.ground - 1.65 * S - lift;
  const runT = p.run ?? p.clock ?? time, steps = runT * STEP_RATE;
  const grounded = p.lift < 0.08 && !(p.swing > 0) && !T;
  if (grounded) drawDust(ctx, L.cx + dx, L.ground, S, steps);

  // Squash and stretch: long in the air, squashed for a moment on landing,
  // and a little bounce on every step.
  if (p.lift > 0.3) p.airAt = time;
  let sy = 1;
  if (p.lift > 0.08) sy = 1 + 0.08 * Math.min(1, p.lift * 1.5);
  else if (p.airAt && time - p.airAt < 0.22) sy = 1 - 0.13 * Math.sin((time - p.airAt) / 0.22 * Math.PI);
  else if (grounded && !p.pts) sy = 0.975 + 0.04 * Math.abs(Math.sin(Math.PI * steps));
  const sx = 1 + (1 - sy) * 0.7;
  if (sy !== 1) {
    const FEET = 1.68;
    P = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, [v[0] * sx, FEET + (v[1] - FEET) * sy]]));
  }
  // Wide eyes and an "O" mouth when something is about to arrive.
  const wow = p.obstacles?.some(o => {
    if (o.result || o.kind === 'gear') return false;
    const z = (o.arrive - p.clock) / o.travel;
    return z > -0.03 && z < (o.kind === 'bird' ? 0.45 : 0.22);
  });
  const look = { sx, sy, wow };
  queueCharacter(ctx, { x: L.x, w: L.w, h: L.h }, ox, oy, S, P, ch, flash, p.gear, look);
}

// Little dust puffs kicked up behind each footstep.
const STEP_RATE = 2.6;
function drawDust(ctx, cx, ground, S, steps) {
  const life = 0.5 * STEP_RATE; // in steps
  for (let j = 0; j < 2; j++) {
    const step = Math.floor(steps) - j, age = (steps - step) / life;
    if (age >= 1 || step < 0) continue;
    const side = step % 2 ? -1 : 1;
    const x = cx + side * S * (0.3 + age * 0.7), y = ground - S * (0.05 + age * 0.45);
    const r = S * (0.14 + 0.22 * age);
    ctx.globalAlpha = 0.6 * (1 - age);
    rect(ctx, x - r, y - r * 0.5, r * 2, r, '#fffaf0');
    rect(ctx, x - r * 0.5, y - r, r, r * 2, '#fffaf0');
    rect(ctx, x + side * r * 1.1, y - r * 1.2, r * 0.6, r * 0.6, '#fffaf0');
    ctx.globalAlpha = 1;
  }
}

// Draws a blocky character with hip centre at (ox, oy).
const finitePose = P => P && Object.values(P).every(v => Number.isFinite(v[0]) && Number.isFinite(v[1]));
export function drawCharacter(ctx, ox, oy, S, P, ch, flash = false, gear = {}, look = {}) {
  // A bad number from the tracker must never stop the drawing: stand instead.
  if (!finitePose(P)) P = cartoonPose();
  if (!Number.isFinite(ox) || !Number.isFinite(oy) || !(S > 0)) return;
  VEC++;
  const prevOl = OLW;
  ctx.save();
  try { drawRig(ctx, ox, oy, S, P, ch, flash, gear || {}, look || {}); }
  finally { ctx.restore(); VEC--; OLW = prevOl; RMODE = 'fill'; }
}

// A paper-doll rig of blocky parts (square-ended limbs with a block at each
// joint), one dark outline and simple two-tone cel shading: Minecraft-ish,
// but drawn sharp instead of as pixels.
function drawRig(ctx, ox, oy, S, P, ch, flash, gear, look) {
  const X = v => ox + v[0] * S, Y = v => oy + v[1] * S;
  const ol = OLW = Math.max(0.6, S * 0.075);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 2;
  const body = flash ? '#ffffff' : ch.body;
  const limbCol = flash ? '#ffffff' : ch.limb;
  const handCol = flash ? '#ffffff' : ch.hand || (ch.limb === ch.body ? shade(ch.body, 0.2) : ch.body);
  const path = pts => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); };
  const stroke = (w, col) => { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); };
  // A limb: two square bones with a block at the joint, outlined, with a
  // lighter strip along the top edge.
  const bone = (a, b, w) => {
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b), L = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / L * w / 2, ny = (bx - ax) / L * w / 2, ex = (bx - ax) / L * w * 0.15, ey = (by - ay) / L * w * 0.15;
    return [[ax + nx - ex, ay + ny - ey], [bx + nx + ex, by + ny + ey], [bx - nx + ex, by - ny + ey], [ax - nx - ex, ay - ny - ey]];
  };
  const quad = (q, col, w) => { path(q); ctx.closePath(); if (w) stroke(w, col); else { ctx.fillStyle = col; ctx.fill(); } };
  const limb = (a, b, c, w, col) => {
    const q1 = bone(a, b, w), q2 = bone(b, c, w), j = w * 0.56;
    const knee = [[X(b) - j, Y(b) - j], [X(b) + j, Y(b) - j], [X(b) + j, Y(b) + j], [X(b) - j, Y(b) + j]];
    for (const q of [q1, q2, knee]) quad(q, INK, ol * 2);
    for (const q of [q1, q2, knee]) quad(q, col);
    // Shade one side of each bone a touch darker, like a lit cube.
    const mixPt = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    for (const q of [q1, q2]) quad([mixPt(q[3], q[0], 0.62), mixPt(q[2], q[1], 0.62), q[2], q[3]], 'rgba(0,0,0,0.12)');
  };
  const blob = (x, y, r, col) => {
    ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2);
    stroke(ol * 2, INK); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - r, y - r, r * 2, r * 0.6);
  };

  if (gear.back === 'cape') {
    path([[X(P.ls) - S * 0.1, Y(P.ls)], [X(P.rs) + S * 0.1, Y(P.rs)], [X(P.rk) + S * 0.5, Y(P.rk)], [X(P.lk) - S * 0.5, Y(P.lk)]]);
    ctx.closePath(); stroke(ol * 2 + S * 0.1, INK); stroke(S * 0.1, '#e63946'); ctx.fillStyle = '#e63946'; ctx.fill();
  }
  // Legs and shoes.
  limb(P.lh, P.lk, P.la, S * 0.34, limbCol);
  limb(P.rh, P.rk, P.ra, S * 0.34, limbCol);
  for (const a of [P.la, P.ra]) {
    ctx.beginPath(); ctx.rect(X(a) - S * 0.26, Y(a) - S * 0.11, S * 0.52, S * 0.26);
    stroke(ol * 2, INK); ctx.fillStyle = '#2b2b33'; ctx.fill();
  }

  // Torso: a rounded trapezoid, lit from the left.
  const tp = [[X(P.ls) - S * 0.02, Y(P.ls)], [X(P.rs) + S * 0.02, Y(P.rs)], [X(P.rh) + S * 0.04, Y(P.rh) + S * 0.08], [X(P.lh) - S * 0.04, Y(P.lh) + S * 0.08]];
  const xl = Math.min(tp[0][0], tp[3][0]) - S * 0.1, xr = Math.max(tp[1][0], tp[2][0]) + S * 0.1;
  const g = ctx.createLinearGradient(xl, 0, xr, 0);
  g.addColorStop(0, shade(body, 0.1)); g.addColorStop(0.22, shade(body, 0.1));
  g.addColorStop(0.22, body); g.addColorStop(0.74, body);
  g.addColorStop(0.74, shade(body, -0.1)); g.addColorStop(1, shade(body, -0.1));
  path(tp); ctx.closePath();
  stroke(S * 0.06 + ol * 2, INK);
  ctx.fillStyle = g; ctx.fill(); stroke(S * 0.06, g);
  const cx = (X(P.ls) + X(P.rs) + X(P.lh) + X(P.rh)) / 4, cy = (Y(P.ls) + Y(P.rs) + Y(P.lh) + Y(P.rh)) / 4;
  rect(ctx, cx - S * 0.2, cy - S * 0.2, S * 0.4, S * 0.45, flash ? '#fff' : ch.belly);
  if (ch.stripes && !flash) {
    // Reflective bands across the coat and on the cuffs, like a real turnout coat.
    ctx.save();
    path(tp); ctx.closePath(); ctx.lineWidth = S * 0.2; ctx.clip();
    const bl = xl - S * 0.1, br = xr + S * 0.1;
    for (const k of [0.45, 0.85]) {
      const y = Y(P.ls) + (Y(P.lh) - Y(P.ls)) * k;
      ctx.fillStyle = '#d8dce6'; ctx.fillRect(bl, y, br - bl, S * 0.14);
      ctx.fillStyle = '#ffe14d'; ctx.fillRect(bl, y + S * 0.045, br - bl, S * 0.05);
    }
    ctx.restore();
    rect(ctx, cx - S * 0.06, Y(P.ls) + S * 0.05, S * 0.12, Y(P.lh) - Y(P.ls), '#b8801a');
  }

  // Arms, with round hands.
  limb(P.ls, P.le, P.lw, S * 0.28, limbCol);
  limb(P.rs, P.re, P.rw, S * 0.28, limbCol);
  for (const w of [P.lw, P.rw]) blob(X(w), Y(w), S * 0.18, handCol);
  if (ch.stripes && !flash) {
    for (const [a, b] of [[P.le, P.lw], [P.re, P.rw], [P.lk, P.la], [P.rk, P.ra]]) {
      const x = X(a) + (X(b) - X(a)) * 0.7, y = Y(a) + (Y(b) - Y(a)) * 0.7;
      ctx.beginPath(); ctx.moveTo(x - S * 0.06, y); ctx.lineTo(x + S * 0.06, y); stroke(S * 0.14, '#d8dce6');
    }
  }

  // Head, sitting on the shoulders and following the nose.
  const neck = [(P.ls[0] + P.rs[0]) / 2, (P.ls[1] + P.rs[1]) / 2];
  const hcx = X([neck[0] * 0.4 + P.nose[0] * 0.6, 0]);
  const hcy = Math.min(Y(P.nose), Y(neck) - S * 0.45);
  drawHead(ctx, hcx, hcy, S, ch, flash, gear, look);
}

function drawHead(ctx, x, y, S, ch, flash, gear = {}, look = {}) {
  const hs = S * 1.0; // head size
  const hw = hs * (look.sx || 1), hh = hs * (look.sy || 1);
  const left = x - hw / 2, top = y - hh / 2;
  const head = flash ? '#ffffff' : ch.head;
  const u = hw / 8, uy = hh / 8; // head "pixel"
  const px = (i, j, w, h, c) => rect(ctx, left + i * u, top + j * uy, w * u, h * uy, c);

  const behind = () => {
    // Things behind/above the head.
    if (ch.id === 'fox') { px(0, -2, 2, 2, ch.body); px(6, -2, 2, 2, ch.body); px(0, -2, 1, 1, '#3a2a20'); px(7, -2, 1, 1, '#3a2a20'); }
    if (ch.id === 'bunny') { px(1, -5, 2, 5, head); px(5, -5, 2, 5, head); px(1.5, -4.5, 1, 4, '#ffc4d6'); px(5.5, -4.5, 1, 4, '#ffc4d6'); }
    if (ch.id === 'panda') { px(-0.5, -1, 2.5, 2.5, '#2b2b33'); px(6, -1, 2.5, 2.5, '#2b2b33'); }
    if (ch.id === 'robot') { px(3.5, -3, 1, 3, '#6b788a'); px(3, -4, 2, 1.5, '#ff4d4d'); }
    if (ch.id === 'dino') { px(1, -1.5, 1.5, 1.5, '#ffd23f'); px(3.3, -2, 1.5, 2, '#ffd23f'); px(5.6, -1.5, 1.5, 1.5, '#ffd23f'); }
    if (ch.id === 'hedgehog') {
      // Soft round prickles all over the back of the head.
      const q = '#2a56a8';
      px(-1, 0.5, 1.5, 2, q); px(-1.2, 3, 1.5, 2, q); px(7.5, 0.5, 1.5, 2, q); px(7.7, 3, 1.5, 2, q);
      px(0.3, -1.3, 1.8, 1.8, q); px(2.6, -1.8, 1.8, 2, q); px(4.9, -1.6, 1.8, 2, q); px(6.6, -0.9, 1.5, 1.6, q);
    }
    if (ch.id === 'axolotl') {
      // Frilly pink gills on both sides.
      const g = '#ff5fa2';
      px(-2, 0.4, 2, 1, g); px(-2.6, 2.4, 2.6, 1, g); px(-2, 4.4, 2, 1, g);
      px(8, 0.4, 2, 1, g); px(8, 2.4, 2.6, 1, g); px(8, 4.4, 2, 1, g);
    }
    if (ch.id === 'cow') {
      px(-0.4, -1.6, 1.2, 1.8, '#f0e0c0'); px(7.2, -1.6, 1.2, 1.8, '#f0e0c0');
      px(-1.6, 1.2, 1.8, 1.1, '#2b2b33'); px(7.8, 1.2, 1.8, 1.1, '#2b2b33');
    }
    if (ch.id === 'cat') {
      // Pointy ears with pink insides.
      for (const x of [0, 5.6]) { px(x, -1.4, 2.4, 1.8, ch.body); px(x + 0.5, -2.3, 1.4, 1.2, ch.body); px(x + 0.7, -1.2, 1, 1.2, '#ffb3c7'); }
    }
    if (ch.id === 'berner') { px(-1.5, 0.4, 1.9, 4.4, '#1c1c22'); px(7.6, 0.4, 1.9, 4.4, '#1c1c22'); } // floppy ears
    if (ch.id === 'ninja') { px(8, 1, 2, 0.8, '#e63946'); px(8.6, 1.8, 1.6, 0.7, '#e63946'); }
    if (ch.id === 'firefighter' && !gear.hat) px(-1.6, 0.3, 11.2, 1.3, '#a81a26'); // helmet's long brim
  };
  if (VEC) {
    // Outline pass for the whole head silhouette, then the fills on top.
    const headShape = () => roundRect(ctx, left, top, hw, hh, hs * 0.05);
    RMODE = 'outline'; behind(); headShape(); ctx.lineWidth = OLW * 2; ctx.strokeStyle = INK; ctx.stroke();
    RMODE = 'fill'; behind();
    const g = ctx.createLinearGradient(0, top, 0, top + hh);
    g.addColorStop(0, shade(head, 0.12)); g.addColorStop(0.2, shade(head, 0.12));
    g.addColorStop(0.2, head); g.addColorStop(0.82, head);
    g.addColorStop(0.82, shade(head, -0.08)); g.addColorStop(1, shade(head, -0.08));
    headShape(); ctx.fillStyle = g; ctx.fill();
  } else {
    behind();
    block(ctx, left, top, hw, hh, head, 0.18);
  }

  // Faces.
  const eye = look.wow
    ? (i, j) => { px(i - 0.3, j - 0.4, 2, 2.2, '#ffffff'); px(i + 0.1, j, 1.2, 1.4, '#1b1b22'); px(i + 0.2, j + 0.1, 0.5, 0.5, '#ffffff'); }
    : (i, j) => { px(i, j, 1.4, 1.6, '#1b1b22'); px(i + 0.2, j + 0.2, 0.6, 0.6, '#ffffff'); };
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
    case 'ninja':
      px(0, 2.4, 8, 2.4, '#ffd2a8'); px(0, 1, 8, 1, '#e63946');
      eye(1.5, 2.8); eye(5.1, 2.8);
      break;
    case 'hedgehog':
      px(1.2, 3.6, 5.6, 4.4, '#f5e2c0'); eye(1.6, 2.4); eye(5, 2.4);
      px(3.3, 4.6, 1.4, 1, '#1b1b22'); px(2.8, 6.3, 2.4, 0.6, '#b0603a');
      break;
    case 'axolotl':
      px(1, 3, 1.2, 1.2, '#1b1b22'); px(5.8, 3, 1.2, 1.2, '#1b1b22');
      px(0.6, 4.8, 1.2, 0.7, '#ff7fb5'); px(6.2, 4.8, 1.2, 0.7, '#ff7fb5');
      px(2.5, 5.4, 3, 0.6, '#c2185b'); px(2.2, 4.9, 0.6, 0.6, '#c2185b'); px(5.2, 4.9, 0.6, 0.6, '#c2185b');
      break;
    case 'firefighter':
      eye(1.5, 3.2); eye(5.1, 3.2);
      px(2.4, 5.6, 0.7, 0.7, '#8a3a2a'); px(3, 6.2, 2, 0.6, '#8a3a2a'); px(4.9, 5.6, 0.7, 0.7, '#8a3a2a'); // smile
      px(0.5, 5, 1.2, 0.8, '#ffab9a'); px(6.3, 5, 1.2, 0.8, '#ffab9a');
      px(0, 3.8, 0.5, 3.4, '#3a3a44'); px(7.5, 3.8, 0.5, 3.4, '#3a3a44'); // chin strap
      // Red helmet with a gold front shield (a picked-up hat replaces it).
      if (!gear.hat) {
        px(-0.2, -2.6, 8.4, 4.2, '#e63946');
        px(0.6, -3.2, 6.8, 0.8, '#e63946');
        px(0.8, -3.2, 5.2, 0.5, '#ff7b84');
        px(3.6, -3.8, 0.8, 0.8, '#a81a26');
        px(2.5, -2.4, 3, 3, '#ffd23f');
        px(3.4, -1.8, 1.2, 1.8, '#e63946');
        px(-0.2, 1.1, 8.4, 0.5, '#a81a26');
      }
      break;
    case 'cat':
      px(2.5, 0, 0.6, 1.5, '#c45a1a'); px(3.7, 0, 0.6, 2, '#c45a1a'); px(4.9, 0, 0.6, 1.5, '#c45a1a'); // tabby stripes
      eye(1.5, 2.9); eye(5.1, 2.9);
      px(2.3, 4.7, 3.4, 2.2, '#fff1e0'); px(3.4, 4.7, 1.2, 0.8, '#ff8fb1');
      px(3, 5.9, 0.7, 0.5, '#7a3a1a'); px(4.3, 5.9, 0.7, 0.5, '#7a3a1a');
      px(-0.9, 5, 2.2, 0.3, '#ffffff'); px(-0.9, 5.9, 2.2, 0.3, '#ffffff'); px(6.7, 5, 2.2, 0.3, '#ffffff'); px(6.7, 5.9, 2.2, 0.3, '#ffffff'); // whiskers
      break;
    case 'berner':
      px(3.3, -0.1, 1.4, 4.6, '#ffffff'); // white blaze
      px(1.5, 1.9, 1.3, 0.7, '#c8692c'); px(5.2, 1.9, 1.3, 0.7, '#c8692c'); // rust eyebrows
      px(0.4, 4.6, 1.4, 1.8, '#c8692c'); px(6.2, 4.6, 1.4, 1.8, '#c8692c'); // rust cheeks
      px(1.7, 4.3, 4.6, 3.7, '#ffffff'); // white muzzle
      eye(1.4, 2.8); eye(5.2, 2.8);
      px(3.2, 4.5, 1.6, 1.1, '#1b1b22'); px(3.5, 6.3, 1, 1, '#ff6b81');
      break;
    case 'cow':
      px(0.6, 0.6, 2.6, 2, '#2b2b33'); px(5.4, 0.2, 2, 1.4, '#2b2b33');
      eye(1.5, 2.6); eye(5.1, 2.6);
      px(1, 5, 6, 3, '#ffb3c7'); px(2.2, 6, 1, 1, '#c25a7a'); px(4.8, 6, 1, 1, '#c25a7a');
      break;
  }
  if (look.wow && !flash && ch.id !== 'none') {
    // Surprised "O" mouth.
    const my = { frog: 4.6, fox: 6.0, cow: 6.4, cat: 5.8, berner: 6.0, robot: 5.4, hedgehog: 6.0, panda: 6.4 }[ch.id] ?? 5.9;
    px(3.1, my, 1.8, 1.6, '#3a1020'); px(3.5, my + 0.6, 1, 0.7, '#ff6b81');
  }
  for (const mode of VEC ? ['outline', 'fill'] : ['fill']) {
    RMODE = mode;
    if (gear.face) drawGearItem(ctx, gear.face, left, top, u);
    if (gear.hat) drawGearItem(ctx, gear.hat, left, top, u);
  }
  RMODE = 'fill';
}

// Hats and accessories in head "pixels" (u), relative to the head's top-left.
export function drawGearItem(ctx, id, left, top, u) {
  const px = (i, j, w, h, c) => rect(ctx, left + i * u, top + j * u, w * u, h * u, c);
  switch (id) {
    case 'crown':
      px(1, -2, 6, 2, '#ffd23f'); px(1, -3, 1, 1, '#ffd23f'); px(3.5, -3.2, 1, 1.2, '#ffd23f'); px(6, -3, 1, 1, '#ffd23f');
      px(3.5, -1.5, 1, 1, '#e63946'); px(1.6, -1.3, 0.8, 0.8, '#3fa7ff'); px(5.6, -1.3, 0.8, 0.8, '#3ddc84');
      break;
    case 'tophat':
      px(-0.5, -1, 9, 1, '#1b1b22'); px(1.5, -5, 5, 4, '#1b1b22'); px(1.5, -2, 5, 0.8, '#e63946');
      break;
    case 'cowboy':
      px(-2, -0.8, 12, 1, '#8a5220'); px(-2, -1.4, 1.2, 0.8, '#8a5220'); px(8.8, -1.4, 1.2, 0.8, '#8a5220');
      px(1.5, -3.6, 5, 2.8, '#a8672c'); px(1.5, -1.5, 5, 0.6, '#5a3416');
      break;
    case 'party':
      px(3.2, -5, 1.6, 1, '#ff5d73'); px(2.6, -4, 2.8, 1.3, '#3fa7ff'); px(2, -2.7, 4, 1.4, '#ff5d73'); px(1.4, -1.3, 5.2, 1.3, '#3fa7ff');
      px(3.3, -6, 1.4, 1.2, '#ffe14d');
      break;
    case 'pirate':
      px(-0.5, -2.2, 9, 2.4, '#1b1b22'); px(1, -3, 6, 1, '#1b1b22'); px(3.4, -1.7, 1.2, 1.2, '#ffffff');
      px(1, 2.6, 2.2, 2, '#1b1b22'); px(0, 2, 8, 0.4, '#1b1b22');
      break;
    case 'viking':
      px(0.3, -2.2, 7.4, 2.4, '#9aa7b8'); px(0.3, -0.4, 7.4, 0.6, '#6b788a'); px(3.5, -2.2, 1, 2.4, '#ffd23f');
      px(-1.4, -3.6, 1.4, 2.4, '#fff3e0'); px(8, -3.6, 1.4, 2.4, '#fff3e0'); px(-1.8, -4.4, 1, 1, '#fff3e0'); px(8.8, -4.4, 1, 1, '#fff3e0');
      break;
    case 'wizard':
      px(-1, -0.8, 10, 1, '#5b2bb5'); px(1.5, -3, 5, 2.2, '#7444d8'); px(2.5, -5, 3, 2, '#7444d8'); px(3.3, -6.6, 1.5, 1.6, '#7444d8');
      px(4.6, -7, 1, 0.8, '#7444d8'); px(3, -2.4, 1, 1, '#ffe14d'); px(5, -4, 0.8, 0.8, '#ffe14d');
      break;
    case 'propeller':
      px(1, -1.6, 6, 1.8, '#3fa7ff'); px(1, -1.6, 2, 1.8, '#ffe14d'); px(5, -1.6, 2, 1.8, '#ff5d73');
      px(3.6, -2.6, 0.8, 1, '#1b1b22');
      if (Math.floor(performance.now() / 80) % 2) px(0.5, -3.2, 7, 0.6, '#e63946'); else px(2.5, -3.2, 3, 0.6, '#e63946');
      break;
    case 'shades':
      px(0.6, 2.6, 3, 1.6, '#1b1b22'); px(4.4, 2.6, 3, 1.6, '#1b1b22'); px(3.4, 2.8, 1.2, 0.5, '#1b1b22');
      px(1, 2.9, 1, 0.5, '#7df9ff'); px(4.8, 2.9, 1, 0.5, '#7df9ff');
      break;
    case 'cape':
      // Shown as a little cape on a hanger when floating as a prize.
      px(1, 1, 6, 1, '#b81d2b'); px(0.5, 2, 7, 4, '#e63946'); px(3.4, 0, 1.2, 1, '#ffd23f');
      break;
  }
}

// ---------------- HUD (full-res canvas) ----------------

export function text(ctx, str, x, y, size, color, align = 'center') {
  // Too wide for the screen (a phone held upright): split into two lines, or shrink.
  const maxW = ctx.canvas.width * 0.94;
  ctx.font = `${R(size)}px ${FONT}`;
  const w = ctx.measureText(str).width;
  if (w > maxW / 0.75 && align === 'center') {
    const mid = str.length / 2;
    let cut = -1;
    for (let i = 0; i < str.length; i++) if (str[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    if (cut > 0) {
      const a = str.slice(0, cut), b = str.slice(cut + 1), s2 = size * 0.9;
      ctx.font = `${R(s2)}px ${FONT}`;
      const fit = Math.min(1, maxW / Math.max(ctx.measureText(a).width, ctx.measureText(b).width));
      text(ctx, a, x, y - s2 * fit * 0.55, s2 * fit, color, align);
      text(ctx, b, x, y + s2 * fit * 0.55, s2 * fit, color, align);
      return;
    }
  }
  if (w > maxW) { size *= maxW / w; ctx.font = `${R(size)}px ${FONT}`; }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.2);
  ctx.lineJoin = 'round';
  // A solid drop shadow under the outline, so words pop over sky, sea and clouds.
  const d = Math.max(2, size * 0.09);
  ctx.strokeStyle = ctx.fillStyle = 'rgba(10,14,30,0.9)';
  ctx.strokeText(str, x, y + d);
  ctx.fillText(str, x, y + d);
  ctx.strokeStyle = 'rgba(10,14,30,0.95)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// Path helpers for the HUD (full-res canvas, so smooth curves are fine here).
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Sizes of the score plate at the top of a lane.
function hudSize(L) {
  const r = clamp(Math.min(L.w * 0.1, L.h * 0.085), 22, 64);
  return { r, pad: clamp(L.w * 0.025, 8, 18) };
}
export function laneHudBottom(L) {
  const { pad, r } = hudSize(L);
  return pad + r * 2 + pad * 0.5;
}

export function drawLaneHud(ctx, L, p, ch, opts) {
  const { r, pad } = hudSize(L);
  drawScore(ctx, L, p, r, pad);
  const fs = r * 0.6, by = pad + r * 2, bh = 0;

  // Picture cue for the next obstacle, so non-readers know what to do.
  const next = p.obstacles
    .map(o => ({ o, z: (o.arrive - p.clock) / o.travel }))
    .filter(e => !e.o.result && KIND_INFO[e.o.kind] && e.z > -0.05 && e.z < 0.8)
    .sort((a, b) => a.z - b.z)[0];
  if (p.throwing?.type === 'wyr') {
    // Would You Rather draws one shared board in the middle: see drawWyrBoard.
  } else if (p.throwing) {
    const size = clamp(L.w * 0.1, 22, 64);
    const y = L.horizon * 0.66;
    const bob = Math.sin(performance.now() / 150) * size * 0.08;
    const type = p.throwing.type;
    const kind = { bubbles: 'flap', karate: 'chop', fire: 'spray', dance: 'dance', kaiju: 'kaiju', bugs: 'bugs', goalie: 'goalie', climb: 'climb', tray: 'tray', rain: 'rain', fly: 'flap', chops: 'chop', swim: 'rope' }[type] || 'throw';
    const B = p.throwing;
    const word = type === 'swim' ? `SWIM! ${B.goal - B.dist} to go` : type === 'fly' ? `FLAP! ${B.flaps} flaps` : type === 'chops' ? `CHOP! ${B.chops} chops` : kind === 'flap' ? (B.falling ? 'WHEEE!' : B.bubble ? `FLAP! ${B.bubble.flaps - B.bubble.done} more` : 'FLAP!') : { chop: 'CHOP!', throw: 'THROW!', spray: 'POINT & SPRAY!', dance: B.move ? DANCE[B.move.key].name : 'DANCE!', kaiju: 'SMASH & STOMP!', bugs: 'SPLAT THE BUGS!', goalie: 'BLOCK THE BALLS!', climb: `CLIMB! ${B.height || 0} m`, tray: `CATCH! ${B.stack?.length || 0} stacked`, rain: B.roof ? (B.water > 0.35 ? (B.want < 0 ? '◀ LEAN LEFT!' : 'LEAN RIGHT! ▶') : 'FILLING…') : 'HANDS UP = ROOF!' }[kind];
    if (kind === 'dance' && B.move) {
      // Picture card of the move to copy, with a shrinking timer bar.
      const m = B.move, k = Math.min(1, m.t / m.dur);
      ctx.fillStyle = m.done ? 'rgba(61,220,132,0.85)' : 'rgba(10,14,30,0.6)';
      ctx.fillRect(L.cx - size * 0.9, y - size * 1.25, size * 1.8, size * 1.5);
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(L.cx - size * 0.9, y + size * 0.2, size * 1.8 * (1 - k), size * 0.08);
      drawCharacter(ctx, L.cx, y - size * 0.35, size * 0.3, cartoonPose(DANCE[m.key].pose), { id: 'none', body: '#ffffff', limb: '#ffffff', head: '#ffffff', belly: '#ffffff' });
    } else cueIcon(ctx, { kind }, L.cx, y - size * 0.3 + bob, size);
    text(ctx, word, L.cx, y + size * 0.85, size * 0.62, '#ffb02e');
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
      // Kept see-through and down by the avatar, so it never hides what's coming.
      const r = Math.min(L.w * 0.24, L.h * 0.12) * pop;
      const cx = L.cx + (e.hue % 2 ? 1 : -1) * L.w * 0.18, cy = L.ground - L.depth * 0.3;
      ctx.save();
      ctx.globalAlpha = 0.5 * (k > 0.75 ? (1 - k) / 0.25 : 1);
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
      // "+70" pops in, drifts up and fades away.
      ctx.save();
      ctx.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      const pop = k < 0.12 ? 0.6 + k / 0.12 * 0.7 : k < 0.25 ? 1.3 - (k - 0.12) / 0.13 * 0.3 : 1;
      const ease = 1 - (1 - k) * (1 - k);
      text(ctx, e.text, L.cx + L.w * 0.22 + Math.sin(k * 6) * L.w * 0.01, L.horizon + L.depth * 0.45 - ease * L.h * 0.2, clamp(L.w * 0.11, 20, 60) * pop, '#ffe14d');
      ctx.restore();
      continue;
    }
    if (e.type === 'fire') {
      // Streak milestone: wobbling flame-coloured text and pixel flames.
      ctx.save();
      ctx.globalAlpha = 0.6 * (k > 0.8 ? (1 - k) / 0.2 : 1);
      const cols = ['#ff3b30', '#ff9f1c', '#ffe14d'];
      const size = clamp(L.w * 0.11, 22, 64) * (1 + 0.08 * Math.sin(e.t * 20));
      text(ctx, e.text, L.cx + Math.sin(e.t * 25) * 4, L.ground - L.depth * 0.08, size, cols[Math.floor(e.t * 12) % 3]);
      const fw = L.w / 14;
      for (let i = 0; i < 14; i++) {
        const fh = (0.5 + 0.5 * Math.abs(Math.sin(e.t * 9 + i * 1.7))) * L.h * 0.07;
        ctx.fillStyle = cols[i % 3];
        ctx.fillRect(R(L.x + i * fw), R(L.h - fh), R(fw * 0.8), R(fh));
      }
      ctx.restore();
      continue;
    }
    if (e.type === 'levelup') {
      ctx.save();
      if (k < 0.2) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - k / 0.2)})`;
        ctx.fillRect(L.x, 0, L.w, L.h);
      }
      ctx.globalAlpha = 0.5 * (k > 0.8 ? (1 - k) / 0.2 : 1);
      const cy = L.ground - L.depth * 0.25;
      ctx.translate(L.cx, cy);
      ctx.rotate(e.t * 1.5);
      ctx.fillStyle = 'rgba(255,225,77,0.35)';
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(0, -L.w * 0.03, L.w * 0.6, L.w * 0.06);
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.8 * (k > 0.8 ? (1 - k) / 0.2 : 1);
      text(ctx, e.text, L.cx, cy, clamp(L.w * 0.1, 20, 60) * (k < 0.15 ? 0.5 + k / 0.3 : 1), '#ffe14d');
      ctx.restore();
      continue;
    }
    if (e.type === 'super' || e.type === 'gear') {
      ctx.save();
      ctx.globalAlpha = 0.8 * (k > 0.8 ? (1 - k) / 0.2 : 1);
      const col = e.type === 'super' ? (Math.floor(e.t * 16) % 2 ? '#7df9ff' : '#ffffff') : '#ffe14d';
      const size = clamp(L.w * 0.1, 20, 58) * (k < 0.1 ? 0.6 + k * 4 : 1);
      text(ctx, e.text, L.cx + (e.type === 'super' ? Math.sin(e.t * 50) * 3 : 0), L.ground - L.depth * 0.42, size, col);
      ctx.restore();
      continue;
    }
    if (e.type !== 'text') continue;
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    text(ctx, e.text, L.cx, L.horizon + L.depth * 0.2 - k * L.h * 0.08, clamp(L.w * 0.12, 22, 64) * (1 + 0.25 * (1 - k)), e.color);
    ctx.restore();
  }

  // Speed lines rush in from the lane edges on a lean or a big moment.
  const rush = Math.max(p.act?.leanL || p.act?.leanR ? 0.7 : 0,
    ...p.fx.filter(e => ['fire', 'levelup'].includes(e.type)).map(e => 1 - e.t / e.life));
  if (rush > 0.05 && !p.paused) drawSpeedLines(ctx, L, rush, p.act?.leanL ? -1 : p.act?.leanR ? 1 : 0);

  if (p.paused) text(ctx, p.paused, L.cx, L.h * 0.5, clamp(L.w * 0.075, 18, 44), '#ffffff');

  if (opts.debug) {
    const a = p.act;
    const on = ['jump', 'left', 'right', 'reach', 'leanL', 'leanR', 'duck', 'throw'].filter(k => a[k]).join(' ') || '-';
    ctx.font = `${R(fs * 0.5)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(`skill ${p.skill.toFixed(2)}  ${on}`, L.x + pad * 2, by + bh + fs * 0.6);
    ctx.fillText(`hit ${p.hits}  miss ${p.misses}`, L.x + pad * 2, by + bh + fs * 1.2);
  }
}

function drawSpeedLines(ctx, L, k, lean) {
  const t = performance.now() / 1000, vx = L.cx, vy = L.horizon * 1.1;
  ctx.save();
  ctx.beginPath(); ctx.rect(L.x, 0, L.w, L.h); ctx.clip();
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    // Leaning left, the lines come from the right (the wind rushes past).
    if (lean && side === lean && i % 4 < 2) continue;
    const f = (i * 0.137 + t * (1.6 + (i % 3) * 0.4)) % 1;
    const sx = side > 0 ? L.x + L.w : L.x, sy = L.h * ((i * 0.29) % 1) * 0.95 + L.h * 0.03;
    const dx = vx - sx, dy = vy - sy, m = Math.hypot(dx, dy);
    const a = 0.06 + f * 0.22, len = L.w * (0.08 + 0.1 * ((i * 7) % 3) / 2);
    const x0 = sx + dx / m * a * L.w, y0 = sy + dy / m * a * L.w;
    ctx.globalAlpha = 0.65 * k * Math.sin(f * Math.PI);
    ctx.lineWidth = Math.max(2, L.w * (0.006 + 0.004 * (i % 2)));
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx / m * len, y0 + dy / m * len); ctx.stroke();
  }
  ctx.restore();
}

// Score plate in the lane's top-left corner: the kid's face (or number), their
// name and a big score, plus a streak counter once they get going.
function drawScore(ctx, L, p, r, pad) {
  // The plate swells and rattles a little each time points go up.
  const k = p.bump > 0 ? p.bump / 0.5 : 0;
  const x0 = L.x + pad + (L.x < 1 ? SAFE.l : 0), y0 = pad;
  const cx = x0 + r, cy = y0 + r;
  const label = p.score.toLocaleString();
  const sf = r * 1.05, nf = r * 0.4;
  ctx.font = `${R(sf)}px ${FONT}`;
  const tw = Math.max(ctx.measureText(label).width, r * 1.2);
  const maxW = L.w - pad * 2 - r * 2;
  const pw = Math.min(r * 2 + r * 0.35 + tw + r * 0.55, r * 2 + maxW);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1 + 0.12 * k, 1 + 0.12 * k);
  ctx.rotate(k * 0.04 * Math.sin(performance.now() / 25));
  ctx.translate(-cx, -cy);
  // Plate.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowOffsetY = r * 0.08; ctx.shadowBlur = r * 0.25;
  roundRect(ctx, x0, y0 + r * 0.18, pw, r * 1.64, r * 0.82);
  ctx.fillStyle = 'rgba(26,42,64,0.82)';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x0, y0 + r * 0.18, pw, r * 1.64, r * 0.82);
  ctx.lineWidth = Math.max(2, r * 0.1); ctx.strokeStyle = p.color; ctx.stroke();
  // Face circle.
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = p.color; ctx.fill();
  if (p.faceImg?.complete && p.faceImg.naturalWidth) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(p.faceImg, cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72);
    ctx.restore();
  } else text(ctx, String(p.index + 1), cx, cy + r * 0.05, r * 1.1, '#ffffff');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, r * 0.1); ctx.strokeStyle = '#1a2a40'; ctx.stroke();
  // Name and score.
  const tx = x0 + r * 2 + r * 0.3, room = pw - (tx - x0) - r * 0.4;
  ctx.font = `${R(nf)}px ${FONT}`;
  const nw = ctx.measureText(p.name).width;
  text(ctx, p.name, tx, cy - r * 0.42, nw > room ? nf * room / nw : nf, '#ffffff', 'left');
  ctx.font = `${R(sf)}px ${FONT}`;
  const sw = ctx.measureText(label).width;
  text(ctx, label, tx, cy + r * 0.28, sw > room ? sf * room / sw : sf, k > 0.3 ? '#ffb02e' : '#ffe14d', 'left');
  ctx.restore();
  // Streak counter.
  if (p.streak >= 3) {
    const sx = x0 + pw + r * 0.25, sr = r * 0.55;
    if (sx + sr * 2.6 < L.x + L.w - pad) {
      roundRect(ctx, sx, cy - sr, sr * 2.6, sr * 2, sr);
      ctx.fillStyle = '#ff8a1a'; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.08); ctx.strokeStyle = '#1a2a40'; ctx.stroke();
      text(ctx, `x${p.streak}`, sx + sr * 1.3, cy + sr * 0.05, sr * 1.15, '#ffffff');
    }
  }
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
  const DOWN = UP.slice().reverse();
  const LEFT = ['..#..', '.##..', '#####', '.##..', '..#..'];
  const RIGHT = LEFT.map(r => [...r].reverse().join(''));
  const BOTH = ['.#.#.', '##.##', '#####', '##.##', '.#.#.'];
  const HANDS = ['#...#', '#...#', '#.#.#', '.###.', '..#..'];
  const BALL = ['.###.', '#####', '#####', '#####', '.###.'];
  const WINGS = ['#...#', '##.##', '.###.', '..#..', '.....'];
  const HAND = ['#####', '#####', '.....', '#####', '#####'];
  const color = KIND_INFO[o.kind]?.color || (o.kind === 'spray' || o.kind === 'rain' ? '#5ab4ff' : '#ffb02e');
  let rows;
  const DROP = ['..#..', '.###.', '#####', '#####', '.###.'];
  if (o.kind === 'spray' || o.kind === 'rain') { rows = DROP; }
  else if (o.kind === 'flap') rows = Math.floor(performance.now() / 250) % 2 ? WINGS : WINGS.slice().reverse();
  else if (o.kind === 'chop') rows = HAND;
  else if (o.kind === 'log') rows = UP;
  else if (o.kind === 'rope') rows = HANDS;
  else if (o.kind === 'throw') rows = BALL;
  else if (o.kind === 'bird') rows = DOWN; // duck under the bird
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
  const scale = ctx.canvas.width / (innerWidth || ctx.canvas.width);
  const r = 16 * scale, bw = Math.max(3, 5 * scale);
  // A chunky game frame: soft shadow, dark outline, thick yellow border.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10 * scale; ctx.shadowOffsetY = 4 * scale;
  roundRect(ctx, dx - bw, dy - bw, dw + bw * 2, dh + bw * 2, r + bw);
  ctx.fillStyle = '#1a2a40';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, dx, dy, dw, dh, r);
  ctx.clip();
  ctx.translate(dx + dw, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, dw, dh);
  ctx.restore();
  roundRect(ctx, dx - bw * 0.45, dy - bw * 0.45, dw + bw * 0.9, dh + bw * 0.9, r + bw * 0.45);
  ctx.lineWidth = bw * 0.9;
  ctx.strokeStyle = '#ffd23f';
  ctx.stroke();

  ctx.save();
  roundRect(ctx, dx, dy, dw, dh, r);
  ctx.clip();
  const P = (pts, i) => [dx + pts[i].x * dh, dy + pts[i].y * dh];
  const lw = Math.max(3, dh * 0.016);
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const person of people) {
    const pts = person.pts, ok = i => pts[i] && pts[i].v >= 0.3;
    // Thick neon bones in the kid's colour with a bright core.
    ctx.shadowColor = person.color; ctx.shadowBlur = lw * 2.5;
    ctx.strokeStyle = person.color; ctx.lineWidth = lw * 2.2;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      if (!ok(a) || !ok(b)) continue;
      ctx.moveTo(...P(pts, a)); ctx.lineTo(...P(pts, b));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw * 0.6;
    ctx.stroke();
    // Glowing dots on the joints.
    ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = lw * 2;
    for (const i of JOINTS) {
      if (!ok(i)) continue;
      const [jx, jy] = P(pts, i), big = i === 15 || i === 16;
      ctx.beginPath(); ctx.arc(jx, jy, lw * (big ? 1.5 : 1.1), 0, Math.PI * 2);
      ctx.fillStyle = big ? '#7df9ff' : '#ffe14d'; ctx.fill();
      ctx.beginPath(); ctx.arc(jx, jy, lw * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.shadowBlur = 0;
    // A sporty headband across the forehead, in the kid's colour.
    if (ok(7) && ok(8) && ok(2) && ok(5)) {
      const [ax, ay] = P(pts, 7), [bx, by] = P(pts, 8), [ex1, ey1] = P(pts, 2), [ex2, ey2] = P(pts, 5);
      const span = Math.hypot(bx - ax, by - ay), up = span * 0.32;
      const mx = (ex1 + ex2) / 2, my = (ey1 + ey2) / 2 - up;
      const ux = (bx - ax) / (span || 1), uy = (by - ay) / (span || 1), half = span * 0.62;
      ctx.lineWidth = Math.max(lw * 1.6, span * 0.24);
      ctx.strokeStyle = '#1a2a40';
      ctx.beginPath(); ctx.moveTo(mx - ux * half, my - uy * half); ctx.lineTo(mx + ux * half, my + uy * half); ctx.stroke();
      ctx.lineWidth = Math.max(lw * 1.1, span * 0.17);
      ctx.strokeStyle = person.color;
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, span * 0.04);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(mx - ux * half * 0.85, my - uy * half * 0.85 - span * 0.04); ctx.lineTo(mx + ux * half * 0.85, my + uy * half * 0.85 - span * 0.04); ctx.stroke();
    }
  }
  ctx.restore();
  for (const person of people) {
    if (!person.label) continue;
    const n = person.pts[0];
    text(ctx, person.label, dx + n.x * dh, dy + Math.max(n.y * dh - dh * 0.14, dh * 0.07), Math.max(16, dh * 0.07), person.color);
  }
  return { dx, dy, dw, dh };
}
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// ---------------- Hand-zone break games ----------------

// Body-space point (torso units around the hips) to the lane's pixels.
function bodyXY(L, x, y) {
  return { x: L.cx + x * L.S, y: L.ground - 1.65 * L.S + y * L.S };
}

function drawVine(ctx, L, C, pan) {
  const S = L.S, x = L.cx - S * 0.25;
  const top = -pan - L.h, bottom = L.ground;
  rect(ctx, x, top, S * 0.5, bottom - top, '#2f9e44');
  rect(ctx, x + S * 0.1, top, S * 0.12, bottom - top, '#4cc94c');
  for (let y = bottom - S * 0.8; y > top; y -= S * 1.1) {
    const side = Math.round(y / (S * 1.1)) % 2 ? 1 : -1;
    rect(ctx, x + (side > 0 ? S * 0.5 : -S * 0.7), y, S * 0.7, S * 0.35, '#3fbf4f');
  }
}

function drawMini(ctx, L, p, T, time) {
  const S = L.S;
  if (T.type === 'wyr') return; // all on the shared board: see drawWyrBoard
  if (T.type === 'bugs') {
    for (const b of T.bugs) {
      const { x, y } = bodyXY(L, b.x, b.y);
      const k = Math.min(1, b.t / 0.15), r = S * 0.45 * k, wing = Math.floor(time * 20) % 2;
      const blink = b.life - b.t < 0.4 && Math.floor(time * 12) % 2;
      if (blink) continue;
      rect(ctx, x - r * 1.4, y - r * (wing ? 1.2 : 0.6), r * 0.9, r * 0.6, 'rgba(220,240,255,0.85)');
      rect(ctx, x + r * 0.5, y - r * (wing ? 1.2 : 0.6), r * 0.9, r * 0.6, 'rgba(220,240,255,0.85)');
      block(ctx, x - r * 0.7, y - r * 0.6, r * 1.4, r * 1.2, '#8a3fd1', 0.2);
      rect(ctx, x - r * 0.45, y - r * 0.35, r * 0.35, r * 0.35, '#ffffff');
      rect(ctx, x + r * 0.1, y - r * 0.35, r * 0.35, r * 0.35, '#ffffff');
      rect(ctx, x - r * 0.32, y - r * 0.22, r * 0.15, r * 0.15, '#1b1b22');
      rect(ctx, x + r * 0.23, y - r * 0.22, r * 0.15, r * 0.15, '#1b1b22');
      rect(ctx, x - r * 0.05, y + r * 0.5, r * 0.1, r * 0.5, '#1b1b22'); // stinger
    }
    for (const s of T.splats) {
      const { x, y } = bodyXY(L, s.x, s.y), k = s.t / 0.7;
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785, d = S * (0.3 + 0.8 * k);
        rect(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, S * 0.2 * (1 - k) + 1, S * 0.2 * (1 - k) + 1, i % 2 ? '#7be04a' : '#c6ff7a');
      }
    }
  } else if (T.type === 'goalie') {
    for (const s of T.shots) {
      const z = bodyXY(L, s.x, s.y);
      let k = Math.min(1, s.t / s.dur), x, y, r;
      if (s.done === 'saved') {
        // Punched away, back up and out.
        const q = s.doneT / 0.6;
        x = z.x + (s.x < 0 ? -1 : 1) * q * S * 3; y = z.y - q * S * 3; r = S * 0.5 * (1 - q * 0.5);
      } else {
        const sx = L.cx, sy = L.horizon;
        x = sx + (z.x - sx) * k; y = sy + (z.y - sy) * k - Math.sin(k * Math.PI) * S * 1.2;
        r = S * (0.12 + 0.4 * k);
        if (!s.done && k > 0.5) {
          // Warning box where it will land.
          ctx.globalAlpha = 0.4 + 0.4 * (Math.floor(time * 10) % 2);
          ctx.strokeStyle = '#ffe14d';
          ctx.lineWidth = Math.max(1, S * 0.1);
          ctx.strokeRect(R(z.x - S * 0.7), R(z.y - S * 0.7), R(S * 1.4), R(S * 1.4));
          ctx.globalAlpha = 1;
        }
        if (s.done === 'goal') ctx.globalAlpha = 1 - s.doneT / 0.6;
      }
      rect(ctx, x - r, y - r * 0.7, r * 2, r * 1.4, '#ffffff');
      rect(ctx, x - r * 0.7, y - r, r * 1.4, r * 2, '#ffffff');
      rect(ctx, x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6, '#1b1b22');
      rect(ctx, x - r * 0.95, y - r * 0.15, r * 0.3, r * 0.3, '#1b1b22');
      rect(ctx, x + r * 0.65, y - r * 0.15, r * 0.3, r * 0.3, '#1b1b22');
      ctx.globalAlpha = 1;
    }
  } else if (T.type === 'kaiju') {
    // A tiny city around the kid's feet: they're the giant now.
    for (const b of T.city) {
      const { x } = bodyXY(L, b.x, 0), g = L.ground, w = S * 0.75;
      if (b.down) {
        if (b.downT < 2) for (let i = 0; i < 4; i++) block(ctx, x - w / 2 + i * w * 0.25, g - S * 0.2 - (i % 2) * S * 0.15, w * 0.3, S * 0.25, b.color, 0.3);
        continue;
      }
      const h = b.h * S;
      block(ctx, x - w / 2, g - h, w, h, b.color, 0.08);
      for (let wy = g - h + S * 0.15; wy < g - S * 0.3; wy += S * 0.32) {
        for (const wx of [0.15, 0.55]) rect(ctx, x - w / 2 + w * wx, wy, w * 0.25, S * 0.16, Math.floor(wy + time) % 3 ? '#ffe9a0' : '#5a6a80');
      }
    }
    for (const d of T.dust) {
      const { x, y } = bodyXY(L, d.x, d.y);
      ctx.globalAlpha = 1 - d.t / 0.9;
      rect(ctx, x, y, S * 0.25, S * 0.25, '#c8c0b0');
    }
    ctx.globalAlpha = 1;
    for (const c of T.copters) {
      let { x, y } = bodyXY(L, c.x, c.y + Math.sin(c.t * 4) * 0.12);
      ctx.save();
      if (c.done) { y += c.doneT * c.doneT * S * 6; x += c.side * c.doneT * S * 2; ctx.globalAlpha = 1 - c.doneT / 0.8; }
      const u = S * 0.3, rot = Math.floor(time * 30) % 2;
      block(ctx, x - u, y - u * 0.6, u * 2, u * 1.2, '#ff5d73', 0.25);
      rect(ctx, x - c.side * u * 0.2 - u * 0.4, y - u * 0.4, u * 0.6, u * 0.5, '#bfe3ff');
      rect(ctx, x + c.side * u, y - u * 0.2, u * 1.4 * c.side, u * 0.3, '#c9304a');
      rect(ctx, x - (rot ? u * 1.6 : u * 0.6), y - u * 0.9, rot ? u * 3.2 : u * 1.2, u * 0.15, '#3a3a44');
      ctx.restore();
    }
  } else if (T.type === 'swim') {
    // A pond across the lane; the far shore comes closer with every stroke.
    const k = clamp(T.shown, 0, 1);
    const shoreY = L.horizon + (L.ground - S * 2.2 - L.horizon) * k;
    rect(ctx, L.x, L.horizon, L.w, L.h - L.horizon, '#2f86d6');
    rect(ctx, L.x, shoreY - S * 0.5, L.w, S * 0.5, '#e8cf8a');
    rect(ctx, L.x, shoreY - S * 0.5, L.w, Math.max(1, S * 0.08), '#5fb83b');
    // Finish flag on the far shore.
    rect(ctx, L.cx - S * 0.03, shoreY - S * 1.5, S * 0.08, S * 1.0, '#ffffff');
    rect(ctx, L.cx + S * 0.05, shoreY - S * 1.5, S * 0.5, S * 0.3, '#ff5d73');
    for (let r = 0; r < 7; r++) {
      const yy = shoreY + ((r + 0.5) / 7) * (L.h - shoreY), wx = L.x + (((r * 0.37 + time * 0.08) % 1)) * L.w;
      rect(ctx, wx, yy, S * 0.7, Math.max(1, S * 0.07), '#7cc4ff');
    }
    for (let k2 = 0; k2 < 3; k2++) {
      const lx = L.x + ((k2 * 0.31 + 0.12 + p.index * 0.17) % 1) * L.w, ly = shoreY + (L.ground - shoreY) * (0.25 + k2 * 0.22);
      rect(ctx, lx, ly, S * 0.6, S * 0.18, '#3f9e4a');
    }
  } else if (T.type === 'rain') {
    // Rainstorm: dark streaks, a roof over the hands, and two buckets.
    const top = L.horizon * 0.2;
    for (let k = 0; k < 26; k++) {
      const rx = L.x + ((k * 0.137 + p.index * 0.21) % 1) * L.w;
      const ry = top + ((time * 1.6 + k * 0.29) % 1) * (L.ground - top);
      rect(ctx, rx, ry, Math.max(1, S * 0.05), S * 0.35, 'rgba(170,205,255,0.7)');
    }
    const hs = (p.hands || []).filter(Boolean);
    if (T.roof && hs.length === 2) {
      const a = bodyXY(L, hs[0].x, hs[0].y), b = bodyXY(L, hs[1].x, hs[1].y);
      const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - S * 0.15, w = S * 1.9;
      const tiltY = clamp(T.tilt, -1.2, 1.2) * S * 0.25;
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, cy + tiltY); ctx.lineTo(cx, cy - S * 0.55); ctx.lineTo(cx + w / 2, cy - tiltY); ctx.closePath();
      ctx.fill();
      // Water collected on the roof.
      rect(ctx, cx - S * 0.45, cy - S * 0.75 - S * 0.4 * T.water, S * 0.9, S * 0.4 * T.water, '#3f86d6');
    }
    for (const side of [-1, 1]) {
      const tip = T.tip?.side === side ? Math.min(1, T.tip.t / 0.4) : 0;
      const { x, y } = bodyXY(L, side * 1.85, 0.75);
      const bw = S * 0.9, bh = S * 1.0;
      ctx.save();
      ctx.translate(R(x), R(y));
      ctx.rotate(side * tip * 1.4);
      if (T.want === side && !T.tip) { ctx.fillStyle = 'rgba(255,225,77,' + (0.5 + 0.4 * Math.sin(time * 8)) + ')'; ctx.fillRect(R(-bw / 2 - S * 0.1), R(-bh - S * 0.1), R(bw + S * 0.2), R(bh + S * 0.2)); }
      rect(ctx, -bw / 2, -bh, bw, bh, '#8a95a8');
      rect(ctx, -bw / 2 + S * 0.08, -bh + S * 0.08, bw - S * 0.16, bh - S * 0.16, '#3f86d6');
      rect(ctx, -bw / 2 + S * 0.08, -bh + S * 0.08, bw - S * 0.16, (bh - S * 0.16) * (1 - T.buckets[side]), '#4a5468');
      rect(ctx, -bw / 2, -bh, bw, S * 0.1, '#b8c2d4');
      ctx.restore();
      if (T.want === side && !T.tip) text(ctx, side < 0 ? '▼' : '▼', x, y - bh - S * 0.35 + Math.sin(time * 6) * S * 0.1, S * 0.5, '#ffe14d');
      if (T.pour?.side === side) {
        const k = T.pour.t / 0.6;
        for (let i = 0; i < 6; i++) rect(ctx, x - S * 0.1 + Math.sin(i + time * 20) * S * 0.08, y - bh - S * (2.4 - i * 0.35) , S * 0.2, S * 0.3, `rgba(80,160,255,${1 - k})`);
      }
    }
  } else if (T.type === 'tray') {
    // Falling pancakes and boots, and the tray with its tower.
    const trayY = L.ground - 1.65 * S - 1.0 * S;
    const col = x => L.cx + x * S * 1.6;
    for (const it of T.items) {
      if (it.done) continue;
      const k = it.t / it.dur, x = col(it.x), y = -S + (trayY - S * 0.3 * T.stack.length - (-S)) * k;
      if (it.kind === 'boot') {
        rect(ctx, x - S * 0.25, y - S * 0.6, S * 0.4, S * 0.6, '#6b3e18');
        rect(ctx, x - S * 0.25, y - S * 0.1, S * 0.7, S * 0.3, '#6b3e18');
        rect(ctx, x - S * 0.25, y + S * 0.15, S * 0.7, S * 0.1, '#2b2b33');
      } else {
        rect(ctx, x - S * 0.55, y - S * 0.12, S * 1.1, S * 0.24, '#e0a850');
        rect(ctx, x - S * 0.45, y - S * 0.2, S * 0.9, S * 0.1, '#f0c070');
      }
    }
    const tx = col(T.x) + (T.wobble > 0 ? Math.sin(time * 40) * S * 0.2 : 0);
    rect(ctx, tx - S * 0.8, trayY, S * 1.6, S * 0.16, '#d8dce6');
    rect(ctx, tx - S * 0.8, trayY + S * 0.16, S * 1.6, S * 0.06, '#9aa7b8');
    T.stack.forEach((c, i) => {
      const sway = Math.sin(time * 3 + i * 0.4) * S * 0.03 * i;
      rect(ctx, tx - S * 0.55 + sway, trayY - S * 0.3 * (i + 1), S * 1.1, S * 0.26, c);
      rect(ctx, tx - S * 0.45 + sway, trayY - S * 0.3 * (i + 1), S * 0.9, S * 0.06, '#f6d08a');
    });
    if (T.stack.length) {
      const top = trayY - S * 0.3 * T.stack.length + Math.sin(time * 3 + T.stack.length * 0.4) * S * 0.03 * T.stack.length;
      rect(ctx, tx - S * 0.15, top - S * 0.12, S * 0.3, S * 0.14, '#ffe14d'); // butter
    }
  } else if (T.type === 'dance') {
    // Disco floor lights pulsing under the dancer.
    const beat = Math.floor(time * 2.13);
    const cols = ['#ff5d73', '#ffe14d', '#3ddc84', '#3fa7ff', '#b57bff'];
    for (let i = -2; i <= 2; i++) {
      ctx.globalAlpha = 0.55;
      rect(ctx, L.cx + i * S * 0.9 - S * 0.4, L.ground - S * 0.3, S * 0.8, S * 0.3, cols[(i + 2 + beat) % 5]);
    }
    ctx.globalAlpha = 1;
    if (T.flash > 0) {
      ctx.globalAlpha = T.flash;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + time * 3;
        rect(ctx, L.cx + Math.cos(a) * S * 2, L.ground - 3 * S + Math.sin(a) * S * 1.6, S * 0.3, S * 0.3, cols[i % 5]);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- Would You Rather ----------

const WYR_TOP = 0.31;   // cards start below the question bar, as a share of the screen height

// A stick figure showing the pose that picks a card: h tall, top at y.
// Each arm is [elbow, hand], in head-heights from the neck.
const POSE_ARMS = {
  left: [[[-0.45, -0.45], [-0.85, -1.0]], [[0.3, 0.45], [0.35, 0.95]]],
  right: [[[-0.3, 0.45], [-0.35, 0.95]], [[0.45, -0.45], [0.85, -1.0]]],
  up: [[[-0.35, -0.55], [-0.5, -1.1]], [[0.35, -0.55], [0.5, -1.1]]],
  clap: [[[-0.6, 0.3], [-0.05, 0.15]], [[0.6, 0.3], [0.05, 0.15]]],
};
function drawPoseIcon(ctx, cx, y, h, pose) {
  const u = h / 3.4, neck = y + u * 1.9, hip = neck + u * 1.0;
  const at = ([dx, dy]) => [cx + dx * u, neck + dy * u];
  const limbs = [
    ...POSE_ARMS[pose].map(([e, w]) => [[cx, neck], at(e), at(w)]),
    [[cx, neck - u * 0.2], [cx, hip]],
    [[cx, hip], [cx - u * 0.35, hip + u * 1.1]],
    [[cx, hip], [cx + u * 0.35, hip + u * 1.1]],
  ];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, col] of [[u * 0.45, '#1b2340'], [u * 0.25, '#ffffff']]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    for (const pts of limbs) {
      ctx.beginPath();
      pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, neck - u * 0.55, u * 0.38 + (col === '#1b2340' ? u * 0.1 : 0), 0, Math.PI * 2);
    ctx.fill();
  }
}

function wrapLines(ctx, str, maxW, maxLines) {
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] += '…';
  }
  return lines;
}

// The answer cards, big in the middle of the screen for the whole squad: a
// picture, its words and the pose that picks it. Each kid's vote sits beside
// the card they pick, as a dot in their colour with their number; while a kid
// holds a pose, a ring fills round the dot that will be theirs.
export function drawWyrBoard(ctx, S, players, W, H) {
  if (!S || (S.phase !== 'ask' && S.phase !== 'reveal')) return;
  const q = S.qs[S.i], n = q.c.length, poses = posesFor(n);
  const reveal = S.phase === 'reveal';
  // As big as the screen allows: a phone held sideways still gets cards
  // about a third of its height, with words a kid can read from the couch.
  const cw = Math.min((W * 0.94) / (n * 1.25), H * 0.36);
  const gap = cw * 0.25;
  const x0 = W / 2 - (n * (cw + gap)) / 2 + gap / 2;
  const top = H * WYR_TOP;
  const fs = clamp(cw * 0.15, 14, 44);
  const votes = q.c.map((_, k) => players.filter(p => S.picks[p.index] === k));
  const most = Math.max(...votes.map(v => v.length));
  ctx.font = `${R(fs)}px ${FONT}`;
  const labels = q.c.map(c => wrapLines(ctx, c[0], cw * 0.92, 2));
  const ch = cw * 0.88 + fs * 2.5;
  const r = Math.min(gap * 0.4, cw * 0.11);
  for (let k = 0; k < n; k++) {
    const x = x0 + k * (cw + gap);
    const win = reveal && votes[k].length === most && most > 0;
    ctx.save();
    if (reveal && !win) ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(255,248,230,0.95)';
    ctx.fillRect(x, top, cw, ch);
    ctx.lineWidth = win ? Math.max(5, cw * 0.04) : 3;
    ctx.strokeStyle = win ? '#ffe14d' : '#1b2340';
    ctx.strokeRect(x, top, cw, ch);
    const im = wyrImage(q.id, k), is = cw * 0.82;
    if (im) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im, x + (cw - is) / 2, top + cw * 0.04, is, is);
    } else {
      ctx.font = `${R(cw * 0.5)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(q.c[k][1], x + cw / 2, top + cw * 0.46);
    }
    ctx.font = `${R(fs)}px ${FONT}`;
    ctx.fillStyle = '#1b2340';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels[k].forEach((ln, i) => ctx.fillText(ln, x + cw / 2, top + cw * 0.88 + fs * (0.7 + 1.1 * i + (2 - labels[k].length) * 0.55)));
    ctx.restore();
    // Votes beside the card, top down, plus rings for kids still holding.
    const vx = x + cw + gap / 2;
    const slots = [...votes[k].map(p => ({ p, k: 1 })),
      ...players.filter(p => p.throwing?.cand === k && p.throwing.hold > 0 && S.picks[p.index] !== k).map(p => ({ p, k: p.throwing.hold }))];
    slots.forEach(({ p, k: fill }, j) => {
      const vy = top + r * 1.2 + j * r * 2.4;
      ctx.beginPath();
      ctx.arc(vx, vy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill >= 1 ? p.color : 'rgba(10,14,30,0.55)';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.strokeStyle = fill >= 1 ? '#ffffff' : p.color;
      ctx.beginPath();
      ctx.arc(vx, vy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
      ctx.stroke();
      if (fill >= 1) text(ctx, String(p.index + 1), vx, vy + r * 0.05, r * 1.25, '#ffffff');
    });
    // The pose that picks this card, under it.
    if (!reveal) drawPoseIcon(ctx, x + cw / 2, top + ch + H * 0.01, Math.min(cw * 0.6, (H - top - ch - H * 0.03) / 1.2), poses[k]);
    else if (votes[k].length) text(ctx, votes[k].length === 1 ? '1 vote' : `${votes[k].length} votes`, x + cw / 2, top + ch + fs * 1.2, fs * 1.3, win ? '#ffe14d' : '#ffffff');
  }
}

// The question across the top of the screen, with a countdown bar.
export function drawWyrQuestion(ctx, S, W, y, H) {
  if (!S || (S.phase !== 'ask' && S.phase !== 'reveal')) return;
  const q = S.qs[S.i];
  const size = H * 0.042;
  ctx.font = `${R(size)}px ${FONT}`;
  const lines = wrapLines(ctx, q.q, W * 0.9, 2);
  const h = size * (1.2 * lines.length + 0.9);
  const bottom = H * WYR_TOP - H * 0.01;
  const y0 = Math.max(y, bottom - h);
  ctx.fillStyle = 'rgba(10,14,30,0.7)';
  ctx.fillRect(0, y0, W, h);
  lines.forEach((ln, i) => text(ctx, ln, W / 2, y0 + size * (0.75 + 1.2 * i), size, '#ffe14d'));
  const left = askLeft(S);
  if (left > 0) {
    ctx.fillStyle = '#3ddc84';
    ctx.fillRect(W / 2 - (W * 0.4) * left, y0 + h - size * 0.25, W * 0.8 * left, size * 0.18);
  }
}
