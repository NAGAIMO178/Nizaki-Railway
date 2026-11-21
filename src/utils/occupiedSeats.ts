// 座席選び: サーバー(gas/Code.gs の handleGetOccupiedSeats)にある、ほかの会員が予約した席を取る。
//  - 渡すのは、予約をサーバーへ送るときと同じ形の、日付(getLocalDateString = 予約日)・列車名(予約の trainName)・号車。
//  - 返るのは、取消でない予約の席(自由席は含まない・会員の情報は無い)。区間(from / to)は、使わない(サーバーも、区間を問わず、重なる席は断る)。
//  - 取れなかったとき(通信の失敗・サーバーの断り・形の違い)は null。画面は、何も出さず、いまの動き(模擬の埋まり方だけ)のまま。
import { callGas } from './accountApi';

type GasLike = { status?: string; seats?: unknown };
export type OccupiedCall = (action: string, payload: Record<string, unknown>) => Promise<GasLike>;

const SEAT_PATTERN = /^\d{1,2}[A-D]$/;

export const fetchOccupiedSeats = async (
  date: string,
  trainName: string,
  carNo: number,
  call: OccupiedCall = (a, p) => callGas(a, p) as Promise<GasLike>
): Promise<string[] | null> => {
  try {
    const res = await call('getOccupiedSeats', { date, trainName, carNo });
    if (!res || res.status !== 'success' || !Array.isArray(res.seats)) return null;
    const out: string[] = [];
    for (const row of res.seats as unknown[]) {
      const seat = row && typeof row === 'object' ? (row as { seat?: unknown }).seat : undefined;
      if (typeof seat === 'string' && SEAT_PATTERN.test(seat) && !out.includes(seat)) out.push(seat);
    }
    return out;
  } catch {
    return null;
  }
};
