import React, { lazy, useState } from 'react';

// 開くときに読み込む画面。先に preload() しておくと、開いたときに待たずにすぐ出る
export const lazyScreen = <T extends React.ComponentType<any>>(load: () => Promise<Record<string, any>>, name: string) => {
  let loaded: T | null = null;
  const remember = (m: Record<string, any>) => (loaded = m[name] as T);
  const Lazy = lazy(() => load().then((m) => ({ default: remember(m) })));
  const Screen = (props: React.ComponentProps<T>) => {
    // 読み込み済みなら、待たずにそのまま出す(表示中に入れ替わらないよう、出すときに決める)
    const [Shown] = useState<React.ComponentType<any>>(() => loaded ?? Lazy);
    return <Shown {...props} />;
  };
  Screen.preload = () => load().then(remember);
  return Screen;
};

type Connection = { saveData?: boolean; effectiveType?: string };

// データ節約・遅い回線(3G以下)のときは、先読みしない
export const canPrefetch = (connection?: Connection | null): boolean => {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '');
};

interface PrefetchEnv {
  connection?: Connection | null;
  idle: (cb: () => void) => () => void; // 手が空いたときに呼ぶ(止める関数を返す)
  whenLoaded: (cb: () => void) => () => void; // ページの読み込みが終わったら呼ぶ
}

const browserEnv = (): PrefetchEnv => ({
  connection: (navigator as Navigator & { connection?: Connection }).connection,
  idle: (cb) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(cb, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(cb, 2000);
    return () => window.clearTimeout(id);
  },
  whenLoaded: (cb) => {
    if (document.readyState === 'complete') {
      cb();
      return () => {};
    }
    window.addEventListener('load', cb, { once: true });
    return () => window.removeEventListener('load', cb);
  },
});

// ホームが出て、ページの読み込みが終わり、手が空いてから、ひとつずつ裏で読み込む(起動を邪魔しない)
export const prefetchScreens = (screens: { preload: () => Promise<unknown> }[], env: PrefetchEnv = browserEnv()): (() => void) => {
  if (!canPrefetch(env.connection)) return () => {};
  const queue = [...screens];
  let cancelled = false;
  let cancelPending: () => void = () => {};
  const next = () => {
    if (cancelled || queue.length === 0) return;
    cancelPending = env.idle(() => {
      const screen = queue.shift();
      if (!screen) return;
      screen.preload().catch(() => {}).finally(next);
    });
  };
  const cancelLoad = env.whenLoaded(next);
  return () => {
    cancelled = true;
    cancelLoad();
    cancelPending();
  };
};
