import { M } from './sim';
import type { Level, Game, Painter } from './game';
type Sim = Painter;

const rect = (s: Sim, x: number, y: number, w: number, h: number, m: number = M.WALL) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) s.set(i, j, m);
};
const frame = (s: Sim) => { rect(s, 0, 0, s.w, 2); rect(s, 0, s.h - 2, s.w, 2); rect(s, 0, 0, 2, s.h); rect(s, s.w - 2, 0, 2, s.h); };
const cup = (s: Sim, x: number, y: number, w: number, h: number) => { rect(s, x - 2, y, 2, h + 2); rect(s, x + w, y, 2, h + 2); rect(s, x - 2, y + h, w + 4, 2); };
const fill = (s: Sim, x: number, y: number, w: number, h: number, pick: () => number) => s.fillReal(x, y, w, h, pick);
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
  { id: 'mech', name: '第8章　機構', color: '#8fd8ff' },
  { id: 'proc', name: '第9章　合成と分離', color: '#ff9de2' },
];

export const LEVELS: Level[] = [
  {
    id: 'l1', chapter: 'basic', title: 'はじめての導水', learn: '壁と消しゴム',
    story: '泉から湧いた水を、右下の壺まで届けよう。赤い奈落に落ちた水は消えてしまう。',
    hint: '左ドラッグで壁を描き、坂道を作ろう。右ドラッグで消せる。', inv: { ink: 420 },
    sources: [{ x: 22, y: 6, mats: [M.WATER], rate: 3, total: 900 }],
    goals: [{ x: 124, y: 82, w: 24, h: 12, mat: M.WATER, need: 250, mode: 'absorb', label: '水' }],
    drains: [{ x: 2, y: 96, w: 116, h: 2 }],
    build(s) { frame(s); rect(s, 2, 94, 116, 4, M.EMPTY); rect(s, 118, 70, 4, 28); cup(s, 124, 82, 24, 12); rect(s, 40, 40, 30, 3); },
    solve(g) { g.lstroke('wall', 12, 30, 118, 80); },
    eco(g) { g.lstroke('wall', 12, 30, 118, 80, 0); },
  },
  {
    id: 'l2', chapter: 'heat', title: '湯気のエレベーター', learn: 'ヒーター・クーラー・相変化',
    story: '壺は高い棚の上。水を沸かして蒸気にし、上空で冷やして雨に戻そう。',
    hint: 'ヒーターを水たまりの底へ、クーラーを壺の真上へ。斜めの屋根で蒸気を棚の上空へ導くと早く、少ない資源で済む。', inv: { ink: 400, heater: 2, cooler: 2 },
    sources: [{ x: 30, y: 50, mats: [M.WATER], rate: 2, total: 1400 }],
    goals: [{ x: 112, y: 16, w: 30, h: 8, mat: M.WATER, need: 160, mode: 'absorb', label: '水' }],
    drains: [],
    build(s) { frame(s); rect(s, 2, 80, 90, 18); rect(s, 10, 66, 2, 14); rect(s, 70, 66, 2, 14); rect(s, 10, 78, 62, 2); rect(s, 92, 26, 4, 72); cup(s, 112, 16, 30, 8); rect(s, 96, 26, 16, 2); },
    solve(g) { g.lapply('heater', 28, 76); g.lapply('heater', 52, 76); g.lstroke('wall', 6, 46, 108, 8); g.lapply('cooler', 122, 5); g.lapply('cooler', 136, 5); },
    eco(g) { g.lapply('heater', 40, 76); g.lapply('cooler', 128, 5); },
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
    solve(g) { g.lstroke('wall', 150, 18, 100, 56); },
    eco(g) { g.lstroke('wall', 146, 20, 100, 56, 0); },
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
    solve(g) { g.lstroke('wall', 40, 36, 40, 59); g.lstroke('wall', 42, 38, 133, 84); },
    eco(g) { g.lstroke('wall', 40, 38, 40, 59, 0); g.lstroke('wall', 41, 40, 133, 84, 0); },
    naive: [{ desc: '湧き口から壺へ直接坂を引く', run: (g) => g.lstroke('wall', 14, 14, 133, 84) }],
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
    solve(g) { g.lstroke('wall', 12, 9, 100, 20); },
    eco(g) { g.lstroke('wall', 13, 9, 70, 16, 0); },
    naive: [
      { desc: '壺の真上（密室の天井）へ坂を引く', run: (g) => g.lstroke('wall', 12, 9, 36, 32) },
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
    solve(g) { g.lstroke('wall', 22, 24, 113, 68); g.lstroke('wall', 20, 14, 20, 24); },
    eco(g) { g.lstroke('wall', 22, 24, 113, 68); g.lstroke('wall', 20, 14, 20, 24); },
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
    solve(g) { g.lapply('heater', 66, 92); g.lapply('heater', 80, 92); g.lapply('heater', 94, 92); },
    eco(g) { g.lapply('heater', 72, 92); g.lapply('heater', 88, 92); },
    limit: 9000,
  },
  {
    id: 'l8', chapter: 'fire', title: '火の番人', learn: '燃焼・酸素・着火',
    story: '空気で満たされた炉に油が流れ込む。着火器で火をつけ、目標の回数だけ燃焼させよう。',
    hint: '燃焼には燃料・酸素・熱がそろう必要がある。着火器を油の流れに当てよう。', inv: { igniter: 1 },
    sources: [{ x: 80, y: 6, mats: [M.OIL], rate: 1, total: 1500 }],
    goals: [{ x: 4, y: 4, w: 0, h: 0, mat: M.FIRE, need: 45, mode: 'stat', stat: 'burned', label: '燃焼', }],
    drains: [],
    build(s) { frame(s); rect(s, 30, 70, 100, 2); rect(s, 30, 50, 2, 20); rect(s, 128, 50, 2, 20); fill(s, 2, 4, 156, 94, air(s)); },
    solve(g) { g.lapply('igniter', 80, 30); },
    eco(g) { g.lapply('igniter', 80, 30); },
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
    solve(g) { g.lapply('pump', 30, 90); g.lapply('pump', 134, 70); },
    eco(g) { g.lapply('pump', 30, 90); g.lapply('pump', 134, 70); },
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
    solve(g) { g.lstroke('filter', 63, 40, 79, 50); g.lstroke('wall', 81, 51, 106, 66); },
    eco(g) { g.lstroke('filter', 63, 40, 79, 50); g.lstroke('wall', 81, 51, 100, 62, 0); },
    naive: [{ desc: '膜を使わず、壁の漏斗で壺へ流す', run: (g) => { g.lstroke('wall', 50, 40, 64, 80); g.lstroke('wall', 92, 40, 80, 80); } }],
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
    solve(g) { g.lapply('electro', 40, 90); },
    eco(g) { g.lapply('electro', 40, 90); },
    limit: 8000,
  },
  {
    id: 'l12', chapter: 'cycle', title: '水素循環', learn: '電解→燃焼→凝縮の循環',
    story: '地下の水を、高い棚の壺へ。ヒーターはない。電解・燃焼・凝縮を組み合わせた循環装置で運び上げよう。',
    hint: '電解槽で水素と酸素を作り、泡が出る水面の上で着火すると蒸気になる。クーラーで壺の上に雨を降らせよう。', inv: { electro: 1, igniter: 1, cooler: 2, ink: 200 },
    sources: [],
    goals: [{ x: 118, y: 38, w: 30, h: 10, mat: M.WATER, need: 70, mode: 'absorb', label: '水' }],
    drains: [],
    build(s) { frame(s); rect(s, 100, 50, 58, 48); fill(s, 2, 76, 98, 22, () => M.WATER); cup(s, 118, 38, 30, 10); },
    solve(g) { g.lapply('electro', 50, 92); g.lapply('igniter', 50, 30); g.lapply('cooler', 126, 26); g.lapply('cooler', 140, 26); },
    eco(g) { g.lapply('electro', 50, 92); g.lapply('igniter', 50, 30); g.lapply('cooler', 133, 26); },
    limit: 18000,
  },

  {
    id: 'm1', chapter: 'mech', title: 'ピストン昇降機', learn: 'ピストン・可動板・親子付け',
    story: '縦穴の底にたまった水を、穴のふちより上へ持ち上げて、隣の壺へこぼそう。',
    hint: 'ピストンを縦穴の底に置き、上へドラッグして伸びる長さを決める。次にピストンの根元から可動板を描くと、板がピストンに付いて一緒に動く。',
    inv: { piston: 1, plate: 50 },
    sources: [], drains: [],
    goals: [{ x: 44, y: 64, w: 30, h: 12, mat: M.WATER, need: 120, mode: 'absorb', label: '水' }],
    build(s) { frame(s); rect(s, 20, 40, 2, 58); rect(s, 40, 52, 2, 46); fill(s, 22, 72, 18, 26, () => M.WATER); cup(s, 44, 64, 30, 12); },
    solve(g) { g.lpiston(31, 97, 31, 58); g.lplate(21, 95, 40, 95); },
    eco(g) { g.lpiston(31, 97, 31, 62); g.lplate(21, 95, 40, 95); },
    naive: [
      { desc: 'ピストンだけ（板なし）', run: (g) => { g.lpiston(31, 97, 31, 62); } },
      { desc: '板だけ（モーターなし）', run: (g) => { g.lplate(21, 95, 40, 95); } },
    ],
    limit: 4000,
  },

  {
    id: 'm2', chapter: 'mech', title: '回転腕のすくい上げ', learn: '回転モーター・回転方向',
    story: '鉢の底にたまった晶塩を、回る腕ですくい上げ、右のふちを越えて壺へ落とそう。',
    hint: '回転モーターを鉢の中央に置き、モーターから右へ腕（可動板）を描く。選択ツールで回転の向きを変えられる。右側で腕が「上がる」向きに回そう。',
    inv: { rotor: 1, plate: 80 },
    sources: [], drains: [],
    goals: [{ x: 74, y: 76, w: 26, h: 10, mat: M.SALT, need: 100, mode: 'absorb', label: '晶塩' }],
    build(s) { frame(s); rect(s, 30, 50, 2, 42); rect(s, 70, 60, 2, 32); rect(s, 30, 90, 42, 2); fill(s, 32, 74, 38, 16, () => M.SALT); cup(s, 74, 76, 26, 10); },
    solve(g) { const r = g.lrotor(50, 72)!; g.lplate(50, 72, 76, 72); g.editNode(r.id, { dir: -1 }); },
    eco(g) { const r = g.lrotor(50, 72)!; g.lplate(50, 72, 74, 72); g.editNode(r.id, { dir: -1 }); },
    naive: [
      { desc: '腕を逆回転（右側で下がる向き）', run: (g) => { g.lrotor(50, 72); g.lplate(50, 72, 76, 72); } },
    ],
    limit: 6000,
  },

  {
    id: 'm3', chapter: 'mech', title: '二段ピストン', learn: '関節ツリー（ピストンの上にピストン）',
    story: 'もっと深い縦穴。ピストン1本の伸びでは、ふちまで届かない。',
    hint: 'ピストンの先端に、もう1本のピストンを置くと親子になり、伸びが足し算になる。板は最後に置いたピストンに付く。',
    inv: { piston: 2, plate: 50 }, maxAmp: 18,
    sources: [], drains: [],
    goals: [{ x: 44, y: 52, w: 30, h: 12, mat: M.WATER, need: 60, mode: 'absorb', label: '水' }],
    build(s) { frame(s); rect(s, 20, 24, 2, 74); rect(s, 40, 40, 2, 58); fill(s, 22, 72, 18, 26, () => M.WATER); cup(s, 44, 52, 30, 12); },
    solve(g) { g.lpiston(31, 97, 31, 79); g.lpiston(31, 97, 31, 79); g.lplate(21, 95, 40, 95); },
    eco(g) { g.lpiston(31, 97, 31, 79); g.lpiston(31, 97, 31, 79); g.lplate(21, 95, 40, 95); },
    naive: [
      { desc: 'ピストン1本で持ち上げる', run: (g) => { g.lpiston(31, 97, 31, 60); g.lplate(21, 95, 40, 95); } },
      { desc: '2本を別々に並べる', run: (g) => { g.lpiston(26, 97, 26, 79); g.lpiston(36, 97, 36, 79); g.lplate(21, 95, 40, 95); } },
    ],
    limit: 5000,
  },
  {
    id: 'm4', chapter: 'mech', title: 'しなる腕', learn: 'ばね関節・ガイド',
    story: '腕の通り道に、動かないガイドの杭が立っている。固い腕では引っかかって止まってしまう。',
    hint: '腕を2本の板でつなぎ、先の板を選択ツールで「ばね」関節にしよう。杭に当たると曲がってかわし、ばねで元に戻る。',
    inv: { rotor: 1, plate: 70 },
    sources: [], drains: [],
    goals: [{ x: 74, y: 76, w: 26, h: 10, mat: M.SALT, need: 80, mode: 'absorb', label: '晶塩' }],
    build(s) { frame(s); rect(s, 30, 50, 2, 42); rect(s, 70, 60, 2, 32); rect(s, 30, 90, 42, 2); fill(s, 32, 74, 38, 16, () => M.SALT); cup(s, 74, 76, 26, 10); rect(s, 24, 70, 2, 3, M.GUIDE); },
    solve(g) { const r = g.lrotor(50, 72)!; g.lplate(50, 72, 64, 72); const b = g.lplate(63, 72, 76, 72)!; g.editNode(r.id, { dir: -1 }); g.editNode(b.id, { joint: 'spring' }); },
    eco(g) { const r = g.lrotor(50, 72)!; g.lplate(50, 72, 64, 72); const b = g.lplate(63, 72, 75, 72)!; g.editNode(r.id, { dir: -1 }); g.editNode(b.id, { joint: 'spring' }); },
    naive: [
      { desc: '固定関節のまま回す', run: (g) => { const r = g.lrotor(50, 72)!; g.lplate(50, 72, 76, 72); g.editNode(r.id, { dir: -1 }); } },
    ],
    limit: 6000,
  },
  {
    id: 'p1', chapter: 'proc', title: '結晶反応器', learn: '循環装置（結晶反応器）',
    story: '晶塩と活性剤を反応させて、重い複合結晶を作ろう。装置は左が主入口、下が補助入口、右が主出口。',
    hint: '結晶反応器を、活性剤の筒の真上・屋根の下に置こう。左に晶塩、下に活性剤が触れていれば、右へ複合結晶が出てくる。',
    inv: { proc: 1 }, procModes: ['crystallization'],
    sources: [{ x: 74, y: 6, mats: [M.SALT], rate: 1, total: 260 }], drains: [],
    goals: [{ x: 82, y: 80, w: 20, h: 12, mat: M.COMPOSITE, need: 40, mode: 'absorb', label: '複合結晶' }],
    build(s) { frame(s); rect(s, 66, 74, 11, 1); rect(s, 77, 74, 1, 18); rect(s, 80, 74, 1, 18); rect(s, 77, 90, 4, 2); fill(s, 78, 74, 2, 16, () => M.ACTIVATOR); cup(s, 82, 80, 20, 12); rect(s, 78, 70, 12, 1); },
    solve(g) { g.lproc('crystallization', 79, 72); },
    eco(g) { g.lproc('crystallization', 79, 72); },
    naive: [{ desc: '装置を床の上に置く', run: (g) => { g.lproc('crystallization', 40, 95); } }],
    limit: 3000,
  },
  {
    id: 'p2', chapter: 'proc', title: '抽出液の循環', learn: '抽出器・回収器・溶媒リサイクル',
    story: '塩水だまりから晶塩を取り出す。抽出液は少ししかない。回収器で取り戻して、何度も使い回そう。',
    hint: '抽出器を塩水だまりの右端（抽出液の筒の上）へ、回収器を晶塩入り抽出液がたまる床の右端へ。回収器の下から出る抽出液を、ポンプで抽出器の下の筒へ戻そう。',
    inv: { proc: 2, pump: 1 }, procModes: ['extraction', 'recovery'],
    sources: [], drains: [],
    goals: [{ x: 77, y: 81, w: 20, h: 12, mat: M.SALT, need: 60, mode: 'absorb', label: '晶塩' }],
    build(s) {
      frame(s);
      rect(s, 2, 70, 42, 1); rect(s, 42, 92, 6, 6); fill(s, 2, 67, 41, 3, () => M.BRINE);
      rect(s, 43, 70, 1, 22); rect(s, 47, 70, 1, 22); rect(s, 43, 92, 5, 1); fill(s, 44, 80, 3, 12, () => M.EXTRACT);
      rect(s, 48, 81, 25, 1);
      rect(s, 76, 81, 1, 17); rect(s, 97, 81, 2, 13); rect(s, 76, 93, 23, 2); rect(s, 70, 84, 1, 14);
    },
    solve(g) { g.lproc('extraction', 45, 68); g.lproc('recovery', 74, 79); g.lapply('pump', 73, 96); g.lapply('pump', 45, 76); },
    eco(g) { g.lproc('extraction', 45, 68); g.lproc('recovery', 74, 79); g.lapply('pump', 73, 96); g.lapply('pump', 45, 76); },
    naive: [
      { desc: '抽出液を戻さない（ポンプなし）', run: (g) => { g.lproc('extraction', 45, 68); g.lproc('recovery', 74, 79); } },
    ],
    limit: 4000,
  },
  {
    id: 'p3', chapter: 'proc', title: '結晶の再生', learn: '結晶再生器',
    story: '使い終わった複合結晶が棚に積もっている。加熱して、晶塩と活性剤に分け直そう。',
    hint: '結晶再生器を棚の右端・屋根の下に置く。左の複合結晶2つから、右へ晶塩、下へ活性剤が出る。',
    inv: { proc: 1 }, procModes: ['regeneration'],
    sources: [], drains: [],
    goals: [{ x: 82, y: 80, w: 20, h: 12, mat: M.SALT, need: 40, mode: 'absorb', label: '晶塩' }],
    build(s) { frame(s); rect(s, 60, 40, 2, 22); for (let k = 0; k <= 15; k++) { rect(s, 62 + k, 60 + k, 2, 1); if (k < 15) fill(s, 62 + k, 48, 1, 12 + k, () => M.COMPOSITE); } cup(s, 82, 80, 20, 12); rect(s, 78, 70, 12, 1); },
    solve(g) { g.lproc('regeneration', 79, 72); },
    eco(g) { g.lproc('regeneration', 79, 72); },
    naive: [{ desc: '装置を棚から離れた床に置く', run: (g) => { g.lproc('regeneration', 40, 95); } }],
    limit: 3000,
  },
];

export const SANDBOX: Level = {
  id: 'sandbox', chapter: 'lab', title: '自由実験室', learn: 'すべて',
  story: 'すべての物質と装置を自由に使える実験台。', hint: 'パレットから物質や装置を選んで描こう。ホイールで拡大、Space+ドラッグで移動。',
  w: 240, h: 150, inv: {}, sources: [], goals: [], drains: [],
  build(s) {
    frame(s);
    if (s.w < 200 || s.h < 150) return; // 小さな実験台には見本を置かない
    // 見本の配置
    rect(s, 20, 100, 2, 46); rect(s, 90, 100, 2, 46); rect(s, 20, 146, 72, 2);
    for (let j = 120; j < 146; j++) for (let i = 22; i < 90; i++) s.set(i, j, M.WATER);
    for (let j = 110; j < 120; j++) for (let i = 22; i < 90; i++) s.set(i, j, M.OIL);
    rect(s, 130, 120, 60, 2); for (let j = 100; j < 120; j++) for (let i = 140; i < 180; i++) s.set(i, j, M.LAVA);
    rect(s, 120, 20, 40, 2);
  },
};

export type { Game };

/** 自由実験室の大きさ（論理セル）：上限は速さのため */
export const LAB_LIMITS = { minW: 80, minH: 50, maxW: 400, maxH: 250 };
export const LAB_PRESETS: { name: string; w: number; h: number }[] = [
  { name: '小', w: 160, h: 100 }, { name: '標準', w: 240, h: 150 }, { name: '横長', w: 360, h: 120 },
  { name: '縦長', w: 140, h: 220 }, { name: '大', w: 320, h: 200 }, { name: '特大', w: 400, h: 250 },
];
export function clampLab(w: number, h: number) {
  const L = LAB_LIMITS;
  return { w: Math.round(Math.max(L.minW, Math.min(L.maxW, w || 240))), h: Math.round(Math.max(L.minH, Math.min(L.maxH, h || 150))) };
}
/** 指定の大きさの自由実験室 */
export function labLevel(w: number, h: number): Level { const c = clampLab(w, h); return { ...SANDBOX, w: c.w, h: c.h }; }
