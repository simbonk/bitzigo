// Play with a friend: two households join with a short room code and race at
// the same time. Each phone still does its own body tracking; only tiny game
// updates (scores, which move each character is doing) go between them, over
// a direct browser-to-browser WebRTC data channel. No video is sent.
//
// Finding each other uses PeerJS's free public matchmaking server, which only
// swaps connection details for a moment. Its default settings also include a
// free best-effort relay for home networks that block direct connections.
// Your own servers can be set with Vercel environment variables, which
// api/net.mjs hands to the game (see README).

const PREFIX = 'bitzigo-v1-';
const WORDS = ['FROG', 'DUCK', 'BEAR', 'LION', 'FISH', 'MOON', 'STAR', 'CAKE', 'BOAT', 'KITE', 'BEE', 'OWL', 'FOX', 'YAK',
  'TACO', 'PEAR', 'PLUM', 'SNOW', 'RAIN', 'ROCK', 'JAM', 'CAT', 'DOG', 'PIG', 'COW', 'BUG', 'SUN', 'ZOOM', 'BOOP', 'HOP'];

export const room = {
  role: null,      // 'host' (made the code) or 'guest' (typed it in)
  code: null,      // e.g. FROG-42
  status: 'off',   // off | starting | waiting | joining | connected | lost | error
  error: '',
  friend: null,    // the latest update from the other household
  heard: 0,        // when we last heard from them (seconds)
};
let peer = null, conn = null;
const listeners = new Set();
export const onRoom = fn => listeners.add(fn);
const tell = (msg) => listeners.forEach(fn => fn(msg));
const now = () => performance.now() / 1000;
const setStatus = (s, error = '') => { room.status = s; room.error = error; tell({ type: 'status' }); };

export const connected = () => room.status === 'connected' && now() - room.heard < 6;

// "frog 42", "Frog-42" and "FROG42" are all the same code.
export const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const pretty = c => c.replace(/^([A-Z]+)(\d+)$/, '$1-$2');
function newCode() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w}-${10 + Math.floor(Math.random() * 90)}`;
}

let loading = null;
function loadPeerJs() {
  if (window.peerjs) return Promise.resolve();
  loading ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs/peerjs.min.js';
    s.onload = ok;
    s.onerror = () => { loading = null; fail(new Error('could not load the connection code')); };
    document.head.appendChild(s);
  });
  return loading;
}

// Settings from api/net.mjs, if the site has any. Asked once, and never
// waited on for more than a few seconds.
let netCfg = null;
async function loadConfig() {
  if (netCfg) return;
  netCfg = window.BITZIGO_NET || {};
  if (window.BITZIGO_NET) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch('api/net', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) netCfg = await r.json();
  } catch { }
}

function peerOptions() {
  const o = { debug: 1 };
  const cfg = netCfg || {};
  if (cfg.host) Object.assign(o, { host: cfg.host, port: cfg.port || 443, path: cfg.path || '/', secure: cfg.secure ?? true, key: cfg.key || 'peerjs' });
  if (cfg.iceServers) o.config = { iceServers: cfg.iceServers };
  return o;
}

// Make a new room and wait for the friend to join it.
export async function host() {
  leave();
  setStatus('starting');
  await Promise.all([loadPeerJs(), loadConfig()]);
  for (let tries = 0; tries < 4; tries++) {
    const code = newCode();
    try {
      await openPeer(PREFIX + cleanCode(code));
      room.role = 'host';
      room.code = code;
      setStatus('waiting');
      peer.on('connection', c => {
        // One friend per room: a second household gets turned away.
        if (conn && conn.open) { c.on('open', () => { c.send({ type: 'full' }); setTimeout(() => c.close(), 500); }); return; }
        use(c);
      });
      return code;
    } catch (e) {
      if (e.type !== 'unavailable-id') { setStatus('error', friendly(e)); throw e; }
    }
  }
  setStatus('error', 'Could not make a code. Try again.');
}

// Join a friend's room by its code.
export async function join(code) {
  leave();
  const c = cleanCode(code);
  if (!/^[A-Z]+\d+$/.test(c)) { setStatus('error', 'Codes look like FROG-42.'); return; }
  setStatus('joining');
  await Promise.all([loadPeerJs(), loadConfig()]);
  try {
    await openPeer();
  } catch (e) { setStatus('error', friendly(e)); return; }
  room.role = 'guest';
  room.code = pretty(c);
  const dc = peer.connect(PREFIX + c, { reliable: true, serialization: 'json' });
  use(dc);
  // No answer within 15 seconds: the code is wrong, or the network blocks it.
  setTimeout(() => {
    if (conn === dc && !dc.open && room.status === 'joining') setStatus('error', `Couldn't reach ${room.code}. Check the code, and that the other phone is on the Bitzigo home screen.`);
  }, 15000);
}

function openPeer(id) {
  return new Promise((ok, fail) => {
    const p = id ? new window.peerjs.Peer(id, peerOptions()) : new window.peerjs.Peer(peerOptions());
    peer = p;
    p.on('open', () => ok());
    p.on('error', e => {
      if (p !== peer) return;
      if (room.status === 'starting' || room.status === 'joining' && !conn) { p.destroy(); peer = null; fail(e); return; }
      if (e.type === 'peer-unavailable') setStatus('error', `No game is waiting on ${room.code}. Check the code, and that the other phone is on the Bitzigo home screen.`);
      else if (e.type === 'network' || e.type === 'disconnected' || e.type === 'server-error') { /* matchmaking server blip; the direct link carries on */ }
      else if (!connected()) setStatus('error', friendly(e));
    });
    // Keep the room code alive if the matchmaking server drops us.
    p.on('disconnected', () => setTimeout(() => { if (p === peer && !p.destroyed && p.disconnected) p.reconnect(); }, 1500));
  });
}

function use(c) {
  conn?.close();
  conn = c;
  c.on('open', () => {
    if (c !== conn) return;
    room.heard = now();
    setStatus('connected');
  });
  c.on('data', msg => {
    if (c !== conn || !msg || typeof msg !== 'object') return;
    room.heard = now();
    if (msg.type === 'full') { setStatus('error', 'That room already has a friend in it.'); return; }
    if (msg.type === 'tick') room.friend = msg;
    tell(msg);
  });
  c.on('close', () => {
    if (c !== conn) return;
    conn = null;
    // The host keeps the code open so the friend can come back.
    setStatus(room.role === 'host' ? 'waiting' : 'lost');
    room.friend = null;
  });
  c.on('error', e => console.warn('friend link', e));
}

export function send(msg) {
  if (conn?.open) { try { conn.send(msg); } catch (e) { console.warn(e); } }
}

export function leave() {
  conn?.close();
  conn = null;
  peer?.destroy();
  peer = null;
  Object.assign(room, { role: null, code: null, friend: null });
  setStatus('off');
}

function friendly(e) {
  if (e?.type === 'browser-incompatible') return 'This browser can’t do friend games.';
  if (e?.type === 'network' || e?.type === 'server-error' || e?.type === 'socket-error') return 'Couldn’t reach the matchmaking server. Check the internet connection.';
  return `Something went wrong: ${e?.message || e}`;
}
