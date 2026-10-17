import { describe, it, expect } from 'vitest';
import { M } from './sim';
import { Game, type Tool } from './game';
import { labLevel } from './levels';

/** 壁で囲んだ300℃の蒸気だまりの中央に装置を置き、1500ティック後の凝縮率と平均温度を返す */
const pool = (dev: Tool | null, power?: number) => {
  const g = new Game(labLevel(240, 150), true, 5); const s = g.sim;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.t[y * s.w + x] !== M.WALL) s.set(x, y, M.EMPTY);
  for (let y = 100; y <= 180; y++) for (let x = 200; x <= 280; x++) { const e = x === 200 || x === 280 || y === 100 || y === 180; s.set(x, y, e ? M.WALL : M.STEAM); if (!e) s.temp[y * s.w + x] = 300; }
  if (dev) { g.apply(dev, 240, 140); if (power !== undefined) g.setDevicePower(g.devices[0].uid!, power); }
  g.start(); const n0 = s.count(M.STEAM);
  for (let t = 0; t < 1500; t++) s.step();
  let sum = 0, c = 0; for (let i = 0; i < s.n; i++) if (s.t[i] === M.STEAM) { sum += s.temp[i]; c++; }
  return { cond: (n0 - c) / n0, avg: sum / c };
};

describe('装置と気体の熱交換', () => {
  it('蒸気だまりのクーラーは自然冷却よりはっきり速く凝縮させ、設定温度が低いほど強い', () => {
    const none = pool(null), c15 = pool('cooler', 15), c60 = pool('cooler'), c95 = pool('cooler', -95);
    expect(none.cond).toBe(0);
    expect(c60.cond).toBeGreaterThan(0.15);           // v0.8.0 では 0%
    expect(c15.cond).toBeGreaterThan(0.02);
    expect(c95.cond).toBeGreaterThan(c60.cond * 1.15);
    expect(c60.cond).toBeGreaterThan(c15.cond * 2);
  });
  it('ヒーターは蒸気を温め、出力が高いほど熱い', () => {
    const none = pool(null), h = pool('heater'), hh = pool('heater', 1175);
    expect(h.avg).toBeGreaterThan(none.avg + 2);
    expect(hh.avg).toBeGreaterThan(h.avg + 2);
    expect(h.cond).toBe(0);
  });
  it('同じ条件なら結果は同じ（決定的）', () => { expect(pool('cooler')).toEqual(pool('cooler')); });
});
