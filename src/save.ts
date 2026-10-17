// 保存データ（v5：実験室の大きさ・見本の挑戦記録を含む。旧 v2 は拡大して読み込む）
import type { Game } from './game';
import { M } from './sim';
import { installSample } from './samples';

export const enc = (a: Uint8Array) => { let str = ''; for (let i = 0; i < a.length; i += 8192) str += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(str); };
export const dec = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export function serializeGame(g: Game) {
  const s = g.sim;
  return JSON.stringify({ app: 'shizuku-alchemy', v: 5, sample: g.sample ?? undefined, lw: s.w / g.S, lh: s.h / g.S, w: s.w, h: s.h, t: enc(s.t), aux: enc(s.aux), temp: enc(new Uint8Array(s.temp.buffer.slice(0))), pumps: s.pumps, processors: s.processors, nodes: g.mech.serialize(), devices: g.devices, seq: g.seq, nextUid: g.nextUid });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SaveData = any;
export function parseSave(json: string): SaveData {
  const d = JSON.parse(json);
  if (d.app !== 'shizuku-alchemy') throw new Error('形式が違います');
  return d;
}
/** 同じ（または整数倍の）大きさの盤面へ読み込む */
export function applySave(g: Game, d: SaveData) {
  const s = g.sim;
  let t = dec(d.t), aux = dec(d.aux), temp = new Float32Array(dec(d.temp).buffer);
  let k = 1;
  if (d.w !== s.w || d.h !== s.h) {
    k = s.w / d.w;
    if (!Number.isInteger(k) || d.h * k !== s.h) throw new Error('大きさが合いません');
    // 旧版（低解像度）の保存データを最近傍で拡大
    const nt = new Uint8Array(s.n), na = new Uint8Array(s.n), ntp = new Float32Array(s.n);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const j = ((y / k) | 0) * d.w + ((x / k) | 0), i = y * s.w + x; nt[i] = t[j]; na[i] = aux[j]; ntp[i] = temp[j]; }
    t = nt; aux = na; temp = ntp;
  }
  // 可動壁セルは機構から描き直すので一旦消す
  for (let i = 0; i < t.length; i++) if (t[i] === M.MOVER) t[i] = M.EMPTY;
  g.pushUndo();
  s.t.set(t); s.aux.set(aux); s.temp.set(temp);
  s.pumps = (d.pumps ?? []).map((p: { ax: number; ay: number; bx: number; by: number; rate: number; r?: number }) => ({ ...p, ax: p.ax * k, ay: p.ay * k, bx: p.bx * k, by: p.by * k, rate: p.rate * k, r: (p.r ?? 2) * k, moved: 0 }));
  s.processors = (d.processors ?? []).map((p: object) => ({ ...p }));
  g.devices = (d.devices ?? []).map((v: { x: number; y: number }) => ({ ...v, x: v.x * k, y: v.y * k }));
  // v0.6 の消滅穴（物）は消滅穴セルに変換する
  g.importVoids(d.voids ?? [], k);
  g.mech.load(d.nodes ?? []);
  // v4：名前の通し番号。旧版は名前を付け直す
  g.seq = { ...(d.seq ?? {}) }; g.nextUid = d.nextUid ?? 1;
  if (!d.seq) for (const n of g.mech.nodes) delete n.name;
  g.ensureNames();
  // 見本の挑戦の記録
  if (d.sample?.id) installSample(g, d.sample.id, d.sample.mem); else { g.sample = undefined; g.afterTick = undefined; }
  s.wakeAll();
}
