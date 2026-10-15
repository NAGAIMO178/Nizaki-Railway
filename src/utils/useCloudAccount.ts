// NIZAKI 2.0: クラウドのアカウントのデータを、アプリで使うための部品。
//  - 公開前(isLaunched() が false)や、デモ会員(ログイン証なし)では、何もしない(active が false)。
//  - ログインしたとき、サーバーと同期する(初めてなら、端末のデータを1回だけ引き継ぐ)。
//  - 同期が終わる前に、ポイントなどを動かさない(動かすと、端末のデータの引き継ぎより先に、ウェルカムボーナスになってしまう)。
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserProfile } from '../types';
import { isLaunched } from './launch';
import {
  CloudAccount,
  MysteryProgress,
  collectLocalData,
  earnEventReward,
  mergeMysteryProgress,
  readDeviceOwner,
  readLocalMystery,
  redeemPointCode,
  saveMysteryProgress,
  spendPointsApi,
  syncAccount,
  useCoupon,
  writeDeviceOwner,
  writeLocalMystery,
  DEVICE_COUPON_KEY,
} from './cloudAccount';

export interface CloudApi {
  active: boolean; // 公開後で、ログイン証のある会員(この会員の分は、クラウドが基準)
  ready: boolean; // 最初の同期が済んだ(失敗した場合も true。error で見分ける)
  error: boolean;
  account: CloudAccount | null;
  refresh: () => Promise<boolean>;
  // 受け取れたか(added)と、付いたポイント。通信できなかったときは null
  earnEvent: (rewardId: string) => Promise<{ added: boolean; points: number } | null>;
  redeemCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  // 予約の支払いに使う(予約を確定する前に呼ぶ)。使えなかったときは、ok: false と、理由
  spendPoints: (orderId: string, points: number, title: string) => Promise<{ ok: boolean; message: string }>;
  markCouponUsed: (code: string) => void;
  // ミステリーの進行を、端末の保存先から読んで、サーバーへ送る(幕を解いたあとなどに呼ぶ)
  pushMystery: () => void;
}

const cacheKey = (memberId: string) => `nizaki_cloud_cache_${memberId}`;

const readCache = (memberId: string): CloudAccount | null => {
  try {
    const raw = localStorage.getItem(cacheKey(memberId));
    return raw ? (JSON.parse(raw) as CloudAccount) : null;
  } catch {
    return null;
  }
};

const writeCache = (memberId: string, account: CloudAccount) => {
  try {
    localStorage.setItem(cacheKey(memberId), JSON.stringify(account));
  } catch {
    // 保存できなくても、使える
  }
};

// 画面は、ミステリーの進行とクーポンの使用済みを、これまでどおり端末の保存先から読むので、クラウドの内容を、端末の保存先へ写す
// 端末の保存先が、この会員のものなら、端末の内容を後戻りさせないよう、足し合わせて書く(別の会員のものなら、上書き)
const mirrorToDevice = (account: CloudAccount, memberId: string) => {
  const mine = readDeviceOwner() === memberId;
  const local = mine ? readLocalMystery() : null;
  writeLocalMystery(local ? mergeMysteryProgress(local, account.mystery) : account.mystery);
  try {
    let coupons = account.usedCoupons;
    if (mine) {
      const raw = JSON.parse(localStorage.getItem(DEVICE_COUPON_KEY) || '[]');
      if (Array.isArray(raw)) coupons = Array.from(new Set([...coupons, ...raw.filter((c: unknown) => typeof c === 'string')]));
    }
    localStorage.setItem(DEVICE_COUPON_KEY, JSON.stringify(coupons));
  } catch {
    // 書けなくても、そのまま使える
  }
  writeDeviceOwner(memberId);
};

export function useCloudAccount(user: UserProfile | null): CloudApi {
  const token = user?.sessionToken;
  const email = user?.email;
  const memberId = user?.memberId;
  const active = isLaunched() && !!token && !!memberId;

  const [account, setAccount] = useState<CloudAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const memberRef = useRef(memberId);
  memberRef.current = memberId;
  // 最初の同期。これが済むまで、他の操作は待たせる
  const firstSyncRef = useRef<Promise<boolean>>(Promise.resolve(false));

  const apply = useCallback((a: CloudAccount) => {
    setAccount(a);
    setError(false);
    if (memberRef.current) {
      writeCache(memberRef.current, a);
      mirrorToDevice(a, memberRef.current);
    }
  }, []);

  useEffect(() => {
    if (!active || !token || !memberId) {
      setAccount(null);
      setReady(false);
      setError(false);
      firstSyncRef.current = Promise.resolve(false);
      return;
    }
    let alive = true;
    const cached = readCache(memberId);
    if (cached) setAccount(cached); // 通信が終わるまで、前回の内容を見せる
    setReady(false);
    const p = syncAccount(token, collectLocalData(email, memberId))
      .then((a) => {
        if (alive) {
          apply(a);
          setReady(true);
        }
        return true;
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setReady(true);
        }
        return false;
      });
    firstSyncRef.current = p;
    return () => {
      alive = false;
    };
  }, [active, token, memberId, email, apply]);

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!(await firstSyncRef.current)) return false;
    const t = tokenRef.current;
    if (!t) return false;
    try {
      apply(await syncAccount(t, null));
      return true;
    } catch {
      setError(true);
      return false;
    }
  }, [apply]);

  const earnEvent = useCallback(
    async (rewardId: string) => {
      if (!(await firstSyncRef.current)) return null;
      const t = tokenRef.current;
      if (!t) return null;
      try {
        const r = await earnEventReward(t, rewardId);
        // 結果をすぐ画面に反映して(残高と、受け取り済みの印)、全体の同期は、待たずに裏で行う(待つと、通信が2回分かかる)
        setAccount((prev) => {
          if (!prev) return prev;
          const claimed = prev.claimedEvents ?? [];
          const next = {
            ...prev,
            balance: r.added ? r.balance : prev.balance,
            claimedEvents: claimed.includes(rewardId) ? claimed : [...claimed, rewardId],
          };
          if (memberRef.current) writeCache(memberRef.current, next);
          return next;
        });
        void refresh();
        return { added: r.added, points: r.points };
      } catch {
        setError(true);
        return null;
      }
    },
    [refresh]
  );

  const redeemCode = useCallback(
    async (code: string) => {
      if (!(await firstSyncRef.current)) return { ok: false, message: '通信できませんでした。しばらくしてからもう一度お試しください。' };
      const t = tokenRef.current;
      if (!t) return { ok: false, message: 'ログインしてください。' };
      try {
        const r = await redeemPointCode(t, code);
        if (r.ok) await refresh();
        return r;
      } catch {
        return { ok: false, message: '通信できませんでした。しばらくしてからもう一度お試しください。' };
      }
    },
    [refresh]
  );

  const spendPoints = useCallback(
    async (orderId: string, points: number, title: string) => {
      const failed = { ok: false, message: '通信できませんでした。しばらくしてからもう一度お試しください。' };
      if (!(await firstSyncRef.current)) return failed;
      const t = tokenRef.current;
      if (!t) return { ok: false, message: 'ログインしてください。' };
      try {
        const r = await spendPointsApi(t, orderId, points, title);
        if (!r.ok) return { ok: false, message: r.message || 'ポイントを使えませんでした。' };
        // 残高をすぐ画面に反映して、全体の同期は裏で行う
        setAccount((prev) => {
          if (!prev) return prev;
          const next = { ...prev, balance: r.balance };
          if (memberRef.current) writeCache(memberRef.current, next);
          return next;
        });
        void refresh();
        return { ok: true, message: '' };
      } catch {
        return failed;
      }
    },
    [refresh]
  );

  const markCouponUsed = useCallback((code: string) => {
    const c = code.replace(/\s+/g, '').toUpperCase();
    // 画面にすぐ反映して(使用済み)、サーバーへ送る
    setAccount((prev) => {
      if (!prev || prev.usedCoupons.includes(c)) return prev;
      const next = { ...prev, usedCoupons: [...prev.usedCoupons, c] };
      if (memberRef.current) writeCache(memberRef.current, next);
      return next;
    });
    void (async () => {
      if (!(await firstSyncRef.current)) return;
      const t = tokenRef.current;
      if (t) {
        try {
          await useCoupon(t, c);
        } catch {
          // 送れなかったときは、次回の同期で、端末の使用済みが引き継がれる
        }
      }
    })();
  }, []);

  const pushMystery = useCallback(() => {
    // 画面が、端末の保存先に書き終わるのを、少し待ってから読む
    window.setTimeout(() => {
      void (async () => {
        if (!(await firstSyncRef.current)) return;
        const t = tokenRef.current;
        const local: MysteryProgress | null = readLocalMystery();
        if (!t || !local) return;
        try {
          await saveMysteryProgress(t, local);
        } catch {
          // 送れなかったときは、次回の同期で、端末の進行が足し合わされる
        }
      })();
    }, 600);
  }, []);

  return { active, ready, error, account, refresh, earnEvent, redeemCode, spendPoints, markCouponUsed, pushMystery };
}
