import { describe, it, expect } from 'vitest';
import { loadBrush, saveBrush, brushLabel, BRUSH_DEFAULT } from './prefs';
import { Game } from './game';
import { LEVELS } from './levels';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('ブラシ太さの保存', () => {
  it('未保存なら既定値', () => { expect(loadBrush(mem())).toBe(BRUSH_DEFAULT); });
  it('保存した値（太さ1 = 内部値0）が次のステージでも維持され、表示と一致する', () => {
    const st = mem();
    saveBrush(0, st);
    for (const lv of LEVELS.slice(0, 3)) {
      const g = new Game(lv);
      g.brush = loadBrush(st); // startLevel と同じ流れ
      expect(g.brush).toBe(0);
      expect(brushLabel(g.brush)).toBe('太さ 1');
    }
  });
  it('範囲外・不正値は丸める', () => {
    const st = mem();
    st.setItem('shizuku-alchemy-brush', '99'); expect(loadBrush(st)).toBe(8);
    st.setItem('shizuku-alchemy-brush', 'abc'); expect(loadBrush(st)).toBe(BRUSH_DEFAULT);
  });
});
