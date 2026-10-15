// セル流体シミュレーション（型付き配列・単一パス）
export const W = 160, H = 100, N = W * H;

export const enum M {
  EMPTY, WALL, PWALL, WATER, STEAM, ICE, OIL, SMOKE, LAVA, ROCK, MERCURY, HYDROGEN, HEATER, COOLER,
}

export interface MatDef { name: string; dens: number; kind: 'none' | 'solid' | 'liquid' | 'gas' | 'powder'; spread: number; color: [number, number, number]; temp: number; cond: number }

export const MATS: MatDef[] = [];
MATS[M.EMPTY] = { name: '空', dens: 0, kind: 'none', spread: 0, color: [14, 17, 28], temp: 20, cond: 0.02 };
MATS[M.WALL] = { name: '岩盤', dens: 99, kind: 'solid', spread: 0, color: [70, 74, 92], temp: 20, cond: 0.01 };
MATS[M.PWALL] = { name: '壁', dens: 99, kind: 'solid', spread: 0, color: [196, 160, 98], temp: 20, cond: 0.01 };
MATS[M.WATER] = { name: '水', dens: 4, kind: 'liquid', spread: 5, color: [48, 130, 235], temp: 20, cond: 0.25 };
MATS[M.STEAM] = { name: '蒸気', dens: -3, kind: 'gas', spread: 3, color: [200, 215, 230], temp: 110, cond: 0.015 };
MATS[M.ICE] = { name: '氷', dens: 3, kind: 'solid', spread: 0, color: [170, 225, 255], temp: -12, cond: 0.25 };
MATS[M.OIL] = { name: '油', dens: 2, kind: 'liquid', spread: 2, color: [214, 170, 40], temp: 20, cond: 0.12 };
MATS[M.SMOKE] = { name: '煙', dens: -2, kind: 'gas', spread: 2, color: [90, 90, 96], temp: 180, cond: 0.05 };
MATS[M.LAVA] = { name: '溶岩', dens: 7, kind: 'liquid', spread: 1, color: [255, 90, 20], temp: 1200, cond: 0.2 };
MATS[M.ROCK] = { name: '岩石', dens: 6, kind: 'powder', spread: 0, color: [110, 92, 84], temp: 420, cond: 0.15 };
MATS[M.MERCURY] = { name: '水銀', dens: 9, kind: 'liquid', spread: 6, color: [190, 196, 205], temp: 20, cond: 0.4 };
MATS[M.HYDROGEN] = { name: '水素', dens: -6, kind: 'gas', spread: 6, color: [150, 255, 200], temp: 20, cond: 0.1 };
MATS[M.HEATER] = { name: 'ヒーター', dens: 99, kind: 'solid', spread: 0, color: [255, 60, 40], temp: 600, cond: 1 };
MATS[M.COOLER] = { name: 'クーラー', dens: 99, kind: 'solid', spread: 0, color: [60, 200, 255], temp: -60, cond: 1 };

export class Sim {
  t = new Uint8Array(N);
  temp = new Float32Array(N);
  stamp = new Uint8Array(N);
  noise = new Uint8Array(N);
  frame = 0;
  constructor() { for (let i = 0; i < N; i++) { this.noise[i] = (Math.random() * 24) | 0; this.temp[i] = 20; } }
  clear() { this.t.fill(0); this.temp.fill(20); }
  set(x: number, y: number, m: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x; this.t[i] = m; this.temp[i] = MATS[m].temp;
  }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= W || y >= H ? M.WALL : this.t[y * W + x]; }

  private canSwap(m: number, o: number, down: boolean) {
    if (o === M.EMPTY) return true;
    const od = MATS[o];
    if (od.kind !== 'liquid' && od.kind !== 'gas') return false;
    const d = MATS[m].dens;
    return down ? d > od.dens : d < od.dens;
  }
  private swap(i: number, j: number) {
    const t = this.t, tp = this.temp;
    const a = t[i]; t[i] = t[j]; t[j] = a;
    const b = tp[i]; tp[i] = tp[j]; tp[j] = b;
    this.stamp[j] = this.frame; this.stamp[i] = this.frame;
  }

  step() {
    this.frame = (this.frame + 1) & 255 || 1;
    const t = this.t, f = this.frame;
    const ltr = (this.frame & 1) === 0;
    for (let y = H - 1; y >= 0; y--) {
      for (let k = 0; k < W; k++) {
        const x = ltr ? k : W - 1 - k;
        const i = y * W + x;
        const m = t[i];
        if (m <= M.PWALL || this.stamp[i] === f) continue;
        const def = MATS[m];
        if (def.kind === 'solid' || def.kind === 'none') continue;
        const dy = def.dens > 0 ? 1 : -1;
        const ny = y + dy;
        if (ny >= 0 && ny < H) {
          const j = i + dy * W;
          if (this.canSwap(m, t[j], dy > 0)) { this.swap(i, j); continue; }
          const s = Math.random() < 0.5 ? 1 : -1;
          for (const sx of [s, -s]) {
            const nx = x + sx;
            if (nx < 0 || nx >= W) continue;
            const jj = ny * W + nx;
            if (this.canSwap(m, t[jj], dy > 0) && t[i + sx] === M.EMPTY) { this.swap(i, jj); break; }
          }
          if (this.stamp[i] === f) continue;
        }
        if (def.kind === 'powder') continue;
        // 横への広がり
        const dir = (Math.random() < 0.5 ? 1 : -1);
        let best = -1;
        for (let d = 1; d <= def.spread; d++) {
          const nx = x + dir * d;
          if (nx < 0 || nx >= W) break;
          const j = y * W + nx;
          if (t[j] === M.EMPTY) best = j; else break;
          const below = ny >= 0 && ny < H ? t[j + dy * W] : M.WALL;
          if (below === M.EMPTY) break;
        }
        if (best >= 0) this.swap(i, best);
      }
    }
    this.heat();
  }

  private heat() {
    const t = this.t, tp = this.temp;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, m = t[i];
        if (m === M.WALL || m === M.PWALL) continue;
        if (m === M.HEATER || m === M.COOLER) { tp[i] = MATS[m].temp; continue; }
        const c = MATS[m].cond;
        const avg = (tp[i - 1] + tp[i + 1] + tp[i - W] + tp[i + W]) * 0.25;
        let v = tp[i] + (avg - tp[i]) * c * (m === M.EMPTY ? 0.3 : 0.5);
        v += (20 - v) * (m === M.EMPTY ? 0.08 : m === M.LAVA || m === M.STEAM ? 0.001 : 0.004);
        tp[i] = v;
        // 相変化
        switch (m) {
          case M.WATER: if (v >= 100) t[i] = M.STEAM; else if (v <= 0) t[i] = M.ICE; break;
          case M.STEAM: if (v < 70) t[i] = M.WATER; break;
          case M.ICE: if (v >= 2) t[i] = M.WATER; break;
          case M.OIL: if (v >= 300) { t[i] = M.SMOKE; tp[i] = 300; } break;
          case M.SMOKE: if (Math.random() < 0.002) t[i] = M.EMPTY; break;
          case M.LAVA: if (v < 700) t[i] = M.ROCK; break;
          case M.ROCK: if (v >= 900) t[i] = M.LAVA; break;
        }
        // 溶岩と水の接触: 水は一気に蒸発し、溶岩は急冷
        if (m === M.LAVA) {
          for (const j of [i - 1, i + 1, i - W, i + W]) if (t[j] === M.WATER) { t[j] = M.STEAM; tp[j] = 120; tp[i] -= 260; }
        }
      }
    }
  }
}
