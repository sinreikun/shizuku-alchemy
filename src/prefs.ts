// ブラシ太さなどの設定（localStorage に保存）
// v2：解像度2倍に合わせて実セル単位で保存（旧キーの値は自動で引き継ぐ）
export const BRUSH_KEY = 'shizuku-alchemy-brush-v2';
export const OLD_BRUSH_KEY = 'shizuku-alchemy-brush';
export const BRUSH_MIN = 0, BRUSH_MAX = 17, BRUSH_DEFAULT = 3;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export const clampBrush = (v: number) => (Number.isFinite(v) ? Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Math.round(v))) : BRUSH_DEFAULT);
export function loadBrush(store: Store | null = globalThis.localStorage ?? null): number {
  const raw = store?.getItem(BRUSH_KEY);
  if (raw != null) return clampBrush(Number(raw));
  // 旧版（論理セル単位 0〜8）からの引き継ぎ：太さ n → 実セル 2n
  const old = store?.getItem(OLD_BRUSH_KEY);
  if (old != null && Number.isFinite(Number(old))) { const v = clampBrush((Number(old) + 1) * 2 - 1); store?.setItem(BRUSH_KEY, String(v)); return v; }
  return BRUSH_DEFAULT;
}
export function saveBrush(v: number, store: Store | null = globalThis.localStorage ?? null) { store?.setItem(BRUSH_KEY, String(clampBrush(v))); }
/** 表示上の太さ（内部値 + 1、実セル） */
export const brushLabel = (v: number) => `太さ ${clampBrush(v) + 1}`;
