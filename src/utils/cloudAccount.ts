// NIZAKI 2.0: アカウントのデータ(ポイント・クーポン・ミステリー・予約の履歴)を、クラウド(GAS)で持つための通信。
// 公開日まで、アプリは、ここを使わない(isLaunched() の内側だけ)。
import { callGas } from './accountApi';
import { PointHistoryItem, OrderHistoryItem } from '../types';

export interface MysteryStamp {
  stageNumber: number;
  stationId: string;
  stationName: string;
  stampedAt: string;
}

export interface MysteryProgress {
  stage: number;
  stamps: MysteryStamp[];
  cleared: boolean;
}

// 乗車済みの予約(乗車記録・マイレージの元になる)
export interface RideRecord {
  orderId: string;
  trainName: string;
  boardingStation: string;
  destinationStation: string;
  reservedDate: string;
  departureTime: string;
  seatType: string;
  totalPrice: number;
}

export interface CloudAccount {
  balance: number;
  history: PointHistoryItem[];
  usedCoupons: string[];
  claimedEvents: string[]; // 受け取り済みの1回限りの報酬('launch2' など)。古い保存データには無い
  mystery: MysteryProgress;
  orders: OrderHistoryItem[];
  rides: RideRecord[];
  migrated: boolean;
}

// 端末にある、これまでのデータ(初めてのログインで、サーバーへ1回だけ引き継ぐ)
export interface LocalAccountData {
  balance?: number;
  eventRewards: string[]; // 'stage1'〜'stage3'(神埼奇譚の各幕)・'mashin'(ミステリートレイン完全制覇)
  redeemedCodes: string[];
  usedCoupons: string[];
  mystery: MysteryProgress | null;
}

// 画面が付けるポイントの題名を、サーバーの報酬の名前にする(対象でなければ null)
export const rewardIdFromTitle = (title?: string | null): string | null => {
  if (!title) return null;
  const m = /神埼奇譚 第(\d+)幕解明報奨/.exec(title);
  if (m) return `stage${m[1]}`;
  if (title === 'ミステリートレイン完全制覇') return 'mashin';
  return null;
};

// 端末の保存先(これまでのアプリと同じ名前)
export const pointStoragePrefix = (email?: string | null): string | null => {
  if (!email) return null;
  const sanitized = email.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `kanzaki_npoint_${sanitized}`;
};

export const MYSTERY_KEYS = {
  stage: 'kanzaki_mystery_stage',
  stamps: 'kanzaki_mystery_stamps',
  cleared: 'kanzaki_mystery_cleared',
};
export const DEVICE_COUPON_KEY = 'kanzaki_used_coupons';
// ミステリーの進行と、AYAMI300などの使用済みクーポンは、これまで端末に1つだけ保存されていた(アカウントごとではない)。
// 別のアカウントに混ざらないよう、いま端末の保存先が、どの会員のものかを覚えておく。
export const DEVICE_OWNER_KEY = 'nizaki_device_owner';

export const readDeviceOwner = (): string | null => {
  try {
    return localStorage.getItem(DEVICE_OWNER_KEY);
  } catch {
    return null;
  }
};

export const writeDeviceOwner = (memberId: string) => {
  try {
    localStorage.setItem(DEVICE_OWNER_KEY, memberId);
  } catch {
    // 書けなくても、そのまま使える
  }
};

// 2つのミステリーの進行を、足し合わせる(幕は進む方、スタンプは両方、制覇はどちらかが済んでいれば済み)
export const mergeMysteryProgress = (a: MysteryProgress, b: MysteryProgress): MysteryProgress => {
  const stamps = [...a.stamps];
  b.stamps.forEach((s) => {
    if (!stamps.some((x) => x.stageNumber === s.stageNumber)) stamps.push(s);
  });
  stamps.sort((x, y) => x.stageNumber - y.stageNumber);
  return { stage: Math.max(a.stage, b.stage), stamps, cleared: a.cleared || b.cleared };
};

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

// 端末のミステリーの進行を読む(無ければ null)
export const readLocalMystery = (): MysteryProgress | null => {
  try {
    const stageRaw = localStorage.getItem(MYSTERY_KEYS.stage);
    const stamps = readJson<MysteryStamp[]>(MYSTERY_KEYS.stamps, []);
    const cleared = localStorage.getItem(MYSTERY_KEYS.cleared) === 'true';
    if (stageRaw === null && stamps.length === 0 && !cleared) return null;
    const stage = Math.min(3, Math.max(1, parseInt(stageRaw || '1', 10) || 1));
    return { stage, stamps: Array.isArray(stamps) ? stamps : [], cleared };
  } catch {
    return null;
  }
};

// クラウドのミステリーの進行を、端末の保存先へ写す(画面は、これまでどおり端末の保存先を読む)
export const writeLocalMystery = (m: MysteryProgress) => {
  try {
    localStorage.setItem(MYSTERY_KEYS.stage, String(m.stage));
    localStorage.setItem(MYSTERY_KEYS.stamps, JSON.stringify(m.stamps));
    localStorage.setItem(MYSTERY_KEYS.cleared, m.cleared ? 'true' : 'false');
  } catch {
    // 書けなくても、画面の中では、そのまま使える
  }
};

// 端末にある、これまでのデータを集める(この端末にデータが無ければ balance が無い=ウェルカムボーナスになる)
export const collectLocalData = (email?: string | null, memberId?: string | null): LocalAccountData => {
  const prefix = pointStoragePrefix(email);
  // 端末に1つだけの保存先(ミステリー・AYAMI300など)は、持ち主がまだ決まっていないか、この会員のときだけ、渡す
  const owner = readDeviceOwner();
  const deviceIsMine = owner === null || owner === memberId;
  const data: LocalAccountData = { eventRewards: [], redeemedCodes: [], usedCoupons: [], mystery: deviceIsMine ? readLocalMystery() : null };
  if (!prefix) return data;

  try {
    const bal = localStorage.getItem(`${prefix}_balance`);
    if (bal !== null && Number.isFinite(parseInt(bal, 10))) data.balance = Math.max(0, parseInt(bal, 10));
  } catch {
    // 読めなければ、なし
  }
  readJson<string[]>(`${prefix}_event_rewards`, []).forEach((title) => {
    const id = rewardIdFromTitle(String(title));
    if (id && !data.eventRewards.includes(id)) data.eventRewards.push(id);
  });
  data.redeemedCodes = readJson<string[]>(`${prefix}_redeemed_codes`, []).filter((c) => typeof c === 'string');
  data.usedCoupons = [
    ...readJson<string[]>(`${prefix}_used_delivery_coupons`, []),
    ...(deviceIsMine ? readJson<string[]>(DEVICE_COUPON_KEY, []) : []),
  ].filter((c) => typeof c === 'string');
  return data;
};

interface RawAccount {
  balance: number;
  migrated: boolean;
  history: { date: string; title: string; points: number; kind: string }[];
  usedCoupons: string[];
  claimedEvents?: string[];
  mystery: MysteryProgress;
  orders: OrderHistoryItem[];
  rides?: RideRecord[];
}

const HISTORY_TYPE: Record<string, PointHistoryItem['type']> = {
  welcome: 'coupon',
  migration: 'coupon',
  code: 'coupon',
  event: 'stamp',
  reservation: 'reservation',
  delivery: 'reservation',
  cancel: 'reservation',
};

const toAccount = (raw: RawAccount): CloudAccount => ({
  balance: raw.balance,
  migrated: raw.migrated,
  // ウェルカムと引き継ぎは、マイページの「イベント」に混ざらないよう、id の頭を pt_init_ にする
  history: raw.history.map((h, i) => ({
    id: `${h.kind === 'welcome' || h.kind === 'migration' ? 'pt_init_' : 'pt_'}cloud_${i}_${h.date}`,
    title: h.title,
    date: h.date,
    points: h.points,
    type: HISTORY_TYPE[h.kind] || 'reservation',
  })),
  usedCoupons: raw.usedCoupons,
  claimedEvents: raw.claimedEvents ?? [],
  mystery: raw.mystery,
  orders: raw.orders,
  rides: raw.rides ?? [],
});

interface CloudResponse {
  status: 'success' | 'error';
  message?: string;
  code?: string;
  alreadyUsed?: boolean;
  account?: RawAccount;
  added?: boolean;
  points?: number;
  balance?: number;
  mystery?: MysteryProgress;
}

const post = async (action: string, payload: Record<string, unknown>): Promise<CloudResponse> =>
  (await callGas(action, payload)) as unknown as CloudResponse;

export class CloudSessionError extends Error {}

export const syncAccount = async (sessionToken: string, local: LocalAccountData | null): Promise<CloudAccount> => {
  const res = await post('syncAccount', { sessionToken, local });
  if (res.status !== 'success' || !res.account) {
    if (res.code === 'session') throw new CloudSessionError(res.message || 'ログインの有効期限が切れています。');
    throw new Error(res.message || '同期できませんでした。');
  }
  return toAccount(res.account);
};

export const earnEventReward = async (sessionToken: string, rewardId: string) => {
  const res = await post('earnEventReward', { sessionToken, rewardId });
  if (res.status !== 'success') throw new Error(res.message || '報酬を受け取れませんでした。');
  return { added: !!res.added, points: res.points ?? 0, balance: res.balance ?? 0 };
};

export const redeemPointCode = async (sessionToken: string, code: string): Promise<{ ok: boolean; message: string }> => {
  const res = await post('redeemPointCode', { sessionToken, code });
  if (res.status === 'success') return { ok: true, message: `${(res.points ?? 0).toLocaleString()} pt を付与しました。` };
  return { ok: false, message: res.message || 'コードを使えませんでした。' };
};

export const useCoupon = async (sessionToken: string, code: string): Promise<{ ok: boolean; alreadyUsed: boolean }> => {
  const res = await post('useCoupon', { sessionToken, code });
  return { ok: res.status === 'success', alreadyUsed: !!res.alreadyUsed };
};

export const saveMysteryProgress = async (sessionToken: string, progress: MysteryProgress): Promise<MysteryProgress | null> => {
  const res = await post('saveMysteryProgress', { sessionToken, progress });
  return res.status === 'success' && res.mystery ? res.mystery : null;
};
