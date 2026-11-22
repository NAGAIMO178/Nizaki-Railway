// 運転整理(ダイヤ整理案)の、利用者の端末側の入口。
// 管理者の端末が1回だけ動かして保存した結果(短い形)を、GAS から読み、元のダイヤに重ねて見せる。この端末では、エンジンは動かさない。
//  - トグルが OFF・取得に失敗・保存された結果が無い・結果の日が違う のときは、何も重ねない(いまのダイヤのまま)。
//  - 画面(発車案内・列車位置)は、ダイヤの行(TrainRow)を、ここの rearrangeView を通して読む。入口は、ここ1か所。
import { callGas } from './accountApi';
import { buildData, fromCompact, type CompactResult } from './rearrange';
import type { TrainRow } from './diaTimetable';
import { isTkLaunched, TK_CODE } from './tkLine';
import { serviceDayKey, serviceDayStartOf } from './serviceDay';

type Raw = Record<string, unknown>;

// GAS に保存する形: 短い形の結果と、それを作った、ダイヤの日(別の日の結果を、重ねないため)
export interface RearrangeSaved {
  compact: CompactResult;
  day: string;
}

export const currentServiceDay = (nowMs: number = Date.now()): string => serviceDayKey(serviceDayStartOf(nowMs));

const isTriple = (x: unknown): x is [unknown, unknown, unknown] => Array.isArray(x) && x.length === 3;

// GAS から受け取った中身が、読める形かを確かめる(読めなければ null。画面は、いまのダイヤのまま)
export const parseSaved = (raw: unknown): RearrangeSaved | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const c = r.compact as Raw | undefined;
  if (!c || typeof c !== 'object' || c.v !== 1 || typeof r.day !== 'string') return null;
  if (!Array.isArray(c.cancelled) || !c.cancelled.every((s) => typeof s === 'string')) return null;
  if (!Array.isArray(c.pass) || !c.pass.every((p) => isTriple(p) && typeof p[0] === 'string' && typeof p[1] === 'string' && typeof p[2] === 'number')) return null;
  if (!Array.isArray(c.hold) || !c.hold.every((p) => isTriple(p) && typeof p[0] === 'string' && typeof p[1] === 'number' && typeof p[2] === 'number')) return null;
  if (!Array.isArray(c.trains)) return null;
  for (const t of c.trains as Raw[]) {
    if (!t || typeof t.no !== 'string') return null;
    if (t.o !== undefined && typeof t.o !== 'number') return null;
    if (t.d !== undefined && typeof t.d !== 'number') return null;
    if (t.x !== undefined && !(Array.isArray(t.x) && t.x.every((p) => isTriple(p) && p.every((n) => typeof n === 'number')))) return null;
  }
  return { compact: c as unknown as CompactResult, day: r.day };
};

// ---------- 取得(トグルと結果) ----------
let current: RearrangeSaved | null = null;

export const getSavedRearrange = (): RearrangeSaved | null => current;
export const setSavedRearrange = (saved: RearrangeSaved | null): void => {
  current = saved;
};

// トグル: 失敗・アクションが無いときは OFF 扱い
export const fetchRearrangeFlag = async (): Promise<boolean> => {
  try {
    const res = (await callGas('getRearrangeFlag', {})) as unknown as Raw;
    return res.status === 'success' && res.enabled === true;
  } catch {
    return false;
  }
};

// トグルが ON のときだけ結果を読む。どこかで失敗したら、重ねない
export const syncRearrange = async (): Promise<void> => {
  if (!isTkLaunched()) {
    current = null;
    return;
  }
  if (!(await fetchRearrangeFlag())) {
    current = null;
    return;
  }
  try {
    const res = (await callGas('getRearrangeResult', {})) as unknown as Raw;
    current = res.status === 'success' ? parseSaved(res.result) : null;
  } catch {
    current = null;
  }
};

// ---------- 重ねる(行の読み替え) ----------
export interface RearrangeView {
  rows: TrainRow[]; // 入力の行と同じ並び。行き先・始発が変わった列車だけ、行を作り直してある(それ以外は同じ行)
  cancelled: Set<string>; // 運休の列車番号
  delays: Map<string, number[]>; // 列車番号 → 停車駅ごとの遅れ(分)。0 だけの列車は入れない
  offset: Map<string, number>; // 列車番号 → 始発が切り直されたときの、もとの停車駅の番号とのずれ
}

type MasterArg = Parameters<typeof buildData>[1];

const viewCache = new WeakMap<TrainRow[], { saved: RearrangeSaved; view: RearrangeView }>();

/** 保存された結果が、いま使えるか(ON で取得できていて、きょうの結果) */
const usable = (nowMs: number): RearrangeSaved | null => (current && current.day === currentServiceDay(nowMs) ? current : null);

/**
 * 路線 code のダイヤの行を、直したあとのダイヤに読み替える。重ねるものが無いときは null(いまのダイヤのまま)。
 * いまは高宮線(TK)だけ。
 */
export const rearrangeView = (code: string, master: unknown, rows: TrainRow[], nowMs: number = Date.now()): RearrangeView | null => {
  if (code !== TK_CODE) return null;
  const saved = usable(nowMs);
  if (!saved) return null;
  const hit = viewCache.get(rows);
  if (hit && hit.saved === saved) return hit.view;

  const data = buildData(rows, master as MasterArg, {});
  const fx = fromCompact(data, saved.compact);
  const byNo = new Map(fx.trains.map((t) => [t.no, t]));
  const delays = new Map<string, number[]>();
  const offset = new Map<string, number>();

  const out = rows.map((row) => {
    const f = byNo.get(row[0]);
    if (!f) return row;
    const stops = f.nodes.filter((n) => n.stop);
    const mins = stops.map((n, j) => Math.round((j === stops.length - 1 ? n.arr - n.schedArr : n.dep - n.schedDep) / 60));
    if (mins.some((m) => m !== 0)) delays.set(row[0], mins);
    if (!f.changedOrigin && !f.changedDest) return row;

    // 行き先・始発が変わった列車: 停車駅の並びを、切り直した範囲だけにする(時刻は時刻表のまま。遅れは別に持つ)
    const flatOld = row[5];
    let first = 0;
    for (let i = 0; i * 3 < flatOld.length; i++) {
      if (flatOld[i * 3] === stops[0].st) {
        first = i;
        break;
      }
    }
    if (first > 0) offset.set(row[0], first);
    const t0 = f.changedOrigin ? Math.round(stops[0].schedDep) : row[4];
    const flat: number[] = [];
    stops.forEach((n, j) => {
      flat.push(n.st, j === 0 ? -1 : Math.round(n.schedArr) - t0, j === stops.length - 1 ? -1 : Math.round(n.schedDep) - t0);
    });
    const plat = row[9] ? row[9].slice(first, first + stops.length) : undefined;
    const next: TrainRow = [
      row[0], row[1], row[2], row[3], t0, flat, row[6],
      f.changedDest ? f.dest : row[7],
      f.changedOrigin ? f.origin : row[8],
      plat,
    ];
    return next;
  });

  const view: RearrangeView = { rows: out, cancelled: new Set(fx.cancelled), delays, offset };
  viewCache.set(rows, { saved, view });
  return view;
};

/** 発車案内: この列車が、この駅(駅の番号)から出るか(終点まで・始発の前の駅では出ない) */
export const departsFrom = (row: TrainRow, stationIdx: number): boolean => {
  const flat = row[5];
  for (let i = 0; i * 3 < flat.length; i++) if (flat[i * 3] === stationIdx && flat[i * 3 + 2] !== -1) return true;
  return false;
};

/** 画面が使う、この列車の、停車駅 stopIdx での遅れ(分)。運休なら null */
export const rearrangeDelayAt = (view: RearrangeView, trainNo: string, stopIdx: number): { suspended: boolean; minutes: number } => {
  if (view.cancelled.has(trainNo)) return { suspended: true, minutes: 0 };
  return { suspended: false, minutes: view.delays.get(trainNo)?.[stopIdx] ?? 0 };
};
