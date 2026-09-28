// 土浦線 (Tsuchiura Line) 日中ダイヤ構成 (土浦以北20分間隔パターン: 00分発各停全駅, 20分発快速, 40分発各停全駅 ※各停は土浦始発)
import { disruptionManager } from './disruptionManager';
import { getStationTimetable } from '../data/tsuchiuraStationTimetableData';

export interface TimetableStop {
  stationName: string;
  arrMin: number; // 毎時00分からの到着オフセット分
  depMin: number; // 毎時00分からの発車オフセット分
}

export interface TsuchiuraTrainPattern {
  trainNo: string;
  trainName: string;
  trainType: string;
  destination: string;
  direction: 1 | 2; // 1 = 下り(松戸→日立), 2 = 上り(日立→松戸)
  stops: TimetableStop[];
}

// 下り (松戸 → 土浦・茨城空港・日立方面) パターン
export const TSUCHIURA_DOWN_PATTERNS: TsuchiuraTrainPattern[] = [
  // 1. 1200A 特急めぐり (松戸 13分発 -> 柏 -> 土浦 -> ひたちなか海浜公園 -> 日立 89分後着)
  {
    trainNo: '1200A',
    trainName: '特急めぐり',
    trainType: '特急めぐり',
    destination: '日立',
    direction: 1,
    stops: [
      { stationName: '松戸', arrMin: 13, depMin: 13 },
      { stationName: '柏', arrMin: 19, depMin: 20 },
      { stationName: '土浦', arrMin: 44, depMin: 45 },
      { stationName: 'ひたちなか海浜公園', arrMin: 71, depMin: 72 },
      { stationName: '日立', arrMin: 89, depMin: 89 },
    ],
  },
  // 2. 1201列 各停 (松戸 05分発 -> 土浦 66分(06分)着 止まり)
  {
    trainNo: '1201列',
    trainName: '各停',
    trainType: '普通',
    destination: '土浦',
    direction: 1,
    stops: [
      { stationName: '松戸', arrMin: 5, depMin: 5 },
      { stationName: '新松戸', arrMin: 9, depMin: 10 },
      { stationName: '松が丘', arrMin: 14, depMin: 15 },
      { stationName: '柏', arrMin: 19, depMin: 28 }, // 柏で退避 9分
      { stationName: '守谷', arrMin: 38, depMin: 39 },
      { stationName: '谷井田', arrMin: 45, depMin: 46 },
      { stationName: '森の里', arrMin: 52, depMin: 53 },
      { stationName: '荒川沖', arrMin: 59, depMin: 60 },
      { stationName: '土浦', arrMin: 66, depMin: 66 },
    ],
  },
  // 3. 土浦00分発 各停（土浦始発・全駅フォロー：鹿島旭・那珂湊・久慈川等にも停車）
  {
    trainNo: '1203列',
    trainName: '普通（土浦00分発・全駅停車）',
    trainType: '普通',
    destination: '日立',
    direction: 1,
    stops: [
      { stationName: '土浦', arrMin: 0, depMin: 0 }, // 土浦00分発 (土浦始発)
      { stationName: '高浜', arrMin: 13, depMin: 14 },
      { stationName: '茨城空港', arrMin: 21, depMin: 22 },
      { stationName: '鹿島旭', arrMin: 29, depMin: 30 },
      { stationName: '大洗', arrMin: 39, depMin: 40 },
      { stationName: '那珂湊', arrMin: 46, depMin: 47 },
      { stationName: '平磯', arrMin: 51, depMin: 52 },
      { stationName: 'ひたちなか海浜公園', arrMin: 58, depMin: 59 },
      { stationName: '久慈川', arrMin: 66, depMin: 67 },
      { stationName: '大甕（おおみか）', arrMin: 73, depMin: 74 },
      { stationName: '東大沼', arrMin: 79, depMin: 80 },
      { stationName: '多賀', arrMin: 85, depMin: 86 },
      { stationName: '会瀬（おうせ）', arrMin: 91, depMin: 92 },
      { stationName: '日立', arrMin: 97, depMin: 97 },
    ],
  },
  // 4. 土浦20分発 快速（土浦始発：高浜・茨城空港・平磯・海浜公園・日立へ直行）
  {
    trainNo: '1205列',
    trainName: '快速（土浦20分発・当駅始発）',
    trainType: '快速',
    destination: '日立',
    direction: 1,
    stops: [
      { stationName: '土浦', arrMin: 20, depMin: 20 }, // 土浦20分発 (土浦始発)
      { stationName: '高浜', arrMin: 32, depMin: 33 },
      { stationName: '茨城空港', arrMin: 40, depMin: 41 },
      { stationName: '平磯', arrMin: 52, depMin: 53 },
      { stationName: 'ひたちなか海浜公園', arrMin: 59, depMin: 60 },
      { stationName: '日立', arrMin: 77, depMin: 77 },
    ],
  },
  // 5. 土浦40分発 各停（土浦始発・全駅フォロー：鹿島旭・那珂湊・久慈川等にも停車）
  {
    trainNo: '1207列',
    trainName: '普通（土浦40分発・全駅停車）',
    trainType: '普通',
    destination: '日立',
    direction: 1,
    stops: [
      { stationName: '土浦', arrMin: 40, depMin: 40 }, // 土浦40分発 (土浦始発)
      { stationName: '高浜', arrMin: 53, depMin: 54 },
      { stationName: '茨城空港', arrMin: 61, depMin: 62 },
      { stationName: '鹿島旭', arrMin: 69, depMin: 70 },
      { stationName: '大洗', arrMin: 79, depMin: 80 },
      { stationName: '那珂湊', arrMin: 86, depMin: 87 },
      { stationName: '平磯', arrMin: 91, depMin: 92 },
      { stationName: 'ひたちなか海浜公園', arrMin: 98, depMin: 99 },
      { stationName: '久慈川', arrMin: 106, depMin: 107 },
      { stationName: '大甕（おおみか）', arrMin: 113, depMin: 114 },
      { stationName: '東大沼', arrMin: 119, depMin: 120 },
      { stationName: '多賀', arrMin: 125, depMin: 126 },
      { stationName: '会瀬（おうせ）', arrMin: 131, depMin: 132 },
      { stationName: '日立', arrMin: 137, depMin: 137 },
    ],
  },
  // 6. 1209列 特別快速 (松戸 10分発 -> 柏 -> 土浦 -> 高浜 -> 茨城空港 68分後着)
  {
    trainNo: '1209列',
    trainName: '特別快速',
    trainType: '特別快速',
    destination: '茨城空港',
    direction: 1,
    stops: [
      { stationName: '松戸', arrMin: 10, depMin: 10 },
      { stationName: '柏', arrMin: 18, depMin: 19 },
      { stationName: '土浦', arrMin: 45, depMin: 47 },
      { stationName: '高浜', arrMin: 59, depMin: 60 },
      { stationName: '茨城空港', arrMin: 68, depMin: 68 },
    ],
  },
  // 7. 1211列 通勤特快 (松戸 50分発 -> 柏 -> 守谷 -> 森の里 -> 高浜 -> 茨城空港 106分後着)
  {
    trainNo: '1211列',
    trainName: '通勤特快',
    trainType: '通勤特快',
    destination: '茨城空港',
    direction: 1,
    stops: [
      { stationName: '松戸', arrMin: 50, depMin: 50 },
      { stationName: '柏', arrMin: 58, depMin: 59 },
      { stationName: '守谷', arrMin: 70, depMin: 71 },
      { stationName: '森の里', arrMin: 80, depMin: 81 },
      { stationName: '高浜', arrMin: 97, depMin: 98 },
      { stationName: '茨城空港', arrMin: 106, depMin: 106 },
    ],
  },
];

// 上り (日立・土浦 → 松戸方面) 対称パターン
export const TSUCHIURA_UP_PATTERNS: TsuchiuraTrainPattern[] = [
  // 1. 1202A 特急めぐり (日立 15分発 -> ひたちなか海浜公園 -> 土浦 -> 柏 -> 松戸 91分後着)
  {
    trainNo: '1202A',
    trainName: '特急めぐり',
    trainType: '特急めぐり',
    destination: '松戸',
    direction: 2,
    stops: [
      { stationName: '日立', arrMin: 15, depMin: 15 },
      { stationName: 'ひたちなか海浜公園', arrMin: 33, depMin: 34 },
      { stationName: '土浦', arrMin: 60, depMin: 61 },
      { stationName: '柏', arrMin: 84, depMin: 85 },
      { stationName: '松戸', arrMin: 91, depMin: 91 },
    ],
  },
  // 2. 1204列 普通 (日立 00分発全駅フォロー -> 土浦 97分(37分)着 止まり)
  {
    trainNo: '1204列',
    trainName: '普通（日立00分発全駅フォロー）',
    trainType: '普通',
    destination: '土浦',
    direction: 2,
    stops: [
      { stationName: '日立', arrMin: 0, depMin: 0 },
      { stationName: '会瀬（おうせ）', arrMin: 5, depMin: 6 },
      { stationName: '多賀', arrMin: 11, depMin: 12 },
      { stationName: '東大沼', arrMin: 17, depMin: 18 },
      { stationName: '大甕（おおみか）', arrMin: 23, depMin: 24 },
      { stationName: '久慈川', arrMin: 30, depMin: 31 },
      { stationName: 'ひたちなか海浜公園', arrMin: 37, depMin: 38 },
      { stationName: '平磯', arrMin: 44, depMin: 45 },
      { stationName: '那珂湊', arrMin: 49, depMin: 50 },
      { stationName: '大洗', arrMin: 56, depMin: 57 },
      { stationName: '鹿島旭', arrMin: 66, depMin: 67 },
      { stationName: '茨城空港', arrMin: 75, depMin: 76 },
      { stationName: '高浜', arrMin: 83, depMin: 84 },
      { stationName: '土浦', arrMin: 97, depMin: 97 },
    ],
  },
  // 3. 1206列 快速 (日立 30分発主要駅停車 -> 松戸 128分後着)
  {
    trainNo: '1206列',
    trainName: '快速',
    trainType: '快速',
    destination: '松戸',
    direction: 2,
    stops: [
      { stationName: '日立', arrMin: 30, depMin: 30 },
      { stationName: 'ひたちなか海浜公園', arrMin: 48, depMin: 49 },
      { stationName: '平磯', arrMin: 55, depMin: 56 },
      { stationName: '茨城空港', arrMin: 67, depMin: 68 },
      { stationName: '高浜', arrMin: 75, depMin: 76 },
      { stationName: '土浦', arrMin: 83, depMin: 84 },
      { stationName: '森の里', arrMin: 94, depMin: 95 },
      { stationName: '谷井田', arrMin: 101, depMin: 102 },
      { stationName: '守谷', arrMin: 108, depMin: 109 },
      { stationName: '柏', arrMin: 118, depMin: 119 },
      { stationName: '松戸', arrMin: 128, depMin: 128 },
    ],
  },
  // 4. 1208列 各停 (土浦 30分発 -> 松戸 93分後着)
  {
    trainNo: '1208列',
    trainName: '各停',
    trainType: '普通',
    destination: '松戸',
    direction: 2,
    stops: [
      { stationName: '土浦', arrMin: 30, depMin: 30 },
      { stationName: '荒川沖', arrMin: 37, depMin: 38 },
      { stationName: '森の里', arrMin: 44, depMin: 45 },
      { stationName: '谷井田', arrMin: 51, depMin: 52 },
      { stationName: '守谷', arrMin: 58, depMin: 59 },
      { stationName: '柏', arrMin: 69, depMin: 78 }, // 柏退避 9分
      { stationName: '松が丘', arrMin: 82, depMin: 83 },
      { stationName: '新松戸', arrMin: 87, depMin: 88 },
      { stationName: '松戸', arrMin: 93, depMin: 93 },
    ],
  },
  // 5. 1210列 特別快速 (茨城空港 10分発 -> 高浜 -> 土浦 -> 柏 -> 松戸 69分後着)
  {
    trainNo: '1210列',
    trainName: '特別快速',
    trainType: '特別快速',
    destination: '松戸',
    direction: 2,
    stops: [
      { stationName: '茨城空港', arrMin: 10, depMin: 10 },
      { stationName: '高浜', arrMin: 18, depMin: 19 },
      { stationName: '土浦', arrMin: 32, depMin: 34 },
      { stationName: '柏', arrMin: 60, depMin: 61 },
      { stationName: '松戸', arrMin: 69, depMin: 69 },
    ],
  },
  // 6. 1212列 通勤特快 (茨城空港 40分発 -> 高浜 -> 森の里 -> 守谷 -> 柏 -> 松戸 96分後着)
  {
    trainNo: '1212列',
    trainName: '通勤特快',
    trainType: '通勤特快',
    destination: '松戸',
    direction: 2,
    stops: [
      { stationName: '茨城空港', arrMin: 40, depMin: 40 },
      { stationName: '高浜', arrMin: 48, depMin: 49 },
      { stationName: '森の里', arrMin: 65, depMin: 66 },
      { stationName: '守谷', arrMin: 75, depMin: 76 },
      { stationName: '柏', arrMin: 87, depMin: 88 },
      { stationName: '松戸', arrMin: 96, depMin: 96 },
    ],
  },
];


export interface LiveTrainPosResult {
  id: string;
  lineId: string;
  direction: 1 | 2;
  trainType: string;
  destination: string;
  carCount: number;
  stationId: string;
  isBetween: boolean;
  isStopStation?: boolean;
  delayMinutes: number;
  timetable: { stationName: string; scheduledTime: string; estimatedTime: string }[];
}

export function getTsuchiuraLiveTrains(
  nowTimestamp: number,
  direction: 1 | 2,
  displayStations: { id: string; name: string }[]
): LiveTrainPosResult[] {
  const results: LiveTrainPosResult[] = [];
  const patterns = direction === 1 ? TSUCHIURA_DOWN_PATTERNS : TSUCHIURA_UP_PATTERNS;

  const now = new Date(nowTimestamp);
  const currentHour = now.getHours();

  for (let hourOffset = -3; hourOffset <= 1; hourOffset++) {
    const targetHour = currentHour + hourOffset;
    if (targetHour < 4 || targetHour > 24) continue;

    const baseDate = new Date(nowTimestamp);
    baseDate.setHours(targetHour, 0, 0, 0);
    const hourBaseMs = baseDate.getTime();

    const elapsedMinutes = (nowTimestamp - hourBaseMs) / 60000;

    patterns.forEach((pat, index) => {
      const firstStop = pat.stops[0];
      const lastStop = pat.stops[pat.stops.length - 1];

      if (elapsedMinutes >= firstStop.depMin && elapsedMinutes <= lastStop.arrMin) {
        for (let s = 0; s < pat.stops.length - 1; s++) {
          const stopA = pat.stops[s];
          const stopB = pat.stops[s + 1];

          // 1. 駅に停車中
          if (elapsedMinutes >= stopA.arrMin && elapsedMinutes <= stopA.depMin) {
            const stObj = displayStations.find((st) => st.name === stopA.stationName || st.name.includes(stopA.stationName) || stopA.stationName.includes(st.name));
            if (!stObj) break;

            const destIdx = displayStations.findIndex((st) => st.name === pat.destination || st.name.includes(pat.destination) || pat.destination.includes(st.name));
            const curIdx = displayStations.findIndex((st) => st.id === stObj.id);
            if (destIdx !== -1 && curIdx !== -1) {
              if (direction === 1 && curIdx > destIdx) break;
              if (direction === 2 && curIdx < destIdx) break;
            }

            const trainSeed = Math.abs(Math.sin(targetHour * 100 + index * 17 + direction * 31)) * 10000;
            const effectiveDelay = disruptionManager.getEffectiveDelayForTrain('tsuchiura', trainSeed, direction);
            let delayMinutes = 0;
            if (effectiveDelay.isSuspended) {
              delayMinutes = 99;
            } else if (effectiveDelay.delayMinutes > 0) {
              delayMinutes = effectiveDelay.delayMinutes;
            } else {
              // 通常時の極微小遅延 (1/300 ≒ 0.3%)
              delayMinutes = Math.floor(trainSeed) % 300 === 0 ? (Math.floor(trainSeed % 3) + 1) : 0;
            }

            results.push({
              id: `tc_${direction}_h${targetHour}_p${index}`,
              lineId: 'tsuchiura',
              direction,
              trainType: pat.trainType,
              destination: pat.destination,
              carCount: pat.trainType.includes('特急') || pat.trainType === '特別快速' ? 10 : 8,
              stationId: stObj.id,
              isBetween: false,
              isStopStation: true,
              delayMinutes,
              timetable: pat.stops.map((st) => {
                const arrH = Math.floor((targetHour * 60 + st.arrMin) / 60) % 24;
                const arrM = Math.floor(st.arrMin) % 60;
                const timeStr = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;
                const estH = Math.floor((targetHour * 60 + st.arrMin + delayMinutes) / 60) % 24;
                const estM = Math.floor(st.arrMin + delayMinutes) % 60;
                const estTimeStr = `${String(estH).padStart(2, '0')}:${String(estM).padStart(2, '0')}`;
                return {
                  stationName: st.stationName,
                  scheduledTime: timeStr,
                  estimatedTime: estTimeStr,
                };
              }),
            });
            break;
          }

          // 2. 駅間移動中
          if (elapsedMinutes > stopA.depMin && elapsedMinutes < stopB.arrMin) {
            const idxA = displayStations.findIndex((st) => st.name === stopA.stationName || st.name.includes(stopA.stationName) || stopA.stationName.includes(st.name));
            const idxB = displayStations.findIndex((st) => st.name === stopB.stationName || st.name.includes(stopB.stationName) || stopB.stationName.includes(st.name));

            if (idxA !== -1 && idxB !== -1) {
              const segProgress = (elapsedMinutes - stopA.depMin) / (stopB.arrMin - stopA.depMin);
              const totalStationSteps = Math.abs(idxB - idxA);
              const fractionalStep = segProgress * totalStationSteps;
              const stepInt = Math.floor(fractionalStep);
              const stepRem = fractionalStep - stepInt;

              const stepDirection = idxB >= idxA ? 1 : -1;
              const currentStationIdx = idxA + stepDirection * stepInt;
              const safeStationIdx = Math.max(0, Math.min(displayStations.length - 1, currentStationIdx));
              const currentStation = displayStations[safeStationIdx];

              const destIdx = displayStations.findIndex((st) => st.name === pat.destination || st.name.includes(pat.destination) || pat.destination.includes(st.name));
              if (destIdx !== -1) {
                if (direction === 1 && safeStationIdx > destIdx) break;
                if (direction === 2 && safeStationIdx < destIdx) break;
              }

              // 停車駅に含まれていない通過駅の場合は、必ず通過中(isBetween = true)として扱う
              const isStopStation = pat.stops.some((s) => s.stationName === currentStation.name || currentStation.name.includes(s.stationName) || s.stationName.includes(currentStation.name));
              const isBetween = !isStopStation || (stepRem >= 0.35 && stepRem <= 0.85);

              const trainSeed = Math.abs(Math.sin(targetHour * 100 + index * 17 + direction * 31)) * 10000;
              const effectiveDelay = disruptionManager.getEffectiveDelayForTrain('tsuchiura', trainSeed, direction);
              let delayMinutes = 0;
              if (effectiveDelay.isSuspended) {
                delayMinutes = 99;
              } else if (effectiveDelay.delayMinutes > 0) {
                delayMinutes = effectiveDelay.delayMinutes;
              } else {
                // 通常時の極微小遅延 (1/300 ≒ 0.3%)
                delayMinutes = Math.floor(trainSeed) % 300 === 0 ? (Math.floor(trainSeed % 3) + 1) : 0;
              }

              results.push({
                id: `tc_${direction}_h${targetHour}_p${index}`,
                lineId: 'tsuchiura',
                direction,
                trainType: pat.trainType,
                destination: pat.destination,
                carCount: pat.trainType.includes('特急') || pat.trainType === '特別快速' ? 10 : 8,
                stationId: currentStation.id,
                isBetween,
                isStopStation,
                delayMinutes,
                timetable: pat.stops.map((st) => {
                  const arrH = Math.floor((targetHour * 60 + st.arrMin) / 60) % 24;
                  const arrM = Math.floor(st.arrMin) % 60;
                  const timeStr = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;
                  const estH = Math.floor((targetHour * 60 + st.arrMin + delayMinutes) / 60) % 24;
                  const estM = Math.floor(st.arrMin + delayMinutes) % 60;
                  const estTimeStr = `${String(estH).padStart(2, '0')}:${String(estM).padStart(2, '0')}`;
                  return {
                    stationName: st.stationName,
                    scheduledTime: timeStr,
                    estimatedTime: estTimeStr,
                  };
                }),
              });
            }
            break;
          }
        }
      }
    });
  }

  return results;
}

// 駅指定の次回発車情報一覧（MyStationCard用）
export function getTsuchiuraDeparturesForStation(
  stationName: string,
  platform: 1 | 2, // 1 = 下り(土浦・日立方面), 2 = 上り(松戸方面)
  baseTimestamp: number,
  limit: number = 4
): {
  id: string;
  lineName: string;
  trainType: string;
  destination: string;
  departureTime: string;
  departureTimestamp: number;
  isOrigin?: boolean;
}[] {
  const departures: {
    id: string;
    lineName: string;
    trainType: string;
    destination: string;
    departureTime: string;
    departureTimestamp: number;
    isOrigin?: boolean;
  }[] = [];

  const timetableConfig = getStationTimetable(stationName);
  const targetTimetable = timetableConfig ? (platform === 1 ? timetableConfig.down : timetableConfig.up) : null;

  const now = new Date(baseTimestamp);
  const currentHour = now.getHours();

  if (targetTimetable && targetTimetable.hours && targetTimetable.hours.length > 0) {
    // 公式駅時刻表から正確な列車を抽出
    for (let hourOffset = 0; hourOffset <= 3; hourOffset++) {
      const targetHour = (currentHour + hourOffset) % 24;
      const hourData = targetTimetable.hours.find((h) => h.hour === targetHour);
      if (!hourData) continue;

      const baseDate = new Date(baseTimestamp);
      baseDate.setHours(targetHour, 0, 0, 0);
      const hourBaseMs = baseDate.getTime();

      for (let t = 0; t < hourData.trains.length; t++) {
        const train = hourData.trains[t];
        const depTimeMs = hourBaseMs + train.minute * 60000;
        if (depTimeMs >= baseTimestamp) {
          const timeStr = `${String(targetHour).padStart(2, '0')}:${String(train.minute).padStart(2, '0')}`;
          const isOrigin = platform === 1 && (stationName.includes('松戸') || (stationName.includes('土浦') && train.destination === '日立' && train.typeCode === 'LOCAL'));

          departures.push({
            id: `dep_tc_${stationName}_${platform}_${depTimeMs}_${t}`,
            lineName: '土浦線',
            trainType: train.typeName,
            destination: train.destination,
            departureTime: timeStr,
            departureTimestamp: depTimeMs,
            isOrigin,
          });
        }
      }
    }
  } else {
    // パターン補間フォールバック
    const patterns = platform === 1 ? TSUCHIURA_DOWN_PATTERNS : TSUCHIURA_UP_PATTERNS;

    for (let hourOffset = 0; hourOffset <= 3; hourOffset++) {
      const targetHour = currentHour + hourOffset;
      const baseDate = new Date(baseTimestamp);
      baseDate.setHours(targetHour, 0, 0, 0);
      const hourBaseMs = baseDate.getTime();

      for (let p = 0; p < patterns.length; p++) {
        const pat = patterns[p];
        const stop = pat.stops.find((s) => s.stationName.includes(stationName) || stationName.includes(s.stationName));
        if (!stop) continue;

        // 始発駅判定: パターンの最初の停車駅が自駅か（当駅始発は下り(platform 1)のみ対象）
        const originStop = pat.stops[0];
        const isOrigin = platform === 1 && !!originStop && (originStop.stationName.includes(stationName) || stationName.includes(originStop.stationName));

        const depTimeMs = hourBaseMs + stop.depMin * 60000;
        if (depTimeMs >= baseTimestamp) {
          const depH = Math.floor((targetHour * 60 + stop.depMin) / 60) % 24;
          const depM = Math.floor(stop.depMin) % 60;
          const timeStr = `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`;

          departures.push({
            id: `dep_tc_${stationName}_${platform}_${depTimeMs}_${p}`,
            lineName: '土浦線',
            trainType: pat.trainType,
            destination: pat.destination,
            departureTime: timeStr,
            departureTimestamp: depTimeMs,
            isOrigin,
          });
        }
      }
    }
  }

  departures.sort((a, b) => a.departureTimestamp - b.departureTimestamp);
  return departures.slice(0, limit);
}
