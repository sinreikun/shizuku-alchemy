// シミュレーション専用 Web Worker：Game を所有し、計算と描画（RGBA 生成）を担う。
// 画像バッファは Transferable でメインと往復させる（SharedArrayBuffer 不要）。
import { Game, SCALE, resizeLab, type Tool } from './game';
import { LEVELS, labLevel } from './levels';
import { M, MATS, CH, portOffset, type PortName } from './sim';
import { paint } from './render';
import type { ToWorker, FromWorker, GameState, NodeView } from './protocol';

let game: Game | null = null;
let seed = 7;
const hook = (g: Game) => { g.onAbsorb = (x, y, m) => { if (absorbs.length < 60 && Math.random() < 0.3) absorbs.push(x, y, m); }; return g; };
let simMs = 0;
let absorbs: number[] = [];
let hover: [number, number] = [-1, -1];

const post = (m: FromWorker, tr: Transferable[] = []) => (self as unknown as Worker).postMessage(m, tr);

function state(): GameState {
  const g = game!, s = g.sim;
  g.mech.computePoses();
  const nodes: NodeView[] = g.mech.nodes.map((n) => {
    const p = g.mech.pose(n.id)!; const tip = n.type === 'piston' ? g.mech.tip(n) : p;
    return { id: n.id, type: n.type, parent: n.parent, joint: n.joint, on: n.on, speed: n.speed, dir: n.dir, amp: n.amp, recip: n.recip, k: n.k, x: p.x, y: p.y, a: p.a, tx: tip.x, ty: tip.y, bend: n.bend, name: n.name ?? '', fixed: g.fixedNodes.has(n.id), w: n.w, h: n.h, r: n.r, bx: n.bx };
  });
  const [hx, hy] = hover;
  return {
    w: s.w, h: s.h, S: g.S, inv: { ...g.inv }, invBase: { ...g.invBase }, progress: [...g.progress], emitted: [...g.emitted],
    flowing: g.flowing, won: g.won, ticks: g.ticks, canUndo: g.canUndo, canRedo: g.canRedo, pendingPump: g.pendingPump,
    pumps: s.pumps.map((p) => ({ ax: p.ax, ay: p.ay, bx: p.bx, by: p.by, uid: p.uid ?? 0, name: p.name ?? '' })),
    devices: g.devices.map((d) => ({ uid: d.uid ?? 0, name: d.name ?? '', kind: d.kind, x: d.x, y: d.y })),
    voids: g.voids.map((v) => ({ ...v })), tree: g.tree(), maxAmp: g.maxAmp(),
    procs: s.processors.map((p) => ({ x: p.x, y: p.y, size: p.size, mode: p.mode, count: p.count, status: p.status, uid: p.uid ?? 0, name: p.name ?? '', moved: !!p.ports, ports: (['in', 'out', 'aux'] as PortName[]).map((pn) => portOffset(p, pn)) })),
    nodes, cost: g.cost(), sourcesLeft: g.sourcesLeft, brush: g.brush, filterMat: g.filterMat, stalls: g.mech.stalls,
    simMs, awake: s.awakeChunks, chunks: s.cw * s.chh,
    hover: s.inside(hx, hy) ? { m: s.t[hy * s.w + hx], temp: s.temp[hy * s.w + hx] } : null,
  };
}

// ---------- 保存（v3：機構・循環装置を含む。旧 v2 は2倍に拡大して読み込む） ----------
const enc = (a: Uint8Array) => { let str = ''; for (let i = 0; i < a.length; i += 8192) str += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(str); };
const dec = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
function serialize() {
  const g = game!, s = g.sim;
  return JSON.stringify({ app: 'shizuku-alchemy', v: 5, lw: s.w / g.S, lh: s.h / g.S, w: s.w, h: s.h, t: enc(s.t), aux: enc(s.aux), temp: enc(new Uint8Array(s.temp.buffer.slice(0))), pumps: s.pumps, processors: s.processors, nodes: g.mech.serialize(), devices: g.devices, voids: g.voids, seq: g.seq, nextUid: g.nextUid });
}
function deserialize(json: string) {
  const d = JSON.parse(json);
  if (d.app !== 'shizuku-alchemy') throw new Error('形式が違います');
  // v5：自由実験室の大きさも保存。違う大きさなら作り直してから読む
  if (game!.sandbox && d.lw && d.lh && (d.w !== game!.sim.w || d.h !== game!.sim.h)) { const old = game!; game = hook(new Game(labLevel(d.lw, d.lh), true, seed, SCALE)); game.brush = old.brush; }
  const g = game!, s = g.sim;
  let t = dec(d.t), aux = dec(d.aux), temp = new Float32Array(dec(d.temp).buffer);
  let k = 1;
  if (d.w !== s.w || d.h !== s.h) {
    k = s.w / d.w;
    if (!Number.isInteger(k) || d.h * k !== s.h) throw new Error('大きさが合いません');
    // 旧版（低解像度）の保存データを最近傍で拡大
    const nt = new Uint8Array(s.n), na = new Uint8Array(s.n), ntp = new Float32Array(s.n);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const j = ((y / k) | 0) * d.w + ((x / k) | 0), i = y * s.w + x; nt[i] = t[j]; na[i] = aux[j]; ntp[i] = temp[j]; }
    t = nt; aux = na; temp = ntp;
  }
  // 可動壁セルは機構から描き直すので一旦消す
  for (let i = 0; i < t.length; i++) if (t[i] === M.MOVER) t[i] = M.EMPTY;
  g.pushUndo();
  s.t.set(t); s.aux.set(aux); s.temp.set(temp);
  s.pumps = (d.pumps ?? []).map((p: { ax: number; ay: number; bx: number; by: number; rate: number; r?: number }) => ({ ...p, ax: p.ax * k, ay: p.ay * k, bx: p.bx * k, by: p.by * k, rate: p.rate * k, r: (p.r ?? 2) * k, moved: 0 }));
  s.processors = (d.processors ?? []).map((p: object) => ({ ...p }));
  g.devices = (d.devices ?? []).map((v: { x: number; y: number }) => ({ ...v, x: v.x * k, y: v.y * k }));
  g.voids = (d.voids ?? []).map((v: object) => ({ ...v }));
  g.mech.load(d.nodes ?? []);
  // v4：名前の通し番号。旧版は名前を付け直す
  g.seq = { ...(d.seq ?? {}) }; g.nextUid = d.nextUid ?? 1;
  if (!d.seq) for (const n of g.mech.nodes) delete n.name;
  g.ensureNames();
  s.wakeAll();
}

const OPS: Record<string, (...a: never[]) => unknown> = {
  apply: (tool: Tool, x: number, y: number, erase: boolean) => game!.apply(tool, x, y, erase),
  stroke: (tool: Tool, x0: number, y0: number, x1: number, y1: number, erase: boolean) => game!.stroke(tool, x0, y0, x1, y1, erase),
  pushUndo: () => game!.pushUndo(),
  undo: () => game!.undo(), redo: () => game!.redo(),
  reset: (keep: boolean) => { game!.reset(keep); return true; },
  start: () => { game!.start(); return true; },
  step: () => { const t0 = performance.now(); game!.start(); game!.tick(); simMs = performance.now() - t0; return true; },
  addRotor: (x: number, y: number) => game!.addRotor(x, y)?.id ?? 0,
  addPiston: (x0: number, y0: number, x1: number, y1: number) => game!.addPiston(x0, y0, x1, y1)?.id ?? 0,
  addPlate: (x0: number, y0: number, x1: number, y1: number, th: number) => game!.addPlate(x0, y0, x1, y1, th)?.id ?? 0,
  addDisc: (x: number, y: number, r: number) => game!.addDisc(x, y, r)?.id ?? 0,
  editNode: (id: number, patch: object) => game!.editNode(id, patch),
  removeNode: (id: number) => game!.removeNode(id),
  pickNode: (x: number, y: number) => game!.mech.nodeAt(x, y, 4 * game!.S)?.id ?? 0,
  setBrush: (b: number) => { game!.brush = b; return true; },
  setFilter: (m: number) => { game!.filterMat = m; return true; },
  setAmbient: (v: number) => { game!.sim.ambient = v; game!.sim.wakeAll(); return true; },
  cancelPump: () => { game!.pendingPump = null; return true; },
  serialize: () => serialize(),
  deserialize: (json: string) => { deserialize(json); return true; },
  pickObject: (x: number, y: number) => game!.pickObject(x, y),
  moveObject: (key: string, dx: number, dy: number) => game!.moveObject(key, dx, dy),
  setPort: (uid: number, port: PortName, dx: number, dy: number) => game!.setPort(uid, port, dx, dy),
  resetPorts: (uid: number) => game!.resetPorts(uid),
  setAmp: (id: number, amp: number) => game!.editNode(id, { amp }),
  resizeLab: (lw: number, lh: number, ax: number, ay: number) => { const old = game!; if (!old.sandbox) return false; game = hook(resizeLab(old, labLevel(lw, lh), ax, ay, seed)); return { w: game.sim.w, h: game.sim.h }; },
  setEraseFilter: (mats: number[] | null, objs: Record<string, boolean>) => { game!.setEraseFilter(mats, objs); return true; },
  eraseRegion: (poly: number[]) => game!.eraseRegion(poly),
  addVoid: (x0: number, y0: number, x1: number, y1: number) => game!.addVoid(x0, y0, x1, y1)?.uid ?? 0,
  removeVoid: (uid: number) => game!.removeVoid(uid),
  reparent: (id: number, parent: number) => game!.reparent(id, parent),
  /** テスト用：勝つまで（または上限まで）一気に進める */
  run: (limit: number) => { const g = game!; g.start(); const t0 = performance.now(); while (!g.won && g.ticks < limit) g.tick(); return { won: g.won, ticks: g.ticks, ms: performance.now() - t0, cost: g.cost() }; },
  /** テスト用：同じシードの新しい盤面で解答を適用→勝つまで実行（待ち時間やフレーム数に左右されない） */
  trial: (which: 'solve' | 'eco', limit: number, seed: number) => { const lv = game!.level; const g = new Game(lv, false, seed, SCALE); lv[which]?.(g); g.start(); const t0 = performance.now(); while (!g.won && g.ticks < limit) g.tick(); return { won: g.won, ticks: g.ticks, ms: performance.now() - t0, cost: g.cost() }; },
  /** テスト用：ステージの解答・節約解を適用 */
  script: (which: 'solve' | 'eco') => { const lv = game!.level; lv[which]?.(game!); return true; },
};

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    const lv = msg.sandbox ? labLevel(msg.lw ?? 240, msg.lh ?? 150) : LEVELS.find((l) => l.id === msg.levelId)!;
    seed = msg.seed;
    game = hook(new Game(lv, msg.sandbox, msg.seed, SCALE));
    game.brush = msg.brush;
    post({ type: 'ready', state: state() });
    return;
  }
  if (!game) return;
  if (msg.type === 'op') {
    let result: unknown = null, error: string | undefined;
    try { result = (OPS[msg.op] as (...a: unknown[]) => unknown)?.(...msg.args); } catch (err) { error = String((err as Error).message); }
    post({ type: 'opResult', id: msg.id, result, state: state(), error });
    return;
  }
  if (msg.type === 'frame') {
    hover = msg.hover;
    const g = game;
    const wasWon = g.won;
    if (msg.ticks > 0) {
      const t0 = performance.now();
      for (let k = 0; k < msg.ticks; k++) g.tick();
      const per = (performance.now() - t0) / msg.ticks;
      simMs = simMs ? simMs * 0.9 + per * 0.1 : per;
    }
    const s = g.sim;
    const px = new Uint32Array(msg.buf), gpx = new Uint32Array(msg.gbuf);
    if (px.length === s.n) paint(s, px, gpx, msg.viewMode, msg.now);
    // 火の粉（炎・溶岩の位置をいくつか）
    const sparks: number[] = [];
    for (let k = 0; k < 30; k++) {
      const i = (Math.random() * s.n) | 0; const m = s.t[i];
      if ((m === M.FIRE || m === M.LAVA) && Math.random() < 0.5) {
        const up = s.t[i - s.w];
        if (i >= s.w && (up === M.EMPTY || MATS[up].kind === 'gas')) sparks.push(i % s.w, (i / s.w) | 0, m);
      }
    }
    const a = absorbs; absorbs = [];
    post({ type: 'frame', buf: msg.buf, gbuf: msg.gbuf, state: state(), absorbs: a, sparks, wonNow: !wasWon && g.won }, [msg.buf, msg.gbuf]);
  }
};
void CH;
