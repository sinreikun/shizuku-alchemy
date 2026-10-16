// ゲーム進行（DOMに依存しない。テストからも使う）
import { Sim, M, MATS } from './sim';

export type Tool = 'wall' | 'erase' | 'heater' | 'cooler' | 'igniter' | 'electro' | 'filter' | 'pump' | 'air' | `mat:${number}`;
export type DeviceTool = 'heater' | 'cooler' | 'igniter' | 'electro';
export const DEVICE_MAT: Record<DeviceTool, number> = { heater: M.HEATER, cooler: M.COOLER, igniter: M.IGNITER, electro: M.ELECTRO };

export interface Rect { x: number; y: number; w: number; h: number }
export interface Source { x: number; y: number; mats: number[]; rate: number; total: number }
export type StatKey = 'burned' | 'dissolved' | 'crystallized' | 'split';
export interface Goal extends Rect { mat: number; need: number; mode: 'absorb' | 'fill' | 'stat'; label: string; stat?: StatKey }
export interface Inventory { ink: number; heater: number; cooler: number; igniter: number; electro: number; filter: number; pump: number }

export interface Level {
  id: string; chapter: string; title: string; story: string; hint: string; learn: string;
  w?: number; h?: number;
  inv: Partial<Inventory>; filterMat?: number;
  sources: Source[]; goals: Goal[]; drains: Rect[];
  build: (s: Sim) => void;
  /** 自動検証用の解答手順（放水前に配置する） */
  solve?: (g: Game) => void;
  /** ★3を狙える節約解（星の基準になる） */
  eco?: (g: Game) => void;
  /** 素朴な近道（これではクリアできないことをテストする） */
  naive?: { desc: string; run: (g: Game) => void }[];
  /** 解答の最大ティック数 */
  limit?: number;
}

interface Device { kind: DeviceTool; x: number; y: number }

const replaceable = (o: number, sandbox: boolean, devices = false) => {
  if (o === M.EMPTY) return true;
  const k = MATS[o].kind;
  if (sandbox) return k !== 'static' && k !== 'device';
  return k === 'gas' || (devices && (k === 'liquid' || k === 'powder'));
};

const EMPTY_INV: Inventory = { ink: 0, heater: 0, cooler: 0, igniter: 0, electro: 0, filter: 0, pump: 0 };

export class Game {
  sim: Sim;
  inv: Inventory;
  devices: Device[] = [];
  emitted: number[] = [];
  progress: number[] = [];
  flowing = false;
  won = false;
  ticks = 0;
  sandbox: boolean;
  filterMat: number;
  brush = 1;
  pendingPump: { x: number; y: number } | null = null;
  private undoStack: ReturnType<Game['snap']>[] = [];
  private redoStack: ReturnType<Game['snap']>[] = [];
  onAbsorb?: (x: number, y: number, mat: number) => void;

  constructor(public level: Level, sandbox = false, seed = 7) {
    this.sandbox = sandbox;
    this.sim = new Sim(level.w ?? 160, level.h ?? 100, seed);
    this.inv = { ...EMPTY_INV };
    this.filterMat = level.filterMat ?? M.WATER;
    this.reset(false);
  }

  reset(keepBuild: boolean) {
    const { sim, level } = this;
    const keep: [number, number, number][] = [];
    if (keepBuild) for (let i = 0; i < sim.n; i++) { const m = sim.t[i]; if (m === M.PWALL || m === M.FILTER || MATS[m].kind === 'device') keep.push([i, m, sim.aux[i]]); }
    const pumps = keepBuild ? sim.pumps.map((p) => ({ ...p, moved: 0 })) : [];
    sim.clear(); level.build(sim);
    for (const [i, m, a] of keep) { sim.t[i] = m; sim.temp[i] = MATS[m].temp; sim.aux[i] = a; }
    sim.pumps = pumps;
    if (!keepBuild) {
      this.inv = this.sandbox ? { ink: Infinity, heater: Infinity, cooler: Infinity, igniter: Infinity, electro: Infinity, filter: Infinity, pump: Infinity } : { ...EMPTY_INV, ...level.inv };
      this.devices = [];
    }
    this.emitted = level.sources.map(() => 0);
    this.progress = level.goals.map(() => 0);
    this.flowing = this.sandbox; this.won = false; this.ticks = 0; this.pendingPump = null;
    sim.stats = { burned: 0, dissolved: 0, crystallized: 0, split: 0 };
  }

  private snap() { return { sim: this.sim.snapshot(), inv: { ...this.inv }, devices: this.devices.map((d) => ({ ...d })) }; }
  pushUndo() { this.undoStack.push(this.snap()); if (this.undoStack.length > 40) this.undoStack.shift(); this.redoStack = []; }
  undo() { const s = this.undoStack.pop(); if (!s) return false; this.redoStack.push(this.snap()); this.load(s); return true; }
  redo() { const s = this.redoStack.pop(); if (!s) return false; this.undoStack.push(this.snap()); this.load(s); return true; }
  private load(s: ReturnType<Game['snap']>) { this.sim.restore(s.sim); this.inv = { ...s.inv }; this.devices = s.devices.map((d) => ({ ...d })); }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** 1点への道具の適用。戻り値は変化したか */
  apply(tool: Tool, x: number, y: number, erase = false): boolean {
    const s = this.sim;
    if (erase || tool === 'erase') return this.eraseAt(x, y);
    if (tool === 'wall') {
      let ch = false;
      const r = this.brush;
      for (let j = 0; j < r + 1; j++) for (let i = 0; i < r + 1; i++) {
        const cx = x + i - (r >> 1), cy = y + j - (r >> 1);
        if (this.inv.ink <= 0) return ch;
        const o = s.get(cx, cy);
        if (replaceable(o, this.sandbox)) { s.set(cx, cy, M.PWALL); this.inv.ink--; ch = true; }
      }
      return ch;
    }
    if (tool === 'filter') {
      let ch = false;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        if (this.inv.filter <= 0) return ch;
        const o = s.get(x + i, y + j);
        if (replaceable(o, this.sandbox)) { s.set(x + i, y + j, M.FILTER, this.filterMat); this.inv.filter--; ch = true; }
      }
      return ch;
    }
    if (tool === 'pump') {
      if (this.inv.pump <= 0) return false;
      if (!this.pendingPump) { this.pendingPump = { x, y }; return true; }
      s.pumps.push({ ax: this.pendingPump.x, ay: this.pendingPump.y, bx: x, by: y, rate: 3, moved: 0 });
      this.pendingPump = null; this.inv.pump--; return true;
    }
    if (tool in DEVICE_MAT) {
      const k = tool as DeviceTool;
      if (this.inv[k] <= 0) return false;
      let ok = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = s.get(x + i, y + j); if (replaceable(o, this.sandbox, true)) ok++; }
      if (ok < 9) return false;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s.set(x + i, y + j, DEVICE_MAT[k]);
      this.devices.push({ kind: k, x, y }); this.inv[k]--;
      return true;
    }
    // 自由実験室：物質を塗る
    if (!this.sandbox) return false;
    const r = this.brush + 1;
    let ch = false;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r * r) continue;
      const cx = x + i, cy = y + j;
      if (s.get(cx, cy) !== M.EMPTY) continue;
      if (tool === 'air') { if (s.rnd01() < 0.5) { s.set(cx, cy, s.rnd01() < 0.23 ? M.OXYGEN : M.NITROGEN); ch = true; } continue; }
      const m = Number(tool.slice(4));
      const k = MATS[m].kind;
      if (k === 'static' || s.rnd01() < (k === 'gas' ? 0.4 : 0.7)) { s.set(cx, cy, m); ch = true; }
    }
    return ch;
  }

  private eraseAt(x: number, y: number): boolean {
    const s = this.sim; let ch = false;
    // ポンプ
    const pi = s.pumps.findIndex((p) => Math.hypot(p.ax - x, p.ay - y) < 3 || Math.hypot(p.bx - x, p.by - y) < 3);
    if (pi >= 0) { s.pumps.splice(pi, 1); this.inv.pump++; ch = true; }
    const di = this.devices.findIndex((d) => Math.abs(d.x - x) <= 1 && Math.abs(d.y - y) <= 1);
    if (di >= 0) {
      const d = this.devices[di];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s.set(d.x + i, d.y + j, M.EMPTY);
      this.devices.splice(di, 1); this.inv[d.kind]++; return true;
    }
    const r = this.brush + 1;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r * r) continue;
      const cx = x + i, cy = y + j, o = s.get(cx, cy);
      if (o === M.PWALL) { s.set(cx, cy, M.EMPTY); this.inv.ink++; ch = true; }
      else if (o === M.FILTER) { s.set(cx, cy, M.EMPTY); this.inv.filter++; ch = true; }
      else if (this.sandbox && o !== M.EMPTY && o !== M.WALL && MATS[o].kind !== 'device') { s.set(cx, cy, M.EMPTY); ch = true; }
      else if (this.sandbox && MATS[o].kind === 'device') { s.set(cx, cy, M.EMPTY); ch = true; }
    }
    return ch;
  }

  /** 線分で道具を適用 */
  stroke(tool: Tool, x0: number, y0: number, x1: number, y1: number, erase = false) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    let ch = false;
    for (let k = 0; k <= n; k++) ch = this.apply(tool, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), erase) || ch;
    return ch;
  }
  rect(tool: Tool, x: number, y: number, w: number, h: number) { for (let j = y; j < y + h; j += 2) this.stroke(tool, x, j, x + w - 1, j); }

  start() { this.flowing = true; }

  tick() {
    const { sim, level } = this;
    if (this.flowing && !this.won) {
      level.sources.forEach((src, k) => {
        for (let n = 0; n < src.rate && this.emitted[k] < src.total; n++) {
          const x = src.x + ((sim.rnd01() * 5) | 0) - 2;
          const o = sim.get(x, src.y);
          if (o === M.EMPTY || MATS[o].kind === 'gas') { sim.set(x, src.y, src.mats[this.emitted[k] % src.mats.length]); this.emitted[k]++; }
        }
      });
    }
    sim.step();
    this.ticks++;
    for (const d of level.drains) for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) {
      const i = y * sim.w + x; const m = sim.t[i]; if (MATS[m].kind !== 'static' && MATS[m].kind !== 'device') sim.t[i] = M.EMPTY;
    }
    level.goals.forEach((g, k) => {
      if (g.mode === 'absorb') {
        for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) {
          const i = y * sim.w + x;
          if (sim.t[i] === g.mat) { sim.t[i] = M.EMPTY; this.progress[k]++; this.onAbsorb?.(x, y, g.mat); }
        }
      } else if (g.mode === 'stat') {
        this.progress[k] = sim.stats[g.stat!];
      } else {
        let c = 0;
        for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) if (sim.t[y * sim.w + x] === g.mat) c++;
        this.progress[k] = c;
      }
    });
    if (!this.won && !this.sandbox && level.goals.length && level.goals.every((g, k) => this.progress[k] >= g.need)) this.won = true;
  }

  get sourcesLeft() { return this.level.sources.reduce((a, s, k) => a + Math.max(0, s.total - this.emitted[k]), 0); }

  /** 資源コスト：インク・選択膜1セル=1、装置1個=40 */
  cost() {
    const base = this.level.inv; let c = 0;
    for (const k of Object.keys(base) as (keyof Inventory)[]) { const b = base[k] ?? 0; if (!b || b === Infinity) continue; c += (b - this.inv[k]) * COST_WEIGHT[k]; }
    return c;
  }

  /** 星：ステージごとの基準コスト（節約解から算出）と比べる */
  starScore() {
    const th = starThresholds(this.level);
    const cost = this.cost();
    return { cost, ...th, stars: cost <= th.three ? 3 : cost <= th.two ? 2 : 1 };
  }
}

export const COST_WEIGHT: Record<keyof Inventory, number> = { ink: 1, filter: 1, heater: 40, cooler: 40, igniter: 40, electro: 40, pump: 40 };
const thCache = new Map<string, { eco: number; three: number; two: number }>();
/** 節約解のコストに余裕を持たせて ★3/★2 の基準を決める */
export function starThresholds(level: Level) {
  const hit = thCache.get(level.id); if (hit) return hit;
  let eco = 0;
  if (level.eco) { const g = new Game(level); level.eco(g); eco = g.cost(); }
  const r = { eco, three: Math.ceil(eco * 1.3 + 10), two: Math.ceil(eco * 2 + 40) };
  thCache.set(level.id, r); return r;
}
