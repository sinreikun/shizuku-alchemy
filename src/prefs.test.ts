import { describe, it, expect } from 'vitest';
import { loadBrush, saveBrush, brushLabel, BRUSH_DEFAULT, BRUSH_KEY, OLD_BRUSH_KEY } from './prefs';
import { Game } from './game';
import { LEVELS } from './levels';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('ブラシ太さの保存', () => {
  it('未保存なら既定値', () => { expect(loadBrush(mem())).toBe(BRUSH_DEFAULT); });
  it('保存した値が次のステージでも維持され、表示と一致する', () => {
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
    st.setItem(BRUSH_KEY, '99'); expect(loadBrush(st)).toBe(17);
    st.setItem(BRUSH_KEY, 'abc'); expect(loadBrush(st)).toBe(BRUSH_DEFAULT);
  });
  it('旧版の保存値（論理単位）を2倍解像度へ引き継ぐ', () => {
    const st = mem();
    st.setItem(OLD_BRUSH_KEY, '2'); // 旧「太さ3」
    expect(loadBrush(st)).toBe(5); // 実セル「太さ6」= 論理の太さ3
    expect(st.getItem(BRUSH_KEY)).toBe('5');
  });
});
