import { describe, it, expect } from 'vitest';
import { M } from './sim';
import { Game, type TreeItem } from './game';
import { LEVELS, SANDBOX } from './levels';

const lab = () => { const g = new Game(SANDBOX, true, 5); g.brush = 3; return g; };
const flat = (t: TreeItem[]): TreeItem[] => t.flatMap((i) => [i, ...flat(i.children)]);

describe('配置物の名前とツリー', () => {
  it('名前は種類ごとの通し番号で、消しても再利用しない', () => {
    const g = lab();
    const a = g.addPiston(50, 200, 50, 160)!, b = g.addPiston(100, 200, 100, 160)!;
    expect([a.name, b.name]).toEqual(['ピストン#1', 'ピストン#2']);
    g.removeNode(a.id);
    const c = g.addPiston(150, 200, 150, 160)!;
    expect(c.name).toBe('ピストン#3');
    g.apply('heater', 300, 100); g.apply('heater', 340, 100); g.apply('proc:electrolysis', 380, 100);
    const names = flat(g.tree()).filter((i) => i.kind !== 'port' && i.kind !== 'pumpEnd').map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('ヒーター#2');
    expect(names).toContain('電解槽#1');
  });
  it('元に戻しても番号は巻き戻らない', () => {
    const g = lab();
    g.pushUndo(); g.addRotor(100, 100); g.undo();
    expect(g.addRotor(100, 100)!.name).toBe('回転モーター#2');
  });
  it('ツリー：モーター＞腕＞関節の子、循環装置＞ポート、ポンプ＞口', () => {
    const g = lab();
    const r = g.addRotor(100, 100)!;
    const arm = g.addPlate(100, 100, 140, 100, 4)!;
    const tipPlate = g.addPlate(140, 100, 160, 120, 4)!;
    expect(arm.parent).toBe(r.id);
    g.mech.attach(tipPlate.id, arm.id); g.editNode(tipPlate.id, { joint: 'spring' });
    g.apply('proc:extraction', 300, 200);
    g.apply('pump', 20, 280); g.apply('pump', 60, 200);
    const t = g.tree();
    const root = t.find((i) => i.key === `n:${r.id}`)!;
    expect(root.children[0].key).toBe(`n:${arm.id}`);
    expect(root.children[0].children[0].key).toBe(`n:${tipPlate.id}`);
    expect(root.children[0].children[0].sub).toBe('ばね関節');
    const proc = t.find((i) => i.kind === 'proc')!;
    expect(proc.children.map((c) => c.name)).toEqual(['入口', '出口', '補助口']);
    expect(t.find((i) => i.kind === 'pump')!.children.length).toBe(2);
    expect(g.pickObject(100, 100)).toBe(`n:${r.id}`);
  });
});

describe('配置後の移動', () => {
  it('親を動かすと子もついていき、元に戻せる', () => {
    const g = lab();
    const r = g.addRotor(100, 100)!; const arm = g.addPlate(100, 100, 140, 100, 4)!;
    const before = { ...g.mech.pose(arm.id)! };
    g.pushUndo();
    expect(g.moveObject(`n:${r.id}`, 20, -10)).toBe(true);
    g.mech.computePoses();
    expect(g.mech.pose(arm.id)!.x).toBeCloseTo(before.x + 20);
    expect(g.mech.pose(arm.id)!.y).toBeCloseTo(before.y - 10);
    g.undo(); g.mech.computePoses();
    expect(g.mech.pose(arm.id)!.x).toBeCloseTo(before.x);
  });
  it('流体を消さずに押しのけ、費用は増えない（ステージ）', () => {
    const g = lab();
    for (let y = 150; y < 200; y++) for (let x = 40; x < 200; x++) g.sim.set(x, y, M.WATER);
    for (let x = 30; x < 210; x++) g.sim.set(x, 201, M.WALL);
    const p = g.addPlate(60, 120, 100, 120, 4)!;
    const water = g.sim.count(M.WATER);
    for (let k = 0; k < 40; k++) g.moveObject(`n:${p.id}`, 0, 1);
    expect(g.mech.pose(p.id)!.y).toBeGreaterThan(150);
    expect(g.sim.count(M.WATER) + g.mech.lost).toBe(water);
    expect(g.mech.lost).toBe(0);
    // ステージでは移動で費用が変わらない
    const lv = LEVELS.find((l) => l.id === 'm1')!; const s = new Game(lv, false, 1); lv.solve!(s);
    const c0 = s.cost(); const id = s.mech.nodes[0].id;
    s.moveObject(`n:${id}`, 2, 0); expect(s.cost()).toBe(c0);
  });
  it('壁にめり込む移動は拒否する', () => {
    const g = lab();
    for (let y = 50; y < 150; y++) for (let x = 200; x < 210; x++) g.sim.set(x, y, M.WALL);
    const p = g.addPlate(150, 100, 180, 100, 4)!;
    expect(g.moveObject(`n:${p.id}`, 25, 0)).toBe(false);
    expect(g.mech.byId(p.id)!.ox).toBeCloseTo(150.5);
  });
  it('装置を動かすと、どいた流体は空いた場所へ移る', () => {
    const g = lab();
    g.apply('heater', 100, 100);
    for (let y = 95; y < 105; y++) for (let x = 104; x < 112; x++) g.sim.set(x, y, M.WATER);
    const water = g.sim.count(M.WATER), heat = g.sim.count(M.HEATER);
    const key = g.tree().find((i) => i.kind === 'heater')!.key;
    expect(g.moveObject(key, 3, 0)).toBe(true);
    expect(g.sim.count(M.WATER)).toBe(water);
    expect(g.sim.count(M.HEATER)).toBe(heat);
    expect(g.devices[0].x).toBe(103);
  });
});

describe('ピストンのストロークとポート', () => {
  it('配置後にストロークを変えられ、ステージの上限で止まる', () => {
    const lv = LEVELS.find((l) => l.id === 'm3')!; const g = new Game(lv, false, 1);
    const p = g.lpiston(40, 90, 40, 80)!;
    g.editNode(p.id, { amp: 999 });
    expect(p.amp).toBe(lv.maxAmp! * g.S);
    g.editNode(p.id, { amp: 20 }); expect(p.amp).toBe(20);
    p.ext = 1; g.mech.computePoses();
    expect(g.mech.tip(p).y).toBeCloseTo(90 * g.S + 0.5 - 20);
  });
  it('ポートを動かすと、そこから出し入れする', () => {
    const g = lab();
    g.apply('proc:electrolysis', 200, 150);
    const p = g.sim.processors[0];
    const key = `port:${p.uid}:out`;
    expect(g.moveObject(key, 0, -14)).toBe(true);
    const cells = g.sim.portCells(p, 'out');
    const cy = cells.reduce((a, i) => a + Math.floor(i / g.sim.w), 0) / cells.length;
    expect(cy).toBeLessThan(p.y - 5);
    // 装置に重なる位置や遠すぎる位置には置けない
    g.setPort(p.uid!, 'in', 0, 0);
    const [dx, dy] = [p.ports![0], p.ports![1]];
    expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeGreaterThan(p.size / 2);
    expect(g.setPort(p.uid!, 'aux', 9999, 0)).toBe(false); // 盤面の外
    expect(g.setPort(p.uid!, 'aux', 200, 100)).toBe(true); expect(p.ports![4]).toBe(200); // 遠くても置ける
    // 実際に出口の新しい位置から水素が出る
    g.setPort(p.uid!, 'in', -10, 0);
    for (let y = p.y - 4; y <= p.y + 4; y++) for (let x = p.x - 12; x < p.x - 4; x++) g.sim.set(x, y, M.WATER);
    g.start(); for (let k = 0; k < 6; k++) g.tick();
    expect(g.sim.stats.split).toBeGreaterThan(0);
    expect(g.resetPorts(p.uid!)).toBe(true);
    expect(p.ports).toBeUndefined();
  });
});
