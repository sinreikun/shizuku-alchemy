// メインスレッド ⇄ シミュレーション Worker のメッセージ
import type { Inventory, Tool, TreeItem } from './game';
import type { MechNode } from './mech';
import type { ProcessMode } from './sim';
import type { ScoreView } from './samples';

export interface NodeView {
  id: number; type: MechNode['type']; parent: number; joint: MechNode['joint']; on: boolean; speed: number; dir: number;
  amp: number; recip: boolean; k: number; x: number; y: number; a: number; tx: number; ty: number; bend: number; fixed: boolean; name: string; w: number; h: number; r: number; bx: number;
}
export interface ProcView { x: number; y: number; size: number; mode: ProcessMode; count: number; status: string; uid: number; name: string; moved: boolean; ports: [number, number][]; rate: number; amt: number[]; roles: string[] }
export interface DeviceView { uid: number; name: string; kind: string; x: number; y: number; power: number }
export interface GameState {
  w: number; h: number; S: number;
  inv: Inventory; invBase: Inventory; progress: number[]; emitted: number[];
  flowing: boolean; won: boolean; ticks: number; canUndo: boolean; canRedo: boolean;
  pendingPump: { x: number; y: number } | null;
  pumps: { ax: number; ay: number; bx: number; by: number; uid: number; name: string; rate: number; r: number }[];
  canTune: boolean;
  devices: DeviceView[]; tree: TreeItem[]; maxAmp: number;
  procs: ProcView[]; nodes: NodeView[];
  cost: number; sourcesLeft: number; brush: number; filterMat: number; stalls: number;
  simMs: number; awake: number; chunks: number;
  hover: { m: number; temp: number } | null;
  /** 自由実験室で読み込んだ見本の id と、挑戦の採点 */
  sampleId: string | null;
  challenge: (ScoreView & { title: string; rule: string }) | null;
}
export type ToWorker =
  | { type: 'init'; levelId: string; sandbox: boolean; seed: number; brush: number; lw?: number; lh?: number }
  | { type: 'frame'; ticks: number; viewMode: 'mat' | 'temp'; now: number; buf: ArrayBuffer; gbuf: ArrayBuffer; hover: [number, number] }
  | { type: 'op'; id: number; op: string; args: unknown[] };
export type FromWorker =
  | { type: 'ready'; state: GameState }
  | { type: 'frame'; buf: ArrayBuffer; gbuf: ArrayBuffer; state: GameState; absorbs: number[]; sparks: number[]; wonNow: boolean }
  | { type: 'opResult'; id: number; result: unknown; state: GameState; error?: string };
export type { Tool };
