// 列車の番線(公開後のダイヤだけ)を読む。列車の行の10番目の要素に、停車駅ごとの番線が入っている
// (停車駅の並びと同じ順。番線の決まりは public/data/dia-2/README.md)。経路検索・発車案内・予約の知らせは、ここを通して読む。
import { LineData, normalizeStationName, TrainRow } from './diaTimetable';

// k番目の停車駅の番線(「2」など)。ダイヤに番線が無い(公開前のダイヤ)・空のときは undefined
export const platformAtStop = (train: TrainRow, k: number): string | undefined => {
  const p = train[9]?.[k];
  return p ? p : undefined;
};

// 路線のデータで、列車 trainNo が、駅 stationName から発車するときの番線。発車のある停車駅だけ(終着駅は、着だけなので、対象外)
export const departurePlatform = (data: LineData | undefined, trainNo: string, stationName: string): string | undefined => {
  if (!data) return undefined;
  const train = data.trains.find((t) => t[0] === trainNo);
  if (!train) return undefined;
  const name = normalizeStationName(stationName);
  const stationIdx = data.master.stations.findIndex((s) => normalizeStationName(s[0]) === name);
  if (stationIdx < 0) return undefined;
  const flat = train[5];
  for (let k = 0; k * 3 < flat.length; k++) {
    if (flat[k * 3] === stationIdx && flat[k * 3 + 2] !== -1) return platformAtStop(train, k);
  }
  return undefined;
};

// 知らせや画面に出す言い方(番線が無ければ、空)
export const platformLabel = (platform: string | undefined): string => (platform ? `${platform}番線` : '');
