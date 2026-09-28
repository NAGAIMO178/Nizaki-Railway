import React, { useState, useRef, useEffect } from 'react';
import { Users, ChevronLeft, ChevronRight, MapPin, Moon, Clock, Sparkles, Navigation, Star } from 'lucide-react';
import { RegisterableStation } from './MyStationRegisterCard';
import { findNearestStation } from '../utils/nearestStation';
import { getTsuchiuraDeparturesForStation } from '../utils/tsuchiuraTimetable';
import { getKanzakiDeparturesForStation } from '../utils/kanzakiTimetable';
import { disruptionManager } from '../utils/disruptionManager';

interface MyStationCardProps {
  registeredStations: RegisterableStation[];
  onActiveStationChange?: (stationName: string, platform: 1 | 2) => void;
  onUpdateRegisteredStations?: (stations: RegisterableStation[]) => void;
}

export interface DynamicDeparture {
  id: string;
  lineName: string; // 例: '土浦線', '神埼線', '神埼高速線', '埼千環状線'
  trainType: string;
  destination: string;
  departureTime: string; // HH:mm 形式
  departureTimestamp: number; // 発車エポックミリ秒
  isFirstTrain?: boolean; // 初電タグ
  isLastTrain?: boolean;  // 終電タグ
  isOrigin?: boolean;     // 当駅始発タグ
  delayMinutes?: number;  // 遅延分数
  isSuspended?: boolean;  // 運休・見合わせフラグ
  carCount?: number;      // 両数
}

// 各路線の初電・終電運用スケジュール情報
export interface LineOperatingSchedule {
  lineCode: string;
  firstTrain: string; // "04:30"
  firstTrainMin: number; // 4*60+30 = 270
  firstTrainStation: string; // "大宮"
  lastTrain: string; // "00:15"
  lastTrainMin: number; // 0*60+15 = 15
  lastTrainStation: string; // "東京"
  nightNote: string;
}

export const getLineSchedule = (lineName: string): LineOperatingSchedule => {
  if (lineName.includes('神埼線') || lineName.includes('Y')) {
    return {
      lineCode: 'Y',
      firstTrain: '04:30',
      firstTrainMin: 270, // 4:30
      firstTrainStation: '大宮',
      lastTrain: '00:15',
      lastTrainMin: 15, // 00:15
      lastTrainStation: '東京',
      nightNote: '終電は大宮止まり',
    };
  }
  if (lineName.includes('神埼高速') || lineName.includes('NI')) {
    return {
      lineCode: 'NI',
      firstTrain: '05:00',
      firstTrainMin: 300, // 5:00
      firstTrainStation: '東京',
      lastTrain: '00:30',
      lastTrainMin: 30, // 00:30
      lastTrainStation: '横浜',
      nightNote: '終電は東京・横浜止まり',
    };
  }
  if (lineName.includes('環状') || lineName.includes('SC')) {
    return {
      lineCode: 'SC',
      firstTrain: '04:50',
      firstTrainMin: 290, // 4:50
      firstTrainStation: '大宮',
      lastTrain: '00:10',
      lastTrainMin: 10, // 00:10
      lastTrainStation: '新宿',
      nightNote: '終電は大宮止まり',
    };
  }
  // 土浦線 (TC) デフォルト
  return {
    lineCode: 'TC',
    firstTrain: '04:40',
    firstTrainMin: 280, // 4:40
    firstTrainStation: '日立',
    lastTrain: '00:00',
    lastTrainMin: 0, // 00:00
    lastTrainStation: '松戸',
    nightNote: '終点は鹿島旭止まり',
  };
};

// 指定タイムスタンプが営業中か深夜運休帯かを判定
export const isLineInService = (lineName: string, timestamp: number): boolean => {
  const d = new Date(timestamp);
  const minutesFromMidnight = d.getHours() * 60 + d.getMinutes();
  const schedule = getLineSchedule(lineName);

  if (schedule.lastTrainMin === 0) {
    // 00:00 終電の場合 (土浦線: 00:00〜04:40 は運休)
    return minutesFromMidnight >= schedule.firstTrainMin;
  }

  // 00:15 / 00:30 / 00:10 等の終電の場合
  // 終電分以上かつ初電分未満なら「深夜営業外」
  if (minutesFromMidnight >= schedule.lastTrainMin && minutesFromMidnight < schedule.firstTrainMin) {
    return false;
  }
  return true;
};

// 種別ごとの指定カラーを取得する関数 (浮かない洗練されたトーン＆マナー)
const getTrainTypeBadgeStyle = (trainType: string): { bg: string; dot: string } => {
  if (trainType === '各停(遠距離)') {
    return {
      bg: 'bg-teal-50 text-teal-900 border border-teal-300',
      dot: 'bg-teal-600',
    };
  }
  if (trainType === '各停' || trainType === '普通' || trainType === '各停(近距離)') {
    return {
      bg: 'bg-slate-100 text-slate-800 border border-slate-300',
      dot: 'bg-slate-500',
    };
  }
  if (trainType === '区間快速' || trainType === '区間急行' || trainType === '区快') {
    return {
      bg: 'bg-emerald-50 text-emerald-900 border border-emerald-300',
      dot: 'bg-emerald-600',
    };
  }
  if (trainType === '快速') {
    return {
      bg: 'bg-sky-50 text-sky-900 border border-sky-300',
      dot: 'bg-sky-600',
    };
  }
  if (trainType === '急行') {
    return {
      bg: 'bg-orange-50 text-orange-900 border border-orange-300',
      dot: 'bg-orange-600',
    };
  }
  if (trainType === '特別快速' || trainType === '特快') {
    return {
      bg: 'bg-amber-50 text-amber-950 border border-amber-300',
      dot: 'bg-amber-600',
    };
  }
  if (trainType === '通勤特快' || trainType === '通特') {
    return {
      bg: 'bg-rose-100 text-rose-950 border border-rose-300',
      dot: 'bg-rose-700',
    };
  }
  if (trainType.includes('特急') || trainType.includes('めぐり') || trainType.includes('Nライナー') || trainType.includes('サークル')) {
    return {
      bg: 'bg-purple-100 text-purple-950 border border-purple-300 font-extrabold',
      dot: 'bg-purple-700',
    };
  }
  return {
    bg: 'bg-slate-100 text-slate-800 border border-slate-300',
    dot: 'bg-slate-500',
  };
};

// 路線識別バッジスタイル取得関数 (神埼線・神埼高速線・埼千環状線・土浦線)
const getLineBadgeStyle = (lineName: string): { bg: string; text: string; dot: string; border: string } => {
  if (lineName.includes('高速') || lineName.includes('NI')) {
    return {
      bg: 'bg-blue-600 text-white',
      text: 'text-blue-600',
      dot: 'bg-blue-400',
      border: 'border-blue-700',
    };
  }
  if (lineName.includes('環状') || lineName.includes('SC')) {
    return {
      bg: 'bg-pink-600 text-white',
      text: 'text-pink-600',
      dot: 'bg-pink-400',
      border: 'border-pink-700',
    };
  }
  if (lineName.includes('土浦') || lineName.includes('TC')) {
    return {
      bg: 'bg-emerald-600 text-white',
      text: 'text-emerald-600',
      dot: 'bg-emerald-400',
      border: 'border-emerald-700',
    };
  }
  return {
    bg: 'bg-purple-600 text-white',
    text: 'text-purple-600',
    dot: 'bg-purple-400',
    border: 'border-purple-700',
  };
};

// Station platform availability logic (起点駅・終着駅・ターミナル駅・主要駅の制御)
const getStationPlatformConfig = (stationName: string): { platforms: (1 | 2)[]; defaultPlatform: 1 | 2; label?: string } => {
  // 土浦線の終着駅 (日立: 上り松戸方面のみ)
  if (stationName.includes('日立')) {
    return { platforms: [2], defaultPlatform: 2, label: '終着駅' };
  }
  // 土浦駅（当駅始発がある拠点ターミナル駅：上下線両方あり）
  if (stationName.includes('土浦')) {
    return { platforms: [1, 2], defaultPlatform: 1, label: '拠点駅（始発あり）' };
  }
  // ターミナル駅・主要接続駅 (上下線両方あり)
  if (
    stationName.includes('東京') ||
    stationName.includes('大宮') ||
    stationName.includes('池袋') ||
    stationName.includes('新宿') ||
    stationName.includes('横浜') ||
    stationName.includes('北千住') ||
    stationName.includes('松戸') ||
    stationName.includes('柏')
  ) {
    return { platforms: [1, 2], defaultPlatform: 1, label: 'ターミナル駅' };
  }
  // 高浜などを含む途中の全一般駅（下り1番線・上り2番線の両方あり）
  return { platforms: [1, 2], defaultPlatform: 1 };
};

export interface StationLineOption {
  key: string;
  name: string;
  code: string;
  color: string;
}

// ターミナル駅対応: その駅に発着する路線候補を返す
const getPossibleLinesForStation = (stationName: string, primaryLine: string = ''): StationLineOption[] => {
  const lineOptions: StationLineOption[] = [];

  if (stationName.includes('東京')) {
    lineOptions.push(
      { key: 'Y', name: '神埼線', code: 'Y', color: '#8B5CF6' },
      { key: 'NI', name: '神埼高速線', code: 'NI', color: '#3B82F6' },
      { key: 'SC', name: '埼千環状線', code: 'SC', color: '#EC4899' }
    );
  } else if (stationName.includes('品川')) {
    lineOptions.push(
      { key: 'NI', name: '神埼高速線', code: 'NI', color: '#3B82F6' }
    );
  } else if (stationName.includes('大宮')) {
    lineOptions.push(
      { key: 'Y', name: '神埼線', code: 'Y', color: '#8B5CF6' },
      { key: 'SC', name: '埼千環状線', code: 'SC', color: '#EC4899' }
    );
  } else if (stationName.includes('池袋') || stationName.includes('新宿')) {
    lineOptions.push(
      { key: 'SC', name: '埼千環状線', code: 'SC', color: '#EC4899' }
    );
  } else if (stationName.includes('横浜')) {
    lineOptions.push(
      { key: 'Y', name: '神埼線', code: 'Y', color: '#8B5CF6' },
      { key: 'NI', name: '神埼高速線', code: 'NI', color: '#3B82F6' }
    );
  } else if (stationName.includes('北千住')) {
    lineOptions.push(
      { key: 'Y', name: '神埼線', code: 'Y', color: '#8B5CF6' },
      { key: 'SC', name: '埼千環状線', code: 'SC', color: '#EC4899' }
    );
  } else if (stationName.includes('松戸') || stationName.includes('柏')) {
    lineOptions.push(
      { key: 'TC', name: '土浦線', code: 'TC', color: '#10B981' },
      { key: 'SC', name: '埼千環状線', code: 'SC', color: '#EC4899' }
    );
  }

  if (lineOptions.length > 0) {
    return lineOptions;
  }

  // デフォルトは登録された路線
  if (primaryLine.includes('神埼高速') || primaryLine.includes('NI')) {
    return [{ key: 'NI', name: '神埼高速線', code: 'NI', color: '#3B82F6' }];
  } else if (primaryLine.includes('神埼線') || primaryLine.includes('Y')) {
    return [{ key: 'Y', name: '神埼線', code: 'Y', color: '#8B5CF6' }];
  } else if (primaryLine.includes('環状') || primaryLine.includes('SC')) {
    return [{ key: 'SC', name: '埼千環状線', code: 'SC', color: '#EC4899' }];
  }
  return [{ key: 'TC', name: '土浦線', code: 'TC', color: '#10B981' }];
};

// 路線・種別ごとの停車駅マップ
const LINE_STOP_STATIONS: Record<string, Record<string, string[]>> = {
  TC: { // 土浦線
    '普通': [],
    '各停': [],
    '区間快速': [
      '松戸', '新松戸', '松が丘', '柏', '守谷', '谷井田', '森の里', '荒川沖', '土浦',
      '高浜', '茨城空港', '鹿島旭', '大洗', '那珂湊', '平磯', 'ひたちなか海浜公園', '日立'
    ],
    '快速': ['松戸', '柏', '守谷', '谷井田', '森の里', '土浦', '高浜', '茨城空港', '平磯', 'ひたちなか海浜公園', '日立'],
    '特別快速': ['松戸', '柏', '土浦', '高浜', '茨城空港'],
    '通勤特快': ['松戸', '柏', '守谷', '森の里', '高浜', '茨城空港'],
    '特急めぐり': ['松戸', '柏', '土浦', 'ひたちなか海浜公園', '日立'],
  },
  Y: { // 神埼線
    '各停': [],
    '普通': [],
    '急行': [
      '東京', '北千住', '草加', '越谷レイクタウン', '大宮',
      '朝霞台', 'ひばりヶ丘', '調布', '生田', '溝の口', '新横浜', '横浜'
    ],
    '特急Nライナー': [
      '東京', '北千住', '越谷レイクタウン', '大宮',
      'ひばりヶ丘', '調布', '溝の口', '新横浜', '横浜'
    ],
    '特急（Nライナー）': [
      '東京', '北千住', '越谷レイクタウン', '大宮',
      'ひばりヶ丘', '調布', '溝の口', '新横浜', '横浜'
    ],
  },
  NI: { // 神埼高速線
    '各停': [],
    '普通': [],
    '急行': ['東京', '新橋', '品川', '川崎', '横浜'],
    '特急めぐり': ['東京', '品川', '川崎', '横浜'],
  },
  SC: { // 埼千環状線
    '各停': [],
    '普通': [],
    '快速': ['東京', '南千住', '北千住', '松戸', '柏', '春日部', '岩槻', '大宮', 'さいたま新都心', '川口', '小竹向原', '池袋', '新宿'],
    '急行': ['東京', '北千住', '松戸', '柏', '春日部', '岩槻', '大宮', '池袋', '新宿'],
    '特急（サークルエクスプレス）': ['東京', '松戸', '柏', '大宮', '池袋', '新宿'],
  },
};

const isTrainStoppingAtStation = (lineKey: string, trainType: string, stationName: string): boolean => {
  const lineStops = LINE_STOP_STATIONS[lineKey];
  if (!lineStops) return true;

  const stops = lineStops[trainType];
  if (!stops || stops.length === 0) return true;

  return stops.some((s) => stationName.includes(s) || s.includes(stationName));
};

const getStoppingTrainTypesAndRatio = (
  lineKey: string,
  stationName: string
): { availableTypes: { trainType: string; weight: number }[]; ratio: number } => {
  let allTypes: { trainType: string; weight: number }[] = [];

  if (lineKey === 'TC') {
    allTypes = [
      { trainType: '特急めぐり', weight: 1 },
      { trainType: '通勤特快', weight: 1 },
      { trainType: '特別快速', weight: 1.5 },
      { trainType: '快速', weight: 2 },
      { trainType: '区間快速', weight: 2.5 },
      { trainType: '普通', weight: 5 },
    ];
  } else if (lineKey === 'Y') {
    allTypes = [
      { trainType: '特急（Nライナー）', weight: 1.5 },
      { trainType: '急行', weight: 3.5 },
      { trainType: '区間急行', weight: 3 },
      { trainType: '各停', weight: 6 },
    ];
  } else if (lineKey === 'NI') {
    allTypes = [
      { trainType: '特急めぐり', weight: 2 },
      { trainType: '急行', weight: 3 },
      { trainType: '各停', weight: 5 },
    ];
  } else if (lineKey === 'SC') {
    allTypes = [
      { trainType: '特急（サークルエクスプレス）', weight: 1.5 },
      { trainType: '急行', weight: 2.5 },
      { trainType: '快速', weight: 3.5 },
      { trainType: '各停', weight: 5.5 },
    ];
  } else {
    allTypes = [{ trainType: '各停', weight: 1 }];
  }

  const totalWeight = allTypes.reduce((sum, item) => sum + item.weight, 0);
  const availableTypes = allTypes.filter((item) =>
    isTrainStoppingAtStation(lineKey, item.trainType, stationName)
  );

  const availableWeight = availableTypes.reduce((sum, item) => sum + item.weight, 0);
  const ratio = totalWeight > 0 ? availableWeight / totalWeight : 1;

  if (availableTypes.length === 0) {
    const fallbackType = lineKey === 'Y' || lineKey === 'NI' || lineKey === 'SC' ? '各停' : '普通';
    return {
      availableTypes: [{ trainType: fallbackType, weight: 1 }],
      ratio: 1,
    };
  }

  return { availableTypes, ratio };
};

// シード値を用いた確定的擬似乱数生成関数
function seededRandom(seed: number): number {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

// 単一路線に特化した決定論的列車生成ロジック
const generateDeterministicDepartureForLine = (
  lineKey: string,
  stationName: string,
  platform: 1 | 2,
  baseTimestamp: number
): DynamicDeparture => {
  const seed = stringToSeed(`${lineKey}_${stationName}_${platform}_${baseTimestamp}`);

  const lineNames: Record<string, string> = {
    Y: '神埼線',
    NI: '神埼高速線',
    SC: '埼千環状線',
    TC: '土浦線',
  };
  const fullLineName = lineNames[lineKey] || '神埼線';

  const { availableTypes } = getStoppingTrainTypesAndRatio(lineKey, stationName);
  const totalWeight = availableTypes.reduce((sum, item) => sum + item.weight, 0);
  let randomVal = seededRandom(seed + 1) * totalWeight;
  let trainType = availableTypes[0]?.trainType || '各停';

  for (const item of availableTypes) {
    if (randomVal < item.weight) {
      trainType = item.trainType;
      break;
    }
    randomVal -= item.weight;
  }

  let rawDestinations: string[] = [];

  // 1. 土浦線 (TC)
  if (lineKey === 'TC') {
    if (platform === 1) {
      rawDestinations = ['守谷', '土浦', '茨城空港', '大洗', 'ひたちなか海浜公園', '日立'];
    } else {
      rawDestinations = ['新松戸', '松戸'];
    }
  }
  // 2. 神埼線 (Y)
  else if (lineKey === 'Y') {
    if (trainType.includes('特急')) {
      rawDestinations = platform === 1 ? ['大宮', '新横浜', '横浜'] : ['東京', '北千住'];
    } else if (platform === 1) {
      rawDestinations = ['草加', '越谷レイクタウン', '地下鉄岩槻', '大宮', '朝霞台', '田無', '調布', '新横浜', '横浜'];
    } else {
      rawDestinations = ['東京', '浅草', '北千住', '大宮'];
    }
  }
  // 3. 神埼高速線 (NI)
  else if (lineKey === 'NI') {
    if (platform === 1) {
      rawDestinations = ['品川', '川崎', '横浜'];
    } else {
      rawDestinations = ['新橋', '東京'];
    }
  }
  // 4. 埼千環状線 (SC)
  else if (lineKey === 'SC') {
    if (platform === 1) {
      rawDestinations = ['北千住', '松戸', '柏', '春日部', '大宮', '新宿', '外回り(新宿方面)'];
    } else {
      rawDestinations = ['新宿', '池袋', '小竹向原', '川口', '大宮', '東京', '内回り(東京方面)'];
    }
  }

  // 自駅を行き先から排除
  const filteredDestinations = rawDestinations.filter((d) => !d.includes(stationName) && d !== stationName);
  const destIdx = Math.floor(seededRandom(seed + 2) * (filteredDestinations.length || 1));
  let destination = filteredDestinations.length > 0
    ? filteredDestinations[destIdx]
    : (platform === 1 ? (lineKey === 'SC' ? '大宮' : '横浜') : (lineKey === 'SC' ? '新宿' : '東京'));

  const d = new Date(baseTimestamp);
  const minutesFromMidnight = d.getHours() * 60 + d.getMinutes();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  const schedule = getLineSchedule(fullLineName);
  let isFirstTrain = false;
  let isLastTrain = false;

  if (
    minutesFromMidnight >= schedule.firstTrainMin &&
    minutesFromMidnight < schedule.firstTrainMin + 20
  ) {
    isFirstTrain = true;
    if (lineKey === 'TC') destination = platform === 1 ? '日立' : '松戸';
    else if (lineKey === 'Y') destination = platform === 1 ? '大宮' : '東京';
    else if (lineKey === 'NI') destination = platform === 1 ? '横浜' : '東京';
    else if (lineKey === 'SC') destination = platform === 1 ? '大宮' : '東京';
  }

  const isAroundLastTrain =
    (schedule.lastTrainMin === 0 && (minutesFromMidnight >= 23 * 60 + 45 || minutesFromMidnight === 0)) ||
    (schedule.lastTrainMin > 0 &&
      ((minutesFromMidnight >= 23 * 60 + 50) ||
        (minutesFromMidnight >= 0 && minutesFromMidnight <= schedule.lastTrainMin)));

  if (isAroundLastTrain) {
    isLastTrain = true;
    if (lineKey === 'TC') destination = platform === 1 ? '鹿島旭' : '松戸';
    else if (lineKey === 'Y') destination = platform === 1 ? '大宮' : '東京';
    else if (lineKey === 'NI') destination = platform === 1 ? '横浜' : '東京';
    else if (lineKey === 'SC') destination = platform === 1 ? '大宮' : '新宿';
  }

  const originStations = ['松戸', '土浦', '東京', '大宮', '横浜', '池袋', '新宿'];
  const isSC = lineKey === 'SC';
  const isOrigin = !isSC && platform === 1 && originStations.some((s) => stationName.includes(s));

  const lineCodeToId: Record<string, string> = {
    Y: 'kanzaki',
    NI: 'kanzaki_kosoku',
    SC: 'saichi',
    TC: 'tsuchiura',
  };
  const lineId = lineCodeToId[lineKey] || 'kanzaki';
  const effectiveDelay = disruptionManager.getEffectiveDelayForTrain(lineId, baseTimestamp);

  return {
    id: `train-${lineKey}-${stationName}-${platform}-${baseTimestamp}`,
    lineName: fullLineName,
    trainType,
    destination,
    departureTime: `${hours}:${minutes}`,
    departureTimestamp: baseTimestamp,
    isFirstTrain,
    isLastTrain,
    isOrigin,
    delayMinutes: effectiveDelay.delayMinutes,
    isSuspended: effectiveDelay.isSuspended,
  };
};

// 確定的な駅別発車リスト生成関数（複数路線駅は乱数・確率的に路線をミックス）
const getDeterministicDeparturesForStation = (
  station: RegisterableStation,
  platform: 1 | 2,
  baseTimestamp: number,
  limit: number = 3
): DynamicDeparture[] => {
  const stationName = station.name || '';
  const possibleLines = getPossibleLinesForStation(stationName, station.lineName || '');

  // 1路線のみで公式時刻表（土浦線専用駅）がある場合
  if (possibleLines.length === 1 && possibleLines[0].key === 'TC') {
    const tcList = getTsuchiuraDeparturesForStation(stationName, platform, baseTimestamp, limit);
    if (tcList.length > 0) {
      return tcList.map((dep) => {
        const eff = disruptionManager.getEffectiveDelayForTrain('tsuchiura', dep.departureTimestamp || dep.id);
        return {
          ...dep,
          delayMinutes: eff.delayMinutes,
          isSuspended: eff.isSuspended,
        };
      });
    }
  }

  // 複数路線乗り入れ駅または一般駅：3〜4分間隔で乱数的に路線を振り分けて列車を生成
  const intervalMinutes = 4;
  const offsetMinutes = platform === 1 ? 1 : 3;
  const result: DynamicDeparture[] = [];
  const baseDate = new Date(baseTimestamp);

  const startMs = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    baseDate.getHours(),
    0,
    0,
    0
  ).getTime();

  for (let min = 0; min <= 360; min += intervalMinutes) {
    const ts = startMs + (min + offsetMinutes) * 60 * 1000;
    if (ts >= baseTimestamp - 30 * 1000) {
      // 乱数シードを用いてその駅の乗り入れ路線からランダムに1本選出
      const seed = stringToSeed(`${stationName}_${platform}_${ts}`);
      const lineIdx = Math.floor(seededRandom(seed) * possibleLines.length);
      const chosenLine = possibleLines[lineIdx] || possibleLines[0];

      result.push(generateDeterministicDepartureForLine(chosenLine.key, stationName, platform, ts));
      if (result.length >= limit) break;
    }
  }

  return result;
};

export const MyStationCard: React.FC<MyStationCardProps> = ({
  registeredStations,
  onActiveStationChange,
}) => {
  // GPS検出による最寄駅情報（マイ駅配列 registeredStations とは完全独立）
  const [nearestStation, setNearestStation] = useState<(RegisterableStation & { dist: number }) | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const [platform, setPlatform] = useState<1 | 2>(1); // 1番線: 下り, 2番線: 上り
  const [now, setNow] = useState<number>(Date.now());
  const touchStartX = useRef<number | null>(null);

  // 動的発車列車リスト (常に3本維持)
  const [departures, setDepartures] = useState<DynamicDeparture[]>([]);

  // 5秒ごとに現在時刻を更新するタイマー + 運行指令変更の購読
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 5000);

    const unsubscribe = disruptionManager.subscribe(() => {
      setNow(Date.now());
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const DEFAULT_TOKYO_STATION: RegisterableStation = {
    id: 'kanzaki_Y01',
    name: '東京',
    code: 'Y01',
    lineName: '1. 神埼線',
  };

  const effectiveMyStations = registeredStations.length > 0 ? registeredStations : [DEFAULT_TOKYO_STATION];

  // 表示用ステーションリスト: 最寄駅が検出されておりマイ駅リストに含まれなければ、マイ駅のシステム（3駅上限）を汚さずに表示用にのみ先頭合成
  const displayStations: RegisterableStation[] = React.useMemo(() => {
    if (!nearestStation) return effectiveMyStations;
    const exists = effectiveMyStations.some(
      (s) => s.name === nearestStation.name || nearestStation.name.includes(s.name) || s.name.includes(nearestStation.name)
    );
    if (exists) return effectiveMyStations;
    return [nearestStation, ...effectiveMyStations];
  }, [nearestStation, effectiveMyStations]);

  const safeIndex = Math.min(activeIndex, Math.max(0, displayStations.length - 1));
  const currentStation = displayStations[safeIndex];

  // 現在時刻(now)・駅・ホーム(platform)に基づく確定的列車リストの自動更新
  useEffect(() => {
    if (!isLineInService(currentStation.lineName, now)) {
      setDepartures([]);
      return;
    }

    const list = getDeterministicDeparturesForStation(currentStation, platform, now, 3);
    setDepartures(list);
  }, [now, platform, activeIndex, currentStation.name, currentStation.lineName]);

  // GPSによる最寄駅の完全独立判定（マイ駅リスト registeredStations には一切追加・干渉しない）
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await findNearestStation();
        if (isMounted && res.isWithinRange && res.station) {
          setNearestStation({
            ...res.station,
            dist: res.distanceKm,
          });
        }
      } catch {
        // GPS利用不可時の処理
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const platformConfig = getStationPlatformConfig(currentStation.name);

  // Auto-adjust platform and sync header station immediately
  useEffect(() => {
    const config = getStationPlatformConfig(currentStation.name);
    let activePlat = platform;
    if (!config.platforms.includes(platform)) {
      activePlat = config.defaultPlatform;
      setPlatform(activePlat);
    }
    if (onActiveStationChange) {
      onActiveStationChange(currentStation.name, activePlat);
    }
  }, [currentStation.name, platform]);

  const handlePrev = () => {
    if (displayStations.length <= 1) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : displayStations.length - 1));
  };

  const handleNext = () => {
    if (displayStations.length <= 1) return;
    setActiveIndex((prev) => (prev < displayStations.length - 1 ? prev + 1 : 0));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartX.current = null;
  };

  // 現在表示中の駅が最寄駅か判断
  const isCurrentNearest = nearestStation && (
    currentStation.name === nearestStation.name ||
    nearestStation.name.includes(currentStation.name) ||
    currentStation.name.includes(nearestStation.name)
  );

  return (
    <div className="space-y-3">
      {/* Station Title & Swipe Carousel Navigation Bar */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="bg-white border border-[#E6E2EE] rounded-2xl p-3 shadow-xs select-none space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              disabled={displayStations.length <= 1}
              className={`p-1 rounded-lg border transition-all cursor-pointer ${
                displayStations.length <= 1
                  ? 'opacity-30 border-transparent text-[#857D99]'
                  : 'border-[#E6E2EE] hover:bg-[#F4F3F8] text-[#221C35]'
              }`}
              title="前の駅"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#5B21B6]" />
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-base font-black text-[#221C35]">
                  {currentStation.name}駅
                </span>
                {isCurrentNearest && nearestStation && (
                  <span className="text-[10px] font-bold text-purple-900 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                    <Navigation className="w-2.5 h-2.5 shrink-0 fill-current text-purple-700" />
                    最寄り (約{nearestStation.dist}km)
                  </span>
                )}
                {currentStation.code && (
                  <span className="text-[11px] font-mono font-bold text-[#857D99]">
                    ({currentStation.code})
                  </span>
                )}
                <span className="text-[11px] text-[#6B6380] hidden xs:inline">
                  {currentStation.lineName.replace(/^[0-9]\.\s*/, '')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleNext}
              disabled={displayStations.length <= 1}
              className={`p-1 rounded-lg border transition-all cursor-pointer ${
                displayStations.length <= 1
                  ? 'opacity-30 border-transparent text-[#857D99]'
                  : 'border-[#E6E2EE] hover:bg-[#F4F3F8] text-[#221C35]'
              }`}
              title="次の駅"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dots Indicator */}
        {displayStations.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            {displayStations.map((st, idx) => (
              <button
                type="button"
                key={`${st.id}_${idx}`}
                onClick={() => setActiveIndex(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === safeIndex
                    ? 'w-5 bg-[#5B21B6]'
                    : 'w-1.5 bg-[#D1C9E3] hover:bg-[#857D99]'
                }`}
                title={st.name}
              />
            ))}
          </div>
        )}

        {/* Platform Slide Switcher (番線・上り/下り スライド切替) */}
        <div className="pt-1.5 border-t border-[#F0EEF6] flex items-center justify-end gap-2">
          {/* Segmented Slide Switch Control */}
          <div className="bg-[#F4F3F8] p-0.5 rounded-lg border border-[#E6E2EE] flex items-center gap-0.5 shrink-0 ml-auto">
            {platformConfig.platforms.includes(1) && (
              <button
                type="button"
                onClick={() => setPlatform(1)}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  platform === 1
                    ? 'bg-[#5B21B6] text-white shadow-xs'
                    : 'text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                1番線 (下り)
              </button>
            )}
            {platformConfig.platforms.includes(2) && (
              <button
                type="button"
                onClick={() => setPlatform(2)}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  platform === 2
                    ? 'bg-[#5B21B6] text-white shadow-xs'
                    : 'text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                2番線 (上り)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3 Dynamic Departure Cards or Night Service Over Notice */}
      <div className="space-y-2 relative">
        {!isLineInService(currentStation.lineName, now) || departures.length === 0 ? (
          <div className="bg-gradient-to-br from-[#1E1B2E] via-[#2A2440] to-[#1E1B2E] border border-purple-800/50 text-white rounded-2xl p-4 sm:p-5 shadow-md space-y-3 relative overflow-hidden">
            {/* Subtle glow background element */}
            <div className="absolute -top-12 -right-12 w-36 h-36 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-500/20 rounded-xl border border-purple-400/30">
                  <Moon className="w-5 h-5 text-amber-300 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                    本日の運行は終了いたしました
                  </h4>
                  <p className="text-[11px] text-purple-200/80">
                    深夜時間帯（終電〜初電）のため列車の発車はありません
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-md whitespace-nowrap shrink-0">
                深夜・運休時間帯
              </span>
            </div>

            {/* Schedule Info Box & Real-time Countdown */}
            {(() => {
              const sched = getLineSchedule(currentStation.lineName);
              const d = new Date(now);
              const currentMinutes = d.getHours() * 60 + d.getMinutes();
              let diffMin = sched.firstTrainMin - currentMinutes;
              if (diffMin <= 0) diffMin += 24 * 60;
              const hoursLeft = Math.floor(diffMin / 60);
              const minsLeft = diffMin % 60;

              return (
                <div className="bg-black/30 backdrop-blur-xs rounded-xl p-3 border border-white/10 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between bg-purple-950/60 p-2.5 rounded-lg border border-purple-400/20">
                    <span className="text-purple-200 text-xs font-bold flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-purple-300 animate-spin" />
                      明日の初電 ({sched.firstTrain}発) まで
                    </span>
                    <span className="text-sm font-extrabold text-amber-300 font-mono">
                      あと {hoursLeft > 0 ? `${hoursLeft}時間 ` : ''}{minsLeft}分
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5 bg-white/5 p-2 rounded-lg">
                      <span className="text-[10px] text-purple-300 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-purple-300" /> 明日の初電時刻
                      </span>
                      <div className="text-base font-extrabold text-white font-mono">
                        {sched.firstTrain} <span className="text-[10px] font-normal text-purple-200">({sched.firstTrainStation}発)</span>
                      </div>
                    </div>

                    <div className="space-y-0.5 bg-white/5 p-2 rounded-lg">
                      <span className="text-[10px] text-purple-300 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3 text-rose-400" /> 本日の終電時刻
                      </span>
                      <div className="text-base font-extrabold text-white font-mono">
                        {sched.lastTrain} <span className="text-[10px] font-normal text-purple-200">({sched.lastTrainStation}発)</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-white/10 text-[11px] text-purple-200/90 flex items-center justify-between gap-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                      運用メモ: {sched.nightNote}
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono font-bold">神埼鉄道中央指令所</span>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          departures.map((dep, idx) => {
            const remainingSec = Math.max(0, Math.floor((dep.departureTimestamp - now) / 1000));
            const isImminent = idx === 0 && remainingSec <= 45; // 残り45秒以下で発車目前白点滅
            const typeBadgeStyle = getTrainTypeBadgeStyle(dep.trainType);
            const lineBadgeStyle = getLineBadgeStyle(dep.lineName);

            return (
              <div
                key={dep.id}
                className={`rounded-xl px-3.5 py-2.5 transition-all duration-500 flex items-center justify-between gap-2 relative overflow-hidden ${
                  isImminent
                    ? 'bg-[#5B21B6] border-2 border-white text-white shadow-[0_0_25px_rgba(255,255,255,0.9)] animate-pulse ring-4 ring-purple-300/80 scale-[1.02] z-10'
                    : 'bg-white border border-[#E6E2EE] text-[#221C35] shadow-xs hover:border-[#5B21B6]'
                }`}
              >
                {/* White glowing aura overlay on imminent departure */}
                {isImminent && (
                  <div className="absolute inset-0 bg-white/20 backdrop-blur-[1px] pointer-events-none animate-ping opacity-30" />
                )}

                {/* Left: Line Badge, Train Type Badge, First/Last Train Badges & Destination */}
                <div className="flex items-center gap-1.5 xs:gap-2 min-w-0 z-10 flex-wrap sm:flex-nowrap">
                  {/* 路線識別バッジ */}
                  <span
                    className={`text-[9px] xs:text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 border border-black/10 shadow-2xs ${
                      isImminent ? 'bg-white/20 text-white border-white/40' : lineBadgeStyle.bg
                    }`}
                  >
                    {dep.lineName.replace(/^[0-9]\.\s*/, '')}
                  </span>

                  {/* 種別バッジ */}
                  <span
                    className={`text-[10px] xs:text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap flex items-center gap-1.5 ${
                      isImminent
                        ? 'bg-white text-[#5B21B6] font-extrabold shadow-xs'
                        : typeBadgeStyle.bg
                    }`}
                  >
                    {!isImminent && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeBadgeStyle.dot}`} />
                    )}
                    {dep.trainType}
                  </span>

                  {/* 初電・終電特別タグ・遅延タグ */}
                  {dep.isSuspended ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white border border-rose-700 animate-pulse whitespace-nowrap shrink-0 shadow-2xs">
                      [見合わせ]
                    </span>
                  ) : dep.delayMinutes && dep.delayMinutes > 0 ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-white border border-amber-600 whitespace-nowrap shrink-0 shadow-2xs">
                      [+{dep.delayMinutes}分遅れ]
                    </span>
                  ) : null}
                  {dep.isOrigin && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#8B5CF6] text-white border border-purple-700 whitespace-nowrap shrink-0 shadow-2xs">
                      [当駅始発]
                    </span>
                  )}
                  {dep.isLastTrain && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white border border-rose-700 animate-pulse whitespace-nowrap shrink-0 shadow-2xs">
                      [終電]
                    </span>
                  )}
                  {dep.isFirstTrain && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#D946EF] text-white border border-pink-600 whitespace-nowrap shrink-0 shadow-2xs">
                      [初電]
                    </span>
                  )}

                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs xs:text-sm font-bold truncate ${isImminent ? 'text-white font-black' : 'text-[#221C35]'}`}>
                      {dep.destination} 行き
                    </span>
                  </div>
                </div>

                {/* Right: Departure Time & Congestion Icon */}
                <div className="flex items-center gap-2 shrink-0 z-10">
                  <div className="text-right">
                    <div
                      className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${
                        isImminent ? 'text-white drop-shadow-md' : 'text-[#221C35]'
                      }`}
                    >
                      {dep.departureTime}
                    </div>
                    {!isImminent && (
                      <div className="text-[9px] text-[#857D99] font-bold">
                        {Math.floor(remainingSec / 60)}分後
                      </div>
                    )}
                  </div>
                  <Users className={`w-3.5 h-3.5 ${isImminent ? 'text-white/80' : 'text-[#857D99]'}`} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
