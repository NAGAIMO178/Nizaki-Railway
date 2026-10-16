// Disruption Dispatcher & Train Delay Manager for 神埼鉄道 NIZAKI App

import { callGas } from './accountApi';
import { COMMON_REASON_CATEGORIES } from './disruptionPresets';

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
  expiresAtTimestamp?: number; // 自動解除する時刻(ms)。未設定なら手動で解除するまで継続
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
    '東京', '南千住', '北千住', '綾瀬', '松戸', '柏', '七光台', '春日部', '地下鉄岩槻',
    '大宮公園', '大宮', 'さいたま新都心', '南浦和', '川口', '赤羽', '志村坂上',
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

// 選択肢と定型文のデータは disruptionPresets.ts に置き、ここからも今までどおり取り出せるようにする
export {
  COMMON_REASON_CATEGORIES,
  COMMON_REASONS,
  COMMON_SECTIONS,
  FORECAST_PRESETS,
} from './disruptionPresets';
export type { ForecastPresetDef } from './disruptionPresets';

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

  const dayLabel = (d: Date) => {
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === baseDate.toDateString()) return '本日';
    if (d.toDateString() === tomorrow.toDateString()) return '明日';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatTimeOnly = (d: Date) => {
    // 0:00ちょうどは前日の24:00として表示(例: 本日 24:00)
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      return `${dayLabel(new Date(d.getTime() - 60000))} 24:00`;
    }
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dayLabel(d)} ${time}`;
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

// 管理者コンソールでの変更を、アプリ・LINE共有のGASバックエンドへ反映
// (失敗してもローカル表示は継続。次回のsyncFromServerで復帰する)
const ADMIN_TOKEN_STORAGE_KEY = 'nizaki_admin_token';

export const getAdminToken = (): string => {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const setAdminToken = (token: string): void => {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {}
};

export const DISRUPTION_PUSH_EVENT = 'nizaki-disruption-push';

function reportPushResult(ok: boolean, message?: string) {
  try {
    window.dispatchEvent(new CustomEvent(DISRUPTION_PUSH_EVENT, { detail: { ok, message } }));
  } catch {}
}

function pushDisruptionsToServer(disruptions: Record<string, LineDisruption>, forecasts: OperationForecast[]) {
  callGas('setDisruptions', { disruptions, forecasts, adminToken: getAdminToken() })
    .then((res) => reportPushResult(res.status === 'success', res.message))
    .catch(() => reportPushResult(false, '通信に失敗しました。'));
}

// 駅名の読み仮名「（おおみか）」を除いた名前
const stripStationReading = (name: string): string => name.replace(/（.*?）/g, '');

/**
 * 影響区間の文字列から、対象となる駅の範囲(駅の並びの添字)を求める。
 *  - 「全線」「上り線のみ」「下り線のみ」や、駅名が読み取れない文言 → null(全線に反映)
 *  - 「大宮 〜 池袋 間」のように駅名が2つ以上読み取れる → その2駅の間
 *  - 駅名が1つだけ → その駅のみ
 */
export const getAffectedStationRange = (lineId: string, section: string): [number, number] | null => {
  const text = (section || '').trim();
  if (!text || text === '全線' || /上り線のみ|下り線のみ/.test(text)) return null;

  const names = getStationsForLine(lineId).map(stripStationReading);
  // 「大宮」と「大宮公園」のような包含を避けるため、長い駅名から順に文中を探して消していく
  const order = names.map((name, idx) => ({ name, idx })).sort((a, b) => b.name.length - a.name.length);
  let remaining = text;
  const found: { idx: number; pos: number }[] = [];
  for (const { name, idx } of order) {
    const pos = remaining.indexOf(name);
    if (pos !== -1) {
      found.push({ idx, pos });
      remaining = remaining.slice(0, pos) + '\u0000'.repeat(name.length) + remaining.slice(pos + name.length);
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a.pos - b.pos);
  const first = found[0].idx;
  const second = found.length > 1 ? found[1].idx : first;
  return [Math.min(first, second), Math.max(first, second)];
};

/** 列車の位置(駅に停車中/次の駅との間)が、影響区間に含まれるか */
export const isTrainInAffectedRange = (
  lineId: string,
  range: [number, number] | null,
  stationName: string,
  isBetween: boolean
): boolean => {
  if (!range) return true;
  const stationIdx = getStationsForLine(lineId).map(stripStationReading).indexOf(stripStationReading(stationName));
  if (stationIdx === -1) return false;
  const [from, to] = range;
  return isBetween ? stationIdx >= from && stationIdx + 1 <= to : stationIdx >= from && stationIdx <= to;
};

export const disruptionManager = {
  /**
   * 全路線の現在設定されている運行支障情報を取得
   */
  getAllDisruptions: (): Record<string, LineDisruption> => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Record<string, LineDisruption> = JSON.parse(raw);
        const now = Date.now();
        const active: Record<string, LineDisruption> = {};
        for (const [key, value] of Object.entries(parsed)) {
          // 自動解除の時刻を過ぎたものは無かったことにする
          if (!value.expiresAtTimestamp || now < value.expiresAtTimestamp) {
            active[key] = value;
          }
        }
        return active;
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

    pushDisruptionsToServer(all, disruptionManager.getOperationForecasts());
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

    pushDisruptionsToServer(all, disruptionManager.getOperationForecasts());
    notifyListeners();
  },

  /**
   * 全路線の運行支障を一括解除
   */
  clearAllDisruptions: (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    pushDisruptionsToServer({}, disruptionManager.getOperationForecasts());
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

    pushDisruptionsToServer(disruptionManager.getAllDisruptions(), updated);
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

    pushDisruptionsToServer(disruptionManager.getAllDisruptions(), filtered);
    notifyListeners();
  },

  /**
   * 全ての運行予測・警報を一括解除
   */
  clearAllOperationForecasts: (): void => {
    try {
      localStorage.removeItem(FORECAST_STORAGE_KEY);
    } catch (e) {}

    pushDisruptionsToServer(disruptionManager.getAllDisruptions(), []);
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
   * @param position 列車の位置(停車中の駅名、または駅間にいるか)。指定すると影響区間の外の列車は平常運転になる
   * @returns delayMinutes (0なら平常、>0なら遅れ、-1なら運休)
   */
  getEffectiveDelayForTrain: (
    lineId: string,
    trainSeed: string | number = 'train_default',
    direction?: 1 | 2 | 'up' | 'down' | 'both',
    position?: { stationName: string; isBetween?: boolean }
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

    // 影響区間チェック: 区間が指定されている場合、その区間にいない列車は平常運転
    if (position) {
      const range = getAffectedStationRange(lineId, d.section);
      if (!isTrainInAffectedRange(lineId, range, position.stationName, !!position.isBetween)) {
        return { delayMinutes: 0, isSuspended: false };
      }
    }

    if (d.statusType === 'suspended') {
      return { delayMinutes: 0, isSuspended: true };
    }

    if (d.statusType === 'partially_suspended') {
      // 3本に1本程度を運休、他は小遅延
      const seedNum = typeof trainSeed === 'number' ? Math.floor(Math.abs(trainSeed)) : stringToSeed(String(trainSeed));
      const isSusp = seedNum % 3 === 0;
      return {
        delayMinutes: isSusp ? 0 : Math.min(d.maxDelayMinutes || 5, (seedNum % 5) + 1),
        isSuspended: isSusp,
      };
    }

    // statusType === 'delay'
    const max = Math.max(1, d.maxDelayMinutes || 1);
    const seedNum = typeof trainSeed === 'number' ? Math.floor(Math.abs(trainSeed)) : stringToSeed(String(trainSeed));
    // 1〜max の範囲で乱数遅延を決定論的に生成
    const generatedDelay = (seedNum % max) + 1;

    return { delayMinutes: generatedDelay, isSuspended: false };
  },

  /**
   * 自動解除の時刻を過ぎた運行支障を保存データから取り除く(取り除いたら true)
   */
  checkAndCleanupExpiredDisruptions: (): boolean => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed: Record<string, LineDisruption> = JSON.parse(raw);
      const now = Date.now();
      const valid: Record<string, LineDisruption> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!value.expiresAtTimestamp || now < value.expiresAtTimestamp) valid[key] = value;
      }
      if (Object.keys(valid).length !== Object.keys(parsed).length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        notifyListeners();
        return true;
      }
      return false;
    } catch {
      return false;
    }
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

  /**
   * GASバックエンドから最新の運行支障・予報情報を取り込み、ローカルを上書きする
   * (アプリ本体・LINE応答が同じ情報源を見るようにするための同期)
   */
  syncFromServer: async (): Promise<void> => {
    try {
      const result = await callGas('getDisruptions', {});
      if (result.status !== 'success') return;

      const nextDisruptions = JSON.stringify(result.disruptions || {});
      const nextForecasts = JSON.stringify(result.forecasts || []);
      let changed = false;
      try {
        if (localStorage.getItem(STORAGE_KEY) !== nextDisruptions) {
          localStorage.setItem(STORAGE_KEY, nextDisruptions);
          changed = true;
        }
      } catch (e) {}
      try {
        if (localStorage.getItem(FORECAST_STORAGE_KEY) !== nextForecasts) {
          localStorage.setItem(FORECAST_STORAGE_KEY, nextForecasts);
          changed = true;
        }
      } catch (e) {}

      // 内容が変わったときだけ通知(同じ内容で毎回通知すると画面の再描画が止まらなくなる)
      if (changed) notifyListeners();
    } catch {
      // オフライン等の場合はローカルの表示をそのまま維持
    }
  },
};

// クライアント側で30秒ごとに自動失効チェックを実行
if (typeof window !== 'undefined') {
  setInterval(() => {
    disruptionManager.checkAndCleanupExpiredForecasts();
    disruptionManager.checkAndCleanupExpiredDisruptions();
  }, 30000);

  // 起動時、および20秒ごとにGASから最新の運行情報を取り込む
  // (タブが何であっても常時バックグラウンドで同期する)
  disruptionManager.syncFromServer();
  setInterval(() => {
    disruptionManager.syncFromServer();
  }, 20000);
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
