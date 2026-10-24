// 経路の詳細(公開後)で、有料の特急の区間に、号数を出す・予約画面へ飛ぶための決まり。
// 号数・列車の選び方は、予約画面と同じもの(diaTimetable の expressNames・findExpressTrips)を使う。
import { EXPRESS_TYPES, expressNames, findExpressTrips, getCachedExpressData, getCachedLineData } from './diaTimetable';
import type { ExpressKey } from './diaTimetable';
import type { RouteLeg } from './routeSearch';
import type { ReservationPreset } from '../components/ReservationTab';

const keyOfLeg = (leg: RouteLeg): ExpressKey | undefined =>
  leg.paid ? (Object.keys(EXPRESS_TYPES) as ExpressKey[]).find((k) => EXPRESS_TYPES[k].typeName === leg.typeName) : undefined;

// 区間の特急の号数(例: 「21号」)。特急でない・引けないときは undefined。直通の2区間は、同じ号数
export const legGou = (leg: RouteLeg): string | undefined => {
  if (!keyOfLeg(leg)) return undefined;
  const data = getCachedLineData(leg.lineCode);
  const train = data?.trains.find((t) => t[0] === leg.trainNo);
  if (!data || !train) return undefined;
  const e = expressNames(data, train);
  return e ? e.name.slice(e.band.length) : undefined;
};

export interface ReserveTarget {
  preset: Omit<ReservationPreset, 'key'>;
  label: string; // 例: 東京 → 日立 17:35 の予約へ
}

// 経路の、有料の特急の区間ごとの「予約画面へ」。直通で続けて乗る区間は、1つの特急として1つ。
// 予約画面で、その列車が選べるもの(乗る駅〜降りる駅で、その列車が乗れる)だけ出す。
export const reserveTargets = (legs: RouteLeg[]): ReserveTarget[] => {
  const groups: { key: ExpressKey; trainNo: string; from: string; to: string }[] = [];
  for (const leg of legs) {
    const key = keyOfLeg(leg);
    if (!key) continue;
    const last = groups[groups.length - 1];
    if (leg.through && last && last.trainNo === leg.trainNo) last.to = leg.to;
    else groups.push({ key, trainNo: leg.trainNo, from: leg.from, to: leg.to });
  }
  const out: ReserveTarget[] = [];
  for (const g of groups) {
    const data = getCachedExpressData(g.key);
    if (!data) continue;
    const trip = findExpressTrips(data, EXPRESS_TYPES[g.key].typeName, g.from, g.to).find((t) => t.code === g.trainNo);
    if (!trip) continue;
    out.push({
      preset: { expressType: g.key, boarding: g.from, destination: g.to, trainCode: g.trainNo },
      label: `${g.from} → ${g.to} ${trip.depTime} の予約へ`,
    });
  }
  return out;
};
