// Post-workout heart check. Each kid lies down with the phone flat on their
// chest; the phone's motion sensors pick up each heartbeat. The signal
// processing is Sternum's (vendor/sternum/analysis.js, loaded as global DSP).

const SETTLE = 8;   // seconds to lie down and get the phone in place
const DUR = 30;     // seconds of recording

// ---------- Keep the screen awake (Wake Lock, or a silent looping video on older iOS) ----------
let sleepVideo = null;
let lock = null;
export const awake = {
  on: false,
  start() {
    this.on = true;
    if (!sleepVideo && typeof NOSLEEP_MEDIA !== 'undefined') {
      const v = document.createElement('video');
      v.setAttribute('playsinline', ''); v.muted = true;
      v.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none';
      for (const [t, src] of [['webm', NOSLEEP_MEDIA.webm], ['mp4', NOSLEEP_MEDIA.mp4]]) {
        const s = document.createElement('source'); s.src = src; s.type = 'video/' + t; v.appendChild(s);
      }
      v.loop = true;
      document.body.appendChild(v);
      sleepVideo = v;
    }
    sleepVideo?.play().catch(() => { });
    this.grab();
  },
  grab() {
    if (!this.on || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => { });
  },
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && awake.on) { awake.grab(); sleepVideo?.play().catch(() => { }); }
});

// ---------- Motion recording ----------

function askMotion() {
  // iOS needs this called straight from a tap.
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    return DeviceMotionEvent.requestPermission().catch(() => 'denied');
  }
  return Promise.resolve('granted');
}

function recorder() {
  const M = { t: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], tx: [], ty: [], tz: [] };
  const R = { t: [], gx: [], gy: [], az: [] }; // rolling window for the live number
  let recording = false, t0 = 0, seen = false, gyro = false;
  const on = e => {
    const tn = e.timeStamp > 0 ? e.timeStamp / 1000 : performance.now() / 1000;
    seen = true;
    const a = e.acceleration && e.acceleration.x != null ? e.acceleration : e.accelerationIncludingGravity || {};
    const g = e.accelerationIncludingGravity || {}, r = e.rotationRate || {};
    if (r.beta) gyro = true;
    R.t.push(tn); R.gx.push(r.beta || 0); R.gy.push(r.gamma || 0); R.az.push(a.z || 0);
    while (R.t.length && R.t[0] < tn - 14) { R.t.shift(); R.gx.shift(); R.gy.shift(); R.az.shift(); }
    if (!recording) return;
    M.t.push(tn - t0);
    M.ax.push(a.x ?? 0); M.ay.push(a.y ?? 0); M.az.push(a.z ?? 0);
    M.gx.push(r.beta ?? 0); M.gy.push(r.gamma ?? 0); M.gz.push(r.alpha ?? 0);
    M.tx.push(g.x ?? 0); M.ty.push(g.y ?? 0); M.tz.push(g.z ?? 0);
  };
  addEventListener('devicemotion', on);
  return {
    get seen() { return seen; },
    start() { recording = true; t0 = performance.now() / 1000; },
    live() {
      if (R.t.length < 300 || typeof DSP === 'undefined') return null;
      const q = DSP.quickHR(R.t, gyro ? [R.gx, R.gy, R.az] : [R.az]);
      return q && q.q >= 0.3 ? q : null;
    },
    finish() {
      removeEventListener('devicemotion', on);
      recording = false;
      if (M.t.length < 200 || typeof DSP === 'undefined') return null;
      if (!gyro) { delete M.gx; delete M.gy; delete M.gz; }
      try {
        const res = DSP.analyze({ motion: M });
        return res.error ? null : res;
      } catch (e) { console.warn(e); return null; }
    },
    stop() { removeEventListener('devicemotion', on); },
  };
}

// ---------- Screens ----------

const wait = ms => new Promise(r => setTimeout(r, ms));

function panel() {
  let el = document.getElementById('heartPanel');
  if (!el) {
    el = document.createElement('section');
    el.id = 'heartPanel';
    el.className = 'panel heart';
    document.body.appendChild(el);
  }
  el.classList.remove('hidden');
  return el;
}

function faceImg(p, cls = 'face') {
  return p.face ? `<img class="${cls}" src="${p.face}" alt="">` : `<span class="${cls} noface" style="background:${p.color}">${p.index + 1}</span>`;
}

function button(el, sel) {
  return new Promise(r => el.querySelectorAll(sel).forEach(b => { b.onclick = () => r(b.dataset.v); }));
}

export async function runHeartCheck(players, { cue, sfx }) {
  const el = panel();
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  cue('heart');

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    let done = false;
    while (!done) {
      el.innerHTML = `
        <div class="hc-who">${faceImg(p, 'face xl')}<div><div class="hc-name" style="color:${p.color}">${esc(p.name)}'s heart check</div>
        <div class="hc-sub">${i + 1} of ${players.length}</div></div></div>
        <ol class="hc-steps">
          <li>Lie down flat on your back.</li>
          <li>A grown-up puts the phone <b>flat on the middle of your chest</b>, screen up.</li>
          <li>Stay <b>still as a statue</b> for 30 seconds. No talking!</li>
        </ol>
        <button class="big" data-v="go">Start ${esc(p.name)}'s heart check</button>
        <button class="small" data-v="skip">Skip ${esc(p.name)}</button>
        <p class="hc-note">Just for fun: the phone feels each heartbeat through the chest. It is not a medical device.</p>`;
      const choice = await button(el, 'button');
      if (choice === 'skip') { done = true; break; }

      const perm = askMotion();
      awake.start();
      const rec = recorder();
      const permResult = await perm;
      await wait(1200);
      if (!rec.seen) {
        rec.stop();
        el.innerHTML = `<p class="hc-big">No motion sensors found</p>
          <p>${permResult === 'denied' ? 'Motion access was turned off. Reload the page and choose Allow when asked.' : 'Run the game on the phone itself (Safari on iPhone) to do the heart check.'}</p>
          <button class="big" data-v="ok">OK</button>`;
        await button(el, 'button');
        el.classList.add('hidden');
        return;
      }

      // Settle countdown, then record.
      el.innerHTML = `
        <div class="hc-who">${faceImg(p, 'face xl')}<div class="hc-name" style="color:${p.color}">${esc(p.name)}</div></div>
        <p class="hc-phase">Lie down, phone on your chest…</p>
        <div class="hc-heart"><span class="heartIcon">♥</span><span class="hc-count">${SETTLE}</span></div>
        <p class="hc-live">&nbsp;</p>
        <div class="hc-bar"><div></div></div>
        <button class="small" data-v="cancel">Cancel</button>`;
      let cancelled = false;
      el.querySelector('[data-v=cancel]').onclick = () => { cancelled = true; };
      const count = el.querySelector('.hc-count'), phase = el.querySelector('.hc-phase'),
        live = el.querySelector('.hc-live'), bar = el.querySelector('.hc-bar div'), heart = el.querySelector('.heartIcon');
      const tStart = performance.now() / 1000;
      let started = false, lastLive = 0, t0 = 0;
      while (!cancelled) {
        await wait(100);
        const tn = performance.now() / 1000;
        if (!started) {
          const left = SETTLE - (tn - tStart);
          count.textContent = Math.max(1, Math.ceil(left));
          if (left <= 0) {
            started = true; t0 = tn; rec.start(); sfx.ready();
            phase.textContent = 'Listening to your heart. Stay still!';
          }
        } else {
          const el2 = tn - t0;
          count.textContent = Math.max(0, Math.ceil(DUR - el2));
          bar.style.width = `${Math.min(100, (100 * el2) / DUR)}%`;
          if (el2 >= DUR) break;
        }
        if (tn - lastLive > 2) {
          lastLive = tn;
          const q = rec.live();
          live.textContent = q ? `${Math.round(q.hr)} beats a minute` : 'finding the heartbeat…';
          if (q) heart.style.animationDuration = `${60 / q.hr}s`;
        }
      }
      if (cancelled) { rec.stop(); continue; }
      const res = rec.finish();
      sfx.finish();
      const hr = res?.metrics?.hr;
      const good = Number.isFinite(hr) && res.quality.grade !== 'poor';
      if (good) {
        p.heartRate = Math.round(hr);
        cue('heart_done');
        el.innerHTML = `
          <div class="hc-who">${faceImg(p, 'face xl')}<div class="hc-name" style="color:${p.color}">${esc(p.name)}</div></div>
          <div class="hc-heart"><span class="heartIcon" style="animation-duration:${60 / p.heartRate}s">♥</span><span class="hc-count">${p.heartRate}</span></div>
          <p class="hc-live">beats a minute${res.quality.grade === 'fair' ? ' (a bit wobbly, but close)' : ''}</p>
          <button class="big" data-v="next">${i + 1 < players.length ? `Next: ${esc(players[i + 1].name)}` : 'See the results!'}</button>
          <button class="small" data-v="again">Try again</button>`;
        const c = await button(el, 'button');
        done = c !== 'again';
      } else {
        cue('oops');
        el.innerHTML = `<p class="hc-big">Couldn't feel the heartbeat</p>
          <p>Make sure the phone is flat on the middle of the chest, and that nobody moves or talks.</p>
          <button class="big" data-v="again">Try again</button><button class="small" data-v="skip">Skip ${esc(p.name)}</button>`;
        const c = await button(el, 'button');
        done = c === 'skip';
      }
    }
  }
  el.classList.add('hidden');
}
