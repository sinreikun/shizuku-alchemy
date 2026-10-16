// ブラシ太さなどの設定（localStorage に保存）
export const BRUSH_KEY = 'shizuku-alchemy-brush';
export const BRUSH_MIN = 0, BRUSH_MAX = 8, BRUSH_DEFAULT = 1;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export const clampBrush = (v: number) => (Number.isFinite(v) ? Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Math.round(v))) : BRUSH_DEFAULT);
export function loadBrush(store: Store | null = globalThis.localStorage ?? null): number {
  const raw = store?.getItem(BRUSH_KEY);
  return raw == null ? BRUSH_DEFAULT : clampBrush(Number(raw));
}
export function saveBrush(v: number, store: Store | null = globalThis.localStorage ?? null) { store?.setItem(BRUSH_KEY, String(clampBrush(v))); }
/** 表示上の太さ（内部値 + 1） */
export const brushLabel = (v: number) => `太さ ${clampBrush(v) + 1}`;
