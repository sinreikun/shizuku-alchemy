import './style.css';
import { M, MATS } from './sim';
import { Game, Tool, Level, DEVICE_MAT, starThresholds } from './game';
import { LEVELS, SANDBOX, CHAPTERS } from './levels';
import { loadBrush, saveBrush, clampBrush, brushLabel } from './prefs';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const SAVE = 'shizuku-alchemy-v2';
interface Progress { stars: Record<string, number>; learned: string[]; last: string }
const prog: Progress = { stars: {}, learned: [], last: 'l1', ...JSON.parse(localStorage.getItem(SAVE) || '{}') };
const saveProg = () => localStorage.setItem(SAVE, JSON.stringify(prog));

// ---------- ツール定義 ----------
interface ToolDef { tool: Tool; name: string; desc: string; color: string; cat: string; learnAt?: string; key?: string }
const css = (m: number) => `rgb(${MATS[m].color.join(',')})`;
const matTool = (m: number, learnAt: string): ToolDef => ({ tool: `mat:${m}`, name: MATS[m].name, desc: MATS[m].desc, color: css(m), cat: MATS[m].cat, learnAt });
const TOOLS: ToolDef[] = [
  { tool: 'wall', name: '壁', desc: '流体を止める壁を描く。', color: css(M.PWALL), cat: '基本', learnAt: 'l1' },
  { tool: 'erase', name: '消しゴム', desc: '置いたものを消す（右ドラッグでも可）。', color: '#333a55', cat: '基本', learnAt: 'l1' },
  { tool: 'heater', name: 'ヒーター', desc: MATS[M.HEATER].desc, color: css(M.HEATER), cat: '装置', learnAt: 'l2' },
  { tool: 'cooler', name: 'クーラー', desc: MATS[M.COOLER].desc, color: css(M.COOLER), cat: '装置', learnAt: 'l2' },
  { tool: 'igniter', name: '着火器', desc: MATS[M.IGNITER].desc, color: css(M.IGNITER), cat: '装置', learnAt: 'l8' },
  { tool: 'pump', name: 'ポンプ', desc: '2回クリックで吸込口→吐出口。壁を越えて流体を運ぶ配管。', color: '#9dffb8', cat: '装置', learnAt: 'l9' },
  { tool: 'filter', name: '選択膜', desc: '指定した物質だけを通す膜。下の欄で通す物質を選ぶ。', color: css(M.FILTER), cat: '装置', learnAt: 'l10' },
  { tool: 'electro', name: '電解槽', desc: MATS[M.ELECTRO].desc, color: css(M.ELECTRO), cat: '装置', learnAt: 'l11' },
  matTool(M.WATER, 'l1'), matTool(M.OIL, 'l4'), matTool(M.MERCURY, 'l5'), matTool(M.LAVA, 'l3'), matTool(M.BRINE, 'l6'),
  matTool(M.STEAM, 'l2'), matTool(M.HYDROGEN, 'l11'), matTool(M.OXYGEN, 'l8'), matTool(M.NITROGEN, 'l8'), matTool(M.CO2, 'l8'), matTool(M.SMOKE, 'l8'), matTool(M.HGVAPOR, 'l5'), matTool(M.FIRE, 'l8'),
  { tool: 'air', name: '空気', desc: '酸素23%・窒素77%の有限量の混合気体を置く。', color: '#5d6fa8', cat: '気体', learnAt: 'l8' },
  matTool(M.SALT, 'l6'), matTool(M.SAND, 'l3'), matTool(M.ROCK, 'l3'), matTool(M.SOOT, 'l8'),
  matTool(M.ICE, 'l2'), matTool(M.GLASS, 'l3'),
];
const CATS = ['基本', '液体', '気体', '粉体', '固体', '装置'];

// ---------- 状態 ----------
let game: Game;
let level: Level;
let tool: Tool = 'wall';
let speed = 1, paused = false, viewMode: 'mat' | 'temp' = 'mat', glow = true;
let briefOpen = true;

const canvas = $<HTMLCanvasElement>('#view');
const ctx = canvas.getContext('2d')!;
const off = document.createElement('canvas');
const octx = off.getContext('2d')!;
const glowC = document.createElement('canvas');
const gctx = glowC.getContext('2d')!;
let img: ImageData, px: Uint32Array, gimg: ImageData, gpx: Uint32Array;

const cam = { s: 6, x: 0, y: 0 };
let dpr = 1;

// ---------- 音 ----------
let ac: AudioContext | null = null;
function blip(freq: number, dur = 0.06, type: OscillatorType = 'sine', vol = 0.04) {
  try {
    ac ??= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  } catch { /* 無音 */ }
}

// ---------- 粒子 ----------
interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; size: number; g: number }
let parts: P[] = [];
const addP = (p: Partial<P> & { x: number; y: number }) => parts.length < 900 && parts.push({ vx: 0, vy: 0, life: 40, max: 40, c: '#fff', size: 0.6, g: 0.02, ...p });

// ---------- 画面切替 ----------
function showMenu() {
  $('#menu').classList.remove('hidden'); $('#play').classList.add('hidden');
  renderMenu();
}
function renderMenu() {
  const total = LEVELS.length * 3, got = LEVELS.reduce((a, l) => a + (prog.stars[l.id] || 0), 0);
  const cleared = LEVELS.filter((l) => prog.stars[l.id]).length;
  $('#overall').innerHTML = `<div class="ring" style="--p:${(cleared / LEVELS.length) * 100}"><span>${cleared}/${LEVELS.length}</span></div><div><b>★ ${got} / ${total}</b><br><span class="muted">習得した道具 ${new Set(prog.learned).size} 種 ・ 自由実験室はいつでも全機能を使えます</span></div>`;
  const next = LEVELS.find((l) => !prog.stars[l.id]) ?? LEVELS[LEVELS.length - 1];
  $('#continue').textContent = prog.stars.l1 ? `▶ 続きから：${next.title}` : '▶ はじめる';
  $('#continue').onclick = () => startLevel(next);
  const box = $('#chapters'); box.innerHTML = '';
  CHAPTERS.forEach((ch) => {
    const lv = LEVELS.filter((l) => l.chapter === ch.id);
    const el = document.createElement('div'); el.className = 'chapter'; el.style.setProperty('--c', ch.color);
    el.innerHTML = `<h3>${ch.name}</h3>`;
    const row = document.createElement('div'); row.className = 'cards';
    lv.forEach((l) => {
      const n = LEVELS.indexOf(l) + 1, st = prog.stars[l.id] || 0;
      const b = document.createElement('button'); b.className = 'card-lv' + (st ? ' done' : '');
      b.innerHTML = `<span class="num">${n}</span><span class="nm">${l.title}</span><span class="lrn">📘 ${l.learn}</span><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
      b.onclick = () => startLevel(l);
      row.appendChild(b);
    });
    el.appendChild(row); box.appendChild(el);
  });
  const lab = document.createElement('div'); lab.className = 'chapter lab'; lab.style.setProperty('--c', '#ff7ad9');
  lab.innerHTML = `<h3>自由実験室</h3><button class="card-lv wide"><span class="num">🧪</span><span class="nm">すべての物質・装置で自由に実験</span><span class="lrn">27種類の物質、7種類の装置、ポンプ配管、保存と書き出し</span></button>`;
  lab.querySelector('button')!.addEventListener('click', () => startLevel(SANDBOX));
  box.appendChild(lab);
}

function startLevel(l: Level) {
  level = l;
  const sandbox = l === SANDBOX;
  game = new Game(l, sandbox, (Math.random() * 1e9) | 0);
  game.onAbsorb = (x, y, m) => { if (Math.random() < 0.35) addP({ x: x + 0.5, y: y + 0.5, vx: (Math.random() - 0.5) * 0.6, vy: -Math.random() * 0.8 - 0.3, c: css(m), life: 45, max: 45, size: 0.8, g: 0.03 }); if (Math.random() < 0.05) blip(700 + Math.random() * 500, 0.04); };
  if (!sandbox) prog.last = l.id;
  saveProg();
  off.width = glowC.width = game.sim.w; off.height = glowC.height = game.sim.h;
  img = octx.createImageData(game.sim.w, game.sim.h); px = new Uint32Array(img.data.buffer);
  gimg = gctx.createImageData(game.sim.w, game.sim.h); gpx = new Uint32Array(gimg.data.buffer);
  tool = sandbox ? 'mat:3' : 'wall';
  paused = false; parts = [];
  $('#menu').classList.add('hidden'); $('#play').classList.remove('hidden');
  $('#win').classList.add('hidden');
  const ch = CHAPTERS.find((c) => c.id === l.chapter);
  $('#chap').textContent = sandbox ? 'LAB' : `${ch?.name.split('　')[0]} ・ ${LEVELS.indexOf(l) + 1}`;
  $('#chap').style.setProperty('--c', ch?.color ?? '#ff7ad9');
  $('#title').textContent = l.title;
  $('#story').textContent = l.story; $('#hint').textContent = '💡 ' + l.hint;
  briefOpen = true; $('#brief').classList.remove('hidden');
  $('#labBox').style.display = sandbox ? '' : 'none';
  $('#goalsBox').style.display = sandbox ? 'none' : '';
  $('#invBox').style.display = sandbox ? 'none' : '';
  $('#scoreBox').style.display = sandbox ? 'none' : '';
  $('#step').style.display = '';
  setBrush(loadBrush());
  resize(); fit();
  buildPalette(); hud();
}

// ---------- パレット ----------
function availableTools(): ToolDef[] {
  if (level === SANDBOX) return TOOLS;
  const inv = level.inv;
  const list: ToolDef[] = [];
  const pick = (t: Tool) => TOOLS.find((d) => d.tool === t)!;
  if (inv.ink) list.push(pick('wall'));
  list.push(pick('erase'));
  for (const k of ['heater', 'cooler', 'igniter', 'electro', 'pump', 'filter'] as const) if (inv[k]) list.push(pick(k));
  return list;
}
function buildPalette() {
  const box = $('#palette'); box.innerHTML = '';
  const tools = availableTools();
  let key = 1;
  const sandbox = level === SANDBOX;
  const learned = new Set(prog.learned);
  for (const cat of CATS) {
    const ts = tools.filter((t) => t.cat === cat);
    if (!ts.length) continue;
    if (sandbox) box.insertAdjacentHTML('beforeend', `<h4>${cat}</h4>`);
    const grid = document.createElement('div'); grid.className = 'tools';
    for (const t of ts) {
      const b = document.createElement('button');
      b.className = 'tool' + (t.tool === tool ? ' on' : '');
      const k = key <= 10 ? String(key % 10) : '';
      if (k) t.key = k; key++;
      const isNew = sandbox && t.learnAt && !learned.has(t.learnAt);
      b.innerHTML = `<span class="sw" style="--sw:${t.color}"></span><span class="tn">${t.name}</span>${k ? `<kbd>${k}</kbd>` : ''}${isNew ? '<i class="lock" title="チュートリアル未修了">🔰</i>' : ''}`;
      b.dataset.tool = t.tool;
      b.onclick = () => { tool = t.tool; game.pendingPump = null; buildPalette(); blip(660, 0.03); };
      b.onmouseenter = (e) => showTip(e.currentTarget as HTMLElement, `<b>${t.name}</b><br>${t.desc}${isNew ? `<br><span class="muted">🔰 ステージ「${LEVELS.find((l) => l.id === t.learnAt)?.title}」で学べます</span>` : ''}`);
      b.onmouseleave = hideTip;
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
  if (tool === 'filter' || (sandbox && tools.some((t) => t.tool === 'filter'))) {
    const opts = [M.WATER, M.OIL, M.MERCURY, M.BRINE, M.HYDROGEN, M.OXYGEN, M.STEAM, M.CO2];
    if (sandbox || tool === 'filter') {
      box.insertAdjacentHTML('beforeend', `<h4>選択膜が通す物質</h4>`);
      const sel = document.createElement('div'); sel.className = 'fsel';
      for (const m of opts) {
        if (!sandbox && m !== game.filterMat) continue;
        const b = document.createElement('button'); b.className = 'mini' + (game.filterMat === m ? ' on' : '');
        b.innerHTML = `<span class="sw" style="--sw:${css(m)}"></span>${MATS[m].name}`;
        b.onclick = () => { game.filterMat = m; buildPalette(); };
        sel.appendChild(b);
      }
      box.appendChild(sel);
    }
  }
}

// ---------- ツールチップ ----------
const tip = $('#tip');
function showTip(el: HTMLElement, html: string) {
  tip.innerHTML = html; tip.classList.add('show');
  const r = el.getBoundingClientRect();
  let x = r.right + 10, y = r.top;
  if (x + 240 > innerWidth) x = r.left - 250;
  tip.style.left = x + 'px'; tip.style.top = Math.min(y, innerHeight - 100) + 'px';
}
function hideTip() { tip.classList.remove('show'); }

// ---------- HUD ----------
const fmt = (v: number) => (v === Infinity ? '∞' : String(v));
function hud() {
  const g = game;
  const sandbox = level === SANDBOX;
  $('#go').textContent = !g.flowing ? '💧 放水' : paused ? '▶ 再開' : '⏸ 停止';
  ($('#undo') as HTMLButtonElement).disabled = !g.canUndo;
  ($('#redo') as HTMLButtonElement).disabled = !g.canRedo;
  const gl = $('#goals'); gl.innerHTML = '';
  level.goals.forEach((go, k) => {
    const p = Math.min(1, g.progress[k] / go.need);
    const verb = go.mode === 'absorb' ? `壺に${go.label}を集める` : go.mode === 'fill' ? `枠を${go.label}で満たす` : `${go.label}を起こす`;
    gl.insertAdjacentHTML('beforeend', `<div class="goal ${p >= 1 ? 'ok' : ''}"><div class="gl"><span>${p >= 1 ? '✔' : '◎'} ${verb}</span><b>${Math.min(g.progress[k], go.need)}/${go.need}</b></div><div class="bar"><i style="width:${p * 100}%"></i></div></div>`);
  });
  $('#flow').textContent = sandbox ? '' : level.sources.length ? (g.flowing ? `残り湧出量 ${g.sourcesLeft}` : 'Space または「放水」で開始') : (g.flowing ? '稼働中' : '配置したら「放水」で開始');
  const inv = $('#inv'); inv.innerHTML = '';
  const names: [keyof typeof g.inv, string, number][] = [['ink', '壁インク', M.PWALL], ['heater', 'ヒーター', M.HEATER], ['cooler', 'クーラー', M.COOLER], ['igniter', '着火器', M.IGNITER], ['electro', '電解槽', M.ELECTRO], ['filter', '選択膜', M.FILTER], ['pump', 'ポンプ', M.PWALL]];
  for (const [k, n, m] of names) {
    const base = sandbox ? Infinity : level.inv[k] ?? 0;
    if (!base) continue;
    const pct = base === Infinity ? 100 : (g.inv[k] / base) * 100;
    inv.insertAdjacentHTML('beforeend', `<div class="it"><span class="sw" style="--sw:${k === 'pump' ? '#9dffb8' : css(m)}"></span><span>${n}</span><b>${fmt(g.inv[k])}</b><div class="bar thin"><i style="width:${pct}%"></i></div></div>`);
  }
  if (!sandbox) {
    const th = starThresholds(level); const c = g.cost();
    const now = c <= th.three ? 3 : c <= th.two ? 2 : 1;
    $('#score').innerHTML = `<div class="gl"><span>資源コスト</span><b>${c}</b></div>
      <div class="th ${now === 3 ? 'on' : ''}"><span>★★★</span><span>≤ ${th.three}</span></div>
      <div class="th ${now === 2 ? 'on' : ''}"><span>★★☆</span><span>≤ ${th.two}</span></div>
      <div class="th ${now === 1 ? 'on' : ''}"><span>★☆☆</span><span>それ以上</span></div>
      <div class="muted">インク・膜1セル = 1、装置1個 = 40</div>`;
  }
  $('#brushv').textContent = brushLabel(g.brush);
  const bs = $('#brush') as HTMLInputElement; if (bs.value !== String(g.brush)) bs.value = String(g.brush);
}

// ---------- カメラ ----------
function resize() {
  const st = $('#stage'); const r = st.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(r.width * dpr)); canvas.height = Math.max(1, Math.floor(r.height * dpr));
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
}
function fit() {
  if (!game) return;
  const s = Math.min(canvas.width / game.sim.w, canvas.height / game.sim.h) * 0.96;
  cam.s = s; cam.x = (canvas.width - game.sim.w * s) / 2; cam.y = (canvas.height - game.sim.h * s) / 2;
}
function zoomAt(f: number, sx: number, sy: number) {
  const ns = Math.max(1.5, Math.min(60, cam.s * f));
  const k = ns / cam.s;
  cam.x = sx - (sx - cam.x) * k; cam.y = sy - (sy - cam.y) * k; cam.s = ns;
}
const toCell = (cx: number, cy: number): [number, number] => {
  const r = canvas.getBoundingClientRect();
  const x = (cx - r.left) * dpr, y = (cy - r.top) * dpr;
  return [Math.floor((x - cam.x) / cam.s), Math.floor((y - cam.y) / cam.s)];
};

// ---------- 入力 ----------
const pointers = new Map<number, { x: number; y: number }>();
let drawing = false, erasing = false, last: [number, number] | null = null, panning = false, spaceHeld = false, spaceUsed = false;
let pinch: { d: number; cx: number; cy: number } | null = null;
let hover: [number, number] = [-1, -1];

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (briefOpen) closeBrief();
  if (pointers.size === 2) {
    // ピンチ開始：描画を取り消す
    if (drawing) { game.undo(); drawing = false; }
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (e.button === 1 || spaceHeld || (e.button === 0 && e.altKey)) { panning = true; spaceUsed = true; return; }
  erasing = e.button === 2 || tool === 'erase';
  const c = toCell(e.clientX, e.clientY);
  game.pushUndo();
  drawing = true; last = c;
  if (game.apply(tool, c[0], c[1], erasing)) feedback(c);
  if (tool === 'pump') { drawing = false; if (!game.pendingPump) toast('ポンプを設置した'); else toast('吐出口をクリック'); }
  if (tool in DEVICE_MAT) drawing = false;
  hud();
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  hover = toCell(e.clientX, e.clientY);
  inspect();
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const r = canvas.getBoundingClientRect();
    cam.x += (cx - pinch.cx) * dpr; cam.y += (cy - pinch.cy) * dpr;
    zoomAt(d / pinch.d, (cx - r.left) * dpr, (cy - r.top) * dpr);
    pinch = { d, cx, cy };
    return;
  }
  if (panning && prev) { cam.x += (e.clientX - prev.x) * dpr; cam.y += (e.clientY - prev.y) * dpr; return; }
  if (!drawing || !last) return;
  const c = hover;
  if (game.stroke(tool, last[0], last[1], c[0], c[1], erasing)) feedback(c);
  last = c; hud();
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) { drawing = false; panning = false; last = null; }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { hover = [-1, -1]; $('#inspect').classList.remove('show'); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) { setBrush(game.brush + (e.deltaY > 0 ? -1 : 1)); return; }
  const r = canvas.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
}, { passive: false });

let lastSfx = 0;
function feedback(c: [number, number]) {
  const now = performance.now();
  if (now - lastSfx > 45) { blip(erasing ? 220 : 380 + Math.random() * 60, 0.03, 'triangle', 0.025); lastSfx = now; }
  if (Math.random() < 0.4) addP({ x: c[0] + 0.5, y: c[1] + 0.5, vx: (Math.random() - 0.5) * 0.4, vy: -Math.random() * 0.4, c: erasing ? '#8892c0' : '#ffe3a0', life: 18, max: 18, size: 0.5 });
}

function inspect() {
  const el = $('#inspect');
  const [x, y] = hover;
  if (!game || !game.sim.inside(x, y)) { el.classList.remove('show'); return; }
  const i = game.sim.idx(x, y), m = game.sim.t[i];
  el.innerHTML = `<span class="sw" style="--sw:${css(m)}"></span>${m === M.EMPTY ? '空' : MATS[m].name}<span class="muted">　${game.sim.temp[i].toFixed(0)}℃　(${x}, ${y})</span>`;
  el.classList.add('show');
}

window.addEventListener('keydown', (e) => {
  if ($('#play').classList.contains('hidden')) return;
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); if (!spaceHeld) { spaceHeld = true; spaceUsed = false; canvas.classList.add('grab'); } return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  if (e.key === 'Escape') { if (game.pendingPump) { game.pendingPump = null; toast('ポンプ配置を取り消した'); } else showMenu(); return; }
  if (e.key === 'r' || e.key === 'R') { retry(); return; }
  if (e.key === 'f' || e.key === 'F') { fit(); return; }
  if (e.key === '.') { stepOnce(); return; }
  if (e.key === '[' || e.key === ']') { setBrush(game.brush + (e.key === ']' ? 1 : -1)); return; }
  const b = [...document.querySelectorAll<HTMLButtonElement>('.tool')].find((x) => x.querySelector('kbd')?.textContent === e.key);
  b?.click();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { spaceHeld = false; canvas.classList.remove('grab'); if (!spaceUsed && !$('#play').classList.contains('hidden')) toggleFlow(); }
});

function toggleFlow() {
  if (!game.flowing) { game.start(); paused = false; blip(440, 0.18, 'triangle'); blip(660, 0.18, 'triangle'); }
  else paused = !paused;
  hud();
}
function stepOnce() { paused = true; if (!game.flowing) game.start(); game.tick(); hud(); }
function retry() { game.reset(true); parts = []; $('#win').classList.add('hidden'); hud(); toast('配置を残して流し直し'); }
function doUndo() { if (game.undo()) { hud(); blip(300, 0.04); } }
function doRedo() { if (game.redo()) { hud(); blip(500, 0.04); } }
function closeBrief() { briefOpen = false; $('#brief').classList.add('hidden'); }

$('#go').onclick = toggleFlow;
$('#step').onclick = stepOnce;
$('#retry').onclick = retry;
$('#wipe').onclick = () => { game.pushUndo(); game.reset(false); hud(); toast('最初からやり直し'); };
$('#undo').onclick = doUndo; $('#redo').onclick = doRedo;
$('#speed').onclick = () => { speed = speed >= 4 ? 1 : speed + 1; $('#speed').textContent = `${speed}x`; };
$('#back').onclick = showMenu;
$('#openLab').onclick = () => startLevel(SANDBOX);
$('#briefClose').onclick = closeBrief;
$('#zin').onclick = () => zoomAt(1.25, canvas.width / 2, canvas.height / 2);
$('#zout').onclick = () => zoomAt(0.8, canvas.width / 2, canvas.height / 2);
$('#zfit').onclick = fit;
$('#next').onclick = () => { const k = LEVELS.indexOf(level); startLevel(LEVELS[k + 1] ?? SANDBOX); };
$('#again').onclick = () => startLevel(level);
function setBrush(v: number) {
  const b = clampBrush(v);
  if (game) game.brush = b;
  ($('#brush') as HTMLInputElement).value = String(b);
  $('#brushv').textContent = brushLabel(b);
  saveBrush(b);
}
($('#brush') as HTMLInputElement).oninput = (e) => { setBrush(Number((e.target as HTMLInputElement).value)); hud(); };
document.querySelectorAll<HTMLButtonElement>('#viewmode button').forEach((b) => b.onclick = () => {
  const v = b.dataset.v!;
  if (v === 'glow') { glow = !glow; b.classList.toggle('on', !glow); return; }
  viewMode = v as 'mat' | 'temp';
  document.querySelectorAll('#viewmode button[data-v="mat"],#viewmode button[data-v="temp"]').forEach((x) => x.classList.toggle('on', x === b));
});
($('#ambient') as HTMLInputElement).onchange = (e) => { game.sim.ambient = (e.target as HTMLInputElement).checked ? -10 : 20; };

// 実験データの保存・書き出し
function serialize() {
  const s = game.sim;
  const enc = (a: Uint8Array) => { let str = ''; for (let i = 0; i < a.length; i += 8192) str += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(str); };
  return JSON.stringify({ app: 'shizuku-alchemy', v: 2, w: s.w, h: s.h, t: enc(s.t), aux: enc(s.aux), temp: enc(new Uint8Array(s.temp.buffer.slice(0))), pumps: s.pumps });
}
function deserialize(json: string) {
  const d = JSON.parse(json); const s = game.sim;
  if (d.app !== 'shizuku-alchemy' || d.w !== s.w || d.h !== s.h) throw new Error('形式が違います');
  const dec = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  game.pushUndo();
  s.t.set(dec(d.t)); s.aux.set(dec(d.aux)); s.temp.set(new Float32Array(dec(d.temp).buffer)); s.pumps = d.pumps ?? [];
}
$('#save').onclick = () => { try { localStorage.setItem(SAVE + '-lab', serialize()); toast('ブラウザに保存した'); } catch { toast('保存できなかった'); } };
$('#load').onclick = () => { const d = localStorage.getItem(SAVE + '-lab'); if (!d) return toast('保存データがない'); try { deserialize(d); toast('読み込んだ'); } catch (e) { toast(String((e as Error).message)); } };
$('#export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([serialize()], { type: 'application/json' })); a.download = `shizuku-lab-${Date.now()}.json`; a.click(); };
$('#import').onclick = () => $('#file').click();
($('#file') as HTMLInputElement).onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; try { deserialize(await f.text()); toast('読み込んだ'); } catch (err) { toast(String((err as Error).message)); } };

let toastT = 0;
function toast(s: string) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('show'), 1500); }

// ---------- クリア ----------
function onWin() {
  const { cost, three, two, stars } = game.starScore();
  prog.stars[level.id] = Math.max(prog.stars[level.id] || 0, stars);
  if (!prog.learned.includes(level.id)) prog.learned.push(level.id);
  saveProg();
  $('#winstars').innerHTML = [0, 1, 2].map((k) => `<span class="${k < stars ? 'on' : ''}" style="animation-delay:${k * 0.15}s">★</span>`).join('');
  $('#winmsg').textContent = `資源コスト ${cost}（★★★ ≤ ${three} ／ ★★ ≤ ${two}）　${stars === 3 ? '見事な錬金術！' : stars === 2 ? 'いい流れ！' : 'クリア！ 少ない資源で★3を目指そう'}`;
  const newTools = TOOLS.filter((t) => t.learnAt === level.id).map((t) => t.name);
  $('#winlearn').innerHTML = newTools.length ? `🔓 自由実験室で習得：${newTools.join('・')}` : '';
  $('#next').textContent = LEVELS.indexOf(level) === LEVELS.length - 1 ? '自由実験室へ ▶' : '次へ ▶';
  $('#win').classList.remove('hidden');
  [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => blip(f, 0.3, 'triangle', 0.06), k * 110));
  for (let k = 0; k < 160; k++) addP({ x: game.sim.w / 2, y: game.sim.h / 2, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.9) * 2.4, c: `hsl(${Math.random() * 360} 90% 65%)`, life: 110, max: 110, size: 0.9, g: 0.04 });
}

// ---------- 描画 ----------
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
function tempColor(T: number): [number, number, number] {
  if (T < 20) { const k = Math.min(1, (20 - T) / 80); return [20 * (1 - k), 40 + 60 * (1 - k), 90 + 165 * k]; }
  const k = Math.min(1, (T - 20) / 1000);
  return [40 + 215 * Math.min(1, k * 2), 40 + 200 * Math.max(0, k * 2 - 0.6), 60 * (1 - k) + 200 * Math.max(0, k - 0.8) * 5];
}
function paint(now: number) {
  const s = game.sim; const { t, temp: tp, noise: nz, w } = s;
  const wave = now / 280;
  const bg = MATS[M.EMPTY].color;
  for (let i = 0; i < t.length; i++) {
    const m = t[i]; const d = MATS[m]; let r: number, g: number, b: number;
    let gl = 0;
    if (viewMode === 'temp') {
      [r, g, b] = m === M.EMPTY ? [bg[0], bg[1], bg[2]] : tempColor(tp[i]);
      if (m === M.WALL || m === M.PWALL) { r = 50; g = 54; b = 70; }
    } else {
      [r, g, b] = d.color;
      if (m !== M.EMPTY) {
        const n = nz[i] - 12;
        if (d.kind === 'liquid') {
          const x = i % w;
          const sh = Math.sin(wave + x * 0.25 + nz[i] * 0.05) * 8;
          r += sh + n * 0.4; g += sh + n * 0.4; b += sh + n * 0.4;
          // 水面のハイライト
          const up = i >= w ? t[i - w] : M.WALL;
          if (up === M.EMPTY || MATS[up].kind === 'gas') { r += 45; g += 45; b += 45; }
          else if (up !== m) { r -= 10; g -= 10; b -= 10; }
        } else if (d.kind === 'gas') {
          // 気体は背景と半透明に合成
          const a = m === M.FIRE ? 0.95 : 0.35 + nz[i] / 80;
          r = bg[0] + (r - bg[0]) * a + n; g = bg[1] + (g - bg[1]) * a + n; b = bg[2] + (b - bg[2]) * a + n;
          if (m === M.FIRE) { g += Math.sin(wave * 3 + nz[i]) * 40; }
        } else if (m === M.WALL || m === M.PWALL) {
          // 壁のエッジ
          const up = i >= w ? t[i - w] : m;
          const e = up !== M.WALL && up !== M.PWALL ? 30 : 0;
          r += n * 0.5 + e; g += n * 0.5 + e; b += n * 0.5 + e;
        } else if (m === M.FILTER) {
          const c = MATS[s.aux[i]]?.color ?? [255, 255, 255];
          const k = ((i % w) + Math.floor(i / w)) % 3 === 0 ? 1 : 0.35;
          r = c[0] * k + 30; g = c[1] * k + 30; b = c[2] * k + 30;
        } else { r += n; g += n; b += n; }
        if (m === M.LAVA) { g += Math.sin(wave * 1.5 + nz[i]) * 25; }
        // 温度の色づけ
        const T = tp[i];
        if (d.kind !== 'device' && m !== M.WALL && m !== M.PWALL) {
          if (T > 80) { const k = Math.min((T - 80) / 700, 1) * 0.55; r += (255 - r) * k; g *= 1 - k * 0.4; b *= 1 - k; }
          else if (T < 0) { const k = Math.min(-T / 40, 1) * 0.4; r *= 1 - k; b += (255 - b) * k; }
        }
        gl = d.glow ?? 0;
        if (tp[i] > 500 && d.kind !== 'device') gl = Math.max(gl, Math.min(1, (tp[i] - 500) / 700));
        if (d.kind === 'device') { const p = 0.85 + Math.sin(wave * 2) * 0.15; r *= p; g *= p; b *= p; }
      }
    }
    px[i] = 0xff000000 | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r);
    gpx[i] = gl > 0 ? ((clamp(255 * gl) << 24) | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r)) : 0;
  }
  octx.putImageData(img, 0, 0);
  if (glow) gctx.putImageData(gimg, 0, 0);
}

function draw(now: number) {
  const s = game.sim;
  paint(now);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#070914'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  const S = cam.s;
  ctx.shadowColor = '#0008'; ctx.shadowBlur = 30 * dpr;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s.w * S, s.h * S);
  ctx.shadowBlur = 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, s.w * S, s.h * S);
  if (glow && viewMode === 'mat') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${Math.max(2, S * 1.6)}px)`;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glowC, 0, 0, s.w * S, s.h * S);
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // セルのグリッド（拡大時）
  if (S > 14) {
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= s.w; x++) { ctx.moveTo(x * S, 0); ctx.lineTo(x * S, s.h * S); }
    for (let y = 0; y <= s.h; y++) { ctx.moveTo(0, y * S); ctx.lineTo(s.w * S, y * S); }
    ctx.stroke();
  }
  // 奈落
  for (const d of level.drains) {
    const grd = ctx.createLinearGradient(0, d.y * S, 0, (d.y + d.h + 3) * S);
    grd.addColorStop(0, '#ff2d6a88'); grd.addColorStop(1, '#ff2d6a00');
    ctx.fillStyle = grd; ctx.fillRect(d.x * S, (d.y - 1) * S, d.w * S, (d.h + 4) * S);
  }
  // ゴール
  level.goals.forEach((g, k) => {
    if (g.mode === 'stat') return;
    const done = game.progress[k] >= g.need;
    const col = done ? '#7dffa8' : '#ffe36e';
    ctx.save();
    ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr; ctx.shadowColor = col; ctx.shadowBlur = 14 * dpr;
    ctx.strokeRect(g.x * S, g.y * S, g.w * S, g.h * S);
    ctx.fillStyle = col + '14'; ctx.fillRect(g.x * S, g.y * S, g.w * S, g.h * S);
    const p = Math.min(1, game.progress[k] / g.need);
    ctx.fillStyle = col + '30'; ctx.fillRect(g.x * S, (g.y + g.h * (1 - p)) * S, g.w * S, g.h * p * S);
    ctx.restore();
    ctx.font = `bold ${12 * dpr}px system-ui, sans-serif`; ctx.fillStyle = col;
    ctx.fillText(`${done ? '✔' : '◎'} ${g.label} ${Math.floor(p * 100)}%`, g.x * S, g.y * S - 6 * dpr);
  });
  // 湧き口
  level.sources.forEach((src, k) => {
    const alive = game.emitted[k] < src.total;
    const c = alive ? css(src.mats[0]) : '#555';
    const r = (1.6 + (game.flowing && alive ? Math.sin(now / 120) * 0.25 : 0)) * S;
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = alive ? 16 * dpr : 0;
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc((src.x + 0.5) * S, (src.y - 1.5) * S, r, 0, 7); ctx.fill();
    if (src.mats.length > 1) { ctx.fillStyle = css(src.mats[1]); ctx.beginPath(); ctx.arc((src.x + 0.5) * S, (src.y - 1.5) * S, r, 0, Math.PI); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#fff9'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc((src.x + 0.5) * S, (src.y - 1.5) * S, r, 0, 7); ctx.stroke();
  });
  // ポンプ
  const drawPort = (x: number, y: number, c: string, label: string) => {
    ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc((x + 0.5) * S, (y + 0.5) * S, 2.6 * S, 0, 7); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    ctx.font = `bold ${11 * dpr}px system-ui`; ctx.fillStyle = '#fff'; ctx.fillText(label, (x + 3.4) * S, (y + 0.5) * S);
  };
  for (const p of s.pumps) {
    ctx.save();
    ctx.strokeStyle = '#9dffb8aa'; ctx.lineWidth = Math.max(2, S * 0.7); ctx.setLineDash([S * 1.5, S]); ctx.lineDashOffset = -now / 25;
    ctx.beginPath(); ctx.moveTo((p.ax + 0.5) * S, (p.ay + 0.5) * S); ctx.lineTo((p.bx + 0.5) * S, (p.by + 0.5) * S); ctx.stroke();
    ctx.restore();
    drawPort(p.ax, p.ay, '#ff9d5c', '吸'); drawPort(p.bx, p.by, '#5cc8ff', '吐');
  }
  if (game.pendingPump) {
    drawPort(game.pendingPump.x, game.pendingPump.y, '#ff9d5c', '吸');
    if (hover[0] >= 0) { ctx.strokeStyle = '#9dffb866'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo((game.pendingPump.x + 0.5) * S, (game.pendingPump.y + 0.5) * S); ctx.lineTo((hover[0] + 0.5) * S, (hover[1] + 0.5) * S); ctx.stroke(); ctx.setLineDash([]); }
  }
  // 粒子
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--;
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.c; ctx.fillRect((p.x - p.size / 2) * S, (p.y - p.size / 2) * S, p.size * S, p.size * S);
  }
  ctx.globalAlpha = 1;
  parts = parts.filter((p) => p.life > 0);
  // カーソル
  if (hover[0] >= 0 && !panning) {
    const dev = tool in DEVICE_MAT;
    const r = dev ? 1.5 : tool === 'wall' ? (game.brush + 1) / 2 : tool === 'filter' ? 1 : game.brush + 1.5;
    const cx = dev ? hover[0] + 0.5 : tool === 'wall' || tool === 'filter' ? hover[0] + (tool === 'filter' ? 1 : (game.brush + 1) / 2 - (game.brush >> 1)) : hover[0] + 0.5;
    const cy = dev ? hover[1] + 0.5 : tool === 'wall' || tool === 'filter' ? hover[1] + (tool === 'filter' ? 1 : (game.brush + 1) / 2 - (game.brush >> 1)) : hover[1] + 0.5;
    ctx.strokeStyle = tool === 'erase' ? '#ff8a8a' : '#ffffffcc'; ctx.lineWidth = 1.5 * dpr;
    if (dev || tool === 'wall' || tool === 'filter') ctx.strokeRect((cx - r) * S, (cy - r) * S, r * 2 * S, r * 2 * S);
    else { ctx.beginPath(); ctx.arc(cx * S, cy * S, r * S, 0, 7); ctx.stroke(); }
  }
  ctx.restore();
}

// 炎・溶岩から火の粉
function emitAmbient() {
  const s = game.sim;
  for (let k = 0; k < 30; k++) {
    const i = (Math.random() * s.n) | 0; const m = s.t[i];
    if ((m === M.FIRE || m === M.LAVA) && Math.random() < 0.5) {
      const x = i % s.w, y = Math.floor(i / s.w);
      if (s.get(x, y - 1) === M.EMPTY || MATS[s.get(x, y - 1)].kind === 'gas') addP({ x: x + 0.5, y, vx: (Math.random() - 0.5) * 0.15, vy: -Math.random() * 0.25 - 0.05, c: m === M.FIRE ? '#ffd27a' : '#ff8a3a', life: 50, max: 50, size: 0.35, g: -0.002 });
    }
  }
}

// ---------- ループ ----------
let acc = 0, prevT = performance.now(), fpsT = 0, frames = 0, simMs = 0, hudT = 0;
function loop(now: number) {
  if (game && !$('#play').classList.contains('hidden')) {
    acc += Math.min(now - prevT, 100);
    const t0 = performance.now();
    let steps = 0;
    while (acc >= 1000 / 60) {
      if (!paused) for (let k = 0; k < speed && steps < 8; k++, steps++) {
        const wasWon = game.won;
        game.tick();
        if (!wasWon && game.won) onWin();
      }
      acc -= 1000 / 60;
    }
    if (steps) simMs = simMs * 0.9 + ((performance.now() - t0) / steps) * 0.1;
    emitAmbient();
    draw(now);
    if (now - hudT > 150) { hud(); hudT = now; }
    frames++;
    if (now - fpsT > 1000) { $('#perf').textContent = `${frames} fps ・ ${simMs.toFixed(1)} ms/step`; frames = 0; fpsT = now; }
  }
  prevT = now;
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => { if (game) { resize(); fit(); } });

showMenu();
requestAnimationFrame(loop);
// テスト用フック
(window as unknown as Record<string, unknown>).__sa = { get game() { return game; }, startLevel, LEVELS, SANDBOX, toggleFlow, setSpeed: (v: number) => { speed = v; } };
