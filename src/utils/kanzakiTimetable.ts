// 神埼線 (Kanzaki Line) 時刻表連動エンジン
import { DynamicDeparture } from '../components/MyStationCard';
import { disruptionManager } from './disruptionManager';
import {
  getKanzakiStationTimetable,
  KanzakiTimetableEntry,
} from '../data/kanzakiStationTimetableData';

// 神埼線の主要停車駅リスト
export const KANZAKI_STOPS: Record<string, string[]> = {
  LOCAL: [
    '東京', '秋葉原', '北千住', '竹ノ塚', '草加', '新越谷', '越谷レイクタウン',
    '東川口', '地下鉄岩槻', '大宮', '朝霞台', '清瀬', 'ひばりヶ丘', '田無',
    '武蔵境', '調布', '稲田堤', '生田', '溝の口', '新横浜', '横浜'
  ],
  E: [
    '東京', '北千住', '草加', '越谷レイクタウン', '大宮', '朝霞台',
    'ひばりヶ丘', '調布', '生田', '溝の口', '新横浜', '横浜'
  ],
  N: [
    '東京', '北千住', '越谷レイクタウン', '大宮', 'ひばりヶ丘',
    '調布', '溝の口', '新横浜', '横浜'
  ],
};

/**
 * 神埼線時刻表データから、指定された駅・方向の直近発車便を抽出
 */
export function getKanzakiDeparturesForStation(
  stationName: string,
  platform: 1 | 2, // 1: 下り(横浜方面), 2: 上り(東京方面)
  baseTimestamp: number,
  limit: number = 3
): DynamicDeparture[] {
  const config = getKanzakiStationTimetable(stationName);
  if (!config) {
    return [];
  }

  // 1番線=下り, 2番線=上り
  const directionTimetable = platform === 1 ? config.down : config.up;
  if (!directionTimetable) {
    return [];
  }

  const baseDate = new Date(baseTimestamp);
  const curHour = baseDate.getHours();
  const curMin = baseDate.getMinutes();
  const curSec = baseDate.getSeconds();

  const results: DynamicDeparture[] = [];

  // 今日の当時間以降、および深夜/翌日早朝（最大3時間先まで）を探索
  const checkHours = [curHour, (curHour + 1) % 24, (curHour + 2) % 24, (curHour + 3) % 24];

  for (let i = 0; i < checkHours.length; i++) {
    const h = checkHours[i];
    const hourSchedule = directionTimetable.hours.find((entry) => entry.hour === h);
    if (!hourSchedule) continue;

    for (const train of hourSchedule.trains) {
      // 当時間の過去の便はスキップ（30秒前の猶予）
      if (i === 0 && (train.minute < curMin || (train.minute === curMin && curSec > 35))) {
        continue;
      }

      // 日跨ぎ計算
      const depDate = new Date(baseTimestamp);
      if (i > 0 && h < curHour) {
        // 日をまたいだ場合
        depDate.setDate(depDate.getDate() + 1);
      }
      depDate.setHours(h, train.minute, 0, 0);

      const depTs = depDate.getTime();
      const delayInfo = disruptionManager.getEffectiveDelayForTrain('kanzaki', depTs);

      // 初電・終電判定
      const isFirst = h === 5 && hourSchedule.trains[0]?.minute === train.minute;
      const isLast = (h === 0 || h === 1) && hourSchedule.trains[hourSchedule.trains.length - 1]?.minute === train.minute;

      const formattedHour = String(h).padStart(2, '0');
      const formattedMin = String(train.minute).padStart(2, '0');

      results.push({
        id: `kanzaki-${config.stationCode}-${platform}-${depTs}-${train.minute}`,
        lineName: '神埼線',
        trainType: train.typeName,
        destination: train.destination,
        departureTime: `${formattedHour}:${formattedMin}`,
        departureTimestamp: depTs,
        isFirstTrain: isFirst,
        isLastTrain: isLast,
        isOrigin: platform === 1 ? stationName.includes('東京') : stationName.includes('横浜'),
        carCount: train.carCount,
        delayMinutes: delayInfo.delayMinutes,
        isSuspended: delayInfo.isSuspended,
      });

      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}
