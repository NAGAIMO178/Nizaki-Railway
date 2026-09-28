// Disruption Dispatcher & Train Delay Manager for 神埼鉄道 NIZAKI App
// Version 3.11.0 (Emergency Incident Response, Weather Forecast & Auto-Expiring Operation Alerts)

export type DisruptionStatusType = 'normal' | 'delay' | 'suspended' | 'partially_suspended';
export type DisruptionDirection = 'both' | 'up' | 'down';

export interface LineDisruption {
  lineId: string; // 'kanzaki' | 'kanzaki_kosoku' | 'saichi' | 'tsuchiura'
  lineName: string; // '神埼線' | '神埼高速線' | '埼千環状線' | '土浦線'
  code: string; // 'Y' | 'NI' | 'SC' | 'TC'
  statusType: DisruptionStatusType;
  targetDirection?: DisruptionDirection; // 'both' (上下線) | 'up' (上り線のみ) | 'down' (下り線のみ)
  maxDelayMinutes: number; // e.g. 15 (1〜15分の乱数遅延)
  durationUntil: string; // e.g. '18:30頃まで', '終日', '復旧見込み立たず'
  section: string; // e.g. '全線', '大宮〜横浜間', '松戸〜土浦間'
  reason: string; // e.g. '車両点検のため', '人身事故のため', '強風のため'
  customMessage: string;
  useCustomMessage: boolean;
  linkToSystem: boolean; // システム（走行位置・発車案内・運行カード）へ実際に遅延・運休を連動させるか
  updatedAt: string;
}

export type ForecastCategory =
  | 'heavy_rain'
  | 'typhoon'
  | 'gale'
  | 'snow'
  | 'thunder'
  | 'earthquake'
  | 'crowd_event'
  | 'maintenance'
  | 'general';

export type ForecastSeverity = 'caution' | 'warning' | 'critical';

export interface OperationForecast {
  id: string;
  lineId: string; // 'all' | 'kanzaki' | 'kanzaki_kosoku' | 'saichi' | 'tsuchiura'
  lineName: string; // '全線' | '神埼線' | '神埼高速線' | '埼千環状線' | '土浦線'
  code?: string;
  category: ForecastCategory;
  categoryLabel: string;
  expectedPeriod: string; // 例: '本日夕方以降（16時頃〜22時頃）'
  section: string; // 例: '全線', '北千住〜大宮間'
  headline: string; // 例: '本日夕方以降、強風の影響により列車の遅れや急遽の運転見合わせの可能性'
  description: string; // 例: '本日夕方から夜にかけて、発達する低気圧の影響により強い風が予想されています...'
  severity: ForecastSeverity; // 'caution' (注意) | 'warning' (警戒) | 'critical' (重大)
  createdAt: string; // ISO String
  expiresAt: string; // ISO String (例: '2026-08-21T00:00:00.000Z')
  expiresAtTimestamp: number; // ms timestamp for exact expiration check
  isActive: boolean;
}

export interface DisruptionSummaryResponse {
  updatedAt: string;
  hasDelay: boolean;
  summary: string;
  forecasts: OperationForecast[]; // アクティブな運行予測・警報一覧
  lines: {
    id: string;
    lineName: string;
    code: string;
    status: string;
    statusType: DisruptionStatusType;
    targetDirection?: DisruptionDirection;
    delayMinutes: number;
    maxDelayMinutes: number;
    message: string;
    linkToSystem: boolean;
    section: string;
    reason: string;
    durationUntil: string;
  }[];
}

const STORAGE_KEY = 'nizaki_admin_disruptions';
const FORECAST_STORAGE_KEY = 'nizaki_admin_operation_forecasts';

export const DEFAULT_LINE_INFOS: { id: string; name: string; code: string; color: string }[] = [
  { id: 'kanzaki', name: '神埼線', code: 'Y', color: '#8B5CF6' },
  { id: 'kanzaki_kosoku', name: '神埼高速線', code: 'NI', color: '#3B82F6' },
  { id: 'saichi', name: '埼千環状線', code: 'SC', color: '#EC4899' },
  { id: 'tsuchiura', name: '土浦線', code: 'TC', color: '#10B981' },
];

export const LINE_STATIONS: Record<string, string[]> = {
  kanzaki: [
    '東京', '浅草', '北千住', '足立', '草加', '越谷レイクタウン', '七光台', '北春日部',
    '地下鉄岩槻', '蓮田', '丸山', '大宮', '朝霞台', '新座', 'ひばりヶ丘', '田無',
    '武蔵境', '中三鷹', '調布', '生田', '溝の口', '新横浜', '横浜'
  ],
  kanzaki_kosoku: [
    '東京', '新橋', '品川', '大井町', '平和島', '地下鉄蒲田', '川崎', '鶴見', '横浜'
  ],
  saichi: [
    '東京', '南千住', '北千住', '綾瀬', '松戸', '柏', '七光台', '春日部', '岩槻',
    '大宮公園', '大宮', 'さいたま新都心', '南浦和', '西青木', '川口', '志村坂上',
    '上板橋', '小竹向原', '池袋', '新宿'
  ],
  tsuchiura: [
    '松戸', '新松戸', '松が丘', '柏', '守谷', '谷井田', '森の里', '荒川沖', '土浦',
    '高浜', '茨城空港', '鹿島旭', '大洗', '那珂湊', '平磯', 'ひたちなか海浜公園',
    '久慈川', '大甕（おおみか）', '東大沼', '多賀', '会瀬（おうせ）', '日立'
  ],
};

export const getStationsForLine = (lineId: string): string[] => {
  if (lineId === 'saichi_loop' || lineId === 'saichi') return LINE_STATIONS.saichi || [];
  return LINE_STATIONS[lineId] || LINE_STATIONS.kanzaki || [];
};

export const COMMON_REASON_CATEGORIES = [
  {
    category: '気象・自然災害（※アプリ内シミュレーション・フィクション）',
    isWeatherOrNatural: true,
    reasons: [
      '【架空・設定】大雨のため',
      '【架空・設定】強風のため',
      '【架空・設定】大雪・路面凍結のため',
      '【架空・設定】台風接近に伴う風雨警戒のため',
      '【架空・設定】落雷による信号設備障害のため',
      '【架空・設定】地震警戒・線路点検のため',
      '【架空・設定】線路浸水・冠水のため',
      '【架空・設定】倒木・飛来物挟み込みのため',
      '【架空・設定】沿線火災のため',
    ],
    defaultDuration: '天候回復次第（※架空）',
    durationPresets: [
      '天候回復次第（※架空設定）',
      '現時点で復旧・再開のめどは立っていません（※架空設定）',
      '風雨が収まり安全確認が取れ次第（※架空設定）',
      '今後の気象情報にご注意ください（※架空設定）',
      '終日運転見合わせの可能性あり（※架空設定）',
    ],
  },
  {
    category: '車両・設備点検（※アプリ内シミュレーション・フィクション）',
    isWeatherOrNatural: false,
    reasons: [
      '【架空・設定】車両点検のため',
      '【架空・設定】信号確認のため',
      '【架空・設定】変電所設備点検のため',
      '【架空・設定】架線確認のため',
      '【架空・設定】踏切内安全確認のため',
      '【架空・設定】分岐器（ポイント）不転換のため',
    ],
    defaultDuration: '18:30頃まで（※架空設定）',
    durationPresets: [
      '約15〜30分で復帰見込み（※架空設定）',
      '点検完了次第（※架空設定）',
      '18:30頃まで（※架空設定）',
      '19:00頃まで（※架空設定）',
      '終日一部列車に遅れ見込み（※架空設定）',
    ],
  },
  {
    category: '旅客・事故対応（※アプリ内シミュレーション・フィクション）',
    isWeatherOrNatural: false,
    reasons: [
      '【架空・設定】人身事故のため',
      '【架空・設定】急病人救護のため',
      '【架空・設定】線路内立ち入りのため',
      '【架空・設定】お客様混雑および安全確認のため',
      '【架空・設定】荷物挟み込み対応のため',
    ],
    defaultDuration: '警察・消防の現場検証完了後（※架空設定）',
    durationPresets: [
      '警察・消防の現場検証完了後（※架空設定）',
      '現場安全確認完了後（※架空設定）',
      '救護活動終了次第（※架空設定）',
      '約60〜90分後見込み（※架空設定）',
      '順次運転再開中（※架空設定）',
    ],
  },
];

export const COMMON_REASONS = COMMON_REASON_CATEGORIES.flatMap((c) => c.reasons);

export const COMMON_SECTIONS: Record<string, string[]> = {
  all: ['全線', '主要区間'],
  kanzaki: ['全線', '東京 〜 大宮 間', '大宮 〜 横浜 間', '北千住 〜 草加 間', '調布 〜 新横浜 間'],
  kanzaki_kosoku: ['全線', '東京 〜 品川 間', '品川 〜 横浜 間', '大井町 〜 川崎 間'],
  saichi: ['全線', '大宮 〜 池袋 間', '新宿 〜 東京 間', '北千住 〜 松戸 間', '松戸 〜 柏 間'],
  tsuchiura: ['全線', '松戸 〜 土浦 間', '土浦 〜 日立 間', '守谷 〜 荒川沖 間', '茨城空港 〜 日立 間'],
};

export interface ForecastPresetDef {
  category: ForecastCategory;
  name: string;
  badgeLabel: string;
  icon: string;
  defaultSeverity: ForecastSeverity;
  defaultPeriod: string;
  defaultHoursAhead: number; // デフォルト有効期限（何時間後か）
  generateHeadline: (lineName: string) => string;
  generateDescription: (lineName: string, expectedPeriod: string, section: string) => string;
}

export const FORECAST_PRESETS: ForecastPresetDef[] = [
  {
    category: 'typhoon',
    name: '台風接近・暴風雨警戒',
    badgeLabel: '台風接近警戒（※架空）',
    icon: 'ShieldAlert',
    defaultSeverity: 'warning',
    defaultPeriod: '本日夕方以降（16時頃〜終電）',
    defaultHoursAhead: 8,
    generateHeadline: (lineName) => `【フィクション】${lineName}：台風接近に伴う列車の遅れ・急遽の運転見合わせの可能性について`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。実際の気象警報等とは一切関係ありません。\n\n台風の接近に伴う大雨および強風の影響により、${lineName}（${section}）では、${period}にかけて列車の遅れや急遽の行先変更、一部列車の運休、または運転見合わせが発生する可能性があります。今後の気象情報および最新の運行情報にご注意いただき、お時間に余裕をもってご利用ください。`,
  },
  {
    category: 'gale',
    name: '強風・速度規制注意',
    badgeLabel: '強風・速度規制注意（※架空）',
    icon: 'Wind',
    defaultSeverity: 'caution',
    defaultPeriod: '本日午後から夜間にかけて',
    defaultHoursAhead: 6,
    generateHeadline: (lineName) => `【フィクション】${lineName}：強風による一部列車の遅れ・速度規制の可能性について`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。実際の気象情報とは一切関係ありません。\n\n発達する低気圧に伴う強風が予想されているため、${lineName}（${section}）では、${period}に安全確保のため一部区間で徐行運転（速度規制）を行う場合があります。これにより、一部列車に遅れや接続待ちが発生する可能性があります。`,
  },
  {
    category: 'heavy_rain',
    name: '大雨・集中豪雨警戒',
    badgeLabel: '大雨・冠水警戒（※架空）',
    icon: 'CloudRain',
    defaultSeverity: 'warning',
    defaultPeriod: '本日夕方から夜遅くにかけて',
    defaultHoursAhead: 6,
    generateHeadline: (lineName) => `【フィクション】${lineName}：大雨・集中豪雨に伴う運転見合わせ・遅延の可能性について`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。実際の気象情報とは一切関係ありません。\n\n活発な前線の影響による激しい雨が予想されております。${lineName}（${section}）では、${period}に雨量規制値に達した場合、一時的な運転見合わせや速度を落としての運転を行う可能性があります。`,
  },
  {
    category: 'snow',
    name: '降雪・積雪凍結警戒',
    badgeLabel: '降雪・積雪凍結注意（※架空）',
    icon: 'Snowflake',
    defaultSeverity: 'warning',
    defaultPeriod: '今夜から明朝にかけて',
    defaultHoursAhead: 12,
    generateHeadline: (lineName) => `【フィクション】${lineName}：降雪予報に伴う列車の遅れ・運休の可能性について`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。実際の降雪予報とは一切関係ありません。\n\n降雪および線路・分岐器の凍結予報に伴い、${lineName}（${section}）では、${period}に列車の遅れや間引き運転、一部列車の運休が発生する可能性があります。お出かけの際は足元に十分ご注意いただき、最新の運行状況をご確認ください。`,
  },
  {
    category: 'thunder',
    name: '落雷・突風急変注意',
    badgeLabel: '落雷・突風注意（※架空）',
    icon: 'Zap',
    defaultSeverity: 'caution',
    defaultPeriod: '本日午後の大気不安定時',
    defaultHoursAhead: 4,
    generateHeadline: (lineName) => `【フィクション】${lineName}：急な雷雨・突風に伴う一時的な安全確認の可能性について`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。実際の気象情報とは一切関係ありません。\n\n大気の状態が非常に不安定となっております。急な雷雨や突風、落雷による信号設備影響が生じた場合、${lineName}（${section}）では安全確認のため一時的に列車の運転を見合わせる場合があります。`,
  },
  {
    category: 'crowd_event',
    name: '沿線イベント・混雑注意',
    badgeLabel: 'イベント混雑注意（※架空）',
    icon: 'Users',
    defaultSeverity: 'caution',
    defaultPeriod: '本日17:00〜22:00頃',
    defaultHoursAhead: 5,
    generateHeadline: (lineName) => `【フィクション】${lineName}：沿線イベント開催に伴う混雑および列車遅延の可能性について`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。\n\n沿線施設での大規模催事・イベント開催に伴い、${lineName}（${section}）では${period}に主要駅ホームや改札口での大幅な混雑が見込まれます。乗降に通常より時間を要するため、列車に数分から十数分の遅れが発生する場合があります。`,
  },
  {
    category: 'maintenance',
    name: '計画保守・夜間工事',
    badgeLabel: '計画保守・夜間工事（※架空）',
    icon: 'Wrench',
    defaultSeverity: 'caution',
    defaultPeriod: '本日深夜23時以降',
    defaultHoursAhead: 8,
    generateHeadline: (lineName) => `【フィクション】${lineName}：夜間設備工事に伴う一部列車の時刻変更・行先変更について`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。\n\n設備改良および保守工事の実施に伴い、${lineName}（${section}）では、${period}の一部終電車の運転時刻・行先を変更して運転いたします。あらかじめ時刻表をご確認の上ご利用ください。`,
  },
  {
    category: 'general',
    name: 'その他・一般運行注意',
    badgeLabel: '運行注意情報（※架空）',
    icon: 'AlertTriangle',
    defaultSeverity: 'caution',
    defaultPeriod: '本日終日',
    defaultHoursAhead: 6,
    generateHeadline: (lineName) => `【フィクション】${lineName}：今後の運行に関するお知らせ・ご注意`,
    generateDescription: (lineName, period, section) =>
      `※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。\n\n${lineName}（${section}）では、${period}にかけて現地の状況により列車の運行に変更が生じる可能性があります。最新の運行情報にご留意ください。`,
  },
];

/**
 * 期限日時プリセット候補（現在時刻基準）の生成
 */
export function getExpiryOptions(baseDate: Date = new Date()): { label: string; date: Date; hoursFromNow: number }[] {
  const addHours = (h: number) => new Date(baseDate.getTime() + h * 60 * 60 * 1000);
  
  // 今日の24:00 (明日0:00)
  const todayMidnight = new Date(baseDate);
  todayMidnight.setHours(24, 0, 0, 0);

  // 明日の朝6:00
  const tomorrowMorning = new Date(baseDate);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(6, 0, 0, 0);

  // 明日の正午12:00
  const tomorrowNoon = new Date(baseDate);
  tomorrowNoon.setDate(tomorrowNoon.getDate() + 1);
  tomorrowNoon.setHours(12, 0, 0, 0);

  // 明日の24:00
  const tomorrowMidnight = new Date(baseDate);
  tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);
  tomorrowMidnight.setHours(24, 0, 0, 0);

  const formatTimeOnly = (d: Date) => {
    const isToday = d.getDate() === baseDate.getDate();
    const isTomorrow = d.getDate() === baseDate.getDate() + 1;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (isToday) return `本日 ${time}`;
    if (isTomorrow) return `明日 ${time}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
  };

  return [
    { label: `+1時間後 (${formatTimeOnly(addHours(1))})`, date: addHours(1), hoursFromNow: 1 },
    { label: `+2時間後 (${formatTimeOnly(addHours(2))})`, date: addHours(2), hoursFromNow: 2 },
    { label: `+3時間後 (${formatTimeOnly(addHours(3))})`, date: addHours(3), hoursFromNow: 3 },
    { label: `+6時間後 (${formatTimeOnly(addHours(6))})`, date: addHours(6), hoursFromNow: 6 },
    { label: `本日終電 (${formatTimeOnly(todayMidnight)})`, date: todayMidnight, hoursFromNow: Math.max(1, Math.round((todayMidnight.getTime() - baseDate.getTime()) / 3600000)) },
    { label: `翌朝 06:00 (${formatTimeOnly(tomorrowMorning)})`, date: tomorrowMorning, hoursFromNow: Math.max(1, Math.round((tomorrowMorning.getTime() - baseDate.getTime()) / 3600000)) },
    { label: `翌日 12:00 (${formatTimeOnly(tomorrowNoon)})`, date: tomorrowNoon, hoursFromNow: Math.max(1, Math.round((tomorrowNoon.getTime() - baseDate.getTime()) / 3600000)) },
    { label: `明日終日 (${formatTimeOnly(tomorrowMidnight)})`, date: tomorrowMidnight, hoursFromNow: Math.max(1, Math.round((tomorrowMidnight.getTime() - baseDate.getTime()) / 3600000)) },
  ];
}

/**
 * 理由文字列から気象災害・自然災害系かどうかを判定
 */
export function isWeatherRelatedReason(reason: string): boolean {
  const weatherKeywords = ['雨', '風', '雪', '台風', '雷', '地震', '浸水', '冠水', '倒木', '飛来物', '火災', '天候', '気象'];
  return weatherKeywords.some((kw) => reason.includes(kw));
}

/**
 * 理由に適した復旧見込みプリセットを取得
 */
export function getDurationPresetsForReason(reason: string): string[] {
  const found = COMMON_REASON_CATEGORIES.find((cat) => cat.reasons.includes(reason));
  if (found) return found.durationPresets;

  if (isWeatherRelatedReason(reason)) {
    return [
      '天候回復次第',
      '現時点で復旧・再開のめどは立っていません',
      '風雨が収まり安全確認が取れ次第',
      '今後の気象情報にご注意ください',
    ];
  }

  return [
    '約15〜30分で復帰見込み',
    '点検完了次第',
    '18:30頃まで',
    '警察・消防の現場検証完了後',
    '現時点で復旧のめどは立っていません',
  ];
}

/**
 * 鉄道公式アナウンス形式の自動文言生成関数
 * 天候要因・復旧未定・時刻見込みなど状況に応じた自然な日本語文言を構築
 */
export function generateDisruptionText(
  lineName: string,
  statusType: DisruptionStatusType,
  maxDelayMinutes: number,
  section: string,
  reason: string,
  durationUntil: string,
  targetDirection: DisruptionDirection = 'both'
): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const cleanSection = section.trim() || '全線';
  const cleanReason = reason.trim() || '安全確認のため';
  const cleanUntil = durationUntil.trim();
  const isWeather = isWeatherRelatedReason(cleanReason);

  const directionLabel =
    targetDirection === 'up' ? '上り線で' : targetDirection === 'down' ? '下り線で' : '上下線で';

  if (statusType === 'normal') {
    return '現在、全線でほぼ平常通り運転しております。';
  }

  // 運転見合わせ
  if (statusType === 'suspended') {
    const scopeLabel = targetDirection === 'up' ? '上り線で' : targetDirection === 'down' ? '下り線で' : '全線で';
    let msg = `【※架空・シミュレーション】${timeStr}現在、${lineName}は、${cleanSection}での${cleanReason}の影響により、${scopeLabel}運転を見合わせております。`;
    if (cleanUntil) {
      if (cleanUntil.includes('めど') || cleanUntil.includes('未定') || cleanUntil.includes('立っていません')) {
        msg += '（現時点で運転再開・復旧のめどは立っておりません）';
      } else if (cleanUntil.includes('次第') || cleanUntil.includes('完了後') || cleanUntil.includes('終了後')) {
        msg += `（${cleanUntil}、順次運転再開を予定しております）`;
      } else if (cleanUntil.includes('可能性あり') || cleanUntil.includes('ご注意')) {
        msg += `（${cleanUntil}）`;
      } else {
        msg += `（${cleanUntil}の運転再開を見込んでおります）`;
      }
    } else if (isWeather) {
      msg += '（天候回復および線路安全確認が取れ次第の再開となります）';
    }
    return msg;
  }

  // 一部運休
  if (statusType === 'partially_suspended') {
    let msg = `【※架空・シミュレーション】${timeStr}現在、${lineName}は、${cleanReason}の影響により、${cleanSection}の${directionLabel}一部列車の運転を取り止めております。`;
    if (cleanUntil) {
      if (cleanUntil.includes('めど') || cleanUntil.includes('未定')) {
        msg += '（現時点で通常運行復帰のめどは立っておりません）';
      } else if (cleanUntil.includes('次第') || cleanUntil.includes('完了後')) {
        msg += `（${cleanUntil}、通常ダイヤへ復旧予定です）`;
      } else if (cleanUntil.includes('可能性あり') || cleanUntil.includes('ご注意')) {
        msg += `（${cleanUntil}）`;
      } else {
        msg += `（${cleanUntil}まで継続見込み）`;
      }
    }
    return msg;
  }

  // statusType === 'delay' (列車遅延)
  const delayStr = maxDelayMinutes > 0 ? `最大約${maxDelayMinutes}分` : '一部';
  let msg = `【※架空・シミュレーション】${timeStr}現在、${lineName}は、${cleanSection}での${cleanReason}の影響により、${directionLabel}${delayStr}の遅れが発生しております。`;
  if (cleanUntil) {
    if (cleanUntil.includes('めど') || cleanUntil.includes('未定') || cleanUntil.includes('立っていません')) {
      msg += '（天候・現場状況により、遅れの拡大や運転見合わせとなる可能性があります）';
    } else if (cleanUntil.includes('次第') || cleanUntil.includes('完了後')) {
      msg += `（${cleanUntil}、平常運転への回復を見込んでおります）`;
    } else if (cleanUntil.includes('可能性あり') || cleanUntil.includes('ご注意')) {
      msg += `（${cleanUntil}）`;
    } else {
      msg += `（${cleanUntil}の平常運行再開を見込んでおります）`;
    }
  } else if (isWeather) {
    msg += '（天候の状況により遅れが拡大する場合がありますのでご注意ください）';
  }
  return msg;
}

let listeners: (() => void)[] = [];

function notifyListeners() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('Listener error in disruptionManager', e);
    }
  });
}

export const disruptionManager = {
  /**
   * 全路線の現在設定されている運行支障情報を取得
   */
  getAllDisruptions: (): Record<string, LineDisruption> => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to parse disruption storage:', e);
    }
    return {};
  },

  /**
   * 指定路線の運行支障情報を取得
   */
  getLineDisruption: (lineId: string): LineDisruption | null => {
    const all = disruptionManager.getAllDisruptions();
    // Also support 'saichi_loop' alias for 'saichi'
    if (lineId === 'saichi_loop' && all['saichi']) return all['saichi'];
    if (lineId === 'saichi' && all['saichi_loop']) return all['saichi_loop'];
    return all[lineId] || null;
  },

  /**
   * 指定路線の運行支障情報を設定・更新
   */
  setLineDisruption: (disruption: LineDisruption): void => {
    const all = disruptionManager.getAllDisruptions();
    all[disruption.lineId] = {
      ...disruption,
      updatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('Failed to save disruption to storage:', e);
    }

    // サーバーにも非同期で通知（可能なら）
    try {
      fetch('/api/disruptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disruptions: all }),
      }).catch(() => {
        // Ignore server error in local mode
      });
    } catch {
      // Ignore
    }

    notifyListeners();
  },

  /**
   * 指定路線の運行支障を解除（平常運転に復帰）
   */
  clearLineDisruption: (lineId: string): void => {
    const all = disruptionManager.getAllDisruptions();
    delete all[lineId];
    if (lineId === 'saichi') delete all['saichi_loop'];
    if (lineId === 'saichi_loop') delete all['saichi'];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('Failed to clear disruption in storage:', e);
    }

    try {
      fetch('/api/disruptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disruptions: all }),
      }).catch(() => {});
    } catch {}

    notifyListeners();
  },

  /**
   * 全路線の運行支障を一括解除
   */
  clearAllDisruptions: (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    try {
      fetch('/api/disruptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disruptions: {} }),
      }).catch(() => {});
    } catch {}

    notifyListeners();
  },

  /**
   * 運行状態サマリー（StatusCard・ホーム画面向け）の生成
   */
  getStatusSummary: (): DisruptionSummaryResponse => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const disruptions = disruptionManager.getAllDisruptions();

    let hasDelay = false;
    const delayedLineNames: string[] = [];

    const lines = DEFAULT_LINE_INFOS.map((def) => {
      const d = disruptions[def.id] || (def.id === 'saichi' ? disruptions['saichi_loop'] : null);

      if (d && d.statusType !== 'normal') {
        hasDelay = true;
        const msg = d.useCustomMessage && d.customMessage.trim()
          ? d.customMessage.trim()
          : generateDisruptionText(
              def.name,
              d.statusType,
              d.maxDelayMinutes,
              d.section,
              d.reason,
              d.durationUntil,
              d.targetDirection || 'both'
            );

        let statusText = '平常運転';
        let delayMinutes = 0;
        const dirSuffix = d.targetDirection === 'up' ? ' (上り線)' : d.targetDirection === 'down' ? ' (下り線)' : '';

        if (d.statusType === 'suspended') {
          statusText = `運転見合わせ${dirSuffix}`;
          delayedLineNames.push(`${def.name}(見合わせ${dirSuffix})`);
        } else if (d.statusType === 'partially_suspended') {
          statusText = `一部運休${dirSuffix}`;
          delayedLineNames.push(`${def.name}(一部運休${dirSuffix})`);
        } else if (d.statusType === 'delay') {
          statusText = d.maxDelayMinutes > 0 ? `遅延 (最大約${d.maxDelayMinutes}分)${dirSuffix}` : `一部遅延${dirSuffix}`;
          delayMinutes = d.maxDelayMinutes;
          delayedLineNames.push(`${def.name}(遅延${dirSuffix})`);
        }

        return {
          id: def.id,
          lineName: def.name,
          code: def.code,
          status: statusText,
          statusType: d.statusType,
          targetDirection: d.targetDirection || 'both',
          delayMinutes,
          maxDelayMinutes: d.maxDelayMinutes,
          message: msg,
          linkToSystem: d.linkToSystem ?? true,
          section: d.section || '全線',
          reason: d.reason || '',
          durationUntil: d.durationUntil || '',
        };
      }

      // 平常運転
      return {
        id: def.id,
        lineName: def.name,
        code: def.code,
        status: '平常運転',
        statusType: 'normal' as DisruptionStatusType,
        targetDirection: 'both' as DisruptionDirection,
        delayMinutes: 0,
        maxDelayMinutes: 0,
        message: '現在、全線でほぼ平常通り運転しております。',
        linkToSystem: true,
        section: '全線',
        reason: '',
        durationUntil: '',
      };
    });

    let summary = '現在、神埼鉄道グループ全線でほぼ平常通り運転しております。';
    if (hasDelay) {
      summary = `【運行支障情報】${delayedLineNames.join('、')}が発生しております。`;
    }

    // 有効な運行予測・警報を取得（期限切れは自動クリーンアップ）
    const forecasts = disruptionManager.getOperationForecasts();

    return {
      updatedAt: `${now.toLocaleDateString('ja-JP')} ${timeStr}`,
      hasDelay,
      summary,
      forecasts,
      lines,
    };
  },

  /**
   * 運行予測・警報（運転予告）の取得（期限切れ自動判定・自動削除付き）
   */
  getOperationForecasts: (): OperationForecast[] => {
    try {
      const raw = localStorage.getItem(FORECAST_STORAGE_KEY);
      if (!raw) return [];
      const parsed: OperationForecast[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const now = Date.now();
      // 有効期限内のもののみを抽出 & 絵文字を完全自動除去
      const activeForecasts = parsed.filter((f) => {
        if (!f.isActive) return false;
        if (f.expiresAtTimestamp && now >= f.expiresAtTimestamp) {
          // 期限切れ
          return false;
        }
        return true;
      }).map((f) => ({
        ...f,
        categoryLabel: f.categoryLabel ? f.categoryLabel.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu, '').trim() : f.categoryLabel,
        headline: f.headline ? f.headline.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu, '').trim() : f.headline,
      }));

      // もし期限切れで数が減っていたらストレージを自動更新
      if (activeForecasts.length !== parsed.length) {
        try {
          localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(activeForecasts));
        } catch (e) {}
      }

      return activeForecasts;
    } catch {
      return [];
    }
  },

  /**
   * 運行予測・警報の発令・保存
   */
  saveOperationForecast: (forecastData: Omit<OperationForecast, 'id' | 'createdAt'>): OperationForecast => {
    const existing = disruptionManager.getOperationForecasts();
    const newForecast: OperationForecast = {
      ...forecastData,
      id: `forecast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    // 同一ライン・同一カテゴリの古い予告があれば上書き更新、それ以外は追加
    const updated = [
      newForecast,
      ...existing.filter((f) => !(f.lineId === newForecast.lineId && f.category === newForecast.category)),
    ];

    try {
      localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save forecast to storage:', e);
    }

    notifyListeners();
    return newForecast;
  },

  /**
   * 運行予測・警報の解除・停止
   */
  removeOperationForecast: (forecastId: string): void => {
    const existing = disruptionManager.getOperationForecasts();
    const filtered = existing.filter((f) => f.id !== forecastId);

    try {
      localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.warn('Failed to update forecast storage:', e);
    }

    notifyListeners();
  },

  /**
   * 全ての運行予測・警報を一括解除
   */
  clearAllOperationForecasts: (): void => {
    try {
      localStorage.removeItem(FORECAST_STORAGE_KEY);
    } catch (e) {}

    notifyListeners();
  },

  /**
   * 定期的な期限切れ自動チェック（期限を過ぎたら自動停止・解除）
   */
  checkAndCleanupExpiredForecasts: (): boolean => {
    try {
      const raw = localStorage.getItem(FORECAST_STORAGE_KEY);
      if (!raw) return false;
      const parsed: OperationForecast[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return false;

      const now = Date.now();
      const valid = parsed.filter((f) => f.isActive && (!f.expiresAtTimestamp || now < f.expiresAtTimestamp));

      if (valid.length !== parsed.length) {
        localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(valid));
        notifyListeners();
        return true; // 失効があり更新された
      }
      return false;
    } catch {
      return false;
    }
  },

  /**
   * 列車ごとの実効遅延分数（1〜maxDelayMinutesの乱数）を算出
   * @param lineId 路線ID ('kanzaki', 'kanzaki_kosoku', 'saichi'/'saichi_loop', 'tsuchiura')
   * @param trainSeed 列車IDまたはタイムスタンプ等のシード
   * @param direction 進行方向 (1 = 下り, 2 = 上り, 'down' | 'up' | 'both')
   * @returns delayMinutes (0なら平常、>0なら遅れ、-1なら運休)
   */
  getEffectiveDelayForTrain: (
    lineId: string,
    trainSeed: string | number = 'train_default',
    direction?: 1 | 2 | 'up' | 'down' | 'both'
  ): { delayMinutes: number; isSuspended: boolean } => {
    const d = disruptionManager.getLineDisruption(lineId);
    if (!d || d.statusType === 'normal' || !d.linkToSystem) {
      return { delayMinutes: 0, isSuspended: false };
    }

    // 方向チェック: 上り線のみ / 下り線のみ の遅延設定がある場合
    if (d.targetDirection && d.targetDirection !== 'both' && direction !== undefined) {
      const isUpTrain = direction === 2 || direction === 'up';
      const isDownTrain = direction === 1 || direction === 'down';

      if (d.targetDirection === 'up' && !isUpTrain) {
        // 上り線のみの遅延指定で、対象が上り列車でない場合（下り列車）は平常運転
        return { delayMinutes: 0, isSuspended: false };
      }
      if (d.targetDirection === 'down' && !isDownTrain) {
        // 下り線のみの遅延指定で、対象が下り列車でない場合（上り列車）は平常運転
        return { delayMinutes: 0, isSuspended: false };
      }
    }

    if (d.statusType === 'suspended') {
      return { delayMinutes: 0, isSuspended: true };
    }

    if (d.statusType === 'partially_suspended') {
      // 3本に1本程度を運休、他は小遅延
      const seedNum = typeof trainSeed === 'number' ? trainSeed : stringToSeed(String(trainSeed));
      const isSusp = seedNum % 3 === 0;
      return {
        delayMinutes: isSusp ? 0 : Math.min(d.maxDelayMinutes || 5, (seedNum % 5) + 1),
        isSuspended: isSusp,
      };
    }

    // statusType === 'delay'
    const max = Math.max(1, d.maxDelayMinutes || 1);
    const seedNum = typeof trainSeed === 'number' ? trainSeed : stringToSeed(String(trainSeed));
    // 1〜max の範囲で乱数遅延を決定論的に生成
    const generatedDelay = (seedNum % max) + 1;

    return { delayMinutes: generatedDelay, isSuspended: false };
  },

  /**
   * 変更通知リスナーの登録
   */
  subscribe: (listener: () => void): (() => void) => {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

// クライアント側で30秒ごとに自動失効チェックを実行
if (typeof window !== 'undefined') {
  setInterval(() => {
    disruptionManager.checkAndCleanupExpiredForecasts();
  }, 30000);
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
