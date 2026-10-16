// セル → RGBA の描画（Web Worker 内で実行。DOM 非依存）
import { Sim, M, MATS, KIND } from './sim';

const N = MATS.length;
const CR = new Float32Array(N), CG = new Float32Array(N), CB = new Float32Array(N), GL = new Float32Array(N);
for (let m = 0; m < N; m++) { const c = MATS[m]?.color ?? [255, 0, 255]; CR[m] = c[0]; CG[m] = c[1]; CB[m] = c[2]; GL[m] = MATS[m]?.glow ?? 0; }
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const SIN = new Float32Array(1024); for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((i / 1024) * Math.PI * 2);
const fsin = (x: number) => SIN[((x * 162.97466) | 0) & 1023];

export type ViewMode = 'mat' | 'temp';

/** px: 本体（ABGR）、gpx: 発光レイヤー */
export function paint(s: Sim, px: Uint32Array, gpx: Uint32Array, viewMode: ViewMode, now: number) {
  const { t, temp: tp, noise: nz, w, aux } = s;
  const wave = now / 280;
  const bg0 = CR[0], bg1 = CG[0], bg2 = CB[0];
  const n = t.length;
  for (let i = 0; i < n; i++) {
    const m = t[i];
    if (m === M.EMPTY) { px[i] = 0xff000000 | (bg2 << 16) | (bg1 << 8) | bg0; gpx[i] = 0; continue; }
    let r: number, g: number, b: number, gl = 0;
    const k = KIND[m];
    if (viewMode === 'temp') {
      const T = tp[i];
      if (m === M.WALL || m === M.PWALL) { r = 50; g = 54; b = 70; }
      else if (T < 20) { const q = Math.min(1, (20 - T) / 80); r = 20 * (1 - q); g = 40 + 60 * (1 - q); b = 90 + 165 * q; }
      else { const q = Math.min(1, (T - 20) / 1000); r = 40 + 215 * Math.min(1, q * 2); g = 40 + 200 * Math.max(0, q * 2 - 0.6); b = 60 * (1 - q) + 200 * Math.max(0, q - 0.8) * 5; }
    } else {
      r = CR[m]; g = CG[m]; b = CB[m];
      const nn = nz[i] - 12;
      if (k === 2) {
        const x = i % w;
        const sh = fsin(wave + x * 0.125 + nz[i] * 0.05) * 8 + nn * 0.4;
        r += sh; g += sh; b += sh;
        const up = i >= w ? t[i - w] : M.WALL;
        if (up === M.EMPTY || KIND[up] === 3) { r += 45; g += 45; b += 45; }
        else if (up !== m) { r -= 10; g -= 10; b -= 10; }
      } else if (k === 3) {
        const a = m === M.FIRE ? 0.95 : 0.35 + nz[i] / 80;
        r = bg0 + (r - bg0) * a + nn; g = bg1 + (g - bg1) * a + nn; b = bg2 + (b - bg2) * a + nn;
        if (m === M.FIRE) g += fsin(wave * 3 + nz[i]) * 40;
      } else if (m === M.WALL || m === M.PWALL || m === M.GUIDE) {
        const up = i >= w ? t[i - w] : m;
        const e = up !== m ? 30 : 0;
        r += nn * 0.5 + e; g += nn * 0.5 + e; b += nn * 0.5 + e;
        if (m === M.GUIDE && ((i % w) + ((i / w) | 0)) % 4 < 2) { r += 25; g += 25; b += 35; }
      } else if (m === M.MOVER) {
        const up = i >= w ? t[i - w] : m;
        const e = up !== M.MOVER ? 50 : 0;
        r += e; g += e; b += e;
      } else if (m === M.FILTER) {
        const a = aux[i];
        const q = ((i % w) + Math.floor(i / w)) % 3 === 0 ? 1 : 0.35;
        r = CR[a] * q + 30; g = CG[a] * q + 30; b = CB[a] * q + 30;
      } else { r += nn; g += nn; b += nn; }
      if (m === M.LAVA) g += fsin(wave * 1.5 + nz[i]) * 25;
      const T = tp[i];
      if (k !== 5 && k !== 1) {
        if (T > 80) { const q = Math.min((T - 80) / 700, 1) * 0.55; r += (255 - r) * q; g *= 1 - q * 0.4; b *= 1 - q; }
        else if (T < 0) { const q = Math.min(-T / 40, 1) * 0.4; r *= 1 - q; b += (255 - b) * q; }
      }
      gl = GL[m];
      if (T > 500 && k !== 5) gl = Math.max(gl, Math.min(1, (T - 500) / 700));
      if (k === 5) { const p = 0.85 + fsin(wave * 2) * 0.15; r *= p; g *= p; b *= p; }
    }
    px[i] = 0xff000000 | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r);
    gpx[i] = gl > 0 ? ((clamp(255 * gl) << 24) | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r)) : 0;
  }
  if (s.hideEdge) {
    // 外周（見えない境界）は背景色で塗る
    const { w, h } = s, c = 0xff1a0f0c;
    for (let x = 0; x < w; x++) { px[x] = c; px[(h - 1) * w + x] = c; gpx[x] = 0; gpx[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { px[y * w] = c; px[y * w + w - 1] = c; gpx[y * w] = 0; gpx[y * w + w - 1] = 0; }
  }
}
