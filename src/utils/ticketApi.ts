import { callGas } from './accountApi';

// サーバー(gas/Code.gs)の QR乗車券の応答
export type TicketState = 'valid' | 'used' | 'expired' | 'otherDay' | 'cancelled' | 'invalid';

export interface TicketInfo {
  trainName: string;
  boardingStation: string;
  destinationStation: string;
  carNo: number;
  seatNo: string;
  seatType: string;
  reservedDate: string;
  departureTime: string;
  arrivalTime: string;
}

export interface TicketResult {
  state: TicketState;
  ticket?: TicketInfo;
  usedAt?: string; // 乗車済みの時刻(HH:mm)
  justUsed?: boolean; // 「利用する」で、いま乗車済みになった
  token?: string; // getTicket のとき
}

const STATES: TicketState[] = ['valid', 'used', 'expired', 'otherDay', 'cancelled', 'invalid'];

const call = async (action: string, payload: Record<string, unknown>): Promise<TicketResult> => {
  const res = (await callGas(action, payload)) as unknown as Record<string, unknown>;
  if (res.status !== 'success') throw new Error(typeof res.message === 'string' ? res.message : '通信できませんでした');
  if (!STATES.includes(res.state as TicketState)) throw new Error('通信できませんでした');
  return res as unknown as TicketResult;
};

// 検札の画面: 券の状態を調べる(ログイン不要)
export const verifyTicket = (token: string) => call('verifyTicket', { token });

// 検札の画面: 「利用する」(有効な券だけが、乗車済みになる)
export const useTicket = (token: string) => call('useTicket', { token });

// 持ち主: 自分の予約のトークンと、いまの状態を受け取る
export const getTicket = (sessionToken: string, orderId: string) => call('getTicket', { sessionToken, orderId });

// 受け取ったトークンは端末に残す(電波の届かない場所でも、QR を出せるように)。出すのは、いまの予約の分だけ
const CACHE_KEY = 'nizaki_ticket';

export const readCachedTicketToken = (orderId: string): string | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return saved && saved.orderId === orderId && typeof saved.token === 'string' ? saved.token : null;
  } catch {
    return null;
  }
};

const cacheTicketToken = (orderId: string, token: string) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ orderId, token }));
  } catch {
    // 保存できなくても、QR は出せる
  }
};

// トークンを受け取って、端末に残す
export const fetchAndCacheTicket = async (sessionToken: string, orderId: string): Promise<TicketResult> => {
  const result = await getTicket(sessionToken, orderId);
  if (result.token) cacheTicketToken(orderId, result.token);
  return result;
};

export const TICKET_STATE_LABEL: Record<TicketState, string> = {
  valid: '有効',
  used: '乗車済み',
  expired: '期限切れ',
  otherDay: '別の列車',
  cancelled: '取消済み',
  invalid: '無効',
};
