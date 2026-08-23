/* ================================================================
   KICK THE SIAMESE

   Original implementation. The only thing borrowed from the genre is
   the idea: a cartoon punchbag you poke with silly tools.

   No frameworks, no build step, no backend. Everything is one rigid
   body with a few procedural limbs, drawn on a canvas.
   ================================================================ */

(() => {
'use strict';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand  = (a, b) => a + Math.random() * (b - a);

/* ---------------- persistence ---------------- */
const KEY = 'kickTheSiamese.v1';
const FRESH = () => ({ coins: 0, hits: 0, best: 0, unlocked: ['fist'], sound: true });
let S = FRESH();

function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if (raw) S = Object.assign(FRESH(), JSON.parse(raw));
    if (!Array.isArray(S.unlocked) || !S.unlocked.length) S.unlocked = ['fist'];
  }catch(e){ S = FRESH(); }
}

/* ---------------- sound ----------------
   Synthesised, so there are no audio files to ship or 404. Every call
   is wrapped: if the browser blocks or lacks WebAudio the game simply
   plays silently. */
let actx = null;
function sfx(kind, power){
  if (!S.sound) return;
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime;
    const p = clamp(power || 0.5, 0.1, 1);

    const tone = (f0, f1, dur, type, vol) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    };
    const noise = (dur, vol) => {
      const n = Math.floor(actx.sampleRate * dur);
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1) * (1 - i/n);
      const src = actx.createBufferSource(), g = actx.createGain();
      src.buffer = buf; g.gain.value = vol;
      src.connect(g); g.connect(actx.destination);
      src.start(t0);
    };

    if (kind === 'thud')  { tone(180*p+90, 60, .18, 'sine', .18*p); noise(.06, .10*p); }
    if (kind === 'slap')  { noise(.09, .16*p); tone(900, 200, .10, 'triangle', .07*p); }
    if (kind === 'boom')  { tone(120, 30, .55, 'sine', .30); noise(.34, .26); }
    if (kind === 'zap')   { tone(1400, 180, .22, 'sawtooth', .10); }
    if (kind === 'boing') { tone(220, 760, .16, 'triangle', .12); tone(760, 240, .18, 'triangle', .08); }
    if (kind === 'coin')  { tone(880, 880, .06, 'square', .05); tone(1320, 1320, .09, 'square', .045); }
    if (kind === 'click') { tone(520, 520, .04, 'triangle', .04); }
  }catch(e){ /* silence is an acceptable outcome */ }
}

/* ---------------- the head image ----------------
   Drawn once loaded; until then a placeholder circle stands in, so a
   slow or missing image never stops the game running. */
const head = new Image();
let headReady = false, headBroken = false;
head.onload  = () => { headReady = true; };
head.onerror = () => { headBroken = true; $('tip').textContent = 'assets/siamese.png is missing — using a stand-in head.'; };
head.src = 'assets/siamese.png';

/* ---------------- the character ----------------
   One rigid body: position, velocity, angle, spin. The limbs are drawn
   procedurally and lag behind the body, which reads as floppy without
   needing a real ragdoll solver. */
const GRAV = 1900;          // px/s²
const body = {
  x: 0, y: 0, vx: 0, vy: 0,
  a: 0, va: 0,
  mass: 1,
  r: 112,                   // centre-to-feet: the drawing reaches +112,
                            // so anything smaller sinks him into the floor
  squash: 0,                // visual only, decays each frame
  restAt: 0
};

let W = 0, H = 0, DPR = 1, ground = 0;

function resize(){
  const rect = canvas.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(320, rect.width);
  H = Math.max(320, rect.height);
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ground = H - 74;
  if (!body.x) resetBody();
  body.x = clamp(body.x, 90, W - 90);
}

function resetBody(){
  body.x = W / 2;
  body.y = ground - body.r - 60;      // drop in from just above the floor
  body.vx = body.vy = 0;
  body.a = body.va = 0;
  body.squash = 0;
  combo = 0; comboUntil = 0;
  paintCombo();
}

/* ---------------- tools ---------------- */
const TOOLS = [
  { id:'fist',  name:'Fist',      glyph:'\u270A', cost:0,    hold:false,
    tip:'A polite introduction.' },
  { id:'slap',  name:'Slap',      glyph:'\u270B', cost:60,   hold:false,
    tip:'Less force, far more spin.' },
  { id:'boot',  name:'Boot',      glyph:'\uD83D\uDC62', cost:220,  hold:false,
    tip:'Straight up. Mind the ceiling.' },
  { id:'bomb',  name:'Bomb',      glyph:'\uD83D\uDCA3', cost:600,  hold:false,
    tip:'Short fuse, wide blast.' },
  { id:'fan',   name:'Fan',       glyph:'\uD83C\uDF00', cost:1200, hold:true,
    tip:'Hold to blow him around.' },
  { id:'magnet',name:'Tractor',   glyph:'\uD83E\uDDF2', cost:2600, hold:true,
    tip:'Hold to drag him about.' }
];
const T = {};
TOOLS.forEach(t => T[t.id] = t);
let tool = 'fist';

const unlocked = id => S.unlocked.indexOf(id) !== -1;

function buildTools(){
  const nav = $('tools');
  nav.innerHTML = '';
  TOOLS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tool' + (t.id === tool ? ' on' : '');
    b.dataset.tool = t.id;
    b.innerHTML =
      '<span class="g">' + t.glyph + '</span>' +
      '<span class="n">' + t.name + '</span>' +
      (unlocked(t.id) ? '' : '<span class="c">' + t.cost + ' coins</span>');
    b.onclick = () => pickTool(t.id);
    nav.appendChild(b);
  });
  paintTools();
}

function paintTools(){
  document.querySelectorAll('.tool').forEach(b => {
    const t = T[b.dataset.tool];
    const has = unlocked(t.id);
    b.classList.toggle('on', t.id === tool);
    b.disabled = !has && S.coins < t.cost;
  });
  $('coins').textContent = S.coins;
}

function pickTool(id){
  const t = T[id];
  if (!unlocked(id)){
    if (S.coins < t.cost){ $('tip').textContent = 'Need ' + (t.cost - S.coins) + ' more coins for the ' + t.name + '.'; return; }
    S.coins -= t.cost;
    S.unlocked.push(id);
    save();
    sfx('boing');
    $('tip').textContent = t.name + ' unlocked. ' + t.tip;
    buildTools();
  }
  tool = id;
  $('tip').textContent = t.tip;
  sfx('click');
  paintTools();
}

/* ---------------- particles + shake ---------------- */
const bits = [];
let shake = 0;

function spawn(x, y, n, kind){
  for (let i = 0; i < n; i++){
    const a = rand(0, Math.PI * 2), sp = rand(60, 460);
    bits.push({
      x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 90,
      life: 1, kind,
      size: kind === 'coin' ? 9 : rand(3, 7),
      rot: rand(0, 6), vr: rand(-9, 9)
    });
  }
}

function flash(){
  const f = $('flash');
  f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 30);
}

/* ---------------- scoring ---------------- */
let combo = 0, comboUntil = 0;

function paintCombo(){
  const pill = $('comboPill');
  if (combo > 1){ pill.hidden = false; $('combo').textContent = 'x' + combo; }
  else pill.hidden = true;
}

function award(power){
  const now = performance.now();
  combo = now < comboUntil ? combo + 1 : 1;
  comboUntil = now + 1300;

  const gained = Math.max(1, Math.round(power * 12 * (1 + combo * 0.16)));
  S.coins += gained;
  S.hits++;
  if (power > S.best) S.best = power;
  save();

  const v = $('coins');
  v.textContent = S.coins;
  v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump');

  paintCombo();
  paintTools();
  return gained;
}

/* ---------------- input ---------------- */
let holding = false, hx = 0, hy = 0;

function pointFrom(e){
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const p = pointFrom(e);
  hx = p.x; hy = p.y;
  if (T[tool].hold){ holding = true; }
  else strike(p.x, p.y);
});
canvas.addEventListener('pointermove', e => {
  const p = pointFrom(e);
  hx = p.x; hy = p.y;
});
['pointerup','pointercancel','pointerleave'].forEach(ev =>
  canvas.addEventListener(ev, () => { holding = false; }));

/* Apply an impulse at a point. Offset from the centre becomes torque,
   which is what makes him tumble instead of sliding flat. */
function impulse(px, py, ix, iy){
  body.vx += ix / body.mass;
  body.vy += iy / body.mass;
  const rx = px - body.x, ry = py - body.y;
  body.va += (rx * iy - ry * ix) * 0.000022;
  body.va = clamp(body.va, -22, 22);
  body.squash = Math.min(1, body.squash + 0.5);
}

function strike(x, y){
  const dx = x - body.x, dy = y - body.y;
  /* he is tall and thin, so test an ellipse rather than a circle —
     a plain radius either missed his head or hit empty floor */
  const near = (dx*dx) / (95*95) + (dy*dy) / (145*145) < 1;
  const dist = Math.hypot(dx, dy);

  if (tool === 'bomb'){
    bombs.push({ x, y, t: 0.75 });
    sfx('click');
    return;
  }

  if (!near){
    // a miss still nudges the air; no coins for it
    spawn(x, y, 5, 'dust');
    sfx('click');
    return;
  }

  const nx = dist ? dx/dist : 0, ny = dist ? dy/dist : -1;
  let power = 1, ix = 0, iy = 0;

  if (tool === 'fist'){
    power = rand(0.8, 1.25);
    ix = nx * 520 * power; iy = ny * 520 * power - 240;
    sfx('thud', power);
    spawn(x, y, 12, 'star');
  } else if (tool === 'slap'){
    power = rand(0.5, 0.9);
    ix = (dx >= 0 ? 1 : -1) * 620 * power; iy = -180;
    body.va += (dx >= 0 ? 1 : -1) * 9;
    sfx('slap', power);
    spawn(x, y, 10, 'star');
  } else if (tool === 'boot'){
    power = rand(1.3, 1.9);
    ix = rand(-120, 120); iy = -980 * power;
    sfx('boing');
    spawn(body.x, body.y + 50, 16, 'dust');
  }

  impulse(x, y, ix, iy);
  shake = Math.min(16, shake + 7 * power);
  flash();
  const coins = award(power);
  spawn(body.x, body.y - 30, Math.min(6, 2 + Math.floor(power * 2)), 'coin');
  $('tip').textContent = '+' + coins + ' coins' + (combo > 1 ? '  ·  combo x' + combo : '');
}

/* held tools act every frame rather than on click */
function holdForces(dt){
  if (!holding) return;
  const dx = body.x - hx, dy = body.y - hy;
  const d = Math.max(24, Math.hypot(dx, dy));

  if (tool === 'fan'){
    const f = 1400 / d;
    body.vx += (dx/d) * f * dt * 60;
    body.vy += (dy/d) * f * dt * 60;
    body.va += 0.35 * dt * 60 * (dx > 0 ? 1 : -1);
    if (Math.random() < 0.5) spawn(hx + rand(-14,14), hy + rand(-14,14), 1, 'dust');
  } else if (tool === 'magnet'){
    const f = 2600 / d;
    body.vx -= (dx/d) * f * dt * 60;
    body.vy -= (dy/d) * f * dt * 60;
    body.vx *= 0.94; body.vy *= 0.94;
    if (Math.random() < 0.3) spawn(hx + rand(-10,10), hy + rand(-10,10), 1, 'spark');
  }
}

/* ---------------- bombs ---------------- */
const bombs = [];

function updateBombs(dt){
  for (let i = bombs.length - 1; i >= 0; i--){
    const b = bombs[i];
    b.t -= dt;
    if (b.t <= 0){
      const dx = body.x - b.x, dy = body.y - b.y;
      const d = Math.max(30, Math.hypot(dx, dy));
      if (d < 340){
        const f = 260000 / (d * d);
        const power = clamp(f / 60, 0.6, 3.4);
        impulse(b.x, b.y, (dx/d) * f, (dy/d) * f - 300);
        shake = 22;
        const coins = award(power);
        spawn(body.x, body.y - 30, 8, 'coin');
        $('tip').textContent = '+' + coins + ' coins from the blast';
      }
      spawn(b.x, b.y, 34, 'star');
      spawn(b.x, b.y, 18, 'dust');
      sfx('boom');
      flash();
      bombs.splice(i, 1);
    }
  }
}

/* ---------------- physics ---------------- */
function physics(dt){
  body.vy += GRAV * dt;

  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.a += body.va * dt;

  // air drag
  body.vx *= 0.995;
  body.vy *= 0.999;
  body.va *= 0.988;

  // floor
  if (body.y > ground - body.r){
    body.y = ground - body.r;
    if (body.vy > 0){
      if (Math.abs(body.vy) > 90){
        body.vy = -body.vy * 0.44;
        body.va += rand(-3.4, 3.4);
        body.squash = Math.min(1, body.squash + 0.55);
        if (Math.abs(body.vy) > 160) sfx('thud', clamp(Math.abs(body.vy)/900, .15, 1));
        spawn(body.x, ground, 7, 'dust');
      } else body.vy = 0;
    }
    body.vx *= 0.90;
    body.va *= 0.90;
  }

  // walls
  const pad = 56;
  if (body.x < pad){ body.x = pad; body.vx = Math.abs(body.vx) * 0.55; body.va += 2.6; sfx('thud', .3); }
  if (body.x > W - pad){ body.x = W - pad; body.vx = -Math.abs(body.vx) * 0.55; body.va -= 2.6; sfx('thud', .3); }
  if (body.y < 60){ body.y = 60; body.vy = Math.abs(body.vy) * 0.5; }

  // settle upright when he has stopped being thrown around
  const still = Math.abs(body.vx) < 24 && Math.abs(body.vy) < 24 && Math.abs(body.va) < 1.2;
  if (still && body.y > ground - body.r - 3){
    const target = Math.round(body.a / (Math.PI * 2)) * Math.PI * 2;
    body.a += (target - body.a) * Math.min(1, dt * 3.2);
    body.va *= 0.82;
  }

  body.squash *= Math.pow(0.0025, dt);
  shake *= Math.pow(0.0009, dt);
  if (shake < 0.4) shake = 0;
}

function updateBits(dt){
  for (let i = bits.length - 1; i >= 0; i--){
    const b = bits[i];
    b.vy += 1500 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot += b.vr * dt;
    b.life -= dt * (b.kind === 'coin' ? 0.9 : 1.7);
    if (b.y > ground + 30 || b.life <= 0) bits.splice(i, 1);
  }
}

/* ---------------- drawing ---------------- */
function drawScene(){
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  if (shake > 0.4) ctx.translate(rand(-shake, shake), rand(-shake, shake));

  drawRoom();
  drawCharacter();
  drawBombs();
  drawBits();

  ctx.restore();
}

function drawRoom(){
  // floor
  const g = ctx.createLinearGradient(0, ground - 30, 0, H);
  g.addColorStop(0, 'rgba(72,176,255,.10)');
  g.addColorStop(1, 'rgba(10,17,29,.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, ground, W, H - ground);

  ctx.strokeStyle = 'rgba(140,180,255,.30)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(W, ground); ctx.stroke();

  // soft contact shadow
  const h = clamp(1 - (ground - body.r - body.y) / 320, 0.12, 1);
  ctx.save();
  ctx.globalAlpha = 0.32 * h;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(body.x, ground + 6, 66 * h, 12 * h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function capsule(x1, y1, x2, y2, r, fill){
  ctx.strokeStyle = fill;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawCharacter(){
  const sq = body.squash;
  const sx = 1 + sq * 0.16, sy = 1 - sq * 0.16;

  // limbs lag behind the spin, which reads as floppy
  const swing = clamp(body.va * 0.10, -0.9, 0.9);
  const drift = clamp(body.vx * 0.0016, -0.7, 0.7);

  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.a);
  ctx.scale(sx, sy);

  const SKIN = '#F0C9A4', SHIRT = '#48B0FF', SHIRT2 = '#2F86C9', SHORTS = '#26354F';

  // legs
  capsule(-16, 40, -22 + drift*26, 96 + Math.cos(swing)*10, 11, SHORTS);
  capsule( 16, 40,  22 + drift*26, 96 - Math.cos(swing)*10, 11, SHORTS);
  capsule(-22 + drift*26, 96 + Math.cos(swing)*10, -26 + drift*30, 112, 8, SKIN);
  capsule( 22 + drift*26, 96 - Math.cos(swing)*10,  26 + drift*30, 112, 8, SKIN);

  // arms
  capsule(-26, -12, -58 - swing*30, 26 + swing*22, 10, SHIRT2);
  capsule( 26, -12,  58 - swing*30, 26 - swing*22, 10, SHIRT2);
  capsule(-58 - swing*30, 26 + swing*22, -68 - swing*34, 40 + swing*20, 8.5, SKIN);
  capsule( 58 - swing*30, 26 - swing*22,  68 - swing*34, 40 - swing*20, 8.5, SKIN);

  // torso
  ctx.fillStyle = SHIRT;
  roundRect(-30, -20, 60, 68, 20);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  roundRect(-30, -20, 60, 20, 12);
  ctx.fill();

  // neck
  capsule(0, -22, 0, -34, 9, SKIN);

  // head
  const R = 54;
  if (headReady && !headBroken){
    ctx.drawImage(head, -R, -34 - R * 2 + 8, R * 2, R * 2);
  } else {
    ctx.fillStyle = '#F3D3B3';
    ctx.beginPath(); ctx.arc(0, -34 - R + 8, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#12202F'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#12202F';
    ctx.beginPath(); ctx.arc(-17, -46 - R + 8, 5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc( 17, -46 - R + 8, 5, 0, 7); ctx.fill();
  }

  ctx.restore();
}

function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function drawBombs(){
  bombs.forEach(b => {
    const pulse = 1 + Math.sin(b.t * 26) * 0.14;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#1B2333';
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FF6B5A'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#FFC53D';
    ctx.beginPath(); ctx.arc(9, -15, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

function drawBits(){
  bits.forEach(b => {
    ctx.save();
    ctx.globalAlpha = clamp(b.life, 0, 1);
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    if (b.kind === 'coin'){
      ctx.fillStyle = '#FFC53D';
      ctx.beginPath(); ctx.ellipse(0, 0, b.size, b.size * 0.78, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.ellipse(0, 0, b.size*0.42, b.size*0.5, 0, 0, Math.PI*2); ctx.fill();
    } else if (b.kind === 'star'){
      ctx.fillStyle = '#FFE49A';
      star(b.size * 1.5);
    } else if (b.kind === 'spark'){
      ctx.fillStyle = '#8BE0FF';
      ctx.fillRect(-b.size/2, -1.5, b.size, 3);
    } else {
      ctx.fillStyle = 'rgba(190,210,240,.55)';
      ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
}

function star(r){
  ctx.beginPath();
  for (let i = 0; i < 10; i++){
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/* ---------------- loop ----------------
   dt is clamped so a backgrounded tab doesn't return and teleport him
   through the floor on the first frame. */
let last = performance.now();

function frame(now){
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  holdForces(dt);
  updateBombs(dt);
  physics(dt);
  updateBits(dt);
  drawScene();

  if (combo > 1 && now > comboUntil){ combo = 0; paintCombo(); }

  requestAnimationFrame(frame);
}

/* ---------------- chrome ---------------- */
$('resetBtn').onclick = () => {
  resetBody();
  bits.length = 0; bombs.length = 0; shake = 0;
  sfx('boing');
  $('tip').textContent = 'Back on his feet.';
};

$('soundBtn').onclick = () => {
  S.sound = !S.sound;
  $('soundBtn').classList.toggle('off', !S.sound);
  save();
  if (S.sound) sfx('click');
};

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

/* ---------------- go ---------------- */
load();
$('soundBtn').classList.toggle('off', !S.sound);
resize();
resetBody();
buildTools();
requestAnimationFrame(frame);

})();
