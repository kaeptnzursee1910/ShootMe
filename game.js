/* ShootMe – Raycasting-Arena-Shooter mit P2P-Multiplayer (PeerJS / WebRTC) */
'use strict';
(() => {
const $ = s => document.querySelector(s);
const view = $('#view'), vctx = view.getContext('2d', { alpha: false });
const hud = $('#hud'), hctx = hud.getContext('2d');

/* ================= Hilfsfunktionen ================= */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const now = () => performance.now() / 1000;
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761); return h >>> 0; }
const esc = s => String(s).replace(/[<>&]/g, '');

/* ================= Karte ================= */
const MAP_SRC = [
  'CCCCCCCCCCCCCCCCCCCCCCCC',
  'C.S.......#..#.......S.C',
  'C.........#..#.........C',
  'C..XX.....#..#.....XX..C',
  'C..XX..............XX..C',
  'C.......MMM..MMM.......C',
  'C.......M......M.......C',
  'C####...M......M...####C',
  'C...................X..C',
  'C...X..................C',
  'C......##......##......C',
  'C.S....#...XX...#....S.C',
  'C......#...XX...#......C',
  'C......##......##......C',
  'C..................X...C',
  'C...X..................C',
  'C####...M......M...####C',
  'C.......M......M.......C',
  'C.......MMM..MMM.......C',
  'C..XX..............XX..C',
  'C..XX.....#..#.....XX..C',
  'C.........#..#.........C',
  'C.S.......#..#.......S.C',
  'CCCCCCCCCCCCCCCCCCCCCCCC',
];
const MW = 24, MH = 24;
const map = new Uint8Array(MW * MH);
const spawns = [];
const WALLCH = { '#': 1, 'C': 2, 'X': 3, 'M': 4 };
for (let y = 0; y < MH; y++) {
  const row = (MAP_SRC[y] || '').padEnd(MW, '.');
  for (let x = 0; x < MW; x++) {
    const ch = row[x];
    let v = WALLCH[ch] || 0;
    if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) v = 2;
    if (ch === 'S' && !v) spawns.push({ x: x + .5, y: y + .5 });
    map[y * MW + x] = v;
  }
}
const cellAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= MW || cy >= MH) ? 2 : map[cy * MW + cx];
const solid = (x, y) => cellAt(Math.floor(x), Math.floor(y)) > 0;

/* ================= Texturen ================= */
const TS = 64;
const pack = (r, g, b, a = 255) => ((a << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0;
function makeTex(fn) {
  const t = new Uint32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const c = fn(x, y); t[y * TS + x] = pack(c[0], c[1], c[2]); }
  return t;
}
const texBrick = makeTex((x, y) => {
  const row = y >> 4, off = (row & 1) ? 16 : 0, bx = (x + off) & 31, by = y & 15;
  const n = hash2(x, y, 1) * 22 - 11, b = hash2((x + off) >> 5, row, 7) * 30 - 15;
  if (bx < 2 || by < 2) return [170 + n, 152 + n, 122 + n];
  return [196 + b + n, 150 + b * .8 + n, 98 + b * .5 + n];
});
const texConcrete = makeTex((x, y) => {
  let v = 120 + hash2(x, y, 2) * 26 + hash2(x >> 2, y >> 2, 3) * 14;
  if (x % 32 === 0 || y % 32 === 0) v -= 40; else if (x % 32 === 1 || y % 32 === 1) v += 12;
  return [v, v + 2, v + 6];
});
const texCrate = makeTex((x, y) => {
  const n = hash2(x >> 1, y, 4) * 20 - 10, grain = Math.sin((y + hash2(0, y >> 3, 5) * 8) * .9 + x * .05) * 8;
  let r = 150 + n + grain, g = 105 + n * .8 + grain * .7, b = 60 + n * .5;
  if (x < 5 || x > 58 || y < 5 || y > 58 || Math.abs(x - y) < 4 || Math.abs(x - (63 - y)) < 4) { r -= 45; g -= 35; b -= 20; }
  if (x === 5 || y === 5 || x === 58 || y === 58) { r -= 20; g -= 20; b -= 15; }
  return [r, g, b];
});
const texMetal = makeTex((x, y) => {
  const n = hash2(x, y, 6) * 12 - 6; let v = 0;
  if (y % 16 < 2) v = -35; else if (y % 16 === 2) v = 25;
  const rx = x % 32, ry = y % 16;
  if ((rx >= 3 && rx <= 5 || rx >= 27 && rx <= 29) && ry >= 7 && ry <= 9) v = 45;
  return [88 + v + n, 104 + v + n, 124 + v + n];
});
const texFloor = makeTex((x, y) => {
  const n = hash2(x, y, 8) * 18 - 9 + hash2(x >> 3, y >> 3, 9) * 12;
  let r = 150 + n, g = 134 + n, b = 104 + n;
  if (x % 32 === 0 || y % 32 === 0) { r -= 30; g -= 30; b -= 28; }
  return [r, g, b];
});
const wallTex = [null, texBrick, texConcrete, texCrate, texMetal];

/* ================= Spielfiguren-Sprites ================= */
const COLORS = ['#e5484d', '#3e8ef7', '#46a758', '#f5a524', '#a855f7', '#14b8a6', '#ec4899', '#cbd5e1'];
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => clamp(Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function makeSoldier(color, frame) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const dark = shadeHex(color, -.4), skin = '#d6a278', boot = '#16181b', pants = '#3b3f35';
  const circ = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  if (frame === 3) { // liegend
    c.fillStyle = 'rgba(110,10,10,.85)'; c.beginPath(); c.ellipse(30, 61, 27, 3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = pants; c.fillRect(42, 54, 16, 7); c.fillStyle = boot; c.fillRect(57, 54, 5, 7);
    c.fillStyle = color; c.fillRect(16, 52, 28, 9); c.fillStyle = dark; c.fillRect(20, 54, 18, 5);
    c.fillStyle = skin; circ(11, 56, 5); c.fillStyle = dark; c.fillRect(5, 51, 9, 4);
    c.fillStyle = '#1d1f22'; c.fillRect(20, 49, 26, 3);
  } else {
    const lo = frame === 1 ? 3 : frame === 2 ? -3 : 0;
    c.fillStyle = pants; c.fillRect(25 + lo, 42, 6, 18); c.fillRect(33 - lo, 42, 6, 18);
    c.fillStyle = boot; c.fillRect(24 + lo, 58, 8, 5); c.fillRect(32 - lo, 58, 8, 5);
    c.fillStyle = color; c.fillRect(23, 22, 18, 21);
    c.fillStyle = dark; c.fillRect(25, 25, 14, 13);
    c.fillStyle = '#2a2a2a'; c.fillRect(23, 40, 18, 3);
    c.fillStyle = color; c.fillRect(18, 23, 6, 14); c.fillRect(40, 23, 6, 14);
    c.fillStyle = '#1d1f22'; c.fillRect(16, 30, 32, 4); c.fillRect(44, 28, 7, 3); c.fillRect(22, 33, 4, 6);
    c.fillStyle = skin; c.fillRect(19, 30, 4, 4); c.fillRect(39, 30, 4, 4);
    c.fillRect(29, 18, 6, 5); circ(32, 14, 6);
    c.fillStyle = dark; c.beginPath(); c.arc(32, 13, 7, Math.PI, Math.PI * 2); c.fill(); c.fillRect(25, 12, 14, 2);
    c.fillStyle = '#111'; c.fillRect(29, 15, 2, 2); c.fillRect(33, 15, 2, 2);
  }
  const d = c.getImageData(0, 0, 64, 64).data;
  return new Uint32Array(d.buffer.slice(0));
}
const spriteSets = COLORS.map(col => [0, 1, 2, 3].map(f => makeSoldier(col, f)));

/* ================= Audio ================= */
let actx = null, noiseBuf = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * .4, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function sfxShot(vol = 1) {
  if (!actx || vol < .02) return;
  const t = actx.currentTime, out = actx.destination;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(300, t + .15);
  const g = actx.createGain(); g.gain.setValueAtTime(.45 * vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
  src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + .2);
  const o = actx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + .1);
  const g2 = actx.createGain(); g2.gain.setValueAtTime(.35 * vol, t); g2.gain.exponentialRampToValueAtTime(.001, t + .12);
  o.connect(g2).connect(out); o.start(t); o.stop(t + .13);
}
function tone(freq, dur, type = 'square', vol = .1, freq2 = 0, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + .02);
}
const sfxHit = () => tone(1300, .05, 'square', .06);
const sfxHurt = () => tone(220, .15, 'sawtooth', .12, 90);
const sfxDie = () => tone(420, .6, 'sawtooth', .18, 50);
const sfxKill = () => { tone(880, .08, 'square', .08); tone(1320, .12, 'square', .08, 0, .08); };
const sfxClick = () => tone(700, .03, 'square', .05);
const sfxReload = () => { tone(500, .04, 'square', .05); tone(900, .04, 'square', .05, 0, .5); };

/* ================= Spielzustand ================= */
const WEAPON = { dmg: 20, rate: .11, mag: 30, reload: 1.7, spread: .01, moveSpread: .03 };
const SPEED = 3.3, PR = .24, HIT_R = .28, RESPAWN = 3;
const BOT_NAMES = ['Atlas', 'Brutus', 'Cora', 'Dex', 'Echo', 'Fynn', 'Gina', 'Hugo'];

let state = 'menu';        // 'menu' | 'play'
let paused = false;
const ents = new Map();    // id -> entity
let scores = {};           // id -> {k,d,n}
const me = newEnt('me', 'Spieler');
me.x = 12; me.y = 12; me.a = 0;
let killfeed = [], centerMsg = null, deathBy = '';
let cool = 0, reloadT = 0, kick = 0, flashT = 0, spreadAcc = 0, hitMarker = 0, dmgFlash = 0, bobT = 0, bobAmp = 0;
let firing = false, showScores = false;
let netTimer = 0;
let botCount = 3;

function newEnt(id, name) {
  return { id, name, color: hashStr(id) % COLORS.length, x: 0, y: 0, a: 0, tx: 0, ty: 0, hp: 100, alive: true,
    ammo: WEAPON.mag, respawnAt: 0, flashT: 0, hurtT: 0, walkT: 0, moving: false, lastSeen: now(),
    isBot: false, path: [], thinkT: 0, fireT: 0, target: null, strafe: 1, seenT: 0 };
}
const sc = id => scores[id] || (scores[id] = { k: 0, d: 0 });
const nameOf = id => (ents.get(id) || {}).name || (scores[id] && scores[id].n) || 'Unbekannt';
const isOwner = id => id === me.id || (net.mode !== 'client' && id.startsWith('bot'));
function feed(text, color = '#fff') { killfeed.push({ text, color, t: now() }); if (killfeed.length > 6) killfeed.shift(); }

/* ================= Physik / Raycasts ================= */
function collides(x, y) { return solid(x - PR, y - PR) || solid(x + PR, y - PR) || solid(x - PR, y + PR) || solid(x + PR, y + PR); }
function tryMove(e, dx, dy) {
  let moved = false;
  if (!collides(e.x + dx, e.y)) { e.x += dx; moved = true; }
  if (!collides(e.x, e.y + dy)) { e.y += dy; moved = true; }
  return moved;
}
function rayWall(ox, oy, dx, dy, maxD = 48) {
  let mx = Math.floor(ox), my = Math.floor(oy);
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (ox - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - ox) * ddx; }
  if (dy < 0) { sy = -1; sdy = (oy - my) * ddy; } else { sy = 1; sdy = (my + 1 - oy) * ddy; }
  for (let i = 0; i < 128; i++) {
    let d;
    if (sdx < sdy) { d = sdx; sdx += ddx; mx += sx; } else { d = sdy; sdy += ddy; my += sy; }
    if (d > maxD) return maxD;
    if (cellAt(mx, my) > 0) return d;
  }
  return maxD;
}
function castShot(ox, oy, ang, shooterId) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let bestD = rayWall(ox, oy, dx, dy), best = null;
  for (const e of ents.values()) {
    if (!e.alive || e.id === shooterId) continue;
    const fx = e.x - ox, fy = e.y - oy, t = fx * dx + fy * dy;
    if (t < 0) continue;
    const p2 = fx * fx + fy * fy - t * t;
    if (p2 < HIT_R * HIT_R) { const d = t - Math.sqrt(HIT_R * HIT_R - p2); if (d < bestD) { bestD = d; best = e; } }
  }
  return { ent: best, d: bestD, x: ox + dx * bestD, y: oy + dy * bestD };
}
function los(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  return rayWall(a.x, a.y, dx / d, dy / d, d + 1) >= d;
}

/* ================= Kampf ================= */
function dealHit(targetId, dmg, fromId) {
  if (isOwner(targetId)) applyHit(targetId, dmg, fromId);
  else netSend({ t: 'hit', target: targetId, dmg, from: fromId });
}
function applyHit(targetId, dmg, fromId) {
  const e = ents.get(targetId);
  if (!e || !e.alive) return;
  e.hp = Math.max(0, e.hp - dmg); e.hurtT = .15;
  if (e === me) { dmgFlash = Math.min(.6, dmgFlash + .3); sfxHurt(); }
  if (e.hp <= 0) {
    e.alive = false; e.respawnAt = now() + RESPAWN;
    onDeath(targetId, fromId);
    netSend({ t: 'die', id: targetId, by: fromId });
  }
}
function onDeath(victimId, byId) {
  const v = ents.get(victimId);
  if (v) { v.alive = false; v.hp = 0; }
  sc(victimId).d++;
  if (byId && byId !== victimId) sc(byId).k++;
  const vn = nameOf(victimId), bn = nameOf(byId);
  feed(`${bn}  ✕  ${vn}`, byId === me.id || victimId === me.id ? '#f5a524' : '#fff');
  if (byId === me.id && victimId !== me.id) { sfxKill(); centerMsg = { text: `Eliminiert: ${vn}`, t: now() }; }
  if (victimId === me.id) { deathBy = bn; sfxDie(); firing = false; }
}
function respawn(e) {
  let best = spawns[0], bestScore = -1;
  for (const s of spawns) {
    let m = 99;
    for (const o of ents.values()) if (o !== e && o.alive) m = Math.min(m, Math.hypot(o.x - s.x, o.y - s.y));
    const score = m + Math.random() * 3;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  e.x = e.tx = best.x; e.y = e.ty = best.y;
  e.a = Math.atan2(12 - e.y, 12 - e.x);
  e.hp = 100; e.alive = true; e.ammo = WEAPON.mag; e.path = []; e.target = null;
  if (e === me) { reloadT = 0; cool = 0; dmgFlash = 0; }
}
function startReload() {
  if (reloadT > 0 || me.ammo >= WEAPON.mag || !me.alive) return;
  reloadT = WEAPON.reload; sfxReload();
}
function tryFire() {
  if (!me.alive || reloadT > 0 || cool > 0) return;
  if (me.ammo <= 0) { sfxClick(); startReload(); cool = .25; return; }
  me.ammo--; cool = WEAPON.rate; kick = 1; flashT = .05;
  const sp = WEAPON.spread + (me.moving ? WEAPON.moveSpread : 0) + spreadAcc;
  spreadAcc = Math.min(.05, spreadAcc + .006);
  const res = castShot(me.x, me.y, me.a + (Math.random() - .5) * 2 * sp, me.id);
  if (res.ent) { hitMarker = .18; sfxHit(); dealHit(res.ent.id, WEAPON.dmg, me.id); }
  else addImpact(res.x, res.y);
  sfxShot(1);
  netSend({ t: 'shot', id: me.id });
  if (me.ammo === 0) startReload();
}
const impacts = [];
function addImpact(x, y) { impacts.push({ x, y, t: .25 }); if (impacts.length > 20) impacts.shift(); }

/* ================= Bots ================= */
function randomOpenCell() {
  for (let i = 0; i < 200; i++) { const x = (Math.random() * MW) | 0, y = (Math.random() * MH) | 0; if (!map[y * MW + x]) return { x, y }; }
  return { x: 12, y: 12 };
}
function findPath(sx, sy, gx, gy) {
  const prev = new Int16Array(MW * MH).fill(-1), start = sy * MW + sx, goal = gy * MW + gx;
  const q = [start]; prev[start] = start;
  while (q.length) {
    const c = q.shift(); if (c === goal) break;
    const cx = c % MW, cy = (c / MW) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy, n = ny * MW + nx;
      if (cellAt(nx, ny) || prev[n] !== -1) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[goal] === -1) return [];
  const path = []; let c = goal;
  while (c !== start) { path.push({ x: c % MW + .5, y: ((c / MW) | 0) + .5 }); c = prev[c]; }
  return path.reverse();
}
function spawnBots(n) {
  for (let i = 0; i < n; i++) {
    const b = newEnt('bot' + i, 'Bot ' + BOT_NAMES[i % BOT_NAMES.length]);
    b.isBot = true; b.color = (i + 1 + hashStr(me.id)) % COLORS.length;
    b.strafe = Math.random() < .5 ? -1 : 1;
    ents.set(b.id, b); sc(b.id); respawn(b);
  }
}
function updateBot(b, dt, t) {
  b.flashT = Math.max(0, b.flashT - dt); b.hurtT = Math.max(0, b.hurtT - dt);
  if (!b.alive) { if (t > b.respawnAt) respawn(b); b.moving = false; return; }
  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = .2 + Math.random() * .15;
    let best = null, bd = 15;
    for (const e of ents.values()) {
      if (e === b || !e.alive) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < bd && los(b, e)) { bd = d; best = e; }
    }
    if (best && best !== b.target) b.seenT = .35 + Math.random() * .3; // Reaktionszeit
    b.target = best;
    if (!best && !b.path.length) { const g = randomOpenCell(); b.path = findPath(b.x | 0, b.y | 0, g.x, g.y); }
  }
  let mx = 0, my = 0, spd = 2.3;
  if (b.target && b.target.alive) {
    const ta = Math.atan2(b.target.y - b.y, b.target.x - b.x), diff = angDiff(b.a, ta);
    b.a += clamp(diff, -5 * dt, 5 * dt);
    if (Math.random() < dt * .6) b.strafe *= -1;
    mx = -Math.sin(b.a) * b.strafe; my = Math.cos(b.a) * b.strafe; spd = 1.6;
    b.seenT -= dt; b.fireT -= dt;
    if (b.seenT <= 0 && b.fireT <= 0 && Math.abs(diff) < .2) {
      b.fireT = .32 + Math.random() * .35;
      const res = castShot(b.x, b.y, b.a + (Math.random() - .5) * .14, b.id);
      if (res.ent) dealHit(res.ent.id, 12, b.id);
      b.flashT = .07;
      netSend({ t: 'shot', id: b.id });
      sfxShot(distVol(b));
    }
    b.path = [];
  } else if (b.path.length) {
    const n = b.path[0], dx = n.x - b.x, dy = n.y - b.y, d = Math.hypot(dx, dy);
    if (d < .2) b.path.shift();
    else { mx = dx / d; my = dy / d; b.a += clamp(angDiff(b.a, Math.atan2(dy, dx)), -6 * dt, 6 * dt); }
  }
  b.moving = !!(mx || my) && tryMove(b, mx * spd * dt, my * spd * dt);
  if (!b.moving && b.target) b.strafe *= -1;
  if (b.moving) b.walkT += dt;
}
const distVol = e => 1 / (1 + Math.hypot(e.x - me.x, e.y - me.y) * .25);

/* ================= Eingabe ================= */
const keys = {};
const touchMode = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let lookTouch = null;
const pointerLocked = () => document.pointerLockElement === view;

addEventListener('keydown', e => {
  if (state !== 'play') return;
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Tab') { showScores = true; e.preventDefault(); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Tab') showScores = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; firing = false; });
addEventListener('mousemove', e => { if (state === 'play' && pointerLocked()) me.a += e.movementX * .0024; });
view.addEventListener('mousedown', e => {
  if (state !== 'play' || touchMode) return;
  if (!pointerLocked()) { lockPointer(); return; }
  if (e.button === 0) firing = true;
});
addEventListener('mouseup', e => { if (e.button === 0 && !touchMode) firing = false; });
function lockPointer() { try { const p = view.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
document.addEventListener('pointerlockchange', () => {
  if (state !== 'play' || touchMode) return;
  if (pointerLocked()) setPause(false); else { firing = false; setPause(true); }
});

// Touch
const touchEl = $('#touch'), stickEl = $('#stick'), knobEl = $('#knob');
function onTouch(e) {
  if (state !== 'play' || paused) return;
  for (const t of e.changedTouches) {
    const btn = t.target.closest && t.target.closest('button');
    if (e.type === 'touchstart') {
      initAudio();
      if (btn) {
        if (btn.id === 'tFire') { firing = true; btn.classList.add('on'); btn.dataset.tid = t.identifier; }
        else if (btn.id === 'tReload') startReload();
        else if (btn.id === 'tScore') { showScores = !showScores; btn.classList.toggle('on', showScores); }
        else if (btn.id === 'tMenu') setPause(true);
        continue;
      }
      if (t.clientX < innerWidth * .45 && stick.id === null) {
        stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; stick.x = stick.y = 0;
        stickEl.style.left = (t.clientX - 65) + 'px'; stickEl.style.top = (t.clientY - 65) + 'px'; stickEl.style.bottom = 'auto';
      } else if (lookTouch === null) { lookTouch = { id: t.identifier, x: t.clientX }; }
    } else if (e.type === 'touchmove') {
      if (t.identifier === stick.id) {
        let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const d = Math.hypot(dx, dy), m = 55;
        if (d > m) { dx *= m / d; dy *= m / d; }
        stick.x = dx / m; stick.y = dy / m;
        knobEl.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (lookTouch && t.identifier === lookTouch.id) {
        me.a += (t.clientX - lookTouch.x) * .0065; lookTouch.x = t.clientX;
      }
    } else { // end / cancel
      const fb = $('#tFire');
      if (String(t.identifier) === fb.dataset.tid) { firing = false; fb.classList.remove('on'); fb.dataset.tid = ''; }
      if (t.identifier === stick.id) {
        stick.id = null; stick.x = stick.y = 0; knobEl.style.transform = '';
        stickEl.style.left = '30px'; stickEl.style.top = 'auto'; stickEl.style.bottom = '30px';
      }
      if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
    }
  }
  e.preventDefault();
}
for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) touchEl.addEventListener(ev, onTouch, { passive: false });

/* ================= Update ================= */
function updateMe(dt) {
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD) s += 1;
  if (keys.KeyA) s -= 1;
  if (keys.ArrowLeft) me.a -= 2.6 * dt;
  if (keys.ArrowRight) me.a += 2.6 * dt;
  if (stick.id !== null) { f -= stick.y; s += stick.x; }
  const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
  me.moving = false;
  if (me.alive && l > .05) {
    const ca = Math.cos(me.a), sa = Math.sin(me.a);
    const vx = (ca * f - sa * s) * SPEED * dt, vy = (sa * f + ca * s) * SPEED * dt;
    me.moving = tryMove(me, vx, vy);
  }
  if (me.moving) { bobT += dt * 9; bobAmp = Math.min(1, bobAmp + dt * 5); } else bobAmp = Math.max(0, bobAmp - dt * 4);
  cool -= dt; kick = Math.max(0, kick - dt * 9); flashT -= dt; hitMarker -= dt;
  dmgFlash = Math.max(0, dmgFlash - dt * .8); spreadAcc = Math.max(0, spreadAcc - dt * .08);
  me.hurtT = Math.max(0, me.hurtT - dt);
  if (reloadT > 0) { reloadT -= dt; if (reloadT <= 0) { reloadT = 0; me.ammo = WEAPON.mag; } }
  if (firing && !paused) tryFire();
  if (!me.alive && now() > me.respawnAt) respawn(me);
}
function updateRemote(e, dt, t) {
  const k = Math.min(1, dt * 14);
  const ox = e.x, oy = e.y;
  e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k;
  e.moving = Math.hypot(e.x - ox, e.y - oy) > dt * .5;
  if (e.moving) e.walkT += dt;
  e.flashT = Math.max(0, e.flashT - dt); e.hurtT = Math.max(0, e.hurtT - dt);
  if (t - e.lastSeen > 6) { ents.delete(e.id); }
}
function update(dt) {
  const t = now();
  if (state === 'play') {
    updateMe(dt);
    for (const e of [...ents.values()]) {
      if (e === me) continue;
      if (e.isBot && net.mode !== 'client') updateBot(e, dt, t); else updateRemote(e, dt, t);
    }
    for (const im of impacts) im.t -= dt;
    netTimer -= dt;
    if (netTimer <= 0) { netTimer = .05; sendStates(); }
  } else {
    me.a += dt * .12; // Menü-Hintergrund dreht langsam
  }
}

/* ================= Rendering ================= */
let W = 400, H = 225, img, buf32, zbuf, skyRows;
const HR = 196, HG = 206, HB = 214; // Dunstfarbe
function resize() {
  const cw = innerWidth, ch = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  H = cw < 760 ? 180 : 230;
  W = clamp(Math.round(H * cw / ch), 200, 600);
  view.width = W; view.height = H;
  hud.width = cw * dpr; hud.height = ch * dpr; hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  img = vctx.createImageData(W, H); buf32 = new Uint32Array(img.data.buffer); zbuf = new Float32Array(W);
  skyRows = new Uint32Array(H);
  for (let y = 0; y < H / 2; y++) {
    const t = y / (H / 2);
    skyRows[y] = pack(58 + (HR - 58) * t, 104 + (HG - 104) * t, 168 + (HB - 168) * t);
  }
}
addEventListener('resize', resize);
const fogF = d => clamp(1.12 - d * .055, .22, 1);
function fogc(c, f, k) {
  const g = 1 - f, kf = k * f;
  return (0xff000000 | (((((c >>> 16) & 255) * kf + HB * g) | 0) << 16) | (((((c >>> 8) & 255) * kf + HG * g) | 0) << 8) | ((((c & 255) * kf + HR * g) | 0))) >>> 0;
}
let labels = [];
function render() {
  const px = me.x, py = me.y, dirX = Math.cos(me.a), dirY = Math.sin(me.a);
  const FOV = .7, plX = -dirY * FOV, plY = dirX * FOV, half = H >> 1;
  // Himmel + Boden
  for (let y = 0; y < H; y++) {
    let o = y * W;
    if (y < half) { const c = skyRows[y]; buf32.fill(c, o, o + W); continue; }
    const p = y - half + .5, rd = (.5 * H) / p;
    const stx = rd * 2 * plX / W, sty = rd * 2 * plY / W;
    let fx = px + rd * (dirX - plX), fy = py + rd * (dirY - plY);
    const f = fogF(rd);
    for (let x = 0; x < W; x++) {
      const tx = (fx * TS) & 63, ty = (fy * TS) & 63;
      buf32[o++] = fogc(texFloor[ty * TS + tx], f, 1);
      fx += stx; fy += sty;
    }
  }
  // Wände
  for (let x = 0; x < W; x++) {
    const cam = 2 * x / W - 1, rdx = dirX + plX * cam, rdy = dirY + plY * cam;
    let mx = px | 0, my = py | 0;
    const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
    let sx, sy, sdx, sdy, side = 0, v = 0;
    if (rdx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
    if (rdy < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }
    for (let i = 0; i < 64; i++) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      v = cellAt(mx, my); if (v) break;
    }
    const perp = Math.max(.0001, side === 0 ? sdx - ddx : sdy - ddy);
    zbuf[x] = perp;
    const lh = H / perp, ds = -lh / 2 + half, y0 = Math.max(0, ds | 0), y1 = Math.min(H, (lh / 2 + half) | 0);
    let wx = side === 0 ? py + perp * rdy : px + perp * rdx; wx -= Math.floor(wx);
    let tx = (wx * TS) | 0; if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TS - tx - 1;
    const tex = wallTex[v] || texConcrete, f = fogF(perp), k = side ? .78 : 1, step = TS / lh;
    let tp = (y0 - ds) * step;
    for (let y = y0; y < y1; y++) { buf32[y * W + x] = fogc(tex[((tp | 0) & 63) * TS + tx], f, k); tp += step; }
  }
  // Sprites (Spieler, Bots)
  labels = [];
  const invDet = 1 / (plX * dirY - dirX * plY);
  const list = [];
  for (const e of ents.values()) {
    if (e === me) continue;
    list.push({ e, d: (e.x - px) ** 2 + (e.y - py) ** 2 });
  }
  list.sort((a, b) => b.d - a.d);
  for (const { e } of list) {
    const sx = e.x - px, sy = e.y - py;
    const tX = invDet * (dirY * sx - dirX * sy), tY = invDet * (-plY * sx + plX * sy);
    if (tY < .15) continue;
    const scrX = (W / 2) * (1 + tX / tY), sH = H / tY, sW = sH, y0 = half - sH / 2;
    const dsx = scrX - sW / 2;
    const xs = Math.max(0, dsx | 0), xe = Math.min(W, (dsx + sW) | 0), ys = Math.max(0, y0 | 0), ye = Math.min(H, (y0 + sH) | 0);
    const frame = !e.alive ? 3 : e.moving ? 1 + (((e.walkT * 7) | 0) & 1) : 0;
    const tex = spriteSets[e.color][frame], f = fogF(tY), hurt = e.hurtT > 0;
    let vis = false;
    for (let x = xs; x < xe; x++) {
      if (tY >= zbuf[x]) continue;
      vis = true;
      const tx = (((x - dsx) * TS / sW) | 0) & 63;
      for (let y = ys; y < ye; y++) {
        const ty = (((y - y0) * TS / sH) | 0) & 63, c = tex[ty * TS + tx];
        if ((c >>> 24) < 128) continue;
        buf32[y * W + x] = hurt ? 0xff3030ff : fogc(c, f, 1);
      }
    }
    const cx = clamp(scrX | 0, 0, W - 1);
    if (vis && e.alive) labels.push({ e, x: scrX, top: y0 + sH * .05, d: tY, sH, gunX: dsx + sW * 50 / 64, gunY: y0 + sH * 30 / 64, gunVis: tY < zbuf[clamp((dsx + sW * 50 / 64) | 0, 0, W - 1)] || tY < zbuf[cx] });
  }
  // Einschläge
  for (const im of impacts) {
    if (im.t <= 0) continue;
    const sx = im.x - px, sy = im.y - py;
    const tX = invDet * (dirY * sx - dirX * sy), tY = invDet * (-plY * sx + plX * sy);
    if (tY < .2) continue;
    const scrX = ((W / 2) * (1 + tX / tY)) | 0, r = Math.max(1, (2.5 / tY) | 0);
    for (let x = scrX - r; x <= scrX + r; x++) for (let y = half - r; y <= half + r; y++)
      if (x >= 0 && x < W && y >= 0 && y < H && tY <= zbuf[x] + .05) buf32[y * W + x] = 0xff3a4f5e;
  }
  vctx.putImageData(img, 0, 0);
}

/* ================= HUD ================= */
function poly(pts, fill) { hctx.beginPath(); hctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) hctx.lineTo(pts[i][0], pts[i][1]); hctx.closePath(); hctx.fillStyle = fill; hctx.fill(); }
function drawGun(cw, ch) {
  const k = clamp(ch / 720, .55, 1.4);
  const bx = Math.sin(bobT) * 12 * bobAmp, by = Math.abs(Math.cos(bobT)) * 10 * bobAmp;
  const rl = reloadT > 0 ? Math.sin((1 - reloadT / WEAPON.reload) * Math.PI) * 220 : 0;
  hctx.save();
  hctx.translate(cw * .5 + 190 * k + bx * k, ch + (by + kick * 26 + rl) * k);
  hctx.scale(k, k);
  if (flashT > 0) {
    const g = hctx.createRadialGradient(-112, -300, 0, -112, -300, 70);
    g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(.3, 'rgba(255,190,60,.9)'); g.addColorStop(1, 'rgba(255,120,0,0)');
    hctx.fillStyle = g; hctx.beginPath(); hctx.arc(-112, -300, 70, 0, Math.PI * 2); hctx.fill();
  }
  poly([[-124, -296], [-100, -308], [-14, -140], [-50, -124]], '#1b1e23');
  poly([[-118, -300], [-104, -306], [-96, -290], [-110, -284]], '#0c0d10');
  poly([[-86, -232], [-54, -246], [2, -118], [-46, -98]], '#3b4048');
  poly([[-46, -150], [22, -176], [130, 0], [10, 0]], '#2c3138');
  poly([[-36, -164], [8, -182], [26, -150], [-20, -134]], '#4a515a');
  poly([[-4, -88], [36, -104], [54, -10], [6, 0]], '#202328');
  hctx.fillStyle = '#3a3128'; hctx.beginPath(); hctx.ellipse(-52, -170, 26, 34, -.5, 0, Math.PI * 2); hctx.fill();
  hctx.fillStyle = '#2e2720'; hctx.beginPath(); hctx.ellipse(70, -30, 40, 46, -.4, 0, Math.PI * 2); hctx.fill();
  hctx.restore();
}
function txt(s, x, y, size, color = '#fff', align = 'left', weight = 700) {
  hctx.font = `${weight} ${size}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
  hctx.textAlign = align; hctx.textBaseline = 'middle';
  hctx.fillStyle = 'rgba(0,0,0,.6)'; hctx.fillText(s, x + 1.5, y + 1.5);
  hctx.fillStyle = color; hctx.fillText(s, x, y);
}
function drawHUD() {
  const cw = innerWidth, ch = innerHeight, t = now();
  hctx.clearRect(0, 0, cw, ch);
  const kx = cw / W, ky = ch / H;
  for (const L of labels) {
    if (L.gunVis && L.e.flashT > 0) {
      const r = Math.max(4, L.sH * ky * .07);
      const g = hctx.createRadialGradient(L.gunX * kx, L.gunY * ky, 0, L.gunX * kx, L.gunY * ky, r);
      g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(1, 'rgba(255,150,0,0)');
      hctx.fillStyle = g; hctx.beginPath(); hctx.arc(L.gunX * kx, L.gunY * ky, r, 0, Math.PI * 2); hctx.fill();
    }
    if (L.d < 14) txt(L.e.name, L.x * kx, L.top * ky - 10, clamp(16 - L.d * .5, 10, 15), COLORS[L.e.color], 'center');
  }
  if (state !== 'play') return;
  const sm = Math.min(cw, ch);

  if (dmgFlash > 0) {
    const g = hctx.createRadialGradient(cw / 2, ch / 2, sm * .3, cw / 2, ch / 2, Math.max(cw, ch) * .75);
    g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${dmgFlash})`);
    hctx.fillStyle = g; hctx.fillRect(0, 0, cw, ch);
  }
  if (me.alive) {
    drawGun(cw, ch);
    // Fadenkreuz
    const gap = 5 + (spreadAcc + (me.moving ? WEAPON.moveSpread : 0)) * sm * 1.2, len = 8, cx = cw / 2, cy = ch / 2;
    hctx.lineWidth = 4; hctx.strokeStyle = 'rgba(0,0,0,.55)';
    const cross = () => { hctx.beginPath();
      hctx.moveTo(cx - gap - len, cy); hctx.lineTo(cx - gap, cy); hctx.moveTo(cx + gap, cy); hctx.lineTo(cx + gap + len, cy);
      hctx.moveTo(cx, cy - gap - len); hctx.lineTo(cx, cy - gap); hctx.moveTo(cx, cy + gap); hctx.lineTo(cx, cy + gap + len); hctx.stroke(); };
    cross(); hctx.lineWidth = 2; hctx.strokeStyle = '#7CFC8A'; cross();
    if (hitMarker > 0) {
      hctx.strokeStyle = '#fff'; hctx.lineWidth = 2.5; hctx.beginPath();
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { hctx.moveTo(cx + a * 7, cy + b * 7); hctx.lineTo(cx + a * 13, cy + b * 13); }
      hctx.stroke();
    }
  }
  // Leben & Munition
  const bottomY = touchMode ? 34 : ch - 34;
  const hpX = touchMode ? cw / 2 - 150 : 24;
  txt('♥', hpX, bottomY, 22, '#e5484d');
  txt(String(me.hp), hpX + 26, bottomY, 26, me.hp > 30 ? '#fff' : '#ff6b6b');
  hctx.fillStyle = 'rgba(0,0,0,.45)'; hctx.fillRect(hpX + 72, bottomY - 5, 90, 10);
  hctx.fillStyle = me.hp > 30 ? '#46a758' : '#e5484d'; hctx.fillRect(hpX + 72, bottomY - 5, 90 * me.hp / 100, 10);
  const amX = touchMode ? cw / 2 + 150 : cw - 24;
  txt(reloadT > 0 ? 'Lädt …' : `${me.ammo} / ∞`, amX, bottomY, 26, me.ammo > 5 || reloadT > 0 ? '#fff' : '#f5a524', 'right');
  // Minikarte
  const cs = clamp(Math.round(sm / 110), 3, 6), mx0 = 14, my0 = touchMode ? 64 : 14;
  hctx.fillStyle = 'rgba(0,0,0,.4)'; hctx.fillRect(mx0 - 3, my0 - 3, MW * cs + 6, MH * cs + 6);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const v = map[y * MW + x]; if (!v) continue;
    hctx.fillStyle = v === 3 ? '#8a6a3e' : v === 4 ? '#5d6b7c' : v === 1 ? '#a88a62' : '#6e7175';
    hctx.fillRect(mx0 + x * cs, my0 + y * cs, cs, cs);
  }
  for (const e of ents.values()) if (e !== me && e.alive && e.flashT > 0) e.seenOnMap = t + 1.2;
  for (const e of ents.values()) {
    if (e === me || !e.alive || !(e.seenOnMap > t)) continue;
    hctx.fillStyle = '#ff4d4d'; hctx.beginPath(); hctx.arc(mx0 + e.x * cs, my0 + e.y * cs, cs * .6, 0, 7); hctx.fill();
  }
  if (me.alive) {
    hctx.fillStyle = '#7CFC8A'; hctx.beginPath(); hctx.arc(mx0 + me.x * cs, my0 + me.y * cs, cs * .7, 0, 7); hctx.fill();
    hctx.strokeStyle = '#7CFC8A'; hctx.lineWidth = 1.5; hctx.beginPath();
    hctx.moveTo(mx0 + me.x * cs, my0 + me.y * cs); hctx.lineTo(mx0 + (me.x + Math.cos(me.a) * 2) * cs, my0 + (me.y + Math.sin(me.a) * 2) * cs); hctx.stroke();
  }
  // Raum-Info
  if (net.mode !== 'solo') {
    const players = [...ents.values()].filter(e => !e.isBot).length;
    txt(`${net.mode === 'host' ? 'Host' : 'Raum'} ${net.code} · ${players} Spieler`, cw / 2, touchMode ? 70 : 18, 13, 'rgba(255,255,255,.8)', 'center', 600);
  }
  // Killfeed
  let ky0 = touchMode ? 84 : 20;
  killfeed = killfeed.filter(k => t - k.t < 6);
  for (const k of killfeed) { txt(k.text, cw - 18, ky0, 14, k.color, 'right', 600); ky0 += 20; }
  if (centerMsg && t - centerMsg.t < 1.8) txt(centerMsg.text, cw / 2, ch * .32, 22, '#f5a524', 'center', 800);
  // Tot
  if (!me.alive) {
    hctx.fillStyle = 'rgba(40,0,0,.45)'; hctx.fillRect(0, 0, cw, ch);
    txt('ELIMINIERT', cw / 2, ch * .42, 40, '#ff5a5a', 'center', 900);
    txt(`von ${deathBy}`, cw / 2, ch * .42 + 40, 18, '#fff', 'center', 600);
    txt(`Respawn in ${Math.max(0, me.respawnAt - t).toFixed(1)} s`, cw / 2, ch * .42 + 72, 16, '#ddd', 'center', 600);
  }
  if (showScores) drawScores(cw, ch);
}
function drawScores(cw, ch) {
  const rows = [...ents.values()].map(e => ({ e, s: sc(e.id) })).sort((a, b) => b.s.k - a.s.k || a.s.d - b.s.d);
  const w = Math.min(460, cw - 30), rh = 28, h = 64 + rows.length * rh, x = (cw - w) / 2, y = Math.max(20, (ch - h) / 2);
  hctx.fillStyle = 'rgba(14,16,20,.88)'; hctx.fillRect(x, y, w, h);
  txt('PUNKTESTAND', x + 16, y + 22, 16, '#f5a524', 'left', 800);
  txt('K', x + w - 90, y + 22, 14, '#aaa', 'center'); txt('T', x + w - 40, y + 22, 14, '#aaa', 'center');
  rows.forEach((r, i) => {
    const yy = y + 54 + i * rh;
    if (r.e === me) { hctx.fillStyle = 'rgba(245,165,36,.15)'; hctx.fillRect(x + 6, yy - rh / 2, w - 12, rh); }
    hctx.fillStyle = COLORS[r.e.color]; hctx.fillRect(x + 16, yy - 6, 12, 12);
    txt(r.e.name + (r.e.alive ? '' : '  ✝'), x + 38, yy, 15, '#fff', 'left', 600);
    txt(String(r.s.k), x + w - 90, yy, 15, '#fff', 'center'); txt(String(r.s.d), x + w - 40, yy, 15, '#fff', 'center');
  });
}

/* ================= Netzwerk (PeerJS / WebRTC) ================= */
const PREFIX = 'shootme-v1-';
const net = { mode: 'solo', peer: null, conns: new Map(), hostConn: null, code: '' };
function netSend(m) {
  if (net.mode === 'host') { for (const c of net.conns.values()) if (c.open) c.send(m); }
  else if (net.mode === 'client' && net.hostConn && net.hostConn.open) net.hostConn.send(m);
}
function relay(m, fromId) { for (const [id, c] of net.conns) if (id !== fromId && c.open) c.send(m); }
const stateMsg = e => ({ t: 's', id: e.id, n: e.name, c: e.color, b: e.isBot ? 1 : 0, x: +e.x.toFixed(2), y: +e.y.toFixed(2), a: +e.a.toFixed(2), h: e.hp, al: e.alive ? 1 : 0 });
function sendStates() {
  if (net.mode === 'solo') return;
  netSend(stateMsg(me));
  if (net.mode === 'host') for (const e of ents.values()) if (e.isBot) netSend(stateMsg(e));
}
function handleMsg(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 's': {
      if (m.id === me.id) return;
      let e = ents.get(m.id);
      if (!e) { e = newEnt(m.id, esc(m.n).slice(0, 18)); e.x = e.tx = m.x; e.y = e.ty = m.y; ents.set(m.id, e); sc(m.id); }
      if (!e.alive && m.al) { e.x = m.x; e.y = m.y; }
      e.tx = m.x; e.ty = m.y; e.a = m.a; e.hp = m.h; e.alive = !!m.al; e.name = esc(m.n).slice(0, 18);
      e.color = (m.c | 0) % COLORS.length; e.isBot = !!m.b; e.lastSeen = now();
      sc(m.id).n = e.name;
      break;
    }
    case 'shot': { const e = ents.get(m.id); if (e) { e.flashT = .08; sfxShot(distVol(e)); } break; }
    case 'hit': if (isOwner(m.target)) applyHit(m.target, clamp(+m.dmg || 0, 0, 40), m.from); break;
    case 'die': onDeath(m.id, m.by); break;
    case 'leave': ents.delete(m.id); feed(`${esc(m.n || 'Spieler')} hat das Spiel verlassen`, '#9aa0a6'); break;
    case 'feed': feed(esc(m.text), m.color || '#9aa0a6'); break;
    case 'welcome': scores = m.scores || {}; sc(me.id); setTimeout(() => { if (state === 'play' && me.alive) respawn(me); }, 400); break;
    case 'full': leaveGame('Der Raum ist voll (max. 8 Spieler).'); break;
  }
}
function setStatus(s) { $('#status').textContent = s; }
function genCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0]; return s; }
function cleanupNet() {
  try { if (net.peer) net.peer.destroy(); } catch (e) {}
  net.peer = null; net.conns.clear(); net.hostConn = null; net.mode = 'solo'; net.code = '';
}
function peerAvailable() {
  if (window.Peer) return true;
  setStatus('Netzwerk-Bibliothek (PeerJS) konnte nicht geladen werden. Internetverbindung prüfen.');
  return false;
}
function hostGame(tries = 0) {
  if (!peerAvailable()) return;
  setStatus('Erstelle Raum …');
  const code = genCode(), peer = new Peer(PREFIX + code, { debug: 0 });
  net.peer = peer;
  peer.on('open', id => {
    net.mode = 'host'; net.code = code;
    try { history.replaceState(null, '', '#' + code); } catch (e) {}
    startGame(id, true);
    setPause(true);
  });
  peer.on('connection', conn => {
    conn.on('open', () => {
      if (net.conns.size >= 7) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
      net.conns.set(conn.peer, conn);
    });
    conn.on('data', m => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 's' && m.id !== conn.peer) return;           // keine fremden IDs
      if (m.t === 'die' && m.id !== conn.peer) return;
      if (m.t === 'hello') {
        const name = esc(m.n || 'Spieler').slice(0, 18);
        for (const id in scores) if (!ents.has(id)) delete scores[id];
        sc(conn.peer).n = name;
        conn.send({ t: 'welcome', scores });
        conn.send(stateMsg(me));
        for (const e of ents.values()) if (e !== me && e.isBot) conn.send(stateMsg(e));
        const msg = { t: 'feed', text: `${name} ist beigetreten`, color: '#7CFC8A' };
        handleMsg(msg); relay(msg, conn.peer);
        return;
      }
      if (m.t === 'leave') { if (m.id !== conn.peer) return; net.conns.delete(conn.peer); }
      handleMsg(m); relay(m, conn.peer);
    });
    const drop = () => {
      if (!net.conns.has(conn.peer)) return;
      net.conns.delete(conn.peer);
      const n = nameOf(conn.peer), msg = { t: 'leave', id: conn.peer, n };
      handleMsg(msg); relay(msg, null);
    };
    conn.on('close', drop); conn.on('error', drop);
  });
  peer.on('error', err => {
    if (err.type === 'unavailable-id' && tries < 5) { try { peer.destroy(); } catch (e) {} hostGame(tries + 1); return; }
    if (state === 'play' && net.mode === 'host' && err.type !== 'network' && err.type !== 'server-error') return;
    if (state === 'play') { feed('Verbindung zum Vermittlungsserver gestört …', '#f5a524'); return; }
    setStatus('Fehler beim Erstellen: ' + err.type); cleanupNet();
  });
  peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} });
}
function joinGame(raw) {
  const code = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { setStatus('Bitte den 5-stelligen Raumcode eingeben.'); return; }
  if (!peerAvailable()) return;
  setStatus('Verbinde mit Raum ' + code + ' …');
  const peer = new Peer({ debug: 0 });
  net.peer = peer;
  let timeout = null;
  peer.on('open', id => {
    const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    net.hostConn = conn;
    timeout = setTimeout(() => { if (state !== 'play') { setStatus('Keine Verbindung möglich (Raum existiert nicht oder Netzwerk blockiert WebRTC).'); cleanupNet(); } }, 15000);
    conn.on('open', () => {
      clearTimeout(timeout);
      net.mode = 'client'; net.code = code;
      startGame(id, false);
      conn.send({ t: 'hello', n: me.name });
    });
    conn.on('data', handleMsg);
    conn.on('close', () => { if (net.mode === 'client' && state === 'play') leaveGame('Verbindung zum Host wurde getrennt.'); });
  });
  peer.on('error', err => {
    if (state === 'play' && net.hostConn && net.hostConn.open) return;
    clearTimeout(timeout);
    setStatus(err.type === 'peer-unavailable' ? `Raum ${code} nicht gefunden.` : 'Verbindungsfehler: ' + err.type);
    if (state === 'play') leaveGame('Verbindung verloren.'); else cleanupNet();
  });
}

/* ================= Spielablauf / Menü ================= */
function getName() {
  const n = esc($('#name').value.trim()).slice(0, 14) || 'Spieler' + ((Math.random() * 90 + 10) | 0);
  try { localStorage.setItem('shootme-name', n); } catch (e) {}
  return n;
}
function startGame(myId, withBots) {
  ents.clear(); scores = {}; killfeed = []; impacts.length = 0;
  me.id = myId; me.name = getName(); me.color = hashStr(myId) % COLORS.length;
  ents.set(me.id, me); sc(me.id);
  if (withBots) spawnBots(botCount);
  respawn(me);
  state = 'play';
  $('#menu').classList.add('hidden');
  $('#touch').classList.toggle('hidden', !touchMode);
  setStatus('');
  feed(net.mode === 'solo' ? 'Solo-Match gestartet' : net.mode === 'host' ? `Raum ${net.code} erstellt – Code teilen!` : `Raum ${net.code} beigetreten`, '#7CFC8A');
  if (!touchMode) { if (net.mode === 'solo') lockPointer(); else setPause(true); }
}
function leaveGame(reason) {
  if (net.mode !== 'solo') netSend({ t: 'leave', id: me.id, n: me.name });
  setTimeout(cleanupNet, 100);
  state = 'menu'; paused = false; firing = false; showScores = false;
  ents.clear(); me.x = 12; me.y = 12; me.alive = true;
  try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  $('#pause').classList.add('hidden'); $('#touch').classList.add('hidden'); $('#menu').classList.remove('hidden');
  setStatus(reason || '');
}
function setPause(p) {
  if (state !== 'play') return;
  paused = p;
  $('#pause').classList.toggle('hidden', !p);
  if (p) {
    firing = false;
    const online = net.mode !== 'solo';
    $('#roomBox').classList.toggle('hidden', !online);
    $('#pauseHint').textContent = online ? 'Das Match läuft im Hintergrund weiter.' : 'Bots warten im Hintergrund weiter …';
    if (online) {
      $('#roomCode').textContent = net.code;
      $('#roomLink').textContent = inviteLink();
    }
    $('#btnResume').textContent = touchMode ? 'Weiterspielen' : 'Klicken zum Spielen';
  }
}
const inviteLink = () => location.origin + location.pathname + '#' + net.code;
function goFullscreen() {
  if (!touchMode) return;
  try { const el = document.documentElement, r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}

$('#btnSolo').onclick = () => { initAudio(); goFullscreen(); botCount = +$('#bots').value || 0; if (!botCount) botCount = 3; cleanupNet(); startGame('me', true); };
$('#btnHost').onclick = () => { initAudio(); goFullscreen(); botCount = +$('#bots').value; cleanupNet(); hostGame(); };
$('#btnJoin').onclick = () => { initAudio(); goFullscreen(); cleanupNet(); joinGame($('#code').value); };
$('#code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });
$('#btnResume').onclick = () => { initAudio(); if (touchMode) setPause(false); else lockPointer(); };
$('#btnLeave').onclick = () => leaveGame('');
$('#btnCopy').onclick = () => {
  const b = $('#btnCopy');
  const done = ok => { b.textContent = ok ? 'Link kopiert ✓' : 'Link oben markieren & kopieren'; setTimeout(() => b.textContent = 'Einladungslink kopieren', 2000); };
  try { navigator.clipboard.writeText(inviteLink()).then(() => done(true), () => done(false)); } catch (e) { done(false); }
};
try { $('#name').value = localStorage.getItem('shootme-name') || ''; } catch (e) {}
const hashCode = location.hash.replace('#', '').toUpperCase();
if (/^[A-Z0-9]{5}$/.test(hashCode)) { $('#code').value = hashCode; setStatus('Einladung erhalten – Namen eingeben und „Beitreten“ drücken.'); }
addEventListener('beforeunload', () => { if (net.mode !== 'solo') netSend({ t: 'leave', id: me.id, n: me.name }); });

/* ================= Hauptschleife ================= */
resize();
let last = now();
function frame() {
  const t = now(), dt = Math.min(.05, t - last); last = t;
  update(dt);
  render();
  drawHUD();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Für Tests
window.__shootme = { ents, me, net, state: () => state, update, scores: () => scores };
})();
