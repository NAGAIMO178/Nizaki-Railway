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

// 席ごとの状態(複数席の予約は席の数だけ。1席の予約も1つ)。取消・期限切れ・別の列車・無効は、全席に共通
export interface TicketSeat {
  seat: string;
  state: TicketState;
  usedAt?: string; // 利用済みにした時刻(HH:mm)
}

export interface TicketResult {
  state: TicketState;
  ticket?: TicketInfo;
  seats?: TicketSeat[];
  usedSeat?: string; // 「利用する」で、いま利用済みになった席
  usedAt?: string; // 利用済みにした時刻(HH:mm)
  justUsed?: boolean; // 「利用する」で、いま利用済みになった
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

// 検札の画面: 「利用する」(有効な券の、指定した席だけが、利用済みになる。席を省略できるのは1席の予約だけ)
export const useTicket = (token: string, seat?: string) => call('useTicket', seat === undefined ? { token } : { token, seat });

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
  used: '利用済み',
  expired: '期限切れ',
  otherDay: '別の列車',
  cancelled: '取消済み',
  invalid: '無効',
};

// 席ごとの状態。サーバーが席の一覧を返さなかったとき(1席の予約)は、全体の状態の1席として扱う
export const ticketSeatsOf = (result: TicketResult): TicketSeat[] => {
  if (result.seats && result.seats.length > 0) return result.seats;
  return [{ seat: result.ticket?.seatNo ?? '', state: result.state, usedAt: result.usedAt }];
};

// 予約カード・QR 画面に出す、利用の進み具合(全体の状態と、利用済みの席の数・席の数)
export interface TicketSummary {
  state: TicketState;
  used: number;
  total: number;
}

export const summarizeTicket = (result: TicketResult): TicketSummary => {
  const seats = ticketSeatsOf(result);
  return { state: result.state, used: seats.filter((s) => s.state === 'used').length, total: seats.length };
};

// 札の文字: 全席が利用済みなら「利用済み」、一部だけなら「一部利用済み(2/3)」。それ以外は札なし
export const ticketBadgeLabel = (summary: TicketSummary | null | undefined): string | null => {
  if (!summary) return null;
  if (summary.state === 'used') return TICKET_STATE_LABEL.used;
  if (summary.state === 'valid' && summary.used > 0 && summary.used < summary.total) return `一部${TICKET_STATE_LABEL.used}(${summary.used}/${summary.total})`;
  return null;
};
