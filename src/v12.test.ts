import { describe, it, expect } from 'vitest';
import { M } from './sim';
import { LAB_LIMITS } from './levels';
import { SAMPLES, SAMPLE_CATS, buildSample, sampleScore, separationScore, resetSampleInPlace, SEP_LIQUIDS, installSample } from './samples';
import { serializeGame, parseSave, applySave } from './save';
import { Game } from './game';
import { labLevel } from './levels';

const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (v: number, i: number) => v === b[i]);
const run = (g: Game, n: number) => { g.start(); for (let k = 0; k < n; k++) g.tick(); };

describe('見本（v0.9）', () => {
  it('12〜16個あり、id は重複せず、どれも3分類のどれかで説明つき', () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(12);
    expect(SAMPLES.length).toBeLessThanOrEqual(16);
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(SAMPLES.length);
    for (const s of SAMPLES) {
      expect(SAMPLE_CATS.map((c) => c.id)).toContain(s.cat);
      expect(s.title.length).toBeGreaterThan(1); expect(s.desc.length).toBeGreaterThan(10);
      expect(s.w).toBeGreaterThanOrEqual(LAB_LIMITS.minW); expect(s.w).toBeLessThanOrEqual(LAB_LIMITS.maxW);
      expect(s.h).toBeGreaterThanOrEqual(LAB_LIMITS.minH); expect(s.h).toBeLessThanOrEqual(LAB_LIMITS.maxH);
    }
    for (const c of SAMPLE_CATS) expect(SAMPLES.filter((s) => s.cat === c.id).length).toBeGreaterThanOrEqual(3);
    expect(SAMPLES.filter((s) => s.challenge).length).toBeGreaterThanOrEqual(4);
  });

  it('すべて組み立て・v5 保存・読み込みができ、決定的で、短く動かしても壊れない', () => {
    for (const sm of SAMPLES) {
      const g = buildSample(sm.id), h = buildSample(sm.id);
      expect(g.sim.w).toBe(sm.w * g.S);
      expect(same(g.sim.t, h.sim.t)).toBe(true);
      const json = serializeGame(g); const d = parseSave(json);
      expect(d).toMatchObject({ app: 'shizuku-alchemy', v: 5, lw: sm.w, lh: sm.h, w: sm.w * g.S, h: sm.h * g.S });
      expect(d.sample.id).toBe(sm.id);
      const into = new Game(labLevel(sm.w, sm.h), true, 5);
      applySave(into, d);
      expect(into.sample?.id).toBe(sm.id);
      expect(same(into.sim.t.filter((m) => m !== M.MOVER), g.sim.t.filter((m) => m !== M.MOVER))).toBe(true);
      expect(into.sim.pumps.length).toBe(g.sim.pumps.length);
      expect(into.devices.length).toBe(g.devices.length);
      expect(into.mech.nodes.length).toBe(g.mech.nodes.length);
      run(into, 120);
      if (sm.challenge) { const v = sampleScore(into)!; expect(Number.isFinite(v.value)).toBe(true); expect(v.invalid).toBeUndefined(); }
      else expect(sampleScore(into)).toBeNull();
    }
  });

  it('同じ見本を同じ手順で動かすと全く同じ結果になる（決定性）', () => {
    const a = buildSample('goldberg'), b = buildSample('goldberg');
    run(a, 400); run(b, 400);
    expect(same(a.sim.t, b.sim.t)).toBe(true);
  });

  it('からくり装置は止まらずに動き、ポンプの水路網は水を運ぶ', () => {
    const g = buildSample('goldberg'); run(g, 1500);
    expect(g.mech.stalls).toBe(0);
    const p = buildSample('pumps'); run(p, 600);
    expect(p.sim.pumps.length).toBeGreaterThanOrEqual(3);
    expect(p.sim.pumps.every((q) => (q.moved ?? 0) > 0)).toBe(true);
  });

  it('分離度：混ざったままは低く、完全に別の器に分ければ100点', () => {
    const g = buildSample('sep7'); run(g, 60);
    const v = sampleScore(g)!; expect(v.value).toBeLessThan(15); expect(v.parts.length).toBe(7);
    // 合成：7つの器にそれぞれ1種類ずつ
    const t = new Game(labLevel(160, 60), true, 1); const s = t.sim;
    const init: Record<string, number> = {};
    SEP_LIQUIDS.forEach((m, k) => {
      const x0 = 4 + k * 20; let c = 0;
      for (let y = 20; y < 40; y++) for (let x = x0; x < x0 + 12; x++) { s.set(x, y, M.WALL); }
      for (let y = 20; y < 38; y++) for (let x = x0 + 2; x < x0 + 10; x++) { s.set(x, y, m); c++; }
      init['m' + m] = c;
    });
    expect(separationScore(t, init).score).toBeCloseTo(100, 5);
    // 1つの器に2種が半分ずつなら、純度0.5で全量 → 0.5
    const half = { ...init };
    for (let y = 20; y < 38; y++) for (let x = 6; x < 10; x++) s.set(x, y, SEP_LIQUIDS[1]);
    half['m' + SEP_LIQUIDS[0]] = 72; half['m' + SEP_LIQUIDS[1]] = init['m' + SEP_LIQUIDS[1]] + 72;
    const r = separationScore(t, half);
    expect(r.per[0]).toBeCloseTo(0.5, 5);
  });

  it('分離：循環装置を置くか液体を描き足すと記録無効', () => {
    const g = buildSample('sep7');
    g.lproc('electrolysis' as never, 30, 30);
    expect(sampleScore(g)!.invalid).toBeTruthy();
    const h = buildSample('sep7');
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) h.sim.set(40 + x, 40 + y, M.WATER);
    expect(sampleScore(h)!.invalid).toMatch(/増えて/);
  });

  it('塩田：装置とポンプは3つまで。電解板を水面に置くと晶塩が増える', () => {
    const g = buildSample('salt');
    for (const x of [20, 40, 60, 80]) g.lapply('electro', x, 115);
    expect(sampleScore(g)!.invalid).toMatch(/4つ/);
    const h = buildSample('salt');
    for (const x of [30, 60, 90]) h.lapply('electro', x, 115);
    expect(sampleScore(h)!.invalid).toBeUndefined();
    run(h, 900);
    expect(sampleScore(h)!.value).toBeGreaterThan(1);
    const none = buildSample('salt'); run(none, 900); expect(sampleScore(none)!.value).toBe(0);
  });

  it('溶岩：何もしなければ0点。消えない炎：燃えた時間を数え、油を描き足すと無効', () => {
    const g = buildSample('lava'); run(g, 300);
    expect(sampleScore(g)!.value).toBe(0);
    const f = buildSample('flame'); run(f, 1200);
    const v = sampleScore(f)!; expect(v.value).toBeGreaterThan(1); expect(v.unit).toBe('秒');
    expect(f.sample!.mem.best).toBeGreaterThan(0);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) f.sim.set(20 + x, 20 + y, M.OIL);
    expect(sampleScore(f)!.invalid).toMatch(/油/);
  });

  it('挑戦の記録は保存して読み直しても続き、流し直しは自分の壁を残して最初に戻す', () => {
    const f = buildSample('flame'); run(f, 600);
    const total = f.sample!.mem.total; expect(total).toBeGreaterThan(0);
    const into = new Game(labLevel(160, 100), true, 5); applySave(into, parseSave(serializeGame(f)));
    expect(into.sample!.mem.total).toBe(total);
    const g = buildSample('sep7'); run(g, 200);
    const S = g.S; g.sim.set(5 * S, 100 * S, M.WALL);
    expect(resetSampleInPlace(g)).toBe(true);
    expect(g.sim.t[100 * S * g.sim.w + 5 * S]).toBe(M.WALL);
    expect(g.ticks).toBe(0);
    const fresh = buildSample('sep7');
    for (const m of SEP_LIQUIDS) expect(g.sim.count(m)).toBe(fresh.sim.count(m));
    installSample(g, 'nope'); expect(g.sample!.id).toBe('sep7');
  });
});
