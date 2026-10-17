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
    s.wakeAll();
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
    s.wakeAll();
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

  it('ピストンの可動板は水を消さずに持ち上げる', () => {
    const g = new Game({ ...SANDBOX, w: 40, h: 50, build: (p) => { for (let x = 0; x < 40; x++) { p.set(x, 0, M.WALL); p.set(x, 49, M.WALL); } for (let y = 0; y < 50; y++) { p.set(0, y, M.WALL); p.set(39, y, M.WALL); p.set(10, y, M.WALL); p.set(29, y, M.WALL); } } }, true);
    for (let y = 70; y < 96; y++) for (let x = 22; x < 58; x++) g.sim.set(x, y, M.WATER);
    const water0 = g.sim.count(M.WATER);
    g.addPiston(40, 97, 40, 40); g.addPlate(21, 95, 58, 95);
    expect(g.mech.nodes[1].parent).toBe(g.mech.nodes[0].id);
    for (let i = 0; i < 120; i++) g.tick();
    let top = 999; for (let i = 0; i < g.sim.n; i++) if (g.sim.t[i] === M.WATER) top = Math.min(top, (i / g.sim.w) | 0);
    expect(top).toBeLessThan(60);
    expect(g.sim.count(M.WATER)).toBeGreaterThan(water0 * 0.97);
  });
  it('ガイドに当たると固定関節は止まり、ばね関節は曲がって通り抜ける', () => {
    const mk = (joint: 'fixed' | 'spring') => {
      const g = new Game({ ...SANDBOX, w: 60, h: 60, build: () => {} }, true);
      for (let y = 57; y < 62; y++) for (let x = 25; x < 28; x++) g.sim.set(x, y, M.GUIDE);
      const r = g.addRotor(60, 60)!; g.addPlate(60, 60, 80, 60); const b = g.addPlate(79, 60, 96, 60)!;
      g.editNode(b.id, { joint }); g.editNode(r.id, { dir: 1 });
      for (let i = 0; i < 600; i++) g.tick();
      return { angle: r.angle, stalls: g.mech.stalls };
    };
    const f = mk('fixed'), s = mk('spring');
    expect(f.stalls).toBeGreaterThan(0);
    expect(Math.abs(s.angle)).toBeGreaterThan(Math.abs(f.angle) + 1);
  });
  it('結晶反応器：晶塩＋活性剤 → 複合結晶', () => {
    const s = box();
    for (let y = 18; y < 24; y++) for (let x = 17; x < 23; x++) s.set(x, y, M.PROCESSOR);
    s.processors.push({ x: 20, y: 21, size: 6, mode: 'crystallization', rate: 1, count: 0, status: '' });
    for (let y = 18; y < 24; y++) s.set(16, y, M.SALT);
    for (let y = 24; y < 39; y++) for (let x = 17; x < 23; x++) s.set(x, y, M.ACTIVATOR);
    for (let y = 18; y < 39; y++) for (let x = 1; x < 16; x++) s.set(x, y, M.WALL);
    run(s, 50);
    expect(s.stats.synthesized).toBeGreaterThanOrEqual(3);
    expect(s.count(M.COMPOSITE)).toBe(s.stats.synthesized);
  });
  it('抽出器と回収器：塩水 → 晶塩、抽出液は戻る', () => {
    const s = box();
    s.processors.push({ x: 20, y: 10, size: 6, mode: 'extraction', rate: 1, count: 0, status: '' });
    for (let k = 0; k < 4; k++) s.set(16, 9 + k, M.BRINE);
    for (let k = 0; k < 4; k++) s.set(19 + k, 14, M.EXTRACT);
    for (const p of s.processors) for (let y = p.y - 3; y < p.y + 3; y++) for (let x = p.x - 3; x < p.x + 3; x++) s.set(x, y, M.PROCESSOR);
    run(s, 3);
    expect(s.stats.extracted).toBeGreaterThan(0);
    expect(s.count(M.LOADED)).toBeGreaterThan(0);
    const t = box();
    t.processors.push({ x: 20, y: 10, size: 6, mode: 'recovery', rate: 1, count: 0, status: '' });
    for (const p of t.processors) for (let y = p.y - 3; y < p.y + 3; y++) for (let x = p.x - 3; x < p.x + 3; x++) t.set(x, y, M.PROCESSOR);
    t.set(16, 10, M.LOADED); t.step();
    expect(t.stats.recovered).toBe(1);
    expect(t.count(M.SALT)).toBe(1); expect(t.count(M.EXTRACT)).toBe(1);
  });
  it('静止した領域のチャンクは休眠し、触れると起きる', () => {
    const s = new Sim(128, 64, 3);
    for (let x = 0; x < 128; x++) { s.set(x, 63, M.WALL); }
    for (let y = 50; y < 63; y++) for (let x = 0; x < 128; x++) s.set(x, y, M.SAND);
    run(s, 300);
    s.step();
    expect(s.active.filter((v) => v > 0).length).toBe(0);
    s.set(64, 10, M.WATER);
    expect(s.active.some((v) => v > 0)).toBe(true);
    run(s, 80);
    expect(s.get(64, 10)).toBe(M.EMPTY);
  });
});
