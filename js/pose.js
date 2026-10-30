// Camera + MediaPipe pose tracking (up to 4 people), all served from this site.
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

const WASM_DIR = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../models/pose_landmarker_lite.task', import.meta.url).href;

export async function startCamera(video, facing) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot use the camera here. Open the site over https in Safari or Chrome.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(video) {
  const s = video.srcObject;
  if (s) s.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}

// MediaPipe finds several small people in one wide frame poorly, so the frame
// is cut into overlapping vertical tiles, each with its own tracker. A kid
// standing anywhere is fully inside at least one tile, and duplicates found
// by two neighbouring tiles are merged.
export async function createTracker(video, players = 4) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
  const tileCount = players <= 1 ? 1 : players + 1;
  // Tiles are never wider than 60% of the picture, so a small kid at the back
  // still fills enough of a tile to be found (with 2 players the tiles used
  // to nearly cover the whole picture, and a far-away kid could go missing).
  const tileW = players <= 1 ? 1 : Math.min(1, 1.8 / Math.max(players, 3));
  const tiles = [];
  let delegate = 'GPU';
  for (let i = 0; i < tileCount; i++) {
    const center = tileCount === 1 ? 0.5 : tileW / 2 + (i * (1 - tileW)) / (tileCount - 1);
    let landmarker = null;
    for (const d of delegate === 'GPU' ? ['GPU', 'CPU'] : ['CPU']) {
      try {
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: d },
          runningMode: 'VIDEO',
          numPoses: 2,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
        delegate = d;
        break;
      } catch (e) {
        console.warn(`Pose ${d} delegate failed`, e);
        if (d === 'CPU') throw e;
      }
    }
    const canvas = document.createElement('canvas');
    tiles.push({ x0: center - tileW / 2, w: tileW, landmarker, canvas, ctx: canvas.getContext('2d'), poses: [], at: 0, lastTs: 0 });
  }

  let next = 0;
  // Two tiles per frame keeps phones responsive; each tile still updates often.
  const perFrame = Math.min(tiles.length, 2);

  return {
    players,
    close() { for (const t of tiles) { try { t.landmarker.close(); } catch { } } },
    // Returns { aspect, poses }. Each pose is 33 points in "height units":
    // x is mirrored (so the screen acts like a mirror) and scaled by the aspect
    // ratio, so x and y distances are comparable. y grows downwards.
    detect(nowMs) {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (video.readyState < 2 || !vw) return null;
      const aspect = vw / vh;
      for (let k = 0; k < perFrame; k++) {
        const t = tiles[next];
        next = (next + 1) % tiles.length;
        const sx = Math.round(t.x0 * vw), sw = Math.round(t.w * vw);
        if (t.canvas.width !== sw || t.canvas.height !== vh) { t.canvas.width = sw; t.canvas.height = vh; }
        t.ctx.drawImage(video, sx, 0, sw, vh, 0, 0, sw, vh);
        const ts = Math.max(Math.round(nowMs), t.lastTs + 1);
        t.lastTs = ts;
        const res = t.landmarker.detectForVideo(t.canvas, ts);
        t.at = nowMs;
        t.poses = (res.landmarks || []).map(pts => {
          const out = pts.map(p => ({ x: (1 - (t.x0 + p.x * t.w)) * aspect, y: p.y, v: p.visibility ?? 1 }));
          // How central the hips are in this tile: lower is better.
          const hx = (pts[23].x + pts[24].x) / 2;
          out.edge = Math.abs(hx - 0.5);
          return out;
        });
      }
      // Merge the latest result of every tile, dropping duplicates.
      const all = [];
      for (const t of tiles) if (nowMs - t.at < 1000) all.push(...t.poses);
      all.sort((a, b) => a.edge - b.edge);
      const kept = [];
      for (const p of all) {
        const hx = (p[23].x + p[24].x) / 2, hy = (p[23].y + p[24].y) / 2;
        const sh = Math.hypot((p[11].x + p[12].x) / 2 - hx, (p[11].y + p[12].y) / 2 - hy);
        const dup = kept.some(q => {
          const qx = (q[23].x + q[24].x) / 2, qy = (q[23].y + q[24].y) / 2;
          return Math.hypot(qx - hx, qy - hy) < Math.max(0.6 * sh, 0.04);
        });
        if (!dup) kept.push(p);
      }
      return { aspect, poses: kept };
    },
  };
}
