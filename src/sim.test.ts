import { describe, it, expect } from 'vitest';
import { Sim, M } from './sim';
import { Game } from './game';
import { SANDBOX } from './levels';

function box(w = 40, h = 40) {
  const s = new Sim(w, h, 3);
  for (let x = 0; x < w; x++) { s.set(x, 0, M.WALL); s.set(x, h - 1, M.WALL); }
  for (let y = 0; y < h; y++) { s.set(0, y, M.WALL); s.set(w - 1, y, M.WALL); }
  return s;
}
const run = (s: Sim, n: number) => { for (let i = 0; i < n; i++) s.step(); };
const avgY = (s: Sim, m: number) => { let a = 0, c = 0; for (let i = 0; i < s.n; i++) if (s.t[i] === m) { a += Math.floor(i / s.w); c++; } return a / c; };

describe('エンジン', () => {
  it('移動だけでは液体のセル数が保存される', () => {
    const s = box();
    for (let y = 5; y < 15; y++) for (let x = 5; x < 30; x++) s.set(x, y, M.WATER);
    const before = s.count(M.WATER);
    run(s, 200);
    expect(s.count(M.WATER)).toBe(before);
  });
  it('比重で分離する：水銀は沈み、油は浮く', () => {
    const s = box();
    for (let y = 5; y < 30; y++) for (let x = 5; x < 35; x++) s.set(x, y, [M.OIL, M.WATER, M.MERCURY][(x + y) % 3]);
    run(s, 600);
    expect(avgY(s, M.MERCURY)).toBeGreaterThan(avgY(s, M.WATER));
    expect(avgY(s, M.WATER)).toBeGreaterThan(avgY(s, M.OIL));
  });
  it('気体は昇る', () => {
    const s = box();
    for (let x = 5; x < 35; x++) s.set(x, 35, M.HYDROGEN);
    run(s, 200);
    expect(avgY(s, M.HYDROGEN)).toBeLessThan(10);
  });
  it('ヒーターで水が沸騰して蒸気になる', () => {
    const s = box();
    for (let x = 18; x < 21; x++) for (let y = 35; y < 38; y++) s.set(x, y, M.HEATER);
    for (let y = 25; y < 35; y++) for (let x = 10; x < 30; x++) s.set(x, y, M.WATER);
    run(s, 800);
    expect(s.count(M.STEAM)).toBeGreaterThan(0);
  });
  it('クーラーで水が凍る', () => {
    const s = box();
    for (let x = 18; x < 21; x++) for (let y = 35; y < 38; y++) s.set(x, y, M.COOLER);
    for (let y = 30; y < 35; y++) for (let x = 10; x < 30; x++) s.set(x, y, M.WATER);
    run(s, 600);
    expect(s.count(M.ICE)).toBeGreaterThan(0);
  });
  it('晶塩は水に溶けて塩水になり、加熱すると晶塩が戻る', () => {
    const s = box();
    for (let y = 20; y < 38; y++) for (let x = 5; x < 35; x++) s.set(x, y, M.WATER);
    for (let x = 10; x < 30; x++) s.set(x, 10, M.SALT);
    run(s, 400);
    expect(s.count(M.BRINE)).toBeGreaterThan(10);
    expect(s.stats.dissolved).toBeGreaterThan(10);
    for (let i = 0; i < s.n; i++) if (s.t[i] === M.BRINE) s.temp[i] = 150;
    run(s, 5);
    expect(s.stats.crystallized).toBeGreaterThan(0);
  });
  it('水素は酸素と高温で燃え、蒸気になる', () => {
    const s = box();
    for (let y = 10; y < 20; y++) for (let x = 5; x < 35; x++) s.set(x, y, (x + y) % 2 ? M.HYDROGEN : M.OXYGEN);
    for (let x = 18; x < 21; x++) for (let y = 2; y < 5; y++) s.set(x, y, M.IGNITER);
    run(s, 300);
    expect(s.stats.burned).toBeGreaterThan(20);
    expect(s.count(M.STEAM) + s.count(M.WATER)).toBeGreaterThan(0);
  });
  it('酸素がなければ油は燃えない（煤になる）', () => {
    const s = box();
    for (let y = 30; y < 38; y++) for (let x = 5; x < 35; x++) s.set(x, y, M.OIL);
    for (let i = 0; i < s.n; i++) if (s.t[i] === M.OIL) s.temp[i] = 320;
    run(s, 3);
    expect(s.stats.burned).toBe(0);
    expect(s.count(M.SOOT)).toBeGreaterThan(0);
  });
  it('溶岩は水で急冷されて岩石になる', () => {
    const s = box();
    for (let y = 30; y < 38; y++) for (let x = 5; x < 20; x++) s.set(x, y, M.LAVA);
    for (let y = 30; y < 38; y++) for (let x = 20; x < 35; x++) s.set(x, y, M.WATER);
    run(s, 300);
    expect(s.count(M.ROCK)).toBeGreaterThan(0);
  });
  it('電解槽は水を水素と酸素に分ける', () => {
    const s = box();
    for (let y = 25; y < 38; y++) for (let x = 5; x < 35; x++) s.set(x, y, M.WATER);
    for (let x = 18; x < 21; x++) for (let y = 34; y < 37; y++) s.set(x, y, M.ELECTRO);
    run(s, 300);
    expect(s.count(M.HYDROGEN)).toBeGreaterThan(5);
    expect(s.count(M.OXYGEN)).toBeGreaterThan(5);
  });
  it('選択膜は指定物質だけを通す', () => {
    const s = box();
    for (let x = 1; x < 39; x++) s.set(x, 20, M.FILTER, M.WATER);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 35; x++) s.set(x, y, (x % 2) ? M.WATER : M.OIL);
    run(s, 600);
    let waterBelow = 0, oilBelow = 0;
    for (let y = 21; y < 39; y++) for (let x = 1; x < 39; x++) { const m = s.get(x, y); if (m === M.WATER) waterBelow++; if (m === M.OIL) oilBelow++; }
    expect(waterBelow).toBeGreaterThan(100);
    expect(oilBelow).toBe(0);
  });
  it('ポンプは壁を越えて流体を運ぶ', () => {
    const s = box();
    for (let y = 1; y < 39; y++) s.set(20, y, M.WALL);
    for (let y = 28; y < 38; y++) for (let x = 2; x < 19; x++) s.set(x, y, M.WATER);
    s.pumps.push({ ax: 10, ay: 35, bx: 30, by: 10, rate: 3, moved: 0 });
    run(s, 200);
    let right = 0; for (let y = 1; y < 39; y++) for (let x = 21; x < 39; x++) if (s.get(x, y) === M.WATER) right++;
    expect(right).toBeGreaterThan(100);
  });
  it('Undo / Redo', () => {
    const g = new Game(SANDBOX, true);
    const before = g.sim.count(M.PWALL);
    g.pushUndo(); g.stroke('wall', 30, 30, 60, 30);
    expect(g.sim.count(M.PWALL)).toBeGreaterThan(before);
    g.undo(); expect(g.sim.count(M.PWALL)).toBe(before);
    g.redo(); expect(g.sim.count(M.PWALL)).toBeGreaterThan(before);
  });
  it('インクは有限で、消すと戻る', () => {
    const g = new Game({ ...SANDBOX, inv: { ink: 10 } });
    g.stroke('wall', 30, 30, 90, 30);
    expect(g.inv.ink).toBe(0);
    g.apply('erase', 30, 30);
    expect(g.inv.ink).toBeGreaterThan(0);
  });
});
