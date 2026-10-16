// 浮かぶウィンドウ：タイトルでドラッグ、右下でサイズ変更、その場で最小化。配置は localStorage に保存
export interface WinDef { id: string; title: string; x: number; y: number; w: number; h: number; min?: boolean }
interface WinState { x: number; y: number; w: number; h: number; min: boolean }

const KEY = 'shizuku-alchemy-layout-v1';
const mobile = () => innerWidth < 760;
let defs: WinDef[] = [];
let layout: Record<string, WinState> = {};
let z = 20;
let host: HTMLElement;
let mode = '';

function load(): Record<string, WinState> {
  try { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); return all[mobile() ? 'm' : 'd'] || {}; } catch { return {}; }
}
function save() {
  try { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[mobile() ? 'm' : 'd'] = layout; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 保存できなくても動く */ }
}
/** 既定の配置（負の x / y は右端・下端から） */
function defaultOf(d: WinDef): WinState {
  const W = host.clientWidth, H = host.clientHeight;
  if (mobile()) {
    // スマホ：道具は下に全幅、ほかはタイトルだけにして上に並べる
    const k = defs.indexOf(d);
    if (d.id === 'w-palette') return { x: 4, y: Math.max(40, H - 170), w: W - 8, h: 164, min: false };
    return { x: 4 + (k % 2) * (W / 2), y: 4 + Math.floor(k / 2) * 34, w: Math.min(W - 8, 300), h: Math.min(320, H * 0.5), min: true };
  }
  return { x: d.x < 0 ? W + d.x - d.w : d.x, y: d.y < 0 ? H + d.y - d.h : d.y, w: d.w, h: d.h, min: !!d.min };
}
function clamp(s: WinState): WinState {
  const W = host.clientWidth, H = host.clientHeight;
  const w = Math.max(150, Math.min(s.w, W)), h = Math.max(60, Math.min(s.h, H));
  return { ...s, w, h, x: Math.max(-(w - 70), Math.min(s.x, W - 70)), y: Math.max(0, Math.min(s.y, H - 30)) };
}
function apply(id: string) {
  const el = document.getElementById(id)!; const s = layout[id];
  el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; el.style.width = s.w + 'px';
  el.style.height = s.min ? '' : s.h + 'px';
  el.classList.toggle('min', s.min);
  const b = el.querySelector('.fmin'); if (b) { b.textContent = s.min ? '▢' : '－'; b.setAttribute('title', s.min ? '元に戻す' : '最小化'); }
}
/** 指先・マウス共通のドラッグ */
function drag(handle: HTMLElement, el: HTMLElement, onMove: (dx: number, dy: number, s0: WinState) => void) {
  handle.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button') && handle.classList.contains('fhead')) return;
    e.preventDefault(); handle.setPointerCapture(e.pointerId);
    el.style.zIndex = String(++z);
    const sx = e.clientX, sy = e.clientY, s0 = { ...layout[el.id] };
    const mv = (ev: PointerEvent) => { onMove(ev.clientX - sx, ev.clientY - sy, s0); layout[el.id] = clamp(layout[el.id]); apply(el.id); };
    const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); save(); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
}

export function initWindows(root: HTMLElement, list: WinDef[]) {
  host = root; defs = list; layout = load(); mode = mobile() ? 'm' : 'd';
  for (const d of list) {
    const el = document.getElementById(d.id)!;
    el.classList.add('fwin');
    const head = document.createElement('div'); head.className = 'fhead';
    head.innerHTML = `<span class="ftitle">${d.title}</span><button class="fmin" title="最小化">－</button>`;
    const body = document.createElement('div'); body.className = 'fbody';
    while (el.firstChild) body.appendChild(el.firstChild);
    const grip = document.createElement('div'); grip.className = 'fgrip'; grip.title = 'サイズ変更';
    el.append(head, body, grip);
    el.addEventListener('pointerdown', () => { el.style.zIndex = String(++z); });
    head.querySelector('.fmin')!.addEventListener('click', () => { layout[d.id].min = !layout[d.id].min; layout[d.id] = clamp(layout[d.id]); apply(d.id); save(); });
    head.addEventListener('dblclick', () => { layout[d.id].min = !layout[d.id].min; apply(d.id); save(); });
    drag(head, el, (dx, dy, s0) => { layout[d.id] = { ...layout[d.id], x: s0.x + dx, y: s0.y + dy }; });
    drag(grip, el, (dx, dy, s0) => { layout[d.id] = { ...layout[d.id], w: s0.w + dx, h: s0.h + dy, min: false }; });
  }
  place();
  addEventListener('resize', () => {
    if (!host.clientWidth) return;
    const m = mobile() ? 'm' : 'd'; if (m !== mode) { mode = m; layout = load(); } for (const d of defs) { layout[d.id] = clamp(layout[d.id] ?? defaultOf(d)); apply(d.id); } });
}
/** 配置を決める（保存がなければ既定） */
export function place() {
  if (!host || !host.clientWidth) return;
  for (const d of defs) { layout[d.id] = clamp(layout[d.id] ?? defaultOf(d)); apply(d.id); }
}
export function resetLayout() {
  layout = {}; for (const d of defs) layout[d.id] = clamp(defaultOf(d));
  for (const d of defs) apply(d.id);
  save();
}
export function setMinimized(id: string, min: boolean) { if (!layout[id]) return; layout[id].min = min; apply(id); save(); }
export function winState(id: string) { return layout[id] ? { ...layout[id] } : null; }
