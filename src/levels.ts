import { M, Sim, W, H } from './sim';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Source { x: number; y: number; mats: number[]; rate: number; total: number }
export interface Goal extends Rect { mat: number; need: number; mode: 'absorb' | 'fill'; label: string }
export interface Level {
  id: string; title: string; story: string; hint: string;
  ink: number; heaters: number; coolers: number;
  sources: Source[]; goals: Goal[]; drains: Rect[];
  build: (s: Sim) => void;
}

const rect = (s: Sim, x: number, y: number, w: number, h: number, m = M.WALL) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) s.set(i, j, m);
};
const frame = (s: Sim) => { rect(s, 0, 0, W, 2); rect(s, 0, H - 2, W, 2); rect(s, 0, 0, 2, H); rect(s, W - 2, 0, 2, H); };
const cup = (s: Sim, x: number, y: number, w: number, h: number) => { rect(s, x - 2, y, 2, h + 2); rect(s, x + w, y, 2, h + 2); rect(s, x - 2, y + h, w + 4, 2); };

export const LEVELS: Level[] = [
  {
    id: 'l1', title: '1. はじめての導水', story: '泉から湧いた水を、右下の壺まで届けよう。下の奈落に落ちた水は戻らない。',
    hint: '左ドラッグで壁を描く。坂道を作れば水は転がっていく。', ink: 140*3, heaters: 0, coolers: 0,
    sources: [{ x: 22, y: 6, mats: [M.WATER], rate: 3, total: 900 }],
    goals: [{ x: 128, y: 82, w: 24, h: 12, mat: M.WATER, need: 300, mode: 'absorb', label: '水' }],
    drains: [{ x: 2, y: 96, w: 116, h: 2 }],
    build(s) { frame(s); rect(s, 2, 94, 116, 2, M.EMPTY); rect(s, 118, 70, 4, 28); cup(s, 128, 82, 24, 12); rect(s, 40, 40, 30, 3); },
  },
  {
    id: 'l2', title: '2. 湯気のエレベーター', story: '壺は高い棚の上。水を沸かして蒸気にし、冷やして雨に戻そう。',
    hint: 'ヒーター（3）を水たまりの下へ、クーラー（4）を棚の上空へ。', ink: 80*3, heaters: 2, coolers: 2,
    sources: [{ x: 30, y: 50, mats: [M.WATER], rate: 2, total: 1400 }],
    goals: [{ x: 112, y: 16, w: 30, h: 8, mat: M.WATER, need: 160, mode: 'absorb', label: '水' }],
    drains: [],
    build(s) { frame(s); rect(s, 2, 80, 90, 18, M.WALL); rect(s, 10, 70, 2, 10); rect(s, 70, 70, 2, 10); rect(s, 10, 78, 62, 2); rect(s, 92, 26, 4, 72); cup(s, 112, 16, 30, 8); rect(s, 96, 26, 16, 2); },
  },
  {
    id: 'l3', title: '3. 溶岩の橋', story: '谷を岩で埋めて橋を架けろ。溶岩は冷えると岩になる。',
    hint: '水を溶岩にかけると急冷される。光る枠の中を岩で満たそう。', ink: 120*3, heaters: 0, coolers: 2,
    sources: [{ x: 60, y: 6, mats: [M.LAVA], rate: 2, total: 1600 }, { x: 120, y: 6, mats: [M.WATER], rate: 2, total: 1600 }],
    goals: [{ x: 62, y: 76, w: 36, h: 10, mat: M.ROCK, need: 260, mode: 'fill', label: '岩石' }],
    drains: [],
    build(s) { frame(s); rect(s, 2, 76, 60, 22); rect(s, 98, 76, 60, 22); rect(s, 62, 86, 36, 12); },
  },
  {
    id: 'l4', title: '4. 油だけ通せ', story: '混ざって流れてくる水と油。壺が欲しいのは油だけ。水が入ると壺が詰まる！',
    hint: '油は水に浮く。上澄みだけがあふれる堰（せき）を作ろう。', ink: 160*3, heaters: 0, coolers: 0,
    sources: [{ x: 20, y: 6, mats: [M.WATER, M.OIL], rate: 3, total: 2400 }],
    goals: [{ x: 128, y: 84, w: 22, h: 10, mat: M.OIL, need: 220, mode: 'absorb', label: '油' }],
    drains: [{ x: 70, y: 96, w: 40, h: 2 }],
    build(s) { frame(s); rect(s, 2, 60, 66, 38); rect(s, 70, 94, 40, 2, M.EMPTY); rect(s, 110, 70, 4, 28); cup(s, 128, 84, 22, 10); },
  },
  {
    id: 'l5', title: '5. 小さな蒸留所', story: '油まじりの水から、純粋な水だけを取り出そう。水は100℃、油は300℃で気化する。',
    hint: 'ヒーターで水だけを蒸気に。熱しすぎると油が煙になる。', ink: 100*3, heaters: 2, coolers: 2,
    sources: [{ x: 30, y: 30, mats: [M.WATER, M.OIL, M.WATER], rate: 2, total: 1800 }],
    goals: [{ x: 120, y: 82, w: 26, h: 10, mat: M.WATER, need: 160, mode: 'absorb', label: '水' }],
    drains: [],
    build(s) { frame(s); rect(s, 8, 70, 2, 28); rect(s, 60, 50, 2, 48); rect(s, 8, 90, 52, 8); cup(s, 120, 82, 26, 10); rect(s, 62, 50, 30, 2); },
  },
  {
    id: 'l6', title: '6. 水銀の重み', story: '重たい水銀を坂で運べ。ただし途中に油の湖がある。',
    hint: '水銀は何よりも重い。油の下を潜り抜けていく。', ink: 120*3, heaters: 0, coolers: 0,
    sources: [{ x: 14, y: 6, mats: [M.MERCURY], rate: 2, total: 1200 }],
    goals: [{ x: 132, y: 84, w: 20, h: 10, mat: M.MERCURY, need: 240, mode: 'absorb', label: '水銀' }],
    drains: [{ x: 2, y: 96, w: 40, h: 2 }],
    build(s) { frame(s); rect(s, 2, 94, 40, 2, M.EMPTY); rect(s, 42, 60, 2, 38); rect(s, 44, 90, 70, 8); rect(s, 112, 60, 2, 30); rect(s, 44, 70, 68, 20, M.OIL); cup(s, 132, 84, 20, 10); },
  },
];

export const SANDBOX: Level = {
  id: 'sandbox', title: '自由実験室', story: 'すべての物質を自由に置ける実験台。', hint: '1〜0で物質を選んで描こう。',
  ink: Infinity, heaters: Infinity, coolers: Infinity, sources: [], goals: [], drains: [],
  build(s) { frame(s); },
};
