// 到着時刻からの逆算(NIZAKI 2.0。公開後だけ。呼ぶ画面を isLaunched() の内側に置く)
// 「9:00 までに東京へ」→ 間に合う乗り方を集め、遅れに強く・乗換が少なく・空いている便を「おすすめ」にし、前後の便も1つずつ返す。
// 混雑は、おすすめを決めるためだけに使い、結果には持たせない。
import { DEFAULT_ROUTE_OPTIONS, RouteOptions } from './routeOptions';
import { RouteLeg, RouteResult, searchRoutesInWindow } from './routeSearch';

const DAY = 86400;
// 探しはじめる時刻: 締め切りの、この時間(秒)前。乗車時間の長い行き先でも見つかるよう、広めに取り、最初の1本の所要時間で狭める
const PROBE_BEFORE_SEC = 6 * 3600;
const MIN_WINDOW_SEC = 2 * 3600;
// 余裕(分)と、乗換に失敗する確率の目安の、条件。0 から順に、見つからなければゆるめる
const TIERS: { minMargin: number; maxRisk: number }[] = [
  { minMargin: 5, maxRisk: 0.05 }, // 自動の遅れは最大5分
  { minMargin: 3, maxRisk: 0.15 },
  { minMargin: 0, maxRisk: 1 },
];
// 前後の便は、おすすめと、これだけ(分)以上、出発がずれたものから選ぶ
export const NEIGHBOR_GAP_MIN = 5;
const MAX_CANDIDATES = 80;

export interface ArrivalQuery {
  from: string;
  to: string;
  day: 'today' | 'tomorrow'; // 到着したい日(暦の日)
  arriveBy: string; // 到着の締め切り "HH:MM"。0:00〜3:59 は、その日の未明(前日のダイヤの続き)
  vias?: string[];
  options?: RouteOptions; // sortBy は使わない
  now?: Date; // テスト用
}

// 混雑の項目を除いた形
export type PlainLeg = Omit<RouteLeg, 'crowd' | 'crowdAvg'>;
export type PlainRoute = Omit<RouteResult, 'legs' | 'crowd' | 'crowdScore'> & { legs: PlainLeg[] };

export interface ArrivalOption {
  route: PlainRoute;
  depSec: number;
  arrSec: number;
  marginMin: number; // 締め切り − 到着(遅れを加味)。0 以上の整数
  transfers: number;
}

export interface ArrivalPlan {
  options: ArrivalOption[]; // 出発の早い順。最大3つ(前・おすすめ・後)。間に合う便が無ければ空
  pickIndex: number; // おすすめの位置。空なら -1
  deadlineSec: number;
  usedDelays: boolean;
  relaxed: 0 | 1 | 2; // おすすめの条件を、いくつゆるめたか
}

const EMPTY = (deadlineSec: number, usedDelays: boolean): ArrivalPlan => ({
  options: [],
  pickIndex: -1,
  deadlineSec,
  usedDelays,
  relaxed: 0,
});

const parseTime = (text: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((text || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 3600 + min * 60;
};

// 混雑の項目を取り除く
const toPlain = (r: RouteResult): PlainRoute => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { crowd, crowdScore, legs, ...rest } = r;
  return {
    ...rest,
    legs: legs.map((l) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { crowd: c, crowdAvg, ...leg } = l;
      return leg;
    }),
  };
};

// 暦の日の0時(ローカル)。offsetDays 日ずらす
const midnight = (base: Date, offsetDays: number): Date => {
  const d = new Date(base.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
};

export const planArrival = async (q: ArrivalQuery): Promise<ArrivalPlan> => {
  const options = q.options ?? DEFAULT_ROUTE_OPTIONS;
  const clock = parseTime(q.arriveBy);
  if (clock === null) return EMPTY(0, false);

  const now = q.now ?? new Date();
  // ダイヤの日: 4時から翌朝4時まで(0〜4時は、前日のダイヤの続き)
  const targetDate = midnight(now, q.day === 'tomorrow' ? 1 : 0);
  const early = clock < 4 * 3600;
  const serviceStart = early ? midnight(targetDate, -1) : targetDate;
  const deadlineSec = clock + (early ? DAY : 0);
  const nowServiceStart = now.getHours() < 4 ? midnight(now, -1) : midnight(now, 0);
  const sameDay = serviceStart.getTime() === nowServiceStart.getTime();
  const nowSec = Math.floor((now.getTime() - nowServiceStart.getTime()) / 1000);
  const usedDelays = sameDay && options.realtime;

  // 今日の締め切りが、もう過ぎている
  if (sameDay && deadlineSec <= nowSec) return EMPTY(deadlineSec, usedDelays);

  const earliestStart = sameDay ? Math.max(0, nowSec) : 0;
  const search = (fromSec: number, maxCandidates: number) =>
    searchRoutesInWindow({
      from: q.from,
      to: q.to,
      fromSec,
      untilArrSec: deadlineSec,
      serviceDayStartMs: serviceStart.getTime(),
      withDelays: sameDay,
      options,
      viaStations: q.vias,
      maxCandidates,
    }).catch(() => [] as RouteResult[]);

  // 1本目(広い範囲から探して、最初に見つかる便)で、所要時間の見当をつける
  const probeStart = Math.max(earliestStart, deadlineSec - PROBE_BEFORE_SEC);
  const probe = await search(probeStart, 1);
  if (probe.length === 0) return EMPTY(deadlineSec, usedDelays);

  const windowSec = Math.max(MIN_WINDOW_SEC, probe[0].minutes * 60 * 2);
  const found = await search(Math.max(probeStart, deadlineSec - windowSec), MAX_CANDIDATES);

  // もっと遅く出て、もっと早く着く便がある便は、除く(出発の早い順)
  const all = found
    .filter((r) => r.arrSec <= deadlineSec)
    .filter((r, _i, list) => !list.some((o) => o !== r && o.depSec >= r.depSec && o.arrSec <= r.arrSec && (o.depSec > r.depSec || o.arrSec < r.arrSec)))
    .sort((a, b) => a.depSec - b.depSec);
  if (all.length === 0) return EMPTY(deadlineSec, usedDelays);

  const marginOf = (r: RouteResult) => Math.floor((deadlineSec - r.arrSec) / 60);

  // おすすめ: 条件に合う便を、乗換が少ない → 空いている → 遅く出られる、の順で選ぶ。合うものが無ければ、条件をゆるめる
  let relaxed: 0 | 1 | 2 = 0;
  let eligible: RouteResult[] = [];
  for (let t = 0; t < TIERS.length; t++) {
    eligible = all.filter((r) => marginOf(r) >= TIERS[t].minMargin && r.risk <= TIERS[t].maxRisk);
    if (eligible.length > 0) {
      relaxed = t as 0 | 1 | 2;
      break;
    }
  }
  const crowdBucket = (r: RouteResult) => (r.crowdScore === undefined ? 0 : Math.round(r.crowdScore));
  const pick = [...eligible].sort(
    (a, b) => a.transfers - b.transfers || crowdBucket(a) - crowdBucket(b) || b.depSec - a.depSec
  )[0];

  // 前後の便: おすすめより、NEIGHBOR_GAP_MIN 分以上ずれたもののうち、いちばん近いもの
  const gap = NEIGHBOR_GAP_MIN * 60;
  const earlier = [...all].reverse().find((r) => r.depSec <= pick.depSec - gap);
  const later = all.find((r) => r.depSec >= pick.depSec + gap);

  const chosen = [earlier, pick, later].filter((r): r is RouteResult => r !== undefined);
  return {
    options: chosen.map((r) => ({
      route: toPlain(r),
      depSec: r.depSec,
      arrSec: r.arrSec,
      marginMin: marginOf(r),
      transfers: r.transfers,
    })),
    pickIndex: chosen.indexOf(pick),
    deadlineSec,
    usedDelays,
    relaxed,
  };
};
