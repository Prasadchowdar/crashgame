// OUTLIER engine — shared by the game (browser) and checks (node). Pure, deterministic from the round seeds.
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

  // ---- House-mode model (GDD v1.0 §06–07): one draw 0..2999 -> winning door + payout level ----
  const N = 1000, GAME_TYPE = 107, DRAWS = 3000, TICKS = 21, LOCK0 = 10000, TICK_MS = 500, CLOSE = 600;
  const LEVELS = [ // weight per 1,000 (per door), pays × stake incl. stake, winning door's head-count band
    { w: 5, pay: 20, lo: 0, hi: 49 }, { w: 25, pay: 10, lo: 50, hi: 99 }, { w: 90, pay: 5, lo: 100, hi: 199 },
    { w: 260, pay: 3, lo: 200, hi: 269 }, { w: 620, pay: 2, lo: 270, hi: 332 }];
  const keccak = root.keccak256;
  const TAG = [...'NEW_CRASH_V1'].map(c => c.charCodeAt(0));
  const hexBytes = h => h.match(/../g).map(x => parseInt(x, 16));
  const toHex = a => a.map(x => x.toString(16).padStart(2, '0')).join('');
  // Keccak256(NEW_CRASH_V1 ‖ platform_seed_32 ‖ player_seed_u64_le ‖ game_type_u16_le ‖ counter_u32_le)
  function digest(platformHex, playerSeed, counter) {
    const b = [...TAG, ...hexBytes(platformHex)];
    let p = BigInt(playerSeed); for (let i = 0; i < 8; i++) { b.push(Number(p & 255n)); p >>= 8n; }
    b.push(GAME_TYPE & 255, GAME_TYPE >> 8);
    for (let i = 0; i < 4; i++) b.push((counter >>> (8 * i)) & 255);
    return keccak.array(b);
  }
  const u64 = (d, o) => { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 8n) | BigInt(d[o + i]); return x; };
  function uniform(platformHex, playerSeed, counter, n) { // rejection sampling, no modulo bias
    const d = digest(platformHex, playerSeed, counter), lim = (1n << 64n) / BigInt(n) * BigInt(n);
    // ponytail: on a reject we take the next 8 digest bytes (odds ~1e-16 per word); must match the backend's retry rule before launch
    for (let o = 0; o < 32; o += 8) { const x = u64(d, o); if (x < lim) return Number(x % BigInt(n)); }
    throw new Error('rejection sampling exhausted');
  }
  function decode(idx) { const door = Math.floor(idx / 1000); let r = idx % 1000, level = 0; while (r >= LEVELS[level].w) r -= LEVELS[level++].w; return { door, level }; }
  function levelForCount(c) { for (let i = 0; i < LEVELS.length; i++) if (c <= LEVELS[i].hi) return i; return LEVELS.length - 1; }
  // final crowd (display only, counter 2): the winner is strictly the emptiest, inside its level's band
  function finalCrowd(platformHex, playerSeed, win, level) {
    const d = digest(platformHex, playerSeed, 2), { lo, hi } = LEVELS[level], m = (o, n) => Number(u64(d, o) % BigInt(n));
    const c = lo + m(0, hi - lo + 1), aLo = c + 1, aHi = N - c - (c + 1), a = aLo + m(8, aHi - aLo + 1), b = N - c - a;
    const out = [0, 0, 0], others = [0, 1, 2].filter(i => i !== win), sw = m(16, 2);
    out[win] = c; out[others[sw]] = a; out[others[1 - sw]] = b; return out;
  }
  function buildRound(platformHex, playerSeed) {
    const idx = uniform(platformHex, playerSeed, 0, DRAWS), { door, level } = decode(idx);
    return { platform: platformHex, player: String(playerSeed), commit: keccak(hexBytes(platformHex)), idx, win: door, level, pay: LEVELS[level].pay,
      lockMs: LOCK0 + TICK_MS * uniform(platformHex, playerSeed, 1, TICKS), final: finalCrowd(platformHex, playerSeed, door, level),
      pathKey: toHex(digest(platformHex, playerSeed, 3)) };
  }
  const settle = (r, door, stakeC) => ({ won: door === r.win, payoutC: door === r.win ? stakeC * r.pay : 0 });

  // ---- Live crowd (display only). Before bets close it reads only counter 3, never the result (GDD §04 rule 2, §07) ----
  const easeIO = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const smooth = u => (u = Math.min(1, Math.max(0, u)), u * u * (3 - 2 * u));
  function lrCounts(shares, total) {
    const raw = shares.map(x => x * total), cnt = raw.map(Math.floor); let rem = total - cnt[0] - cnt[1] - cnt[2];
    const order = [0, 1, 2].sort((i, j) => (raw[j] - cnt[j]) - (raw[i] - cnt[i]));
    for (let k = 0; rem > 0; k++, rem--) cnt[order[k % 3]]++;
    return cnt;
  }
  function clampShares(sh, lo, hi) { // every door inside [lo, hi], shares still sum to 1
    for (let k = 0; k < 6; k++) {
      sh = sh.map(x => Math.min(hi, Math.max(lo, x)));
      const err = 1 - (sh[0] + sh[1] + sh[2]); if (Math.abs(err) < 1e-12) break;
      const mv = [0, 1, 2].filter(i => err > 0 ? sh[i] < hi : sh[i] > lo);
      sh = sh.map((x, i) => mv.includes(i) ? x + err / mv.length : x);
    }
    return sh;
  }
  // 24–40% of the people inside before 10 s, 30–36% from 10 s (margins absorb the 1-person rounding)
  const bounds = ts => ts < 10 ? [.243, .397] : [.303, .357];
  function preShares(r) {
    const rng = rngFromSeed(r.pathKey);
    const comp = [0, 1, 2].map(() => [0, 1, 2].map(() => ({ f: .6 + rng() * 1.4, p: rng() * 6.283, w: .4 + rng() * .6 })));
    return ts => {
      const amp = .075 - .053 * smooth((ts - 8) / 1.5);
      const v = comp.map(cs => cs.reduce((a, c) => a + c.w * Math.sin(ts * c.f + c.p), 0) / 1.5), mean = (v[0] + v[1] + v[2]) / 3;
      const [lo, hi] = bounds(ts); return clampShares(v.map(x => 1 / 3 + amp * (x - mean)), lo, hi);
    };
  }
  const closeCounts = r => lrCounts(preShares(r)((r.lockMs - CLOSE) / 1000), N);
  function makePath(r) {
    const pre = preShares(r), tf = r.lockMs - CLOSE, fin = r.final.map(x => x / N), from = pre(tf / 1000);
    return function (t) {
      if (t >= r.lockMs) return { counts: r.final.slice(), total: N, surge: 1 };
      if (t <= tf) { const ramp = Math.min(1, t / 3500), total = Math.round(N * ramp * ramp * (3 - 2 * ramp)); return { counts: lrCounts(pre(t / 1000), total), total, surge: 0 }; }
      const u = (t - tf) / CLOSE, e = easeIO(u); // the final rush: bets are closed, the crowd surges into the result
      let sh = from.map((x, i) => x + (fin[i] - x) * e + Math.sin(u * Math.PI) * .04 * Math.sin(u * 19 + i * 2.1));
      const S = sh[0] + sh[1] + sh[2]; sh = u > .97 ? fin : sh.map(x => Math.max(.005, x / S));
      return { counts: lrCounts(sh, N), total: N, surge: u };
    };
  }

  const api = { sha256, rngFromSeed, keccak, hexBytes, toHex, N, CLOSE, DRAWS, LEVELS, GAME_TYPE, decode, levelForCount, uniform, buildRound, settle, makePath, closeCounts, bounds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OutlierEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

;
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

