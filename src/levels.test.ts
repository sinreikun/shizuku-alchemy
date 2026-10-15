import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { LEVELS } from './levels';

describe('ステージ検証', () => {
  for (const lv of LEVELS) {
    it(`${lv.title}: 解答手順でクリアできる`, () => {
      const g = new Game(lv);
      lv.solve!(g);
      g.start();
      const limit = lv.limit ?? 6000;
      while (!g.won && g.ticks < limit) g.tick();
      expect(g.won, `${lv.title} progress=${g.progress}`).toBe(true);
    }, 60000);
    it(`${lv.title}: 何もしなければクリアできない`, () => {
      const g = new Game(lv);
      g.start();
      const limit = lv.limit ?? 6000;
      while (!g.won && g.ticks < limit) g.tick();
      expect(g.won).toBe(false);
    }, 60000);
  }
});
