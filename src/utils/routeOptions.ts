// 経路検索の絞り込みの設定と、前回の検索の記憶。
// 設定と、前回の出発駅・到着駅は、この端末に保存する。前回の結果は、アプリを開いているあいだだけ覚える。
export interface RouteOptions {
  // 有料の特急(特急券が必要な列車)を使う
  allowPaid: boolean;
  // 乗換の余裕。false=標準(4分) true=ゆったり(8分)
  relaxedTransfer: boolean;
  // 乗換の回数の上限。99=制限なし
  maxTransfers: 0 | 2 | 99;
  // 列車の遅れ・運転見合わせを加味する
  realtime: boolean;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  allowPaid: true,
  relaxedTransfer: false,
  maxTransfers: 99,
  realtime: true,
};

const OPTIONS_KEY = 'nizaki_route_options';
const QUERY_KEY = 'nizaki_route_query';

export const loadRouteOptions = (): RouteOptions => {
  try {
    const p = JSON.parse(localStorage.getItem(OPTIONS_KEY) || 'null');
    if (p && typeof p === 'object') {
      return {
        allowPaid: typeof p.allowPaid === 'boolean' ? p.allowPaid : DEFAULT_ROUTE_OPTIONS.allowPaid,
        relaxedTransfer: typeof p.relaxedTransfer === 'boolean' ? p.relaxedTransfer : DEFAULT_ROUTE_OPTIONS.relaxedTransfer,
        maxTransfers: p.maxTransfers === 0 || p.maxTransfers === 2 ? p.maxTransfers : 99,
        realtime: typeof p.realtime === 'boolean' ? p.realtime : DEFAULT_ROUTE_OPTIONS.realtime,
      };
    }
  } catch {
    // 読めなければ、初期の設定にする
  }
  return DEFAULT_ROUTE_OPTIONS;
};

export const saveRouteOptions = (o: RouteOptions) => {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // 保存できなくても、そのまま使える
  }
};

// 初期の設定と違う項目の数(絞り込みボタンの目印)
export const countChangedOptions = (o: RouteOptions): number =>
  (o.allowPaid !== DEFAULT_ROUTE_OPTIONS.allowPaid ? 1 : 0) +
  (o.relaxedTransfer !== DEFAULT_ROUTE_OPTIONS.relaxedTransfer ? 1 : 0) +
  (o.maxTransfers !== DEFAULT_ROUTE_OPTIONS.maxTransfers ? 1 : 0) +
  (o.realtime !== DEFAULT_ROUTE_OPTIONS.realtime ? 1 : 0);

export const loadLastQuery = (): { from: string; to: string } | null => {
  try {
    const p = JSON.parse(localStorage.getItem(QUERY_KEY) || 'null');
    if (p && typeof p.from === 'string' && typeof p.to === 'string') return { from: p.from, to: p.to };
  } catch {
    // 読めなければ、なし
  }
  return null;
};

export const saveLastQuery = (from: string, to: string) => {
  try {
    localStorage.setItem(QUERY_KEY, JSON.stringify({ from, to }));
  } catch {
    // 保存できなくても、そのまま使える
  }
};
