// OUTLIER UI — picture-first, house mode per the GDD: pick + PLAY, switch until bets close, final rush decides.
(() => {
'use strict';
const E = OutlierEngine, A = OutlierAudio;
const N = E.N, FREEZE = E.CLOSE, CD = 1000, LV = E.LEVELS, START_C = 5000;
const Q = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, +Q.get('speed') || 1);
const TICK = Q.has('tick'); // test harness: drive the loop with a timer (hidden preview panes pause rAF)
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
const HAND = '<svg viewBox="0 0 52 56"><path d="M17 31V9a4 4 0 0 1 8 0v13a4 4 0 0 1 8 0v2a4 4 0 0 1 8 0v3a3.6 3.6 0 0 1 7 1v10c0 9-6.5 15-15 15h-3c-5.5 0-9-2.4-12-6.6L5.6 36.6a4 4 0 0 1 6.4-4.8z" fill="#fff" stroke="#1a0f3a" stroke-width="3" stroke-linejoin="round"/></svg>';
const icon = (v, cls = '') => `<i class="ic ${cls}" style="--m:var(--i-${v})"></i>`;

// ---------- persistence ----------
// demo wallet: 50 coins, no refill (?reset starts over). `live` = the round in play, settled on reload.
let SAVE = { bal: START_C, hist: [], roundNo: 0, intro: false, sound: true, live: null };
try { const s = JSON.parse(localStorage.getItem('outlier.v2')); if (s && typeof s.bal === 'number') SAVE = Object.assign(SAVE, s); } catch (e) { }
const persist = () => { try { localStorage.setItem('outlier.v2', JSON.stringify({ bal: SAVE.bal, hist: SAVE.hist.slice(0, 100), roundNo: SAVE.roundNo, intro: SAVE.intro, sound: SAVE.sound, live: SAVE.live })); } catch (e) { } };
if (Q.has('reset')) { SAVE.bal = START_C; SAVE.hist = []; SAVE.roundNo = 0; SAVE.intro = false; SAVE.live = null; }

// ---------- state ----------
const S = { phase: 'idle', pt: 0, t: 0, clock: 0, frozen: false, pick: null, lastSwitch: -9999, stakeC: 100, round: null, path: null, next: null, counts: [0, 0, 0], total: 0, surge: 0, ts: 1, res: null, shake: 0, tension: 0, lastBeatVis: 0, crownD: -1, crownT: 0, stKey: '' };
A.on = SAVE.sound;

// ---------- DOM ----------
const stage = $('#stage'), doorsEl = $('#doors'), crownEl = $('#crown'), eyesEl = $('#eyes'), handEl = $('#hand'), hud = $('#hud'), fuse = $('#fuse'), playBtn = $('#btnPlay');
handEl.innerHTML = HAND;
DOORS.forEach(d => {
  const el = document.createElement('div');
  el.className = 'slot'; el.dataset.d = d.id; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', d.name + ' door');
  el.style.setProperty('--c', d.c); el.style.setProperty('--cr', d.rgb.join(','));
  el.innerHTML = `<div class="bub"><span class="br"><i class="coin"></i><b class="amt">?</b></span><small class="mx">×?</small></div>
  <div class="door"><div class="in"></div><div class="shut"><i class="lk"></i></div></div>
  <div class="cnt"><i class="pp"></i><b class="n">0</b><b class="fl"></b></div>`;
  doorsEl.appendChild(el);
  Object.assign(d, { el, amt: $('.amt', el), mx: $('.mx', el), n: $('.n', el), fl: $('.fl', el), inEl: $('.in', el), shutEl: $('.shut', el), doorEl: $('.door', el), bub: $('.bub', el) });
  el.addEventListener('pointerdown', e => { e.preventDefault(); pickDoor(d.id); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDoor(d.id); } });
});
addEventListener('keydown', e => {
  if (document.querySelector('.modal.show') || $('#intro').classList.contains('show')) return;
  if ('123'.includes(e.key) && e.key.length === 1) pickDoor(+e.key - 1);
  else if (e.key === 'Enter' && document.activeElement === document.body) play();
});
const vig = document.createElement('div'); vig.style.cssText = 'position:absolute;inset:-20px;z-index:11;pointer-events:none;opacity:0;background:radial-gradient(90% 80% at 50% 50%,transparent 45%,rgba(255,30,70,.6))'; stage.appendChild(vig);

const lvLabel = l => `${l.lo}–${l.hi} people`;
$('#howTbl').innerHTML = `<tr><th>WINNING DOOR HAS</th><th>YOU GET</th></tr>` + LV.map(l => `<tr><td>${lvLabel(l)}</td><td class="mx">${l.pay}× stake</td></tr>`).join('');
const EYES_SVG = $('#eyes svg').outerHTML;

const CHIPS = [10, 25, 50, 100, 500];
$('#chips').innerHTML = CHIPS.map(c => `<button class="chip" role="radio" data-c="${c}" aria-label="Bet $${fm(c)}"><span>${c < 100 ? fm(c).slice(1) : c / 100}</span></button>`).join('');
const payFor = (count, total) => LV[E.levelForCount(Math.round(count / total * N))].pay;

// ---------- toast / haptics ----------
let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1500); }
const vib = p => { if (A.on && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { } } };
const nudge = el => el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 300 });

// ---------- wallet ----------
let shownBal = null, balAnim = null;
function renderBal(anim) {
  const target = SAVE.bal, el = $('#bal'), w = $('#wallet');
  if (shownBal === null || !anim) { shownBal = target; el.textContent = fm(target); return; }
  const from = shownBal; if (from === target) return;
  w.classList.remove('up', 'dn'); void w.offsetWidth; w.classList.add(target > from ? 'up' : 'dn');
  const t0 = performance.now(), dur = 800; cancelAnimationFrame(balAnim);
  const step = () => { const u = Math.min(1, (performance.now() - t0) / dur); shownBal = Math.round(lerp(from, target, easeOut(u))); el.textContent = fm(shownBal); if (u < 1) balAnim = requestAnimationFrame(step); else shownBal = target; };
  step();
}
function renderStake() {
  $$('.chip').forEach(b => { const on = +b.dataset.c === S.stakeC; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  renderBal(true); renderPick(); updatePlates(); renderPlay();
}
function setStake(c) { S.stakeC = clamp(Math.round(c), 10, 500); A.chip(); vib(8); renderStake(); }
$('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; A.init(); if (S.phase !== 'idle') { toast('Chips change after this round'); return; } setStake(+b.dataset.c); });

function renderPick() { DOORS.forEach(d => d.el.classList.toggle('picked', S.pick === d.id)); }
const inRound = () => S.phase === 'intro' || S.phase === 'open' || S.phase === 'lock' || S.phase === 'reveal';
function renderPlay() {
  const idle = S.phase === 'idle', amt = '$' + fm(S.stakeC);
  playBtn.classList.toggle('live', !idle); $('#chips').classList.toggle('off', !idle);
  if (!idle) { playBtn.disabled = true; playBtn.textContent = S.pick === null ? 'GOOD LUCK' : `${amt} ON ${DOORS[S.pick].name}`; playBtn.classList.remove('go'); return; }
  const broke = SAVE.bal < S.stakeC;
  playBtn.disabled = S.pick === null || broke;
  playBtn.textContent = broke ? (SAVE.bal < CHIPS[0] ? 'OUT OF DEMO COINS' : 'PICK A SMALLER CHIP') : S.pick === null ? 'PICK A DOOR' : (S.res ? 'PLAY AGAIN ' : 'PLAY ') + amt;
  playBtn.classList.toggle('go', !playBtn.disabled);
}

// ---------- round ----------
function randHex(n) { const a = new Uint8Array(n); (crypto || window.msCrypto).getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); }
// the next round's seeds exist before PLAY, so FAIR can show the commitment first
function prepareNext() {
  const no = SAVE.roundNo + 1, fixed = Q.get('seed');
  const platform = fixed ? E.keccak(fixed + '-' + no) : randHex(32);
  const player = fixed ? String(no) : (BigInt('0x' + randHex(8)) % ((1n << 64n) - 1n) + 1n).toString();
  S.next = { platform, player, commit: E.keccak(E.hexBytes(platform)) };
}
function clearBoard() {
  S.res = null; S.counts = [0, 0, 0]; S.total = 0; S.surge = 0; S.frozen = false; S.crownD = -1; S.crownT = 0;
  DOORS.forEach(d => { d.el.classList.remove('locked', 'win', 'lose', 'fewest'); d.fl.className = 'fl'; });
  crownEl.classList.remove('show', 'big', 'hop'); eyesEl.classList.remove('show');
  hud.classList.remove('res'); $('#result').classList.remove('show');
  fuse.classList.remove('locked', 'tense'); $('#fFill').style.width = '0'; $('#fHead').style.left = '0'; $('#fTime').textContent = '0.0';
}
function play() {
  A.init();
  if (S.phase !== 'idle') return;
  if (S.pick === null) { toast('Tap a door first'); DOORS.forEach(d => nudge(d.el)); return; }
  if (SAVE.bal < S.stakeC) { toast(SAVE.bal < CHIPS[0] ? 'Out of demo coins' : 'Not enough demo coins'); return; }
  startRound();
}
playBtn.addEventListener('click', play);
function startRound() {
  const nx = S.next; SAVE.roundNo++;
  const r = E.buildRound(nx.platform, nx.player); r.no = SAVE.roundNo; r.stakeC = S.stakeC; r.first = S.pick; r.switches = [];
  S.round = r; S.path = E.makePath(r);
  clearBoard();
  SAVE.bal -= r.stakeC; SAVE.live = { platform: r.platform, player: r.player, no: r.no, stakeC: r.stakeC, door: S.pick, switches: [] }; persist();
  S.t = 0; S.tension = 0; A._beatAt = 0; S.phase = 'intro'; S.pt = 0; S.lastSwitch = -9999;
  flyChip($('.chip.on'), S.pick);
  A.newRound(); renderPick(); renderBal(true); updatePlates(); renderPlay();
}
function stamp(txt) { const s = $('#stamp'); s.textContent = txt; s.className = 'stamp'; void s.offsetWidth; s.className = 'stamp show'; }

function pickDoor(d) {
  A.init();
  const D = DOORS[d];
  if (S.phase === 'lock' || S.phase === 'reveal') return;
  if (S.frozen) { A.deny(); nudge(D.el); vib(20); return; }
  if (S.pick === d) return;
  const live = S.phase === 'intro' || S.phase === 'open';
  if (live && S.clock - S.lastSwitch < CD) { A.deny(); nudge(D.el); return; }
  if (!live && S.res) clearBoard();
  const first = S.pick === null; S.pick = d;
  if (live) { S.lastSwitch = S.clock; const sw = { t: Math.round(S.t), door: d }; S.round.switches.push(sw); SAVE.live.door = d; SAVE.live.switches.push(sw); persist(); }
  A.pick(d); vib(first ? [14, 30, 22] : 16);
  if (first) { const c = $('.chip.on'), r = c.getBoundingClientRect(); YOU.x = r.left + r.width / 2; YOU.y = r.top; }
  YOU.fly = { x0: YOU.x, y0: YOU.y, t: 0, dur: first ? 560 : 420 }; YOU.on = true;
  D.doorEl.animate([{ transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 350, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  renderPick(); renderPlay();
}
function flyChip(chip, d) {
  if (!chip) return;
  const r = chip.getBoundingClientRect(), t = DOORS[d].inEl.getBoundingClientRect(), c = chip.cloneNode(true);
  c.classList.add('flychip'); c.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`; document.body.appendChild(c);
  const dx = t.left + t.width / 2 - (r.left + r.width / 2), dy = t.top + t.height * .7 - (r.top + r.height / 2);
  c.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx * .5}px,${dy * .5 - 60}px) scale(.8)`, opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.3)`, opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.4,0,.6,1)' }).onfinish = () => c.remove();
}

// ---------- status line (few words, big) ----------
function renderStatus() {
  let key, html, cls = '';
  if (S.phase === 'idle') { if (S.pick === null) { key = 'tap'; cls = 'st-tap'; html = 'TAP A DOOR'; } else { key = 'play'; cls = 'st-tap'; html = 'TAP PLAY'; } }
  else if (S.phase === 'intro') { key = 'placing'; html = 'PLACING BET…'; }
  else if (S.phase === 'lock' || S.phase === 'reveal') { key = 'lock'; cls = 'st-closed'; html = icon('lock') + 'LOCKED'; }
  else if (S.frozen) { key = 'frozen'; cls = 'st-closed'; html = 'BETS CLOSED'; }
  else if (S.t > 10000) { key = 'danger'; cls = 'st-danger'; html = icon('lock') + 'LOCKS ANY MOMENT'; }
  else { key = 'in' + S.pick; html = `<i class="dot" style="--c:${DOORS[S.pick].c}"></i>YOU'RE IN&nbsp;<span style="color:${DOORS[S.pick].c}">${DOORS[S.pick].name}</span>`; }
  if (key === S.stKey) return; S.stKey = key;
  $('#status').className = 'status ' + cls; $('#stTxt').innerHTML = html;
}
function updateHints() {
  const inv = S.phase === 'idle' && S.pick === null && !S.res;
  handEl.classList.toggle('show', inv); DOORS.forEach(d => d.el.classList.toggle('invite', inv));
}

// ---------- bubbles + crowd's pick (eyes). The crown is only for the winner, after the lock ----------
function updatePlates(dt = 16) {
  const c = S.counts, tot = c[0] + c[1] + c[2], live = (S.phase === 'open' || S.phase === 'intro' || S.phase === 'lock') && tot >= 120;
  if (S.phase === 'reveal' || (S.phase === 'idle' && S.res)) return;
  DOORS.forEach((d, i) => {
    d.n.textContent = fmtN(c[i]);
    if (!live) { d.amt.textContent = '?'; d.mx.textContent = '×?'; return; }
    const m = payFor(c[i], tot); d.amt.textContent = fm(S.stakeC * m); d.mx.textContent = '×' + m;
  });
  const showEyes = live && S.phase === 'open' && !S.frozen;
  if (showEyes) {
    const min = Math.min(...c); let cand = c.indexOf(min); if (S.crownD >= 0 && c[S.crownD] === min) cand = S.crownD;
    if (S.crownD < 0) { S.crownD = cand; hop(eyesEl); }
    else if (cand !== S.crownD) { S.crownT += dt; if (S.crownT > 200 || c[S.crownD] - min > 8) { S.crownD = cand; S.crownT = 0; hop(eyesEl); A.chip(); } }
    else S.crownT = 0;
  }
  eyesEl.classList.toggle('show', showEyes);
  DOORS.forEach((d, i) => d.el.classList.toggle('fewest', showEyes && i === S.crownD));
}
function hop(el) { el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
function placeOver(el, d) {
  if (d < 0) return;
  const b = DOORS[d].bub.getBoundingClientRect(), s = stage.getBoundingClientRect();
  el.style.setProperty('--x', (b.left + b.width / 2 - s.left) + 'px'); el.style.setProperty('--y', (b.top - s.top) + 'px');
}
const placeCrown = () => placeOver(crownEl, S.res ? S.round.win : -1);

// ---------- crowd: people fill each door from the bottom ----------
const fx = $('#fx'), g = fx.getContext('2d'); let W = 0, H = 0, DPR = 1;
function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; fx.width = W * DPR; fx.height = H * DPR; bgR(); }
const bg = $('#bg'), bgc = bg.getContext('2d');
function bgR() { bg.width = W * Math.min(1.5, DPR); bg.height = H * Math.min(1.5, DPR); }
resize(); addEventListener('resize', resize);
function sprite(rgb, size = 64) { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, `rgba(255,255,255,1)`); gr.addColorStop(.18, `rgba(${rgb},0.95)`); gr.addColorStop(.5, `rgba(${rgb},0.28)`); gr.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = gr; x.fillRect(0, 0, size, size); return c; }
const SPR = DOORS.map(d => sprite(d.rgb.join(','))), SPRW = sprite('255,255,255'), SPRG = sprite('255,210,110');
function person(rgb) { // little person icon, lit from above, dark rim so a pile still reads as people
  const c = document.createElement('canvas'); c.width = 32; c.height = 40; const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 40); gr.addColorStop(0, `rgb(${rgb.map(v => Math.round(v + (255 - v) * .55))})`); gr.addColorStop(1, `rgb(${rgb})`);
  x.fillStyle = gr; x.strokeStyle = 'rgba(6,3,18,.9)'; x.lineWidth = 2.5;
  x.beginPath(); x.arc(16, 9.5, 7.5, 0, 6.283); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(2, 40); x.lineTo(2, 34); x.bezierCurveTo(2, 24.5, 9, 20, 16, 20); x.bezierCurveTo(23, 20, 30, 24.5, 30, 34); x.lineTo(30, 40); x.closePath(); x.fill(); x.stroke();
  return c;
}
const PSPR = DOORS.map(d => person(d.rgb)), PWHITE = person([255, 255, 255]);
const NP = 240, P = []; let SEQ = 0;
for (let i = 0; i < NP; i++) P.push({ on: false, d: -1, x: 0, y: 0, slot: 0, seq: 0, jx: rnd(-1.2, 1.2), fly: null, a: 0, px: 0, py: 0, leave: false });
const LAY = DOORS.map(() => ({ x: 0, y: 0, w: 60, h: 120, cols: 6, cw: 10, ch: 12, top: 0, shutY: 0 }));
function readLayout() {
  DOORS.forEach((d, i) => { const r = d.inEl.getBoundingClientRect(), L = LAY[i]; L.x = r.left; L.y = r.top; L.w = r.width; L.h = r.height; L.shutY = d.shutEl.getBoundingClientRect().bottom; });
  if (crownEl.classList.contains('show')) placeCrown();
  if (eyesEl.classList.contains('show')) placeOver(eyesEl, S.crownD);
}
function assignSlots() {
  const lists = [[], [], []];
  for (const p of P) if (p.on && !p.leave) lists[p.d].push(p);
  lists.forEach((ls, i) => {
    ls.sort((a, b) => a.seq - b.seq); const L = LAY[i];
    L.cols = Math.max(4, Math.round(L.w / 13)); L.cw = L.w / L.cols;
    const rows = Math.max(1, Math.ceil(ls.length / L.cols)); L.ch = Math.min(L.cw * 1.12, (L.h - 6) / rows);
    ls.forEach((p, k) => p.slot = k);
    L.top = L.y + L.h - 3 - Math.ceil(ls.length / L.cols) * L.ch;
  });
}
function tgt(p, d) {
  const L = LAY[d], k = p.slot, col = k % L.cols, row = (k / L.cols) | 0;
  return [L.x + (col + .5 + (row & 1 ? .22 : -.22)) * L.cw + p.jx, L.y + L.h - 3 - (row + .5) * L.ch];
}
function sendFly(p, d, fast) {
  p.d = d; p.leave = false; p.seq = ++SEQ; assignSlots(); const [tx, ty] = tgt(p, d);
  p.fly = { x0: p.x, y0: p.y, cx: (p.x + tx) / 2 + rnd(-30, 30), cy: Math.min(p.y, ty) - rnd(40, 130), t: 0, dur: fast ? rnd(260, 480) : rnd(650, 1100) };
}
function updateCrowd(dtv, now) {
  const have = [0, 0, 0], want = DOORS.map((_, i) => Math.round(S.counts[i] / N * NP));
  const pools = [[], [], []];
  for (const p of P) if (p.on && !p.leave) { have[p.d]++; if (!p.fly) pools[p.d].push(p); }
  pools.forEach(pl => pl.sort((a, b) => a.seq - b.seq)); // the top of the pile leaves first
  let moves = 0; const def = [0, 1, 2].map(i => want[i] - have[i]);
  for (let d = 0; d < 3 && moves < 20; d++) {
    while (def[d] < 0 && moves < 20) {
      const p = pools[d].pop(); if (!p) { def[d]++; continue; }
      let e = -1, best = 0; for (let k = 0; k < 3; k++) if (def[k] > best) { best = def[k]; e = k; }
      if (e >= 0) { sendFly(p, e, S.surge > 0 || S.phase !== 'open'); def[e]--; } else { p.leave = true; p.fly = { x0: p.x, y0: p.y, cx: p.x + rnd(-80, 80), cy: p.y - 60, t: 0, dur: 700, out: true }; }
      def[d]++; moves++;
    }
  }
  for (let d = 0; d < 3 && moves < 20; d++) {
    while (def[d] > 0 && moves < 20) {
      const p = P.find(q => !q.on); if (!p) break;
      const side = Math.random(); p.on = true; p.a = 0; p.leave = false; p.x = side < .3 ? -20 : side > .7 ? W + 20 : rnd(0, W); p.y = side < .3 || side > .7 ? rnd(H * .6, H) : H + 20; p.px = p.x; p.py = p.y;
      sendFly(p, d, S.surge > 0); def[d]--; moves++;
    }
  }
  assignSlots();
  for (const p of P) {
    if (!p.on) continue; p.px = p.x; p.py = p.y;
    if (p.fly) {
      const f = p.fly; f.t += dtv / f.dur; const u = clamp(f.t, 0, 1), e = u * u * (3 - 2 * u);
      const [tx, ty] = f.out ? [f.cx, H + 60] : tgt(p, p.d), a = 1 - e;
      p.x = a * a * f.x0 + 2 * a * e * f.cx + e * e * tx; p.y = a * a * f.y0 + 2 * a * e * f.cy + e * e * ty;
      if (f.t >= 1) { p.fly = null; if (p.leave) p.on = false; }
      p.a = Math.min(1, p.a + dtv / 200);
    } else {
      const [tx, ty] = tgt(p, p.d), k = Math.min(1, dtv * .014);
      p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; p.a = Math.min(1, p.a + dtv / 300);
    }
  }
  // "YOU" rides on top of your door's crowd
  if (YOU.on && S.pick !== null) {
    const L = LAY[S.pick], tx = L.x + L.w / 2, ty = clamp(L.top - 13, L.y + 22, L.y + L.h - 16);
    if (YOU.fly) { const f = YOU.fly; f.t += dtv / f.dur; const u = clamp(f.t, 0, 1), e = easeOut(u), cy = Math.min(f.y0, ty) - 80, a = 1 - e;
      YOU.x = a * a * f.x0 + 2 * a * e * ((f.x0 + tx) / 2) + e * e * tx; YOU.y = a * a * f.y0 + 2 * a * e * cy + e * e * ty; if (u >= 1) YOU.fly = null; }
    else { const k = Math.min(1, dtv * .012); YOU.x += (tx - YOU.x) * k; YOU.y += (ty - YOU.y) * k; }
  }
}
const YOU = { on: false, x: 0, y: 0, fly: null };
function drawPerson(p) {
  const L = LAY[p.d], w = L.cw * .94, h = w * 1.25; g.globalAlpha = p.a;
  g.drawImage(PSPR[p.d], p.x - w / 2, p.y - h * .62, w, h);
}
function drawYou(now) {
  const d = S.pick; if (d === null) return; const x = YOU.x, y = YOU.y, pulse = 1 + Math.sin(now / 180) * .06, r = 12 * pulse;
  g.globalAlpha = 1; g.save(); g.shadowColor = '#fff'; g.shadowBlur = 16; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.restore();
  g.lineWidth = 3; g.strokeStyle = DOORS[d].c; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke();
  g.drawImage(PSPR[d], x - 7, y - 9, 14, 17.5);
  g.font = '700 10px "Chakra Petch",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(10,6,28,.9)'; g.beginPath(); g.roundRect ? g.roundRect(x - 15, y - r - 17, 30, 14, 7) : g.rect(x - 15, y - r - 17, 30, 14); g.fill();
  g.fillStyle = '#fff'; g.fillText('YOU', x, y - r - 10);
}
function clipDoor(L) { // inside the arch, and below the shutter
  const top = Math.max(L.y - 30, L.shutY); if (top >= L.y + L.h) return false;
  g.beginPath(); if (g.roundRect) g.roundRect(L.x, L.y, L.w, L.h, [L.w / 2, L.w / 2, 8, 8]); else g.rect(L.x, L.y, L.w, L.h); g.clip();
  g.beginPath(); g.rect(L.x - 40, top, L.w + 80, L.y + L.h - top + 40); g.clip(); return true;
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
  for (let i = 0; i < 3; i++) {
    g.save();
    if (clipDoor(LAY[i])) for (const p of P) if (p.on && !p.fly && p.d === i) drawPerson(p);
    g.restore();
  }
  g.globalCompositeOperation = 'lighter';
  for (const p of P) {
    if (!p.on || !p.fly) continue; g.globalAlpha = p.a * .5; g.strokeStyle = `rgba(${DOORS[p.d].rgb},.6)`; g.lineWidth = 2;
    let dx = (p.x - p.px) * 3, dy = (p.y - p.py) * 3; const Ln = Math.hypot(dx, dy); if (Ln > 30) { dx *= 30 / Ln; dy *= 30 / Ln; }
    g.beginPath(); g.moveTo(p.x - dx, p.y - dy); g.lineTo(p.x, p.y); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  for (const p of P) if (p.on && p.fly) drawPerson(p);
  if (YOU.on && S.pick !== null) { g.save(); if (YOU.fly || clipDoor(LAY[S.pick])) drawYou(now); g.restore(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
  for (let i = FL.length - 1; i >= 0; i--) { const f = FL[i]; f.life += dtv / 1000; const u = f.life / f.max; if (u >= 1) { FL.splice(i, 1); continue; } const s = f.size * (.4 + u), a = (1 - u) * (1 - u); g.globalAlpha = a; g.drawImage(SPRW, f.x - s / 2, f.y - s / 2, s, s); g.globalAlpha = a * .8; g.drawImage(SPR[DOORS.findIndex(d => d.rgb === f.rgb)] || SPRG, f.x - s, f.y - s, s * 2, s * 2); }
  g.globalAlpha = 1;
  for (let i = RG.length - 1; i >= 0; i--) { const r = RG[i]; if (r.delay > 0) { r.delay -= dtv / 1000; continue; } r.life += dtv / 1000; r.r += r.sp * dtv / 1000; const u = r.r / r.max; if (u >= 1) { RG.splice(i, 1); continue; } g.strokeStyle = `rgba(${r.col},${(1 - u) * .9})`; g.lineWidth = r.w * (1 - u) + .5; g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * .55, 0, 0, 6.283); g.stroke(); }
  for (let i = SP.length - 1; i >= 0; i--) { const s = SP[i], dt = dtv / 1000; s.life += dt; if (s.life > s.max) { SP.splice(i, 1); continue; } s.vy += 640 * dt; s.vx *= .985; s.x += s.vx * dt; s.y += s.vy * dt; const a = 1 - s.life / s.max; g.strokeStyle = `rgba(${s.col},${a})`; g.lineWidth = 2.2 * a + .4; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * s.len, s.y - s.vy * s.len); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  for (let i = CF.length - 1; i >= 0; i--) { const c = CF[i], dt = dtv / 1000; c.life += dt; if (c.life > c.max || c.y > H + 40) { CF.splice(i, 1); continue; } c.vy += 820 * dt; c.vx *= .992; c.vy *= .992; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.fl += dt * 9; const a = Math.min(1, (c.max - c.life) * 1.5); g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.scale(1, Math.cos(c.fl)); g.globalAlpha = a; g.fillStyle = `rgb(${c.col})`; g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); g.restore(); }
  g.globalAlpha = 1;
}
const DUST = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), ph: Math.random() * 6, c: [[164, 92, 255], [53, 240, 255], [255, 79, 163]][(Math.random() * 3) | 0] }));
function drawBg(dtv, now) {
  const w = bg.width, h = bg.height, t = now / 1000; bgc.setTransform(1, 0, 0, 1, 0, 0); bgc.clearRect(0, 0, w, h);
  const bgG = bgc.createLinearGradient(0, 0, 0, h); bgG.addColorStop(0, '#0b0522'); bgG.addColorStop(.6, '#05030f'); bgG.addColorStop(1, '#0a0420'); bgc.fillStyle = bgG; bgc.fillRect(0, 0, w, h);
  const blobs = [[.2, .25, 420, 'rgba(164,92,255,.2)', 0], [.82, .5, 460, 'rgba(53,240,255,.1)', 2], [.5, .9, 520, 'rgba(255,46,99,.12)', 4]];
  for (const [bx, by, r, col, ph] of blobs) { const x = (bx + Math.sin(t * .08 + ph) * .06) * w, y = (by + Math.cos(t * .07 + ph) * .05) * h, rr = r * (w / 900 + .5); const rg = bgc.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); bgc.fillStyle = rg; bgc.fillRect(0, 0, w, h); }
  bgc.globalCompositeOperation = 'lighter';
  for (const d of DUST) { d.y -= dtv / 1000 * (.004 + d.z * .01); if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); } const a = (.25 + .5 * Math.sin(t * 1.5 + d.ph) ** 2) * (.3 + d.z * .5), s = (1 + d.z * 2.2) * (w / 800 + .6); bgc.globalAlpha = a; bgc.fillStyle = `rgb(${d.c})`; bgc.beginPath(); bgc.arc(d.x * w, d.y * h, s, 0, 6.283); bgc.fill(); }
  bgc.globalAlpha = 1; bgc.globalCompositeOperation = 'source-over';
}

// ---------- coins + floating numbers ----------
function coinsToWallet(fromEl, n) {
  const f = fromEl.getBoundingClientRect(), w = $('#wallet').getBoundingClientRect(), tx = w.left + 18, ty = w.top + w.height / 2;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'flycoin coin'; document.body.appendChild(c);
    const sx = f.left + f.width / 2 + rnd(-18, 18), sy = f.top + f.height * .55 + rnd(-24, 24), mx = (sx + tx) / 2 + rnd(-70, 70), my = Math.min(sy, ty) + rnd(-20, 90);
    c.animate([{ transform: `translate(${sx}px,${sy}px) scale(.3)`, opacity: 0 }, { transform: `translate(${sx + rnd(-40, 40)}px,${sy - rnd(30, 80)}px) scale(1.15)`, opacity: 1, offset: .3 }, { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: .65 }, { transform: `translate(${tx}px,${ty}px) scale(.55)`, opacity: .9 }],
      { duration: 950, delay: i * 55, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'both' }).onfinish = () => { c.remove(); A.countTick(i / n); };
  }
}
function floatText(el, txt, neg) {
  const r = el.getBoundingClientRect(), t = document.createElement('div'); t.className = 'floattxt' + (neg ? ' neg' : ''); t.textContent = txt;
  t.style.left = r.left + r.width / 2 + 'px'; t.style.top = r.top + r.height * .4 + 'px'; document.body.appendChild(t);
  t.animate([{ transform: 'translate(-50%,-30%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: .2 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .7 }, { transform: 'translate(-50%,-160%) scale(1)', opacity: 0 }], { duration: 1700, easing: 'ease-out' }).onfinish = () => t.remove();
}

// ---------- bets close -> final rush -> lock -> reveal ----------
const REVEAL_MS = 2600;
function closeBets() { // the final rush: show who flows in or out of each door
  S.frozen = true; const r = S.round, cc = E.closeCounts(r);
  r.close = cc; r.crowdPick = cc.indexOf(Math.min(...cc));
  DOORS.forEach((d, i) => { const f = r.final[i] - cc[i]; d.fl.textContent = (f > 0 ? '+' : f < 0 ? '−' : '±') + fmtN(Math.abs(f)); d.fl.className = 'fl show ' + (f > 0 ? 'in' : 'out'); });
  stamp('FINAL RUSH'); A.riser(); vib([20, 30, 20]); renderPlay();
}
// one line that explains the result (GDD §04 rule 3)
function reason(r) {
  const W = DOORS[r.win], dw = r.final[r.win] - r.close[r.win];
  if (r.won || r.door === undefined) return dw < 0 ? `${W.name} won: ${fmtN(-dw)} people ran out` : `${W.name} won: only ${fmtN(dw)} got in at the end`;
  const P = DOORS[r.door], dp = r.final[r.door] - r.close[r.door];
  return dp > 0 ? `${P.name} lost: ${fmtN(dp)} people rushed in` : `${P.name} lost: ${W.name} ended emptier`;
}
function settleRecord(r, door) { // shared by the live round and a round left behind by a reload
  const res = E.settle(r, door, r.stakeC); r.door = door; r.won = res.won; r.payoutC = res.payoutC;
  if (!r.close) { r.close = E.closeCounts(r); r.crowdPick = r.close.indexOf(Math.min(...r.close)); }
  SAVE.bal += r.payoutC; SAVE.live = null;
  SAVE.hist.unshift({ no: r.no, platform: r.platform, player: r.player, commit: r.commit, idx: r.idx, win: r.win, level: r.level, pay: r.pay, lockMs: r.lockMs, final: r.final, close: r.close, crowdPick: r.crowdPick, first: r.first, switches: r.switches, door, stakeC: r.stakeC, payoutC: r.payoutC, won: r.won });
  persist();
}
function doLock() {
  S.phase = 'lock'; S.pt = 0; S.counts = S.round.final.slice(); S.total = N; S.surge = 1;
  const r = S.round; S.res = true; settleRecord(r, S.pick);
  const lp = clamp(r.lockMs / 20000 * 100, 0, 100); $('#fFill').style.width = lp + '%'; $('#fLock').style.left = lp + '%'; $('#fTime').textContent = (r.lockMs / 1000).toFixed(1);
  fuse.classList.add('locked'); fuse.classList.remove('tense');
  DOORS.forEach(d => d.el.classList.add('locked')); S.shake = 1;
  A.thud(); A.silenceDuck(2.2); vib([60, 40, 120]);
  $('#flash').animate([{ opacity: .7 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
  vig.style.opacity = 0; updatePlates();
}
function doReveal() {
  S.phase = 'reveal'; S.pt = 0; const r = S.round, won = r.won, W0 = DOORS[r.win];
  DOORS.forEach(d => { d.el.classList.remove('locked', 'fewest'); d.el.classList.add(d.id === r.win ? 'win' : 'lose'); });
  W0.amt.textContent = fm(r.stakeC * r.pay); W0.mx.textContent = '×' + r.pay; // the winner's bubble shows what it paid
  placeCrown(); crownEl.classList.add('show'); crownEl.classList.remove('hop', 'big'); void crownEl.offsetWidth; crownEl.classList.add('big');
  readLayout();
  const power = clamp(.6 + Math.log2(r.pay) * .22, .6, 1.6), rc = W0.doorEl.getBoundingClientRect();
  burst(rc.left + rc.width / 2, rc.top + rc.height * .55, W0.rgb, won ? power : .5, won);
  S.shake = won ? .8 : .35; $('#flash').animate([{ opacity: .3 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
  // result card: one picture, one line, one number, and why
  const rs = $('#result'), share = `<button class="r-share" id="btnShare" aria-label="Share"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg></button>`;
  const ic = `<div class="r-ic" style="--c:${W0.c}"><b>${fmtN(r.final[W0.id])}</b></div>`;
  rs.className = 'result' + (won ? ' win' : '');
  if (won) rs.innerHTML = `${ic}<div class="r-t"><b>YOU WIN ×${r.pay}!</b><small>${reason(r)}</small></div><div class="r-amt">+${fm(r.payoutC)}</div>${share}`;
  else rs.innerHTML = `${ic}<div class="r-t"><b><span style="color:${W0.c}">${W0.name}</span> WINS ×${r.pay}</b><small>${reason(r)}</small></div><div class="r-amt neg">−${fm(r.stakeC)}</div>`;
  hud.classList.add('res'); requestAnimationFrame(() => rs.classList.add('show'));
  const sb = $('#btnShare'); if (sb) sb.onclick = () => openShare(SAVE.hist[0]);
  if (won) { A.burst(); A.win(r.pay, r.pay >= 10); vib(r.pay >= 10 ? [40, 30, 40, 30, 200] : [40, 30, 90]); floatText(DOORS[r.door].doorEl, '+' + fm(r.payoutC)); coinsToWallet(DOORS[r.door].doorEl, clamp(r.pay * 3, 6, 18)); }
  else { A.burst(); setTimeout(() => A.lose(), 120); vib([120]); floatText(DOORS[r.door].doorEl, '−' + fm(r.stakeC), true); }
  renderHist(true);
  setTimeout(() => renderBal(true), won ? 1100 : 0);
}

// ---------- history + crowd's pick stat ----------
function renderHist(isNew) {
  const items = SAVE.hist.slice(0, 14);
  $('#hist').innerHTML = items.map((r, i) => { const D = DOORS[r.win]; return `<button class="hi ${r.won ? 'w' : 'l'} ${isNew && i === 0 ? 'new' : ''}" data-i="${i}" style="--c:${D.c}" aria-label="Round ${r.no}: ${D.name} won ${r.pay}×">${r.pay}×</button>`; }).join('') + '<i class="hg"></i>'.repeat(Math.max(0, 9 - items.length));
  const last = SAVE.hist.slice(0, 100), hit = last.filter(r => r.crowdPick === r.win).length;
  $('#pickStat').innerHTML = last.length ? `${EYES_SVG}CROWD'S PICK WON <b>${hit} OF LAST ${last.length}</b>` : `${EYES_SVG}THE CROWD'S PICK WINS ABOUT 1 IN 3`;
}
$('#hist').addEventListener('click', e => { const b = e.target.closest('.hi'); if (b) openVerify(SAVE.hist[+b.dataset.i]); });

// ---------- modals ----------
function openModal(id) { closeModals(); $(id).classList.add('show'); } function closeModals() { $$('.modal.show').forEach(m => m.classList.remove('show')); }
$$('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) closeModals(); }));
$$('[data-close]').forEach(b => b.addEventListener('click', closeModals));
addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); if ($('#intro').classList.contains('show')) closeIntro(); } });
$('#linkMath').onclick = () => { fillMath(); openModal('#mMath'); A.tap(); };
$('#linkVerify').onclick = () => openVerify(SAVE.hist[0] || null);
$('#btnFair').onclick = () => openVerify(S.phase === 'idle' && !S.res ? null : inRound() && S.phase !== 'reveal' ? 'live' : (SAVE.hist[0] || null));
function fillMath() {
  $('#rtpDoors').innerHTML = DOORS.map(d => `<div style="--c:${d.c};--cr:${d.rgb}"><small>${d.name}</small><b>94.00%</b></div>`).join('');
  $('#tierTbl').innerHTML = `<tr><th>WINNING DOOR HAS</th><th>CHANCE</th><th>PAYS</th></tr>` + LV.map(l => `<tr><td>${lvLabel(l)}</td><td>${(l.w / 30).toFixed(3)}%</td><td class="mx">${l.pay}×</td></tr>`).join('');
}
$('#btnMc').onclick = async () => {
  const out = $('#mcOut'), ret = [0, 0, 0]; out.textContent = 'checking…'; await new Promise(r => setTimeout(r, 30));
  for (let i = 0; i < E.DRAWS; i++) { const { door, level } = E.decode(i); ret[door] += LV[level].pay; } // every possible result, exactly
  let pick = 0; const n = 2000;
  for (let i = 0; i < n; i++) { const r = E.buildRound(randHex(32), '1' + i), cc = E.closeCounts(r); if (cc.indexOf(Math.min(...cc)) === r.win) pick++; if (i % 250 === 0) { out.textContent = `rounds ${i}…`; await new Promise(r => setTimeout(r, 0)); } }
  out.textContent = `RTP Red ${(ret[0] / E.DRAWS * 100).toFixed(2)}% · Gold ${(ret[1] / E.DRAWS * 100).toFixed(2)}% · Blue ${(ret[2] / E.DRAWS * 100).toFixed(2)}%. Crowd's pick won ${(pick / n * 100).toFixed(1)}% of ${fmtN(n)} rounds.`;
};
let verRec = null;
function openVerify(rec) {
  verRec = rec; const kv = $('#verKv'), v = $('#verVerdict');
  if (!rec || rec === 'live') {
    const c = rec === 'live' ? S.round : S.next;
    kv.innerHTML = `<div><small>${rec === 'live' ? 'THIS ROUND' : 'NEXT ROUND'}</small><code>#${rec === 'live' ? c.no : SAVE.roundNo + 1}</code></div><div><small>COMMITMENT · KECCAK-256( secret seed )</small><code>${c.commit}</code></div><div><small>SECRET SEED</small><code class="hid">revealed when the round ends</code></div>`;
    v.className = 'verdict pend'; v.textContent = 'Shown before you tap PLAY. The winning door, its crowd and the lock time are already fixed by this seed.';
  } else {
    const rb = E.buildRound(rec.platform, rec.player), ok = rb.commit === rec.commit && rb.idx === rec.idx && rb.lockMs === rec.lockMs && rb.final.join() === rec.final.join();
    const sw = rec.switches.length ? rec.switches.map(s => `${(s.t / 1000).toFixed(1)}s → ${DOORS[s.door].name}`).join(' · ') : 'no switches';
    kv.innerHTML = `<div><small>ROUND</small><code>#${rec.no}</code></div><div><small>COMMITMENT (shown before PLAY)</small><code>${rec.commit}</code></div><div><small>SECRET SEED (revealed)</small><code>${rec.platform}</code></div><div><small>PLAYER SEED</small><code>${rec.player}</code></div>`
      + `<div><small>DRAW 0–2,999 → DOOR + LEVEL</small><code>${fmtN(rec.idx)} → ${DOORS[rec.win].name} · ${rec.pay}×</code></div><div><small>LOCK TIME</small><code>${(rec.lockMs / 1000).toFixed(1)} s</code></div><div><small>FINAL CROWD — RED · GOLD · BLUE</small><code>${rec.final.join(' · ')}</code></div>`
      + `<div><small>YOUR DOORS</small><code>${DOORS[rec.first].name} · ${sw} · counted: ${DOORS[rec.door].name}</code></div><div><small>PAYOUT</small><code>${rec.won ? '+' + fm(rec.payoutC) : '0.00'} (stake ${fm(rec.stakeC)})</code></div>`;
    v.className = 'verdict ' + (ok ? 'ok' : 'pend'); v.textContent = ok ? '✓ Verified in your browser: the seed matches the commitment and replays the same draw, lock time and crowd.' : '✗ Mismatch';
  }
  openModal('#mVerify'); A.tap();
}
$('#btnReverify').onclick = () => openVerify(verRec);
$('#btnCopyHash').onclick = () => { const h = verRec === 'live' ? S.round.commit : verRec ? verRec.commit : S.next.commit; if (h && navigator.clipboard) navigator.clipboard.writeText(h).then(() => toast('Hash copied'), () => toast('Copy failed')); };

// ---------- share ----------
let shareRec = null, shareText = '';
function openShare(r) {
  shareRec = r; const won = r.won, D = DOORS[r.door], cnt = r.final[r.door];
  shareText = won ? `I was 1 of ${cnt} — won ${r.pay}x on OUTLIER` : `I was 1 of ${cnt} on ${D.name} — the crowd got me on OUTLIER`;
  drawShare(r); openModal('#mShare'); A.tap();
}
function drawShare(r) {
  const cv = $('#shareCanvas'), x = cv.getContext('2d'), Wc = 1080, Hc = 1350, won = r.won, D = DOORS[r.door], cnt = r.final[r.door];
  const bgG = x.createLinearGradient(0, 0, 0, Hc); bgG.addColorStop(0, '#1a0a45'); bgG.addColorStop(.55, '#07041a'); bgG.addColorStop(1, '#14052e'); x.fillStyle = bgG; x.fillRect(0, 0, Wc, Hc);
  const rg = x.createRadialGradient(540, 600, 0, 540, 600, 760); rg.addColorStop(0, `rgba(${D.rgb},.55)`); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, Wc, Hc);
  [0, 1, 2].forEach(i => { const d = DOORS[i], dx = 200 + i * 340, dw = 220, dh = 340, top = 330, winD = r.win === i;
    x.save(); x.shadowColor = d.c; x.shadowBlur = winD ? 70 : 24; x.strokeStyle = d.c; x.lineWidth = 6; x.fillStyle = winD ? `rgba(${d.rgb},.5)` : 'rgba(255,255,255,.04)';
    x.beginPath(); x.moveTo(dx - dw / 2, top + dh); x.lineTo(dx - dw / 2, top + dw / 2); x.arc(dx, top + dw / 2, dw / 2, Math.PI, 0); x.lineTo(dx + dw / 2, top + dh); x.closePath(); x.fill(); x.stroke(); x.restore();
    const hp = Math.round(r.final[i] / N * 60); for (let k = 0; k < hp; k++) { const col = k % 8, row = (k / 8) | 0; x.drawImage(PSPR[i], dx - dw / 2 + 14 + col * 24, top + dh - 34 - row * 28, 22, 27); }
    x.fillStyle = '#fff'; x.font = '700 42px "Chakra Petch"'; x.textAlign = 'center'; x.fillText(String(r.final[i]), dx, top + dh + 60);
    if (r.door === i) { x.fillStyle = '#fff'; x.font = '700 30px "Chakra Petch"'; x.fillText('YOU', dx, top - 30); }
    if (winD) { x.fillStyle = '#ffc53d'; x.beginPath(); x.moveTo(dx - 40, top - 52); x.lineTo(dx - 40, top - 92); x.lineTo(dx - 20, top - 72); x.lineTo(dx, top - 100); x.lineTo(dx + 20, top - 72); x.lineTo(dx + 40, top - 92); x.lineTo(dx + 40, top - 52); x.fill(); } });
  x.textAlign = 'center'; x.font = '900 84px "Unbounded"'; const gl = x.createLinearGradient(240, 0, 840, 0); gl.addColorStop(0, '#ff7aa0'); gl.addColorStop(.5, '#ffd36b'); gl.addColorStop(1, '#6fc4ff'); x.fillStyle = gl; x.fillText('OUTLIER', 540, 170);
  x.fillStyle = '#9a93c4'; x.font = '600 26px "Chakra Petch"'; x.fillText('FEWEST PEOPLE WINS', 540, 220);
  x.fillStyle = '#fff'; x.font = '700 58px "Chakra Petch"'; x.fillText(`I was 1 of ${cnt}`, 540, 940);
  x.font = '900 150px "Unbounded"'; const g2 = x.createLinearGradient(0, 960, 0, 1100); g2.addColorStop(0, '#fff'); g2.addColorStop(1, won ? '#ffb13d' : '#8e86c0'); x.fillStyle = g2;
  x.fillText(won ? r.pay + '×' : 'MISSED', 540, 1090);
  x.fillStyle = won ? '#7dffb0' : '#ff8aa6'; x.font = '700 40px "Chakra Petch"'; x.fillText(won ? `WON +${fm(r.payoutC)} DEMO COINS` : `${DOORS[r.win].name} had the fewest`, 540, 1168);
  x.fillStyle = '#6e679a'; x.font = '500 22px "Chakra Petch"'; x.fillText(`Round #${r.no} · commit ${r.commit.slice(0, 10)}… · Demo — no real money`, 540, 1290);
}
function shareBlob() { return new Promise(res => $('#shareCanvas').toBlob(res, 'image/png')); }
$('#btnShareNow').onclick = async () => { const b = await shareBlob(); const f = new File([b], 'outlier-result.png', { type: 'image/png' }); try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], text: shareText, title: 'OUTLIER' }); else if (navigator.share) await navigator.share({ text: shareText, url: location.href }); else { navigator.clipboard.writeText(shareText + ' ' + location.href); toast('Text copied'); } } catch (e) { } };
$('#btnDl').onclick = async () => { const b = await shareBlob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `outlier-round-${shareRec.no}.png`; a.click(); };
$('#btnCopyTxt').onclick = () => { navigator.clipboard.writeText(shareText + ' ' + location.href).then(() => toast('Copied'), () => toast('Copy failed')); };

// ---------- sound ----------
function renderSound() { $('#btnSound').classList.toggle('off', !A.on); $('#svgSndOn').style.display = A.on ? '' : 'none'; $('#svgSndOff').style.display = A.on ? 'none' : ''; }
$('#btnSound').onclick = () => { A.init(); A.on = !A.on; SAVE.sound = A.on; A.setOn(A.on); renderSound(); persist(); if (A.on) A.tap(); };

// ---------- picture-first intro (3 scenes, ~9 s, no reading needed) ----------
const IN = { timers: [] };
const inAt = (ms, fn) => IN.timers.push(setTimeout(fn, ms));
function playIntro() {
  IN.timers.forEach(clearTimeout); IN.timers = [];
  const sc = $('#inScene'), cap = $('#inCap'), play = $('#inPlay');
  sc.innerHTML = DOORS.map(d => `<div class="md" data-d="${d.id}" style="--c:${d.c};--cr:${d.rgb}"><div class="mbub"><i class="coin"></i><b>?</b></div><div class="mdoor"><div class="mpile"></div><div class="myou">YOU</div><div class="msh"><i class="lk"></i></div></div></div>`).join('')
    + `<div class="mcrown"></div><div class="meyes">${EYES_SVG}</div><div class="mplay">PLAY</div><div class="mhand">${HAND}</div><div class="mfx"></div>`;
  const md = $$('.md', sc), hand = $('.mhand', sc), crown = $('.mcrown', sc), eyes = $('.meyes', sc), mplay = $('.mplay', sc), fxl = $('.mfx', sc), cnt = [0, 0, 0];
  const step = (i, html) => { cap.innerHTML = html; cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); $$('#inDots i').forEach((e, k) => e.classList.toggle('on', k === i)); };
  const rel = el => { const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: r.top - s.top, h: r.height }; };
  const handTo = el => { const p = rel(el); hand.style.left = p.x + 'px'; hand.style.top = (p.y + p.h * .45) + 'px'; };
  const tap = (fn) => { hand.classList.add('tap'); fn(); inAt(170, () => hand.classList.remove('tap')); };
  const youTo = () => md.forEach(m => { $('.myou', m).style.bottom = ($('.mpile', m).offsetHeight + 8) + 'px'; });
  const pick = i => md.forEach((m, k) => m.classList.toggle('picked', k === i));
  const over = (el, i, dy) => { const p = rel($('.mbub', md[i])); el.style.left = p.x + 'px'; el.style.top = (p.y - dy) + 'px'; };
  const bubbles = () => { const tot = cnt[0] + cnt[1] + cnt[2], min = Math.min(...cnt), e = cnt.indexOf(min); md.forEach((m, i) => { $('.mbub b', m).textContent = fm(100 * payFor(cnt[i], tot)); m.classList.toggle('fewest', i === e); }); over(eyes, e, 20); eyes.classList.add('show'); };
  const add = i => { const p = document.createElement('i'); p.className = 'mp'; $('.mpile', md[i]).appendChild(p); cnt[i]++; };
  const flow = (i, txt, out) => { const f = document.createElement('b'); f.className = 'mfl' + (out ? ' out' : ''); f.textContent = txt; md[i].appendChild(f); };
  play.classList.remove('ready');
  // 1 · pick a door, then PLAY
  step(0, 'PICK A DOOR. TAP PLAY.');
  inAt(350, () => handTo(md[2]));
  inAt(1150, () => tap(() => { pick(2); youTo(); A.pick(2); }));
  inAt(1600, () => handTo(mplay));
  inAt(2300, () => tap(() => { mplay.classList.add('tap'); A.tap(); }));
  inAt(2550, () => mplay.classList.add('gone'));
  // 2 · the crowd moves; you switch away from the packed door
  inAt(2800, () => step(1, 'FEWEST PEOPLE WINS. SWITCH ANY TIME.'));
  const order = 'BBRBGBRBBGRBRGBRBGRBRG';
  [...order].forEach((ch, k) => inAt(3000 + k * 120, () => { add('RGB'.indexOf(ch)); if (k >= 2) bubbles(); youTo(); if (k % 3 === 0) A.join(); }));
  inAt(4200, () => handTo(md[0]));
  inAt(4900, () => tap(() => { pick(0); youTo(); A.pick(0); }));
  inAt(5300, () => hand.classList.add('gone'));
  // 3 · final rush: the crowd floods its own pick, the quiet door wins
  const tRush = 3000 + order.length * 120 + 700;
  inAt(tRush, () => { step(2, 'THE CROWD COPIES YOU. BE THE OUTLIER.'); eyes.classList.remove('show'); A.riser(); flow(1, '+6'); flow(2, '−2', true); flow(0, '−1', true); });
  for (let k = 0; k < 6; k++) inAt(tRush + 60 + k * 70, () => { add(1); youTo(); });
  inAt(tRush + 200, () => { [2, 2, 0].forEach(i => { const p = $('.mpile', md[i]); p.lastChild.remove(); cnt[i]--; }); youTo(); });
  const tLock = tRush + 900;
  inAt(tLock, () => { md.forEach(m => m.classList.add('locked')); A.thud(); });
  inAt(tLock + 900, () => {
    md.forEach((m, i) => { m.classList.remove('locked', 'fewest'); m.classList.add(i === 0 ? 'win' : 'lose'); });
    const tot = cnt[0] + cnt[1] + cnt[2], m0 = payFor(cnt[0], tot); $('.mbub b', md[0]).textContent = fm(100 * m0);
    over(crown, 0, 34); crown.classList.add('show', 'big'); A.win(m0, false);
    for (let k = 0; k < 14; k++) { const c = document.createElement('i'); c.className = 'coin'; fxl.appendChild(c); const a = rnd(-2.6, -.5), v = rnd(60, 130); c.style.left = '17%'; c.style.top = '55%'; c.animate([{ transform: 'translate(0,0) scale(.3)', opacity: 0 }, { transform: `translate(${Math.cos(a) * v}px,${Math.sin(a) * v}px) scale(1.1)`, opacity: 1, offset: .5 }, { transform: `translate(${Math.cos(a) * v * 1.2}px,${Math.sin(a) * v * 1.2 + 70}px) scale(.8)`, opacity: 0 }], { duration: 1300, delay: k * 30, easing: 'ease-out', fill: 'both' }); }
    const w = document.createElement('div'); w.className = 'mwin'; w.textContent = '+' + fm(100 * m0); fxl.appendChild(w);
  });
  inAt(tLock + 1700, () => play.classList.add('ready'));
}
function showIntro() { S.introOpen = true; $('#intro').classList.add('show'); setTimeout(playIntro, 250); }
function closeIntro() {
  IN.timers.forEach(clearTimeout); IN.timers = []; $('#intro').classList.remove('show');
  SAVE.intro = true; persist(); A.init(); A.tap();
}
$('#inPlay').onclick = closeIntro;
$('#inReplay').onclick = () => { A.init(); playIntro(); };
$('#inRules').onclick = () => { closeIntro(); openModal('#mHow'); };
$('#btnHelp').onclick = () => { A.init(); showIntro(); };

// ---------- main loop ----------
let last = performance.now(), shakeX = 0, shakeY = 0;
function frame(now) {
  const rawDt = Math.min(50, now - last); last = now; const real = rawDt * SPEED; S.clock += real;
  if (S.phase === 'intro') { S.pt += real; if (S.pt > 1500) { S.phase = 'open'; S.t = 0; } }
  if (S.phase === 'open') {
    S.t += real; const st = S.path(S.t); S.counts = st.counts; S.total = st.total; S.surge = st.surge;
    const L = S.round.lockMs;
    if (!S.frozen && S.t >= L - FREEZE) closeBets();
    S.tension = clamp((S.t - 5000) / 15000, 0, 1); if (S.frozen) S.tension = 1;
    const bpm = (60 / (62 + S.tension * 92)).toFixed(3) + 's';
    fuse.classList.toggle('tense', S.t > 10000); fuse.style.setProperty('--bpm', bpm); $('#status').style.setProperty('--bpm', bpm);
    const fp = clamp(S.t / 20000 * 100, 0, 100); $('#fFill').style.width = fp + '%'; $('#fHead').style.left = fp + '%'; $('#fTime').textContent = (S.t / 1000).toFixed(1);
    A.heartbeatTick(S.clock, S.tension); if (S.clock - S.lastBeatVis > 60000 / (62 + S.tension * 92)) { S.lastBeatVis = S.clock; if (S.tension > .1) vig._p = .3 + S.tension * .6; }
    if (S.t >= L) doLock();
  } else if (S.phase === 'lock') {
    S.pt += real; const p = S.pt;
    S.ts = p < 120 ? lerp(1, .12, p / 120) : p < 900 ? .12 : p < 1500 ? lerp(.12, 1, (p - 900) / 600) : 1;
    if (p >= 1500) { S.ts = 1; doReveal(); }
  } else if (S.phase === 'reveal') {
    S.pt += real; S.ts = 1;
    if (S.pt > REVEAL_MS) { S.phase = 'idle'; prepareNext(); renderPlay(); if (SAVE.bal < CHIPS[0]) toast('Out of demo coins'); }
  }
  if (S.phase !== 'lock') S.ts = lerp(S.ts, 1, .2);
  const dtv = real * S.ts;
  if (S.phase === 'open' || S.phase === 'intro') updatePlates(real);
  renderStatus(); updateHints();
  if (S.shake > 0.01) { S.shake *= Math.pow(.0009, dtv / 1000 * (S.ts < .5 ? .6 : 1)); const a = S.shake * (innerWidth < 600 ? 8 : 12); shakeX = rnd(-a, a); shakeY = rnd(-a, a); } else { S.shake = 0; shakeX = shakeY = 0; }
  if (S.phase === 'open' && S.surge > 0) { const a = S.surge * 3; shakeX += rnd(-a, a); shakeY += rnd(-a, a); }
  doorsEl.style.transform = shakeX || shakeY ? `translate(${shakeX}px,${shakeY}px)` : '';
  vig._p = (vig._p || 0) * .9; vig.style.opacity = S.phase === 'open' ? (vig._p * .8 + (S.frozen ? .25 : 0)).toFixed(3) : 0;
  readLayout(); updateCrowd(dtv, now); drawFx(dtv, now); drawBg(dtv, now);
  if (!TICK) requestAnimationFrame(frame);
}

// ---------- boot ----------
function begin() { if (!SAVE.intro && Q.get('intro') !== '0') showIntro(); }
// a round left in play by a reload still stands on its last door (GDD §03)
if (SAVE.live) {
  const L = SAVE.live, r = E.buildRound(L.platform, L.player); Object.assign(r, { no: L.no, stakeC: L.stakeC, first: L.switches.length ? L.switches[0].door : L.door, switches: L.switches });
  settleRecord(r, L.door); setTimeout(() => toast(`Last round: ${DOORS[r.win].name} won · ${r.won ? 'you got +' + fm(r.payoutC) : 'you lost ' + fm(r.stakeC)}`), 900);
}
prepareNext();
function enterGame() {
  A.init(); A.enter(); vib([30, 20, 60]);
  const sp = $('#splash'); sp.classList.add('leaving'); setTimeout(() => sp.classList.add('hide'), 700); setTimeout(() => sp.remove(), 1500);
  setTimeout(begin, SAVE.intro ? 0 : 500);
}
$('#btnEnter').onclick = enterGame;
renderSound(); renderStake(); renderHist(); renderBal();
if (Q.get('splash') === '0') { $('#splash').remove(); begin(); }
if (TICK) setInterval(() => frame(performance.now()), 16); else requestAnimationFrame(frame);
window.__outlier = { S, E, SAVE, DOORS, pickDoor, play, doLock, doReveal, startRound, showIntro, LAY };
})();
