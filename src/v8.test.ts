import { describe, it, expect } from 'vitest';
import { M } from './sim';
import { Game, resizeLab } from './game';
import { LEVELS, labLevel } from './levels';

const lab = () => { const g = new Game(labLevel(160, 100), true, 5); g.brush = 3; return g; };

describe('自由実験室の外枠', () => {
  it('最初からある岩盤を消せる。外周1セルは見えない境界として残り、流体は消えずに止まる', () => {
    const g = lab(); const { w, h } = g.sim;
    expect(g.sim.get(2, h - 3)).toBe(M.WALL);
    g.eraseRegion([0, h - 20, 60, h - 20, 60, h, 0, h]);
    expect(g.sim.get(2, h - 3)).toBe(M.EMPTY);
    expect(g.sim.get(0, h - 1)).toBe(M.WALL); expect(g.sim.get(5, h - 1)).toBe(M.WALL);
    expect(g.sim.hideEdge).toBe(true);
    // 左の壁も一部消して、水を流し込む
    g.eraseRegion([0, 20, 10, 20, 10, 80, 0, 80]);
    for (let y = 30; y < 60; y++) for (let x = 2; x < 40; x++) g.sim.set(x, y, M.WATER);
    const water = g.sim.count(M.WATER);
    for (let k = 0; k < 400; k++) g.tick();
    expect(g.sim.count(M.WATER)).toBe(water);
    for (let i = 0; i < g.sim.n; i++) { const x = i % w, y = (i / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) expect(g.sim.t[i]).toBe(M.WALL); }
  });
  it('同じ操作なら同じ結果（決定的）', () => {
    const run = () => { const g = lab(); const h = g.sim.h; g.eraseRegion([0, h - 20, 60, h - 20, 60, h, 0, h]); for (let y = 100; y < 150; y++) for (let x = 5; x < 50; x++) g.sim.set(x, y, M.SAND); for (let k = 0; k < 200; k++) g.tick(); return Array.from(g.sim.t).join(''); };
    expect(run()).toBe(run());
  });
  it('消しゴムの対象から岩盤を外せば消えない／ステージの岩盤は消せない', () => {
    const g = lab(); const h = g.sim.h;
    g.setEraseFilter([M.WATER], {});
    g.eraseRegion([0, h - 20, 60, h - 20, 60, h, 0, h]);
    expect(g.sim.get(2, h - 3)).toBe(M.WALL);
    const s = new Game(LEVELS[0], false, 1); const wall0 = s.sim.count(M.WALL);
    s.eraseRegion([0, 0, s.sim.w, 0, s.sim.w, s.sim.h, 0, s.sim.h]);
    expect(s.sim.count(M.WALL)).toBe(wall0);
    expect(s.sim.hideEdge).toBe(false);
  });
});

describe('消滅穴（セル）', () => {
  it('筆で塗れて、触れた流体・粉体を消す。消しゴムで消せる。ツリーには出ない', () => {
    const g = lab();
    g.brush = 3; g.stroke(`mat:${M.VOID}` as never, 100, 160, 160, 160);
    const vc = g.sim.count(M.VOID); expect(vc).toBeGreaterThan(60 * 4);
    expect(g.tree().length).toBe(0);
    for (let y = 100; y < 140; y++) for (let x = 105; x < 155; x++) g.sim.set(x, y, M.WATER);
    for (let y = 90; y < 100; y++) for (let x = 105; x < 155; x++) g.sim.set(x, y, M.SAND);
    const w0 = g.sim.count(M.WATER);
    for (let k = 0; k < 300; k++) g.tick();
    expect(g.sim.count(M.WATER)).toBeLessThan(w0 * 0.5);
    expect(g.sim.count(M.SAND)).toBeLessThan(500);
    expect(g.sim.count(M.VOID)).toBe(vc);
    g.setEraseFilter([M.VOID], {});
    g.eraseRegion([90, 150, 170, 150, 170, 170, 90, 170]);
    expect(g.sim.count(M.VOID)).toBe(0);
  });
  it('旧版の消滅穴（矩形の物）はセルに変換される', () => {
    const g = lab(); g.importVoids([{ x: 50, y: 50, w: 10, h: 4 }]);
    expect(g.sim.count(M.VOID)).toBe(40);
    for (let y = 30; y < 50; y++) for (let x = 50; x < 60; x++) g.sim.set(x, y, M.WATER);
    for (let k = 0; k < 200; k++) g.tick();
    expect(g.sim.count(M.WATER)).toBeLessThan(100);
  });
  it('ステージには消滅穴セルがなく、赤い穴は今まで通り（矩形の排水）', () => {
    const s = new Game(LEVELS[0], false, 1); expect(s.sim.count(M.VOID)).toBe(0); expect(s.drains.length).toBeGreaterThan(0);
    void resizeLab;
  });
});
