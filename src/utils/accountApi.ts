// 神埼ID 会員認証 API（Google Apps Script バックエンド連携）
// ★ gas/Code.gs をデプロイして発行された「ウェブアプリのURL」（.../exec）をここに貼り付けてください
const GAS_ACCOUNT_API_URL = 'https://script.google.com/macros/s/AKfycbzBwj3vNZi2zGMS965SzLzX7yUSk2WmiAxWA_kRK9SAyr007WHi1ffJ_l9OtLdKICYb/exec';

interface GasResponse {
  status: 'success' | 'error';
  message?: string;
  token?: string;
  user?: {
    memberId: string;
    name: string;
    email: string;
    rank: string;
    joinDate: string;
  };
}

async function callGas(action: string, payload: Record<string, unknown>): Promise<GasResponse> {
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

export const loginWithPassword = (email: string, password: string) =>
  callGas('login', { email, password });

export const startLineVerification = () =>
  callGas('startLineVerification', {});

export const verifyLineAndRegister = (email: string, password: string, token: string, code: string, name?: string) =>
  callGas('verifyLineAndRegister', { email, password, token, code, name });

export const deleteAccount = (email: string, password: string) =>
  callGas('deleteAccount', { email, password });

export const LINE_OA_ADD_FRIEND_URL = 'https://lin.ee/TBKmXZ1';
