// しずく錬金工房 — セル流体エンジン（型付き配列・CPU）
export const enum M {
  EMPTY, WALL, PWALL, WATER, STEAM, ICE, OIL, SMOKE, LAVA, ROCK, MERCURY, HYDROGEN, HEATER, COOLER,
  SALT, BRINE, OXYGEN, CO2, FIRE, SOOT, IGNITER, ELECTRO, FILTER, SAND, GLASS, HGVAPOR, NITROGEN,
}
export const MAT_COUNT = 27;

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
MATS[M.NITROGEN] = D('窒素', -1, 'gas', 4, [70, 80, 120], 20, 0.06, '気体', '空気の大部分。反応しない。');

const isMovable = (k: Kind) => k === 'liquid' || k === 'gas' || k === 'powder';

export interface Pump { ax: number; ay: number; bx: number; by: number; rate: number; moved: number }

export class Sim {
  readonly w: number; readonly h: number; readonly n: number;
  t: Uint8Array; temp: Float32Array; aux: Uint8Array; stamp: Uint8Array; noise: Uint8Array;
  pumps: Pump[] = [];
  frame = 0;
  ambient = 20;
  /** 反応カウンタ（ゲーム・テスト用） */
  stats = { burned: 0, dissolved: 0, crystallized: 0, split: 0 };
  private rnd: () => number;
  rnd01() { return this.rnd(); }

  constructor(w: number, h: number, seed = 1) {
    this.w = w; this.h = h; this.n = w * h;
    this.t = new Uint8Array(this.n); this.temp = new Float32Array(this.n).fill(20);
    this.aux = new Uint8Array(this.n); this.stamp = new Uint8Array(this.n); this.noise = new Uint8Array(this.n);
    let s = seed >>> 0 || 1;
    this.rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    for (let i = 0; i < this.n; i++) this.noise[i] = (this.rnd() * 24) | 0;
  }
  clear() { this.t.fill(0); this.temp.fill(this.ambient); this.aux.fill(0); this.pumps = []; }
  idx(x: number, y: number) { return y * this.w + x; }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number) { return this.inside(x, y) ? this.t[y * this.w + x] : M.WALL; }
  set(x: number, y: number, m: number, aux = 0) {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x; this.t[i] = m; this.temp[i] = MATS[m].temp; this.aux[i] = aux;
  }
  count(m: number) { let c = 0; for (let i = 0; i < this.n; i++) if (this.t[i] === m) c++; return c; }

  snapshot() { return { t: this.t.slice(), temp: this.temp.slice(), aux: this.aux.slice(), pumps: this.pumps.map((p) => ({ ...p })) }; }
  restore(s: ReturnType<Sim['snapshot']>) { this.t.set(s.t); this.temp.set(s.temp); this.aux.set(s.aux); this.pumps = s.pumps.map((p) => ({ ...p })); }

  private canEnter(m: number, o: number, down: boolean) {
    if (o === M.EMPTY) return true;
    const od = MATS[o];
    if (od.kind !== 'liquid' && od.kind !== 'gas') return false;
    return down ? MATS[m].dens > od.dens : MATS[m].dens < od.dens;
  }
  private swap(i: number, j: number) {
    const t = this.t, tp = this.temp, f = this.frame;
    const a = t[i]; t[i] = t[j]; t[j] = a;
    const b = tp[i]; tp[i] = tp[j]; tp[j] = b;
    this.stamp[j] = f; this.stamp[i] = f;
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

  step() {
    this.frame = ((this.frame + 1) & 255) || 1;
    this.move();
    this.react();
    this.runPumps();
  }

  private move() {
    const { t, w, h } = this; const f = this.frame;
    const ltr = (f & 1) === 0;
    for (let y = h - 1; y >= 0; y--) {
      for (let k = 0; k < w; k++) {
        const x = ltr ? k : w - 1 - k;
        const i = y * w + x;
        const m = t[i];
        if (m <= M.PWALL || this.stamp[i] === f) continue;
        const def = MATS[m];
        if (!isMovable(def.kind)) continue;
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
            if (this.canEnter(m, t[jj], dy > 0) && (t[i + sx] === M.EMPTY || MATS[t[i + sx]].kind === 'gas' || MATS[t[i + sx]].kind === 'liquid')) { this.swap(i, jj); moved = true; }
          }
          if (moved) continue;
        }
        if (def.kind === 'powder') continue;
        const dir = this.rnd() < 0.5 ? 1 : -1;
        let best = -1;
        for (let d = 1; d <= def.spread; d++) {
          const nx = x + dir * d;
          if (nx < 0 || nx >= w) break;
          const j = y * w + nx;
          const o = t[j];
          if (o === M.EMPTY || (def.kind === 'liquid' && MATS[o].kind === 'gas')) best = j;
          else if (def.kind === 'gas' && MATS[o].kind === 'gas' && MATS[o].dens > def.dens + 1) { best = j; break; }
          else { if (d === 1 && o === M.FILTER) this.tunnel(i, dir, m); break; }
          const below = ny >= 0 && ny < h ? t[j + dy * w] : M.WALL;
          if (below === M.EMPTY) break;
        }
        if (best >= 0 && this.stamp[i] !== f) this.swap(i, best);
      }
    }
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
    return -1;
  }

  private react() {
    const { t, temp: tp, w, h } = this;
    const amb = this.ambient;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x; const m = t[i];
        if (m === M.WALL || m === M.PWALL || m === M.GLASS) continue;
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
        let v = tp[i] + (avg - tp[i]) * def.cond * (m === M.EMPTY ? 0.3 : 0.5);
        v += (amb - v) * (m === M.EMPTY ? 0.08 : m === M.STEAM ? 0.0006 : m === M.LAVA ? 0.00005 : m === M.FIRE ? 0.001 : 0.004);
        tp[i] = v;
        if (m === M.EMPTY) continue;
        // ランダムな隣接セル1つ
        const r = (this.rnd() * 4) | 0;
        const j = r === 0 ? i - w : r === 1 ? i + w : r === 2 ? i - 1 : i + 1;
        const o = t[j];
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

  private runPumps() {
    const { t, w } = this;
    for (const p of this.pumps) {
      for (let n = 0; n < p.rate; n++) {
        let src = -1, dst = -1;
        for (let k = 0; k < 12 && src < 0; k++) {
          const x = p.ax + ((this.rnd() * 5) | 0) - 2, y = p.ay + ((this.rnd() * 5) | 0) - 2;
          if (!this.inside(x, y)) continue;
          const i = y * w + x;
          if (isMovable(MATS[t[i]].kind)) src = i;
        }
        for (let k = 0; k < 12 && dst < 0; k++) {
          const x = p.bx + ((this.rnd() * 5) | 0) - 2, y = p.by + ((this.rnd() * 5) | 0) - 2;
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
