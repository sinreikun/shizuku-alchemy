import { M, Sim } from './sim';
import type { Level, Game } from './game';

const rect = (s: Sim, x: number, y: number, w: number, h: number, m: number = M.WALL) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) s.set(i, j, m);
};
const frame = (s: Sim) => { rect(s, 0, 0, s.w, 2); rect(s, 0, s.h - 2, s.w, 2); rect(s, 0, 0, 2, s.h); rect(s, s.w - 2, 0, 2, s.h); };
const cup = (s: Sim, x: number, y: number, w: number, h: number) => { rect(s, x - 2, y, 2, h + 2); rect(s, x + w, y, 2, h + 2); rect(s, x - 2, y + h, w + 4, 2); };
const fill = (s: Sim, x: number, y: number, w: number, h: number, pick: () => number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (s.get(i, j) === M.EMPTY) { const m = pick(); if (m) s.set(i, j, m); } };
const air = (s: Sim) => () => { const r = s.rnd01(); return r < 0.5 ? (r < 0.5 * 0.23 ? M.OXYGEN : M.NITROGEN) : M.EMPTY; };

export interface Chapter { id: string; name: string; color: string }
export const CHAPTERS: Chapter[] = [
  { id: 'basic', name: '第1章　基礎', color: '#7fd3ff' },
  { id: 'heat', name: '第2章　熱と相変化', color: '#ff8a5c' },
  { id: 'dens', name: '第3章　密度', color: '#ffd66e' },
  { id: 'chem', name: '第4章　溶解と析出', color: '#c6f0ff' },
  { id: 'fire', name: '第5章　燃焼', color: '#ffb340' },
  { id: 'dev', name: '第6章　装置と配管', color: '#9dffb8' },
  { id: 'cycle', name: '第7章　循環', color: '#c69bff' },
];

export const LEVELS: Level[] = [
  {
    id: 'l1', chapter: 'basic', title: 'はじめての導水', learn: '壁と消しゴム',
    story: '泉から湧いた水を、右下の壺まで届けよう。赤い奈落に落ちた水は消えてしまう。',
    hint: '左ドラッグで壁を描き、坂道を作ろう。右ドラッグで消せる。', inv: { ink: 420 },
    sources: [{ x: 22, y: 6, mats: [M.WATER], rate: 3, total: 900 }],
    goals: [{ x: 128, y: 82, w: 24, h: 12, mat: M.WATER, need: 250, mode: 'absorb', label: '水' }],
    drains: [{ x: 2, y: 96, w: 116, h: 2 }],
    build(s) { frame(s); rect(s, 2, 94, 116, 4, M.EMPTY); rect(s, 118, 70, 4, 28); cup(s, 128, 82, 24, 12); rect(s, 40, 40, 30, 3); },
    solve(g) { g.stroke('wall', 12, 30, 118, 80); },
  },
  {
    id: 'l2', chapter: 'heat', title: '湯気のエレベーター', learn: 'ヒーター・クーラー・相変化',
    story: '壺は高い棚の上。水を沸かして蒸気にし、上空で冷やして雨に戻そう。',
    hint: 'ヒーターを水たまりの底へ、クーラーを壺の真上へ。斜めの屋根で蒸気を棚の上空へ導くと早く、少ない資源で済む。', inv: { ink: 400, heater: 2, cooler: 2 },
    sources: [{ x: 30, y: 50, mats: [M.WATER], rate: 2, total: 1400 }],
    goals: [{ x: 112, y: 16, w: 30, h: 8, mat: M.WATER, need: 160, mode: 'absorb', label: '水' }],
    drains: [],
    build(s) { frame(s); rect(s, 2, 80, 90, 18); rect(s, 10, 66, 2, 14); rect(s, 70, 66, 2, 14); rect(s, 10, 78, 62, 2); rect(s, 92, 26, 4, 72); cup(s, 112, 16, 30, 8); rect(s, 96, 26, 16, 2); },
    solve(g) { g.apply('heater', 28, 76); g.apply('heater', 52, 76); g.stroke('wall', 6, 46, 108, 8); g.apply('cooler', 122, 5); g.apply('cooler', 136, 5); },
    limit: 9000,
  },
  {
    id: 'l3', chapter: 'heat', title: '溶岩の橋', learn: '冷却による固化',
    story: '谷を岩で埋めて橋を架けろ。溶岩は水で急冷すると岩になる。右の岩棚に落ちた水は染み込んで消える。',
    hint: '右上の水を坂で谷まで運び、溶岩にかけよう。', inv: { ink: 360 },
    sources: [{ x: 56, y: 6, mats: [M.LAVA], rate: 2, total: 1400 }, { x: 140, y: 6, mats: [M.WATER], rate: 2, total: 1600 }],
    goals: [{ x: 62, y: 76, w: 36, h: 10, mat: M.ROCK, need: 250, mode: 'fill', label: '岩石' }],
    drains: [{ x: 102, y: 74, w: 56, h: 2 }],
    build(s) { frame(s); rect(s, 2, 76, 60, 22); rect(s, 98, 76, 60, 22); rect(s, 62, 86, 36, 12); rect(s, 98, 66, 4, 10); },
    solve(g) { g.stroke('wall', 150, 18, 100, 56); },
    limit: 8000,
  },
  {
    id: 'l4', chapter: 'dens', title: '油だけ通せ', learn: '比重による分離',
    story: '混ざって流れてくる水と油。壺が欲しいのは油だけ。水が入ると壺が詰まる！',
    hint: '油は水に浮く。台の上に堰（せき）を作れば、上澄みの油だけがあふれる。', inv: { ink: 480 },
    sources: [{ x: 20, y: 6, mats: [M.WATER, M.OIL], rate: 3, total: 2400 }],
    goals: [{ x: 132, y: 92, w: 12, h: 2, mat: M.OIL, need: 200, mode: 'absorb', label: '油' }],
    drains: [{ x: 70, y: 96, w: 40, h: 2 }],
    build(s) { frame(s); rect(s, 2, 60, 66, 38); rect(s, 70, 94, 40, 4, M.EMPTY); rect(s, 110, 70, 4, 28); cup(s, 132, 88, 12, 6); },
    solve(g) { g.stroke('wall', 40, 36, 40, 59); g.stroke('wall', 42, 38, 133, 84); },
    naive: [{ desc: '湧き口から壺へ直接坂を引く', run: (g) => g.stroke('wall', 14, 14, 133, 84) }],
    limit: 9000,
  },
  {
    id: 'l5', chapter: 'dens', title: '水銀の重み', learn: '重い液体は沈んで潜り込む',
    story: '壺は水底の密室にあり、天井でふさがれている。入口は右の水槽の底、仕切りの下だけ。水より重い水銀なら潜って届くはず。',
    hint: '天井に落ちた水銀は左の奈落へこぼれる。仕切りを越えて右の水槽まで運ぼう。水銀は水を押しのけて沈み、斜めの底を滑って仕切りの下をくぐる。',
    inv: { ink: 220 },
    sources: [{ x: 16, y: 6, mats: [M.MERCURY], rate: 2, total: 1600 }],
    goals: [{ x: 22, y: 84, w: 26, h: 8, mat: M.MERCURY, need: 160, mode: 'absorb', label: '水銀' }],
    drains: [{ x: 2, y: 96, w: 6, h: 2 }, { x: 120, y: 96, w: 38, h: 2 }],
    build(s) {
      frame(s);
      rect(s, 2, 94, 6, 4, M.EMPTY); rect(s, 120, 94, 38, 4, M.EMPTY);
      // 密室（左）：外壁・天井。右は仕切りで、下だけ開いている
      rect(s, 8, 44, 2, 54); for (let x = 10; x < 61; x++) rect(s, x, 38 + Math.round(((60 - x) * 6) / 50), 1, 2); rect(s, 61, 16, 4, 62);
      // 開いた水槽（右）の外壁
      rect(s, 118, 40, 2, 58);
      // 底：右から左へ下る斜面
      for (let x = 10; x < 118; x++) { const top = x > 64 ? Math.round(70 + ((117 - x) * 22) / 53) : 92; rect(s, x, top, 1, 98 - top); }
      cup(s, 22, 84, 26, 8);
      fill(s, 10, 46, 51, 52, () => M.WATER); fill(s, 65, 44, 53, 54, () => M.WATER);
    },
    solve(g) { g.stroke('wall', 12, 9, 100, 20); },
    naive: [
      { desc: '壺の真上（密室の天井）へ坂を引く', run: (g) => g.stroke('wall', 12, 9, 36, 32) },
      { desc: '湧き口の下に何も描かない（天井に直接落とす）', run: () => {} },
    ],
    limit: 9000,
  },
  {
    id: 'l6', chapter: 'chem', title: '塩水づくり', learn: '溶解',
    story: '晶塩と水を混ぜて塩水を作り、壺へ。塩だけ、水だけでは受け取ってもらえない。',
    hint: '塩と水の流れを一つの坂に集めよう。水に触れた塩は溶けて塩水になる。', inv: { ink: 480 },
    sources: [{ x: 34, y: 6, mats: [M.SALT], rate: 1, total: 900 }, { x: 36, y: 10, mats: [M.WATER], rate: 1, total: 900 }],
    goals: [{ x: 124, y: 84, w: 26, h: 10, mat: M.BRINE, need: 150, mode: 'absorb', label: '塩水' }],
    drains: [{ x: 2, y: 96, w: 112, h: 2 }],
    build(s) { frame(s); rect(s, 2, 94, 112, 4, M.EMPTY); rect(s, 114, 70, 4, 28); cup(s, 124, 84, 26, 10); },
    solve(g) { g.stroke('wall', 22, 24, 113, 68); g.stroke('wall', 20, 14, 20, 24); },
    limit: 12000,
  },
  {
    id: 'l7', chapter: 'chem', title: '塩の結晶', learn: '蒸発と析出',
    story: '塩水を煮詰めて、晶塩の結晶を枠いっぱいに取り出そう。蒸気は天井から逃げていく。',
    hint: 'ヒーターで100℃に。水だけが蒸発して晶塩が残る。', inv: { heater: 3 },
    sources: [{ x: 80, y: 6, mats: [M.BRINE], rate: 2, total: 2400 }],
    goals: [{ x: 60, y: 82, w: 40, h: 12, mat: M.SALT, need: 180, mode: 'fill', label: '晶塩' }],
    drains: [{ x: 2, y: 2, w: 156, h: 2 }],
    build(s) { frame(s); rect(s, 58, 70, 2, 26); rect(s, 100, 70, 2, 26); rect(s, 58, 94, 44, 2); },
    solve(g) { g.apply('heater', 66, 92); g.apply('heater', 80, 92); g.apply('heater', 94, 92); },
    limit: 9000,
  },
  {
    id: 'l8', chapter: 'fire', title: '火の番人', learn: '燃焼・酸素・着火',
    story: '空気で満たされた炉に油が流れ込む。着火器で火をつけ、150回燃焼させよう。',
    hint: '燃焼には燃料・酸素・熱がそろう必要がある。着火器を油の流れに当てよう。', inv: { igniter: 1 },
    sources: [{ x: 80, y: 6, mats: [M.OIL], rate: 1, total: 1500 }],
    goals: [{ x: 4, y: 4, w: 0, h: 0, mat: M.FIRE, need: 150, mode: 'stat', stat: 'burned', label: '燃焼' }],
    drains: [],
    build(s) { frame(s); rect(s, 30, 70, 100, 2); rect(s, 30, 50, 2, 20); rect(s, 128, 50, 2, 20); fill(s, 2, 4, 156, 94, air(s)); },
    solve(g) { g.apply('igniter', 80, 30); },
    limit: 9000,
  },
  {
    id: 'l9', chapter: 'dev', title: '壁の向こうへ', learn: 'ポンプと配管',
    story: '水は分厚い壁に囲まれた貯水槽の中。ポンプで壺まで送り出そう。',
    hint: 'ポンプは2回クリック。1回目が吸い込み口、2回目が吐き出し口。', inv: { pump: 1 },
    sources: [],
    goals: [{ x: 120, y: 82, w: 30, h: 12, mat: M.WATER, need: 300, mode: 'absorb', label: '水' }],
    drains: [],
    build(s) { frame(s); rect(s, 2, 40, 76, 4); rect(s, 74, 40, 4, 58); rect(s, 90, 20, 8, 78); fill(s, 2, 44, 72, 54, () => M.WATER); cup(s, 120, 82, 30, 12); },
    solve(g) { g.apply('pump', 30, 90); g.apply('pump', 134, 70); },
    limit: 6000,
  },
  {
    id: 'l10', chapter: 'dev', title: 'ふるい分け', learn: '選択膜',
    story: '水と水銀が一緒に降ってくる。水銀が壺に入ると詰まってしまう。水だけを通す膜でふるい分けよう。',
    hint: '選択膜（水用）を斜めに張ると、水銀は膜の上を転がり落ちる。', inv: { filter: 200, ink: 160 }, filterMat: M.WATER,
    sources: [{ x: 70, y: 6, mats: [M.WATER, M.MERCURY], rate: 2, total: 2400 }],
    goals: [{ x: 64, y: 88, w: 14, h: 6, mat: M.WATER, need: 180, mode: 'absorb', label: '水' }],
    drains: [{ x: 100, y: 96, w: 56, h: 2 }],
    build(s) { frame(s); rect(s, 100, 94, 56, 4, M.EMPTY); cup(s, 64, 88, 14, 6); },
    solve(g) { g.stroke('filter', 63, 40, 79, 50); g.stroke('wall', 81, 51, 106, 66); },
    naive: [{ desc: '膜を使わず、壁の漏斗で壺へ流す', run: (g) => { g.stroke('wall', 50, 40, 64, 80); g.stroke('wall', 92, 40, 80, 80); } }],
    limit: 9000,
  },
  {
    id: 'l11', chapter: 'dev', title: '電気分解', learn: '電解槽',
    story: '水を電気で水素と酸素に分けよう。右上の捕集筒に水素を集める。',
    hint: '電解槽を水の中に沈めよう。生まれた水素は最も軽く、天井へ昇る。', inv: { electro: 1 },
    sources: [],
    goals: [{ x: 110, y: 2, w: 46, h: 14, mat: M.HYDROGEN, need: 120, mode: 'absorb', label: '水素' }],
    drains: [],
    build(s) { frame(s); rect(s, 4, 70, 2, 26); rect(s, 80, 70, 2, 26); fill(s, 6, 74, 74, 22, () => M.WATER); },
    solve(g) { g.apply('electro', 40, 90); },
    limit: 6000,
  },
  {
    id: 'l12', chapter: 'cycle', title: '水素循環', learn: '電解→燃焼→凝縮の循環',
    story: '地下の水を、高い棚の壺へ。ヒーターはない。電解・燃焼・凝縮を組み合わせた循環装置で運び上げよう。',
    hint: '電解槽で水素と酸素を作り、泡が出る水面の上で着火すると蒸気になる。クーラーで壺の上に雨を降らせよう。', inv: { electro: 1, igniter: 1, cooler: 2, ink: 200 },
    sources: [],
    goals: [{ x: 118, y: 38, w: 30, h: 10, mat: M.WATER, need: 100, mode: 'absorb', label: '水' }],
    drains: [],
    build(s) { frame(s); rect(s, 100, 50, 58, 48); fill(s, 2, 76, 98, 22, () => M.WATER); cup(s, 118, 38, 30, 10); },
    solve(g) { g.apply('electro', 50, 92); g.apply('igniter', 50, 30); g.apply('cooler', 126, 26); g.apply('cooler', 140, 26); },
    limit: 14000,
  },
];

export const SANDBOX: Level = {
  id: 'sandbox', chapter: 'lab', title: '自由実験室', learn: 'すべて',
  story: 'すべての物質と装置を自由に使える実験台。', hint: 'パレットから物質や装置を選んで描こう。ホイールで拡大、Space+ドラッグで移動。',
  w: 240, h: 150, inv: {}, sources: [], goals: [], drains: [],
  build(s) {
    frame(s);
    // 見本の配置
    rect(s, 20, 100, 2, 46); rect(s, 90, 100, 2, 46); rect(s, 20, 146, 72, 2);
    for (let j = 120; j < 146; j++) for (let i = 22; i < 90; i++) s.set(i, j, M.WATER);
    for (let j = 110; j < 120; j++) for (let i = 22; i < 90; i++) s.set(i, j, M.OIL);
    rect(s, 130, 120, 60, 2); for (let j = 100; j < 120; j++) for (let i = 140; i < 180; i++) s.set(i, j, M.LAVA);
    rect(s, 120, 20, 40, 2);
  },
};

export type { Game };
