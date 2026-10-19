// 更新の直後などで、画面ごとのファイルが取れなくなったとき、1回だけ自動で再読み込みする(何度も繰り返さない)
const KEY = 'nizaki_preload_reloaded';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

// 再読み込みしてよければ true(その場で、1回きりの印を付ける)
export const claimPreloadReload = (store: Store | null): boolean => {
  try {
    if (!store || store.getItem(KEY)) return false;
    store.setItem(KEY, '1');
    return true;
  } catch {
    return false; // 印を付けられないときは、繰り返しを避けて、自動では再読み込みしない
  }
};

export const installPreloadErrorReload = () => {
  window.addEventListener('vite:preloadError', (e) => {
    let store: Storage | null = null;
    try {
      store = window.sessionStorage;
    } catch {
      // 使えない環境では、自動の再読み込みはしない
    }
    if (claimPreloadReload(store)) {
      e.preventDefault();
      window.location.reload();
    }
  });
};
