// Disruption Dispatcher & Train Delay Manager for 神埼鉄道 NIZAKI App

import { callGas } from './accountApi';
import { getAffectedStationRange, isTrainInAffectedRange } from './disruptionSections';

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

// 駅の並びと影響区間の計算は disruptionSections.ts に置き、ここからも今までどおり取り出せるようにする
export { LINE_STATIONS, getStationsForLine, getAffectedStationRange, isTrainInAffectedRange } from './disruptionSections';

// 選択肢と定型文のデータは disruptionPresets.ts に置き、ここからも今までどおり取り出せるようにする
export {
  COMMON_REASON_CATEGORIES,
  COMMON_REASONS,
  COMMON_SECTIONS,
  FORECAST_PRESETS,
} from './disruptionPresets';
export type { ForecastPresetDef } from './disruptionPresets';

// 文章づくり・理由に合う候補・自動解除の時刻候補は disruptionText.ts に置き、ここからも今までどおり取り出せるようにする
import { generateDisruptionText } from './disruptionText';
export { generateDisruptionText, getDurationPresetsForReason, getExpiryOptions, isWeatherRelatedReason } from './disruptionText';

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
      const seedNum = toSeed(trainSeed);
      const isSusp = seedNum % 3 === 0;
      return {
        delayMinutes: isSusp ? 0 : Math.min(d.maxDelayMinutes || 5, (seedNum % 5) + 1),
        isSuspended: isSusp,
      };
    }

    // statusType === 'delay'
    const max = Math.max(1, d.maxDelayMinutes || 1);
    const seedNum = toSeed(trainSeed);
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

// 列車のシード(列車番号や、発車時刻をミリ秒にした数)を、割り算に使う数にする。
// 数のままで割ると、時刻(1000や60000の倍数)のあまりが、数種類にかたよる(最大120分なら、1分・41分・81分だけ)ので、
// 文字のシードと同じ混ぜ方を通す
function toSeed(trainSeed: string | number): number {
  return stringToSeed(typeof trainSeed === 'number' ? String(Math.floor(Math.abs(trainSeed))) : String(trainSeed));
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
