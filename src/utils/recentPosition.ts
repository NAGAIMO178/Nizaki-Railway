// 直近に分かった、いまいる場所(座標)の置き場。画面の間で使い回して、同じ探しを何度もしない・許可の画面を何度も出さないためのもの。
//  - 端末の中の、アプリのメモリの中だけ。サーバーへは送らず、端末にも保存しない(アプリを閉じる・読み込み直すと消える)。
//  - 数分で古くなる(古い場所は使わない)。
const TTL_MS = 3 * 60 * 1000;

let last: { lat: number; lng: number; at: number } | null = null;

export const rememberPosition = (lat: number, lng: number, now: number = Date.now()): void => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  last = { lat, lng, at: now };
};

export const recentPosition = (now: number = Date.now()): { lat: number; lng: number } | null => {
  if (!last || now - last.at > TTL_MS || now < last.at) return null;
  return { lat: last.lat, lng: last.lng };
};

export const forgetPosition = (): void => {
  last = null;
};

export const RECENT_POSITION_TTL_MS = TTL_MS;
