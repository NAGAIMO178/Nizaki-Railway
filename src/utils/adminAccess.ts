// 管理者画面を開く条件: サーバー(GAS)が、管理トークンを「本物」と認めたとき。
// 認められるまでは、画面の中身を描かない。端末に保存した鍵があれば、開くたびにサーバーで確かめて、通ればそのまま入れる。
import { callGas } from './accountApi';
import { getAdminToken, setAdminToken } from './disruptionManager';

export type AdminAccess =
  | 'checking' // 確かめている
  | 'needKey' // 鍵の入力が要る
  | 'ok' // サーバーが認めた
  | 'denied' // 鍵が合わない
  | 'locked' // 失敗が続いて、サーバーが、しばらく断っている
  | 'offline'; // サーバーに聞けない(通信できない・サーバーが未対応)

type GasLike = { status?: string; code?: string };

export interface AdminAccessDeps {
  call: (action: string, payload: Record<string, unknown>) => Promise<GasLike>;
  getToken: () => string;
  setToken: (token: string) => void;
}

const defaultDeps: AdminAccessDeps = {
  call: (action, payload) => callGas(action, payload) as Promise<GasLike>,
  getToken: getAdminToken,
  setToken: setAdminToken,
};

// このあとは使わない、4桁のパスコードの保存(あれば消す)
const OLD_PIN_KEY = 'nizaki_admin_pin';

const verify = async (token: string, deps: AdminAccessDeps): Promise<Exclude<AdminAccess, 'checking' | 'needKey'>> => {
  try {
    const res = await deps.call('verifyAdminToken', { adminToken: token });
    if (res.status === 'success') return 'ok';
    if (res.status === 'error' && res.code === 'admin_locked') return 'locked';
    if (res.status === 'error' && res.code === 'admin') return 'denied';
  } catch {
    // 通信できない
  }
  return 'offline';
};

const forgetOldPin = () => {
  try {
    localStorage.removeItem(OLD_PIN_KEY);
  } catch {
    // 消せなくても、続ける
  }
};

// 画面を開いたとき: 保存してある鍵で、サーバーに確かめる。鍵が無ければ、入力を求める
export const checkStoredAdminKey = async (deps: AdminAccessDeps = defaultDeps): Promise<AdminAccess> => {
  const saved = deps.getToken();
  if (!saved) return 'needKey';
  const result = await verify(saved, deps);
  if (result === 'ok') forgetOldPin();
  // 合わない鍵は、端末に残さない(入力のやり直しになる)
  if (result === 'denied') deps.setToken('');
  return result;
};

// 鍵を入力したとき: サーバーが認めたときだけ、端末に保存する
export const submitAdminKey = async (input: string, deps: AdminAccessDeps = defaultDeps): Promise<Exclude<AdminAccess, 'checking' | 'needKey'>> => {
  const token = input.trim();
  if (!token) return 'denied';
  const result = await verify(token, deps);
  if (result === 'ok') {
    deps.setToken(token);
    forgetOldPin();
  }
  return result;
};
