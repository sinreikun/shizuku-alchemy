import { describe, it, expect } from 'vitest';
import { M, MATS, RECIPES, PROCESS_MODES } from './sim';
import { Game } from './game';
import { LEVELS, labLevel } from './levels';

const lab = () => new Game(labLevel(240, 150), true, 5);
// 複合物をもとの物質の数で数える
const weight = (m: number) => (m === M.BRINE || m === M.COMPOSITE || m === M.LOADED ? 2 : 1);

describe('反応表', () => {
  it('どの循環装置も既定の比でセル数（複合物は2つ分）が釣り合う', () => {
    for (const mode of PROCESS_MODES) {
      const ps = RECIPES[mode].ports; let bal = 0;
      for (const r of ps) if (r) bal += (r.role === 'in' ? 1 : -1) * r.n * weight(r.mat) - (r.role === 'in' && r.leave ? r.n * weight(r.leave) : 0);
      expect([mode, bal]).toEqual([mode, 0]);
    }
    expect(RECIPES.electrolysis.ports.map((r) => r && [r.mat, r.n])).toEqual([[M.WATER, 2], [M.HYDROGEN, 1], [M.OXYGEN, 1]]);
  });
  it('結晶反応器：晶塩1＋活性剤1 → 複合結晶1', () => {
    const g = lab(); g.apply('proc:crystallization', 200, 150);
    const p = g.sim.processors[0];
    for (let y = p.y - 3; y <= p.y + 3; y++) for (let x = p.x - 8; x < p.x - 3; x++) g.sim.set(x, y, M.SALT);
    for (let y = p.y + 4; y < p.y + 12; y++) for (let x = p.x - 3; x <= p.x + 3; x++) g.sim.set(x, y, M.ACTIVATOR);
    for (let k = 0; k < 3; k++) g.tick();
    expect(g.sim.stats.synthesized).toBeGreaterThan(0);
    void MATS;
  });
});

describe('ポートごとの量', () => {
  it('自由実験室で量を変えると1回の出入りが変わり、元に戻せる', () => {
    const g = lab(); g.apply('proc:electrolysis', 200, 150);
    const p = g.sim.processors[0];
    g.pushUndo();
    expect(g.setPortAmount(p.uid!, 1, 3)).toBe(true);
    expect(g.setPortAmount(p.uid!, 0, 99)).toBe(true); expect(p.amt![0]).toBe(9);
    for (let y = p.y - 3; y <= p.y + 3; y++) for (let x = p.x - 12; x < p.x - 3; x++) g.sim.set(x, y, M.WATER);
    const w0 = g.sim.count(M.WATER);
    g.start(); g.sim.step();
    const split = g.sim.stats.split;
    expect(split).toBeGreaterThan(0);
    expect(w0 - g.sim.count(M.WATER)).toBe(9 * split);
    expect(g.sim.count(M.HYDROGEN)).toBe(3 * split);
    g.undo(); expect(g.sim.processors[0].amt).toBeUndefined();
    expect(g.setPortAmount(p.uid!, 1, 1)).toBe(true); // 既定と同じ値は「未調整」
  });
  it('ステージでは固定（既定値のまま）', () => {
    const lv = LEVELS.find((l) => l.id === 'p1')!; const g = new Game(lv, false, 1); lv.solve!(g);
    const p = g.sim.processors[0];
    expect(g.setPortAmount(p.uid!, 1, 5)).toBe(false); expect(g.setProcRate(p.uid!, 4)).toBe(false);
    expect(p.amt).toBeUndefined();
  });
});

describe('装置の出力', () => {
  it('ヒーターの設定温度を変えると周りの温度が変わる（保存・元に戻す）', () => {
    const run = (temp?: number) => {
      const g = lab(); g.apply('heater', 200, 150);
      const d = g.devices[0];
      if (temp !== undefined) expect(g.setDevicePower(d.uid!, temp)).toBe(true);
      for (let k = 0; k < 120; k++) g.sim.step();
      return { g, t: g.sim.temp[150 * g.sim.w + 200], near: g.sim.temp[150 * g.sim.w + 206] };
    };
    const hot = run(), warm = run(150);
    expect(hot.t).toBe(600); expect(warm.t).toBe(150);
    expect(warm.near).toBeLessThan(hot.near);
    const g = warm.g; g.pushUndo(); g.setDevicePower(g.devices[0].uid!, 1175); expect(g.devices[0].power).toBe(1175); g.undo(); expect(g.devices[0].power).toBe(150);
  });
  it('クーラー・着火器・電解板・ポンプも調整でき、範囲で止まる。ステージでは固定', () => {
    const g = lab(); g.apply('cooler', 100, 100); g.apply('igniter', 140, 100); g.apply('electro', 180, 100);
    expect(g.setDevicePower(g.devices[0].uid!, -500)).toBe(true); expect(g.devices[0].power).toBe(-95);
    expect(g.setDevicePower(g.devices[1].uid!, 100)).toBe(true); expect(g.devices[1].power).toBe(300);
    expect(g.setDevicePower(g.devices[2].uid!, 55)).toBe(true); expect(g.devices[2].power).toBe(55);
    g.apply('pump', 20, 200); g.apply('pump', 60, 200);
    const pu = g.sim.pumps[0]; expect(g.setPump(pu.uid!, 99, 0)).toBe(true); expect([pu.rate, pu.r]).toEqual([40, 1]);
    const lv = LEVELS.find((l) => l.id === 'l2')!; const s = new Game(lv, false, 1); lv.solve!(s);
    expect(s.setDevicePower(s.devices[0].uid!, 1000)).toBe(false);
  });
});
