import './style.css';
import { M, MATS, PROCESSES, PROCESS_MODES, type ProcessMode } from './sim';
import { type Tool, type Level, type Inventory, DEVICE_MAT, isDeviceTool, starThresholds, SCALE } from './game';
import { LEVELS, SANDBOX, CHAPTERS, LAB_PRESETS, LAB_LIMITS, clampLab } from './levels';
import { initWindows, place as placeWindows, resetLayout } from './windows';
import { NODE_NAMES, JOINT_NAMES, type JointType } from './mech';
import { loadBrush, saveBrush, clampBrush, brushLabel } from './prefs';
import type { GameState, FromWorker, ToWorker, NodeView } from './protocol';
import SimWorker from './worker?worker';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const SAVE = 'shizuku-alchemy-v2';
const LAB_SAVE = 'shizuku-alchemy-lab-v3';
interface Progress { stars: Record<string, number>; learned: string[]; last: string }
const prog: Progress = { stars: {}, learned: [], last: 'l1', ...JSON.parse(localStorage.getItem(SAVE) || '{}') };
const saveProg = () => localStorage.setItem(SAVE, JSON.stringify(prog));

// ---------- ツール定義 ----------
interface ToolDef { tool: Tool; name: string; desc: string; color: string; cat: string; learnAt?: string; key?: string; inv?: keyof Inventory }
const css = (m: number) => `rgb(${MATS[m].color.join(',')})`;
const matTool = (m: number, learnAt: string): ToolDef => ({ tool: `mat:${m}`, name: MATS[m].name, desc: MATS[m].desc, color: css(m), cat: MATS[m].kind === 'static' ? '固体' : MATS[m].cat, learnAt });
const PROC_LEARN: Record<ProcessMode, string> = { electrolysis: 'l11', combustion: 'l12', condensation: 'l12', crystallization: 'p1', regeneration: 'p3', extraction: 'p2', recovery: 'p2' };
/** ステージごとの固定シード：同じ操作なら毎回同じ結果になる（再現性） */
const levelSeed = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) || 1; };

const TOOLS: ToolDef[] = [
  { tool: 'wall', name: '壁', desc: '流体を止める壁を描く。', color: css(M.PWALL), cat: '基本', learnAt: 'l1', inv: 'ink' },
  { tool: 'erase', name: '消しゴム', desc: '置いたものを消す（右ドラッグでも可）。機構も消せる。', color: '#333a55', cat: '基本', learnAt: 'l1' },
  { tool: 'heater', name: 'ヒーター', desc: MATS[M.HEATER].desc, color: css(M.HEATER), cat: '装置', learnAt: 'l2', inv: 'heater' },
  { tool: 'cooler', name: 'クーラー', desc: MATS[M.COOLER].desc, color: css(M.COOLER), cat: '装置', learnAt: 'l2', inv: 'cooler' },
  { tool: 'igniter', name: '着火器', desc: MATS[M.IGNITER].desc, color: css(M.IGNITER), cat: '装置', learnAt: 'l8', inv: 'igniter' },
  { tool: 'pump', name: 'ポンプ', desc: '2回クリックで吸込口→吐出口。壁を越えて流体を運ぶ配管。', color: '#9dffb8', cat: '装置', learnAt: 'l9', inv: 'pump' },
  { tool: 'filter', name: '選択膜', desc: '指定した物質だけを通す膜。下の欄で通す物質を選ぶ。', color: css(M.FILTER), cat: '装置', learnAt: 'l10', inv: 'filter' },
  { tool: 'electro', name: '簡易電解板', desc: MATS[M.ELECTRO].desc + '（触れた水をその場で分解）', color: css(M.ELECTRO), cat: '装置', learnAt: 'l11', inv: 'electro' },
  ...PROCESS_MODES.map((m): ToolDef => ({ tool: `proc:${m}`, name: PROCESSES[m].name, desc: PROCESSES[m].desc + '（左=主入口・右=主出口・下=補助）', color: css(M.PROCESSOR), cat: '循環装置', learnAt: PROC_LEARN[m], inv: 'proc' })),
  { tool: 'piston', name: 'ピストン', desc: '根元からドラッグした向き・長さに伸び縮みするモーター。先端に置いたものが一緒に動く。', color: '#ffd27a', cat: '機構', learnAt: 'm1', inv: 'piston' },
  { tool: 'plate', name: '可動板', desc: 'ドラッグで描く動く壁。始点をモーターの上にすると親子付けされる。流体を押しのける。', color: css(M.MOVER), cat: '機構', learnAt: 'm1', inv: 'plate' },
  { tool: 'rotor', name: '回転モーター', desc: 'クリックで置く回転軸。上に描いた板が回る。ピストンの先端にも置ける。', color: '#7fd3ff', cat: '機構', learnAt: 'm2', inv: 'rotor' },
  { tool: 'disc', name: '可動円盤', desc: '丸い可動壁。モーターの上に置くと一緒に動く。', color: css(M.MOVER), cat: '機構', learnAt: 'm2', inv: 'plate' },
  { tool: 'select', name: '選択・調整', desc: '置いた物をクリックで選択・調整（向き・速さ・関節・ストローク）。ドラッグで移動、循環装置のポートもドラッグで動かせる。どの道具でも Shift＋ドラッグで移動。', color: '#ffffff', cat: '機構', learnAt: 'm2' },
  { tool: 'guide', name: 'ガイド', desc: MATS[M.GUIDE].desc, color: css(M.GUIDE), cat: '機構', learnAt: 'm4', inv: 'guide' },
  matTool(M.WATER, 'l1'), matTool(M.OIL, 'l4'), matTool(M.MERCURY, 'l5'), matTool(M.LAVA, 'l3'), matTool(M.BRINE, 'l6'),
  matTool(M.SOLVENT, 'p2'), matTool(M.EXTRACT, 'p2'), matTool(M.LOADED, 'p2'),
  matTool(M.STEAM, 'l2'), matTool(M.HYDROGEN, 'l11'), matTool(M.OXYGEN, 'l8'), matTool(M.NITROGEN, 'l8'), matTool(M.CO2, 'l8'), matTool(M.SMOKE, 'l8'), matTool(M.HGVAPOR, 'l5'), matTool(M.FIRE, 'l8'), matTool(M.SOLVAPOR, 'p2'),
  { tool: 'air', name: '空気', desc: '酸素23%・窒素77%の有限量の混合気体を置く。', color: '#5d6fa8', cat: '気体', learnAt: 'l8' },
  matTool(M.SALT, 'l6'), matTool(M.SAND, 'l3'), matTool(M.ROCK, 'l3'), matTool(M.SOOT, 'l8'), matTool(M.ACTIVATOR, 'p1'), matTool(M.COMPOSITE, 'p1'),
  matTool(M.ICE, 'l2'), matTool(M.GLASS, 'l3'), matTool(M.WALL, 'l1'), matTool(M.VOID, 'l1'),
];
const CATS = ['基本', '機構', '装置', '循環装置', '液体', '気体', '粉体', '固体'];

// ---------- Worker（シミュレーション） ----------
const worker: Worker = new SimWorker();
let st: GameState | null = null;
let level: Level;
let sandbox = false;
let opId = 1;
const pending = new Map<number, (r: unknown) => void>();
const send = (m: ToWorker, tr: Transferable[] = []) => worker.postMessage(m, tr);
function op<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
  const id = opId++;
  return new Promise((res) => { pending.set(id, res as (r: unknown) => void); send({ type: 'op', id, op: name, args }); });
}
let frameBusy = false, readyRes: (() => void) | null = null;
worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const m = e.data;
  if (m.type === 'ready') { st = m.state; frameBusy = false; buf = null; readyRes?.(); readyRes = null; hud(); return; }
  if (m.type === 'opResult') { st = m.state; syncCanvas(); if (m.error) toast(m.error); pending.get(m.id)?.(m.result); pending.delete(m.id); hudSoon(); renderTree(); return; }
  if (m.type === 'frame') {
    frameBusy = false;
    if (!st || m.state.w !== st.w || m.state.h !== st.h) { st = m.state; syncCanvas(); return; }
    st = m.state;
    buf = m.buf; gbuf = m.gbuf;
    img.data.set(new Uint8ClampedArray(buf)); octx.putImageData(img, 0, 0);
    if (glow) { gimg.data.set(new Uint8ClampedArray(gbuf)); gctx.putImageData(gimg, 0, 0); }
    for (let k = 0; k < m.absorbs.length; k += 3) addP({ x: m.absorbs[k] + 0.5, y: m.absorbs[k + 1] + 0.5, vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 1.6 - 0.6, c: css(m.absorbs[k + 2]), life: 45, max: 45, size: 1.6, g: 0.06 });
    if (m.absorbs.length && Math.random() < 0.3) blip(700 + Math.random() * 500, 0.04);
    for (let k = 0; k < m.sparks.length; k += 3) addP({ x: m.sparks[k] + 0.5, y: m.sparks[k + 1], vx: (Math.random() - 0.5) * 0.3, vy: -Math.random() * 0.5 - 0.1, c: m.sparks[k + 2] === M.FIRE ? '#ffd27a' : '#ff8a3a', life: 50, max: 50, size: 0.7, g: -0.004 });
    if (m.wonNow) onWin();
    renderTree();
  }
};

// ---------- 状態 ----------
let tool: Tool = 'wall';
let speed = 1, paused = false, viewMode: 'mat' | 'temp' = 'mat', glow = true;
let briefOpen = true;
let selected = 0;
/** 選択中の配置物（ツリーと共通の key。機構は 'n:<id>'） */
let selKey = '';
const treeOpen = new Set<string>(); const treeClosed = new Set<string>();
let treeSig = '';
let treeDrag: { key: string; x: number; y: number; active: boolean; target: string | null } | null = null;
function setSel(key: string) { selKey = key; selected = key.startsWith('n:') ? Number(key.slice(2)) : 0; renderNodePanel(); }
let brush = loadBrush();
let filterMat: number = M.WATER;

const canvas = $<HTMLCanvasElement>('#view');
const ctx = canvas.getContext('2d')!;
const off = document.createElement('canvas');
const octx = off.getContext('2d')!;
const glowC = document.createElement('canvas');
const gctx = glowC.getContext('2d')!;
let img: ImageData, gimg: ImageData;
let buf: ArrayBuffer | null = null, gbuf: ArrayBuffer | null = null;

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
const addP = (p: Partial<P> & { x: number; y: number }) => parts.length < 900 && parts.push({ vx: 0, vy: 0, life: 40, max: 40, c: '#fff', size: 1.2, g: 0.04, ...p });

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
    el.innerHTML = `<h3>${ch.name}${['mech', 'proc'].includes(ch.id) ? ' <span class="new">NEW</span>' : ''}</h3>`;
    const row = document.createElement('div'); row.className = 'cards';
    lv.forEach((l) => {
      const n = LEVELS.indexOf(l) + 1, s = prog.stars[l.id] || 0;
      const b = document.createElement('button'); b.className = 'card-lv' + (s ? ' done' : '');
      b.innerHTML = `<span class="num">${n}</span><span class="nm">${l.title}</span><span class="lrn">📘 ${l.learn}</span><span class="st">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span>`;
      b.onclick = () => startLevel(l);
      row.appendChild(b);
    });
    el.appendChild(row); box.appendChild(el);
  });
  const lab = document.createElement('div'); lab.className = 'chapter lab'; lab.style.setProperty('--c', '#ff7ad9');
  const nMat = TOOLS.filter((t) => t.tool.startsWith('mat:') || t.tool === 'air').length;
  lab.innerHTML = `<h3>自由実験室</h3><button class="card-lv wide"><span class="num">🧪</span><span class="nm">すべての物質・装置・機構で自由に実験</span><span class="lrn">${nMat}種類の物質、7方式の循環装置、モーター・ピストン・関節、ポンプ配管、保存と書き出し</span></button>`;
  lab.querySelector('button')!.addEventListener('click', () => startLevel(SANDBOX));
  box.appendChild(lab);
}

/** 盤面の画像バッファを用意（自由実験室の大きさ変更にも使う） */
function allocCanvas(w: number, h: number) {
  off.width = glowC.width = w; off.height = glowC.height = h;
  img = octx.createImageData(w, h); gimg = gctx.createImageData(w, h);
  octx.fillStyle = '#0c0f1a'; octx.fillRect(0, 0, w, h); gctx.clearRect(0, 0, w, h);
  buf = null; gbuf = null;
}
function syncCanvas() { if (st && (st.w !== off.width || st.h !== off.height)) { allocCanvas(st.w, st.h); resize(); fit(); labUI(); } }
// ---------- 消しゴムの対象・モード ----------
const ERASE_OBJS: [string, string, keyof Inventory | null][] = [['rotor', '回転モーター', 'rotor'], ['piston', 'ピストン', 'piston'], ['rect', '可動板', 'plate'], ['circle', '可動円盤', 'plate'], ['heater', 'ヒーター', 'heater'], ['cooler', 'クーラー', 'cooler'], ['igniter', '着火器', 'igniter'], ['electro', '簡易電解板', 'electro'], ['proc', '循環装置', 'proc'], ['pump', 'ポンプ', 'pump']];
const ERASE_KEY = 'shizuku-alchemy-eraser';
type EraseMode = 'brush' | 'rect' | 'lasso';
let eraseOff = new Set<number>(); let eraseObjs: Record<string, boolean> = {}; let eraseMode: EraseMode = 'brush';
try { const v = JSON.parse(localStorage.getItem(ERASE_KEY) || 'null'); if (v) { eraseOff = new Set(v.off); eraseObjs = v.objs ?? {}; eraseMode = v.mode ?? 'brush'; } } catch { /* 既定 */ }
const ALL_MATS = MATS.map((_, m) => m).filter((m) => MATS[m] && m !== M.EMPTY && m !== M.MOVER);
function eraseMatList() { return eraseOff.size ? ALL_MATS.filter((m) => !eraseOff.has(m)) : null; }
function saveEraser() { localStorage.setItem(ERASE_KEY, JSON.stringify({ off: [...eraseOff], objs: eraseObjs, mode: eraseMode })); op('setEraseFilter', eraseMatList(), eraseObjs); }
/** 消しゴムのウィンドウ：モードと、消す対象のチェックリスト（パレットと同じ分類） */
function buildEraser() {
  const box = $('#eraseBox'); box.style.display = tool === 'erase' ? '' : 'none';
  if (tool !== 'erase') return;
  const inv = level.inv;
  const objs = ERASE_OBJS.filter(([, , k]) => sandbox || (k && inv[k]));
  const mats = sandbox ? ALL_MATS : [M.PWALL, M.FILTER, M.GUIDE].filter((m) => (m === M.PWALL && inv.ink) || (m === M.FILTER && inv.filter) || (m === M.GUIDE && inv.guide));
  const groups = new Map<string, number[]>();
  for (const m of mats) { const c = MATS[m].kind === 'device' ? '装置（セル）' : MATS[m].cat || '固体'; if (!groups.has(c)) groups.set(c, []); groups.get(c)!.push(m); }
  const order = [...CATS, '装置（セル）'];
  const gs = [...groups.entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 199 - (order.indexOf(b[0]) + 99) % 199);
  const ck = (id: string, on: boolean, label: string, sw = '') => `<label><input type="checkbox" data-e="${id}" ${on ? 'checked' : ''}>${sw ? `<span class="sw" style="--sw:${sw}"></span>` : ''}${label}</label>`;
  $('#erasePanel').innerHTML = `<div class="seg" id="emode">${([['brush', '🖌 筆'], ['rect', '▭ 矩形'], ['lasso', '➰ 投げ縄']] as const).map(([k, n]) => `<button data-m="${k}" class="${eraseMode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="ops"><button class="mini" data-op="all">全部</button><button class="mini" data-op="none">なし</button><button class="mini" data-op="inv">反転</button></div>
    ${objs.length ? `<h4>配置物</h4><div class="cks">${objs.map(([k, n]) => ck('o:' + k, eraseObjs[k] !== false, n)).join('')}</div>` : ''}
    ${gs.map(([c, ms]) => `<h4>${c}</h4><div class="cks">${ms.map((m) => ck('m:' + m, !eraseOff.has(m), MATS[m].name, css(m))).join('')}</div>`).join('')}
    <div class="muted">チェックした物だけを消す。右ドラッグでも同じ設定で消せる。</div>`;
  const P = $('#erasePanel');
  P.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => b.onclick = () => { eraseMode = b.dataset.m as EraseMode; saveEraser(); buildEraser(); });
  const set = (id: string, on: boolean) => { const [t, v] = id.split(':'); if (t === 'o') eraseObjs[v] = on; else if (on) eraseOff.delete(Number(v)); else eraseOff.add(Number(v)); };
  P.querySelectorAll<HTMLInputElement>('input[data-e]').forEach((c) => c.onchange = () => { set(c.dataset.e!, c.checked); saveEraser(); });
  P.querySelectorAll<HTMLButtonElement>('[data-op]').forEach((b) => b.onclick = () => {
    P.querySelectorAll<HTMLInputElement>('input[data-e]').forEach((c) => { const on = b.dataset.op === 'all' ? true : b.dataset.op === 'none' ? false : !c.checked; set(c.dataset.e!, on); });
    saveEraser(); buildEraser();
  });
}
/** 範囲消し（矩形・投げ縄）のドラッグ */
let region: { mode: EraseMode; pts: [number, number][] } | null = null;
// ---------- 描き方（自由・直線・矩形）：セルを塗る道具すべてで共通 ----------
type DrawMode = 'free' | 'line' | 'rect';
let drawMode: DrawMode = (localStorage.getItem('shizuku-alchemy-drawmode') as DrawMode) || 'free';
const isPaintTool = (t: Tool) => t === 'wall' || t === 'guide' || t === 'filter' || t === 'air' || t.startsWith('mat:');
let shapeStart: [number, number] | null = null;
function drawModeHTML() {
  return `<div class="drawmode"><div class="muted">描き方（壁・膜・ガイド・物質）</div><div class="seg" id="dmode">${([['free', '✏ 自由'], ['line', '／ 直線'], ['rect', '▭ 矩形']] as const).map(([k, n]) => `<button data-d="${k}" class="${drawMode === k ? 'on' : ''}" title="${k === 'free' ? 'ドラッグした通りに描く' : k === 'line' ? '始点から終点へ、筆の太さでまっすぐ' : '2点を角にした長方形を塗りつぶす'}">${n}</button>`).join('')}</div></div>`;
}

// ---------- 自由実験室の大きさ ----------
const LAB_SIZE = 'shizuku-alchemy-lab-size';
function labSize() { try { const v = JSON.parse(localStorage.getItem(LAB_SIZE) || 'null'); if (v) return clampLab(v.w, v.h); } catch { /* 既定 */ } return { w: 240, h: 150 }; }
let labAnchor: [number, number] = [0.5, 1];
function labUI() {
  if (!st) return;
  const cur = { w: st.w / SCALE, h: st.h / SCALE };
  const pr = $('#labPresets'); pr.innerHTML = '';
  for (const p of LAB_PRESETS) {
    const b = document.createElement('button'); b.className = 'mini' + (p.w === cur.w && p.h === cur.h ? ' on' : ''); b.textContent = `${p.name} ${p.w}×${p.h}`;
    b.onclick = () => { ($('#labW') as HTMLInputElement).value = String(p.w); ($('#labH') as HTMLInputElement).value = String(p.h); doLabResize(); };
    pr.appendChild(b);
  }
  const W = $('#labW') as HTMLInputElement, H = $('#labH') as HTMLInputElement;
  W.min = String(LAB_LIMITS.minW); W.max = String(LAB_LIMITS.maxW); H.min = String(LAB_LIMITS.minH); H.max = String(LAB_LIMITS.maxH);
  if (document.activeElement !== W) W.value = String(cur.w); if (document.activeElement !== H) H.value = String(cur.h);
  const an = $('#labAnchor'); an.innerHTML = '';
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const b = document.createElement('button'); const v: [number, number] = [i / 2, j / 2];
    b.className = v[0] === labAnchor[0] && v[1] === labAnchor[1] ? 'on' : ''; b.title = '中身をこの位置に寄せる';
    b.onclick = () => { labAnchor = v; labUI(); }; an.appendChild(b);
  }
  $('#labInfo').textContent = `いま ${cur.w}×${cur.h}（実セル ${st.w}×${st.h}）・上限 ${LAB_LIMITS.maxW}×${LAB_LIMITS.maxH}`;
}
async function doLabResize() {
  const c = clampLab(Number(($('#labW') as HTMLInputElement).value), Number(($('#labH') as HTMLInputElement).value));
  await op('resizeLab', c.w, c.h, labAnchor[0], labAnchor[1]);
  localStorage.setItem(LAB_SIZE, JSON.stringify(c));
  syncCanvas(); selected = 0; selKey = ''; renderNodePanel(); hud();
  toast(`実験台を ${c.w}×${c.h} にした`);
}

async function startLevel(l: Level) {
  level = l;
  sandbox = l.id === SANDBOX.id;
  if (!sandbox) prog.last = l.id;
  saveProg();
  const ls = labSize();
  allocCanvas((sandbox ? ls.w : l.w ?? 160) * SCALE, (sandbox ? ls.h : l.h ?? 100) * SCALE);
  brush = loadBrush();
  st = null;
  await new Promise<void>((res) => { readyRes = res; send({ type: 'init', levelId: l.id, sandbox, seed: levelSeed(l.id), brush, lw: ls.w, lh: ls.h }); });
  op('setEraseFilter', eraseMatList(), eraseObjs);
  filterMat = l.filterMat ?? M.WATER;
  tool = sandbox ? 'mat:3' : 'wall';
  if (!sandbox && !l.inv.ink) tool = (availableTools()[1]?.tool ?? 'erase');
  if (!sandbox && l.procModes?.length) tool = `proc:${l.procModes[0]}`;
  paused = false; parts = []; selected = 0;
  $('#menu').classList.add('hidden'); $('#play').classList.remove('hidden');
  $('#win').classList.add('hidden');
  const ch = CHAPTERS.find((c) => c.id === l.chapter);
  $('#chap').textContent = sandbox ? 'LAB' : `${ch?.name.split('　')[0]} ・ ${LEVELS.indexOf(l) + 1}`;
  $('#chap').style.setProperty('--c', ch?.color ?? '#ff7ad9');
  $('#title').textContent = l.title;
  $('#story').textContent = l.story; $('#hint').textContent = '💡 ' + l.hint;
  briefOpen = true; $('#brief').classList.remove('hidden');
  $('#labBox').style.display = sandbox ? '' : 'none';
  if (sandbox) setTimeout(labUI, 0);
  $('#goalsBox').style.display = sandbox ? 'none' : '';
  $('#w-status').style.display = sandbox ? 'none' : '';
  $('#invBox').style.display = sandbox ? 'none' : '';
  $('#scoreBox').style.display = sandbox ? 'none' : '';
  setBrush(brush);
  resize(); placeWindows(); fit();
  buildPalette(); hud();
}

// ---------- パレット ----------
function availableTools(): ToolDef[] {
  if (sandbox) return TOOLS;
  const inv = level.inv;
  const list: ToolDef[] = [];
  for (const t of TOOLS) {
    if (t.tool.startsWith('mat:') || t.tool === 'air') continue;
    if (t.tool === 'erase') { list.push(t); continue; }
    if (t.tool === 'select') { list.push(t); continue; }
    if (t.tool.startsWith('proc:')) { if (inv.proc && level.procModes?.includes(t.tool.slice(5) as ProcessMode)) list.push(t); continue; }
    if (t.inv && inv[t.inv]) list.push(t);
  }
  return list;
}
function buildPalette() {
  const box = $('#palette'); box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', drawModeHTML());
  box.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.onclick = () => { drawMode = b.dataset.d as DrawMode; localStorage.setItem('shizuku-alchemy-drawmode', drawMode); buildPalette(); toast(drawMode === 'free' ? '自由に描く' : drawMode === 'line' ? '直線で描く（ドラッグで始点→終点）' : '矩形で塗る（ドラッグで角→角）'); });
  const tools = availableTools();
  let key = 1;
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
      b.onclick = () => { tool = t.tool; if (st?.pendingPump) op('cancelPump'); buildPalette(); blip(660, 0.03); };
      const learnLv = LEVELS.find((l) => l.id === t.learnAt);
      b.onmouseenter = (e) => showTip(e.currentTarget as HTMLElement, `<b>${t.name}</b><br>${t.desc}${isNew && learnLv ? `<br><span class="muted">🔰 ステージ${LEVELS.indexOf(learnLv) + 1}「${learnLv.title}」で学べます</span>` : ''}`);
      b.onmouseleave = hideTip;
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
  if (tool === 'filter' || (sandbox && tools.some((t) => t.tool === 'filter'))) {
    const opts = [M.WATER, M.OIL, M.MERCURY, M.BRINE, M.HYDROGEN, M.OXYGEN, M.STEAM, M.CO2, M.EXTRACT, M.SOLVENT];
    if (sandbox || tool === 'filter') {
      box.insertAdjacentHTML('beforeend', `<h4>選択膜が通す物質</h4>`);
      const sel = document.createElement('div'); sel.className = 'fsel';
      for (const m of opts) {
        if (!sandbox && m !== filterMat) continue;
        const b = document.createElement('button'); b.className = 'mini' + (filterMat === m ? ' on' : '');
        b.innerHTML = `<span class="sw" style="--sw:${css(m)}"></span>${MATS[m].name}`;
        b.onclick = () => { filterMat = m; op('setFilter', m); buildPalette(); };
        sel.appendChild(b);
      }
      box.appendChild(sel);
    }
  }
  buildEraser();
  renderNodePanel();
}

/** 選択した機構の調整パネル */
function renderNodePanel() {
  const box = $('#nodeBox'); const body = $('#nodePanel');
  if (selected) selKey = `n:${selected}`; else if (selKey.startsWith('n:')) selKey = '';
  treeSig = '';
  const n = st?.nodes.find((q) => q.id === selected);
  if (!n) { renderObjPanel(box, body); return; }
  box.style.display = '';
  const motor = n.type === 'rotor' || n.type === 'piston';
  const lock = n.fixed && !sandbox;
  const parent = st!.nodes.find((q) => q.id === n.parent);
  body.innerHTML = `<div class="gl"><b>${n.name || NODE_NAMES[n.type]}</b><span class="muted"> ${NODE_NAMES[n.type]}</span>${lock ? '<span class="muted">（備え付け）</span>' : ''}</div>
    <div class="muted">親：${parent ? (parent.name || NODE_NAMES[parent.type]) : 'なし（固定点）'}</div>
    ${motor ? `<div class="row2"><button class="mini" data-k="dir">${n.type === 'rotor' ? (n.dir > 0 ? '↻ 時計回り' : '↺ 反時計回り') : (n.dir > 0 ? '⇡ 伸びる' : '⇣ 縮む')}</button><button class="mini ${n.on ? 'on' : ''}" data-k="on">${n.on ? '● 作動' : '○ 停止'}</button></div>
      <label class="rng">速さ <input type="range" data-k="speed" min="0.05" max="${n.type === 'rotor' ? 3 : 1}" step="0.05" value="${n.speed}" ${lock ? 'disabled' : ''}></label>` : ''}
    ${n.type === 'piston' ? `<div class="rng">ストローク（伸びる長さ）<div class="row2"><input type="range" data-amp="1" min="${4 * SCALE}" max="${st!.maxAmp}" step="1" value="${Math.round(n.amp)}" ${lock ? 'disabled' : ''}><input type="number" class="num" data-amp="2" min="${4 * SCALE}" max="${st!.maxAmp}" value="${Math.round(n.amp)}" ${lock ? 'disabled' : ''}></div><span class="muted">キャンバスの◇をドラッグしても変えられる</span></div>` : ''}
    ${n.type === 'piston' ? `<label class="chk"><input type="checkbox" data-k="recip" ${n.recip ? 'checked' : ''} ${lock ? 'disabled' : ''}> 往復する</label>` : ''}
    ${n.parent > 0 ? `<div class="muted">関節</div><div class="seg">${(['fixed', 'free', 'spring'] as JointType[]).map((j) => `<button data-j="${j}" class="${n.joint === j ? 'on' : ''}">${JOINT_NAMES[j]}</button>`).join('')}</div>
      ${n.joint === 'spring' ? `<label class="rng">ばねの強さ <input type="range" data-k="k" min="1" max="20" step="0.5" value="${n.k}" ${lock ? 'disabled' : ''}></label>` : ''}` : ''}
    ${lock ? '' : `<label class="rng">親（付け替え）<select data-parent="1" class="num">${parentOptions(n)}</select></label>`}
    ${lock ? '' : '<button class="btn danger" data-del="1" title="この機構と、付いている子をまとめて消す">🗑 削除</button>'}`;
  body.querySelectorAll<HTMLSelectElement>('select[data-parent]').forEach((sel) => sel.onchange = () => reparent(n.id, Number(sel.value)));
  body.querySelectorAll<HTMLButtonElement>('[data-k="dir"]').forEach((b) => b.onclick = () => edit({ dir: -n.dir }));
  body.querySelectorAll<HTMLButtonElement>('[data-k="on"]').forEach((b) => b.onclick = () => edit({ on: !n.on }));
  body.querySelectorAll<HTMLInputElement>('input[type=range][data-k]').forEach((r) => r.onchange = () => edit({ [r.dataset.k!]: Number(r.value) }));
  // ストローク：動かしている間も反映（元に戻すは1回分）
  let ampUndo = false;
  body.querySelectorAll<HTMLInputElement>('input[data-amp]').forEach((r) => {
    r.oninput = () => { if (!ampUndo) { op('pushUndo'); ampUndo = true; } op('setAmp', n.id, Number(r.value)); body.querySelectorAll<HTMLInputElement>('input[data-amp]').forEach((o) => { if (o !== r) o.value = r.value; }); };
    r.onchange = () => { ampUndo = false; renderNodePanel(); };
  });
  body.querySelectorAll<HTMLInputElement>('input[data-k="recip"]').forEach((r) => r.onchange = () => edit({ recip: r.checked }));
  body.querySelectorAll<HTMLButtonElement>('[data-j]').forEach((b) => b.onclick = () => edit({ joint: b.dataset.j as JointType }));
  body.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.onclick = async () => { await op('pushUndo'); await op('removeNode', n.id); selected = 0; renderNodePanel(); blip(220, 0.05); });
  async function edit(patch: Partial<NodeView>) { await op('pushUndo'); await op('editNode', n!.id, patch); renderNodePanel(); blip(560, 0.03); }
}

/** 付け替え先の候補（自分と子孫は除く＝循環しない） */
function parentOptions(n: NodeView) {
  const nodes = st!.nodes; const bad = new Set([n.id]);
  let grew = true; while (grew) { grew = false; for (const q of nodes) if (!bad.has(q.id) && bad.has(q.parent)) { bad.add(q.id); grew = true; } }
  return `<option value="-1" ${n.parent < 0 ? 'selected' : ''}>なし（固定点）</option>` + nodes.filter((q) => !bad.has(q.id)).map((q) => `<option value="${q.id}" ${q.id === n.parent ? 'selected' : ''}>${q.name || NODE_NAMES[q.type]}</option>`).join('');
}
async function reparent(id: number, parent: number) {
  await op('pushUndo');
  const ok = await op<boolean>('reparent', id, parent);
  if (ok) { blip(600, 0.04); toast(parent < 0 ? '固定点にした' : '親を付け替えた'); } else { await op('undo'); toast('付け替えできない（自分の子には付けられない）'); }
  renderNodePanel(); treeSig = ''; renderTree();
}

/** 機構以外（装置・循環装置・ポート・ポンプ）の調整パネル */
function renderObjPanel(box: HTMLElement, body: HTMLElement) {
  const [kind, a, b] = selKey.split(':'); const uid = Number(a);
  const proc = st?.procs.find((p) => p.uid === uid), dev = st?.devices.find((d) => d.uid === uid), pump = st?.pumps.find((p) => p.uid === uid);
  let html = '';
  if ((kind === 'd' || kind === 'port') && dev) {
    html = `<div class="gl"><b>${dev.name}</b></div><div class="muted">位置 (${dev.x}, ${dev.y}) ・ ドラッグで移動（費用はかからない）</div>`;
    if (proc) {
      html += `<div class="muted">${PROCESSES[proc.mode].desc}</div><div class="ports">${(['入口', '出口', '補助口'] as const).map((nm, k) => `<button class="mini ${kind === 'port' && ['in', 'out', 'aux'][k] === b ? 'on' : ''}" data-port="${['in', 'out', 'aux'][k]}">${nm} (${proc.ports[k][0] > 0 ? '+' : ''}${proc.ports[k][0]}, ${proc.ports[k][1] > 0 ? '+' : ''}${proc.ports[k][1]})</button>`).join('')}</div>
        <div class="muted">ポートの丸をドラッグすると、盤面のどこへでも動かせる（装置・壁の上は不可）</div>
        ${proc.moved ? '<button class="btn" data-resetport="1">↺ ポートを元の位置に</button>' : ''}`;
    }
  } else if ((kind === 'p' || kind === 'pe') && pump) {
    html = `<div class="gl"><b>${pump.name}</b></div><div class="muted">吸込口 (${pump.ax}, ${pump.ay}) → 吐出口 (${pump.bx}, ${pump.by})<br>口をドラッグで片方、線の途中ではなく口の丸をつかむ</div>`;
  }
  if (!html) { box.style.display = 'none'; return; }
  box.style.display = ''; body.innerHTML = html;
  body.querySelectorAll<HTMLButtonElement>('[data-port]').forEach((x) => x.onclick = () => setSel(`port:${uid}:${x.dataset.port}`));
  body.querySelectorAll<HTMLButtonElement>('[data-resetport]').forEach((x) => x.onclick = async () => { await op('pushUndo'); await op('resetPorts', uid); renderNodePanel(); });
}

/** 配置物ツリー（親子・折りたたみ・選択の同期） */
const TREE_ICON: Record<string, string> = { rotor: '⟳', piston: '⇕', rect: '▬', circle: '●', heater: '🔥', cooler: '❄', igniter: '✦', electro: '⚡', proc: '⚗', port: '◇', pump: '⛲', pumpEnd: '○' };
function renderTree() {
  const el = document.getElementById('tree'); if (!el || !st || treeDrag) return;
  const sig = JSON.stringify(st.tree) + selKey + [...treeClosed].join();
  if (sig === treeSig) return; treeSig = sig;
  const count = (t: GameState['tree']): number => t.reduce((a, i) => a + (i.kind === 'port' || i.kind === 'pumpEnd' ? 0 : 1) + count(i.children), 0);
  $('#treeCount').textContent = `${count(st.tree)} 個`;
  if (!st.tree.length) { el.innerHTML = '<div class="muted">まだ何も置いていない。モーター・装置などを置くとここに並ぶ。</div>'; return; }
  const row = (i: GameState['tree'][number], depth: number): string => {
    const has = i.children.length > 0, closed = treeClosed.has(i.key);
    return `<div class="trow ${i.key === selKey ? 'on' : ''}" data-key="${i.key}" style="--d:${depth}">
      <span class="tw" data-tw="${has ? i.key : ''}">${has ? (closed ? '▸' : '▾') : ''}</span><span class="ti">${TREE_ICON[i.kind] ?? '•'}</span><span class="tn">${i.name}</span>${i.sub ? `<span class="ts">${i.sub}</span>` : ''}${i.fixed ? '<span class="ts">備え付け</span>' : ''}</div>`
      + (has && !closed ? i.children.map((c) => row(c, depth + 1)).join('') : '');
  };
  el.innerHTML = st.tree.map((i) => row(i, 0)).join('');
  el.querySelectorAll<HTMLElement>('.trow').forEach((r) => {
    r.onpointerdown = (e) => {
      const tw = (e.target as HTMLElement).dataset.tw;
      if (tw) { if (treeClosed.has(tw)) treeClosed.delete(tw); else treeClosed.add(tw); treeSig = ''; renderTree(); return; }
      const key = r.dataset.key!;
      treeDrag = { key, x: e.clientX, y: e.clientY, active: false, target: null };
      r.setPointerCapture(e.pointerId);
    };
    r.onpointermove = (e) => {
      const d = treeDrag; if (!d || !d.key.startsWith('n:')) return;
      if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.active = true; el.classList.add('dragging'); }
      if (!d.active) return;
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.trow, .tree');
      el.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
      d.target = over?.classList.contains('trow') ? over.dataset.key! : over ? 'root' : null;
      if (d.target && d.target !== 'root') over!.classList.add('drop'); else if (d.target === 'root') el.classList.add('droproot');
      if (d.target !== 'root') el.classList.remove('droproot');
    };
    r.onpointerup = () => {
      const d = treeDrag; treeDrag = null; el.classList.remove('dragging', 'droproot');
      el.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
      if (!d) return;
      if (!d.active) { setSel(d.key); blip(620, 0.03); return; }
      const id = Number(d.key.slice(2));
      if (d.target === 'root') reparent(id, -1);
      else if (d.target?.startsWith('n:') && d.target !== d.key) reparent(id, Number(d.target.slice(2)));
      else toast('機構（モーター・板）の上に落とすと付け替え、空いた所なら固定点');
    };
    r.onpointercancel = () => { treeDrag = null; el.classList.remove('dragging', 'droproot'); };
  });
  el.querySelector('.trow.on')?.scrollIntoView({ block: 'nearest' });
  void treeOpen;
}

// ---------- ツールチップ ----------
const tip = $('#tip');
function showTip(el: HTMLElement, html: string) {
  tip.innerHTML = html; tip.classList.add('show');
  const r = el.getBoundingClientRect();
  let x = r.right + 10; const y = r.top;
  if (x + 240 > innerWidth) x = r.left - 250;
  tip.style.left = x + 'px'; tip.style.top = Math.min(y, innerHeight - 100) + 'px';
}
function hideTip() { tip.classList.remove('show'); }

// ---------- HUD ----------
const fmt = (v: number) => (v === Infinity || v == null ? '∞' : String(v));
let hudTimer = 0;
function hudSoon() { if (!hudTimer) hudTimer = window.setTimeout(() => { hudTimer = 0; hud(); }, 30); }
function hud() {
  const g = st; if (!g || !level) return;
  $('#go').textContent = !g.flowing ? (level.sources.length ? '💧 放水' : '▶ 始動') : paused ? '▶ 再開' : '⏸ 停止';
  ($('#undo') as HTMLButtonElement).disabled = !g.canUndo;
  ($('#redo') as HTMLButtonElement).disabled = !g.canRedo;
  const gl = $('#goals'); gl.innerHTML = '';
  const S2 = g.S * g.S;
  level.goals.forEach((go, k) => {
    const need = go.need * S2;
    const p = Math.min(1, g.progress[k] / need);
    const verb = go.mode === 'absorb' ? `壺に${go.label}を集める` : go.mode === 'fill' ? `枠を${go.label}で満たす` : `${go.label}を起こす`;
    gl.insertAdjacentHTML('beforeend', `<div class="goal ${p >= 1 ? 'ok' : ''}"><div class="gl"><span>${p >= 1 ? '✔' : '◎'} ${verb}</span><b>${Math.min(g.progress[k], need)}/${need}</b></div><div class="bar"><i style="width:${p * 100}%"></i></div></div>`);
  });
  $('#flow').textContent = sandbox ? '' : level.sources.length ? (g.flowing ? `残り湧出量 ${g.sourcesLeft}` : 'Space または「放水」で開始') : (g.flowing ? '稼働中' : '配置したら「始動」で開始');
  const inv = $('#inv'); inv.innerHTML = '';
  const names: [keyof Inventory, string, string][] = [['ink', '壁インク', css(M.PWALL)], ['heater', 'ヒーター', css(M.HEATER)], ['cooler', 'クーラー', css(M.COOLER)], ['igniter', '着火器', css(M.IGNITER)], ['electro', '簡易電解板', css(M.ELECTRO)], ['filter', '選択膜', css(M.FILTER)], ['pump', 'ポンプ', '#9dffb8'], ['proc', '循環装置', css(M.PROCESSOR)], ['piston', 'ピストン', '#ffd27a'], ['rotor', '回転モーター', '#7fd3ff'], ['plate', '可動板（セル）', css(M.MOVER)], ['guide', 'ガイド', css(M.GUIDE)]];
  for (const [k, n, c] of names) {
    const base = sandbox ? Infinity : g.invBase[k] ?? 0;
    if (!base) continue;
    const pct = base === Infinity ? 100 : (g.inv[k] / base) * 100;
    inv.insertAdjacentHTML('beforeend', `<div class="it"><span class="sw" style="--sw:${c}"></span><span>${n}</span><b>${fmt(g.inv[k])}</b><div class="bar thin"><i style="width:${pct}%"></i></div></div>`);
  }
  if (!sandbox) {
    const th = starThresholds(level); const c = g.cost;
    const now = c <= th.three ? 3 : c <= th.two ? 2 : 1;
    $('#score').innerHTML = `<div class="gl"><span>資源コスト</span><b>${c}</b></div>
      <div class="th ${now === 3 ? 'on' : ''}"><span>★★★</span><span>≤ ${th.three}</span></div>
      <div class="th ${now === 2 ? 'on' : ''}"><span>★★☆</span><span>≤ ${th.two}</span></div>
      <div class="th ${now === 1 ? 'on' : ''}"><span>★☆☆</span><span>それ以上</span></div>
      <div class="muted">インク・膜・板1セル = 1、装置・モーター1個 = 40</div>`;
  }
  $('#brushv').textContent = brushLabel(brush);
  const bs = $('#brush') as HTMLInputElement; if (bs.value !== String(brush)) bs.value = String(brush);
}

// ---------- カメラ ----------
function resize() {
  const s = $('#stage'); const r = s.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(r.width * dpr)); canvas.height = Math.max(1, Math.floor(r.height * dpr));
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
}
function fit() {
  if (!off.width) return;
  // 広い画面では左右のウィンドウを避けて収める
  const wide = canvas.width / dpr > 1000, L = wide ? 236 * dpr : 0, R = wide ? 262 * dpr : 0;
  const aw = canvas.width - L - R;
  const s = Math.min(aw / off.width, canvas.height / off.height) * 0.96;
  cam.s = s; cam.x = L + (aw - off.width * s) / 2; cam.y = (canvas.height - off.height * s) / 2;
}
function zoomAt(f: number, sx: number, sy: number) {
  const ns = Math.max(0.8, Math.min(40, cam.s * f));
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
let dragStart: [number, number] | null = null; // 板・ピストンのドラッグ
/** 配置物のドラッグ移動（選択ツール、または Shift＋ドラッグ） */
let moveDrag: { key: string; last: [number, number]; undo: boolean; busy: boolean } | null = null;
/** ピストンのストロークをつまむ */
let ampDrag: { id: number; undo: boolean } | null = null;
function pistonHandle(n: GameState['nodes'][number]) { return [n.x + Math.cos(n.a) * n.amp, n.y + Math.sin(n.a) * n.amp]; }

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', async (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (briefOpen) closeBrief();
  if (pointers.size === 2) {
    if (drawing) { op('undo'); drawing = false; }
    dragStart = null; moveDrag = null; ampDrag = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    return;
  }
  if (e.button === 1 || spaceHeld || (e.button === 0 && e.altKey)) { panning = true; spaceUsed = true; return; }
  erasing = e.button === 2 || tool === 'erase';
  const c = toCell(e.clientX, e.clientY);
  if (erasing && eraseMode !== 'brush') { region = { mode: eraseMode, pts: [c] }; return; }
  if (!erasing && drawMode !== 'free' && isPaintTool(tool) && !e.shiftKey) { shapeStart = c; return; }
  if (!erasing && (tool === 'plate' || tool === 'piston')) { dragStart = c; return; }
  if (!erasing && (tool === 'select' || e.shiftKey)) {
    // 選択中のピストンの◇（最大まで伸びた先）をつかむとストローク変更
    const sn = st?.nodes.find((q) => q.id === selected);
    if (sn && sn.type === 'piston' && !(sn.fixed && !sandbox)) {
      const [hx, hy] = pistonHandle(sn);
      if (Math.hypot(hx - c[0], hy - c[1]) <= 3 * SCALE) { ampDrag = { id: sn.id, undo: false }; return; }
    }
    const key = await op<string>('pickObject', c[0], c[1]);
    setSel(key || '');
    if (!key) { toast('置いた物（機構・装置・ポート・ポンプ口）をクリックしてね'); return; }
    moveDrag = { key, last: c, undo: false, busy: false };
    return;
  }
  op('pushUndo');
  drawing = true; last = c;
  if (!erasing && tool === 'rotor') { drawing = false; const id = await op<number>('addRotor', c[0], c[1]); if (id) { selected = id; feedback(c); toast('回転モーターを置いた（選択ツールで向きを変えられる）'); } else toast('回転モーターが足りない'); hud(); renderNodePanel(); return; }
  if (!erasing && tool === 'disc') { drawing = false; const id = await op<number>('addDisc', c[0], c[1], (brush + 3) / 2 + SCALE); if (id) feedback(c); else toast('可動板の材料が足りない'); return; }
  const ok = await op<boolean>('apply', tool, c[0], c[1], erasing);
  if (ok) feedback(c);
  if (tool === 'pump' && !erasing) { drawing = false; toast(st?.pendingPump ? '吐出口をクリック' : 'ポンプを設置した'); }
  if (isDeviceTool(tool) && !erasing) { drawing = false; if (!ok) toast('ここには置けない（空き・流体の上に置こう）'); }
});
canvas.addEventListener('pointermove', async (e) => {
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
  if (shapeStart && pointers.size === 1) return;
  if (region && pointers.size === 1) {
    const c = hover, r = region;
    if (r.mode === 'rect') r.pts = [r.pts[0], c];
    else { const l = r.pts[r.pts.length - 1]; if (Math.hypot(c[0] - l[0], c[1] - l[1]) >= 1.5) r.pts.push(c); }
    return;
  }
  if (ampDrag && pointers.size === 1) {
    const n = st?.nodes.find((q) => q.id === ampDrag!.id); if (!n) return;
    const amp = (hover[0] + 0.5 - n.x) * Math.cos(n.a) + (hover[1] + 0.5 - n.y) * Math.sin(n.a);
    if (!ampDrag.undo) { op('pushUndo'); ampDrag.undo = true; }
    op('setAmp', n.id, Math.round(amp));
    return;
  }
  if (moveDrag && pointers.size === 1 && !moveDrag.busy) {
    const md = moveDrag, c = hover;
    const dx = c[0] - md.last[0], dy = c[1] - md.last[1];
    if (!dx && !dy) return;
    if (!md.undo) { op('pushUndo'); md.undo = true; }
    md.busy = true;
    let ok: boolean;
    if (md.key.startsWith('port:')) {
      const [, u, pn] = md.key.split(':'); const p = st?.procs.find((q) => q.uid === Number(u));
      ok = !!p && await op<boolean>('setPort', Number(u), pn, c[0] - p.x, c[1] - p.y);
    } else ok = await op<boolean>('moveObject', md.key, dx, dy);
    md.busy = false;
    if (ok) md.last = c;
    return;
  }
  if (!drawing || !last) return;
  const c = hover;
  op('stroke', tool, last[0], last[1], c[0], c[1], erasing);
  if (Math.random() < 0.5) feedback(c);
  last = c;
});
const endPointer = async (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (dragStart && pointers.size === 0) {
    const a = dragStart, b = toCell(e.clientX, e.clientY); dragStart = null;
    await op('pushUndo');
    if (tool === 'plate') {
      const id = await op<number>('addPlate', a[0], a[1], b[0], b[1], Math.max(2, brush + 1));
      if (id) { feedback(b); selected = id; const n = st?.nodes.find((q) => q.id === id); toast(n?.parent ? '可動板を親に付けた' : '可動板を置いた（固定点）'); } else toast('可動板の材料が足りない');
    } else {
      const far = Math.hypot(b[0] - a[0], b[1] - a[1]) >= 4;
      const id = await op<number>('addPiston', a[0], a[1], far ? b[0] : a[0], far ? b[1] : a[1] - 15 * SCALE);
      if (id) { feedback(b); selected = id; toast('ピストンを置いた（先端に板やモーターを付けよう）'); } else toast('ピストンが足りない');
    }
    renderNodePanel(); hud();
  }
  if (shapeStart && pointers.size === 0) {
    const a = shapeStart, b = toCell(e.clientX, e.clientY); shapeStart = null;
    await op('pushUndo');
    const ok = drawMode === 'line' ? await op<boolean>('stroke', tool, a[0], a[1], b[0], b[1], false) : await op<boolean>('fillRect', tool, a[0], a[1], b[0], b[1]);
    if (ok) { feedback(b); blip(480, 0.04); } else { await op('undo'); toast(st && !sandbox ? 'ここには描けない（材料切れ・すき間なし）' : 'ここには描けない'); }
    hud();
  }
  if (region && pointers.size === 0) {
    const r = region; region = null;
    let poly: number[] = [];
    if (r.mode === 'rect') {
      const [a, b] = [r.pts[0], r.pts[r.pts.length - 1]];
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]) + 1, y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]) + 1;
      poly = [x0, y0, x1, y0, x1, y1, x0, y1];
    } else poly = r.pts.flatMap(([x, y]) => [x + 0.5, y + 0.5]);
    if (poly.length >= 6) {
      await op('pushUndo');
      const n = await op<number>('eraseRegion', poly);
      if (n) { blip(240, 0.06); toast(`${n} 個を消した`); } else { await op('undo'); toast('消せる物がなかった（対象のチェックを確認）'); }
      hud();
    }
  }
  if (pointers.size === 0) {
    if (moveDrag?.undo || ampDrag?.undo) { blip(520, 0.04); renderNodePanel(); }
    drawing = false; panning = false; last = null; moveDrag = null; ampDrag = null;
  }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { hover = [-1, -1]; $('#inspect').classList.remove('show'); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) { setBrush(brush + (e.deltaY > 0 ? -1 : 1)); return; }
  const r = canvas.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
}, { passive: false });

let lastSfx = 0;
function feedback(c: [number, number]) {
  const now = performance.now();
  if (now - lastSfx > 45) { blip(erasing ? 220 : 380 + Math.random() * 60, 0.03, 'triangle', 0.025); lastSfx = now; }
  if (Math.random() < 0.4) addP({ x: c[0] + 0.5, y: c[1] + 0.5, vx: (Math.random() - 0.5) * 0.8, vy: -Math.random() * 0.8, c: erasing ? '#8892c0' : '#ffe3a0', life: 18, max: 18, size: 1 });
}

function inspect() {
  const el = $('#inspect');
  const [x, y] = hover;
  const hv = st?.hover;
  if (!st || x < 0 || y < 0 || x >= st.w || y >= st.h || !hv) { el.classList.remove('show'); return; }
  const m = hv.m;
  el.innerHTML = `<span class="sw" style="--sw:${css(m)}"></span>${m === M.EMPTY ? '空' : MATS[m].name}<span class="muted">　${hv.temp.toFixed(0)}℃　(${x}, ${y})</span>`;
  el.classList.add('show');
}

window.addEventListener('keydown', (e) => {
  if ($('#play').classList.contains('hidden')) return;
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); if (!spaceHeld) { spaceHeld = true; spaceUsed = false; canvas.classList.add('grab'); } return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  if (e.key === 'Escape') { if (st?.pendingPump) { op('cancelPump'); toast('ポンプ配置を取り消した'); } else if (selected || selKey) { setSel(''); } else showMenu(); return; }
  if (e.key === 'r' || e.key === 'R') { retry(); return; }
  if (e.key === 'f' || e.key === 'F') { fit(); return; }
  if (e.key === '.') { stepOnce(); return; }
  if (e.key === '[' || e.key === ']') { setBrush(brush + (e.key === ']' ? 1 : -1)); return; }
  const b = [...document.querySelectorAll<HTMLButtonElement>('.tool')].find((x) => x.querySelector('kbd')?.textContent === e.key);
  b?.click();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { spaceHeld = false; canvas.classList.remove('grab'); if (!spaceUsed && !$('#play').classList.contains('hidden')) toggleFlow(); }
});

async function toggleFlow() {
  if (!st) return;
  if (!st.flowing) { await op('start'); paused = false; blip(440, 0.18, 'triangle'); blip(660, 0.18, 'triangle'); }
  else paused = !paused;
  hud();
}
async function stepOnce() { paused = true; await op('step'); hud(); }
async function retry() { await op('reset', true); parts = []; $('#win').classList.add('hidden'); hud(); toast('配置を残して流し直し'); }
async function doUndo() { if (await op('undo')) { hud(); renderNodePanel(); blip(300, 0.04); } }
async function doRedo() { if (await op('redo')) { hud(); renderNodePanel(); blip(500, 0.04); } }
function closeBrief() { briefOpen = false; $('#brief').classList.add('hidden'); }

$('#go').onclick = toggleFlow;
$('#step').onclick = stepOnce;
$('#retry').onclick = retry;
$('#wipe').onclick = async () => { await op('pushUndo'); await op('reset', false); selected = 0; renderNodePanel(); hud(); toast('最初からやり直し'); };
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
  brush = clampBrush(v);
  op('setBrush', brush);
  ($('#brush') as HTMLInputElement).value = String(brush);
  $('#brushv').textContent = brushLabel(brush);
  saveBrush(brush);
}
($('#brush') as HTMLInputElement).oninput = (e) => { setBrush(Number((e.target as HTMLInputElement).value)); hud(); };
document.querySelectorAll<HTMLButtonElement>('#viewmode button').forEach((b) => b.onclick = () => {
  const v = b.dataset.v!;
  if (v === 'glow') { glow = !glow; b.classList.toggle('on', !glow); return; }
  viewMode = v as 'mat' | 'temp';
  document.querySelectorAll('#viewmode button[data-v="mat"],#viewmode button[data-v="temp"]').forEach((x) => x.classList.toggle('on', x === b));
});
($('#ambient') as HTMLInputElement).onchange = (e) => { op('setAmbient', (e.target as HTMLInputElement).checked ? -10 : 20); };

// 実験データの保存・書き出し（v3。旧 v2 の保存も読み込める）
const loadLab = async (json: string) => { await op('deserialize', json); syncCanvas(); if (st) localStorage.setItem(LAB_SIZE, JSON.stringify({ w: st.w / SCALE, h: st.h / SCALE })); toast('読み込んだ'); };
$('#save').onclick = async () => { try { localStorage.setItem(LAB_SAVE, await op<string>('serialize')); toast('ブラウザに保存した'); } catch { toast('保存できなかった'); } };
$('#load').onclick = () => { const d = localStorage.getItem(LAB_SAVE) ?? localStorage.getItem(SAVE + '-lab'); if (!d) return toast('保存データがない'); loadLab(d); };
$('#export').onclick = async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await op<string>('serialize')], { type: 'application/json' })); a.download = `shizuku-lab-${Date.now()}.json`; a.click(); };
$('#import').onclick = () => $('#file').click();
($('#file') as HTMLInputElement).onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; loadLab(await f.text()); };

let toastT = 0;
function toast(s: string) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => t.classList.remove('show'), 1600); }

// ---------- クリア ----------
let lastWin: { cost: number; stars: number } | null = null;
function onWin() {
  if (!st || sandbox) return;
  const th = starThresholds(level); const cost = st.cost;
  const stars = cost <= th.three ? 3 : cost <= th.two ? 2 : 1;
  lastWin = { cost, stars };
  prog.stars[level.id] = Math.max(prog.stars[level.id] || 0, stars);
  if (!prog.learned.includes(level.id)) prog.learned.push(level.id);
  saveProg();
  $('#winstars').innerHTML = [0, 1, 2].map((k) => `<span class="${k < stars ? 'on' : ''}" style="animation-delay:${k * 0.15}s">★</span>`).join('');
  $('#winmsg').textContent = `資源コスト ${cost}（★★★ ≤ ${th.three} ／ ★★ ≤ ${th.two}）　${stars === 3 ? '見事な錬金術！' : stars === 2 ? 'いい流れ！' : 'クリア！ 少ない資源で★3を目指そう'}`;
  const newTools = TOOLS.filter((t) => t.learnAt === level.id).map((t) => t.name);
  $('#winlearn').innerHTML = newTools.length ? `🔓 自由実験室で習得：${newTools.join('・')}` : '';
  $('#next').textContent = LEVELS.indexOf(level) === LEVELS.length - 1 ? '自由実験室へ ▶' : '次へ ▶';
  $('#win').classList.remove('hidden');
  [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => blip(f, 0.3, 'triangle', 0.06), k * 110));
  for (let k = 0; k < 160; k++) addP({ x: st.w / 2, y: st.h / 2, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.9) * 4.8, c: `hsl(${Math.random() * 360} 90% 65%)`, life: 110, max: 110, size: 1.8, g: 0.08 });
}

// ---------- 描画 ----------
function draw(now: number) {
  if (!st) return;
  const W = st.w, H = st.h, S = cam.s, sc = st.S;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#070914'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.shadowColor = '#0008'; ctx.shadowBlur = 30 * dpr;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W * S, H * S);
  ctx.shadowBlur = 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, W * S, H * S);
  if (glow && viewMode === 'mat') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.filter = `blur(${Math.max(2, S * 1.6 * sc)}px)`;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glowC, 0, 0, W * S, H * S);
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (S > 14) {
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= W; x++) { ctx.moveTo(x * S, 0); ctx.lineTo(x * S, H * S); }
    for (let y = 0; y <= H; y++) { ctx.moveTo(0, y * S); ctx.lineTo(W * S, y * S); }
    ctx.stroke();
  }
  const L = S * sc; // 論理座標1マスの画面サイズ
  for (const d of level.drains) {
    const grd = ctx.createLinearGradient(0, d.y * L, 0, (d.y + d.h + 3) * L);
    grd.addColorStop(0, '#ff2d6a88'); grd.addColorStop(1, '#ff2d6a00');
    ctx.fillStyle = grd; ctx.fillRect(d.x * L, (d.y - 1) * L, d.w * L, (d.h + 4) * L);
  }
  level.goals.forEach((g, k) => {
    if (g.mode === 'stat') return;
    const need = g.need * sc * sc;
    const done = st!.progress[k] >= need;
    const col = done ? '#7dffa8' : '#ffe36e';
    ctx.save();
    ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr; ctx.shadowColor = col; ctx.shadowBlur = 14 * dpr;
    ctx.strokeRect(g.x * L, g.y * L, g.w * L, g.h * L);
    ctx.fillStyle = col + '14'; ctx.fillRect(g.x * L, g.y * L, g.w * L, g.h * L);
    const p = Math.min(1, st!.progress[k] / need);
    ctx.fillStyle = col + '30'; ctx.fillRect(g.x * L, (g.y + g.h * (1 - p)) * L, g.w * L, g.h * p * L);
    ctx.restore();
    ctx.font = `bold ${12 * dpr}px system-ui, sans-serif`; ctx.fillStyle = col;
    ctx.fillText(`${done ? '✔' : '◎'} ${g.label} ${Math.floor(p * 100)}%`, g.x * L, g.y * L - 6 * dpr);
  });
  level.sources.forEach((src, k) => {
    const alive = (st!.emitted[k] ?? 0) < src.total * sc * sc;
    const c = alive ? css(src.mats[0]) : '#555';
    const r = (1.6 + (st!.flowing && alive ? Math.sin(now / 120) * 0.25 : 0)) * L;
    const cx = (src.x + 0.5) * L, cy = (src.y - 1.5) * L;
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = alive ? 16 * dpr : 0;
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    if (src.mats.length > 1) { ctx.fillStyle = css(src.mats[1]); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#fff9'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  });
  // ポンプ
  const drawPort = (x: number, y: number, c: string, label: string) => {
    ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc((x + 0.5) * S, (y + 0.5) * S, 2.6 * L, 0, 7); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    ctx.font = `bold ${11 * dpr}px system-ui`; ctx.fillStyle = '#fff'; ctx.fillText(label, (x + 0.5) * S + 3 * L, (y + 0.5) * S);
  };
  for (const p of st.pumps) {
    ctx.save();
    ctx.strokeStyle = '#9dffb8aa'; ctx.lineWidth = Math.max(2, L * 0.7); ctx.setLineDash([L * 1.5, L]); ctx.lineDashOffset = -now / 25;
    ctx.beginPath(); ctx.moveTo((p.ax + 0.5) * S, (p.ay + 0.5) * S); ctx.lineTo((p.bx + 0.5) * S, (p.by + 0.5) * S); ctx.stroke();
    ctx.restore();
    drawPort(p.ax, p.ay, '#ff9d5c', '吸'); drawPort(p.bx, p.by, '#5cc8ff', '吐');
  }
  if (st.pendingPump) {
    const pp = st.pendingPump;
    drawPort(pp.x, pp.y, '#ff9d5c', '吸');
    if (hover[0] >= 0) { ctx.strokeStyle = '#9dffb866'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo((pp.x + 0.5) * S, (pp.y + 0.5) * S); ctx.lineTo((hover[0] + 0.5) * S, (hover[1] + 0.5) * S); ctx.stroke(); ctx.setLineDash([]); }
  }
  // 外周（見えない境界）
  if (sandbox) { ctx.save(); ctx.strokeStyle = '#ffffff22'; ctx.setLineDash([3 * dpr, 5 * dpr]); ctx.lineWidth = 1 * dpr; ctx.strokeRect(S * 0.5, S * 0.5, (st.w - 1) * S, (st.h - 1) * S); ctx.restore(); }
  // 選択中の装置・ポンプ
  for (const d of st.devices) if (selKey === `d:${d.uid}` && d.kind !== 'proc') {
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.lineDashOffset = -now / 40;
    ctx.strokeRect((d.x - sc) * S - 3, (d.y - sc) * S - 3, 3 * sc * S + 6, 3 * sc * S + 6); ctx.restore();
  }
  for (const p of st.pumps) if (selKey.startsWith('p') && Number(selKey.split(':')[1]) === p.uid) {
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * dpr;
    for (const [x, y, e] of [[p.ax, p.ay, 'a'], [p.bx, p.by, 'b']] as const) { if (selKey.startsWith('pe:') && !selKey.endsWith(e)) continue; ctx.beginPath(); ctx.arc((x + 0.5) * S, (y + 0.5) * S, 3.2 * L, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
  // 循環装置：記号とポート
  for (const p of st.procs) {
    const h = p.size >> 1;
    const x0 = (p.x - h - 0.5) * S, y0 = (p.y - h - 0.5) * S, sz = p.size * S;
    ctx.save();
    ctx.font = `bold ${Math.max(9, sz * 0.38)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2a0b22'; ctx.fillText(PROCESSES[p.mode].sym, x0 + sz / 2, y0 + sz / 2);
    const mine = selKey === `d:${p.uid}` || selKey.startsWith(`port:${p.uid}:`);
    if (S * sc > 5 || mine) {
      const d = Math.max(2, h);
      ['#ffd27a', '#7dffa8', '#7fd3ff'].forEach((col, k) => {
        const [dx, dy] = p.ports[k]; const horiz = Math.abs(dx) >= Math.abs(dy);
        const cx = (p.x + dx + 0.5) * S, cy = (p.y + dy + 0.5) * S, hw = (horiz ? d : p.size) * S / 2, hh = (horiz ? p.size : d) * S / 2;
        const on = selKey === `port:${p.uid}:${['in', 'out', 'aux'][k]}`;
        ctx.globalAlpha = on || mine ? 0.95 : 0.5; ctx.lineWidth = (on ? 2.5 : 1.5) * dpr; ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.strokeStyle = col;
        if (p.moved) { ctx.beginPath(); ctx.moveTo(x0 + sz / 2, y0 + sz / 2); ctx.lineTo(cx, cy); ctx.stroke(); }
        ctx.strokeRect(cx - hw, cy - hh, 2 * hw, 2 * hh);
        if (mine) { ctx.setLineDash([]); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, (on ? 1.4 : 1) * L, 0, 7); ctx.fill(); }
      });
      ctx.setLineDash([]);
    }
    if (mine) { ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x0 - 3, y0 - 3, sz + 6, sz + 6); }
    ctx.restore();
    if (hover[0] >= 0 && Math.abs(hover[0] - p.x) <= p.size && Math.abs(hover[1] - p.y) <= p.size) {
      ctx.font = `bold ${11 * dpr}px system-ui`; ctx.fillStyle = '#fff';
      ctx.fillText(`${PROCESSES[p.mode].name}：${p.status || '待機'}（${p.count}回）`, x0, y0 - 6 * dpr);
    }
  }
  // 機構：モーター・関節
  for (const n of st.nodes) {
    const sel = n.id === selected;
    if (n.type === 'rotor') {
      const r = 1.8 * L;
      ctx.save(); ctx.translate(n.x * S, n.y * S);
      ctx.fillStyle = sel ? '#ffffffcc' : '#7fd3ffcc'; ctx.strokeStyle = '#08111f'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.rotate(n.a); ctx.strokeStyle = '#08111f'; ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath();
      const a0 = n.dir > 0 ? -0.6 : 0.6; ctx.arc(n.x * S, n.y * S, r * 1.6, a0, a0 + n.dir * 1.6, n.dir < 0); ctx.stroke();
    } else if (n.type === 'piston') {
      ctx.save();
      ctx.strokeStyle = '#ffd27a55'; ctx.lineWidth = 3 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(n.x * S, n.y * S); ctx.lineTo((n.x + Math.cos(n.a) * n.amp) * S, (n.y + Math.sin(n.a) * n.amp) * S); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = sel ? '#fff' : '#ffd27a'; ctx.lineWidth = Math.max(3 * dpr, L * 0.9);
      ctx.beginPath(); ctx.moveTo(n.x * S, n.y * S); ctx.lineTo(n.tx * S, n.ty * S); ctx.stroke();
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(n.x * S - L, n.y * S - L, 2 * L, 2 * L);
      ctx.beginPath(); ctx.arc(n.tx * S, n.ty * S, 0.9 * L, 0, 7); ctx.fill();
      if (sel) {
        // ストロークのつまみ（◇）
        const [hx, hy] = pistonHandle(n);
        ctx.translate((hx + 0.0) * S, hy * S); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2 * dpr;
        ctx.fillRect(-1.1 * L, -1.1 * L, 2.2 * L, 2.2 * L); ctx.strokeRect(-1.1 * L, -1.1 * L, 2.2 * L, 2.2 * L);
      }
      ctx.restore();
    } else {
      if (n.parent > 0) {
        ctx.fillStyle = n.joint === 'spring' ? '#9dffb8' : n.joint === 'free' ? '#ffb340' : '#ffffffaa';
        ctx.beginPath(); ctx.arc(n.x * S, n.y * S, 0.8 * L, 0, 7); ctx.fill();
      }
      if (sel) {
        ctx.save(); ctx.translate(n.x * S, n.y * S); ctx.rotate(n.a);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]);
        if (n.type === 'circle') { ctx.beginPath(); ctx.arc(0, 0, n.r * S + 3, 0, 7); ctx.stroke(); }
        else ctx.strokeRect((n.bx - n.w / 2) * S - 2, -n.h / 2 * S - 2, n.w * S + 4, n.h * S + 4);
        ctx.restore();
      }
    }
  }
  // 直線・矩形のプレビュー（筆の太さ）
  if (shapeStart && hover[0] >= 0) {
    const tdef = TOOLS.find((t) => t.tool === tool); const col = tdef?.color ?? '#fff';
    const isMat = tool.startsWith('mat:') || tool === 'air', th = isMat ? (2 * brush + 3) : brush + 1, off = isMat ? 0.5 : (brush >> 1) - (brush + 1) / 2 + 0.5;
    ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.fillStyle = col;
    if (drawMode === 'line') { ctx.lineWidth = th * S; ctx.lineCap = isMat ? 'round' : 'square'; ctx.beginPath(); ctx.moveTo((shapeStart[0] + 0.5) * S, (shapeStart[1] + 0.5) * S); ctx.lineTo((hover[0] + 0.5) * S, (hover[1] + 0.5) * S); ctx.stroke(); }
    else { const x0 = Math.min(shapeStart[0], hover[0]), y0 = Math.min(shapeStart[1], hover[1]); ctx.fillRect((x0 - (isMat ? brush + 1 : 0)) * S, (y0 - (isMat ? brush + 1 : 0)) * S, (Math.abs(hover[0] - shapeStart[0]) + (isMat ? 2 * brush + 3 : brush + 1)) * S, (Math.abs(hover[1] - shapeStart[1]) + (isMat ? 2 * brush + 3 : brush + 1)) * S); }
    ctx.restore(); void off;
  }
  // 範囲消しの枠
  if (region && region.pts.length) {
    ctx.save(); ctx.strokeStyle = '#ff8a8a'; ctx.fillStyle = '#ff8a8a22'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.lineDashOffset = -now / 30;
    ctx.beginPath();
    if (region.mode === 'rect') { const [a, b] = [region.pts[0], region.pts[region.pts.length - 1]]; const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]); ctx.rect(x0 * S, y0 * S, (Math.abs(b[0] - a[0]) + 1) * S, (Math.abs(b[1] - a[1]) + 1) * S); }
    else { region.pts.forEach(([x, y], k) => (k ? ctx.lineTo((x + 0.5) * S, (y + 0.5) * S) : ctx.moveTo((x + 0.5) * S, (y + 0.5) * S))); ctx.closePath(); }
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // ドラッグ中の板・ピストン
  if (dragStart && hover[0] >= 0) {
    ctx.strokeStyle = tool === 'plate' ? css(M.MOVER) : '#ffd27a'; ctx.lineWidth = Math.max(2, L); ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo((dragStart[0] + 0.5) * S, (dragStart[1] + 0.5) * S); ctx.lineTo((hover[0] + 0.5) * S, (hover[1] + 0.5) * S); ctx.stroke();
    ctx.globalAlpha = 1;
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
    const b = brush;
    ctx.strokeStyle = tool === 'erase' ? '#ff8a8a' : '#ffffffcc'; ctx.lineWidth = 1.5 * dpr;
    if (isDeviceTool(tool)) ctx.strokeRect((hover[0] - sc) * S, (hover[1] - sc) * S, 3 * sc * S, 3 * sc * S);
    else if (tool === 'wall' || tool === 'guide') ctx.strokeRect((hover[0] - (b >> 1)) * S, (hover[1] - (b >> 1)) * S, (b + 1) * S, (b + 1) * S);
    else if (tool === 'filter') ctx.strokeRect(hover[0] * S, hover[1] * S, 2 * sc * S, 2 * sc * S);
    else if (['rotor', 'piston', 'plate', 'select', 'disc'].includes(tool)) { ctx.beginPath(); ctx.arc((hover[0] + 0.5) * S, (hover[1] + 0.5) * S, 2.5 * L, 0, 7); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc((hover[0] + 0.5) * S, (hover[1] + 0.5) * S, (b + 1.5) * S, 0, 7); ctx.stroke(); }
  }
  ctx.restore();
}

// ---------- ループ（Worker に計算と描画を依頼し、戻ってきた画像を表示） ----------
let acc = 0, prevT = performance.now(), fpsT = 0, frames = 0, hudT = 0, owed = 0;
function loop(now: number) {
  if (st && !$('#play').classList.contains('hidden')) {
    acc += Math.min(now - prevT, 100);
    while (acc >= 1000 / 60) { if (!paused && st.flowing !== undefined) owed += speed; acc -= 1000 / 60; }
    if (paused) owed = 0;
    if (!frameBusy && img) {
      const n = Math.min(owed, 8); owed = Math.min(owed - n, 8);
      const b = buf ?? new ArrayBuffer(st.w * st.h * 4), gb = gbuf ?? new ArrayBuffer(st.w * st.h * 4);
      if (b.byteLength !== st.w * st.h * 4 || gb.byteLength !== st.w * st.h * 4) { buf = null; gbuf = null; }
      else {
        buf = null; gbuf = null; frameBusy = true;
        send({ type: 'frame', ticks: n, viewMode, now, buf: b, gbuf: gb, hover }, [b, gb]);
      }
    }
    draw(now);
    if (now - hudT > 150) { hud(); inspect(); hudT = now; }
    frames++;
    if (now - fpsT > 1000) { $('#perf').textContent = `${frames} fps ・ ${st.simMs.toFixed(2)} ms/tick（${st.w}×${st.h}・Worker・稼働チャンク ${st.awake}/${st.chunks}）`; frames = 0; fpsT = now; }
  }
  prevT = now;
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => { if (st) { resize(); fit(); } });

// 浮かぶウィンドウ（負の座標は右端・下端から）
initWindows($('#layout'), [
  { id: 'w-palette', title: '道具', x: 8, y: 8, w: 222, h: 560 },
  { id: 'eraseBox', title: '消しゴムの対象', x: 238, y: 8, w: 270, h: 440 },
  { id: 'w-status', title: '目標・評価・手持ち', x: -8, y: 8, w: 252, h: 330 },
  { id: 'w-tree', title: '配置したもの', x: -8, y: 346, w: 252, h: 240 },
  { id: 'nodeBox', title: '選択中の調整', x: -268, y: 8, w: 250, h: 360 },
  { id: 'w-view', title: '表示・設定', x: -8, y: -8, w: 252, h: 330, min: true },
]);
$('#resetLayout').onclick = () => { resetLayout(); toast('ウィンドウの配置を元に戻した'); };
$('#labResize').onclick = doLabResize;

showMenu();
requestAnimationFrame(loop);
// テスト用フック（Worker 越しに操作する）
(window as unknown as Record<string, unknown>).__sa = {
  get state() { return st; }, get level() { return level; }, get lastWin() { return lastWin; },
  startLevel: (id: string) => startLevel(id === 'sandbox' ? SANDBOX : LEVELS.find((l) => l.id === id)!), op, toggleFlow,
  LEVELS: LEVELS.map((l) => l.id), setSpeed: (v: number) => { speed = v; }, setTool: (t: Tool) => { tool = t; buildPalette(); }, select: (id: number) => { selected = id; renderNodePanel(); }, selectKey: (k: string) => setSel(k), toScreen: (x: number, y: number) => { const r = canvas.getBoundingClientRect(); return [r.left + (cam.x + (x + 0.5) * cam.s) / dpr, r.top + (cam.y + (y + 0.5) * cam.s) / dpr]; }, get selKey() { return selKey; },
  thresholds: (id: string) => starThresholds(LEVELS.find((l) => l.id === id)!),
};
void DEVICE_MAT;
