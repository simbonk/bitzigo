import { PALETTE } from './game.js';
// Fallback colours in an order that keeps neighbours easy to tell apart.
const SPREAD = ['#3fa7ff', '#3ddc84', '#ffd23f', '#b57bff', '#ff9f1c', '#ff4fa3', '#8fd3ff', ...PALETTE];
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
        name: p.name, age: p.age, color: p.color, character: p.character?.name || '', score: p.score,
        hits: p.hits, misses: p.misses,
        accuracy: judged ? Math.round((100 * p.hits) / judged) : null,
        // Share of hits that were PERFECT, judged against an age-based tolerance.
        timing: p.hits ? Math.round((100 * (p.tiers?.[0] || 0)) / p.hits) : null,
        heartRate: null,
        kcal: p.kcal,
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

const DAY = 864e5;
const PERIODS = [['day', 'Today', 'Today'], ['week', 'This week', 'Week'], ['month', 'This month', 'Month'], ['year', 'This year', 'Year'], ['all', 'All time', 'All']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const view = { period: 'all', kid: null };

function periodStart(period, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'day') return d.getTime();
  if (period === 'week') return d.getTime() - ((d.getDay() + 6) % 7) * DAY; // since Monday
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (period === 'year') return new Date(now.getFullYear(), 0, 1).getTime();
  return 0;
}

// A kid's colour: their saved profile first, then the colour on their latest game.
function kidColors(games) {
  let kids = {};
  try { kids = JSON.parse(localStorage.getItem('bitzigo-kids') || '{}'); } catch { }
  const out = new Map();
  for (const g of games) for (const r of g.players) if (r.color) out.set(r.name, r.color);
  for (const k of Object.values(kids)) if (k.color) out.set(k.name, k.color);
  // Two kids can share a colour (each played as player 1, say): give the
  // later one the next free colour so they never look alike in the charts.
  const used = new Set();
  for (const [name, c] of out) {
    let col = c;
    if (used.has(col)) col = SPREAD.find(x => !used.has(x)) || col;
    used.add(col); out.set(name, col);
  }
  return out;
}

function summarize(games) {
  const by = new Map();
  for (const g of games) for (const r of g.players) {
    if (!by.has(r.name)) by.set(r.name, { name: r.name, age: r.age, games: 0, secs: 0, kcal: 0, best: 0, acc: [], timing: [], hr: [] });
    const s = by.get(r.name);
    s.age = r.age; s.games++; s.secs += g.seconds; s.kcal += r.kcal || 0; s.best = Math.max(s.best, r.score);
    if (r.accuracy != null) s.acc.push(r.accuracy);
    if (r.timing != null) s.timing.push(r.timing);
    if (r.heartRate) s.hr.push(r.heartRate);
  }
  return by;
}

// Time buckets for one kid's bar charts: each game today, each day this
// week or month, each month this year or all time.
function buckets(period, games) {
  const now = new Date();
  if (period === 'day') return games.map(g => ({ label: new Date(g.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), games: [g] }));
  const out = [];
  if (period === 'week' || period === 'month') {
    const start = periodStart(period, now);
    const days = period === 'week' ? 7 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let i = 0; i < days; i++) {
      const d = new Date(start + i * DAY + DAY / 2);
      out.push({ label: period === 'week' ? WEEKDAYS[i] : String(d.getDate()), y: d.getFullYear(), m: d.getMonth(), day: d.getDate(), games: [] });
    }
    for (const g of games) { const d = new Date(g.at); out.find(b => b.m === d.getMonth() && b.day === d.getDate())?.games.push(g); }
    return out;
  }
  let y = now.getFullYear(), m = 0;
  if (period === 'all' && games.length) { const f = new Date(games[0].at); y = f.getFullYear(); m = f.getMonth(); }
  const multiYear = y !== now.getFullYear();
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= (period === 'year' ? 11 : now.getMonth()))) {
    out.push({ label: MONTHS[m] + (multiYear && m === 0 ? ` ${String(y).slice(2)}` : ''), y, m, games: [] });
    if (++m > 11) { m = 0; y++; }
  }
  for (const g of games) { const d = new Date(g.at); out.find(b => b.y === d.getFullYear() && b.m === d.getMonth())?.games.push(g); }
  return out;
}

const METRICS = [
  ['Best score', rs => (rs.length ? Math.max(...rs.map(r => r.score)) : null), v => v.toLocaleString()],
  ['Minutes moving', (rs, gs) => (gs.length ? Math.round(gs.reduce((a, g) => a + g.seconds, 0) / 6) / 10 : null), v => `${v} min`],
  ['Calories*', rs => (rs.length ? rs.reduce((a, r) => a + (r.kcal || 0), 0) : null), v => `${v} cal`],
  ['Hit rate', rs => avg(rs.map(r => r.accuracy).filter(v => v != null)), v => `${v}%`, 100],
  ['Perfect timing', rs => avg(rs.map(r => r.timing).filter(v => v != null)), v => `${v}%`, 100],
];

// A line graph: an SVG line through each bucket that has games, with a dot per
// point. Columns sit on top as tap targets that show the number.
function chartHtml([title, fn, fmt, max], bs, kid, color) {
  const vals = bs.map(b => { const rs = b.games.map(g => g.players.find(r => r.name === kid)).filter(Boolean); return fn(rs, b.games); });
  const top = max || Math.max(1, ...vals.filter(v => v != null)) * 1.1;
  const n = bs.length, x = i => ((i + 0.5) * 100) / n, y = v => 100 - (100 * v) / top;
  const pts = vals.map((v, i) => (v == null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`)).filter(Boolean);
  const many = n > 12;
  let html = `<div class="chart"><div class="chartHead"><b>${title}</b><span class="chartVal"></span></div><div class="bars">` +
    `<svg class="line" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  bs.forEach((b, i) => {
    const v = vals[i];
    const tip = `${b.label}: ${v == null ? 'no games' : fmt(v)}`;
    const lab = !many || i % 5 === 0 || i === n - 1 ? esc(b.label) : '';
    html += `<div class="bar" data-tip="${esc(tip)}" title="${esc(tip)}">${v == null ? '' : `<i class="pt" style="bottom:${(100 - y(v)).toFixed(2)}%;background:${color}"></i>`}<span>${lab}</span></div>`;
  });
  if (!pts.length) html += '<p class="noData">No games</p>';
  return html + '</div></div>';
}

export function statsHtml() {
  const all = load();
  if (!all.length) return '<p class="empty">No games yet. Play a round and it will show up here.</p>';
  const colors = kidColors(all);
  const from = periodStart(view.period);
  const games = all.filter(g => g.at >= from);
  const names = [...summarize(all).keys()];
  if (view.kid && !names.includes(view.kid)) view.kid = null;
  const dot = n => `<i class="kdot" style="background:${colors.get(n) || '#8a96c8'}"></i>`;

  let html = '<div class="seg statsSeg">' + PERIODS.map(([k, l, sh]) => `<button data-period="${k}"${view.period === k ? ' class="on"' : ''}><span class="pLong">${l}</span><span class="pShort">${sh}</span></button>`).join('') + '</div>';
  html += `<div class="kidChips"><button data-kid=""${view.kid ? '' : ' class="on"'}>Everyone</button>` +
    names.map(n => `<button data-kid="${esc(n)}"${view.kid === n ? ' class="on"' : ''} style="--kc:${colors.get(n) || '#8a96c8'}">${dot(n)}${esc(n)}</button>`).join('') + '</div>';

  if (view.kid) {
    const kid = view.kid, mine = games.filter(g => g.players.some(r => r.name === kid));
    const s = summarize(mine).get(kid);
    html += `<div class="kidTiles">${[['Games', s?.games || 0], ['Minutes', Math.round((s?.secs || 0) / 60)], ['Calories*', (s?.kcal || 0).toLocaleString()], ['Best score', (s?.best || 0).toLocaleString()]]
      .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
    if (!mine.length) return html + `<p class="empty">No games for ${esc(kid)} in this time.</p>`;
    const bs = buckets(view.period, mine);
    html += '<p class="note">Tap the graph to see a number.</p><div class="charts">' + METRICS.map(m => chartHtml(m, bs, kid, colors.get(kid) || '#ffd23f')).join('') + '</div>';
    return html + '<p class="note">* Calories are a rough guess from minutes of movement and age, not a measurement.</p>';
  }

  if (!games.length) return html + '<p class="empty">No games in this time yet.</p>';
  const sum = [...summarize(games).values()];
  const kidBars = (title, get, fmt, max) => {
    const vals = sum.map(get), top = max || Math.max(1, ...vals.filter(v => v != null));
    return `<div class="chart"><div class="chartHead"><b>${title}</b><span class="chartVal"></span></div><div class="bars kidBars">` +
      sum.map((k, i) => {
        const v = vals[i], tip = `${k.name}: ${v == null ? '–' : fmt(v)}`;
        return `<div class="bar" data-tip="${esc(tip)}" title="${esc(tip)}"><em>${v == null ? '' : fmt(v)}</em><div class="fill" style="height:${v == null ? 0 : Math.max(3, (100 * v) / top)}%;background:${colors.get(k.name) || '#8a96c8'}"></div><span>${esc(k.name)}</span></div>`;
      }).join('') + '</div></div>';
  };
  html += '<div class="charts">' + [
    kidBars('Minutes moving', k => Math.round(k.secs / 60), v => v.toLocaleString()),
    kidBars('Calories*', k => k.kcal, v => v.toLocaleString()),
    kidBars('Best score', k => k.best, v => v.toLocaleString()),
    kidBars('Games', k => k.games, v => v),
    kidBars('Hit rate', k => avg(k.acc), v => `${v}%`, 100),
    kidBars('Perfect timing', k => avg(k.timing), v => `${v}%`, 100),
  ].join('') + '</div>';
  html += `<table class="stats"><tr><th>Player</th><th>Games</th><th>Minutes</th><th>Calories*</th><th>Best score</th><th>Hit rate</th><th>Perfect timing</th><th>Heart</th></tr>`;
  for (const s of summarize(games).values()) {
    html += `<tr><td><button class="kidLink" data-kid="${esc(s.name)}">${dot(s.name)}${esc(s.name)}</button> <span class="age">(${s.age === 12 ? '12+' : s.age})</span></td><td>${s.games}</td><td>${Math.round(s.secs / 60)}</td><td>${s.kcal}</td><td>${s.best.toLocaleString()}</td><td>${pct(avg(s.acc))}</td><td>${pct(avg(s.timing))}</td><td>${s.hr.length ? `♥ ${s.hr[s.hr.length - 1]}` : '–'}</td></tr>`;
  }
  html += '</table><h3>Recent games</h3><table class="stats"><tr><th>When</th><th>World</th><th>Player</th><th>Score</th><th>Cal*</th><th>Hit rate</th><th>Perfect</th><th>Heart</th></tr>';
  for (const g of games.slice(-25).reverse()) {
    const when = new Date(g.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    g.players.forEach((r, i) => {
      html += `<tr${i === 0 ? ' class="first"' : ''}><td>${i === 0 ? when : ''}</td><td>${i === 0 ? esc(g.theme) : ''}</td><td>${dot(r.name)}${esc(r.name)}</td><td>${r.score.toLocaleString()}</td><td>${r.kcal ?? '–'}</td><td>${pct(r.accuracy)}</td><td>${pct(r.timing)}</td><td>${r.heartRate ? `♥ ${r.heartRate}` : '–'}</td></tr>`;
    });
  }
  return html + '</table><p class="note">* Calories are a rough guess from minutes of movement and age, not a measurement.</p>';
}

// Draws the stats into el and handles the period buttons, kid chips and bar taps.
export function showStats(el, fresh) {
  if (fresh) { view.period = 'all'; view.kid = null; }
  el.innerHTML = statsHtml();
  el.onclick = e => {
    const b = e.target.closest('[data-period],[data-kid],.bar');
    if (!b) return;
    if (b.classList.contains('bar')) {
      const chart = b.closest('.chart');
      chart.querySelectorAll('.bar.sel').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      chart.querySelector('.chartVal').textContent = b.dataset.tip;
      return;
    }
    if (b.dataset.period) view.period = b.dataset.period;
    else view.kid = b.dataset.kid || null;
    showStats(el);
  };
  el.onmouseover = e => {
    const b = e.target.closest('.bar');
    if (b) b.closest('.chart').querySelector('.chartVal').textContent = b.dataset.tip;
  };
}
