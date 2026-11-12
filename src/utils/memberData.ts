// ログアウト・退会のとき、会員のデータを、この端末から消す(共用の端末で、次に使う人に残さない)。
// 消すのは、端末の控えだけ。サーバーのデータは消さない(もう一度ログインすると、サーバーから戻る)。
//
// 消す(会員のデータ):
//  - クラウド同期の控え(ポイント・履歴・予約・乗車記録): nizaki_cloud_cache_*
//  - QR乗車券のトークンの控え: nizaki_ticket
//  - 会員の内容を写した、端末に1つだけの保存先(ミステリーの進み具合・使用済みクーポン)と、その持ち主の印。
//    持ち主の印が無いもの(ログインしていない人の、端末内のデータ)は、消さない
//  - この会員の、端末内のポイント・履歴・終了した予約・受け取り済みの印・使用済みのクーポン(${prefix}_...)。
//    サーバーに同期ずみのとき(synced)か、退会のときだけ。同期の前に消すと、引き継ぐ前のポイントを失うため
//  - 退会のときだけ: この会員の、いまの予約の控えと、公開記念イベントの進み(アカウントごと消えるため)
// 消さない(端末の設定・会員が決まらないデータ): 通知の設定・マイ駅・経路検索・最近見た駅・更新のお知らせ・見た場面の印・
//  端末の識別番号・ログ・管理者の印・通知済みの印・(ログアウトのときの)いまの予約の控えと、公開記念イベントの進み
import { DEVICE_COUPON_KEY, DEVICE_OWNER_KEY, MYSTERY_KEYS, pointStoragePrefix } from './cloudAccount';
import { progressKey } from './eventTare';
import { CACHE_KEY as TICKET_CACHE_KEY } from './ticketApi';
import { CLOUD_CACHE_PREFIX } from './useCloudAccount';

export interface ClearMemberDataOptions {
  email?: string | null;
  memberId?: string | null;
  synced: boolean; // サーバーに同期ずみか(端末内のポイントなどを、消してよいか)
  accountDeleted: boolean; // 退会のときか
}

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>;

const keysOf = (storage: StorageLike): string[] => {
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    const out: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  }
  return Object.keys(storage);
};

// 端末の控えの、ポイント・履歴などのキー(会員のメールごと)
const PER_EMAIL_SUFFIXES = ['_balance', '_history', '_order_history', '_event_rewards', '_redeemed_codes', '_used_delivery_coupons'];

// 消したキーの一覧を返す(テスト用)。消せなくても、続ける
export const clearMemberDataFromDevice = (opts: ClearMemberDataOptions, storage: StorageLike = localStorage): string[] => {
  const removed: string[] = [];
  const remove = (key: string) => {
    try {
      if (storage.getItem(key) === null) return;
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // 消せなくても、ほかの分は消す
    }
  };

  try {
    keysOf(storage)
      .filter((k) => k.startsWith(CLOUD_CACHE_PREFIX))
      .forEach(remove);
  } catch {
    // 一覧を読めなくても、ほかの分は消す
  }
  remove(TICKET_CACHE_KEY);

  // 端末に1つだけの保存先は、持ち主(会員)の印があるときだけ消す。印が無いものは、ログインしていない人のデータ
  let owner: string | null = null;
  try {
    owner = storage.getItem(DEVICE_OWNER_KEY);
  } catch {
    owner = null;
  }
  if (owner !== null) {
    [MYSTERY_KEYS.stage, MYSTERY_KEYS.stamps, MYSTERY_KEYS.cleared, DEVICE_COUPON_KEY, DEVICE_OWNER_KEY].forEach(remove);
  }

  const prefix = pointStoragePrefix(opts.email);
  if (prefix && (opts.synced || opts.accountDeleted)) {
    PER_EMAIL_SUFFIXES.forEach((s) => remove(`${prefix}${s}`));
  }
  if (opts.accountDeleted) {
    if (prefix) remove(`${prefix}_active_order`);
    [opts.email, opts.memberId].forEach((o) => {
      if (o) remove(progressKey(String(o)));
    });
  }
  return removed;
};
