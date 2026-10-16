// 運行支障・運行予測の、選択肢と定型文のデータ(管理者画面の入力補助に使う)。
// 計算や保存は disruptionManager.ts が行う。ここは中身を並べるだけ。

import type { ForecastCategory, ForecastSeverity } from './disruptionManager';

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
