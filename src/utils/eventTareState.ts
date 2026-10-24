// 画面が持つ、参加・クリアの印(readEventProgress)から、イベントの状態を求める。
// 参加の時刻(joinedAt)も渡す: 参加より前に土浦に着いた予約は、対象にならない。時刻の無い古い印(0)は、今までどおり。
import { getEventState } from './eventTare';
import type { EventOrder, EventProgress, EventTareState } from './eventTare';

export const eventStateFor = (progress: EventProgress, orders: EventOrder[], now: Date): EventTareState =>
  getEventState(progress.joined, orders, now, { cleared: progress.cleared, joinedAt: progress.joinedAt });
