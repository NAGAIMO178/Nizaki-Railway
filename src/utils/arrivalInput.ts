// 到着時刻の入力(NIZAKI 2.0。公開後だけ)。「今日・明日」と「時・分」を、1つの値にまとめて扱う。
export type ArrivalDay = 'today' | 'tomorrow';

export interface ArrivalTime {
  day: ArrivalDay;
  hour: number; // 0〜23
  minute: number; // 0〜59
}

const DAY_MIN = 24 * 60;

const toMin = (t: ArrivalTime): number => (t.day === 'tomorrow' ? DAY_MIN : 0) + t.hour * 60 + t.minute;

// 今日の0:00〜明日の23:59の範囲に収める
const fromMin = (m: number): ArrivalTime => {
  const c = Math.max(0, Math.min(2 * DAY_MIN - 1, m));
  const rest = c % DAY_MIN;
  return { day: c >= DAY_MIN ? 'tomorrow' : 'today', hour: Math.floor(rest / 60), minute: rest % 60 };
};

export const shiftArrival = (t: ArrivalTime, deltaMin: number): ArrivalTime => fromMin(toMin(t) + deltaMin);

export const arrivalFromDate = (d: Date): ArrivalTime => ({ day: 'today', hour: d.getHours(), minute: d.getMinutes() });

// はじめに入れておく到着時刻: いまの1時間後
export const defaultArrival = (now: Date): ArrivalTime => shiftArrival(arrivalFromDate(now), 60);

const pad = (n: number): string => String(n).padStart(2, '0');

export const arrivalClock = (t: ArrivalTime): string => `${pad(t.hour)}:${pad(t.minute)}`;

export const arrivalLabel = (t: ArrivalTime): string => `${t.day === 'tomorrow' ? '明日' : '今日'} ${arrivalClock(t)}`;
