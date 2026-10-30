// Game history, kept only in this browser's storage on this device.
// Each finished round is one game; a heart check adds to the latest one.

const KEY = 'bitzigo-stats';
const MAX_GAMES = 300;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function store(games) {
  try { localStorage.setItem(KEY, JSON.stringify(games.slice(-MAX_GAMES))); } catch { }
}

export function saveGame(players, { theme, seconds }) {
  const games = load();
  games.push({
    at: Date.now(), theme, seconds: Math.round(seconds),
    players: players.map(p => {
      const judged = p.hits + p.misses;
      return {
        name: p.name, age: p.age, character: p.character?.name || '', score: p.score,
        hits: p.hits, misses: p.misses,
        accuracy: judged ? Math.round((100 * p.hits) / judged) : null,
        // Share of hits that were PERFECT, judged against an age-based tolerance.
        timing: p.hits ? Math.round((100 * (p.tiers?.[0] || 0)) / p.hits) : null,
        heartRate: null,
      };
    }),
  });
  store(games);
}

export function addHeartRates(players) {
  const games = load();
  const g = games[games.length - 1];
  if (!g) return;
  for (const p of players) {
    const row = g.players.find(r => r.name === p.name);
    if (row && p.heartRate) row.heartRate = p.heartRate;
  }
  store(games);
}

export function clearStats() { store([]); }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
const pct = v => (v == null ? '–' : `${v}%`);

export function statsHtml() {
  const games = load();
  if (!games.length) return '<p class="empty">No games yet. Play a round and it will show up here.</p>';
  // One summary line per player name.
  const by = new Map();
  for (const g of games) for (const r of g.players) {
    const k = r.name;
    if (!by.has(k)) by.set(k, { name: r.name, age: r.age, games: 0, secs: 0, best: 0, acc: [], timing: [], hr: [] });
    const s = by.get(k);
    s.age = r.age; s.games++; s.secs += g.seconds; s.best = Math.max(s.best, r.score);
    if (r.accuracy != null) s.acc.push(r.accuracy);
    if (r.timing != null) s.timing.push(r.timing);
    if (r.heartRate) s.hr.push(r.heartRate);
  }
  let html = `<table class="stats"><tr><th>Player</th><th>Games</th><th>Minutes</th><th>Best score</th><th>Hit rate</th><th>Perfect timing</th><th>Heart</th></tr>`;
  for (const s of by.values()) {
    html += `<tr><td>${esc(s.name)} <span class="age">(${s.age === 12 ? '12+' : s.age})</span></td><td>${s.games}</td><td>${Math.round(s.secs / 60)}</td><td>${s.best.toLocaleString()}</td><td>${pct(avg(s.acc))}</td><td>${pct(avg(s.timing))}</td><td>${s.hr.length ? `♥ ${s.hr[s.hr.length - 1]}` : '–'}</td></tr>`;
  }
  html += '</table><h3>Recent games</h3><table class="stats"><tr><th>When</th><th>World</th><th>Player</th><th>Score</th><th>Hit rate</th><th>Perfect</th><th>Heart</th></tr>';
  for (const g of games.slice(-25).reverse()) {
    const when = new Date(g.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    g.players.forEach((r, i) => {
      html += `<tr${i === 0 ? ' class="first"' : ''}><td>${i === 0 ? when : ''}</td><td>${i === 0 ? esc(g.theme) : ''}</td><td>${esc(r.name)}</td><td>${r.score.toLocaleString()}</td><td>${pct(r.accuracy)}</td><td>${pct(r.timing)}</td><td>${r.heartRate ? `♥ ${r.heartRate}` : '–'}</td></tr>`;
    });
  }
  return html + '</table>';
}
