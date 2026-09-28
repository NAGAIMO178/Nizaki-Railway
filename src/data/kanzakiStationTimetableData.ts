// 神埼鉄道 神埼線 駅時刻表データ (主要5駅: 東京・北千住・大宮・新横浜・横浜)
// 5:00始発〜24:00台終電 / 最低運転間隔3分・緩急接続(待避)考慮済み
// 凡例: N(特急Nライナー), E(急行), 無印(各停)

export type KanzakiTrainTypeCode = 'N' | 'E' | 'LOCAL';

export interface KanzakiTimetableEntry {
  minute: number;
  typeCode: KanzakiTrainTypeCode;
  typeName: string;
  destination: string;
  carCount: number;
  note?: string;
}

export interface KanzakiHourSchedule {
  hour: number;
  trains: KanzakiTimetableEntry[];
}

export interface KanzakiStationDirectionTimetable {
  stationName: string;
  stationCode: string;
  direction: 1 | 2; // 1: 下り(横浜方面), 2: 上り(東京方面)
  directionLabel: string;
  totalDailyTrains: number;
  hours: KanzakiHourSchedule[];
}

export interface KanzakiStationTimetableConfig {
  stationName: string;
  stationCode: string;
  description: string;
  platforms: {
    1?: { label: string; direction: 1; destination: string };
    2?: { label: string; direction: 2; destination: string };
  };
  down?: KanzakiStationDirectionTimetable;
  up?: KanzakiStationDirectionTimetable;
}

export const KANZAKI_TRAIN_TYPE_LEGEND: Record<KanzakiTrainTypeCode, {
  name: string;
  code: KanzakiTrainTypeCode;
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
    description: '全23駅に停車',
    stopsDescription: '全23駅に停車します。一部列車は優等列車待避のため所要時間が延びます。',
    defaultCars: 10,
  },
  E: {
    name: '急行',
    code: 'E',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/70',
    badgeText: 'text-emerald-800 dark:text-emerald-200',
    badgeBorder: 'border-emerald-300 dark:border-emerald-700',
    shortLabel: '急行',
    description: '主要駅に停車',
    stopsDescription: '東京・北千住・草加・越谷レイクタウン・大宮・朝霞台・ひばりヶ丘・調布・生田・溝の口・新横浜・横浜に停車。',
    defaultCars: 10,
  },
  N: {
    name: '特急Nライナー',
    code: 'N',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/70',
    badgeText: 'text-purple-800 dark:text-purple-200',
    badgeBorder: 'border-purple-300 dark:border-purple-700',
    shortLabel: '特急',
    description: '最速達特急 (要特急券)',
    stopsDescription: '東京・北千住・越谷レイクタウン・大宮・ひばりヶ丘・調布・溝の口・新横浜・横浜に停車。全席指定・要特急券。',
    defaultCars: 10,
  },
};

// ヘルパー: 文字列行から TimetableEntry 配列をパース
function parseKanzakiTrains(rawTokens: string[], defaultDest: string): KanzakiTimetableEntry[] {
  return rawTokens.map((token) => {
    let minute = 0;
    let typeCode: KanzakiTrainTypeCode = 'LOCAL';
    let typeName = '各停';
    let carCount = 10;
    let note = '';

    if (token.endsWith('N')) {
      minute = parseInt(token.slice(0, -1), 10);
      typeCode = 'N';
      typeName = '特急Nライナー';
      carCount = 10;
      note = '要特急券';
    } else if (token.endsWith('E')) {
      minute = parseInt(token.slice(0, -1), 10);
      typeCode = 'E';
      typeName = '急行';
      carCount = 10;
    } else {
      minute = parseInt(token, 10);
      typeCode = 'LOCAL';
      typeName = '各停';
      carCount = 10;
    }

    return {
      minute,
      typeCode,
      typeName,
      destination: defaultDest,
      carCount,
      note,
    };
  }).sort((a, b) => a.minute - b.minute);
}

// ------------------------------------------------------------
// 1. 東京 (Y01)
// ------------------------------------------------------------
const TOKYO_DOWN_HOURS: KanzakiHourSchedule[] = [];
// 5時〜23時: 00N 05E 08 14 25E 28 38 45E 50
for (let h = 5; h <= 23; h++) {
  TOKYO_DOWN_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['00N', '05E', '08', '14', '25E', '28', '38', '45E', '50'], '横浜'),
  });
}
// 0時: 00N
TOKYO_DOWN_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['00N'], '横浜'),
});

export const TOKYO_TIMETABLE: KanzakiStationTimetableConfig = {
  stationName: '東京',
  stationCode: 'Y01',
  description: '神埼線 起点駅 / ターミナル',
  platforms: {
    1: { label: '1番線 (下り)', direction: 1, destination: '横浜方面' },
  },
  down: {
    stationName: '東京',
    stationCode: 'Y01',
    direction: 1,
    directionLabel: '横浜方面 (下り)',
    totalDailyTrains: 172,
    hours: TOKYO_DOWN_HOURS,
  },
};

// ------------------------------------------------------------
// 2. 北千住 (Y03)
// ------------------------------------------------------------
const KITASENJU_DOWN_HOURS: KanzakiHourSchedule[] = [];
// 5時: 08N 14E 18 24 34E 38 48 54E
KITASENJU_DOWN_HOURS.push({
  hour: 5,
  trains: parseKanzakiTrains(['08N', '14E', '18', '24', '34E', '38', '48', '54E'], '横浜'),
});
// 6時〜23時: 00 08N 14E 18 24 34E 38 48 54E
for (let h = 6; h <= 23; h++) {
  KITASENJU_DOWN_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['00', '08N', '14E', '18', '24', '34E', '38', '48', '54E'], '横浜'),
  });
}
// 0時: 00 08N
KITASENJU_DOWN_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['00', '08N'], '横浜'),
});

const KITASENJU_UP_HOURS: KanzakiHourSchedule[] = [];
// 6時: 18N 28E 48E 53 58
KITASENJU_UP_HOURS.push({
  hour: 6,
  trains: parseKanzakiTrains(['18N', '28E', '48E', '53', '58'], '東京'),
});
// 7時〜0時: 08E 13 18N 28E 35 38 48E 53 58
for (let h = 7; h <= 23; h++) {
  KITASENJU_UP_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['08E', '13', '18N', '28E', '35', '38', '48E', '53', '58'], '東京'),
  });
}
KITASENJU_UP_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['08E', '13', '18N', '28E', '35', '38', '48E', '53', '58'], '東京'),
});
// 1時: 08E 13 18N 29 34
KITASENJU_UP_HOURS.push({
  hour: 1,
  trains: parseKanzakiTrains(['08E', '13', '18N', '29', '34'], '東京'),
});

export const KITASENJU_TIMETABLE: KanzakiStationTimetableConfig = {
  stationName: '北千住',
  stationCode: 'Y03',
  description: '神埼線 緩急接続拠点駅',
  platforms: {
    1: { label: '1番線 (下り)', direction: 1, destination: '横浜方面' },
    2: { label: '2番線 (上り)', direction: 2, destination: '東京方面' },
  },
  down: {
    stationName: '北千住',
    stationCode: 'Y03',
    direction: 1,
    directionLabel: '横浜方面 (下り)',
    totalDailyTrains: 172,
    hours: KITASENJU_DOWN_HOURS,
  },
  up: {
    stationName: '北千住',
    stationCode: 'Y03',
    direction: 2,
    directionLabel: '東京方面 (上り)',
    totalDailyTrains: 172,
    hours: KITASENJU_UP_HOURS,
  },
};

// ------------------------------------------------------------
// 3. 大宮 (Y12)
// ------------------------------------------------------------
const OMIYA_DOWN_HOURS: KanzakiHourSchedule[] = [];
// 5時: 44N 51E
OMIYA_DOWN_HOURS.push({
  hour: 5,
  trains: parseKanzakiTrains(['44N', '51E'], '横浜'),
});
// 6時〜23時: 05 11E 17 25 31E 40 44N 51E 58
for (let h = 6; h <= 23; h++) {
  OMIYA_DOWN_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['05', '11E', '17', '25', '31E', '40', '44N', '51E', '58'], '横浜'),
  });
}
// 0時: 05 11E 17 25 31E 40 44N 53
OMIYA_DOWN_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['05', '11E', '17', '25', '31E', '40', '44N', '53'], '横浜'),
});

const OMIYA_UP_HOURS: KanzakiHourSchedule[] = [];
// 5時: 42N 50E
OMIYA_UP_HOURS.push({
  hour: 5,
  trains: parseKanzakiTrains(['42N', '50E'], '東京'),
});
// 6時〜23時: 00 06 10E 20 30E 36 42N 47 50E
for (let h = 6; h <= 23; h++) {
  OMIYA_UP_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['00', '06', '10E', '20', '30E', '36', '42N', '47', '50E'], '東京'),
  });
}
// 0時: 00 06 10E 20 30E 36 42N 47
OMIYA_UP_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['00', '06', '10E', '20', '30E', '36', '42N', '47'], '東京'),
});

export const OMIYA_TIMETABLE: KanzakiStationTimetableConfig = {
  stationName: '大宮',
  stationCode: 'Y12',
  description: '神埼線 埼玉大拠点駅',
  platforms: {
    1: { label: '1番線 (下り)', direction: 1, destination: '横浜方面' },
    2: { label: '2番線 (上り)', direction: 2, destination: '東京方面' },
  },
  down: {
    stationName: '大宮',
    stationCode: 'Y12',
    direction: 1,
    directionLabel: '横浜方面 (下り)',
    totalDailyTrains: 172,
    hours: OMIYA_DOWN_HOURS,
  },
  up: {
    stationName: '大宮',
    stationCode: 'Y12',
    direction: 2,
    directionLabel: '東京方面 (上り)',
    totalDailyTrains: 172,
    hours: OMIYA_UP_HOURS,
  },
};

// ------------------------------------------------------------
// 4. 新横浜 (Y22)
// ------------------------------------------------------------
const SHINYOKOHAMA_DOWN_HOURS: KanzakiHourSchedule[] = [];
// 6時: 20N 31E 51E 56
SHINYOKOHAMA_DOWN_HOURS.push({
  hour: 6,
  trains: parseKanzakiTrains(['20N', '31E', '51E', '56'], '横浜'),
});
// 7時〜0時: 03 11E 16 20N 31E 36 45 51E 56
for (let h = 7; h <= 23; h++) {
  SHINYOKOHAMA_DOWN_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['03', '11E', '16', '20N', '31E', '36', '45', '51E', '56'], '横浜'),
  });
}
SHINYOKOHAMA_DOWN_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['03', '11E', '16', '20N', '31E', '36', '45', '51E', '56'], '横浜'),
});
// 1時: 03 11E 16 20N 31 39
SHINYOKOHAMA_DOWN_HOURS.push({
  hour: 1,
  trains: parseKanzakiTrains(['03', '11E', '16', '20N', '31', '39'], '横浜'),
});

const SHINYOKOHAMA_UP_HOURS: KanzakiHourSchedule[] = [];
// 5時〜23時: 06N 11E 14 20 31E 34 44 51E 56
for (let h = 5; h <= 23; h++) {
  SHINYOKOHAMA_UP_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['06N', '11E', '14', '20', '31E', '34', '44', '51E', '56'], '東京'),
  });
}
// 0時: 06N
SHINYOKOHAMA_UP_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['06N'], '東京'),
});

export const SHINYOKOHAMA_TIMETABLE: KanzakiStationTimetableConfig = {
  stationName: '新横浜',
  stationCode: 'Y22',
  description: '神埼線 神奈川主要拠点駅',
  platforms: {
    1: { label: '1番線 (下り)', direction: 1, destination: '横浜方面' },
    2: { label: '2番線 (上り)', direction: 2, destination: '東京方面' },
  },
  down: {
    stationName: '新横浜',
    stationCode: 'Y22',
    direction: 1,
    directionLabel: '横浜方面 (下り)',
    totalDailyTrains: 172,
    hours: SHINYOKOHAMA_DOWN_HOURS,
  },
  up: {
    stationName: '新横浜',
    stationCode: 'Y22',
    direction: 2,
    directionLabel: '東京方面 (上り)',
    totalDailyTrains: 172,
    hours: SHINYOKOHAMA_UP_HOURS,
  },
};

// ------------------------------------------------------------
// 5. 横浜 (Y23)
// ------------------------------------------------------------
const YOKOHAMA_UP_HOURS: KanzakiHourSchedule[] = [];
// 5時〜23時: 00N 05E 08 14 25E 28 38 45E 50
for (let h = 5; h <= 23; h++) {
  YOKOHAMA_UP_HOURS.push({
    hour: h,
    trains: parseKanzakiTrains(['00N', '05E', '08', '14', '25E', '28', '38', '45E', '50'], '東京'),
  });
}
// 0時: 00N
YOKOHAMA_UP_HOURS.push({
  hour: 0,
  trains: parseKanzakiTrains(['00N'], '東京'),
});

export const YOKOHAMA_TIMETABLE: KanzakiStationTimetableConfig = {
  stationName: '横浜',
  stationCode: 'Y23',
  description: '神埼線 終着駅 / ターミナル',
  platforms: {
    2: { label: '2番線 (上り)', direction: 2, destination: '東京方面' },
  },
  up: {
    stationName: '横浜',
    stationCode: 'Y23',
    direction: 2,
    directionLabel: '東京方面 (上り)',
    totalDailyTrains: 172,
    hours: YOKOHAMA_UP_HOURS,
  },
};

// 全登録駅リスト
export const KANZAKI_TIMETABLE_STATIONS: {
  code: string;
  name: string;
  config: KanzakiStationTimetableConfig;
}[] = [
  { code: 'Y01', name: '東京', config: TOKYO_TIMETABLE },
  { code: 'Y03', name: '北千住', config: KITASENJU_TIMETABLE },
  { code: 'Y12', name: '大宮', config: OMIYA_TIMETABLE },
  { code: 'Y22', name: '新横浜', config: SHINYOKOHAMA_TIMETABLE },
  { code: 'Y23', name: '横浜', config: YOKOHAMA_TIMETABLE },
];

export function getKanzakiStationTimetable(
  stationNameOrCode: string
): KanzakiStationTimetableConfig | undefined {
  const found = KANZAKI_TIMETABLE_STATIONS.find(
    (s) =>
      s.code.toLowerCase() === stationNameOrCode.toLowerCase() ||
      s.name === stationNameOrCode ||
      stationNameOrCode.includes(s.name) ||
      s.name.includes(stationNameOrCode)
  );
  return found?.config;
}
