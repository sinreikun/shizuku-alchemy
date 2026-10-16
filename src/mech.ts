// 機構：モーター（回転・ピストン）、可動壁（長方形・円）、関節ツリー（固定・自由・ばね）
// wind-zest-lake-fjord / GPT-FluidLab の仕様を、セル流体向けに移植したもの
import { Sim, M, KIND } from './sim';

export type JointType = 'fixed' | 'free' | 'spring';
export type NodeType = 'rotor' | 'piston' | 'rect' | 'circle';
export interface MechNode {
  id: number; type: NodeType; parent: number;
  /** 根：世界座標／子：親の座標系でのオフセット */
  ox: number; oy: number;
  /** 親に対する基準角度（ピストンでは伸びる向き） */
  oa: number;
  joint: JointType; bend: number; bendV: number; k: number; damp: number; bendMax: number;
  // モーター
  on: boolean; speed: number; dir: number; angle: number; ext: number; amp: number; recip: boolean;
  // 可動壁
  w: number; h: number; r: number;
  /** 形の中心（自分の座標系）。板は根元が関節で、中心は板の中ほど */
  bx: number; by: number;
  /** 自動で付く名前（例：ピストン#2）。保存され、消しても番号は再利用しない */
  name?: string;
}
export interface Pose { x: number; y: number; a: number }

export const NODE_NAMES: Record<NodeType, string> = { rotor: '回転モーター', piston: 'ピストン', rect: '可動壁（板）', circle: '可動壁（円）' };
export const JOINT_NAMES: Record<JointType, string> = { fixed: '固定', free: '自由', spring: 'ばね' };

export function newNode(type: NodeType, x: number, y: number, extra: Partial<MechNode> = {}): MechNode {
  return {
    id: 0, type, parent: -1, ox: x, oy: y, oa: type === 'piston' ? -Math.PI / 2 : 0,
    joint: 'fixed', bend: 0, bendV: 0, k: 6, damp: 3, bendMax: 1.2,
    on: true, speed: type === 'rotor' ? 0.9 : 0.25, dir: 1, angle: 0, ext: 0, amp: 30, recip: true,
    w: 20, h: 4, r: 6, bx: 0, by: 0, ...extra,
  };
}

export class Mech {
  nodes: MechNode[] = [];
  nextId = 1;
  /** 衝突してモーターを戻した回数（テスト・表示用） */
  stalls = 0;
  /** 押しのけ先がなく消えたセル数 */
  lost = 0;
  private cells = new Map<number, number[]>();
  private poses = new Map<number, Pose>();
  private mark: Uint32Array;
  private gen = 1;

  constructor(public sim: Sim) { this.mark = new Uint32Array(sim.n); }

  add(n: MechNode) {
    n.id = this.nextId++;
    this.nodes.push(n); return n;
  }
  byId(id: number) { return this.nodes.find((n) => n.id === id); }
  children(id: number) { return this.nodes.filter((n) => n.parent === id); }
  /** 子孫を含めて削除。消した可動壁セルも片付ける */
  remove(id: number) {
    const kill = new Set<number>([id]);
    let grew = true;
    while (grew) { grew = false; for (const n of this.nodes) if (!kill.has(n.id) && kill.has(n.parent)) { kill.add(n.id); grew = true; } }
    for (const k of kill) this.clearCells(k);
    this.nodes = this.nodes.filter((n) => !kill.has(n.id));
    return kill.size;
  }
  /** 親子付け（循環は禁止）。子の現在の世界姿勢を保つようにオフセットを決める */
  attach(childId: number, parentId: number): boolean {
    const c = this.byId(childId), p = this.byId(parentId);
    if (!c || !p || childId === parentId) return false;
    for (let q: MechNode | undefined = p; q; q = q.parent >= 0 ? this.byId(q.parent) : undefined) if (q.id === childId) return false;
    this.computePoses();
    const cp = this.poses.get(childId)!, f = this.childFrame(p, this.poses.get(parentId)!);
    const dx = cp.x - f.x, dy = cp.y - f.y, ca = Math.cos(-f.a), sa = Math.sin(-f.a);
    c.parent = parentId; c.ox = dx * ca - dy * sa; c.oy = dx * sa + dy * ca; c.oa = cp.a - c.bend - f.a;
    return true;
  }

  /** 親から外して固定点にする（いまの世界姿勢を保つ） */
  detach(id: number): boolean {
    const c = this.byId(id); if (!c || c.parent < 0) return false;
    this.computePoses(); const P = this.poses.get(id)!;
    c.parent = -1; c.ox = P.x; c.oy = P.y; c.oa = P.a - c.bend;
    return true;
  }

  // ---------- 姿勢 ----------
  /** 親 p の子が乗る座標系（世界座標） */
  frameOf(p: MechNode): Pose { return this.childFrame(p, this.pose(p.id)!); }
  private childFrame(p: MechNode, P: Pose): Pose {
    if (p.type === 'rotor') return { x: P.x, y: P.y, a: P.a + p.angle };
    if (p.type === 'piston') { const L = p.ext * p.amp; return { x: P.x + Math.cos(P.a) * L, y: P.y + Math.sin(P.a) * L, a: P.a }; }
    return P;
  }
  computePoses() {
    this.poses.clear();
    const get = (n: MechNode, depth = 0): Pose => {
      const hit = this.poses.get(n.id); if (hit) return hit;
      let base: Pose = { x: n.ox, y: n.oy, a: 0 };
      const p = n.parent >= 0 ? this.byId(n.parent) : undefined;
      if (p && depth < 32) {
        const f = this.childFrame(p, get(p, depth + 1));
        const c = Math.cos(f.a), s = Math.sin(f.a);
        base = { x: f.x + n.ox * c - n.oy * s, y: f.y + n.ox * s + n.oy * c, a: f.a };
      }
      const r = { x: base.x, y: base.y, a: base.a + n.oa + n.bend };
      this.poses.set(n.id, r); return r;
    };
    for (const n of this.nodes) get(n);
    return this.poses;
  }
  pose(id: number) { return this.poses.get(id) ?? this.computePoses().get(id); }
  /** ピストン先端の位置（描画用） */
  tip(n: MechNode) { const P = this.pose(n.id)!; const L = n.ext * n.amp; return { x: P.x + Math.cos(P.a) * L, y: P.y + Math.sin(P.a) * L }; }

  /** 可動壁が占めるセル */
  bodyCells(n: MechNode, P0: Pose, out: number[] = []) {
    const { w, h } = this.sim;
    const ca = Math.cos(P0.a), sa = Math.sin(P0.a);
    const P = { x: P0.x + (n.bx ?? 0) * ca - (n.by ?? 0) * sa, y: P0.y + (n.bx ?? 0) * sa + (n.by ?? 0) * ca, a: P0.a };
    if (n.type === 'circle') {
      const r = n.r, r2 = r * r;
      for (let y = Math.floor(P.y - r); y <= Math.ceil(P.y + r); y++) for (let x = Math.floor(P.x - r); x <= Math.ceil(P.x + r); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dx = x + 0.5 - P.x, dy = y + 0.5 - P.y; if (dx * dx + dy * dy <= r2) out.push(y * w + x);
      }
    } else if (n.type === 'rect') {
      const c = Math.cos(P.a), s = Math.sin(P.a), hw = n.w / 2, hh = n.h / 2;
      const ex = Math.abs(c) * hw + Math.abs(s) * hh, ey = Math.abs(s) * hw + Math.abs(c) * hh;
      for (let y = Math.floor(P.y - ey); y <= Math.ceil(P.y + ey); y++) for (let x = Math.floor(P.x - ex); x <= Math.ceil(P.x + ex); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dx = x + 0.5 - P.x, dy = y + 0.5 - P.y;
        const u = dx * c + dy * s, v = -dx * s + dy * c;
        if (u >= -hw && u < hw && v >= -hh && v < hh) out.push(y * w + x);
      }
    }
    return out;
  }
  isBody(n: MechNode) { return n.type === 'rect' || n.type === 'circle'; }
  /** 根ごとのツリー（ノードid の配列、配置順で決定的） */
  rootOf(n: MechNode): MechNode {
    let q = n; for (let k = 0; k < 64; k++) { const p = q.parent >= 0 ? this.byId(q.parent) : undefined; if (!p) break; q = p; }
    return q;
  }
  trees(): number[][] {
    const m = new Map<number, number[]>();
    for (const n of this.nodes) { const r = this.rootOf(n).id; const a = m.get(r); if (a) a.push(n.id); else m.set(r, [n.id]); }
    return [...m.values()];
  }
  hitsGuide(only?: Set<number>): MechNode | null {
    const t = this.sim.t;
    for (const n of this.nodes) {
      if (!this.isBody(n) || (only && !only.has(n.id))) continue;
      for (const i of this.bodyCells(n, this.poses.get(n.id)!)) if (t[i] === M.GUIDE) return n;
    }
    return null;
  }
  private clearCells(id: number) {
    const t = this.sim.t, aux = this.sim.aux;
    for (const i of this.cells.get(id) ?? []) if (t[i] === M.MOVER && aux[i] === (id & 255)) { t[i] = M.EMPTY; this.sim.wake(i); }
    this.cells.delete(id);
  }

  /** 1ステップ分の駆動。dt は秒換算（60ステップ=1秒） */
  step(dt: number) {
    if (!this.nodes.length) return;
    const save = this.nodes.map((n) => [n.angle, n.ext, n.dir, n.bend, n.bendV]);
    const prev = new Map(this.computePoses());
    for (const n of this.nodes) {
      if (n.on && n.type === 'rotor') n.angle += n.dir * n.speed * dt;
      if (n.on && n.type === 'piston') {
        n.ext += n.dir * n.speed * dt;
        if (n.ext >= 1) { n.ext = 1; if (n.recip) n.dir = -1; }
        if (n.ext <= 0) { n.ext = 0; if (n.recip) n.dir = 1; }
      }
      if (n.joint === 'spring' && n.parent >= 0) {
        n.bendV += (-n.k * n.bend - n.damp * n.bendV) * dt; n.bend += n.bendV * dt;
      }
    }
    this.computePoses();
    // 衝突は機構ツリーごとに判定・対応する（ぶつかったツリーだけが戻る。独立した機構は動き続ける）
    const trees = this.trees();
    for (const tree of trees) {
      const set = new Set(tree);
      let hit = this.hitsGuide(set);
      if (!hit) continue;
      // ばね・自由関節を曲げてガイドをかわす
      let jn: MechNode | undefined = hit;
      while (jn && jn.joint === 'fixed') jn = jn.parent >= 0 ? this.byId(jn.parent) : undefined;
      if (jn && jn.parent >= 0) {
        const b0 = jn.bend;
        for (const d of [0.04, -0.04, 0.08, -0.08, 0.16, -0.16, 0.3, -0.3]) {
          const nb = b0 + d; if (Math.abs(nb) > jn.bendMax) continue;
          jn.bend = nb; this.computePoses();
          if (!this.hitsGuide(set)) { hit = null; jn.bendV = 0; break; }
        }
        if (hit) { jn.bend = b0; this.computePoses(); }
      }
      if (hit) {
        // 避けられない接触：このツリーの駆動だけを戻す
        this.nodes.forEach((n, k) => { if (!set.has(n.id)) return; [n.angle, n.ext, n.dir, n.bend, n.bendV] = save[k]; if (n.type === 'piston' && n.recip) n.dir = -n.dir; });
        this.stalls++;
        this.computePoses();
      }
    }
    this.rasterize(prev);
  }

  /** 可動壁をセルに描き直し、重なった流体を押しのける */
  rasterize(prev?: Map<number, Pose>) {
    const sim = this.sim, { t, temp, aux, w, h } = sim;
    for (const n of this.nodes) if (this.isBody(n)) this.clearCells(n.id);
    this.gen++; const g = this.gen, mk = this.mark;
    const plan: [MechNode, number[]][] = [];
    for (const n of this.nodes) {
      if (!this.isBody(n)) continue;
      const cs = this.bodyCells(n, this.poses.get(n.id)!).filter((i) => { const k = KIND[t[i]]; return (k !== 1 && k !== 5) || t[i] === M.MOVER; });
      for (const i of cs) mk[i] = g;
      plan.push([n, cs]);
    }
    for (const [n, cs] of plan) {
      const P1 = this.poses.get(n.id)!, P0 = prev?.get(n.id) ?? P1;
      const c1 = Math.cos(P1.a), s1 = Math.sin(P1.a), c0 = Math.cos(P0.a), s0 = Math.sin(P0.a);
      const mine: number[] = [];
      for (const i of cs) {
        const o = t[i];
        if (o === M.MOVER) continue;
        if (o !== M.EMPTY) {
          const k = KIND[o];
          if (k === 1 || k === 5) continue; // 固定壁・装置は素通り
          // このセルの移動方向（前の姿勢との差）
          const x = i % w, y = (i / w) | 0;
          const dx = x + 0.5 - P1.x, dy = y + 0.5 - P1.y;
          const u = dx * c1 + dy * s1, v = -dx * s1 + dy * c1;
          const px = P0.x + u * c0 - v * s0, py = P0.y + u * s0 + v * c0;
          const vx = x + 0.5 - px, vy = y + 0.5 - py;
          let d = 0;
          if (Math.abs(vx) > 1e-6 || Math.abs(vy) > 1e-6) d = Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? 1 : -1) : (vy > 0 ? w : -w);
          if (!this.push(i, d)) this.lost++; // 行き場がなければ消える
        }
        t[i] = M.MOVER; aux[i] = n.id & 255; temp[i] = sim.ambient; sim.wake(i);
        mine.push(i);
      }
      this.cells.set(n.id, mine);
    }
    void h;
  }
  private push(i: number, d: number): boolean {
    const sim = this.sim, { t, temp, aux, w, n } = sim, mk = this.mark, g = this.gen;
    const move = (j: number) => { t[j] = t[i]; temp[j] = temp[i]; aux[j] = aux[i]; sim.wake(j); return true; };
    if (d) {
      // 押す向きに連なった流体の列ごと1セルずらす（水を消さずに持ち上げる）
      const horiz = Math.abs(d) === 1;
      for (let k = 1; k <= 96; k++) {
        const j = i + d * k; if (j < 0 || j >= n) break;
        if (horiz && ((j % w) - (i % w)) * d < 0) break;
        const o = t[j];
        if (o === M.EMPTY && mk[j] !== g) {
          for (let q = k; q >= 1; q--) { const a = i + d * q, b = a - d; t[a] = t[b]; temp[a] = temp[b]; aux[a] = aux[b]; sim.wake(a); }
          return true;
        }
        const kk = KIND[o];
        if (mk[j] === g || kk < 2 || kk > 4) break;
      }
    }
    // 同じ部屋の近くの空き（壁を越えない幅優先探索）
    const q = [i], seen = new Set<number>([i]);
    for (let h = 0, lim = d ? 400 : 6000; h < q.length && h < lim; h++) {
      const c = q[h]; const cx = c % w;
      for (const j of [c - w, c + w, cx > 0 ? c - 1 : -1, cx < w - 1 ? c + 1 : -1]) {
        if (j < 0 || j >= n || seen.has(j)) continue;
        seen.add(j);
        const o = t[j];
        if (o === M.EMPTY && mk[j] !== g) return move(j);
        const kk = KIND[o];
        if (kk >= 2 && kk <= 4 || mk[j] === g) q.push(j);
      }
    }
    return false;
  }

  /** モーターの先にある可動壁を探す（配置時の自動親付け） */
  nodeAt(x: number, y: number, rad = 3, exclude = -1): MechNode | undefined {
    this.computePoses();
    const i = y * this.sim.w + x;
    if (this.sim.t[i] === M.MOVER) { const id = this.sim.aux[i]; const n = this.nodes.find((q) => (q.id & 255) === id && q.id !== exclude); if (n) return n; }
    let best: MechNode | undefined, bd = rad;
    for (const n of this.nodes) {
      if (this.isBody(n) || n.id === exclude) continue;
      const P = this.poses.get(n.id)!; const p = n.type === 'piston' ? this.tip(n) : P;
      const d = Math.hypot(p.x - x, p.y - y); if (d <= bd) { bd = d; best = n; }
    }
    return best;
  }

  serialize() { return this.nodes.map((n) => ({ ...n })); }
  load(ns: MechNode[]) {
    for (const n of this.nodes) if (this.isBody(n)) this.clearCells(n.id);
    this.cells.clear();
    this.nodes = ns.map((n) => ({ ...n }));
    this.nextId = Math.max(1, ...this.nodes.map((n) => n.id + 1));
    this.computePoses(); this.rasterize();
  }
  /** 可動壁セルの記録を作り直す（スナップショット復元後） */
  relink() {
    this.cells.clear();
    const { t, aux } = this.sim;
    for (let i = 0; i < t.length; i++) if (t[i] === M.MOVER) { const id = aux[i]; const arr = this.cells.get(id) ?? []; arr.push(i); this.cells.set(id, arr); }
    // cells のキーは id&255 だが、ノードid と一致させる
    const fixed = new Map<number, number[]>();
    for (const n of this.nodes) { const c = this.cells.get(n.id & 255); if (c) fixed.set(n.id, c); }
    this.cells = fixed;
  }
}
