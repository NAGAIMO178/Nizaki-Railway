// 神埼鉄道 土浦線 駅時刻表データ (標準5駅: 松戸・柏・土浦・茨城空港・日立)
// 5:00始発〜24:00台終電 / 最低運転間隔3分・緩急接続(待避)考慮済み
// 各停は茨城空港で遠近分離(近距離:松戸〜茨城空港/遠距離:茨城空港〜日立)
// 凡例: (無印)各停(近距離), M(特急めぐり), T(特別快速), K(快速), S(区間快速), L(各停(遠距離)), C(通勤特快)

export type TrainTypeCode = 'M' | 'T' | 'K' | 'S' | 'L' | 'C' | 'LOCAL';

export interface TimetableEntry {
  minute: number;
  typeCode: TrainTypeCode;
  typeName: string;
  destination: string;
  carCount: number;
  note?: string;
}

export interface HourSchedule {
  hour: number;
  trains: TimetableEntry[];
}

export interface StationDirectionTimetable {
  stationName: string;
  stationCode: string;
  direction: 1 | 2; // 1: 下り(日立方面), 2: 上り(松戸方面)
  directionLabel: string;
  totalDailyTrains: number;
  hours: HourSchedule[];
}

export interface StationTimetableConfig {
  stationName: string;
  stationCode: string;
  description: string;
  platforms: {
    1?: { label: string; direction: 1; destination: string };
    2?: { label: string; direction: 2; destination: string };
  };
  down?: StationDirectionTimetable;
  up?: StationDirectionTimetable;
}

// 凡例マスター定義
export const TRAIN_TYPE_LEGEND: Record<TrainTypeCode, {
  name: string;
  code: TrainTypeCode;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  shortLabel: string;
  description: string;
  stopsDescription: string;
  defaultCars: number;
}> = {
  LOCAL: {
    name: '各停',
    code: 'LOCAL',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-800 dark:text-slate-200',
    badgeBorder: 'border-slate-300 dark:border-slate-600',
    shortLabel: '各停',
    description: '松戸〜茨城空港間の各駅に停車(茨城空港止まり)',
    stopsDescription: '松戸〜茨城空港間の各駅に停車します。茨城空港止まり（鹿島旭〜日立へは行きません）。',
    defaultCars: 8,
  },
  M: {
    name: '特急めぐり',
    code: 'M',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/60',
    badgeText: 'text-purple-700 dark:text-purple-300',
    badgeBorder: 'border-purple-300 dark:border-purple-700',
    shortLabel: '特急',
    description: '松戸・柏・土浦・ひたちなか海浜公園・日立に停車 (要特急券)',
    stopsDescription: '主要拠点のみに停車する最速達列車です。全席指定席・車内WiFi・モバイルオーダー対応。',
    defaultCars: 10,
  },
  T: {
    name: '特別快速',
    code: 'T',
    badgeBg: 'bg-orange-100 dark:bg-orange-950/60',
    badgeText: 'text-orange-700 dark:text-orange-300',
    badgeBorder: 'border-orange-300 dark:border-orange-700',
    shortLabel: '特快',
    description: '松戸・柏・土浦・高浜・茨城空港 (茨城空港ゆき)',
    stopsDescription: '空港アクセス用の高速快速列車です。茨城空港止まりとなります。',
    defaultCars: 10,
  },
  K: {
    name: '快速',
    code: 'K',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/60',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'border-blue-300 dark:border-blue-700',
    shortLabel: '快速',
    description: '主要駅+一部停車、日立まで運行',
    stopsDescription: '日立方面への基幹快速です。松戸・新松戸・柏・守谷・土浦・高浜・茨城空港・鹿島旭・大洗・那珂湊・平磯・ひたちなか海浜公園・大甕・多賀・日立に停車。',
    defaultCars: 8,
  },
  S: {
    name: '区間快速',
    code: 'S',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-300 dark:border-emerald-700',
    shortLabel: '区快',
    description: '松戸-茨城空港間は各駅、以降は主要駅のみ',
    stopsDescription: '松戸〜茨城空港間は各駅に停車し、茨城空港以北は主要駅に停車します。',
    defaultCars: 8,
  },
  L: {
    name: '各停(遠距離)',
    code: 'L',
    badgeBg: 'bg-teal-100 dark:bg-teal-950/60',
    badgeText: 'text-teal-800 dark:text-teal-200',
    badgeBorder: 'border-teal-300 dark:border-teal-700',
    shortLabel: '各停(遠)',
    description: '茨城空港-日立間の各駅に停車 (松戸方面へ直通せず)',
    stopsDescription: '茨城空港〜日立間のみの運行です。松戸方面へは直通しません。',
    defaultCars: 8,
  },
  C: {
    name: '通勤特快',
    code: 'C',
    badgeBg: 'bg-pink-100 dark:bg-pink-950/60',
    badgeText: 'text-pink-700 dark:text-pink-300',
    badgeBorder: 'border-pink-300 dark:border-pink-700',
    shortLabel: '通特',
    description: '朝夕ラッシュ限定 (茨城空港ゆき)',
    stopsDescription: '平日の通勤・通学ラッシュ時間帯に運行される直通特快です。茨城空港止まり。',
    defaultCars: 10,
  },
};

// ヘルパー: 文字列トークン(例 "00M", "10K", "04", "25S", "10L", "20C")をTimetableEntryにパース
function parseRawTokens(tokens: string[], direction: 1 | 2): TimetableEntry[] {
  return tokens.map((token) => {
    let minuteStr = '';
    let typeCode: TrainTypeCode = 'LOCAL';

    if (token.endsWith('M')) {
      typeCode = 'M';
      minuteStr = token.slice(0, -1);
    } else if (token.endsWith('T')) {
      typeCode = 'T';
      minuteStr = token.slice(0, -1);
    } else if (token.endsWith('K')) {
      typeCode = 'K';
      minuteStr = token.slice(0, -1);
    } else if (token.endsWith('S')) {
      typeCode = 'S';
      minuteStr = token.slice(0, -1);
    } else if (token.endsWith('L')) {
      typeCode = 'L';
      minuteStr = token.slice(0, -1);
    } else if (token.endsWith('C')) {
      typeCode = 'C';
      minuteStr = token.slice(0, -1);
    } else {
      minuteStr = token;
      typeCode = 'LOCAL';
    }

    const minute = parseInt(minuteStr, 10);
    const legend = TRAIN_TYPE_LEGEND[typeCode];

    // 行き先の決定
    let destination = direction === 1 ? '日立' : '松戸';
    if (direction === 1) {
      if (typeCode === 'T' || typeCode === 'C' || typeCode === 'LOCAL') {
        destination = '茨城空港';
      }
    } else {
      if (typeCode === 'L') {
        destination = '茨城空港';
      }
    }

    return {
      minute,
      typeCode,
      typeName: legend.name,
      destination,
      carCount: legend.defaultCars,
    };
  });
}

// ------------------------------------------------------------
// 1. 松戸駅 時刻表 (201本/日)
// ------------------------------------------------------------
const MATSUDO_DOWN: HourSchedule[] = [
  { hour: 5, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 6, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40C', '43K', '49', '55S'], 1) },
  { hour: 7, trains: parseRawTokens(['00M', '03C', '06', '10K', '20C', '25S', '30T', '33', '36', '40C', '43K', '49', '55S'], 1) },
  { hour: 8, trains: parseRawTokens(['00M', '03C', '06', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 9, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 10, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 11, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 12, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 13, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 14, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 15, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 16, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 17, trains: parseRawTokens(['00M', '04', '10K', '20C', '25S', '30T', '33', '36', '40C', '43K', '49', '55S'], 1) },
  { hour: 18, trains: parseRawTokens(['00M', '03C', '06', '10K', '20C', '25S', '30T', '33', '36', '40C', '43K', '49', '55S'], 1) },
  { hour: 19, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 20, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 21, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 22, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 23, trains: parseRawTokens(['00M', '04', '10K', '19', '25S', '30T', '34', '40K', '49', '55S'], 1) },
  { hour: 0, trains: parseRawTokens(['00M'], 1) },
];

// ------------------------------------------------------------
// 2. 柏駅 時刻表 (201本/日)
// ------------------------------------------------------------
const KASHIWA_DOWN: HourSchedule[] = [
  { hour: 5, trains: parseRawTokens(['10M', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 6, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50C', '53K'], 1) },
  { hour: 7, trains: parseRawTokens(['02', '10M', '13C', '16S', '20K', '24', '30C', '40T', '43S', '46', '50C', '53K', '57'], 1) },
  { hour: 8, trains: parseRawTokens(['02', '10M', '13C', '16S', '20K', '24', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 9, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 10, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 11, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 12, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 13, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 14, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 15, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 16, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 17, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '30C', '40T', '43S', '46', '50C', '53K', '57'], 1) },
  { hour: 18, trains: parseRawTokens(['02', '10M', '13C', '16S', '20K', '24', '30C', '40T', '43S', '46', '50C', '53K', '57'], 1) },
  { hour: 19, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 20, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 21, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 22, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 23, trains: parseRawTokens(['02', '10M', '13S', '17', '20K', '32', '40T', '43S', '47', '50K'], 1) },
  { hour: 0, trains: parseRawTokens(['02', '10M', '13S'], 1) },
];

const KASHIWA_UP: HourSchedule[] = [
  { hour: 5, trains: parseRawTokens(['52'], 2) },
  { hour: 6, trains: parseRawTokens(['07', '11M', '15T', '25', '33K', '41', '49S', '56'], 2) },
  { hour: 7, trains: parseRawTokens(['03K', '11M', '15T', '20', '24C', '29S', '33K', '39', '44C', '49S', '53', '56'], 2) },
  { hour: 8, trains: parseRawTokens(['04C', '08K', '11M', '15T', '24C', '29S', '33K', '36', '39', '44C', '49S', '53', '56'], 2) },
  { hour: 9, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 10, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 11, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 12, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 13, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 14, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 15, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 16, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 17, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 18, trains: parseRawTokens(['04C', '08K', '11M', '15T', '24C', '29S', '33K', '36', '39', '44C', '49S', '53', '56'], 2) },
  { hour: 19, trains: parseRawTokens(['04C', '08K', '11M', '15T', '24C', '29S', '33K', '36', '39', '42', '49S', '56'], 2) },
  { hour: 20, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 21, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 22, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 23, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S', '56'], 2) },
  { hour: 0, trains: parseRawTokens(['03K', '11M', '15T', '20', '25S', '29', '33K', '41', '49S'], 2) },
  { hour: 1, trains: parseRawTokens(['03K', '11M', '25S'], 2) },
];

// ------------------------------------------------------------
// 3. 土浦駅 時刻表 (201本/日)
// ------------------------------------------------------------
const TSUCHIURA_DOWN: HourSchedule[] = [
  { hour: 5, trains: parseRawTokens(['31M', '46K', '51'], 1) },
  { hour: 6, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 7, trains: parseRawTokens(['02T', '05', '10S', '15C', '19K', '24', '31M', '38C', '46K', '49S', '55C', '58'], 1) },
  { hour: 8, trains: parseRawTokens(['02T', '05', '10S', '15C', '19K', '24', '27', '31M', '38C', '46K', '49S', '52', '55'], 1) },
  { hour: 9, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 10, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 11, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 12, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 13, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 14, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 15, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 16, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 17, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51', '55C'], 1) },
  { hour: 18, trains: parseRawTokens(['02T', '10S', '15C', '19K', '24', '27', '31M', '38C', '46K', '49S', '55C', '58'], 1) },
  { hour: 19, trains: parseRawTokens(['02T', '05', '10S', '15C', '19K', '24', '27', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 20, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 21, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 22, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 23, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S', '46K', '51'], 1) },
  { hour: 0, trains: parseRawTokens(['02T', '05', '10S', '16K', '21', '31M', '36', '40S'], 1) },
];

const TSUCHIURA_UP: HourSchedule[] = [
  { hour: 5, trains: parseRawTokens(['24', '39', '50M', '53T', '56'], 2) },
  { hour: 6, trains: parseRawTokens(['07K', '12', '22S', '28', '37K', '42', '50M', '53T', '59C'], 2) },
  { hour: 7, trains: parseRawTokens(['02S', '07K', '10', '13', '19C', '22S', '27', '39C', '42K', '46', '50M', '53T', '59C'], 2) },
  { hour: 8, trains: parseRawTokens(['02S', '07K', '10', '13', '19C', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 9, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 10, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 11, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 12, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 13, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '43', '50M', '53T', '57S'], 2) },
  { hour: 14, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 15, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 16, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 17, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '39C', '42K', '46', '50M', '53T', '59C'], 2) },
  { hour: 18, trains: parseRawTokens(['02S', '07K', '10', '13', '19C', '22S', '28', '39C', '42K', '46', '50M', '53T', '59C'], 2) },
  { hour: 19, trains: parseRawTokens(['02S', '07K', '10', '13', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 20, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 21, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 22, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 23, trains: parseRawTokens(['01', '07K', '12', '22S', '28', '37K', '42', '50M', '53T', '57S'], 2) },
  { hour: 0, trains: parseRawTokens(['01', '07K', '12', '22S', '37K', '50M', '57S'], 2) },
];

// ------------------------------------------------------------
// 4. 茨城空港駅 時刻表 (下り:114本/日, 上り:181本/日)
// ------------------------------------------------------------
const IBARAKI_AIRPORT_DOWN: HourSchedule[] = [
  { hour: 5, trains: parseRawTokens(['10L', '40L'], 1) },
  { hour: 6, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 7, trains: parseRawTokens(['03K', '10L', '33S', '36K', '47L'], 1) },
  { hour: 8, trains: parseRawTokens(['03K', '06S', '13L', '33S', '36K', '47L'], 1) },
  { hour: 9, trains: parseRawTokens(['03K', '06S', '20L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 10, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 11, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 12, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 13, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 14, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 15, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 16, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 17, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 18, trains: parseRawTokens(['03K', '13L', '33S', '36K', '47L'], 1) },
  { hour: 19, trains: parseRawTokens(['03K', '06S', '13L', '33S', '36K', '47L', '57S'], 1) },
  { hour: 20, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 21, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 22, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 23, trains: parseRawTokens(['03K', '10L', '27S', '33K', '40L', '57S'], 1) },
  { hour: 0, trains: parseRawTokens(['03K', '27S', '33K', '57S'], 1) },
];

const IBARAKI_AIRPORT_UP: HourSchedule[] = [
  { hour: 5, trains: parseRawTokens(['04', '19', '30T', '36', '50K', '53'], 2) },
  { hour: 6, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '40C', '43S', '50K', '53'], 2) },
  { hour: 7, trains: parseRawTokens(['00C', '05S', '08', '20C', '23K', '26', '30T', '36', '40C', '43S', '50K', '53'], 2) },
  { hour: 8, trains: parseRawTokens(['00C', '05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 9, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 10, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 11, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 12, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 13, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 14, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 15, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 16, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 17, trains: parseRawTokens(['05S', '08', '20C', '23K', '26', '30T', '36', '40C', '43S', '50K', '53'], 2) },
  { hour: 18, trains: parseRawTokens(['00C', '05S', '08', '20C', '23K', '26', '30T', '36', '40C', '43S', '50K', '53'], 2) },
  { hour: 19, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 20, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 21, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 22, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 23, trains: parseRawTokens(['05S', '08', '20K', '23', '30T', '36', '41S', '50K', '53'], 2) },
  { hour: 0, trains: parseRawTokens(['05S', '20K', '41S'], 2) },
];

// ------------------------------------------------------------
// 5. 日立駅 時刻表 (134本/日)
// ------------------------------------------------------------
const HITACHI_UP_HOURS: HourSchedule[] = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
].map((hour) => ({
  hour,
  trains: parseRawTokens(['00M', '10K', '13L', '25S', '40K', '43L', '55S'], 2),
}));
HITACHI_UP_HOURS.push({
  hour: 0,
  trains: parseRawTokens(['00M'], 2),
});

// 全駅の統合マスターマップ
export const TSUCHIURA_STATION_TIMETABLES: Record<string, StationTimetableConfig> = {
  '松戸': {
    stationName: '松戸',
    stationCode: 'TC01',
    description: '土浦線の起点駅。JR常磐線・新京成線接続。全種別が発着します。',
    platforms: {
      1: { label: '1・2番線', direction: 1, destination: '柏・土浦・茨城空港・日立方面' },
    },
    down: {
      stationName: '松戸',
      stationCode: 'TC01',
      direction: 1,
      directionLabel: '下り (日立方面)',
      totalDailyTrains: 201,
      hours: MATSUDO_DOWN,
    },
  },
  '柏': {
    stationName: '柏',
    stationCode: 'TC04',
    description: '東武野田線・JR常磐線接続の主要ジャンクション。特快・快速・区間快速が停車します。',
    platforms: {
      1: { label: '1番線', direction: 1, destination: '土浦・茨城空港・日立方面' },
      2: { label: '2番線', direction: 2, destination: '松戸・東京方面' },
    },
    down: {
      stationName: '柏',
      stationCode: 'TC04',
      direction: 1,
      directionLabel: '下り (日立方面)',
      totalDailyTrains: 201,
      hours: KASHIWA_DOWN,
    },
    up: {
      stationName: '柏',
      stationCode: 'TC04',
      direction: 2,
      directionLabel: '上り (松戸方面)',
      totalDailyTrains: 201,
      hours: KASHIWA_UP,
    },
  },
  '土浦': {
    stationName: '土浦',
    stationCode: 'TC09',
    description: '土浦線の主要拠点駅。JR常磐線乗換。当駅始発・緩急接続が多数設定されています。',
    platforms: {
      1: { label: '1・2番線', direction: 1, destination: '高浜・茨城空港・日立方面' },
      2: { label: '3・4番線', direction: 2, destination: '柏・松戸・東京方面' },
    },
    down: {
      stationName: '土浦',
      stationCode: 'TC09',
      direction: 1,
      directionLabel: '下り (日立方面)',
      totalDailyTrains: 201,
      hours: TSUCHIURA_DOWN,
    },
    up: {
      stationName: '土浦',
      stationCode: 'TC09',
      direction: 2,
      directionLabel: '上り (松戸方面)',
      totalDailyTrains: 201,
      hours: TSUCHIURA_UP,
    },
  },
  '茨城空港': {
    stationName: '茨城空港',
    stationCode: 'TC11',
    description: '茨城空港アクセス直結駅。特別快速・通勤特快の終着駅であり、遠近分離の結節点です。',
    platforms: {
      1: { label: '1番線', direction: 1, destination: '大洗・ひたちなか・日立方面' },
      2: { label: '2番線', direction: 2, destination: '土浦・柏・松戸方面' },
    },
    down: {
      stationName: '茨城空港',
      stationCode: 'TC11',
      direction: 1,
      directionLabel: '下り (日立方面)',
      totalDailyTrains: 114,
      hours: IBARAKI_AIRPORT_DOWN,
    },
    up: {
      stationName: '茨城空港',
      stationCode: 'TC11',
      direction: 2,
      directionLabel: '上り (松戸方面)',
      totalDailyTrains: 181,
      hours: IBARAKI_AIRPORT_UP,
    },
  },
  '日立': {
    stationName: '日立',
    stationCode: 'TC22',
    description: '土浦線の終着駅。太平洋を望むガラス張りの駅舎。特急めぐり・快速等の始発駅。',
    platforms: {
      2: { label: '1・2番線', direction: 2, destination: '土浦・柏・松戸方面' },
    },
    up: {
      stationName: '日立',
      stationCode: 'TC22',
      direction: 2,
      directionLabel: '上り (松戸方面)',
      totalDailyTrains: 134,
      hours: HITACHI_UP_HOURS,
    },
  },
};

// 指定駅の時刻表設定を取得（あいまいマッチ対応）
export function getStationTimetable(stationName: string): StationTimetableConfig | null {
  for (const key of Object.keys(TSUCHIURA_STATION_TIMETABLES)) {
    if (stationName.includes(key) || key.includes(stationName)) {
      return TSUCHIURA_STATION_TIMETABLES[key];
    }
  }
  return null;
}

// 登録されている全標準駅リスト
export const TIMETABLE_AVAILABLE_STATIONS = [
  { id: 'matsudo', name: '松戸', code: 'TC01', tag: '起点駅' },
  { id: 'kashiwa', name: '柏', code: 'TC04', tag: '接続駅' },
  { id: 'tsuchiura', name: '土浦', code: 'TC09', tag: '拠点駅' },
  { id: 'ibaraki_airport', name: '茨城空港', code: 'TC11', tag: '空港連絡' },
  { id: 'hitachi', name: '日立', code: 'TC22', tag: '終着駅' },
];
