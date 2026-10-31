// OUTLIER engine — shared by the game (browser) and the Monte Carlo (node). Pure, deterministic from seed.
(function (root) {
  'use strict';
  // ---- SHA-256 (sync, tiny) ----
  function sha256(str) {
    const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const bytes = []; for (let i = 0; i < str.length; i++) { let c = str.charCodeAt(i); if (c < 128) bytes.push(c); else if (c < 2048) bytes.push(192 | c >> 6, 128 | c & 63); else bytes.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63); }
    const l = bytes.length; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    const hi = Math.floor(l * 8 / 4294967296), lo = (l * 8) >>> 0;
    bytes.push(hi >>> 24 & 255, hi >>> 16 & 255, hi >>> 8 & 255, hi & 255, lo >>> 24 & 255, lo >>> 16 & 255, lo >>> 8 & 255, lo & 255);
    let H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const w = new Uint32Array(64); const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = bytes[o+4*i] << 24 | bytes[o+4*i+1] << 16 | bytes[o+4*i+2] << 8 | bytes[o+4*i+3];
      for (let i = 16; i < 64; i++) { const s0 = rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3), s1 = rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10); w[i] = (w[i-16]+s0+w[i-7]+s1) >>> 0; }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) { const S1 = rr(e,6)^rr(e,11)^rr(e,25), ch = (e&f)^(~e&g), t1 = (h+S1+ch+K[i]+w[i]) >>> 0, S0 = rr(a,2)^rr(a,13)^rr(a,22), mj = (a&b)^(a&c)^(b&c), t2 = (S0+mj) >>> 0; h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0; }
      H = H.map((v, i) => (v + [a,b,c,d,e,f,g,h][i]) >>> 0);
    }
    return Array.from(H).map(v => v.toString(16).padStart(8, '0')).join('');
  }
  // ---- PRNG ----
  function xmur3(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }; }
  function sfc32(a, b, c, d) { return function () { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11); d = d + 1 | 0; t = t + d | 0; c = c + t | 0; return (t >>> 0) / 4294967296; }; }
  function rngFromSeed(seed) { const h = xmur3(String(seed)); const r = sfc32(h(), h(), h(), h()); for (let i = 0; i < 12; i++) r(); return r; }
  function gamma(rng, a) { // Marsaglia-Tsang, a>0
    if (a < 1) { const u = rng(); return gamma(rng, a + 1) * Math.pow(u || 1e-12, 1 / a); }
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x, v; do { const u1 = rng() || 1e-12, u2 = rng(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rng() || 1e-12; if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; }
  }
  // ---- Math model (tuned by montecarlo.js) ----
  const MODEL = {"N":1000,"mix":[{"p":0.5,"alpha":80},{"p":0.35,"alpha":12},{"p":0.15,"alpha":2.5}],"tiers":[{"upTo":0.05,"mult":25},{"upTo":0.1,"mult":10},{"upTo":0.2,"mult":5},{"upTo":0.27,"mult":3},{"upTo":1.01,"mult":2.15}],"cap":125};
  function pickAlpha(rng) { let u = rng(), acc = 0; for (const m of MODEL.mix) { acc += m.p; if (u < acc) return m.alpha; } return MODEL.mix[MODEL.mix.length - 1].alpha; }
  function splitFromRng(rng) {
    const N = MODEL.N, alpha = pickAlpha(rng);
    const g = [gamma(rng, alpha), gamma(rng, alpha), gamma(rng, alpha)], S = g[0] + g[1] + g[2];
    const raw = g.map(x => x / S * N), cnt = raw.map(Math.floor); let rem = N - cnt[0] - cnt[1] - cnt[2];
    const order = [0, 1, 2].sort((i, j) => (raw[j] - cnt[j]) - (raw[i] - cnt[i]));
    for (let k = 0; rem > 0; k++, rem--) cnt[order[k % 3]]++;
    return cnt;
  }
  function multFor(s) { for (const t of MODEL.tiers) if (s < t.upTo) return t.mult; return MODEL.tiers[MODEL.tiers.length - 1].mult; }
  // Settle one round. counts=[R,G,B], pick = door index. Returns {mult, outcome}
  function settle(counts, pick) {
    const N = counts[0] + counts[1] + counts[2];
    if (counts[0] === counts[1] && counts[1] === counts[2]) return { mult: 1, outcome: 'refund', winners: [0, 1, 2], s: counts[0] / N };
    const min = Math.min(...counts); const winners = [0, 1, 2].filter(i => counts[i] === min);
    const s = min / N, base = multFor(s);
    if (winners.length === 2) return { mult: winners.includes(pick) ? base / 2 : 0, outcome: winners.includes(pick) ? 'tie-win' : 'lose', winners, s, base };
    return { mult: winners[0] === pick ? base : 0, outcome: winners[0] === pick ? 'win' : 'lose', winners, s, base };
  }
  // Build a full round from a seed (everything derived => verifiable)
  function buildRound(seed) {
    const rng = rngFromSeed('round:' + seed);
    const lockMs = Math.round(10000 + rng() * 10000); // 10.000–20.000s
    const final = splitFromRng(rng);
    const commitInput = lockMs + '|' + seed + '|' + final.join(',');
    return { seed, lockMs, final, commitInput, hash: sha256(commitInput) };
  }
  // what the hash shown BEFORE the round commits to (seed hidden): we publish sha256(commitInput)

  // ---- Live crowd path (cosmetic feed, INDEPENDENT of the sealed final split until the last FREEZE ms) ----
  const FREEZE = 600;
  const easeIO = u => u < .5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2;
  function lrCounts(shares, total) {
    const raw = shares.map(x => x * total), cnt = raw.map(Math.floor); let rem = total - cnt[0] - cnt[1] - cnt[2];
    const order = [0, 1, 2].sort((i, j) => (raw[j] - cnt[j]) - (raw[i] - cnt[i]));
    for (let k = 0; rem > 0; k++, rem--) cnt[order[k % 3]]++;
    return cnt;
  }
  function makePath(seed, lockMs, final) {
    const r = rngFromSeed('path:' + seed), N = MODEL.N;
    const comp = [0, 1, 2].map(() => [0, 1, 2].map(() => ({ f: 0.35 + r() * 0.9, p: r() * 6.283, a: 0.05 + r() * 0.07 })));
    const fin = final.map(x => x / N);
    const shareAt = (ts) => { // pre-surge, independent of `final`
      const sh = comp.map(cs => Math.max(0.1, 1 / 3 + cs.reduce((a, c) => a + c.a * Math.sin(ts * c.f + c.p), 0)));
      const S = sh[0] + sh[1] + sh[2]; return sh.map(x => x / S);
    };
    const tf = lockMs - FREEZE;
    return function (t) {
      const ramp = Math.min(1, t / 3500), total = Math.round(N * (ramp * ramp * (3 - 2 * ramp)));
      if (t >= lockMs) return { counts: final.slice(), total: N, surge: 1 };
      let sh = shareAt(Math.min(t, tf) / 1000), surge = 0;
      if (t > tf) {
        surge = (t - tf) / FREEZE; const e = easeIO(surge), w = Math.sin(surge * Math.PI) * 0.05;
        sh = sh.map((x, i) => x + (fin[i] - x) * e + w * Math.sin(surge * 19 + i * 2.1));
        const S2 = sh[0] + sh[1] + sh[2]; sh = sh.map(x => Math.max(0.02, x / S2));
        if (surge > 0.97) sh = fin; // converge exactly
      }
      return { counts: lrCounts(sh, total), total, surge };
    };
  }

  const api = { makePath, FREEZE,  sha256, rngFromSeed, gamma, splitFromRng, settle, multFor, buildRound, MODEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OutlierEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
window.OUTLIER_MC={"mc":{"rounds":30000000,"rtpByDoor":{"Red":0.9696248648973792,"Gold":0.9711201107303956,"Blue":0.9706293673971659},"rtpMean":0.970458114341647,"tierFreq":{"27-33.3%":0.6348207333333333,"20-27%":0.23777853333333332,"5-10%":0.0193061,"10-20%":0.10311263333333333,"<5%":0.004982},"tieRate":0.007878566666666666,"refundRate":0},"model":{"N":1000,"mix":[{"p":0.5,"alpha":80},{"p":0.35,"alpha":12},{"p":0.15,"alpha":2.5}],"tiers":[{"upTo":0.05,"mult":25},{"upTo":0.1,"mult":10},{"upTo":0.2,"mult":5},{"upTo":0.27,"mult":3},{"upTo":1.01,"mult":2.15}],"cap":125}};
;
// OUTLIER synth audio — everything generated with Web Audio (no samples).
(function () {
  'use strict';
  const A = { ctx: null, on: true, ready: false, tension: 0, _beatAt: 0, _bpm: 60 };
  let master, comp, sfx, music, verb, drone;
  function mkImpulse(c, sec, decay) {
    const len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = A.ctx = new C();
    master = c.createGain(); master.gain.value = A.on ? 0.9 : 0;
    comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = .003; comp.release.value = .2;
    master.connect(comp); comp.connect(c.destination);
    sfx = c.createGain(); sfx.gain.value = 1; sfx.connect(master);
    music = c.createGain(); music.gain.value = 0.0; music.connect(master);
    verb = c.createConvolver(); verb.buffer = mkImpulse(c, 2.2, 3); const vg = c.createGain(); vg.gain.value = .35; verb.connect(vg); vg.connect(master);
    // ambient drone pad
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 4; lp.connect(music);
    [[55, 'sawtooth', 0], [55.35, 'sawtooth', 0], [82.4, 'triangle', 0], [110.3, 'sine', 0]].forEach(([f, t]) => { const o = c.createOscillator(); o.type = t; o.frequency.value = f; const g = c.createGain(); g.gain.value = .22; o.connect(g); g.connect(lp); o.start(); });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = .09; lg.gain.value = 120; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    drone = { lp };
    music.gain.linearRampToValueAtTime(.28, c.currentTime + 3);
    A.ready = true;
  };
  A.setOn = function (v) { A.on = v; if (master) master.gain.setTargetAtTime(v ? .9 : 0, A.ctx.currentTime, .05); };
  function env(g, t, a, d, peak, end) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end || .0001, t + a + d); }
  function osc(type, f0, f1, t, dur, peak, dest, send) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, .004, dur, peak); o.connect(g); g.connect(dest || sfx); if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(verb); } o.start(t); o.stop(t + dur + .05); return o;
  }
  function noise(t, dur, peak, type, f0, f1, dest, q) {
    const c = A.ctx, n = c.sampleRate * dur, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 1;
    const g = c.createGain(); env(g, t, Math.min(.02, dur / 3), dur, peak); s.connect(f); f.connect(g); g.connect(dest || sfx); s.start(t); return g;
  }
  const go = (fn) => { if (!A.ctx || !A.on) return; if (A.ctx.state === 'suspended') A.ctx.resume(); try { fn(A.ctx, A.ctx.currentTime); } catch (e) { } };
  A.tap = () => go((c, t) => { osc('triangle', 520, 780, t, .09, .22); });
  A.pick = (d) => go((c, t) => { const base = [392, 494, 587][d] || 440; osc('square', base, base * 1.5, t, .12, .12, null, .2); osc('sine', base * 2, null, t + .05, .18, .18, null, .3); });
  A.deny = () => go((c, t) => { osc('square', 160, 110, t, .14, .12); });
  A.chip = () => go((c, t) => { osc('sine', 1200, 1800, t, .05, .15); });
  A.newRound = () => go((c, t) => { noise(t, .7, .18, 'bandpass', 300, 3000, null, 2); [0, 7, 12].forEach((s, i) => osc('sine', 330 * Math.pow(2, s / 12), null, t + i * .09, .5, .13, null, .5)); });
  A.join = () => go((c, t) => { osc('sine', 900 + Math.random() * 500, null, t, .04, .035); });
  A.riser = () => go((c, t) => { noise(t, .62, .38, 'bandpass', 300, 5200, null, 4); osc('sawtooth', 120, 900, t, .6, .12); });
  A.thud = () => go((c, t) => { // heavy lock
    osc('sine', 110, 26, t, .95, .95); osc('sine', 62, 30, t, 1.1, .8);
    noise(t, .5, .6, 'lowpass', 2200, 90); noise(t, .12, .6, 'highpass', 3000, 6000);
    [310, 477, 861, 1290, 1771].forEach((f, i) => osc('square', f, f * .985, t + .004, .5 - i * .06, .06, null, .4));
    osc('sawtooth', 70, 45, t, .6, .3);
  });
  A.silenceDuck = (sec) => { if (!A.ctx || !music) return; const t = A.ctx.currentTime; music.gain.cancelScheduledValues(t); music.gain.setTargetAtTime(.02, t, .03); music.gain.setTargetAtTime(.28, t + sec, .5); };
  A.beat = (vol) => go((c, t) => { // lub-dub
    const v = Math.min(1, vol);
    osc('sine', 78, 38, t, .16, .75 * v); osc('sine', 70, 34, t + .16, .18, .55 * v);
    noise(t, .06, .12 * v, 'lowpass', 220, 90);
  });
  A.heartbeatTick = function (nowMs, tension) { // call each frame while open; tension 0..1
    if (!A.ctx || !A.on || tension <= 0.02) return;
    const bpm = 62 + tension * 92, period = 60000 / bpm;
    if (nowMs - A._beatAt >= period) { A._beatAt = nowMs; A.beat(.35 + tension * .75); if (drone) drone.lp.frequency.setTargetAtTime(260 + tension * 900, A.ctx.currentTime, .3); }
  };
  A.win = (mult, big) => go((c, t) => {
    const scale = [0, 4, 7, 12, 16, 19, 24, 28]; const n = big ? 8 : mult >= 5 ? 6 : 4;
    for (let i = 0; i < n; i++) { const f = 392 * Math.pow(2, scale[i] / 12); osc('triangle', f, null, t + i * .075, .55, .2, null, .5); osc('sine', f * 2, null, t + i * .075, .4, .08, null, .6); }
    noise(t, 1.2, .22, 'highpass', 5000, 9000, null); osc('sine', 98, 49, t, .8, .55);
    if (big) { osc('sawtooth', 196, null, t + .5, 1.4, .1, null, .6); osc('sawtooth', 294, null, t + .5, 1.4, .08, null, .6); }
  });
  A.countTick = (u) => go((c, t) => { osc('square', 700 + u * 1400, null, t, .035, .08); });
  A.burst = () => go((c, t) => { noise(t, 1.1, .5, 'bandpass', 800, 5000, null, .7); osc('sine', 220, 55, t, .7, .6); [0, 4, 7].forEach((s, i) => osc('sawtooth', 261 * Math.pow(2, s / 12), null, t, .9, .06, null, .6)); });
  A.lose = () => go((c, t) => { osc('sawtooth', 220, 82, t, .8, .16, null, .3); osc('sine', 196, 73, t + .05, .9, .2); noise(t, .6, .15, 'lowpass', 1200, 120); });
  A.refund = () => go((c, t) => { osc('sine', 659, null, t, .3, .2, null, .4); osc('sine', 880, null, t + .1, .4, .2, null, .4); });
  A.enter = () => go((c, t) => { osc('sine', 80, 30, t, 1.4, .9); noise(t, 1.2, .35, 'bandpass', 200, 6000, null, 1.5); [0, 7, 12, 19].forEach((s, i) => osc('sawtooth', 130 * Math.pow(2, s / 12), null, t + .1 + i * .06, 1.3, .09, null, .7)); });
  window.OutlierAudio = A;
})();

;
(() => {
'use strict';
const E = OutlierEngine, A = OutlierAudio, MCD = window.OUTLIER_MC || {};
const M = E.MODEL, N = M.N, CAP_C = Math.round(M.cap * 100), FREEZE = E.FREEZE, CD = 1000;
const Q = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, +Q.get('speed') || 1);
const DOORS = [
  { id: 0, name: 'RED', rgb: [255, 46, 99], c: '#ff2e63' },
  { id: 1, name: 'GOLD', rgb: [255, 197, 61], c: '#ffc53d' },
  { id: 2, name: 'BLUE', rgb: [46, 168, 255], c: '#2ea8ff' },
];
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t, rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = u => 1 - Math.pow(1 - u, 3);
const fm = c => (c / 100).toFixed(2);
const fmtMult = m => String(Number(m.toFixed(2)));
const fmtN = n => n.toLocaleString('en-US');

// ---------- persistence ----------
let SAVE = { bal: 100000, hist: [], roundNo: 0, helped: false, sound: true };
try { const s = JSON.parse(localStorage.getItem('outlier.v1')); if (s && typeof s.bal === 'number') SAVE = Object.assign(SAVE, s); } catch (e) { }
const persist = () => { try { localStorage.setItem('outlier.v1', JSON.stringify({ bal: SAVE.bal, hist: SAVE.hist.slice(0, 40), roundNo: SAVE.roundNo, helped: SAVE.helped, sound: SAVE.sound })); } catch (e) { } };
if (Q.has('reset')) { SAVE.bal = 100000; SAVE.hist = []; SAVE.roundNo = 0; }

// ---------- state ----------
const S = { phase: 'splash', pt: 0, t: 0, clock: 0, frozen: false, pick: null, lastSwitch: -9999, stakeC: 100, round: null, path: null, counts: [0, 0, 0], total: 0, surge: 0, ts: 1, res: null, pending: null, shake: 0, countUp: null, tension: 0, lastBeatVis: 0, feedAcc: 0 };
A.on = SAVE.sound;

// ---------- DOM ----------
const stage = $('#stage'), doorsEl = $('#doors');
DOORS.forEach(d => {
  const el = document.createElement('div');
  el.className = 'slot'; el.dataset.d = d.id; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', d.name + ' door');
  el.innerHTML = `<div class="nameplate">${d.name}<span class="pickflag">YOUR PICK</span></div>
  <div class="door"><div class="beam"></div><div class="portal"><div class="glow"></div><div class="rays"></div><div class="crack"></div><div class="orb"></div><div class="leaf l"></div><div class="leaf r"></div></div><i class="bolt"></i></div>
  <div class="plate"><div class="n">0</div><div class="p">0.0%</div><div class="bar"><i></i></div></div><div class="pad"></div><div class="anchor"></div>`;
  doorsEl.appendChild(el);
  d.el = el; d.n = $('.n', el); d.p = $('.p', el); d.bar = $('.bar i', el); d.anchor = $('.anchor', el);
  el.addEventListener('pointerdown', e => { e.preventDefault(); pickDoor(d.id); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDoor(d.id); } });
});
const vig = document.createElement('div'); vig.style.cssText = 'position:absolute;inset:0;z-index:11;pointer-events:none;opacity:0;background:radial-gradient(90% 80% at 50% 45%,transparent 45%,rgba(255,30,70,.75))'; stage.appendChild(vig);

// ladder
const TIERS = M.tiers;
const tierLabel = (i) => { const lo = i === 0 ? 0 : TIERS[i - 1].upTo, hi = TIERS[i].upTo; return i === 0 ? `< ${lo === 0 ? Math.round(hi * 100) : ''}%` : i === TIERS.length - 1 ? `${Math.round(lo * 100)}%+` : `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`; };
const tierIdx = s => { for (let i = 0; i < TIERS.length; i++) if (s < TIERS[i].upTo) return i; return TIERS.length - 1; };
function ladderHTML() { return TIERS.map((t, i) => `<div class="lad" data-i="${i}"><div class="s">${tierLabel(i)}</div><div class="lx">${fmtMult(t.mult)}×</div></div>`).join(''); }
$('#ladder').innerHTML = ladderHTML(); $('#howLadder').innerHTML = ladderHTML();
$('#capTxt').textContent = $('#capTxt2').textContent = M.cap;
// chips
const CHIPS = [10, 50, 100, 200, 500];
$('#chips').innerHTML = CHIPS.map(c => `<button class="chip" data-c="${c}">${c < 100 ? (c / 100).toFixed(2) : c / 100}</button>`).join('');

// ---------- toast / haptics ----------
let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); }
const vib = p => { if (A.on && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { } } };

// ---------- wallet ----------
let shownBal = null, balAnim = null;
function dispBalC() { return SAVE.bal - (S.pick !== null && (S.phase === 'open' || S.phase === 'intro') ? S.stakeC : 0); }
function renderBal(anim) {
  const target = dispBalC(), el = $('#bal'), w = $('.wallet');
  if (shownBal === null || !anim) { shownBal = target; el.textContent = fm(target); return; }
  const from = shownBal; if (from === target) return;
  w.classList.remove('up', 'dn'); void w.offsetWidth; w.classList.add(target > from ? 'up' : 'dn');
  const t0 = performance.now(), dur = 900; cancelAnimationFrame(balAnim);
  const step = () => { const u = Math.min(1, (performance.now() - t0) / dur); shownBal = Math.round(lerp(from, target, easeOut(u))); el.textContent = fm(shownBal); if (u < 1) balAnim = requestAnimationFrame(step); else shownBal = target; };
  step();
}
function renderStake() {
  $('#stakeVal').textContent = fm(S.stakeC);
  $$('.chip').forEach(b => b.classList.toggle('on', +b.dataset.c === S.stakeC));
  $('#stakeMinus').disabled = S.stakeC <= 10; $('#stakePlus').disabled = S.stakeC >= 500;
  renderBal(true); renderPick();
}
function setStake(c) { S.stakeC = clamp(Math.round(c), 10, 500); if (S.stakeC > SAVE.bal) S.stakeC = Math.max(10, Math.floor(SAVE.bal / 10) * 10); A.chip(); vib(8); renderStake(); }
$('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { A.init(); setStake(+b.dataset.c); } });
$('#stakeMinus').addEventListener('click', () => { A.init(); setStake(S.stakeC - (S.stakeC <= 100 ? 10 : 50)); });
$('#stakePlus').addEventListener('click', () => { A.init(); setStake(S.stakeC + (S.stakeC < 100 ? 10 : 50)); });

function renderPick() {
  const ps = $('#pickSum'), p = S.pick;
  if (p === null) ps.innerHTML = `<span class="pip none"></span><span>${S.phase === 'open' && !S.frozen ? 'Tap a door to enter' : S.phase === 'open' ? 'Picks closed' : 'Next round: tap a door'}</span>`;
  else ps.innerHTML = `<span class="pip" style="--c:${DOORS[p].c}"></span><span>In <b style="color:${DOORS[p].c}">${DOORS[p].name}</b> · stake <b>${fm(S.stakeC)}</b></span>`;
  DOORS.forEach(d => d.el.classList.toggle('picked', S.pick === d.id));
}

// ---------- round ----------
function randHex(n) { const a = new Uint8Array(n); (crypto || window.msCrypto).getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); }
function startRound() {
  SAVE.roundNo++;
  const seed = Q.get('seed') ? `${Q.get('seed')}-${SAVE.roundNo}` : randHex(12);
  const r = E.buildRound(seed); r.no = SAVE.roundNo;
  S.round = r; S.path = E.makePath(seed, r.lockMs, r.final);
  S.pick = null; S.frozen = false; S.t = 0; S.res = null; S.counts = [0, 0, 0]; S.total = 0; S.surge = 0; S.countUp = null; S.tension = 0; A._beatAt = 0;
  S.phase = 'intro'; S.pt = 0;
  stage.classList.remove('cinema', 'frozen'); $('#meter').classList.remove('tense');
  DOORS.forEach(d => d.el.classList.remove('shut', 'open', 'dim', 'winner', 'picked', 'fewest'));
  const rs = $('#result'); rs.classList.remove('show'); setTimeout(() => { if (S.phase === 'intro' || S.phase === 'open') rs.innerHTML = ''; }, 450);
  $$('.lad').forEach(l => l.classList.remove('hot', 'live'));
  $('#rno').textContent = 'ROUND #' + r.no; $('#hashShort').textContent = r.hash.slice(0, 6) + '…' + r.hash.slice(-6);
  setPhase('intro', 'NEW ROUND'); banner('ROUND ' + r.no, 'HASH COMMITTED · DOORS OPENING', 'var(--cy)');
  $('#mLabel').textContent = 'Hidden lock between 10s and 20s'; $('#mFill').style.width = '0'; $('#mTime').textContent = '0.0s';
  $('#feed').innerHTML = ''; A.newRound(); renderPick(); renderBal(true);
  stage.classList.remove('lockfx');
}
function setPhase(p, label) { const el = $('#phase'); el.className = 'phase ' + p; el.textContent = label; }
function banner(txt, sub, color, hard) { const b = $('#banner'); b.innerHTML = `<span>${txt}</span>${sub ? `<small>${sub}</small>` : ''}`; b.style.color = color || '#fff'; b.className = 'banner'; void b.offsetWidth; b.className = 'banner show' + (hard ? ' hard' : ''); }

function pickDoor(d) {
  A.init();
  if (S.phase !== 'open') { toast(S.phase === 'intro' ? 'Doors opening…' : 'Round in progress — next round soon'); return; }
  if (S.frozen) { A.deny(); toast('Picks closed — final swing!'); vib(20); return; }
  if (S.pick === d) return;
  if (S.pick !== null && S.clock - S.lastSwitch < CD) { A.deny(); toast('Switch cooldown…'); return; }
  if (S.stakeC > SAVE.bal) { toast('Not enough credits'); return; }
  const first = S.pick === null; S.pick = d; S.lastSwitch = S.clock;
  A.pick(d); vib(first ? [14, 30, 22] : 16); renderPick(); renderBal(true);
  const cd = $('#cdbar'); cd.classList.add('on'); const bar = $('i', cd); bar.getAnimations().forEach(a => a.cancel()); bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: CD, fill: 'forwards' }); setTimeout(() => cd.classList.remove('on'), CD);
  addFeed('You', d, first ? 'joined' : 'switched', true);
  pulseDoor(d);
}
function pulseDoor(d) { DOORS[d].el.animate([{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 400, easing: 'ease-out' }); }

// ---------- live feed ----------
const NAMES = ['NeonFox', 'Vex', 'Kiran', 'Zara', 'Rohan', 'LunaX', 'Ghost', 'Pixel', 'Raja', 'Mira', 'Blaze', 'Nova', 'Arjun', 'Echo', 'Sana', 'Drift', 'Kavya', 'Jett', 'Orion', 'Tara', 'Dhruv', 'Ace', 'Ivy', 'Rex', 'Misha', 'Zed'];
const fakeName = () => NAMES[(Math.random() * NAMES.length) | 0] + (Math.random() < .6 ? '_' + ((Math.random() * 99) | 0) : ['x', 'HQ', 'TV', '77'][(Math.random() * 4) | 0]);
function addFeed(name, d, verb, me, from) {
  const f = $('#feed'), el = document.createElement('div'); el.className = 'fl'; const D = DOORS[d]; el.style.setProperty('--c', D.c);
  el.innerHTML = `<span class="pip" style="--c:${D.c}"></span><b>${name}</b> ${verb === 'switched' && from != null ? `switched <i style="color:${DOORS[from].c}">${DOORS[from].name}</i> → ` : verb + ' '}<i>${D.name}</i>`;
  if (me) el.style.color = '#fff';
  f.prepend(el); while (f.children.length > 6) f.lastChild.remove();
}
function feedTick(real) {
  S.feedAcc += real; const rate = S.surge > 0 ? 90 : 260 + Math.random() * 300;
  if (S.feedAcc < rate || S.total < 30) return; S.feedAcc = 0;
  // weight toward the door that most recently gained
  const c = S.counts, tot = c[0] + c[1] + c[2] || 1; let u = Math.random() * tot, d = 0; for (; d < 2; d++) { if (u < c[d]) break; u -= c[d]; }
  const sw = Math.random() < .45; let from = null; if (sw) { from = (d + 1 + ((Math.random() * 2) | 0)) % 3; }
  addFeed(fakeName(), d, sw ? 'switched' : 'joined', false, from); if (Math.random() < .35) A.join();
}

// ---------- crowd particles + fx ----------
const fx = $('#fx'), g = fx.getContext('2d'); let W = 0, H = 0, DPR = 1;
function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; fx.width = W * DPR; fx.height = H * DPR; bgR(); }
const bg = $('#bg'), bgc = bg.getContext('2d');
function bgR() { bg.width = W * Math.min(1.5, DPR); bg.height = H * Math.min(1.5, DPR); }
resize(); addEventListener('resize', resize);
function sprite(rgb, size = 64) { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, `rgba(255,255,255,1)`); gr.addColorStop(.18, `rgba(${rgb},0.95)`); gr.addColorStop(.5, `rgba(${rgb},0.28)`); gr.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = gr; x.fillRect(0, 0, size, size); return c; }
const SPR = DOORS.map(d => sprite(d.rgb.join(','))), SPRW = sprite('255,255,255'), SPRG = sprite('255,210,110');
const NP = 360, P = [];
for (let i = 0; i < NP; i++) P.push({ on: false, d: -1, x: 0, y: 0, ang: Math.random() * 6.283, rr: Math.sqrt(Math.random()), ph: Math.random() * 6.28, sz: rnd(5, 10), fly: null, a: 0, px: 0, py: 0, leave: false });
const AN = [{ x: 0, y: 0, w: 100 }, { x: 0, y: 0, w: 100 }, { x: 0, y: 0, w: 100 }];
function readAnchors() { const sb = stage.getBoundingClientRect().bottom; DOORS.forEach((d, i) => { const r = d.anchor.getBoundingClientRect(), s = d.el.getBoundingClientRect(); AN[i].x = r.left + r.width / 2; AN[i].w = s.width; AN[i].y = Math.min(r.top, sb - s.width * .24 - 14); }); }
function tgt(p, d) { const a = AN[d], rx = a.w * .66, ry = a.w * .24; return [a.x + Math.cos(p.ang) * p.rr * rx, a.y + Math.sin(p.ang) * p.rr * ry]; }
function sendFly(p, d, fast) {
  const [tx, ty] = tgt(p, d); p.d = d; p.leave = false;
  p.fly = { x0: p.x, y0: p.y, cx: (p.x + tx) / 2 + rnd(-30, 30), cy: Math.min(p.y, ty) - rnd(40, 130), t: 0, dur: fast ? rnd(260, 480) : rnd(650, 1150) };
}
function updateCrowd(dtv, now) {
  const have = [0, 0, 0], want = DOORS.map((_, i) => Math.round(S.counts[i] / N * NP));
  const pools = [[], [], []];
  for (const p of P) if (p.on && !p.leave) { have[p.d]++; if (!p.fly) pools[p.d].push(p); }
  let moves = 0;
  const def = [0, 1, 2].map(i => want[i] - have[i]);
  for (let d = 0; d < 3 && moves < 26; d++) {
    while (def[d] < 0 && moves < 26) {
      const p = pools[d].pop(); if (!p) { def[d]++; continue; } // all in flight; skip
      let e = -1, best = 0; for (let k = 0; k < 3; k++) if (def[k] > best) { best = def[k]; e = k; }
      if (e >= 0) { sendFly(p, e, S.surge > 0 || S.phase !== 'open'); def[e]--; } else { p.leave = true; p.fly = { x0: p.x, y0: p.y, cx: p.x + rnd(-80, 80), cy: p.y + 200, t: 0, dur: 700, out: true }; }
      def[d]++; moves++;
    }
  }
  for (let d = 0; d < 3 && moves < 26; d++) {
    while (def[d] > 0 && moves < 26) {
      const p = P.find(q => !q.on); if (!p) break;
      const side = Math.random(); p.on = true; p.a = 0; p.leave = false; p.x = side < .33 ? -20 : side > .66 ? W + 20 : rnd(0, W); p.y = side < .33 || side > .66 ? rnd(H * .5, H) : H + 20; p.px = p.x; p.py = p.y;
      sendFly(p, d, S.surge > 0); def[d]--; moves++;
    }
  }
  const T = now / 1000;
  for (const p of P) {
    if (!p.on) continue; p.px = p.x; p.py = p.y;
    if (p.fly) {
      const f = p.fly; f.t += dtv / f.dur; const u = clamp(f.t, 0, 1), e = u * u * (3 - 2 * u);
      const [tx, ty] = f.out ? [f.cx, f.y0 + 400] : tgt(p, p.d), a = 1 - e;
      p.x = a * a * f.x0 + 2 * a * e * f.cx + e * e * tx; p.y = a * a * f.y0 + 2 * a * e * f.cy + e * e * ty;
      if (f.t >= 1) { p.fly = null; if (p.leave) { p.on = false; } }
      p.a = Math.min(1, p.a + dtv / 200);
    } else {
      const [tx, ty] = tgt(p, p.d); const k = Math.min(1, dtv * .012);
      p.x += (tx + Math.sin(T * 1.3 + p.ph) * 3 - p.x) * k; p.y += (ty + Math.cos(T * 1.7 + p.ph) * 2.2 - p.y) * k; p.a = Math.min(1, p.a + dtv / 300);
    }
  }
}
// fx particles
const SP = [], CF = [], RG = [], FL = [];
function burst(x, y, rgb, power, win) {
  const n = Math.round(130 * power);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = rnd(120, 760) * (Math.random() < .2 ? 1.5 : 1); SP.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0, max: rnd(.6, 1.5), col: Math.random() < .5 ? rgb : [255, 230, 160], len: rnd(.02, .06) }); }
  if (win) { const cn = Math.round(170 * power); const pal = [rgb, [255, 255, 255], [255, 210, 90], [164, 92, 255], [53, 240, 255], [255, 79, 163]]; for (let i = 0; i < cn; i++) { const a = rnd(-Math.PI * .95, -Math.PI * .05), v = rnd(250, 950); CF.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: rnd(-12, 12), w: rnd(5, 10), h: rnd(8, 16), col: pal[(Math.random() * pal.length) | 0], life: 0, max: rnd(2.4, 4.2), fl: Math.random() * 6 }); } }
  for (let i = 0; i < 3; i++) RG.push({ x, y, r: 10, max: 380 + i * 160, sp: 520 - i * 90, col: i === 1 ? [255, 255, 255] : rgb, w: 6 - i * 1.6, life: 0, delay: i * .09 });
  FL.push({ x, y, life: 0, max: .9, rgb, size: 520 * power });
}
function drawFx(dtv, now) {
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  // crowd
  const crowdA = S.phase === 'reveal' ? .16 : 1;
  for (const p of P) {
    if (!p.on) continue; const d = p.d, s = p.sz * (p.fly ? 1.2 : 1) * (.75 + .5 * clamp((p.y - 100) / H, 0, 1)); g.globalAlpha = p.a * crowdA * (p.fly ? 1 : .85);
    if (p.fly) { g.strokeStyle = `rgba(${DOORS[d].rgb},.5)`; g.lineWidth = 1.5; g.beginPath(); { let dx = (p.x - p.px) * 3, dy = (p.y - p.py) * 3; const L = Math.hypot(dx, dy); if (L > 34) { dx *= 34 / L; dy *= 34 / L; } g.moveTo(p.x - dx, p.y - dy); } g.lineTo(p.x, p.y); g.stroke(); }
    g.drawImage(SPR[d], p.x - s, p.y - s, s * 2, s * 2);
  }
  g.globalAlpha = 1;
  // flares
  for (let i = FL.length - 1; i >= 0; i--) { const f = FL[i]; f.life += dtv / 1000; const u = f.life / f.max; if (u >= 1) { FL.splice(i, 1); continue; } const s = f.size * (.4 + u), a = (1 - u) * (1 - u); g.globalAlpha = a; g.drawImage(SPRW, f.x - s / 2, f.y - s / 2, s, s); g.globalAlpha = a * .8; const c2 = sprite; g.drawImage(SPR[DOORS.findIndex(d => d.rgb === f.rgb)] || SPRG, f.x - s, f.y - s, s * 2, s * 2); }
  g.globalAlpha = 1;
  // rings
  for (let i = RG.length - 1; i >= 0; i--) { const r = RG[i]; if (r.delay > 0) { r.delay -= dtv / 1000; continue; } r.life += dtv / 1000; r.r += r.sp * dtv / 1000; const u = r.r / r.max; if (u >= 1) { RG.splice(i, 1); continue; } g.strokeStyle = `rgba(${r.col},${(1 - u) * .9})`; g.lineWidth = r.w * (1 - u) + .5; g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * .55, 0, 0, 6.283); g.stroke(); }
  // sparks
  for (let i = SP.length - 1; i >= 0; i--) { const s = SP[i], dt = dtv / 1000; s.life += dt; if (s.life > s.max) { SP.splice(i, 1); continue; } s.vy += 640 * dt; s.vx *= .985; s.x += s.vx * dt; s.y += s.vy * dt; const a = 1 - s.life / s.max; g.strokeStyle = `rgba(${s.col},${a})`; g.lineWidth = 2.2 * a + .4; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * s.len, s.y - s.vy * s.len); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  // confetti
  for (let i = CF.length - 1; i >= 0; i--) { const c = CF[i], dt = dtv / 1000; c.life += dt; if (c.life > c.max || c.y > H + 40) { CF.splice(i, 1); continue; } c.vy += 820 * dt; c.vx *= .992; c.vy *= .992; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.fl += dt * 9; const a = Math.min(1, (c.max - c.life) * 1.5); g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.scale(1, Math.cos(c.fl)); g.globalAlpha = a; g.fillStyle = `rgb(${c.col})`; g.shadowColor = `rgb(${c.col})`; g.shadowBlur = 8; g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); g.restore(); }
  g.globalAlpha = 1; g.shadowBlur = 0;
}
// ambient bg
const DUST = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), ph: Math.random() * 6, c: [[164, 92, 255], [53, 240, 255], [255, 79, 163]][(Math.random() * 3) | 0] }));
function drawBg(dtv, now) {
  const w = bg.width, h = bg.height, t = now / 1000; bgc.setTransform(1, 0, 0, 1, 0, 0); bgc.clearRect(0, 0, w, h);
  const bgG = bgc.createLinearGradient(0, 0, 0, h); bgG.addColorStop(0, '#0b0522'); bgG.addColorStop(.6, '#05030f'); bgG.addColorStop(1, '#0a0420'); bgc.fillStyle = bgG; bgc.fillRect(0, 0, w, h);
  const blobs = [[.2, .25, 420, 'rgba(164,92,255,.22)', 0], [.82, .5, 460, 'rgba(53,240,255,.12)', 2], [.5, .9, 520, 'rgba(255,46,99,.14)', 4]];
  for (const [bx, by, r, col, ph] of blobs) { const x = (bx + Math.sin(t * .08 + ph) * .06) * w, y = (by + Math.cos(t * .07 + ph) * .05) * h, rr = r * (w / 900 + .5); const rg = bgc.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); bgc.fillStyle = rg; bgc.fillRect(0, 0, w, h); }
  bgc.globalCompositeOperation = 'lighter';
  for (const d of DUST) { d.y -= dtv / 1000 * (.004 + d.z * .01); if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); } const a = (.25 + .5 * Math.sin(t * 1.5 + d.ph) ** 2) * (.3 + d.z * .6), s = (1 + d.z * 2.5) * (w / 800 + .6); bgc.globalAlpha = a; bgc.fillStyle = `rgb(${d.c})`; bgc.beginPath(); bgc.arc(d.x * w, d.y * h, s, 0, 6.283); bgc.fill(); }
  bgc.globalAlpha = 1; bgc.globalCompositeOperation = 'source-over';
}

// ---------- lock + reveal ----------
function winnersText(res) { return res.winners.map(i => DOORS[i].name).join(' & '); }
function doLock() {
  S.phase = 'lock'; S.pt = 0; S.counts = S.round.final.slice(); S.total = N; S.surge = 1;
  const r = S.round; r.pick = S.pick; r.stakeC = S.pick !== null ? S.stakeC : 0;
  const res = E.settle(r.final, S.pick === null ? -1 : S.pick); S.res = res;
  r.winners = res.winners; r.outcome = S.pick === null ? 'nobet' : res.outcome; r.base = res.base || 1;
  r.mult = S.pick === null ? 0 : res.mult; r.s = res.s;
  r.payoutC = S.pick === null ? 0 : Math.min(Math.round(r.stakeC * res.mult), CAP_C);
  r.capped = S.pick !== null && Math.round(r.stakeC * res.mult) > CAP_C;
  if (S.pick !== null) { SAVE.bal -= r.stakeC; }
  persist();
  setPhase('lock', 'LOCKED'); $('#mLabel').textContent = 'LOCKED at ' + (r.lockMs / 1000).toFixed(2) + 's'; $('#mFill').style.width = (r.lockMs / 20000 * 100) + '%'; $('#mTime').textContent = (r.lockMs / 1000).toFixed(2) + 's';
  stage.classList.add('cinema', 'frozen', 'lockfx'); S.shake = 1;
  DOORS.forEach(d => { d.el.classList.add('shut'); d.el.classList.remove('fewest'); });
  A.thud(); A.silenceDuck(2.2); vib([60, 40, 120]);
  banner('LOCKED', 'THE FEWEST WINS', '#fff', true);
  $('#flash').animate([{ opacity: .85 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' });
  $('#meter').classList.remove('tense'); vig.style.opacity = 0;
  updatePlates();
}
function doReveal() {
  S.phase = 'reveal'; S.pt = 0; const r = S.round, res = S.res;
  stage.classList.remove('frozen'); setTimeout(() => stage.classList.remove('cinema'), 900);
  DOORS.forEach(d => { const w = res.winners.includes(d.id); d.el.classList.remove('shut'); d.el.classList.add(w ? 'open' : 'dim'); d.el.classList.toggle('winner', w); if (!w) d.el.classList.add('shut'); });
  const refund = res.outcome === 'refund'; if (refund) DOORS.forEach(d => { d.el.classList.remove('dim', 'shut'); d.el.classList.add('open'); });
  const won = r.outcome === 'win' || r.outcome === 'tie-win', hasBet = S.pick !== null;
  const wc = DOORS[res.winners[0]], wcount = r.final[res.winners[0]];
  readAnchors();
  const ctr = res.winners.map(i => { const rc = DOORS[i].el.querySelector('.door').getBoundingClientRect(); return [rc.left + rc.width / 2, rc.top + rc.height * .55, DOORS[i].rgb]; });
  const power = clamp(.6 + Math.log2(r.base) * .22, .6, 1.6);
  if (!refund) ctr.forEach(([x, y, rgb]) => burst(x, y, rgb, won ? power : .55, won)); else ctr.forEach(([x, y, rgb]) => burst(x, y, [53, 240, 255], .4, false));
  S.shake = won ? .8 : .4; $('#flash').animate([{ opacity: .6 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
  $$('.lad').forEach(l => l.classList.toggle('hot', +l.dataset.i === tierIdx(res.s)));
  const rs = $('#result'); const rc = won ? wc.rgb : refund ? [53, 240, 255] : [164, 92, 255]; rs.style.setProperty('--rc', rc.join(','));
  rs.className = 'result ' + (won ? 'win' : refund ? 'refund' : 'lose');
  const wl = winnersText(res);
  if (r.outcome === 'nobet') rs.innerHTML = `<div class="r-card"><div class="r-kick">${wl} WINS · ${fmtN(wcount)} PLAYERS</div><div class="r-mult" style="font-size:40px">${fmtMult(r.base)}×</div><div class="r-sub">No bet this round — tap a door next time</div></div>`;
  else if (won) rs.innerHTML = `<div class="r-card"><div class="r-kick">${r.outcome === 'tie-win' ? 'DEAD HEAT · PAYOUT SPLIT' : 'YOU WON'} · ${wl}</div><div class="r-mult" id="rMult">0×</div><div class="r-sub">+<b id="rAmt">0.00</b> credits${r.capped ? ' <small>(max win cap)</small>' : ''}</div><button class="r-btn" id="btnShare">SHARE ↗</button></div>`;
  else if (refund) rs.innerHTML = `<div class="r-card"><div class="r-kick">ALL THREE DOORS EQUAL</div><div class="r-mult">REFUND</div><div class="r-sub">+${fm(r.stakeC)} credits returned</div></div>`;
  else rs.innerHTML = `<div class="r-card"><div class="r-kick">NOT THIS TIME</div><div class="r-mult">${wl} WON</div><div class="r-sub">${fmtN(wcount)} players took the pool · −${fm(r.stakeC)}</div><button class="r-btn" id="btnShare">SHARE ↗</button></div>`;
  requestAnimationFrame(() => rs.classList.add('show'));
  const sb = $('#btnShare'); if (sb) sb.onclick = () => openShare(r);
  if (won) { S.countUp = { t: 0, to: r.mult, last: 0, amt: r.payoutC }; A.burst(); A.win(r.mult, r.base >= 8); vib(r.base >= 8 ? [40, 30, 40, 30, 200] : [40, 30, 90]); }
  else if (refund) { A.refund(); vib(40); } else { A.burst(); setTimeout(() => A.lose(), 120); vib(r.outcome === 'nobet' ? 10 : [120]); }
  SAVE.bal += r.payoutC; if (SAVE.bal < 10) { SAVE.bal = 100000; setTimeout(() => toast('Demo credits refilled to 1000'), 1800); }
  if (S.stakeC > SAVE.bal) S.stakeC = Math.max(10, Math.floor(SAVE.bal / 10) * 10);
  SAVE.hist.unshift({ no: r.no, seed: r.seed, lockMs: r.lockMs, final: r.final, hash: r.hash, commitInput: r.commitInput, pick: r.pick, stakeC: r.stakeC, payoutC: r.payoutC, mult: r.mult, base: r.base, winners: r.winners, outcome: r.outcome });
  persist(); renderHist(true); renderStake(); renderBal(true);
  setPhase('reveal', r.outcome === 'nobet' ? 'RESULT' : won ? 'WIN' : refund ? 'REFUND' : 'RESULT');
  $('#mLabel').textContent = 'Seed revealed · tap COMMIT to verify';
  $('#hashShort').textContent = r.hash.slice(0, 6) + '…' + r.hash.slice(-6);
}

// ---------- history ----------
function renderHist(isNew) {
  const h = $('#hist'); if (!SAVE.hist.length) { h.innerHTML = '<span class="empty">Your rounds will show up here</span>'; return; }
  h.innerHTML = SAVE.hist.slice(0, 30).map((r, i) => { const w = r.winners.length > 1 ? (r.outcome === 'refund' ? 'refund' : 'tie') : null; const D = DOORS[r.winners[0]]; const cls = r.outcome === 'win' || r.outcome === 'tie-win' ? 'w' : r.outcome === 'lose' ? 'l' : ''; return `<button class="hi ${cls} ${isNew && i === 0 ? 'new' : ''}" data-i="${i}" style="--c:${r.outcome === 'refund' ? '#35f0ff' : D.c}" aria-label="Round ${r.no}"><span class="dot">${r.winners.length === 3 ? '=' : r.winners.length === 2 ? '½' : ''}</span><span class="hx">${fmtMult(r.base)}×</span></button>`; }).join('');
}
$('#hist').addEventListener('click', e => { const b = e.target.closest('.hi'); if (b) openVerify(SAVE.hist[+b.dataset.i]); });

// ---------- modals ----------
function openModal(id) { $(id).classList.add('show'); } function closeModals() { $$('.modal.show').forEach(m => m.classList.remove('show')); }
$$('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));
$$('[data-close]').forEach(b => b.addEventListener('click', closeModals));
addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });
const openHow = () => { A.init(); A.tap(); openModal('#mHow'); SAVE.helped = true; persist(); };
$('#btnHelp').onclick = openHow; $('#linkHow').onclick = openHow;
$('#linkMath').onclick = () => { fillMath(); openModal('#mMath'); A.tap(); };
$('#linkVerify').onclick = () => { openVerify(SAVE.hist[0] || null); };
$('#btnCommit').onclick = () => { openVerify(S.phase === 'reveal' || !S.round ? (SAVE.hist[0] || null) : null); };
function fillMath() {
  const mc = MCD.mc; if (!mc) return;
  $('#rtpBig').textContent = (mc.rtpMean * 100).toFixed(2) + '%'; $('#rtpRounds').textContent = fmtN(mc.rounds);
  $('#rtpDoors').innerHTML = DOORS.map(d => `<div style="--c:${d.c};--cr:${d.rgb}"><small>${d.name}</small><b>${(mc.rtpByDoor[d.name[0] + d.name.slice(1).toLowerCase()] * 100).toFixed(2)}%</b></div>`).join('');
  const keys = ['<5%', '5-10%', '10-20%', '20-27%', '27-33.3%'];
  $('#tierTbl').innerHTML = `<tr><th>WINNING DOOR SHARE</th><th>CHANCE</th><th>PAYS</th></tr>` + TIERS.map((t, i) => `<tr><td>${tierLabel(i).replace('< ', '&lt; ')}</td><td>${(mc.tierFreq[keys[i]] * 100).toFixed(2)}%</td><td class="mx">${fmtMult(t.mult)}×</td></tr>`).join('');
  $('#tieRate').textContent = (mc.tieRate * 100).toFixed(2) + '%';
}
$('#btnMc').onclick = async () => {
  const out = $('#mcOut'), n = 300000, ret = [0, 0, 0]; out.textContent = 'running…'; await new Promise(r => setTimeout(r, 30));
  const t0 = performance.now(); for (let i = 0; i < n; i++) { const c = E.splitFromRng(E.rngFromSeed('b' + i + Math.random())); for (let d = 0; d < 3; d++) ret[d] += E.settle(c, d).mult; if (i % 50000 === 0) { out.textContent = Math.round(i / n * 100) + '%…'; await new Promise(r => setTimeout(r, 0)); } }
  out.textContent = `RTP ${(ret.reduce((a, b) => a + b) / n / 3 * 100).toFixed(2)}% (R ${(ret[0] / n * 100).toFixed(1)} · G ${(ret[1] / n * 100).toFixed(1)} · B ${(ret[2] / n * 100).toFixed(1)}) in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
};
async function webcryptoHash(s) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return null; } }
let verRec = null;
function openVerify(rec) {
  verRec = rec; const kv = $('#verKv'), vd = $('#verdict') || $('#verVerdict'), cur = S.round;
  if (!rec) { // current round, seed hidden
    kv.innerHTML = `<div><small>ROUND</small><code>#${cur ? cur.no : '—'}</code></div><div><small>COMMITMENT · SHA-256( lockTime | seed | R,G,B )</small><code>${cur ? cur.hash : '—'}</code></div><div><small>SEED</small><code class="hid">hidden until the round ends</code></div>`;
    $('#verVerdict').className = 'verdict pend'; $('#verVerdict').textContent = 'Published before the round. The lock time and final crowd split are already sealed inside this hash.';
  } else {
    const rb = E.buildRound(rec.seed); const match = rb.hash === rec.hash && rb.lockMs === rec.lockMs && rb.final.join() === rec.final.join();
    kv.innerHTML = `<div><small>ROUND</small><code>#${rec.no}</code></div><div><small>COMMITTED HASH (shown before the round)</small><code>${rec.hash}</code></div><div><small>SEED (revealed)</small><code>${rec.seed}</code></div><div><small>LOCK TIME</small><code>${rec.lockMs} ms (${(rec.lockMs / 1000).toFixed(3)} s)</code></div><div><small>FINAL SPLIT — RED · GOLD · BLUE</small><code>${rec.final.join(' · ')}</code></div><div><small>HASH INPUT</small><code>${rec.commitInput}</code></div><div><small>RECOMPUTED SHA-256 (in your browser)</small><code id="reh">${rb.hash}</code></div>`;
    $('#verVerdict').className = 'verdict ' + (match ? 'ok' : 'pend'); $('#verVerdict').textContent = match ? '✓ Verified — the seed regenerates exactly the same lock time and crowd split, and they hash to the commitment.' : '✗ Mismatch';
    webcryptoHash(rec.commitInput).then(h => { if (h && verRec === rec) { const el = $('#reh'); if (el) el.insertAdjacentHTML('afterend', `<code style="margin-top:4px;color:${h === rec.hash ? '#7dffb0' : '#ff8aa6'}">WebCrypto check: ${h === rec.hash ? '✓ identical' : '✗ different'}</code>`); } });
  }
  openModal('#mVerify'); A.tap();
}
$('#btnReverify').onclick = () => openVerify(verRec);
$('#btnCopyHash').onclick = () => { const h = verRec ? verRec.hash : (S.round && S.round.hash); if (h && navigator.clipboard) navigator.clipboard.writeText(h).then(() => toast('Hash copied'), () => toast('Copy failed')); };

// ---------- share ----------
let shareRec = null, shareText = '';
function openShare(r) {
  shareRec = r; const won = r.outcome === 'win' || r.outcome === 'tie-win', D = DOORS[r.pick], cnt = r.final[r.pick];
  shareText = won ? `I was 1 of ${cnt} — won ${fmtMult(r.mult)}x on OUTLIER` : `I was 1 of ${cnt} on ${D.name} — the crowd got me on OUTLIER`;
  drawShare(r); openModal('#mShare'); A.tap();
}
function drawShare(r) {
  const cv = $('#shareCanvas'), x = cv.getContext('2d'), Wc = 1080, Hc = 1350, won = r.outcome === 'win' || r.outcome === 'tie-win', D = DOORS[r.pick], cnt = r.final[r.pick];
  const bgG = x.createLinearGradient(0, 0, 0, Hc); bgG.addColorStop(0, '#1a0a45'); bgG.addColorStop(.55, '#07041a'); bgG.addColorStop(1, '#14052e'); x.fillStyle = bgG; x.fillRect(0, 0, Wc, Hc);
  const rg = x.createRadialGradient(540, 600, 0, 540, 600, 760); rg.addColorStop(0, `rgba(${D.rgb},.55)`); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, Wc, Hc);
  x.save(); x.translate(540, 1100); x.globalAlpha = .35; for (let i = -12; i <= 12; i++) { x.strokeStyle = '#a45cff'; x.beginPath(); x.moveTo(i * 36, 0); x.lineTo(i * 220, 330); x.stroke(); } x.restore();
  // three doors
  [0, 1, 2].forEach(i => { const d = DOORS[i], dx = 200 + i * 260, dw = 190, dh = i === 1 ? 330 : 290, top = 330 + (i === 1 ? 0 : 40); const winD = r.winners.includes(i);
    x.save(); x.shadowColor = d.c; x.shadowBlur = winD ? 70 : 24; x.strokeStyle = d.c; x.lineWidth = 5; x.fillStyle = winD ? `rgba(${d.rgb},.55)` : 'rgba(255,255,255,.04)';
    x.beginPath(); x.moveTo(dx - dw / 2, top + dh); x.lineTo(dx - dw / 2, top + dw / 2); x.arc(dx, top + dw / 2, dw / 2, Math.PI, 0); x.lineTo(dx + dw / 2, top + dh); x.closePath(); x.fill(); x.stroke(); x.restore();
    x.fillStyle = '#fff'; x.font = '700 40px "Chakra Petch"'; x.textAlign = 'center'; x.fillText(String(r.final[i]), dx, top + dh + 56); x.fillStyle = d.c; x.font = '700 22px "Unbounded"'; x.fillText(d.name, dx, top + dh + 94); if (r.pick === i) { x.fillStyle = d.c; x.beginPath(); x.moveTo(dx - 14, top - 40); x.lineTo(dx + 14, top - 40); x.lineTo(dx, top - 14); x.fill(); x.fillStyle = '#fff'; x.font = '700 20px "Chakra Petch"'; x.fillText('YOU', dx, top - 52); } });
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '900 84px "Unbounded"'; const gl = x.createLinearGradient(240, 0, 840, 0); gl.addColorStop(0, '#ff7aa0'); gl.addColorStop(.5, '#ffd36b'); gl.addColorStop(1, '#6fc4ff'); x.fillStyle = gl; x.shadowColor = '#a45cff'; x.shadowBlur = 30; x.fillText('OUTLIER', 540, 170); x.shadowBlur = 0;
  x.fillStyle = '#9a93c4'; x.font = '600 24px "Chakra Petch"'; x.fillText('B E   T H E   F E W .   T A K E   T H E   P O O L .', 540, 218);
  x.fillStyle = '#fff'; x.font = '700 58px "Chakra Petch"'; x.fillText(`I was 1 of ${cnt}`, 540, 940);
  x.shadowColor = won ? '#ffb13d' : D.c; x.shadowBlur = 40; x.font = '900 150px "Unbounded"'; const g2 = x.createLinearGradient(0, 960, 0, 1100); g2.addColorStop(0, '#fff'); g2.addColorStop(1, won ? '#ffb13d' : '#8e86c0'); x.fillStyle = g2;
  x.fillText(won ? fmtMult(r.mult) + '×' : 'MISSED', 540, 1090); x.shadowBlur = 0;
  x.fillStyle = won ? '#7dffb0' : '#ff8aa6'; x.font = '700 40px "Chakra Petch"'; x.fillText(won ? `WON +${fm(r.payoutC)} DEMO CREDITS` : `${winnersText({ winners: r.winners })} took the pool`, 540, 1168);
  x.fillStyle = '#6e679a'; x.font = '500 22px "Chakra Petch"'; x.fillText(`Round #${r.no} · commit ${r.hash.slice(0, 10)}… · Prototype — demo credits`, 540, 1290);
}
function shareBlob() { return new Promise(res => $('#shareCanvas').toBlob(res, 'image/png')); }
$('#btnShareNow').onclick = async () => { const b = await shareBlob(); const f = new File([b], 'outlier-result.png', { type: 'image/png' }); try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], text: shareText, title: 'OUTLIER' }); else if (navigator.share) await navigator.share({ text: shareText, url: location.href }); else { navigator.clipboard.writeText(shareText + ' ' + location.href); toast('Text copied'); } } catch (e) { } };
$('#btnDl').onclick = async () => { const b = await shareBlob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `outlier-round-${shareRec.no}.png`; a.click(); };
$('#btnCopyTxt').onclick = () => { navigator.clipboard.writeText(shareText + ' ' + location.href).then(() => toast('Copied'), () => toast('Copy failed')); };

// ---------- sound toggle ----------
function renderSound() { $('#btnSound').classList.toggle('off', !A.on); $('#svgSndOn').style.display = A.on ? '' : 'none'; $('#svgSndOff').style.display = A.on ? 'none' : ''; }
$('#btnSound').onclick = () => { A.init(); A.on = !A.on; SAVE.sound = A.on; A.setOn(A.on); renderSound(); persist(); if (A.on) A.tap(); toast(A.on ? 'Sound on' : 'Sound off'); };

// ---------- plates ----------
function updatePlates() {
  const c = S.counts, tot = Math.max(1, c[0] + c[1] + c[2]), min = Math.min(...c);
  const live = S.phase === 'open' && S.t > 3500 && !S.frozen;
  DOORS.forEach((d, i) => { const s = c[i] / N; d.n.textContent = fmtN(c[i]); d.p.textContent = (c[i] / tot * 100).toFixed(1) + '%'; d.bar.style.width = (c[i] / tot * 100) + '%'; d.el.style.setProperty('--lit', clamp(c[i] / tot * 1.5, 0, 1).toFixed(3)); d.el.classList.toggle('fewest', live && c[i] === min); });
  if (S.phase === 'open' || S.phase === 'lock') { const ti = tierIdx(min / Math.max(N, 1)); if (S.phase === 'open' && S.t > 3500) $$('.lad').forEach(l => l.classList.toggle('live', +l.dataset.i === ti)); }
}

// ---------- main loop ----------
let last = performance.now(), shakeX = 0, shakeY = 0;
function frame(now) {
  const rawDt = Math.min(50, now - last); last = now; const real = rawDt * SPEED; S.clock += real;
  // phase logic (real time)
  if (S.phase === 'intro') { S.pt += real; if (S.pt > 1500) { S.phase = 'open'; S.t = 0; setPhase('open', 'LIVE'); renderPick(); renderBal(); } }
  if (S.phase === 'open') {
    S.t += real; const st = S.path(S.t); S.counts = st.counts; S.total = st.total; S.surge = st.surge;
    const L = S.round.lockMs;
    if (!S.frozen && S.t >= L - FREEZE) { S.frozen = true; stage.classList.add('frozen'); setPhase('frozen', 'FINAL SWING'); banner('NO MORE BETS', 'THE CROWD STAMPEDES', '#ff5f86', true); A.riser(); vib([20, 30, 20]); renderPick(); renderBal(true); }
    S.tension = clamp((S.t - 5000) / 15000, 0, 1); if (S.frozen) S.tension = 1;
    const m = $('#meter'); m.classList.toggle('tense', S.tension > .02); m.style.setProperty('--tense', S.tension.toFixed(2)); m.style.setProperty('--bpm', (60 / (62 + S.tension * 92)).toFixed(3) + 's');
    $('#mFill').style.width = clamp(S.t / 20000 * 100, 0, 100) + '%'; $('#mHeart').style.left = clamp(S.t / 20000 * 100, 0, 100) + '%'; $('#mTime').textContent = (S.t / 1000).toFixed(1) + 's';
    if (S.t > 10000 && !S.frozen) $('#mLabel').textContent = 'DANGER ZONE · locks any moment'; else if (S.t > 3500 && !S.frozen) $('#mLabel').textContent = 'Hidden lock between 10s and 20s'; else if (!S.frozen) $('#mLabel').textContent = 'The crowd is flooding in…'; else $('#mLabel').textContent = 'Picks closed · final swing…';
    A.heartbeatTick(S.clock, S.tension); if (S.clock - S.lastBeatVis > 60000 / (62 + S.tension * 92)) { S.lastBeatVis = S.clock; if (S.tension > .1) vig._p = .35 + S.tension * .65; }
    feedTick(real);
    if (S.t >= L) doLock();
  } else if (S.phase === 'lock') {
    S.pt += real; const p = S.pt;
    S.ts = p < 120 ? lerp(1, .12, p / 120) : p < 900 ? .12 : p < 1500 ? lerp(.12, 1, (p - 900) / 600) : 1;
    if (p >= 1500) { S.ts = 1; doReveal(); }
  } else if (S.phase === 'reveal') {
    S.pt += real; S.ts = 1;
    if (S.countUp) { const cu = S.countUp; cu.t += real; const u = clamp((cu.t - 250) / 1100, 0, 1), v = cu.to * easeOut(u), el = $('#rMult'); if (el) { el.textContent = fmtMult(v) + '×'; const a = $('#rAmt'); if (a) a.textContent = fm(Math.round(cu.amt * easeOut(u))); } if (u > 0 && u < 1 && cu.t - cu.last > 65) { cu.last = cu.t; A.countTick(u); vib(6); } if (u >= 1 && !cu.done) { cu.done = true; if (el) el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.2,1.6,.4,1)' }); S.shake = Math.max(S.shake, .5); } }
    if (S.pt > 5600) startRound();
  }
  if (S.phase !== 'lock') S.ts = lerp(S.ts, 1, .2);
  const dtv = real * S.ts;
  if (S.phase === 'open' || S.phase === 'lock') updatePlates(); else if (S.phase === 'reveal' && S.pt < 60) updatePlates(); else if (S.phase === 'intro') { updatePlates(); }
  // shake
  if (S.shake > 0.01) { S.shake *= Math.pow(.0009, dtv / 1000 * (S.ts < .5 ? .6 : 1)); const a = S.shake * (innerWidth < 600 ? 9 : 14); shakeX = rnd(-a, a); shakeY = rnd(-a, a); } else { S.shake = 0; shakeX = shakeY = 0; }
  if (S.phase === 'open' && S.surge > 0) { const a = S.surge * 3; shakeX += rnd(-a, a); shakeY += rnd(-a, a); }
  doorsEl.style.transform = `translate(${shakeX}px,${shakeY}px)`;
  vig._p = (vig._p || 0) * .9; vig.style.opacity = S.phase === 'open' ? (vig._p * .8 + (S.frozen ? .25 : 0)).toFixed(3) : 0;
  readAnchors(); updateCrowd(dtv, now); drawFx(dtv, now); drawBg(dtv, now);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
function enterGame() {
  A.init(); A.enter(); vib([30, 20, 60]);
  const sp = $('#splash'); sp.classList.add('leaving'); setTimeout(() => sp.classList.add('hide'), 700); setTimeout(() => sp.remove(), 1500);
  setTimeout(() => { if (!SAVE.helped && !Q.has('help')) openHow(); }, 1700);
  startRound();
}
$('#btnEnter').onclick = enterGame;
renderSound(); renderStake(); renderHist(); renderBal();
if (Q.get('splash') === '0') { $('#splash').remove(); A.init(); startRound(); if (!SAVE.helped && Q.get('help') !== '0') openHow(); }
requestAnimationFrame(frame);
window.__outlier = { S, E, SAVE, DOORS, pickDoor, setT: (ms) => { S.t = ms; }, openVerify, openShare, openHow, doLock, doReveal, startRound, setCounts: (c) => { S.counts = c; } };
})();

;
