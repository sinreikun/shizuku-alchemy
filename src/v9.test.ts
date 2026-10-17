import { describe, it, expect } from 'vitest';
import { M } from './sim';
import { Game } from './game';
import { LEVELS, labLevel } from './levels';

const lab = () => { const g = new Game(labLevel(240, 150), true, 5); return g; };

describe('直線・矩形と筆の太さ', () => {
  it('壁の直線は筆の太さの帯になり、ステージではインクをセル数だけ使う', () => {
    const lv = LEVELS.find((l) => l.id === 'l1')!; const g = new Game(lv, false, 1);
    const ink0 = g.inv.ink, pw0 = g.sim.count(M.PWALL);
    g.brush = 5; g.stroke('wall', 60, 60, 120, 60);
    const used = ink0 - g.inv.ink, cells = g.sim.count(M.PWALL) - pw0;
    expect(used).toBe(cells); expect(cells).toBe(6 * 66); // 6 セル幅 × (長さ+太さ-1)
    expect(g.cost()).toBe(used);
    const thin = new Game(lv, false, 1); thin.brush = 0; thin.stroke('wall', 60, 60, 120, 60);
    expect(thin.invBase.ink - thin.inv.ink).toBe(61);
  });
  it('選択膜・ガイド・岩盤・物質も筆の太さに従う', () => {
    for (const [tool, m] of [['filter', M.FILTER], ['guide', M.GUIDE], [`mat:${M.WALL}`, M.WALL], [`mat:${M.GLASS}`, M.GLASS]] as const) {
      const g = lab(); const c0 = g.sim.count(m);
      g.brush = 1; g.stroke(tool as never, 100, 100, 160, 100); const a = g.sim.count(m) - c0;
      const h = lab(); h.brush = 7; h.stroke(tool as never, 100, 100, 160, 100); const b = h.sim.count(m) - c0;
      expect(b).toBeGreaterThan(a * 2.5);
    }
  });
  it('矩形は隙間なく塗りつぶす（壁）', () => {
    const g = lab(); g.brush = 3; const c0 = g.sim.count(M.PWALL);
    g.fillRect('wall', 100, 100, 139, 119);
    expect(g.sim.count(M.PWALL) - c0).toBeGreaterThanOrEqual(40 * 20);
    for (let y = 100; y < 120; y++) for (let x = 100; x < 140; x++) expect(g.sim.get(x, y)).toBe(M.PWALL);
  });
  it('可動板の太さ（配置時に指定）でセル数＝費用が決まる', () => {
    const lv = LEVELS.find((l) => l.id === 'm1')!;
    const a = new Game(lv, false, 1); a.addPiston(62, 194, 62, 120); const pa = a.addPlate(42, 190, 60, 190, 2)!;
    const b = new Game(lv, false, 1); b.addPiston(62, 194, 62, 120); const pb = b.addPlate(42, 190, 60, 190, 6)!;
    expect(pa && pb).toBeTruthy();
    expect(b.cost() - b.invBase.piston * 0).toBeGreaterThan(a.cost());
  });
});

describe('ポートの距離制限なし', () => {
  it('盤面の遠くまで動かせ、壁・装置の上や盤面外は不可、元に戻せる', () => {
    const g = lab(); g.apply('proc:electrolysis', 60, 60);
    const p = g.sim.processors[0];
    g.pushUndo();
    expect(g.setPort(p.uid!, 'out', 300, 200)).toBe(true);
    expect(p.ports![2]).toBe(300);
    expect(g.setPort(p.uid!, 'in', 1000, 0)).toBe(false);
    expect(g.setPort(p.uid!, 'in', 1 - p.x, 1 - p.y)).toBe(false); // 外枠の岩盤
    g.undo(); expect(g.sim.processors[0].ports).toBeUndefined();
  });
});
