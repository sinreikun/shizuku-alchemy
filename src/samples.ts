// 自由実験室の「見本」：盤面を作る関数と、挑戦の採点。読み込みは v5 の保存データ経由（worker の sampleSave）
import { M, MATS, KIND } from './sim';
import { Game, type Painter } from './game';
import { labLevel } from './levels';

export type SampleCat = 'challenge' | 'demo' | 'toy';
export const SAMPLE_CATS: { id: SampleCat; name: string }[] = [
  { id: 'challenge', name: '挑戦' }, { id: 'demo', name: 'しくみの見本' }, { id: 'toy', name: 'おもちゃ箱' },
];
export interface ScorePart { label: string; value: number; color: string }
export interface ScoreView { value: number; unit: string; text: string; parts: ScorePart[]; invalid?: string }
export interface Challenge {
  rule: string;
  /** 開始時の記録（保存データに入る） */
  init(g: Game): Record<string, number>;
  /** 10 ティックごとに呼ぶ（決定的）。mem を書き換えてよい */
  track?(g: Game, mem: Record<string, number>): void;
  score(g: Game, mem: Record<string, number>): ScoreView;
}
export interface Sample {
  id: string; cat: SampleCat; title: string; desc: string; w: number; h: number;
  build(p: Painter): void;
  setup?(g: Game): void;
  challenge?: Challenge;
}
export const SAMPLE_SEED = 20261017;

// ---------- 描画の小道具（論理セル） ----------
type P = Painter;
const rect = (s: P, x: number, y: number, w: number, h: number, m: number = M.WALL) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) s.set(i, j, m); };
const frame = (s: P) => { rect(s, 0, 0, s.w, 1); rect(s, 0, s.h - 2, s.w, 2); rect(s, 0, 0, 1, s.h); rect(s, s.w - 1, 0, 1, s.h); };
/** 内のりが (x,y,w,h) の器（左右と底に厚さ th の壁） */
const cup = (s: P, x: number, y: number, w: number, h: number, m: number = M.WALL, th = 2) => { rect(s, x - th, y, th, h + th, m); rect(s, x + w, y, th, h + th, m); rect(s, x - th, y + h, w + 2 * th, th, m); };
const fillM = (s: P, x: number, y: number, w: number, h: number, m: number) => s.fillReal(x, y, w, h, () => m);
/** 太さ th の線（論理セル） */
const line = (s: P, x0: number, y0: number, x1: number, y1: number, th = 2, m: number = M.WALL) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) { const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n); rect(s, x, y, th, th, m); }
};
/** すき間のない空気（酸素23%・窒素77%） */
const denseAir = (s: P) => () => (s.rnd01() < 0.23 ? M.OXYGEN : M.NITROGEN);
const air = (s: P) => () => { const r = s.rnd01(); return r < 0.5 ? (r < 0.5 * 0.23 ? M.OXYGEN : M.NITROGEN) : M.EMPTY; };
const pump = (g: Game, ax: number, ay: number, bx: number, by: number, rate?: number, r?: number) => {
  g.lapply('pump', ax, ay); g.lapply('pump', bx, by);
  const p = g.sim.pumps[g.sim.pumps.length - 1]; if (rate || r) g.setPump(p.uid!, rate, r);
};
/** ポートを論理座標の位置へ */
const portAt = (g: Game, uid: number, port: 'in' | 'out' | 'aux', lx: number, ly: number) => {
  const p = g.sim.processors.find((q) => q.uid === uid)!; g.setPort(uid, port, lx * g.S - p.x, ly * g.S - p.y);
};
const dev = (g: Game, kind: 'heater' | 'cooler' | 'igniter' | 'electro', x: number, y: number, power?: number) => {
  g.lapply(kind, x, y); if (power !== undefined) g.setDevicePower(g.devices[g.devices.length - 1].uid!, power);
};

// ---------- 数える ----------
const count = (g: Game, m: number, r?: [number, number, number, number]) => {
  const s = g.sim; let c = 0;
  if (!r) { for (let i = 0; i < s.n; i++) if (s.t[i] === m) c++; return c; }
  const S = g.S; for (let y = r[1] * S; y < (r[1] + r[3]) * S; y++) for (let x = r[0] * S; x < (r[0] + r[2]) * S; x++) if (s.t[y * s.w + x] === m) c++;
  return c;
};
const hex = (m: number) => '#' + MATS[m].color.map((v) => v.toString(16).padStart(2, '0')).join('');

/** 分離の挑戦で使う液体（室温で安定なもの。溶岩は固まるので除く） */
export const SEP_LIQUIDS = [M.WATER, M.OIL, M.MERCURY, M.BRINE, M.SOLVENT, M.EXTRACT, M.LOADED];

/**
 * 分離の採点：液体セルを上下左右でつながった「池」に分ける（壁・空気・粉で隔たれば別の池）。
 * 各液体について「その液体が一番多い池」のうち、量×純度が最大のものを取り、最初の量で割る。
 * 7種の平均×100 が得点。層に分かれても同じ容器なら1つの池なので、別々の容器に移す必要がある。
 */
export function separationScore(g: Game, init: Record<string, number>, liquids = SEP_LIQUIDS): { score: number; per: number[] } {
  const s = g.sim, { t, w, h } = s, n = s.n;
  const idx = new Int8Array(64).fill(-1); liquids.forEach((m, k) => { idx[m] = k; });
  const lab = new Int32Array(n).fill(-1); const stack = new Int32Array(n);
  const best = new Float64Array(liquids.length);
  const cnt = new Float64Array(liquids.length);
  for (let i0 = 0; i0 < n; i0++) {
    if (lab[i0] >= 0 || KIND[t[i0]] !== 2) continue;
    cnt.fill(0); let size = 0, sp = 0; stack[sp++] = i0; lab[i0] = i0;
    while (sp) {
      const i = stack[--sp]; size++; const k = idx[t[i]]; if (k >= 0) cnt[k]++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && lab[i - 1] < 0 && KIND[t[i - 1]] === 2) { lab[i - 1] = i0; stack[sp++] = i - 1; }
      if (x < w - 1 && lab[i + 1] < 0 && KIND[t[i + 1]] === 2) { lab[i + 1] = i0; stack[sp++] = i + 1; }
      if (y > 0 && lab[i - w] < 0 && KIND[t[i - w]] === 2) { lab[i - w] = i0; stack[sp++] = i - w; }
      if (y < h - 1 && lab[i + w] < 0 && KIND[t[i + w]] === 2) { lab[i + w] = i0; stack[sp++] = i + w; }
    }
    let d = 0; for (let k = 1; k < liquids.length; k++) if (cnt[k] > cnt[d]) d = k;
    if (!cnt[d]) continue;
    const v = cnt[d] * (cnt[d] / size);
    if (v > best[d]) best[d] = v;
  }
  const per = liquids.map((m, k) => Math.min(1, best[k] / Math.max(1, init['m' + m] ?? 1)));
  return { score: (per.reduce((a, b) => a + b, 0) / liquids.length) * 100, per };
}

const separation: Challenge = {
  rule: '循環装置（電解槽など）は使わずに、7種の液体をできるだけ別々の器に分ける。層に分かれただけでは同じ池として数える。物質を描き足すと記録無効。',
  init(g) { const o: Record<string, number> = {}; for (const m of SEP_LIQUIDS) o['m' + m] = count(g, m); return o; },
  score(g, mem) {
    const { score, per } = separationScore(g, mem);
    let invalid: string | undefined;
    if (g.sim.processors.length) invalid = '循環装置を使っている';
    for (const m of SEP_LIQUIDS) if (count(g, m) > mem['m' + m] * 1.02 + 8) invalid = `${MATS[m].name}が増えている（描き足し）`;
    return { value: Math.round(score * 10) / 10, unit: '点', text: '分離度', parts: SEP_LIQUIDS.map((m, k) => ({ label: MATS[m].name, value: per[k], color: hex(m) })), invalid };
  },
};

// 溶岩：村の範囲（論理セル）
const VILLAGE: [number, number, number, number] = [196, 112, 42, 34];
const lavaGuard: Challenge = {
  rule: '火口の栓を消すとあふれる溶岩を、右下の村（家の並ぶ平地）に届く前に岩へ変える。岩になった溶岩の割合が得点。村に溶岩や岩が入ると減点。',
  init(g) { return { lava: count(g, M.LAVA), rock: count(g, M.ROCK), hit: 0 }; },
  track(g, mem) { const v = count(g, M.LAVA, VILLAGE) + count(g, M.ROCK, VILLAGE); if (v > mem.hit) mem.hit = v; },
  score(g, mem) {
    const rock = Math.max(0, count(g, M.ROCK) - mem.rock), lava = count(g, M.LAVA);
    const cooled = Math.min(1, rock / Math.max(1, mem.lava));
    const zone = VILLAGE[2] * VILLAGE[3] * g.S * g.S;
    const safe = Math.max(0, 1 - mem.hit / (zone * 0.4));
    return { value: Math.round(cooled * safe * 1000) / 10, unit: '点', text: '村の安全', invalid: undefined,
      parts: [{ label: '岩にした', value: cooled, color: hex(M.ROCK) }, { label: '残る溶岩', value: Math.min(1, lava / Math.max(1, mem.lava)), color: hex(M.LAVA) }, { label: '村の無事', value: safe, color: '#9dffb8' }] };
  },
};

const saltField: Challenge = {
  rule: '装置（ヒーター・クーラー・着火器・電解板）とポンプは合わせて3つまで、循環装置なし。最初の塩水の量に対する晶塩の割合が得点。蒸気が雨になって晶塩に落ちると、また溶けてしまう。',
  init(g) { return { brine: count(g, M.BRINE) + count(g, M.SALT) }; },
  score(g, mem) {
    const salt = count(g, M.SALT), brine = count(g, M.BRINE);
    let invalid: string | undefined;
    const used = g.devices.filter((d) => d.kind !== 'proc').length + g.sim.pumps.length;
    if (used > 3) invalid = `装置とポンプが${used}つ（3つまで）`;
    if (g.sim.processors.length) invalid = '循環装置を使っている';
    if (salt + brine > mem.brine * 1.02 + 8) invalid = '晶塩か塩水を描き足している';
    return { value: Math.round((salt / mem.brine) * 1000) / 10, unit: '点', text: '晶塩の収穫', invalid,
      parts: [{ label: '晶塩', value: salt / mem.brine, color: hex(M.SALT) }, { label: '塩水', value: brine / mem.brine, color: hex(M.BRINE) }] };
  },
};

const eternalFlame: Challenge = {
  rule: '密閉した炉の油を、できるだけ長く燃やす。炎が燃えていた時間の合計（ゲーム内の秒、60ティック＝1秒）が記録。床にこぼれた油を戻したり、しずくを細くしたり、酸素を作ったり。油や空気を描き足すと記録無効（電解板で水から酸素を作るのはよい）。',
  init(g) { const oil = count(g, M.OIL); return { oil, lo: oil, n2: count(g, M.NITROGEN), run: 0, best: 0, total: 0 }; },
  track(g, mem) {
    const f = count(g, M.FIRE), oil = count(g, M.OIL);
    if (oil < (mem.lo ?? mem.oil)) mem.lo = oil; // 油は増えないので、最小値より増えたら描き足し
    if (f >= 3) { mem.run += 10; mem.total += 10; if (mem.run > mem.best) mem.best = mem.run; } else mem.run = 0;
  },
  score(g, mem) {
    let invalid: string | undefined;
    if (count(g, M.OIL) > (mem.lo ?? mem.oil) + 8) invalid = '油を描き足している';
    if (count(g, M.NITROGEN) > mem.n2 * 1.02 + 8) invalid = '空気を描き足している';
    const oil = count(g, M.OIL), o2 = count(g, M.OXYGEN);
    return { value: Math.round(mem.total / 6) / 10, unit: '秒', text: `燃えた時間（連続の最長 ${(mem.best / 60).toFixed(1)} 秒）`, invalid,
      parts: [{ label: '残りの油', value: oil / Math.max(1, mem.oil), color: hex(M.OIL) }, { label: '酸素', value: Math.min(1, o2 / Math.max(1, mem.n2 * 0.3)), color: hex(M.OXYGEN) }] };
  },
};

// ---------- 見本の一覧 ----------
export const SAMPLES: Sample[] = [
  // ===== 挑戦 =====
  {
    id: 'sep7', cat: 'challenge', title: '七つの液体を分けろ', w: 320, h: 200,
    desc: '水・油・水銀・塩水・揮発溶媒・抽出液・晶塩入り抽出液が混ざった大きな槽。循環装置なしで、別々の器にどこまで分けられるか。',
    build(s) {
      frame(s);
      cup(s, 120, 24, 80, 44); rect(s, 150, 70, 20, 30); // 槽と支柱
      const pick = () => SEP_LIQUIDS[(s.rnd01() * SEP_LIQUIDS.length) | 0];
      s.fillReal(120, 24, 80, 44, pick);
      for (let k = 0; k < 7; k++) cup(s, 14 + k * 43, 170, 34, 26);
    },
    challenge: separation,
  },
  {
    id: 'lava', cat: 'challenge', title: '溶岩から村を守れ', w: 240, h: 150,
    desc: '火口の栓（右下の壁）を消すと、溶岩が斜面を下って村へ向かう。上の湖の水やクーラー、壁で備えてから栓を抜き、村に届く前に岩へ変えよう。',
    build(s) {
      frame(s);
      // 火口（左上）と斜面
      rect(s, 1, 56, 70, 4); rect(s, 1, 14, 4, 46); rect(s, 56, 14, 4, 40); rect(s, 56, 54, 4, 2, M.PWALL); fillM(s, 5, 22, 51, 34, M.LAVA);
      for (let x = 60; x < 239; x++) { const y = Math.round(56 + (x - 60) * 0.5); if (y < 146) rect(s, x, y, 1, 146 - y + 2); }
      // 村（平地と家）
      rect(s, 192, 146, 46, 2);
      for (const hx of [200, 214, 228]) { rect(s, hx, 140, 6, 6, M.PWALL); rect(s, hx + 1, 138, 4, 2, M.PWALL); }
      // 湖（右上）
      cup(s, 150, 18, 84, 16); fillM(s, 150, 18, 84, 16, M.WATER);
    },
    setup(g) { dev(g, 'heater', 30, 52, 1175); },
    challenge: lavaGuard,
  },
  {
    id: 'salt', cat: 'challenge', title: '塩田：晶塩をたくさん作れ', w: 240, h: 150,
    desc: '塩水の池から晶塩を取り出そう。使える装置とポンプは合わせて3つ。池ごと温めても、底にできた晶塩が熱をさえぎってしまう。煮詰めるか、それとも別の方法か。',
    build(s) {
      frame(s);
      cup(s, 10, 110, 110, 34); fillM(s, 10, 116, 110, 28, M.BRINE);
      rect(s, 140, 120, 90, 2); rect(s, 0, 30, 6, 2);
    },
    challenge: saltField,
  },
  {
    id: 'flame', cat: 'challenge', title: '消えない炎', w: 160, h: 100,
    desc: '密閉した炉の中で、油のしずくが着火器に落ちて燃える。このままでは油はすぐに落ち切り、燃え残りは床に流れてしまう。燃えるほど酸素も減る。ポンプや電解板、仕切りを工夫して、炎をできるだけ長く燃やし続けよう。',
    build(s) {
      frame(s);
      rect(s, 8, 38, 144, 2); rect(s, 8, 38, 2, 60); rect(s, 150, 38, 2, 60); // 炉
      cup(s, 56, 42, 48, 10); fillM(s, 56, 42, 48, 10, M.OIL); // 油のタンク（底に細い穴：setup で1セル分あける）
      cup(s, 112, 82, 32, 14); fillM(s, 112, 84, 32, 12, M.WATER);
      s.fillReal(10, 40, 140, 56, denseAir(s));
    },
    setup(g) { for (let y = 52 * g.S; y < 54 * g.S; y++) g.sim.set(80 * g.S, y, M.EMPTY); g.lapply('igniter', 80, 72); },
    challenge: eternalFlame,
  },



  // ===== しくみの見本 =====
  {
    id: 'tower', cat: 'demo', title: '密度の塔', w: 140, h: 220,
    desc: 'ふたをした筒の中で、混ぜた液体・砂・気体が重いものから順に沈んで層になる。水銀が一番下、水素が一番上。',
    build(s) {
      frame(s);
      cup(s, 50, 20, 40, 190); rect(s, 48, 18, 44, 2);
      const mats = [M.WATER, M.OIL, M.MERCURY, M.BRINE, M.SOLVENT, M.EXTRACT, M.LOADED, M.SAND, M.HYDROGEN, M.CO2, M.OXYGEN];
      s.fillReal(50, 20, 40, 190, () => mats[(s.rnd01() * mats.length) | 0]);
    },
  },
  {
    id: 'cycle', cat: 'demo', title: '水の循環', w: 240, h: 150,
    desc: '海の底のヒーターが水を温めて蒸気にする。山の上のクーラーで雲が雨になり、川となって海へ戻る。',
    build(s) {
      frame(s);
      rect(s, 1, 140, 238, 8); fillM(s, 1, 118, 130, 22, M.WATER);
      for (let x = 130; x < 239; x++) { const y = Math.round(140 - Math.min(80, (x - 130) * 1.2)); rect(s, x, y, 1, 140 - y); }
    },
    setup(g) { for (const x of [40, 95]) dev(g, 'heater', x, 136, 160); for (const x of [150, 175, 200, 225]) dev(g, 'cooler', x, 6, 0); },
  },
  {
    id: 'lavasea', cat: 'demo', title: '溶岩と海', w: 240, h: 150,
    desc: '火口から流れ落ちる溶岩が海に触れて急に冷え、岩の島と大量の湯気ができる。',
    build(s) {
      frame(s);
      rect(s, 1, 50, 70, 4); rect(s, 1, 14, 4, 40); rect(s, 64, 34, 4, 16); fillM(s, 5, 20, 59, 30, M.LAVA);
      line(s, 68, 52, 110, 108, 3);
      fillM(s, 1, 116, 238, 30, M.WATER);
    },
    setup(g) { dev(g, 'heater', 30, 46, 1175); },
  },
  {
    id: 'h2', cat: 'demo', title: '水素循環工場', w: 240, h: 150,
    desc: '電解槽が水を水素と酸素に分け、燃焼器で燃やして蒸気に、凝縮器で水に戻して池へ。循環装置3台がポートでつながった、水が減らない工場。',
    build(s) {
      frame(s);
      cup(s, 20, 110, 90, 34); fillM(s, 20, 118, 90, 26, M.WATER);
      rect(s, 140, 70, 60, 2); rect(s, 40, 80, 40, 2);
    },
    setup(g) {
      g.lproc('electrolysis', 60, 136); const el = g.sim.processors[0];
      g.lproc('combustion', 60, 60); const fl = g.sim.processors[1];
      g.lproc('condensation', 170, 62); const cd = g.sim.processors[2];
      portAt(g, el.uid!, 'out', 52, 74); portAt(g, el.uid!, 'aux', 68, 74);
      portAt(g, fl.uid!, 'in', 52, 74); portAt(g, fl.uid!, 'aux', 68, 74); portAt(g, fl.uid!, 'out', 120, 50);
      portAt(g, cd.uid!, 'in', 120, 50); portAt(g, cd.uid!, 'out', 100, 100); g.setProcRate(cd.uid!, 2);
    },
  },

  {
    id: 'recycle', cat: 'demo', title: '晶塩リサイクル工場', w: 240, h: 150,
    desc: '抽出器が塩水から晶塩を抜き取り、晶塩入り抽出液は坂を流れて回収器へ。晶塩は箱に落ち、抽出液は筒に戻って何度も使われる。',
    build(s) {
      frame(s);
      cup(s, 10, 40, 80, 20); fillM(s, 10, 44, 80, 16, M.BRINE);
      cup(s, 92, 40, 8, 40); fillM(s, 92, 56, 8, 24, M.EXTRACT);
      line(s, 104, 68, 160, 88, 2); cup(s, 160, 80, 14, 10);
      cup(s, 180, 120, 50, 22);
    },
    setup(g) {
      g.lproc('extraction', 96, 34); const ex = g.sim.processors[0];
      portAt(g, ex.uid!, 'in', 86, 50); portAt(g, ex.uid!, 'aux', 96, 74); portAt(g, ex.uid!, 'out', 108, 62);
      g.lproc('recovery', 190, 96); const rc = g.sim.processors[1];
      portAt(g, rc.uid!, 'in', 167, 87); portAt(g, rc.uid!, 'out', 205, 112); portAt(g, rc.uid!, 'aux', 96, 44);
    },
  },

  {
    id: 'goldberg', cat: 'demo', title: 'からくり装置', w: 240, h: 150,
    desc: 'ピストンが水門を上げ下げして水を少しずつ流し、落ちた水を水車がはじき、坂を流れた水をばねの腕がはらって箱へ。ポンプが水を上の槽へ戻して、ずっと動き続けるからくり。',
    build(s) {
      frame(s);
      rect(s, 4, 26, 2, 26); rect(s, 4, 50, 62, 2); fillM(s, 6, 30, 44, 20, M.WATER); // 上の槽と棚（右は水門）
      line(s, 30, 90, 172, 112, 2); rect(s, 30, 84, 2, 6);           // 坂（水車の下で受ける）
      for (const [x, y] of [[183, 98], [201, 115]]) rect(s, x, y, 2, 2, M.GUIDE); // ばね腕の杭
      cup(s, 160, 124, 72, 20);                                       // 終点の箱
    },
    setup(g) {
      // 水門：上向きのピストンの根元に縦の板
      const p = g.lpiston(51, 38, 51, 20)!; g.editNode(p.id, { speed: 0.2 });
      g.lplate(51, 27, 51, 49);
      // 水車（棚の先の下）
      const w = g.lrotor(70, 70)!; for (const [dx, dy] of [[12, 0], [0, 12], [-12, 0], [0, -12]]) g.lplate(70, 70, 70 + dx, 70 + dy);
      g.editNode(w.id, { speed: 0.9 });
      // ばね腕（2枚つなぎ、先がばね）
      const r = g.lrotor(184, 116)!; g.lplate(184, 116, 174, 116); const b = g.lplate(175, 116, 166, 116)!;
      g.editNode(r.id, { speed: 0.6, dir: -1 }); g.editNode(b.id, { joint: 'spring' });
      pump(g, 220, 141, 25, 30, 4, 4);
    },
  },




  {
    id: 'spring', cat: 'demo', title: 'しなる腕', w: 200, h: 125,
    desc: '左の腕は先が「ばね」関節、右の腕は「固定」。杭に当たると、ばねの腕はしなってかわし回り続けるが、固定の腕は引っかかって止まる。上から落ちる砂をはじく様子も見比べよう。',
    build(s) {
      frame(s);
      cup(s, 40, 4, 120, 16); fillM(s, 40, 4, 120, 16, M.SAND);
      for (const [x, y] of [[59, 35], [139, 35]]) rect(s, x, y, 2, 2, M.GUIDE);
      cup(s, 10, 100, 180, 20);
    },
    setup(g) {
      for (const x of [60, 140]) for (let y = 20 * g.S; y < 22 * g.S; y++) g.sim.set(x * g.S, y, M.EMPTY); // 砂の細い穴
      for (const [cx, fixed] of [[60, false], [140, true]] as const) {
        const r = g.lrotor(cx, 60)!; g.lplate(cx, 60, cx + 12, 60); const b = g.lplate(cx + 11, 60, cx + 26, 60)!;
        g.editNode(r.id, { speed: 0.7, dir: -1 }); if (!fixed) g.editNode(b.id, { joint: 'spring' });
        g.lplate(cx, 60, cx - 12, 60);
      }
    },
  },


  {
    id: 'pumps', cat: 'demo', title: 'ポンプの水路網', w: 240, h: 150,
    desc: 'ポンプで上の槽へ運ばれた水と油が、底の穴から滝になって坂を流れ、真ん中の槽から下の槽へ戻る。ポンプを選ぶと流量と吸い込み半径を変えられる。',
    build(s) {
      frame(s);
      cup(s, 10, 110, 50, 30); fillM(s, 10, 118, 50, 22, M.WATER);
      cup(s, 180, 110, 50, 30); fillM(s, 180, 120, 50, 20, M.OIL);
      cup(s, 10, 30, 50, 24); rect(s, 52, 54, 6, 2, M.EMPTY); cup(s, 180, 30, 50, 24); rect(s, 182, 54, 6, 2, M.EMPTY);
      line(s, 46, 62, 116, 80, 2); line(s, 194, 62, 124, 80, 2); cup(s, 100, 90, 40, 20); fillM(s, 100, 100, 40, 10, M.EXTRACT);
    },
    setup(g) {
      pump(g, 35, 136, 30, 26, 5, 4); pump(g, 205, 136, 210, 26, 5, 4);
      pump(g, 112, 106, 30, 104, 5, 4); pump(g, 128, 106, 210, 104, 5, 4);
    },
  },


  // ===== おもちゃ箱 =====
  {
    id: 'bench', cat: 'toy', title: '道具つきの実験台', w: 240, h: 150,
    desc: '空のビーカー、漏斗、棚、ヒーター台とクーラー台が並んだ実験台。好きな物質を描いて遊ぶ出発点に。',
    build(s) {
      frame(s);
      for (let k = 0; k < 5; k++) cup(s, 12 + k * 30, 120, 20, 24);
      line(s, 170, 60, 186, 76, 2); line(s, 216, 60, 200, 76, 2); rect(s, 186, 76, 2, 10); rect(s, 198, 76, 2, 10); // 漏斗
      cup(s, 180, 120, 26, 24);
      rect(s, 20, 50, 60, 2); rect(s, 100, 34, 50, 2); // 棚
    },
    setup(g) { g.lapply('heater', 22, 140); g.lapply('cooler', 52, 140); g.lapply('igniter', 82, 140); g.lapply('electro', 112, 140); },
  },
  {
    id: 'volcano', cat: 'toy', title: '火山', w: 240, h: 150,
    desc: '地下のマグマだまりから、ポンプが溶岩を山頂へ噴き上げる。山肌を流れ下った溶岩はふもとの海で急に冷えて岩になり、湯気が立ちのぼる。',
    build(s) {
      frame(s);
      for (let x = 50; x < 190; x++) { const top = Math.round(60 + Math.abs(x - 120) * 1.0); if (top < 146) rect(s, x, top, 1, 146 - top); }
      rect(s, 90, 120, 60, 22, M.EMPTY); fillM(s, 90, 120, 60, 22, M.LAVA); // マグマだまり
      fillM(s, 1, 128, 60, 18, M.WATER); fillM(s, 180, 128, 59, 18, M.WATER);
    },
    setup(g) { for (const x of [100, 120, 140]) dev(g, 'heater', x, 139, 1175); pump(g, 110, 134, 120, 54, 4, 6); },
  },

  {
    id: 'falls', cat: 'toy', title: '滝と水車', w: 240, h: 150,
    desc: '崖の上の池から落ちる滝が段々を流れ下り、回る水車がしぶきを跳ね上げる。滝つぼの水はポンプで崖の上へ戻る。',
    build(s) {
      frame(s);
      rect(s, 1, 40, 60, 106); cup(s, 3, 22, 50, 16); rect(s, 53, 22, 2, 16, M.EMPTY); rect(s, 53, 34, 8, 4);
      fillM(s, 3, 24, 50, 14, M.WATER);
      rect(s, 60, 66, 30, 3); rect(s, 96, 90, 30, 3);
      cup(s, 63, 126, 173, 18); fillM(s, 63, 132, 173, 12, M.WATER);
    },
    setup(g) {
      const r = g.lrotor(140, 112)!; for (const [dx, dy] of [[12, 0], [0, 12], [-12, 0], [0, -12]]) g.lplate(140, 112, 140 + dx, 112 + dy);
      g.editNode(r.id, { speed: 0.8 });
      pump(g, 200, 140, 20, 26, 8, 4);
    },
  },

  {
    id: 'chem', cat: 'toy', title: '化学セット', w: 240, h: 150,
    desc: '6つの器で、溶解・蒸発・燃焼（ふたをした瓶の中で、酸素がなくなると消える）・電気分解・結晶化・蒸留がいっせいに始まる。右の蒸留器では、温めた溶媒の蒸気が管を通って冷えた受け器にたまる。',
    build(s) {
      frame(s);
      for (let k = 0; k < 5; k++) cup(s, 8 + k * 33, 110, 24, 34);
      fillM(s, 8, 124, 24, 20, M.WATER); fillM(s, 12, 98, 16, 10, M.SALT);   // 1 溶解：水に晶塩
      fillM(s, 41, 120, 24, 20, M.BRINE);                                   // 2 蒸発：塩水＋ヒーター
      fillM(s, 74, 126, 24, 18, M.OIL); rect(s, 72, 108, 28, 2); s.fillReal(74, 110, 24, 16, denseAir(s)); // 3 燃焼：ふたをした瓶の中の油＋空気＋着火器
      fillM(s, 107, 118, 24, 26, M.WATER);                                  // 4 電気分解
      fillM(s, 140, 122, 24, 22, M.BRINE); fillM(s, 144, 96, 16, 8, M.ACTIVATOR); // 5 結晶化：活性剤が塩水に落ちる
      // 6 蒸留：ふたをしたフラスコ → 管 → 受け器
      cup(s, 176, 116, 20, 28); rect(s, 174, 114, 24, 2); rect(s, 190, 114, 4, 2, M.EMPTY);
      rect(s, 188, 92, 2, 22); rect(s, 194, 98, 2, 16); rect(s, 188, 90, 34, 2); rect(s, 194, 98, 22, 2);
      rect(s, 220, 90, 2, 30); cup(s, 208, 120, 22, 24); rect(s, 214, 98, 2, 22); rect(s, 216, 120, 4, 2, M.EMPTY); rect(s, 216, 118, 4, 2, M.EMPTY);
      fillM(s, 176, 126, 20, 18, M.SOLVENT);
    },
    setup(g) {
      dev(g, 'heater', 53, 140, 400);
      dev(g, 'igniter', 86, 125);
      dev(g, 'electro', 119, 140, 40);
      dev(g, 'heater', 186, 140, 120); dev(g, 'cooler', 218, 96, 5);
    },
  },

];

export const sampleById = (id: string) => SAMPLES.find((s) => s.id === id);

/** 見本の盤面を新しく作る（決定的） */
export function buildSample(id: string, seed = SAMPLE_SEED, scale?: number): Game {
  const sm = sampleById(id); if (!sm) throw new Error('見本がありません: ' + id);
  const base = labLevel(sm.w, sm.h);
  const lv = { ...base, build: sm.build };
  const g = new Game(lv, true, seed, scale);
  sm.setup?.(g);
  g.mech.computePoses(); g.mech.rasterize();
  g.level = base; // 以後のリセットは普通の実験台
  installSample(g, id);
  return g;
}

/**
 * 見本の「流し直し」：見本の物質を最初の状態に戻し、自分で置いた壁・膜・装置・機構・ポンプは残す。
 * 壁や装置のセル（今か最初のどちらか）は今の盤面を使う（消した岩盤は消えたまま）。それ以外は最初の見本から。
 */
export function resetSampleInPlace(g: Game) {
  if (!g.sample) return false;
  const f = buildSample(g.sample.id, SAMPLE_SEED, g.S);
  if (f.sim.w !== g.sim.w || f.sim.h !== g.sim.h) return false;
  g.pushUndo();
  const a = g.sim, b = f.sim;
  const keep = (m: number) => KIND[m] === 1 && m !== M.MOVER || KIND[m] === 5;
  const nodes = g.mech.serialize().map((n) => ({ ...n, angle: 0, ext: 0, bend: 0, bendV: 0 }));
  for (let i = 0; i < a.n; i++) {
    if (a.t[i] === M.MOVER) a.t[i] = M.EMPTY;
    if (keep(a.t[i]) || keep(b.t[i])) { if (!keep(a.t[i])) { a.t[i] = M.EMPTY; a.temp[i] = a.ambient; a.aux[i] = 0; } continue; }
    a.t[i] = b.t[i]; a.temp[i] = b.temp[i]; a.aux[i] = b.aux[i];
  }
  for (const p of a.pumps) p.moved = 0;
  for (const p of a.processors) p.count = 0;
  g.mech.load(nodes);
  a.stats = { burned: 0, dissolved: 0, crystallized: 0, split: 0, synthesized: 0, regenerated: 0, extracted: 0, recovered: 0 };
  g.ticks = 0; a.wakeAll();
  installSample(g, g.sample.id, f.sample!.mem);
  return true;
}

/** 挑戦の採点を盤面に付ける（mem を渡せば保存データから復元） */
export function installSample(g: Game, id: string, mem?: Record<string, number>) {
  const sm = sampleById(id); if (!sm) return;
  g.sample = { id, mem: mem ? { ...mem } : sm.challenge ? sm.challenge.init(g) : {} };
  const ch = sm.challenge;
  g.afterTick = ch?.track ? () => { if (g.ticks % 10 === 0 && g.sample?.id === id) ch.track!(g, g.sample.mem); } : undefined;
}
export function sampleScore(g: Game): (ScoreView & { title: string; rule: string }) | null {
  if (!g.sample) return null; const sm = sampleById(g.sample.id); if (!sm?.challenge) return null;
  return { ...sm.challenge.score(g, g.sample.mem), title: sm.title, rule: sm.challenge.rule };
}
void rect;
