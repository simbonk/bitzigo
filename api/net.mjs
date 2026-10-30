// Optional connection settings for friend games, from Vercel environment
// variables. With none set it answers {} and the game uses PeerJS's free
// public matchmaking server and relay.
//
//   CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN  your own relay (Cloudflare Realtime TURN)
//   PEER_HOST, PEER_PORT, PEER_PATH, PEER_KEY          your own PeerJS matchmaking server
export default async function handler(req, res) {
  const out = {};
  const env = process.env;
  if (env.PEER_HOST) {
    out.host = env.PEER_HOST;
    out.port = Number(env.PEER_PORT || 443);
    out.path = env.PEER_PATH || '/';
    if (env.PEER_KEY) out.key = env.PEER_KEY;
  }
  if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) {
    try {
      // Short-lived relay passwords, so the real key never reaches the browser.
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 6 * 3600 }),
      });
      const j = await r.json();
      const ice = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : null;
      if (ice) out.iceServers = [{ urls: 'stun:stun.cloudflare.com:3478' }, ...ice];
    } catch (e) {
      console.error('TURN credentials', e);
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(out);
}
