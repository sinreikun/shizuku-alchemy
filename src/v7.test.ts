import { describe, it, expect } from 'vitest';
import { M } from './sim';
import { Game, resizeLab } from './game';
import { SANDBOX, labLevel } from './levels';

const lab = () => { const g = new Game(labLevel(240, 150), true, 5); g.brush = 3; return g; };

describe('衝突は機構ツリーごと', () => {
  it('ガイドに当たったピストンだけが戻り、別のピストンは動き続ける', () => {
    const g = lab();
    const a = g.addPiston(50, 200, 50, 140)!; const pa = g.addPlate(50, 199, 70, 199, 4)!;
    const b = g.addPiston(250, 200, 250, 140)!; const pb = g.addPlate(250, 199, 270, 199, 4)!;
    expect(pa.parent).toBe(a.id); expect(pb.parent).toBe(b.id);
    for (let x = 40; x < 90; x++) for (let y = 180; y < 183; y++) g.sim.set(x, y, M.GUIDE);
    const dt = 1 / 60, exts: number[] = [];
    for (let k = 0; k < 120; k++) { g.mech.step(dt); exts.push(b.ext); }
    expect(g.mech.stalls).toBeGreaterThan(0);
    expect(a.ext).toBeLessThan(0.35);
    // b はぶつからないので単調に伸び続ける
    for (let k = 1; k < exts.length; k++) expect(exts[k]).toBeGreaterThan(exts[k - 1]);
    expect(b.ext).toBeCloseTo(120 * 0.25 / 60, 5);
  });
  it('同じ操作なら結果は同じ（決定的）', () => {
    const run = () => { const g = lab(); g.addPiston(50, 200, 50, 140); g.addPlate(50, 199, 70, 199, 4); for (let x = 40; x < 90; x++) g.sim.set(x, 180, M.GUIDE); g.addRotor(150, 100); g.addPlate(150, 100, 190, 100, 4); for (let k = 0; k < 200; k++) g.mech.step(1 / 60); return JSON.stringify(g.mech.serialize()); };
    expect(run()).toBe(run());
  });
});

describe('付け替え', () => {
  it('親を変えられ、関節設定は保たれ、循環は拒否、元に戻せる', () => {
    const g = lab();
    const r1 = g.addRotor(60, 100)!; const p = g.addPlate(60, 100, 100, 100, 4)!; const r2 = g.addRotor(160, 100)!;
    g.editNode(p.id, { joint: 'spring', k: 9 });
    g.mech.computePoses(); const before = { ...g.mech.pose(p.id)! };
    g.pushUndo();
    expect(g.reparent(p.id, r2.id)).toBe(true);
    expect(p.parent).toBe(r2.id); expect(p.joint).toBe('spring'); expect(p.k).toBe(9);
    g.mech.computePoses(); expect(g.mech.pose(p.id)!.x).toBeCloseTo(before.x); // 世界での位置は変わらない
    expect(g.reparent(r2.id, p.id)).toBe(false); // 循環
    expect(g.reparent(p.id, -1)).toBe(true); expect(p.parent).toBe(-1);
    g.undo();
    expect(g.mech.byId(p.id)!.parent).toBe(r1.id);
    expect(g.tree().find((t) => t.key === `n:${r1.id}`)!.children[0].key).toBe(`n:${p.id}`);
  });
});

describe('消しゴムの対象と範囲', () => {
  it('選んだ物質だけを矩形・投げ縄で消し、元に戻せる', () => {
    const g = lab();
    for (let y = 100; y < 140; y++) for (let x = 100; x < 160; x++) g.sim.set(x, y, (x + y) % 2 ? M.WATER : M.SAND);
    const w0 = g.sim.count(M.WATER), s0 = g.sim.count(M.SAND);
    g.setEraseFilter([M.WATER], {});
    g.pushUndo();
    g.eraseRegion([100, 100, 130, 100, 130, 140, 100, 140]);
    expect(g.sim.count(M.SAND)).toBe(s0);
    expect(g.sim.count(M.WATER)).toBe(w0 - 600);
    // 投げ縄（三角形）
    const w1 = g.sim.count(M.WATER);
    g.eraseRegion([130, 100, 160, 100, 160, 140]);
    expect(g.sim.count(M.WATER)).toBeLessThan(w1);
    expect(g.sim.count(M.WATER)).toBeGreaterThan(w1 - 600);
    g.undo();
    expect(g.sim.count(M.WATER)).toBe(w0);
  });
  it('配置物も種類ごとに対象を選べる', () => {
    const g = lab();
    const r = g.addRotor(50, 50)!; g.apply('heater', 80, 50);
    g.setEraseFilter(null, { rotor: false });
    g.eraseRegion([40, 40, 90, 40, 90, 60, 40, 60]);
    expect(g.mech.byId(r.id)).toBeTruthy();
    expect(g.devices.length).toBe(0);
    expect(g.sim.count(M.HEATER)).toBe(0);
  });
});

describe('自由実験室の大きさ', () => {
  it('大きくしても中身を保ち、アンカーに合わせて写す', () => {
    const g = lab();
    for (let y = 280; y < 290; y++) for (let x = 10; x < 30; x++) g.sim.set(x, y, M.MERCURY);
    const r = g.addRotor(100, 100)!;
    const hg = g.sim.count(M.MERCURY);
    const n = resizeLab(g, labLevel(320, 200), 0.5, 1);
    expect(n.sim.w).toBe(640); expect(n.sim.h).toBe(400);
    expect(n.sim.count(M.MERCURY)).toBe(hg);
    expect(n.sim.get(10 + 80, 280 + 100)).toBe(M.MERCURY);
    expect(n.mech.byId(r.id)!.ox).toBeCloseTo(100.5 + 80);
    expect(n.mech.byId(r.id)!.name).toBe('回転モーター#1');
  });
  it('小さくするとはみ出た物は切り取られ、上限・下限で止まる', () => {
    const g = lab();
    g.addRotor(400, 250);
    const n = resizeLab(g, labLevel(100, 60), 0, 0);
    expect(n.mech.nodes.length).toBe(0);
    expect(n.sim.w).toBe(200);
    const big = labLevel(9999, 1); expect([big.w, big.h]).toEqual([400, 50]);
    void SANDBOX;
  });
});
