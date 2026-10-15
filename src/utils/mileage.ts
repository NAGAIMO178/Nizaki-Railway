// マイレージ(NIZAKI 2.0。公開後だけ使う): 乗車済みの予約から、累計の営業キロ・乗車回数・訪れた駅の数を求めて、ランクを決める。
// 営業キロは、予約のときの運賃と同じ計算(ダイヤの駅間距離)。環状線は、短く着く向きの距離。
import { EXPRESS_TYPES, ExpressKey, getTripDistanceKm, loadExpressData, loadLineData, LineData } from './diaTimetable';
import { loadRouteStations } from './routeSearch';
import { RideRecord } from './cloudAccount';

export const RANKS = [
  { name: 'レギュラー', km: 0 },
  { name: 'ゴールド', km: 300 },
  { name: 'プレミアム', km: 1000 },
] as const;

export interface RideLog {
  orderId: string;
  date: string;
  trainName: string;
  from: string;
  to: string;
  km: number;
  fare: number;
}

export interface Mileage {
  totalKm: number;
  rides: number;
  stationCount: number;
  totalStations: number;
  rank: string;
  nextRank: string | null;
  kmToNext: number; // 次のランクまでの営業キロ(いちばん上のランクなら 0)
  progress: number; // 今のランクから次のランクまでの、進み具合(0〜1。いちばん上は 1)
  log: RideLog[]; // 新しい順
}

const LINE_CODES = ['Y', 'NI', 'SC', 'TC'];

const stripEki = (name: string) => name.replace(/駅$/, '').trim();

export const rankFor = (totalKm: number) => {
  let idx = 0;
  RANKS.forEach((r, i) => {
    if (totalKm >= r.km) idx = i;
  });
  const next = RANKS[idx + 1];
  const base = RANKS[idx].km;
  return {
    rank: RANKS[idx].name as string,
    nextRank: next ? (next.name as string) : null,
    kmToNext: next ? Math.max(0, Math.round((next.km - totalKm) * 10) / 10) : 0,
    progress: next ? Math.min(1, Math.max(0, (totalKm - base) / (next.km - base))) : 1,
  };
};

export const computeMileage = async (rides: RideRecord[]): Promise<Mileage> => {
  const lines: Record<string, LineData> = {};
  for (const code of LINE_CODES) lines[code] = await loadLineData(code);
  // 特急は、直通(めぐり: 東京〜日立)なら、2つの路線をつないだデータで、営業キロを通しで求める
  const expressKeys = Object.keys(EXPRESS_TYPES) as ExpressKey[];
  const expressData = {} as Record<ExpressKey, LineData>;
  for (const k of expressKeys) expressData[k] = await loadExpressData(k);
  const totalStations = (await loadRouteStations()).length;

  const stations = new Set<string>();
  const log: RideLog[] = [];
  let total = 0;

  rides.forEach((ride) => {
    const from = stripEki(ride.boardingStation);
    const to = stripEki(ride.destinationStation);
    // 列車名の頭(特急あやみ・特急Nライナー・特急めぐり)で、路線が分かる。分からないときは、2つの駅がある路線を探す
    const expressKey = expressKeys.find((k) => ride.trainName.startsWith(EXPRESS_TYPES[k].label));
    let km = expressKey ? getTripDistanceKm(expressData[expressKey], from, to) : 0;
    if (!km) {
      for (const code of LINE_CODES) {
        km = getTripDistanceKm(lines[code], from, to);
        if (km > 0) break;
      }
    }
    km = Math.round(km * 10) / 10;
    total += km;
    if (km > 0) {
      stations.add(from);
      stations.add(to);
    }
    log.push({ orderId: ride.orderId, date: ride.reservedDate, trainName: ride.trainName, from, to, km, fare: ride.totalPrice });
  });

  total = Math.round(total * 10) / 10;
  return {
    totalKm: total,
    rides: rides.length,
    stationCount: stations.size,
    totalStations,
    ...rankFor(total),
    log,
  };
};
