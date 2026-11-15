// 位置情報の許可の状態を調べる・許可の画面を出す(設定の「位置情報」用)。
//  - 状態は、ブラウザの permissions で調べる。使えない環境(古い Safari など)は 'unknown'(状態を断定しない)。
//  - 許可の画面は、位置情報の取得(departureFromLocation.ts と同じ仕組み)で出す。取れた位置は、数分だけ、アプリのメモリの中に覚える
//    (最寄り駅で使い回すため。recentPosition.ts)。画面には出さず、サーバーへも送らず、端末にも保存しない。
import { requestPosition } from './departureFromLocation';

// granted=許可されている / prompt=まだ許可していない / denied=許可されていない(ブラウザの設定で変える) / unknown=調べられない
export type LocationPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

const isState = (v: unknown): v is 'granted' | 'prompt' | 'denied' => v === 'granted' || v === 'prompt' || v === 'denied';

export const getLocationPermissionState = async (): Promise<LocationPermissionState> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions || typeof navigator.permissions.query !== 'function') return 'unknown';
    const s = await navigator.permissions.query({ name: 'geolocation' });
    return isState(s?.state) ? s.state : 'unknown';
  } catch {
    return 'unknown';
  }
};

// 許可の状態が変わったときに、知らせてもらう(設定の画面を開いたまま、ブラウザの設定を変えたとき)。やめるときの関数を返す。使えなければ、何もしない
export const watchLocationPermission = (onChange: (s: LocationPermissionState) => void): (() => void) => {
  let status: PermissionStatus | null = null;
  let alive = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions && typeof navigator.permissions.query === 'function') {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((s) => {
          if (!alive) return;
          status = s;
          s.onchange = () => alive && onChange(isState(s.state) ? s.state : 'unknown');
        })
        .catch(() => undefined);
    }
  } catch {
    // 使えない環境では、何もしない
  }
  return () => {
    alive = false;
    if (status) status.onchange = null;
  };
};

// 許可の画面を出して、そのあとの状態を返す。許可の画面は、拒否済みのときは、アプリからは出せない(状態は denied のまま)
export const requestLocationPermission = async (): Promise<LocationPermissionState> => {
  const position = await requestPosition();
  if (position) return 'granted';
  return getLocationPermissionState();
};
