// シミュレーション専用 Web Worker：Game を所有し、計算と描画（RGBA 生成）を担う。
// 画像バッファは Transferable でメインと往復させる（SharedArrayBuffer 不要）。
import { Game, SCALE, resizeLab, type Tool } from './game';
import { LEVELS, labLevel } from './levels';
import { M, MATS, CH, portOffset, portAmount, RECIPES, type PortName } from './sim';
import { paint } from './render';
import { serializeGame, parseSave, applySave } from './save';
import { buildSample, installSample, sampleScore, resetSampleInPlace, SAMPLE_SEED } from './samples';
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
    pumps: s.pumps.map((p) => ({ ax: p.ax, ay: p.ay, bx: p.bx, by: p.by, uid: p.uid ?? 0, name: p.name ?? '', rate: p.rate, r: p.r ?? 2 })),
    devices: g.devices.map((d) => ({ uid: d.uid ?? 0, name: d.name ?? '', kind: d.kind, x: d.x, y: d.y, power: d.power ?? (d.kind === 'electro' ? 10 : d.kind === 'proc' ? 0 : MATS[{ heater: M.HEATER, cooler: M.COOLER, igniter: M.IGNITER }[d.kind as 'heater']].temp) })), canTune: g.canTune,
    tree: g.tree(), maxAmp: g.maxAmp(),
    procs: s.processors.map((p) => ({ x: p.x, y: p.y, size: p.size, mode: p.mode, count: p.count, status: p.status, uid: p.uid ?? 0, name: p.name ?? '', moved: !!p.ports, rate: p.rate, amt: [0, 1, 2].map((k) => portAmount(p, k)), roles: RECIPES[p.mode].ports.map((r) => (r ? r.role : '')), ports: (['in', 'out', 'aux'] as PortName[]).map((pn) => portOffset(p, pn)) })),
    nodes, cost: g.cost(), sourcesLeft: g.sourcesLeft, brush: g.brush, filterMat: g.filterMat, stalls: g.mech.stalls,
    simMs, awake: s.awakeChunks, chunks: s.cw * s.chh,
    hover: s.inside(hx, hy) ? { m: s.t[hy * s.w + hx], temp: s.temp[hy * s.w + hx] } : null,
    sampleId: g.sample?.id ?? null, challenge: challengeView(g),
  };
}

// ---------- 保存（v3：機構・循環装置を含む。旧 v2 は2倍に拡大して読み込む） ----------
/** 挑戦の採点（重いので 10 ティックごと・盤面が変わったときだけ計算） */
let scoreCache: { g: Game; ticks: number; dirty: number; view: ReturnType<typeof sampleScore> } | null = null;
let opCount = 0;
function challengeView(g: Game) {
  if (!g.sample) return null;
  if (scoreCache && scoreCache.g === g && scoreCache.dirty === opCount && Math.abs(g.ticks - scoreCache.ticks) < 10) return scoreCache.view;
  scoreCache = { g, ticks: g.ticks, dirty: opCount, view: sampleScore(g) };
  return scoreCache.view;
}
/** 見本のサムネイル（RGBA、横 tw） */
const thumbs = new Map<string, { w: number; h: number; data: Uint8ClampedArray }>();
function sampleThumb(id: string, tw: number) {
  const key = id + ':' + tw; const c = thumbs.get(key); if (c) return c;
  const g = buildSample(id, SAMPLE_SEED, SCALE); const s = g.sim;
  for (let k = 0; k < 40; k++) g.tick(); // 少し動かして、描いたばかりの粒感をならす
  const px = new Uint32Array(s.n), gpx = new Uint32Array(s.n); paint(s, px, gpx, 'mat', 0);
  const th = Math.max(1, Math.round((tw * s.h) / s.w)); const data = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    // 面積平均で縮小（細い線も消えにくいよう最大の明るさも少し混ぜる）
    const x0 = Math.floor((x * s.w) / tw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * s.w) / tw)), y0 = Math.floor((y * s.h) / th), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * s.h) / th));
    let r = 0, gg = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const v = px[yy * s.w + xx]; r += v & 255; gg += (v >> 8) & 255; b += (v >> 16) & 255; n++; }
    const o = (y * tw + x) * 4; data[o] = r / n; data[o + 1] = gg / n; data[o + 2] = b / n; data[o + 3] = 255;
  }
  const out = { w: tw, h: th, data }; thumbs.set(key, out); return out;
}
function serialize(g: Game = game!) { return serializeGame(g); }
function deserialize(json: string) {
  const d = parseSave(json);
  // v5：自由実験室の大きさも保存。違う大きさなら作り直してから読む
  if (game!.sandbox && d.lw && d.lh && (d.w !== game!.sim.w || d.h !== game!.sim.h)) { const old = game!; game = hook(new Game(labLevel(d.lw, d.lh), true, seed, SCALE)); game.brush = old.brush; }
  applySave(game!, d);
}

const OPS: Record<string, (...a: never[]) => unknown> = {
  apply: (tool: Tool, x: number, y: number, erase: boolean) => game!.apply(tool, x, y, erase),
  stroke: (tool: Tool, x0: number, y0: number, x1: number, y1: number, erase: boolean) => game!.stroke(tool, x0, y0, x1, y1, erase),
  pushUndo: () => game!.pushUndo(),
  undo: () => game!.undo(), redo: () => game!.redo(),
  reset: (keep: boolean) => { game!.reset(keep); if (!keep) { game!.sample = undefined; game!.afterTick = undefined; } return true; },
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
  /** 見本の保存データ（v5）を作る：決定的なシードで新しく組み立てる */
  sampleSave: (id: string) => serialize(buildSample(id, SAMPLE_SEED, SCALE)),
  sampleThumb: (id: string, tw: number) => sampleThumb(id, tw),
  resetSample: () => resetSampleInPlace(game!),
  deserialize: (json: string) => { deserialize(json); return true; },
  pickObject: (x: number, y: number) => game!.pickObject(x, y),
  moveObject: (key: string, dx: number, dy: number) => game!.moveObject(key, dx, dy),
  setPort: (uid: number, port: PortName, dx: number, dy: number) => game!.setPort(uid, port, dx, dy),
  resetPorts: (uid: number) => game!.resetPorts(uid),
  setAmp: (id: number, amp: number) => game!.editNode(id, { amp }),
  resizeLab: (lw: number, lh: number, ax: number, ay: number) => { const old = game!; if (!old.sandbox) return false; game = hook(resizeLab(old, labLevel(lw, lh), ax, ay, seed)); return { w: game.sim.w, h: game.sim.h }; },
  setEraseFilter: (mats: number[] | null, objs: Record<string, boolean>) => { game!.setEraseFilter(mats, objs); return true; },
  eraseRegion: (poly: number[]) => game!.eraseRegion(poly),
  setPortAmount: (uid: number, k: number, n: number) => game!.setPortAmount(uid, k, n),
  setProcRate: (uid: number, r: number) => game!.setProcRate(uid, r),
  setDevicePower: (uid: number, v: number) => game!.setDevicePower(uid, v),
  setPump: (uid: number, rate?: number, r?: number) => game!.setPump(uid, rate, r),
  fillRect: (tool: Tool, x0: number, y0: number, x1: number, y1: number) => game!.fillRect(tool, x0, y0, x1, y1),
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
    opCount++;
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
