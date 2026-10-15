import './style.css';
import { Sim, M, MATS, W, H } from './sim';
import { LEVELS, SANDBOX, Level } from './levels';

const SCALE = 6;
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>('#view');
canvas.width = W * SCALE; canvas.height = H * SCALE;
const ctx = canvas.getContext('2d')!;
const off = document.createElement('canvas'); off.width = W; off.height = H;
const octx = off.getContext('2d')!;
const img = octx.createImageData(W, H);
const px = new Uint32Array(img.data.buffer);

const sim = new Sim();
let level: Level = LEVELS[0];
let ink = 0, heaters = 0, coolers = 0;
let flowing = false, won = false, speed = 1, paused = false;
let emitted: number[] = [];
let progress: number[] = [];
let tool = M.PWALL as number;
let sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
const saveKey = 'shizuku-alchemy-v1';
const stars: Record<string, number> = JSON.parse(localStorage.getItem(saveKey) || '{}');

// ---- 音 ----
let ac: AudioContext | null = null;
function blip(freq: number, dur = 0.06, type: OscillatorType = 'sine', vol = 0.05) {
  try {
    ac ??= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  } catch { /* 無音 */ }
}

// ---- レベル ----
function loadLevel(l: Level, keepBuild = false) {
  const saved: [number, number][] = [];
  if (keepBuild) for (let i = 0; i < sim.t.length; i++) { const m = sim.t[i]; if (m === M.PWALL || m === M.HEATER || m === M.COOLER) saved.push([i, m]); }
  else { ink = l.ink; heaters = l.heaters; coolers = l.coolers; }
  level = l; sim.clear(); l.build(sim);
  for (const [i, m] of saved) { sim.t[i] = m; sim.temp[i] = MATS[m].temp; }
  emitted = l.sources.map(() => 0); progress = l.goals.map(() => 0);
  flowing = l === SANDBOX; won = false; paused = false;
  tool = M.PWALL;
  $('#title').textContent = l.title;
  $('#story').textContent = l.story;
  $('#hint').textContent = '💡 ' + l.hint;
  $('#win').classList.add('hidden');
  buildTools(); updateHud();
}

function buildTools() {
  const box = $('#tools'); box.innerHTML = '';
  const sandbox = level === SANDBOX;
  const list: [number, string][] = sandbox
    ? [[M.WATER, '1'], [M.OIL, '2'], [M.LAVA, '3'], [M.MERCURY, '4'], [M.HYDROGEN, '5'], [M.ICE, '6'], [M.PWALL, '7'], [M.HEATER, '8'], [M.COOLER, '9'], [M.EMPTY, '0']]
    : [[M.PWALL, '1'], [M.EMPTY, '2'], ...(level.heaters ? [[M.HEATER, '3'] as [number, string]] : []), ...(level.coolers ? [[M.COOLER, '4'] as [number, string]] : [])];
  for (const [m, key] of list) {
    const b = document.createElement('button');
    b.className = 'tool' + (m === tool ? ' on' : '');
    const c = MATS[m].color;
    b.innerHTML = `<span class="sw" style="background:rgb(${c})"></span>${m === M.EMPTY ? '消しゴム' : MATS[m].name}<kbd>${key}</kbd>`;
    b.onclick = () => { tool = m; buildTools(); blip(660); };
    b.dataset.key = key;
    box.appendChild(b);
  }
}

function updateHud() {
  const inf = (v: number) => (v === Infinity ? '∞' : String(v));
  $('#ink').textContent = inf(ink);
  const pct = level.ink === Infinity ? 100 : (ink / level.ink) * 100;
  ($('#inkbar') as HTMLElement).style.width = pct + '%';
  $('#devs').textContent = `🔥 ${inf(heaters)}　❄ ${inf(coolers)}`;
  const g = $('#goals'); g.innerHTML = '';
  level.goals.forEach((go, k) => {
    const p = Math.min(1, progress[k] / go.need);
    g.insertAdjacentHTML('beforeend', `<div class="goal"><div>${go.mode === 'absorb' ? '壺に' : '枠を'}${go.label}　${Math.min(progress[k], go.need)} / ${go.need}</div><div class="bar"><i style="width:${p * 100}%"></i></div></div>`);
  });
  const left = level.sources.reduce((a, s, k) => a + Math.max(0, s.total - emitted[k]), 0);
  $('#flow').textContent = level === SANDBOX ? '' : flowing ? `残り湧出量 ${left}` : 'Space で放水開始';
  $('#go').textContent = flowing ? (paused ? '▶ 再開' : '⏸ 一時停止') : '💧 放水開始';
  renderSelect();
}

function renderSelect() {
  const sel = $('#levels');
  if (sel.childElementCount) { [...sel.children].forEach((b, k) => { const l = k < LEVELS.length ? LEVELS[k] : SANDBOX; (b as HTMLElement).classList.toggle('on', l === level); b.querySelector('.st')!.textContent = l === SANDBOX ? '🧪' : '★'.repeat(stars[l.id] || 0) + '☆'.repeat(3 - (stars[l.id] || 0)); }); return; }
  [...LEVELS, SANDBOX].forEach((l) => {
    const b = document.createElement('button'); b.className = 'lv';
    b.innerHTML = `<span>${l.title}</span><span class="st"></span>`;
    b.onclick = () => { loadLevel(l); blip(520); };
    sel.appendChild(b);
  });
  renderSelect();
}

// ---- 入力 ----
let drawing = false, erasing = false, last: [number, number] | null = null;
function cellAt(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H)];
}
function applyAt(x: number, y: number) {
  const m = erasing ? M.EMPTY : tool;
  const sandbox = level === SANDBOX;
  if (m === M.HEATER || m === M.COOLER) {
    if (drawing && last) return; // 1クリック1個
    if (m === M.HEATER ? heaters <= 0 : coolers <= 0) { toast('もう置けない！'); return; }
    let ok = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = sim.get(x + i, y + j); if (o !== M.WALL && o !== M.HEATER && o !== M.COOLER) { sim.set(x + i, y + j, m); ok++; } }
    if (ok) { if (m === M.HEATER) heaters--; else coolers--; blip(m === M.HEATER ? 300 : 900, 0.12, 'triangle'); }
    return;
  }
  const r = sandbox && m !== M.PWALL ? 3 : m === M.EMPTY ? 2 : 1;
  const lo = m === M.PWALL ? 0 : -r + 1, hi = m === M.PWALL ? 2 : r;
  for (let j = lo; j < hi; j++) for (let i = lo; i < hi; i++) {
    const cx = x + i, cy = y + j, o = sim.get(cx, cy);
    if (o === M.WALL) continue;
    if (m === M.EMPTY) {
      if (o === M.PWALL) { sim.set(cx, cy, M.EMPTY); ink++; }
      else if (o === M.HEATER || o === M.COOLER) { sim.set(cx, cy, M.EMPTY); refundDevice(o, cx, cy); }
      else if (sandbox) sim.set(cx, cy, M.EMPTY);
    } else if (m === M.PWALL) {
      if (o === M.EMPTY && ink > 0) { sim.set(cx, cy, M.PWALL); ink--; }
    } else if (sandbox && o === M.EMPTY && Math.random() < 0.6) sim.set(cx, cy, m);
  }
}
const devCells = { [M.HEATER]: 0, [M.COOLER]: 0 } as Record<number, number>;
function refundDevice(o: number, _x: number, _y: number) {
  devCells[o]++;
  if (devCells[o] >= 9) { devCells[o] = 0; if (o === M.HEATER) heaters++; else coolers++; }
}
function line(a: [number, number], b: [number, number]) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  for (let k = 1; k <= n; k++) applyAt(Math.round(a[0] + ((b[0] - a[0]) * k) / n), Math.round(a[1] + ((b[1] - a[1]) * k) / n));
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  erasing = e.button === 2 || tool === M.EMPTY;
  const c = cellAt(e); last = null; drawing = true; applyAt(...c); last = c; updateHud();
});
canvas.addEventListener('pointermove', (e) => {
  const c = cellAt(e); hover = c;
  if (!drawing || !last) return;
  line(last, c); last = c; updateHud();
});
let hover: [number, number] = [-1, -1];
window.addEventListener('pointerup', () => { drawing = false; last = null; });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); toggleFlow(); return; }
  if (e.key === 'r') { loadLevel(level, true); return; }
  const b = document.querySelector<HTMLButtonElement>(`.tool[data-key="${e.key}"]`);
  b?.click();
});
function toggleFlow() {
  if (!flowing) { flowing = true; blip(440, 0.2, 'triangle'); } else paused = !paused;
  updateHud();
}
$('#go').onclick = toggleFlow;
$('#retry').onclick = () => loadLevel(level, true);
$('#wipe').onclick = () => loadLevel(level);
$('#speed').onclick = () => { speed = speed === 3 ? 1 : speed + 1; $('#speed').textContent = `⏩ ${speed}x`; };
$('#next').onclick = () => { const k = LEVELS.indexOf(level); loadLevel(LEVELS[k + 1] ?? SANDBOX); };
$('#again').onclick = () => loadLevel(level);

let toastT = 0;
function toast(s: string) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('show'), 1400); }

// ---- ゲーム進行 ----
function tick() {
  if (flowing && !won) {
    level.sources.forEach((s, k) => {
      for (let n = 0; n < s.rate && emitted[k] < s.total; n++) {
        const x = s.x + ((Math.random() * 5) | 0) - 2;
        if (sim.get(x, s.y) === M.EMPTY) { sim.set(x, s.y, s.mats[(emitted[k]) % s.mats.length]); emitted[k]++; }
      }
    });
  }
  sim.step();
  for (const d of level.drains) for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) { const i = y * W + x; const m = sim.t[i]; if (m !== M.WALL && m !== M.PWALL) sim.t[i] = M.EMPTY; }
  let changed = false;
  level.goals.forEach((g, k) => {
    if (g.mode === 'absorb') {
      for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) {
        const i = y * W + x;
        if (sim.t[i] === g.mat && (y === g.y + g.h - 1 || sim.t[i + W] !== M.EMPTY)) {
          sim.t[i] = M.EMPTY; progress[k]++; changed = true;
          if (Math.random() < 0.3) sparks.push({ x: x * SCALE, y: y * SCALE, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3 - 1, life: 40, c: `rgb(${MATS[g.mat].color})` });
          if (progress[k] % 20 === 0) blip(500 + Math.min(progress[k] / g.need, 1) * 700, 0.05);
        }
      }
    } else {
      let c = 0;
      for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) if (sim.t[y * W + x] === g.mat) c++;
      if (c !== progress[k]) { progress[k] = c; changed = true; }
    }
  });
  if (changed || (flowing && sim.frame % 15 === 0)) updateHud();
  if (!won && level.goals.length && level.goals.every((g, k) => progress[k] >= g.need)) win();
}

function win() {
  won = true;
  const used = 1 - ink / level.ink;
  const s = used <= 0.5 ? 3 : used <= 0.8 ? 2 : 1;
  stars[level.id] = Math.max(stars[level.id] || 0, s);
  localStorage.setItem(saveKey, JSON.stringify(stars));
  $('#winstars').textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
  $('#winmsg').textContent = `インク使用率 ${Math.round(used * 100)}%　${s === 3 ? '見事な錬金術！' : s === 2 ? 'いい流れ！' : 'クリア！もっと少ない壁で挑戦しよう'}`;
  $('#win').classList.remove('hidden');
  [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => blip(f, 0.25, 'triangle', 0.08), k * 110));
  for (let k = 0; k < 120; k++) sparks.push({ x: canvas.width / 2, y: canvas.height / 2, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.8) * 12, life: 90, c: `hsl(${Math.random() * 360} 90% 65%)` });
  updateHud();
}

// ---- 描画 ----
function draw() {
  const t = sim.t, tp = sim.temp, nz = sim.noise, f = performance.now() / 300;
  for (let i = 0; i < t.length; i++) {
    const m = t[i]; const c = MATS[m].color; let r = c[0], g = c[1], b = c[2];
    if (m !== M.EMPTY) {
      const n = nz[i] - 12; r += n; g += n; b += n;
      if (m === M.WATER || m === M.MERCURY) { const s = Math.sin(f + (i % W) * 0.3 + nz[i] * 0.1) * 10; r += s; g += s; b += s; }
      if (m === M.LAVA) { const s = Math.sin(f * 2 + nz[i]) * 30; g += s; }
    }
    const T = tp[i];
    if (m !== M.HEATER && m !== M.COOLER) {
      if (T > 60) { const k = Math.min((T - 60) / 600, 1) * 0.6; r += (255 - r) * k; g *= 1 - k * 0.5; b *= 1 - k; }
      else if (T < 5) { const k = Math.min((5 - T) / 40, 1) * 0.5; r *= 1 - k; b += (255 - b) * k; }
    }
    px[i] = 0xff000000 | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r);
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  // 奈落
  ctx.fillStyle = 'rgba(255,40,80,0.35)';
  for (const d of level.drains) ctx.fillRect(d.x * SCALE, d.y * SCALE, d.w * SCALE, d.h * SCALE);
  // ゴール
  level.goals.forEach((g, k) => {
    const done = progress[k] >= g.need;
    ctx.save(); ctx.setLineDash([6, 4]); ctx.lineDashOffset = -performance.now() / 40;
    ctx.strokeStyle = done ? '#7dffa8' : '#ffe36e'; ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
    ctx.strokeRect(g.x * SCALE, g.y * SCALE, g.w * SCALE, g.h * SCALE);
    ctx.restore();
    ctx.fillStyle = done ? '#7dffa8' : '#ffe36e'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${done ? '✔' : '◎'} ${g.label} ${Math.min(100, Math.floor((progress[k] / g.need) * 100))}%`, g.x * SCALE, g.y * SCALE - 6);
  });
  // 湧き口
  level.sources.forEach((s, k) => {
    const alive = emitted[k] < s.total;
    ctx.fillStyle = alive ? `rgb(${MATS[s.mats[0]].color})` : '#555';
    ctx.beginPath(); ctx.arc(s.x * SCALE, (s.y - 2) * SCALE, 7 + (flowing && alive ? Math.sin(performance.now() / 120) * 2 : 0), 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff8'; ctx.stroke();
  });
  // カーソル
  if (hover[0] >= 0) {
    ctx.strokeStyle = '#ffffff88'; const r = tool === M.HEATER || tool === M.COOLER ? 1.5 : 1;
    ctx.strokeRect((hover[0] - r + 0.5) * SCALE, (hover[1] - r + 0.5) * SCALE, r * 2 * SCALE, r * 2 * SCALE);
  }
  // 火花
  sparks = sparks.filter((p) => p.life-- > 0);
  for (const p of sparks) { p.x += p.vx; p.y += p.vy; p.vy += 0.25; ctx.globalAlpha = p.life / 90 + 0.2; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 4, 4); }
  ctx.globalAlpha = 1;
}
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

let acc = 0, prev = performance.now(), fpsT = 0, frames = 0;
function loop(now: number) {
  acc += Math.min(now - prev, 100); prev = now;
  while (acc >= 1000 / 60) { if (!paused) for (let s = 0; s < speed; s++) tick(); acc -= 1000 / 60; }
  draw();
  frames++; if (now - fpsT > 1000) { $('#fps').textContent = `${frames} fps`; frames = 0; fpsT = now; }
  requestAnimationFrame(loop);
}
loadLevel(LEVELS[0]);
requestAnimationFrame(loop);
(window as unknown as { __game: unknown }).__game = { sim, loadLevel, LEVELS, toggleFlow };
