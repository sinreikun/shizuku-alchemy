// しずく錬金工房 — セル流体エンジン（型付き配列・CPU）
export const enum M {
  EMPTY, WALL, PWALL, WATER, STEAM, ICE, OIL, SMOKE, LAVA, ROCK, MERCURY, HYDROGEN, HEATER, COOLER,
  SALT, BRINE, OXYGEN, CO2, FIRE, SOOT, IGNITER, ELECTRO, FILTER, SAND, GLASS, HGVAPOR, NITROGEN,
  GUIDE, MOVER, PROCESSOR, ACTIVATOR, COMPOSITE, SOLVENT, SOLVAPOR, EXTRACT, LOADED,
}
export const MAT_COUNT = 36;

export type Kind = 'none' | 'static' | 'liquid' | 'gas' | 'powder' | 'device';
export interface MatDef {
  name: string; dens: number; kind: Kind; spread: number; color: [number, number, number];
  temp: number; cond: number; glow?: number; desc: string; cat: string;
}

const D = (name: string, dens: number, kind: Kind, spread: number, color: [number, number, number], temp: number, cond: number, cat: string, desc: string, glow = 0): MatDef =>
  ({ name, dens, kind, spread, color, temp, cond, cat, desc, glow });

export const MATS: MatDef[] = [];
MATS[M.EMPTY] = D('空気なし', 0, 'none', 0, [12, 15, 26], 20, 0.02, '', '真空。室温20℃に戻る。');
MATS[M.WALL] = D('岩盤', 99, 'static', 0, [66, 72, 92], 20, 0.01, '固体', '壊せない壁。');
MATS[M.PWALL] = D('壁', 99, 'static', 0, [200, 162, 100], 20, 0.01, '固体', '流体を止める壁。インクを消費する。');
MATS[M.WATER] = D('水', 4, 'liquid', 5, [44, 128, 236], 20, 0.25, '液体', '0℃で氷、100℃で蒸気。塩を溶かす。');
MATS[M.STEAM] = D('蒸気', -3, 'gas', 3, [205, 218, 232], 110, 0.004, '気体', '上昇し、70℃以下で水に戻る。');
MATS[M.ICE] = D('氷', 3, 'static', 0, [170, 225, 255], -12, 0.25, '固体', '2℃以上で溶ける。');
MATS[M.OIL] = D('油', 2, 'liquid', 2, [214, 170, 40], 20, 0.12, '液体', '水に浮く。酸素と250℃で燃え、酸素なしの300℃で煤になる。');
MATS[M.SMOKE] = D('煙', -2, 'gas', 2, [86, 86, 94], 180, 0.05, '気体', 'やがて消える。');
MATS[M.LAVA] = D('溶岩', 7, 'liquid', 1, [255, 92, 20], 1200, 0.05, '液体', '700℃以下で岩石。水に触れると急冷。', 1);
MATS[M.ROCK] = D('岩石', 6, 'powder', 0, [112, 94, 86], 420, 0.15, '粉体', '900℃以上で溶岩に戻る。');
MATS[M.MERCURY] = D('水銀', 9, 'liquid', 6, [192, 198, 208], 20, 0.4, '液体', '最も重い液体。357℃で水銀蒸気。');
MATS[M.HYDROGEN] = D('水素', -6, 'gas', 6, [150, 255, 200], 20, 0.03, '気体', '最も軽い。酸素と500℃で燃えて蒸気になる。');
MATS[M.HEATER] = D('ヒーター', 99, 'device', 0, [255, 70, 40], 600, 1, '装置', '周囲を600℃に加熱する。', 0.7);
MATS[M.COOLER] = D('クーラー', 99, 'device', 0, [60, 200, 255], -60, 1, '装置', '周囲を-60℃に冷やす。', 0.5);
MATS[M.SALT] = D('晶塩', 5.5, 'powder', 0, [236, 232, 246], 20, 0.6, '粉体', '水に溶けて塩水になる。');
MATS[M.BRINE] = D('塩水', 5, 'liquid', 4, [60, 170, 200], 20, 0.25, '液体', '水より重い。100℃で蒸発し晶塩が残る。');
MATS[M.OXYGEN] = D('酸素', -0.9, 'gas', 4, [120, 170, 255], 20, 0.03, '気体', '燃焼を支える。');
MATS[M.CO2] = D('二酸化炭素', 0.6, 'gas', 3, [120, 120, 140], 20, 0.06, '気体', '空気より重く、低い所にたまる。燃えない。');
MATS[M.FIRE] = D('炎', -4, 'gas', 2, [255, 170, 40], 900, 0.6, '気体', '燃焼中の熱いガス。すぐ消える。', 1);
MATS[M.SOOT] = D('煤', 1.5, 'powder', 0, [40, 36, 36], 20, 0.1, '粉体', '酸素と400℃で再燃焼する。');
MATS[M.IGNITER] = D('着火器', 99, 'device', 0, [255, 220, 90], 900, 1, '装置', '周囲を900℃にして燃料に火をつける。', 1);
MATS[M.ELECTRO] = D('電解槽', 99, 'device', 0, [180, 120, 255], 20, 0.2, '装置', '触れた水を水素と酸素に分ける。', 0.6);
MATS[M.FILTER] = D('選択膜', 99, 'device', 0, [120, 255, 160], 20, 0.2, '装置', '指定した物質だけを通す膜。');
MATS[M.SAND] = D('砂', 6, 'powder', 0, [214, 190, 120], 20, 0.1, '粉体', '1400℃でガラスになる。');
MATS[M.GLASS] = D('ガラス', 99, 'static', 0, [170, 230, 230], 20, 0.1, '固体', '透明な固体。');
MATS[M.HGVAPOR] = D('水銀蒸気', -1.5, 'gas', 3, [170, 150, 210], 370, 0.05, '気体', '340℃以下で水銀に戻る。');
MATS[M.GUIDE] = D('ガイド', 99, 'static', 0, [90, 110, 150], 20, 0, '機械', '流体は素通りし、可動壁だけを止める。');
MATS[M.MOVER] = D('可動壁', 99, 'static', 0, [150, 200, 230], 20, 0.01, '機械', 'モーターで動く壁。流体を押しのける。');
MATS[M.PROCESSOR] = D('循環装置', 99, 'device', 0, [255, 140, 220], 20, 0.2, '装置', '左が主入口、右が主出口、下が補助ポートの処理装置。', 0.4);
MATS[M.ACTIVATOR] = D('活性剤', 4.5, 'powder', 0, [255, 120, 160], 20, 0.3, '粉体', '晶塩と反応して複合結晶を作る架空の材料。');
MATS[M.COMPOSITE] = D('複合結晶', 7.5, 'powder', 0, [190, 140, 255], 20, 0.3, '粉体', '晶塩＋活性剤から生まれる重い結晶。加熱で再生できる。', 0.15);
MATS[M.SOLVENT] = D('揮発溶媒', 3, 'liquid', 6, [140, 230, 200], 20, 0.2, '液体', '65℃で蒸発し、55℃以下で凝縮する低沸点の液体。');
MATS[M.SOLVAPOR] = D('溶媒蒸気', -2.5, 'gas', 3, [170, 240, 220], 70, 0.01, '気体', '55℃以下で揮発溶媒に戻る。');
MATS[M.EXTRACT] = D('抽出液', 6, 'liquid', 3, [240, 110, 60], 20, 0.15, '液体', '水と混ざらない重い液体。晶塩を運び、回収後に再利用できる。');
MATS[M.LOADED] = D('晶塩入り抽出液', 6.5, 'liquid', 3, [250, 180, 90], 20, 0.15, '液体', '晶塩を取り込んだ抽出液。回収器で分離できる。');
MATS[M.NITROGEN] = D('窒素', -1, 'gas', 4, [70, 80, 120], 20, 0.06, '気体', '空気の大部分。反応しない。');

const isMovable = (k: Kind) => k === 'liquid' || k === 'gas' || k === 'powder';
// 高速化用の物性テーブル
const KCODE: Record<Kind, number> = { none: 0, static: 1, liquid: 2, gas: 3, powder: 4, device: 5 };
export const DENS = Float32Array.from(MATS, (d) => d.dens);
export const KIND = Uint8Array.from(MATS, (d) => KCODE[d.kind]);
export const SPREAD = Uint8Array.from(MATS, (d) => d.spread);
export const COND = Float32Array.from(MATS, (d) => d.cond);
export const CH = 16; // チャンク（休眠判定）の大きさ

export interface Pump { ax: number; ay: number; bx: number; by: number; rate: number; moved: number; r?: number }

export const PROCESS_MODES = ['electrolysis', 'combustion', 'condensation', 'crystallization', 'regeneration', 'extraction', 'recovery'] as const;
export type ProcessMode = typeof PROCESS_MODES[number];
/** FluidLab の7方式の循環装置（左=主入口、右=主出口、下=補助） */
export const PROCESSES: Record<ProcessMode, { name: string; sym: string; desc: string }> = {
  electrolysis: { name: '電解槽', sym: 'EL', desc: '主入口の水を、水素（主出口）と酸素（補助出口）へ分ける。' },
  combustion: { name: '着火燃焼器', sym: 'FL', desc: '主入口の水素と補助入口の酸素を燃やし、主出口へ水蒸気を出す。' },
  condensation: { name: '凝縮器', sym: 'CD', desc: '主入口の水蒸気から熱を除き、主出口へ20℃の水を戻す。' },
  crystallization: { name: '結晶反応器', sym: 'CR', desc: '主入口の晶塩と補助入口の活性剤を混ぜ、主出口に複合結晶を作る。' },
  regeneration: { name: '結晶再生器', sym: 'RG', desc: '主入口の複合結晶を加熱し、主出口の晶塩と補助出口の活性剤に戻す。' },
  extraction: { name: '抽出器', sym: 'EX', desc: '主入口の塩水から晶塩を取り込み、補助入口の抽出液とともに主出口へ。水は元の槽に残る。' },
  recovery: { name: '回収器', sym: 'RC', desc: '主入口の晶塩入り抽出液を、主出口の晶塩と補助出口の抽出液に分ける。' },
};
export interface Processor { x: number; y: number; size: number; mode: ProcessMode; rate: number; count: number; status: string }

export class Sim {
  readonly w: number; readonly h: number; readonly n: number;
  t: Uint8Array; temp: Float32Array; aux: Uint8Array; stamp: Uint8Array; noise: Uint8Array;
  pumps: Pump[] = [];
  processors: Processor[] = [];
  frame = 0;
  readonly cw: number; readonly chh: number;
  /** チャンクごとの活動カウンタ（0で休眠） */
  active: Uint8Array; heatAct: Uint8Array;
  /** 直近ステップで計算したチャンク数（性能表示用） */
  awakeChunks = 0;
  ambient = 20;
  /** 解像度倍率に合わせた熱伝導の補正（S倍のセルでも論理的な熱の伝わり方を保つ） */
  heatK = 1;
  /** 横への広がりの補正（解像度倍率） */
  spreadK = 1;
  /** 反応カウンタ（ゲーム・テスト用） */
  stats = { burned: 0, dissolved: 0, crystallized: 0, split: 0, synthesized: 0, regenerated: 0, extracted: 0, recovered: 0 };
  private rnd: () => number;
  rnd01() { return this.rnd(); }

  constructor(w: number, h: number, seed = 1) {
    this.w = w; this.h = h; this.n = w * h;
    this.t = new Uint8Array(this.n); this.temp = new Float32Array(this.n).fill(20);
    this.aux = new Uint8Array(this.n); this.stamp = new Uint8Array(this.n); this.noise = new Uint8Array(this.n);
    this.cw = Math.ceil(w / CH); this.chh = Math.ceil(h / CH);
    this.active = new Uint8Array(this.cw * this.chh).fill(4); this.heatAct = new Uint8Array(this.cw * this.chh).fill(4);
    let s = seed >>> 0 || 1;
    this.rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    for (let i = 0; i < this.n; i++) this.noise[i] = (this.rnd() * 24) | 0;
  }
  clear() { this.t.fill(0); this.temp.fill(this.ambient); this.aux.fill(0); this.pumps = []; this.processors = []; this.wakeAll(); }
  /** 装置を含むチャンクは常に起こしておく */
  pinned!: Uint8Array;
  scanPins() {
    const p = this.pinned ?? (this.pinned = new Uint8Array(this.active.length)); p.fill(0);
    const { t, w } = this;
    for (let i = 0; i < this.n; i++) if (KIND[t[i]] === 5) { const c = (((i / w) | 0) / CH | 0) * this.cw + (((i % w) / CH) | 0); if (!p[c]) { p[c] = 1; this.active[c] = 4; this.heatAct[c] = 4; } }
  }
  wakeAll() { this.active.fill(4); this.heatAct.fill(4); }
  /** セル i の周辺チャンクを起こす */
  wake(i: number) {
    const x = i % this.w, y = (i / this.w) | 0;
    const cx = (x / CH) | 0, cy = (y / CH) | 0, cw = this.cw;
    const c = cy * cw + cx;
    this.active[c] = 4; this.heatAct[c] = 4;
    const lx = x - cx * CH, ly = y - cy * CH;
    if (lx <= 2 && cx > 0) { this.active[c - 1] = 4; this.heatAct[c - 1] = 4; }
    if (lx >= CH - 3 && cx < cw - 1) { this.active[c + 1] = 4; this.heatAct[c + 1] = 4; }
    if (ly <= 2 && cy > 0) { this.active[c - cw] = 4; this.heatAct[c - cw] = 4; }
    if (ly >= CH - 3 && cy < this.chh - 1) { this.active[c + cw] = 4; this.heatAct[c + cw] = 4; }
  }
  idx(x: number, y: number) { return y * this.w + x; }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number) { return this.inside(x, y) ? this.t[y * this.w + x] : M.WALL; }
  set(x: number, y: number, m: number, aux = 0) {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x; this.t[i] = m; this.temp[i] = MATS[m].temp; this.aux[i] = aux; this.wake(i);
  }
  count(m: number) { let c = 0; for (let i = 0; i < this.n; i++) if (this.t[i] === m) c++; return c; }

  snapshot() { return { t: this.t.slice(), temp: this.temp.slice(), aux: this.aux.slice(), pumps: this.pumps.map((p) => ({ ...p })), processors: this.processors.map((p) => ({ ...p })) }; }
  restore(s: ReturnType<Sim['snapshot']>) { this.t.set(s.t); this.temp.set(s.temp); this.aux.set(s.aux); this.pumps = s.pumps.map((p) => ({ ...p })); this.processors = s.processors.map((p) => ({ ...p })); this.wakeAll(); }

  private canEnter(m: number, o: number, down: boolean) {
    if (o === M.EMPTY) return true;
    const k = KIND[o];
    if (k !== 2 && k !== 3) return false;
    return down ? DENS[m] > DENS[o] : DENS[m] < DENS[o];
  }
  private swap(i: number, j: number) {
    const t = this.t, tp = this.temp, f = this.frame;
    const a = t[i]; t[i] = t[j]; t[j] = a;
    const b = tp[i]; tp[i] = tp[j]; tp[j] = b;
    this.stamp[j] = f; this.stamp[i] = f;
    this.wake(i); this.wake(j);
  }
  /** 選択膜を通り抜ける：i から方向 d に進み、膜の先の空きへ移動 */
  private tunnel(i: number, d: number, m: number): boolean {
    let j = i + d;
    for (let k = 0; k < 6; k++) {
      if (j < 0 || j >= this.n) return false;
      if (this.t[j] === M.FILTER) { if (this.aux[j] !== m) return false; j += d; continue; }
      if (k === 0) return false;
      if (this.t[j] === M.EMPTY) { this.swap(i, j); return true; }
      return false;
    }
    return false;
  }

  /** 機構（モーター・可動壁）のフック */
  beforeStep?: () => void;

  step() {
    this.frame = ((this.frame + 1) & 255) || 1;
    this.beforeStep?.();
    this.move();
    this.react();
    this.runPumps();
    this.runProcessors();
    if ((this.frame & 31) === 1) this.scanPins();
    const pin = this.pinned;
    for (let c = 0; c < this.active.length; c++) { if (pin[c]) continue; if (this.active[c]) this.active[c]--; if (this.heatAct[c]) this.heatAct[c]--; }
  }

  private move() {
    const { t, w, h } = this; const f = this.frame;
    const ltr = (f & 1) === 0;
    const cw = this.cw, act = this.active;
    let awake = 0;
    for (let y = h - 1; y >= 0; y--) {
      const crow = ((y / CH) | 0) * cw;
      for (let k = 0; k < w; k++) {
        const x = ltr ? k : w - 1 - k;
        if ((x & (CH - 1)) === (ltr ? 0 : CH - 1) || k === 0) {
          // チャンクの先頭：休眠中なら丸ごと飛ばす
          if (!act[crow + ((x / CH) | 0)]) { const skip = ltr ? CH - 1 - (x & (CH - 1)) : (x & (CH - 1)); k += skip; continue; }
          if ((y & (CH - 1)) === 0) awake++;
        }
        const i = y * w + x;
        const m = t[i];
        if (m <= M.PWALL || this.stamp[i] === f) continue;
        const kd = KIND[m];
        if (kd < 2 || kd > 4) continue;
        const def = MATS[m];
        const dy = def.dens > 0 ? 1 : -1;
        const ny = y + dy;
        // 気体はときどき横に揺らぐ
        if (def.kind === 'gas' && this.rnd() < 0.15) {
          const nx = x + (this.rnd() < 0.5 ? 1 : -1);
          if (nx >= 0 && nx < w && t[i - x + nx] === M.EMPTY) { this.swap(i, i - x + nx); continue; }
        }
        if (ny >= 0 && ny < h) {
          const j = i + dy * w;
          const o = t[j];
          if (this.canEnter(m, o, dy > 0)) { this.swap(i, j); continue; }
          if (o === M.FILTER && this.tunnel(i, dy * w, m)) continue;
          const s = this.rnd() < 0.5 ? 1 : -1;
          let moved = false;
          for (let q = 0; q < 2 && !moved; q++) {
            const sx = q === 0 ? s : -s;
            const nx = x + sx;
            if (nx < 0 || nx >= w) continue;
            const jj = ny * w + nx;
            if (this.canEnter(m, t[jj], dy > 0) && (t[i + sx] === M.EMPTY || KIND[t[i + sx]] === 3 || KIND[t[i + sx]] === 2)) { this.swap(i, jj); moved = true; }
          }
          if (moved) continue;
        }
        if (def.kind === 'powder') continue;
        const dir = this.rnd() < 0.5 ? 1 : -1;
        let best = -1;
        const spr = def.spread * this.spreadK;
        for (let d = 1; d <= spr; d++) {
          const nx = x + dir * d;
          if (nx < 0 || nx >= w) break;
          const j = y * w + nx;
          const o = t[j];
          if (o === M.EMPTY || (kd === 2 && KIND[o] === 3)) best = j;
          else if (kd === 3 && KIND[o] === 3 && DENS[o] > def.dens + 1) { best = j; break; }
          // 重い液体は軽い液体の下へ横からも潜り込む
          else if (kd === 2 && KIND[o] === 2 && DENS[o] < def.dens && (ny < 0 || ny >= h || t[i + dy * w] !== M.EMPTY) && this.rnd() < 0.5) { best = j; break; }
          else { if (d === 1 && o === M.FILTER) this.tunnel(i, dir, m); break; }
          const below = ny >= 0 && ny < h ? t[j + dy * w] : M.WALL;
          if (below === M.EMPTY) break;
        }
        if (best >= 0 && this.stamp[i] !== f) this.swap(i, best);
      }
    }
    this.awakeChunks = awake;
  }

  private emptyNear(i: number): number {
    const { t, w } = this;
    const c = [i - w, i - 1, i + 1, i + w];
    const o = (this.rnd() * 4) | 0;
    for (let k = 0; k < 4; k++) { const j = c[(k + o) & 3]; if (j >= 0 && j < this.n && t[j] === M.EMPTY) return j; }
    return -1;
  }

  private findNear(i: number, m: number): number {
    const { t, w } = this;
    if (t[i - w] === m) return i - w; if (t[i + w] === m) return i + w; if (t[i - 1] === m) return i - 1; if (t[i + 1] === m) return i + 1;
    // 半径2まで探す（炎の伝播を速くする）
    const c = [i - 2 * w, i + 2 * w, i - 2, i + 2, i - w - 1, i - w + 1, i + w - 1, i + w + 1];
    for (const j of c) if (j >= 0 && j < this.n && t[j] === m) return j;
    // 高解像度では探索半径も広げる
    const R = 2 * this.spreadK;
    if (R > 2) {
      const x = i % w, y = (i / w) | 0;
      for (let r = 3; r <= R; r++) for (let k = 0; k < 6; k++) {
        const a = this.rnd() * 6.283, xx = x + Math.round(Math.cos(a) * r), yy = y + Math.round(Math.sin(a) * r);
        if (xx >= 0 && yy >= 0 && xx < w && yy < this.h && t[yy * w + xx] === m) return yy * w + xx;
      }
    }
    return -1;
  }

  private react() {
    const { t, temp: tp, w, h } = this;
    const amb = this.ambient;
    const cw = this.cw, ha = this.heatAct, act = this.active;
    const hk = this.heatK, ihk = 1 / hk;
    for (let y = 1; y < h - 1; y++) {
      const crow = ((y / CH) | 0) * cw;
      for (let x = 1; x < w - 1; x++) {
        const c = crow + ((x / CH) | 0);
        if (!ha[c] && !act[c]) { x = Math.min(w - 2, (((x / CH) | 0) + 1) * CH - 1); continue; }
        const i = y * w + x; const m = t[i];
        if (m === M.WALL || m === M.PWALL || m === M.GLASS || m === M.GUIDE || m === M.MOVER) continue;
        const def = MATS[m];
        if (m === M.HEATER || m === M.COOLER || m === M.IGNITER) { tp[i] = def.temp; continue; }
        let avg: number;
        if (m === M.EMPTY) avg = (tp[i - 1] + tp[i + 1] + tp[i - w] + tp[i + w]) * 0.25;
        else {
          // 物質どうしの接触で熱を伝える（真空は断熱に近い）
          let sum = 0, c = 0;
          if (t[i - 1] > M.PWALL) { sum += tp[i - 1]; c++; }
          if (t[i + 1] > M.PWALL) { sum += tp[i + 1]; c++; }
          if (t[i - w] > M.PWALL) { sum += tp[i - w]; c++; }
          if (t[i + w] > M.PWALL) { sum += tp[i + w]; c++; }
          avg = c ? (sum + tp[i] * (4 - c)) * 0.25 : tp[i];
        }
        let v = tp[i] + (avg - tp[i]) * Math.min(1, def.cond * (m === M.EMPTY ? 0.3 : 0.5) * hk);
        v += (amb - v) * (m === M.EMPTY ? 0.08 : (m === M.STEAM ? 0.0006 : m === M.LAVA ? 0.00005 : m === M.FIRE ? 0.001 : 0.004) * ihk);
        const dv = v - tp[i];
        tp[i] = v;
        if (dv > 0.01 || dv < -0.01) ha[c] = 4;
        if (m === M.EMPTY) continue;
        // ランダムな隣接セル1つ
        const r = (this.rnd() * 4) | 0;
        const j = r === 0 ? i - w : r === 1 ? i + w : r === 2 ? i - 1 : i + 1;
        const o = t[j];
        this.react1(i, j, m, o, v);
        if (t[i] !== m || t[j] !== o || tp[i] !== v) { this.wake(i); this.wake(j); }
      }
    }
  }

  private react1(i: number, j: number, m: number, o: number, v: number) {
    const { t, temp: tp } = this;
    {
      {
        switch (m) {
          case M.WATER:
            if (v >= 100) t[i] = M.STEAM; else if (v <= 0) t[i] = M.ICE;
            else if (o === M.SALT && this.rnd() < 0.5) { t[i] = M.BRINE; t[j] = M.EMPTY; this.stats.dissolved++; }
            break;
          case M.BRINE:
            if (v >= 100) { const e = this.emptyNear(i); if (e >= 0) { t[e] = M.STEAM; tp[e] = 110; t[i] = M.SALT; this.stats.crystallized++; } else if (this.rnd() < 0.5) { t[i] = M.SALT; this.stats.crystallized++; } else { t[i] = M.STEAM; } }
            else if (v <= -10) t[i] = M.ICE;
            break;
          case M.STEAM: if (v < 70) t[i] = M.WATER; break;
          case M.ACTIVATOR:
            if (o === M.BRINE && v < 90) { t[i] = M.COMPOSITE; tp[i] = 55; t[j] = M.WATER; this.stats.synthesized++; }
            break;
          case M.COMPOSITE:
            if (v >= 220) { const e = this.emptyNear(i); if (e >= 0) { t[i] = M.SALT; t[e] = M.ACTIVATOR; tp[e] = v; this.stats.regenerated++; } }
            break;
          case M.SOLVENT: if (v >= 65) t[i] = M.SOLVAPOR; break;
          case M.SOLVAPOR: if (v < 55) t[i] = M.SOLVENT; break;
          case M.ICE: if (v >= 2) t[i] = M.WATER; break;
          case M.OIL:
            if (o === M.IGNITER || o === M.FIRE) tp[i] = Math.max(v, 400);
            if (o === M.OXYGEN && v >= 250) { t[i] = M.FIRE; tp[i] = 900; t[j] = M.CO2; tp[j] = 400; this.stats.burned++; }
            else if (v >= 300 && o !== M.OXYGEN) { t[i] = M.SOOT; }
            break;
          case M.SOOT:
            if (o === M.IGNITER || o === M.FIRE) tp[i] = Math.max(v, 500);
            if (o === M.OXYGEN && v >= 400) { t[i] = M.FIRE; tp[i] = 800; t[j] = M.CO2; tp[j] = 400; this.stats.burned++; }
            break;
          case M.HYDROGEN:
            if (o === M.IGNITER || o === M.FIRE) tp[i] = Math.max(v, 600);
            if (tp[i] >= 500 || (o === M.OXYGEN && tp[j] >= 500)) {
              const nb = this.findNear(i, M.OXYGEN);
              if (nb >= 0) { t[i] = M.FIRE; tp[i] = 800; t[nb] = M.FIRE; tp[nb] = 800; this.aux[i] = 1; this.aux[nb] = 1; this.stats.burned++; }
            }
            break;
          case M.OXYGEN:
            if (o === M.IGNITER || o === M.FIRE) tp[i] = Math.max(v, 600);
            if (tp[i] >= 500) {
              const nb = this.findNear(i, M.HYDROGEN);
              if (nb >= 0) { t[nb] = M.FIRE; tp[nb] = 800; this.aux[nb] = 1; t[i] = M.FIRE; tp[i] = 800; this.aux[i] = 1; this.stats.burned++; }
            }
            break;
          case M.FIRE:
            if (v < 900) tp[i] = Math.max(v, 700);
            if (this.rnd() < 0.05) {
              if (this.aux[i] === 1) { t[i] = M.STEAM; tp[i] = 300; this.aux[i] = 0; } // 水素の炎は蒸気に
              else t[i] = this.rnd() < 0.3 ? M.SMOKE : M.EMPTY;
            }
            break;
          case M.SMOKE: if (this.rnd() < 0.002) t[i] = M.EMPTY; break;
          case M.LAVA:
            if (v < 700) t[i] = M.ROCK;
            else if (o === M.WATER) { t[j] = M.STEAM; tp[j] = 120; tp[i] -= 260; }
            break;
          case M.ROCK: if (v >= 900) t[i] = M.LAVA; break;
          case M.SAND: if (v >= 1400) t[i] = M.GLASS; break;
          case M.MERCURY: if (v >= 357) t[i] = M.HGVAPOR; break;
          case M.HGVAPOR: if (v < 340) t[i] = M.MERCURY; break;
          case M.ELECTRO:
            if ((o === M.WATER || o === M.BRINE) && this.rnd() < 0.1) {
              const gas = (this.stats.split & 1) ? M.OXYGEN : M.HYDROGEN;
              if (o === M.BRINE) { const e = this.emptyNear(j); if (e < 0) break; t[j] = M.SALT; t[e] = gas; tp[e] = 20; }
              else { t[j] = gas; tp[j] = 20; }
              this.stats.split++;
            }
            break;
        }
      }
    }
  }

  /** ポート領域（主入口=左、主出口=右、補助=下） */
  portCells(p: Processor, port: 'in' | 'out' | 'aux'): number[] {
    const h = p.size >> 1, d = Math.max(2, h), out: number[] = [];
    for (let a = 1; a <= d; a++) for (let b = -h; b <= h; b++) {
      const x = port === 'in' ? p.x - h - a : port === 'out' ? p.x + h + a : p.x + b;
      const y = port === 'aux' ? p.y + h + a : p.y + b;
      if (this.inside(x, y)) out.push(y * this.w + x);
    }
    return out;
  }
  private takeAt(cells: number[], m: number, n = 1, used?: Set<number>, deep = 0): number[] {
    const r: number[] = [];
    for (const i of cells) { if (this.t[i] === m && !used?.has(i)) { r.push(i); used?.add(i); if (r.length >= n) break; } }
    if (r.length < n && deep) {
      // 補助ポートは下に積もった材料を吸い上げる（流体・粉体の柱をたどる）
      const { t, w } = this;
      for (const c of cells) {
        for (let k = 1, j = c + w; k <= deep && j < this.n; k++, j += w) {
          const kk = KIND[t[j]]; if (t[j] !== M.EMPTY && (kk < 2 || kk > 4)) break;
          if (t[j] === m && !used?.has(j)) { r.push(j); used?.add(j); break; }
        }
        if (r.length >= n) break;
      }
    }
    return r.length >= n ? r : [];
  }
  private emptyAt(cells: number[], n: number, used: Set<number>): number[] {
    const r: number[] = [];
    for (const i of cells) { if (this.t[i] === M.EMPTY && !used.has(i)) { r.push(i); used.add(i); if (r.length >= n) break; } }
    return r.length >= n ? r : [];
  }
  private runProcessors() {
    const { t, temp: tp } = this;
    for (const p of this.processors) {
      const pin = this.portCells(p, 'in'), pout = this.portCells(p, 'out'), paux = this.portCells(p, 'aux');
      let done = 0;
      for (let n = 0; n < p.rate; n++) {
        const used = new Set<number>();
        const put = (cells: number[], m: number, temp = 20) => { for (const i of cells) { t[i] = m; tp[i] = temp; this.wake(i); } };
        const clear = (cells: number[]) => { for (const i of cells) { t[i] = M.EMPTY; this.wake(i); } };
        let ok = false;
        switch (p.mode) {
          case 'electrolysis': { const a = this.takeAt(pin, M.WATER, 2, used); const o1 = this.emptyAt(pout, 1, used), o2 = this.emptyAt(paux, 1, used); if (a.length && o1.length && o2.length) { clear(a); put(o1, M.HYDROGEN); put(o2, M.OXYGEN); ok = true; this.stats.split++; } break; }
          case 'combustion': { const a = this.takeAt(pin, M.HYDROGEN, 1, used), b = this.takeAt(paux, M.OXYGEN, 1, used, 0); const o = this.emptyAt(pout, 2, used); if (a.length && b.length && o.length) { clear(a); clear(b); put(o, M.STEAM, 300); ok = true; this.stats.burned++; } break; }
          case 'condensation': { const a = this.takeAt(pin, M.STEAM, 1, used); const o = this.emptyAt(pout, 1, used); if (a.length && o.length) { clear(a); put(o, M.WATER); ok = true; } break; }
          case 'crystallization': { const a = this.takeAt(pin, M.SALT, 1, used), b = this.takeAt(paux, M.ACTIVATOR, 1, used, 40); const o = this.emptyAt(pout, 2, used); if (a.length && b.length && o.length) { clear(a); clear(b); put(o, M.COMPOSITE, 55); ok = true; this.stats.synthesized++; } break; }
          case 'regeneration': { const a = this.takeAt(pin, M.COMPOSITE, 2, used); const o1 = this.emptyAt(pout, 1, used), o2 = this.emptyAt(paux, 1, used); if (a.length && o1.length && o2.length) { clear(a); put(o1, M.SALT, 220); put(o2, M.ACTIVATOR, 220); ok = true; this.stats.regenerated++; } break; }
          case 'extraction': { const a = this.takeAt(pin, M.BRINE, 1, used), b = this.takeAt(paux, M.EXTRACT, 1, used, 40); const o = this.emptyAt(pout, 1, used); if (a.length && b.length && o.length) { t[a[0]] = M.WATER; this.wake(a[0]); clear(b); put(o, M.LOADED); ok = true; this.stats.extracted++; } break; }
          case 'recovery': { const a = this.takeAt(pin, M.LOADED, 1, used); const o1 = this.emptyAt(pout, 1, used), o2 = this.emptyAt(paux, 1, used); if (a.length && o1.length && o2.length) { clear(a); put(o1, M.SALT); put(o2, M.EXTRACT); ok = true; this.stats.recovered++; } break; }
        }
        if (!ok) break;
        done++;
      }
      p.count += done;
      p.status = done ? '処理中' : '原料不足・出口満杯';
    }
  }

  private runPumps() {
    const { t, w } = this;
    for (const p of this.pumps) {
      const R = p.r ?? 2;
      for (let n = 0; n < p.rate; n++) {
        let src = -1, dst = -1;
        for (let k = 0; k < 12 && src < 0; k++) {
          const x = p.ax + ((this.rnd() * (2 * R + 1)) | 0) - R, y = p.ay + ((this.rnd() * (2 * R + 1)) | 0) - R;
          if (!this.inside(x, y)) continue;
          const i = y * w + x;
          if (isMovable(MATS[t[i]].kind)) src = i;
        }
        for (let k = 0; k < 12 && dst < 0; k++) {
          const x = p.bx + ((this.rnd() * (2 * R + 1)) | 0) - R, y = p.by + ((this.rnd() * (2 * R + 1)) | 0) - R;
          if (!this.inside(x, y)) continue;
          const i = y * w + x;
          if (t[i] === M.EMPTY) dst = i;
        }
        if (src < 0 || dst < 0) break;
        this.swap(src, dst); p.moved++;
      }
    }
  }
}
