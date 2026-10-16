// ゲーム進行（DOMに依存しない。テスト・Web Worker から使う）
import { Sim, M, MATS, KIND, PROCESS_MODES, PROCESSES, PORT_NAMES, portOffset, defaultPortOffset, clampPortOffset, type ProcessMode, type Pump, type PortName } from './sim';
import { Mech, newNode, JOINT_NAMES, type MechNode } from './mech';

/** 置いた物の名前の元になる呼び名 */
export const OBJ_LABEL: Record<string, string> = {
  rotor: '回転モーター', piston: 'ピストン', rect: '可動板', circle: '可動円盤',
  heater: 'ヒーター', cooler: 'クーラー', igniter: '着火器', electro: '簡易電解板', pump: 'ポンプ',
};
/** 配置物ツリーの1項目。key は 'n:<機構id>' 'd:<装置uid>' 'p:<ポンプuid>' 'pe:<uid>:a|b' 'port:<uid>:in|out|aux' */
export interface TreeItem { key: string; name: string; kind: string; sub?: string; fixed?: boolean; children: TreeItem[] }
const PORTS: PortName[] = ['in', 'out', 'aux'];

/** 解像度倍率：ステージは論理座標で設計し、実セルは SCALE 倍 */
export const SCALE = 2;

export type Tool = 'wall' | 'erase' | 'heater' | 'cooler' | 'igniter' | 'electro' | 'filter' | 'pump' | 'air' | 'guide'
  | 'rotor' | 'piston' | 'plate' | 'disc' | 'select' | `proc:${ProcessMode}` | `mat:${number}`;
export type DeviceTool = 'heater' | 'cooler' | 'igniter' | 'electro';
export const DEVICE_MAT: Record<DeviceTool, number> = { heater: M.HEATER, cooler: M.COOLER, igniter: M.IGNITER, electro: M.ELECTRO };
export const isDeviceTool = (t: string) => t in DEVICE_MAT || t.startsWith('proc:');

export interface Rect { x: number; y: number; w: number; h: number }
export interface Source { x: number; y: number; mats: number[]; rate: number; total: number }
export type StatKey = 'burned' | 'dissolved' | 'crystallized' | 'split' | 'synthesized' | 'regenerated' | 'extracted' | 'recovered';
export interface Goal extends Rect { mat: number; need: number; mode: 'absorb' | 'fill' | 'stat'; label: string; stat?: StatKey }
export interface Inventory {
  ink: number; heater: number; cooler: number; igniter: number; electro: number; filter: number; pump: number;
  guide: number; rotor: number; piston: number; plate: number; proc: number;
}
export const INV_KEYS: (keyof Inventory)[] = ['ink', 'heater', 'cooler', 'igniter', 'electro', 'filter', 'pump', 'guide', 'rotor', 'piston', 'plate', 'proc'];
/** セル数で数える資源（解像度に合わせて SCALE² 倍する） */
const CELL_RES: (keyof Inventory)[] = ['ink', 'filter', 'guide', 'plate'];

/** ステージ組み立て用の筆（論理座標で塗ると SCALE×SCALE のブロックになる） */
export interface Painter {
  w: number; h: number; S: number;
  set(x: number, y: number, m: number): void;
  get(x: number, y: number): number;
  rnd01(): number;
  /** 実セル単位で塗る（気体の粒感を残す） */
  fillReal(x: number, y: number, w: number, h: number, pick: () => number): void;
}

export interface Level {
  id: string; chapter: string; title: string; story: string; hint: string; learn: string;
  w?: number; h?: number;
  inv: Partial<Inventory>; filterMat?: number;
  /** 使える循環装置の方式 */
  procModes?: ProcessMode[];
  /** ピストンの最大の伸び（論理セル） */
  maxAmp?: number;
  sources: Source[]; goals: Goal[]; drains: Rect[];
  build: (s: Painter) => void;
  /** 最初から置かれている機構（論理座標）。プレイヤーは消せない */
  mech?: (g: Game) => void;
  /** 自動検証用の解答手順（放水前に配置する） */
  solve?: (g: Game) => void;
  /** ★3を狙える節約解（星の基準になる） */
  eco?: (g: Game) => void;
  /** 素朴な近道（これではクリアできないことをテストする） */
  naive?: { desc: string; run: (g: Game) => void }[];
  /** 解答の最大ティック数 */
  limit?: number;
}

export interface Device { kind: DeviceTool | 'proc'; x: number; y: number; mode?: ProcessMode; uid?: number; name?: string }

const replaceable = (o: number, sandbox: boolean, devices = false) => {
  if (o === M.EMPTY) return true;
  const k = MATS[o].kind;
  if (sandbox) return k !== 'static' && k !== 'device';
  return k === 'gas' || (devices && (k === 'liquid' || k === 'powder'));
};

const EMPTY_INV: Inventory = { ink: 0, heater: 0, cooler: 0, igniter: 0, electro: 0, filter: 0, pump: 0, guide: 0, rotor: 0, piston: 0, plate: 0, proc: 0 };
const INF_INV = Object.fromEntries(INV_KEYS.map((k) => [k, Infinity])) as unknown as Inventory;

export class Game {
  readonly S: number;
  sim: Sim;
  mech: Mech;
  inv: Inventory;
  invBase: Inventory;
  devices: Device[] = [];
  sources: Source[]; goals: Goal[]; drains: Rect[];
  emitted: number[] = [];
  progress: number[] = [];
  flowing = false;
  won = false;
  ticks = 0;
  sandbox: boolean;
  filterMat: number;
  /** 実セル単位の筆の太さ */
  brush = 3;
  procMode: ProcessMode = 'electrolysis';
  pendingPump: { x: number; y: number } | null = null;
  /** 最初から置かれた（消せない）機構 */
  fixedNodes = new Set<number>();
  /** 種類ごとの通し番号（減らさないので、消しても番号は再利用されない。元に戻すでも巻き戻さない） */
  seq: Record<string, number> = {};
  /** 装置・ポンプの通し id */
  nextUid = 1;
  private undoStack: ReturnType<Game['snap']>[] = [];
  private redoStack: ReturnType<Game['snap']>[] = [];
  onAbsorb?: (x: number, y: number, mat: number) => void;

  constructor(public level: Level, sandbox = false, seed = 7, scale = SCALE) {
    this.S = scale;
    const S = scale;
    this.sandbox = sandbox;
    this.sim = new Sim((level.w ?? 160) * S, (level.h ?? 100) * S, seed);
    this.sim.heatK = S; this.sim.spreadK = S;
    this.mech = new Mech(this.sim);
    this.sim.beforeStep = () => { if (this.flowing) this.mech.step(1 / (60 * S)); };
    this.sources = level.sources.map((s) => ({ ...s, x: s.x * S + (S >> 1), y: s.y * S, rate: s.rate * S, total: s.total * S * S }));
    this.goals = level.goals.map((g) => ({ ...g, x: g.x * S, y: g.y * S, w: g.w * S, h: g.h * S, need: g.need * S * S }));
    this.drains = level.drains.map((d) => ({ x: d.x * S, y: d.y * S, w: d.w * S, h: d.h * S }));
    this.invBase = sandbox ? { ...INF_INV } : { ...EMPTY_INV, ...level.inv };
    if (!sandbox) for (const k of CELL_RES) this.invBase[k] *= S * S;
    this.inv = { ...this.invBase };
    this.filterMat = level.filterMat ?? M.WATER;
    if (level.procModes?.length) this.procMode = level.procModes[0];
    this.reset(false);
  }

  painter(): Painter {
    const sim = this.sim, S = this.S;
    return {
      w: sim.w / S, h: sim.h / S, S,
      set: (x, y, m) => { for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) sim.set(x * S + i, y * S + j, m); },
      get: (x, y) => sim.get(x * S, y * S),
      rnd01: () => sim.rnd01(),
      fillReal: (x, y, w, h, pick) => {
        for (let j = y * S; j < (y + h) * S; j++) for (let i = x * S; i < (x + w) * S; i++) if (sim.get(i, j) === M.EMPTY) { const m = pick(); if (m) sim.set(i, j, m); }
      },
    };
  }

  reset(keepBuild: boolean) {
    const { sim, level } = this;
    const keep: [number, number, number][] = [];
    if (keepBuild) for (let i = 0; i < sim.n; i++) { const m = sim.t[i]; if (m === M.PWALL || m === M.FILTER || m === M.GUIDE || MATS[m].kind === 'device') keep.push([i, m, sim.aux[i]]); }
    const pumps: Pump[] = keepBuild ? sim.pumps.map((p) => ({ ...p, moved: 0 })) : [];
    const procs = keepBuild ? sim.processors.map((p) => ({ ...p, count: 0 })) : [];
    const nodes = keepBuild ? this.mech.serialize().map((n) => ({ ...n, angle: 0, ext: 0, bend: 0, bendV: 0, dir: Math.sign(n.dir) || 1 })) : [];
    sim.clear(); level.build(this.painter());
    for (const [i, m, a] of keep) { sim.t[i] = m; sim.temp[i] = MATS[m].temp; sim.aux[i] = a; }
    sim.wakeAll();
    sim.pumps = pumps; sim.processors = procs;
    this.flowing = this.sandbox;
    if (!keepBuild) {
      this.inv = { ...this.invBase };
      this.devices = [];
      this.mech.nodes = []; this.mech.nextId = 1; this.fixedNodes.clear();
      if (level.mech) { level.mech(this); for (const n of this.mech.nodes) this.fixedNodes.add(n.id); }
      this.mech.computePoses(); this.mech.rasterize();
    } else {
      this.mech.load(nodes);
    }
    this.emitted = this.sources.map(() => 0);
    this.progress = this.goals.map(() => 0);
    this.won = false; this.ticks = 0; this.pendingPump = null; this.mech.stalls = 0;
    sim.stats = { burned: 0, dissolved: 0, crystallized: 0, split: 0, synthesized: 0, regenerated: 0, extracted: 0, recovered: 0 };
  }

  private snap() {
    return { sim: this.sim.snapshot(), inv: { ...this.inv }, devices: this.devices.map((d) => ({ ...d })), nodes: this.mech.serialize(), nextId: this.mech.nextId };
  }
  pushUndo() { this.undoStack.push(this.snap()); if (this.undoStack.length > 40) this.undoStack.shift(); this.redoStack = []; }
  undo() { const s = this.undoStack.pop(); if (!s) return false; this.redoStack.push(this.snap()); this.load(s); return true; }
  redo() { const s = this.redoStack.pop(); if (!s) return false; this.undoStack.push(this.snap()); this.load(s); return true; }
  private load(s: ReturnType<Game['snap']>) {
    this.sim.restore(s.sim); this.inv = { ...s.inv }; this.devices = s.devices.map((d) => ({ ...d }));
    this.mech.nodes = s.nodes.map((n) => ({ ...n })); this.mech.nextId = s.nextId; this.mech.computePoses(); this.mech.relink();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** 装置の占める範囲（実セル、中心 x,y から -S..2S-1） */
  devRange() { return [-this.S, 2 * this.S - 1] as const; }

  /** 1点への道具の適用（実セル座標）。戻り値は変化したか */
  apply(tool: Tool, x: number, y: number, erase = false): boolean {
    const s = this.sim, S = this.S;
    if (erase || tool === 'erase') return this.eraseAt(x, y);
    if (tool === 'wall' || tool === 'guide') {
      const key = tool === 'wall' ? 'ink' : 'guide', mat = tool === 'wall' ? M.PWALL : M.GUIDE;
      let ch = false;
      const r = this.brush;
      for (let j = 0; j < r + 1; j++) for (let i = 0; i < r + 1; i++) {
        const cx = x + i - (r >> 1), cy = y + j - (r >> 1);
        if (this.inv[key] <= 0) return ch;
        const o = s.get(cx, cy);
        if (replaceable(o, this.sandbox)) { s.set(cx, cy, mat); this.inv[key]--; ch = true; }
      }
      return ch;
    }
    if (tool === 'filter') {
      let ch = false;
      for (let j = 0; j < 2 * S; j++) for (let i = 0; i < 2 * S; i++) {
        if (this.inv.filter <= 0) return ch;
        const o = s.get(x + i, y + j);
        if (replaceable(o, this.sandbox)) { s.set(x + i, y + j, M.FILTER, this.filterMat); this.inv.filter--; ch = true; }
      }
      return ch;
    }
    if (tool === 'pump') {
      if (this.inv.pump <= 0) return false;
      if (!this.pendingPump) { this.pendingPump = { x, y }; return true; }
      s.pumps.push({ ax: this.pendingPump.x, ay: this.pendingPump.y, bx: x, by: y, rate: 3 * S, moved: 0, r: 2 * S, uid: this.nextUid++, name: this.newName(OBJ_LABEL.pump) });
      this.pendingPump = null; this.inv.pump--; return true;
    }
    if (tool === 'rotor') return !!this.addRotor(x, y);
    if (tool === 'piston') return !!this.addPiston(x, y, x, y - 15 * S);
    if (tool === 'disc') return !!this.addDisc(x, y, (this.brush + 3) * 0.5 + S);
    if (tool === 'plate' || tool === 'select') return false;
    if (tool.startsWith('proc:') || tool in DEVICE_MAT) {
      const isProc = tool.startsWith('proc:');
      const key: keyof Inventory = isProc ? 'proc' : (tool as DeviceTool);
      if (this.inv[key] <= 0) return false;
      const mode = isProc ? (tool.slice(5) as ProcessMode) : undefined;
      if (isProc && !this.sandbox && this.level.procModes && !this.level.procModes.includes(mode!)) return false;
      const [a, b] = this.devRange();
      for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) if (!replaceable(s.get(x + i, y + j), this.sandbox, true)) return false;
      const mat = isProc ? M.PROCESSOR : DEVICE_MAT[tool as DeviceTool];
      for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) s.set(x + i, y + j, mat, isProc ? PROCESS_MODES.indexOf(mode!) : 0);
      const uid = this.nextUid++, name = this.newName(isProc ? PROCESSES[mode!].name : OBJ_LABEL[tool]);
      if (isProc) s.processors.push({ x: x + (S >> 1), y: y + (S >> 1), size: 3 * S, mode: mode!, rate: 1, count: 0, status: '', uid, name });
      this.devices.push({ kind: isProc ? 'proc' : (tool as DeviceTool), x, y, mode, uid, name }); this.inv[key]--;
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

  // ---------- 機構の配置 ----------
  private autoParent(n: MechNode, x: number, y: number, bodyOnly = false) {
    const p = this.mech.nodeAt(Math.round(x), Math.round(y), 2.5 * this.S, n.id);
    if (p && p.id !== n.id && (!bodyOnly || p.type === 'rect' || p.type === 'circle')) this.mech.attach(n.id, p.id);
  }
  addRotor(x: number, y: number) {
    if (this.inv.rotor <= 0) return null;
    const n = this.mech.add(newNode('rotor', x + 0.5, y + 0.5, { speed: 0.9, name: this.newName(OBJ_LABEL.rotor) }));
    this.autoParent(n, x, y);
    this.inv.rotor--; this.mech.computePoses(); return n;
  }
  /** ピストン：根元 (x0,y0) から (x1,y1) へ伸びる */
  addPiston(x0: number, y0: number, x1: number, y1: number) {
    if (this.inv.piston <= 0) return null;
    const amp = Math.max(4 * this.S, Math.min(this.maxAmp(), Math.hypot(x1 - x0, y1 - y0)));
    const n = this.mech.add(newNode('piston', x0 + 0.5, y0 + 0.5, { oa: Math.atan2(y1 - y0, x1 - x0), amp, speed: 0.25, name: this.newName(OBJ_LABEL.piston) }));
    this.autoParent(n, x0, y0);
    this.inv.piston--; this.mech.computePoses(); return n;
  }
  private cellsOf(n: MechNode) { this.mech.computePoses(); return this.mech.bodyCells(n, this.mech.pose(n.id)!).length; }
  /** 可動板：線分 (x0,y0)-(x1,y1)。始点がモーターの上なら自動で親付け */
  addPlate(x0: number, y0: number, x1: number, y1: number, thick = 2 * this.S) {
    const len = Math.max(thick, Math.hypot(x1 - x0, y1 - y0) + 1);
    // 根元（始点）が関節。形の中心は板の中ほど
    const n = newNode('rect', x0 + 0.5, y0 + 0.5, { w: len, h: thick, oa: Math.atan2(y1 - y0, x1 - x0), bx: (len - 1) / 2 });
    return this.placeBody(n, x0, y0);
  }
  addDisc(x: number, y: number, r: number) {
    return this.placeBody(newNode('circle', x + 0.5, y + 0.5, { r }), x, y);
  }
  private placeBody(n: MechNode, ax: number, ay: number) {
    const cost = this.sandbox ? 0 : this.mech.bodyCells(n, { x: n.ox, y: n.oy, a: n.oa }).length;
    if (!this.sandbox && cost > this.inv.plate) return null;
    n.name = this.newName(OBJ_LABEL[n.type]);
    this.mech.add(n);
    this.autoParent(n, ax, ay);
    if (n.parent < 0) { const c = Math.cos(n.oa) * n.bx, d = Math.sin(n.oa) * n.bx; this.autoParent(n, n.ox + c, n.oy + d); }
    this.inv.plate -= cost;
    this.mech.computePoses(); this.mech.rasterize();
    return n;
  }
  removeNode(id: number) {
    if (!this.sandbox && this.fixedNodes.has(id)) return false;
    const kill = [id, ...this.descendants(id)].map((k) => this.mech.byId(k)!).filter(Boolean);
    for (const n of kill) {
      if (n.type === 'rotor') this.inv.rotor++;
      else if (n.type === 'piston') this.inv.piston++;
      else if (!this.fixedNodes.has(n.id)) this.inv.plate += this.cellsOf(n);
    }
    this.mech.remove(id);
    return true;
  }
  private descendants(id: number): number[] {
    const out: number[] = []; const st = [id];
    while (st.length) { const k = st.pop()!; for (const c of this.mech.children(k)) { out.push(c.id); st.push(c.id); } }
    return out;
  }
  /** 機構の設定変更（選択ツール） */
  editNode(id: number, patch: Partial<MechNode>) {
    const n = this.mech.byId(id); if (!n) return false;
    if (!this.sandbox && this.fixedNodes.has(id)) {
      // 最初からある機構は向きと関節だけ変えられる
      const allow: (keyof MechNode)[] = ['dir', 'joint', 'on'];
      for (const k of Object.keys(patch) as (keyof MechNode)[]) if (!allow.includes(k)) delete patch[k];
    }
    if (patch.amp !== undefined) {
      if (n.type !== 'piston') delete patch.amp;
      else patch.amp = Math.max(4 * this.S, Math.min(this.maxAmp(), Number(patch.amp) || 0));
    }
    const prev = new Map(this.mech.computePoses());
    Object.assign(n, patch);
    if (patch.parent !== undefined) return true;
    if (patch.amp !== undefined) { this.mech.computePoses(); this.mech.rasterize(prev); return true; }
    this.mech.computePoses(); this.mech.rasterize();
    return true;
  }

  /** ピストンの最大ストローク（実セル） */
  maxAmp() { return (this.sandbox ? 120 : this.level.maxAmp ?? 120) * this.S; }
  newName(label: string) { const k = (this.seq[label] ?? 0) + 1; this.seq[label] = k; return `${label}#${k}`; }
  /** 名前・uid のない物（旧い保存データ）に付け直す */
  ensureNames() {
    const S = this.S;
    for (const n of this.mech.nodes) if (!n.name) n.name = this.newName(OBJ_LABEL[n.type]);
    for (const d of this.devices) {
      if (d.uid === undefined) d.uid = this.nextUid++;
      if (!d.name) d.name = this.newName(d.kind === 'proc' ? PROCESSES[d.mode ?? 'electrolysis'].name : OBJ_LABEL[d.kind]);
      if (d.kind === 'proc') { const p = this.sim.processors.find((q) => q.uid === d.uid) ?? this.sim.processors.find((q) => q.uid === undefined && q.x === d.x + (S >> 1) && q.y === d.y + (S >> 1)); if (p) { p.uid = d.uid; p.name = d.name; } }
    }
    for (const p of this.sim.processors) { if (p.uid === undefined) p.uid = this.nextUid++; if (!p.name) p.name = this.newName(PROCESSES[p.mode].name); }
    for (const p of this.sim.pumps) { if (p.uid === undefined) p.uid = this.nextUid++; if (!p.name) p.name = this.newName(OBJ_LABEL.pump); }
    const ids = [...this.devices.map((d) => d.uid!), ...this.sim.processors.map((p) => p.uid!), ...this.sim.pumps.map((p) => p.uid!)];
    this.nextUid = Math.max(this.nextUid, ...ids.map((u) => u + 1));
  }

  /** 置いた物の親子ツリー（機構：モーター＞腕＞関節＞子、循環装置＞ポート、ポンプ＞吸込口・吐出口） */
  tree(): TreeItem[] {
    const mk = (n: MechNode): TreeItem => ({
      key: `n:${n.id}`, name: n.name ?? `${OBJ_LABEL[n.type]}#?`, kind: n.type,
      sub: n.parent >= 0 ? `${JOINT_NAMES[n.joint]}関節` : '固定点', fixed: this.fixedNodes.has(n.id),
      children: this.mech.children(n.id).map(mk),
    });
    const out: TreeItem[] = this.mech.nodes.filter((n) => n.parent < 0 || !this.mech.byId(n.parent)).map(mk);
    for (const d of this.devices) out.push({
      key: `d:${d.uid}`, name: d.name ?? '', kind: d.kind, sub: d.kind === 'proc' ? '循環装置' : '装置',
      children: d.kind === 'proc' ? PORTS.map((pn) => ({ key: `port:${d.uid}:${pn}`, name: PORT_NAMES[pn], kind: 'port', children: [] })) : [],
    });
    for (const p of this.sim.pumps) out.push({
      key: `p:${p.uid}`, name: p.name ?? '', kind: 'pump', sub: 'ポンプ',
      children: [{ key: `pe:${p.uid}:a`, name: '吸込口', kind: 'pumpEnd', children: [] }, { key: `pe:${p.uid}:b`, name: '吐出口', kind: 'pumpEnd', children: [] }],
    });
    return out;
  }

  /** クリック位置の配置物（ポート・ポンプ口 → 機構 → 装置 の順に探す） */
  pickObject(x: number, y: number): string {
    const S = this.S;
    for (const p of this.sim.processors) for (const pn of PORTS) {
      const [dx, dy] = portOffset(p, pn); if (Math.hypot(p.x + dx - x, p.y + dy - y) <= 2 * S) return `port:${p.uid}:${pn}`;
    }
    for (const p of this.sim.pumps) {
      if (Math.hypot(p.ax - x, p.ay - y) <= 3 * S) return `pe:${p.uid}:a`;
      if (Math.hypot(p.bx - x, p.by - y) <= 3 * S) return `pe:${p.uid}:b`;
    }
    // モーター（形のない機構）を先に。次に可動壁のセル
    this.mech.computePoses();
    let best = '', bd = 2.5 * S;
    for (const q of this.mech.nodes) { if (this.mech.isBody(q)) continue; const P = this.mech.pose(q.id)!; const d = Math.hypot(P.x - x, P.y - y); if (d <= bd) { bd = d; best = `n:${q.id}`; } }
    if (best) return best;
    const n = this.mech.nodeAt(x, y, 4 * S); if (n) return `n:${n.id}`;
    const [a, b] = this.devRange();
    const d = this.devices.find((q) => x - q.x >= a && x - q.x <= b && y - q.y >= a && y - q.y <= b);
    return d ? `d:${d.uid}` : '';
  }

  /** 置いた物をずらす（実セル）。費用は変わらない。子は親についていく */
  moveObject(key: string, dx: number, dy: number): boolean {
    dx = Math.round(dx); dy = Math.round(dy);
    if (!dx && !dy) return false;
    const [kind, a, b] = key.split(':'); const id = Number(a);
    if (kind === 'n') return this.moveNode(id, dx, dy);
    if (kind === 'd') return this.moveDevice(id, dx, dy);
    if (kind === 'p' || kind === 'pe') {
      const p = this.sim.pumps.find((q) => q.uid === id); if (!p) return false;
      const ends: ('a' | 'b')[] = kind === 'p' ? ['a', 'b'] : [b as 'a' | 'b'];
      for (const e of ends) if (!this.sim.inside(p[`${e}x`] + dx, p[`${e}y`] + dy)) return false;
      for (const e of ends) { p[`${e}x`] += dx; p[`${e}y`] += dy; }
      return true;
    }
    if (kind === 'port') {
      const p = this.sim.processors.find((q) => q.uid === id); if (!p) return false;
      const [ox, oy] = portOffset(p, b as PortName);
      return this.setPort(id, b as PortName, ox + dx, oy + dy);
    }
    return false;
  }
  /** 機構の中で、固定壁・装置・ガイドに重なるセル数 */
  private badCells(ids: number[]) {
    const t = this.sim.t; let c = 0;
    for (const k of ids) {
      const n = this.mech.byId(k); if (!n || !this.mech.isBody(n)) continue;
      for (const i of this.mech.bodyCells(n, this.mech.pose(k)!)) { const m = t[i]; if (m === M.GUIDE) c += 1000; else if (m !== M.MOVER && (KIND[m] === 1 || KIND[m] === 5)) c++; }
    }
    return c;
  }
  private moveNode(id: number, dx: number, dy: number) {
    const n = this.mech.byId(id); if (!n) return false;
    if (!this.sandbox && this.fixedNodes.has(id)) return false;
    const sub = [id, ...this.descendants(id)];
    const prev = new Map(this.mech.computePoses());
    const before = this.badCells(sub);
    const old = [n.ox, n.oy];
    if (n.parent < 0 || !this.mech.byId(n.parent)) { n.ox += dx; n.oy += dy; }
    else {
      // 親の座標系でのずれに直す
      const f = this.mech.frameOf(this.mech.byId(n.parent)!); const c = Math.cos(-f.a), s = Math.sin(-f.a);
      n.ox += dx * c - dy * s; n.oy += dx * s + dy * c;
    }
    const poses = this.mech.computePoses();
    const inside = sub.every((k) => { const P = poses.get(k)!; return P.x >= 0 && P.y >= 0 && P.x < this.sim.w && P.y < this.sim.h; });
    if (!inside || this.badCells(sub) > before) { n.ox = old[0]; n.oy = old[1]; this.mech.computePoses(); return false; }
    this.mech.rasterize(prev); // 重なった流体は動く板と同じく押しのける
    return true;
  }
  private moveDevice(uid: number, dx: number, dy: number) {
    const d = this.devices.find((q) => q.uid === uid); if (!d) return false;
    const s = this.sim, [a, b] = this.devRange();
    const inOld = (x: number, y: number) => x - d.x >= a && x - d.x <= b && y - d.y >= a && y - d.y <= b;
    const nx = d.x + dx, ny = d.y + dy;
    for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) {
      const x = nx + i, y = ny + j;
      if (!s.inside(x, y)) return false;
      if (!inOld(x, y) && !replaceable(s.get(x, y), this.sandbox, true)) return false;
    }
    const i0 = d.y * s.w + d.x, mat = s.t[i0], aux = s.aux[i0];
    const inNew = (x: number, y: number) => x - nx >= a && x - nx <= b && y - ny >= a && y - ny <= b;
    const displaced: [number, number, number][] = [];
    for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) { const x = nx + i, y = ny + j; if (inOld(x, y)) continue; const k = y * s.w + x; if (s.t[k] !== M.EMPTY) displaced.push([s.t[k], s.temp[k], s.aux[k]]); }
    const freed: number[] = [];
    for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) { const x = d.x + i, y = d.y + j; if (!inNew(x, y)) { s.set(x, y, M.EMPTY); freed.push(y * s.w + x); } }
    for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) s.set(nx + i, ny + j, mat, aux);
    // 押しのけた流体は、装置が空けた場所へ（消さない）
    displaced.forEach(([m, tp, ax], k) => { const c = freed[k]; if (c === undefined) return; s.t[c] = m; s.temp[c] = tp; s.aux[c] = ax; s.wake(c); });
    d.x = nx; d.y = ny;
    if (d.kind === 'proc') { const p = s.processors.find((q) => q.uid === uid); if (p) { p.x += dx; p.y += dy; } }
    return true;
  }
  /** 循環装置のポートの位置を決める（装置中心からのずれ）。装置に重ならないよう、半径内に収める */
  setPort(uid: number, port: PortName, dx: number, dy: number) {
    const p = this.sim.processors.find((q) => q.uid === uid); if (!p) return false;
    const [cx, cy] = clampPortOffset(p.size, dx, dy);
    if (!this.sim.inside(Math.round(p.x + cx), Math.round(p.y + cy))) return false;
    if (!p.ports) p.ports = PORTS.flatMap((pn) => defaultPortOffset(p.size, pn));
    const k = PORTS.indexOf(port) * 2;
    if (p.ports[k] === cx && p.ports[k + 1] === cy) return false;
    p.ports[k] = cx; p.ports[k + 1] = cy; this.sim.wakeAll();
    return true;
  }
  resetPorts(uid: number) { const p = this.sim.processors.find((q) => q.uid === uid); if (!p || !p.ports) return false; delete p.ports; return true; }

  /** 消しゴムの対象：物質ごと（1=消す）と、配置物の種類ごと */
  eraseMat = new Uint8Array(256).fill(1);
  eraseObj: Record<string, boolean> = {};
  /** 消しゴムの選択モード（筆／矩形／投げ縄） */
  objOk(kind: string) { return this.eraseObj[kind] !== false; }
  setEraseFilter(mats: number[] | null, objs: Record<string, boolean>) {
    this.eraseMat.fill(mats ? 0 : 1); if (mats) for (const m of mats) this.eraseMat[m] = 1;
    this.eraseObj = { ...objs };
  }
  private removeDevice(di: number) {
    const s = this.sim, S = this.S, [a, b] = this.devRange();
    const d = this.devices[di];
    for (let j = a; j <= b; j++) for (let i = a; i <= b; i++) s.set(d.x + i, d.y + j, M.EMPTY);
    if (d.kind === 'proc') { const k = s.processors.findIndex((p) => (d.uid !== undefined && p.uid === d.uid) || (p.x === d.x + (S >> 1) && p.y === d.y + (S >> 1))); if (k >= 0) s.processors.splice(k, 1); }
    this.devices.splice(di, 1); this.inv[d.kind === 'proc' ? 'proc' : d.kind]++;
  }
  /** 1セルを消す（ステージでは自分で描いた壁・膜・ガイドだけ。費用を返す） */
  private eraseCell(cx: number, cy: number): boolean {
    const s = this.sim, o = s.get(cx, cy);
    if (o === M.EMPTY || o === M.MOVER || o === M.WALL || !this.eraseMat[o]) return false;
    if (KIND[o] === 5 && this.devices.some((d) => { const [a, b] = this.devRange(); return cx - d.x >= a && cx - d.x <= b && cy - d.y >= a && cy - d.y <= b; })) return false; // 装置は物として消す
    if (o === M.PWALL) { s.set(cx, cy, M.EMPTY); this.inv.ink++; return true; }
    if (o === M.FILTER) { s.set(cx, cy, M.EMPTY); this.inv.filter++; return true; }
    if (o === M.GUIDE) { s.set(cx, cy, M.EMPTY); this.inv.guide++; return true; }
    if (!this.sandbox) return false;
    if (o === M.PROCESSOR) { const k = s.processors.findIndex((p) => Math.abs(p.x - cx) <= p.size && Math.abs(p.y - cy) <= p.size); if (k >= 0) s.processors.splice(k, 1); }
    s.set(cx, cy, M.EMPTY); return true;
  }
  private eraseAt(x: number, y: number): boolean {
    const s = this.sim, S = this.S; let ch = false;
    // 機構
    const node = this.mech.nodeAt(x, y, 2 * S);
    if (node && this.objOk(node.type) && this.removeNode(node.id)) return true;
    // ポンプ
    if (this.objOk('pump')) {
      const pi = s.pumps.findIndex((p) => Math.hypot(p.ax - x, p.ay - y) < 3 * S || Math.hypot(p.bx - x, p.by - y) < 3 * S);
      if (pi >= 0) { s.pumps.splice(pi, 1); this.inv.pump++; ch = true; }
    }
    const [a, b] = this.devRange();
    const di = this.devices.findIndex((d) => this.objOk(d.kind) && x - d.x >= a && x - d.x <= b && y - d.y >= a && y - d.y <= b);
    if (di >= 0) { this.removeDevice(di); return true; }
    const r = this.brush + 1;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r * r) continue;
      ch = this.eraseCell(x + i, y + j) || ch;
    }
    return ch;
  }
  /** 範囲で消す（矩形・投げ縄）。poly は [x0,y0,x1,y1,...]（実セル） */
  eraseRegion(poly: number[]): number {
    if (poly.length < 6) return 0;
    const xs = poly.filter((_, k) => k % 2 === 0), ys = poly.filter((_, k) => k % 2 === 1);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(this.sim.w - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(this.sim.h - 1, Math.ceil(Math.max(...ys)));
    const inside = (px: number, py: number) => {
      let c = false; const n = xs.length;
      for (let i = 0, j = n - 1; i < n; j = i++) if ((ys[i] > py) !== (ys[j] > py) && px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i]) + xs[i]) c = !c;
      return c;
    };
    let count = 0;
    // 配置物（基準点が範囲内）
    this.mech.computePoses();
    for (const n of [...this.mech.nodes]) {
      if (!this.mech.byId(n.id) || !this.objOk(n.type)) continue;
      const P = this.mech.pose(n.id)!; if (inside(P.x, P.y) && this.removeNode(n.id)) count++;
    }
    if (this.objOk('pump')) for (let k = this.sim.pumps.length - 1; k >= 0; k--) { const p = this.sim.pumps[k]; if (inside(p.ax + 0.5, p.ay + 0.5) || inside(p.bx + 0.5, p.by + 0.5)) { this.sim.pumps.splice(k, 1); this.inv.pump++; count++; } }
    for (let k = this.devices.length - 1; k >= 0; k--) { const d = this.devices[k]; if (this.objOk(d.kind) && inside(d.x + 0.5, d.y + 0.5)) { this.removeDevice(k); count++; } }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x + 0.5, y + 0.5) && this.eraseCell(x, y)) count++;
    return count;
  }
  /** 付け替え：親を変える（-1 で固定点に）。関節の設定はそのまま。循環は不可 */
  reparent(id: number, parentId: number): boolean {
    const n = this.mech.byId(id); if (!n) return false;
    if (!this.sandbox && this.fixedNodes.has(id)) return false;
    if (parentId === n.parent) return false;
    const ok = parentId < 0 ? this.mech.detach(id) : this.mech.attach(id, parentId);
    if (ok) { this.mech.computePoses(); this.mech.rasterize(); }
    return ok;
  }

  /** 線分で道具を適用 */
  stroke(tool: Tool, x0: number, y0: number, x1: number, y1: number, erase = false) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    let ch = false;
    for (let k = 0; k <= n; k++) ch = this.apply(tool, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), erase) || ch;
    return ch;
  }
  rect(tool: Tool, x: number, y: number, w: number, h: number) { for (let j = y; j < y + h; j += 2) this.stroke(tool, x, j, x + w - 1, j); }

  // ---------- 論理座標（ステージ設計用）の操作 ----------
  /** 論理の筆 b を実セルの筆に */
  private withBrush<T>(b: number, f: () => T): T { const old = this.brush; this.brush = (b + 1) * this.S - 1; try { return f(); } finally { this.brush = old; } }
  /** 論理座標での道具適用。筆の太さは論理単位（旧 brush と同じ意味） */
  lapply(tool: Tool, x: number, y: number, erase = false, b = 1): boolean {
    const S = this.S;
    return this.withBrush(b, () => {
      if (tool === 'wall' || tool === 'guide') { const r = this.brush; return this.apply(tool, (x - (b >> 1)) * S + (r >> 1), (y - (b >> 1)) * S + (r >> 1)); }
      if (tool === 'filter' || isDeviceTool(tool) || tool === 'pump') return this.apply(tool, x * S, y * S, erase);
      return this.apply(tool, x * S + (S >> 1), y * S + (S >> 1), erase);
    });
  }
  lstroke(tool: Tool, x0: number, y0: number, x1: number, y1: number, b = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    let ch = false;
    for (let k = 0; k <= n; k++) ch = this.lapply(tool, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), false, b) || ch;
    return ch;
  }
  lrect(tool: Tool, x: number, y: number, w: number, h: number, b = 1) { for (let j = y; j < y + h; j += 2) this.lstroke(tool, x, j, x + w - 1, j, b); }
  lrotor(x: number, y: number) { return this.addRotor(x * this.S, y * this.S); }
  lpiston(x0: number, y0: number, x1: number, y1: number) { return this.addPiston(x0 * this.S, y0 * this.S, x1 * this.S, y1 * this.S); }
  lplate(x0: number, y0: number, x1: number, y1: number, thick = 2) { return this.addPlate(x0 * this.S, y0 * this.S, x1 * this.S, y1 * this.S, thick * this.S); }
  ldisc(x: number, y: number, r: number) { return this.addDisc(x * this.S, y * this.S, r * this.S); }
  lproc(mode: ProcessMode, x: number, y: number) { return this.apply(`proc:${mode}`, x * this.S, y * this.S); }

  start() { this.flowing = true; }

  tick() {
    const { sim, S } = this;
    const go = this.flowing && !this.won;
    for (let st = 0; st < S; st++) {
      if (go) {
        this.sources.forEach((src, k) => {
          for (let n = 0; n < src.rate && this.emitted[k] < src.total; n++) {
            const x = src.x + ((sim.rnd01() * (4 * S + 1)) | 0) - 2 * S;
            const o = sim.get(x, src.y);
            if (o === M.EMPTY || KIND[o] === 3) { sim.set(x, src.y, src.mats[this.emitted[k] % src.mats.length]); this.emitted[k]++; }
          }
        });
      }
      sim.step();
      for (const d of this.drains) for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) {
        const i = y * sim.w + x; const m = sim.t[i]; const k = KIND[m]; if (k >= 2 && k <= 4) { sim.t[i] = M.EMPTY; sim.wake(i); }
      }
      this.goals.forEach((g, k) => {
        if (g.mode === 'absorb') {
          for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) {
            const i = y * sim.w + x;
            if (sim.t[i] === g.mat) { sim.t[i] = M.EMPTY; sim.wake(i); this.progress[k]++; this.onAbsorb?.(x, y, g.mat); }
          }
        }
      });
    }
    this.ticks++;
    this.goals.forEach((g, k) => {
      if (g.mode === 'stat') this.progress[k] = sim.stats[g.stat!];
      else if (g.mode === 'fill') {
        let c = 0;
        for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) if (sim.t[y * sim.w + x] === g.mat) c++;
        this.progress[k] = c;
      }
    });
    if (!this.won && !this.sandbox && this.goals.length && this.goals.every((g, k) => this.progress[k] >= g.need)) this.won = true;
  }

  get sourcesLeft() { return this.sources.reduce((a, s, k) => a + Math.max(0, s.total - this.emitted[k]), 0); }

  /** 資源コスト：インク・膜・ガイド・可動板1セル=1、装置・モーター1個=40 */
  cost() {
    const base = this.invBase; let c = 0;
    for (const k of INV_KEYS) { const b = base[k] ?? 0; if (!b || b === Infinity) continue; c += (b - this.inv[k]) * COST_WEIGHT[k]; }
    return c;
  }

  /** 星：ステージごとの基準コスト（節約解から算出）と比べる */
  starScore() {
    const th = starThresholds(this.level);
    const cost = this.cost();
    return { cost, ...th, stars: cost <= th.three ? 3 : cost <= th.two ? 2 : 1 };
  }
}

export const COST_WEIGHT: Record<keyof Inventory, number> = { ink: 1, filter: 1, guide: 1, plate: 1, heater: 40, cooler: 40, igniter: 40, electro: 40, pump: 40, rotor: 40, piston: 40, proc: 40 };
const thCache = new Map<string, { eco: number; three: number; two: number }>();
/** 節約解のコストに余裕を持たせて ★3/★2 の基準を決める */
export function starThresholds(level: Level) {
  const hit = thCache.get(level.id); if (hit) return hit;
  let eco = 0;
  if (level.eco) { const g = new Game(level); level.eco(g); eco = g.cost(); }
  const r = { eco, three: Math.ceil(eco * 1.3 + 10), two: Math.ceil(eco * 2 + 40) };
  thCache.set(level.id, r); return r;
}

/**
 * 自由実験室の大きさを変える。中身は anchor（0=左/上、0.5=中央、1=右/下）に合わせて写す。
 * 外枠（論理2マス）は新しい大きさで作り直し、はみ出した物は捨てる。
 */
export function resizeLab(old: Game, level: Level, ax: number, ay: number, seed = 7): Game {
  const g = new Game(level, true, seed, old.S);
  const S = old.S, B = 2 * S, os = old.sim, ns = g.sim;
  const dx = Math.round((ns.w - os.w) * ax), dy = Math.round((ns.h - os.h) * ay);
  // 新しい内側を空にしてから、古い内側を写す
  for (let y = B; y < ns.h - B; y++) for (let x = B; x < ns.w - B; x++) { const i = y * ns.w + x; ns.t[i] = M.EMPTY; ns.aux[i] = 0; ns.temp[i] = ns.ambient; }
  for (let y = B; y < os.h - B; y++) for (let x = B; x < os.w - B; x++) {
    const nx = x + dx, ny = y + dy;
    if (nx < B || ny < B || nx >= ns.w - B || ny >= ns.h - B) continue;
    const i = y * os.w + x, j = ny * ns.w + nx;
    if (os.t[i] === M.MOVER) continue;
    ns.t[j] = os.t[i]; ns.aux[j] = os.aux[i]; ns.temp[j] = os.temp[i];
  }
  const inn = (x: number, y: number) => x >= B && y >= B && x < ns.w - B && y < ns.h - B;
  const [a, b] = g.devRange();
  g.devices = old.devices.filter((d) => inn(d.x + dx + a, d.y + dy + a) && inn(d.x + dx + b, d.y + dy + b)).map((d) => ({ ...d, x: d.x + dx, y: d.y + dy }));
  const keepUid = new Set(g.devices.map((d) => d.uid));
  ns.processors = os.processors.filter((p) => keepUid.has(p.uid)).map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, ports: p.ports?.slice() }));
  ns.pumps = os.pumps.filter((p) => inn(p.ax + dx, p.ay + dy) && inn(p.bx + dx, p.by + dy)).map((p) => ({ ...p, ax: p.ax + dx, ay: p.ay + dy, bx: p.bx + dx, by: p.by + dy, moved: 0 }));
  const nodes = old.mech.serialize().map((n) => (n.parent < 0 ? { ...n, ox: n.ox + dx, oy: n.oy + dy } : { ...n }));
  g.mech.nodes = []; g.mech.load(nodes);
  g.mech.computePoses();
  for (const n of [...g.mech.nodes]) { if (n.parent >= 0 || !g.mech.byId(n.id)) continue; const P = g.mech.pose(n.id)!; if (!inn(P.x, P.y)) g.mech.remove(n.id); }
  g.mech.computePoses(); g.mech.rasterize();
  g.seq = { ...old.seq }; g.nextUid = old.nextUid;
  g.brush = old.brush; g.filterMat = old.filterMat; g.eraseMat.set(old.eraseMat); g.eraseObj = { ...old.eraseObj };
  ns.ambient = os.ambient;
  ns.wakeAll();
  return g;
}
