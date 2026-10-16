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

describe('消滅穴', () => {
  it('置くと番号付きでツリーに並び、入った流体を消し、動かせて、消しゴムで消せる', () => {
    const g = lab();
    const v = g.addVoid(100, 150, 140, 160)!;
    const v2 = g.addVoid(200, 150, 201, 151)!;
    expect([v.name, v2.name]).toEqual(['消滅穴#1', '消滅穴#2']);
    expect(v2.w).toBe(2 * g.S);
    expect(g.tree().filter((t) => t.kind === 'void').map((t) => t.key)).toEqual([`v:${v.uid}`, `v:${v2.uid}`]);
    expect(g.pickObject(120, 155)).toBe(`v:${v.uid}`);
    for (let y = 100; y < 140; y++) for (let x = 105; x < 135; x++) g.sim.set(x, y, M.WATER);
    const w0 = g.sim.count(M.WATER);
    for (let k = 0; k < 300; k++) g.tick();
    expect(g.sim.count(M.WATER)).toBeLessThan(w0 * 0.5);
    g.pushUndo();
    expect(g.moveObject(`v:${v.uid}`, 10, -5)).toBe(true);
    expect([v.x, v.y]).toEqual([110, 145]);
    g.undo(); expect(g.voids.find((q) => q.uid === v.uid)!.x).toBe(100);
    g.setEraseFilter(null, { void: false });
    g.eraseRegion([90, 140, 150, 140, 150, 170, 90, 170]); expect(g.voids.length).toBe(2);
    g.setEraseFilter(null, {});
    g.eraseRegion([90, 140, 150, 140, 150, 170, 90, 170]); expect(g.voids.length).toBe(1);
    const c = g.addVoid(10, 10, 20, 20)!; expect(c.name).toBe('消滅穴#3');
    const n = resizeLab(g, labLevel(200, 120), 0, 0); expect(n.voids.length).toBe(2);
  });
  it('ステージでは置けない', () => { const s = new Game(LEVELS[0], false, 1); expect(s.addVoid(10, 10, 20, 20)).toBeNull(); });
});
