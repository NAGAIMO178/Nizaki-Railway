// 「列車がない時間」(終電のあと〜始発の前)。固定の 0:00〜3:59 ではなく、ダイヤ(全路線の全列車)の「最終の到着」と「始発の発車」から決める。
// 経路検索(出発・到着)で、この時間のとき「この時間は、列車がありません」と出す。判定は、画面・通信と関係のない、純粋な関数。
// 時刻は「0時0分0秒からの経過秒」。24時以降(翌日の0時台)は 86400 以上。分は「0時0分からの分(0〜1439)」。
import type { TrainRow } from './diaTimetable';

const DAY_MIN = 24 * 60;

// 列車がない時間: fromMin(含む)から toMin(含まない)まで。日をまたぐことがある(例: 0:24〜4:51)
export interface QuietWindow {
  fromMin: number;
  toMin: number;
}

// ダイヤのデータが読めない・調べられないときの、安全策: これまでの目安(0:00〜0:29 は探す。0:30〜3:59 は、列車がない)
export const FALLBACK_QUIET_WINDOW: QuietWindow = { fromMin: 30, toMin: 4 * 60 };

export interface ServiceBounds {
  lastArrSec: number; // 全列車の、最後の到着(終着駅の着)
  firstDepSec: number; // 全列車の、最初の発車(始発駅の発)
}

// 全路線の列車の並びから、最終の到着と始発の発車を調べる(列車が1本もなければ null)
export const serviceBoundsOf = (lines: TrainRow[][]): ServiceBounds | null => {
  let last = -Infinity;
  let first = Infinity;
  for (const trains of lines) {
    for (const t of trains) {
      const s = t[5];
      if (s.length < 3) continue;
      const a = s[s.length - 2] !== -1 ? s[s.length - 2] : s[s.length - 1];
      const d = s[2] !== -1 ? s[2] : s[1];
      last = Math.max(last, t[4] + a);
      first = Math.min(first, t[4] + d);
    }
  }
  return Number.isFinite(last) && Number.isFinite(first) ? { lastArrSec: last, firstDepSec: first } : null;
};

// 列車がない時間: 最終の到着の分の「次の分」から、始発の発車の分の手前まで。調べられなければ null
export const quietWindowFromBounds = (b: ServiceBounds | null): QuietWindow | null => {
  if (!b) return null;
  const from = (Math.floor(b.lastArrSec / 60) + 1) % DAY_MIN;
  const to = Math.floor(b.firstDepSec / 60) % DAY_MIN;
  return from === to ? null : { fromMin: from, toMin: to };
};

// "HH:MM" を、0時からの分にする。読めなければ null
export const minutesOfClock = (timeText: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((timeText || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
};

// その時刻("HH:MM")が、列車がない時間か。window が null・未定(調べられていない)なら、安全策の目安を使う
export const isQuietTime = (timeText: string | undefined, window: QuietWindow | null | undefined): boolean => {
  const m = minutesOfClock(timeText);
  if (m === null) return false;
  const w = window ?? FALLBACK_QUIET_WINDOW;
  return w.fromMin <= w.toMin ? m >= w.fromMin && m < w.toMin : m >= w.fromMin || m < w.toMin;
};
