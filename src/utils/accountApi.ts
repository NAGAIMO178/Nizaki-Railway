// 神埼ID 会員認証 API（Google Apps Script バックエンド連携）
// ★ gas/Code.gs をデプロイして発行された「ウェブアプリのURL」（.../exec）をここに貼り付けてください
const GAS_ACCOUNT_API_URL = 'https://script.google.com/macros/s/AKfycbzBwj3vNZi2zGMS965SzLzX7yUSk2WmiAxWA_kRK9SAyr007WHi1ffJ_l9OtLdKICYb/exec';

interface GasResponse {
  status: 'success' | 'error';
  message?: string;
  token?: string;
  sessionToken?: string;
  user?: {
    memberId: string;
    name: string;
    email: string;
    rank: string;
    joinDate: string;
  };
  disruptions?: Record<string, unknown>;
  forecasts?: unknown[];
}

export async function callGas(action: string, payload: Record<string, unknown>): Promise<GasResponse> {
  if (!GAS_ACCOUNT_API_URL || GAS_ACCOUNT_API_URL.includes('★')) {
    throw new Error('GAS_ACCOUNT_API_URL が未設定です。gas/Code.gs をデプロイし、発行されたURLを src/utils/accountApi.ts に設定してください。');
  }

  const res = await fetch(GAS_ACCOUNT_API_URL, {
    method: 'POST',
    // GASのdoPostはCORSプリフライト(OPTIONS)を処理できないため、
    // シンプルリクエスト扱いになる text/plain を指定する
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });

  if (!res.ok) {
    throw new Error(`通信エラーが発生しました (status: ${res.status})`);
  }

  return res.json();
}

// アクセス数の記録(端末ごとの乱数IDと起動の事実だけを送る。氏名・メールアドレス等は送らない)
// 自分の端末を数えたくないときは、URLの末尾に ?nocount=1 を付けて一度開く(戻すときは ?nocount=0)
const DEVICE_ID_KEY = 'nizaki_device_id';
const NO_COUNT_KEY = 'nizaki_no_count';
const PING_SENT_KEY = 'nizaki_ping_sent';

export const sendAccessPing = () => {
  try {
    if (import.meta.env.DEV) return;

    const param = new URLSearchParams(window.location.search).get('nocount');
    if (param === '1') localStorage.setItem(NO_COUNT_KEY, '1');
    if (param === '0') localStorage.removeItem(NO_COUNT_KEY);
    if (localStorage.getItem(NO_COUNT_KEY) === '1') return;

    // 同じタブでの再読み込みは1回として数える
    if (sessionStorage.getItem(PING_SENT_KEY)) return;
    sessionStorage.setItem(PING_SENT_KEY, '1');

    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    callGas('accessPing', { deviceId, version: __APP_VERSION__ }).catch(() => {});
  } catch {
    // 記録できなくてもアプリの動作には影響させない
  }
};

export const loginWithPassword = (email: string, password: string) =>
  callGas('login', { email, password });

export const startLineVerification = () =>
  callGas('startLineVerification', {});

export const verifyLineAndRegister = (email: string, password: string, token: string, code: string, name?: string) =>
  callGas('verifyLineAndRegister', { email, password, token, code, name });

export const deleteAccount = (email: string, password: string) =>
  callGas('deleteAccount', { email, password });

export const LINE_OA_ADD_FRIEND_URL = 'https://lin.ee/TBKmXZ1';
