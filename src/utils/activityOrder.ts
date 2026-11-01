// マイページの「アカウント利用履歴」を、日時の新しい順にそろえる。
// 予約の日付('2026-10-13'・'2026/10/13')と、ポイントの日時('2026/11/01 09:45:12'・'2026/11/01 09:45'・'11/01 09:45')は、書き方がちがうので、ミリ秒にそろえて比べる。

// 日時の文字を、ミリ秒にする(端末の時刻)。読めないときは 0(いちばん下)
export const parseActivityTime = (text: string | undefined, time?: string): number => {
  if (!text) return 0;
  const full = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  const short = full ? null : /(\d{1,2})[/-](\d{1,2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  let y: number, mo: number, d: number, h = 0, mi = 0, sec = 0;
  if (full) {
    [y, mo, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
    if (full[4] !== undefined) [h, mi, sec] = [Number(full[4]), Number(full[5]), Number(full[6] ?? 0)];
  } else if (short) {
    y = new Date().getFullYear();
    [mo, d, h, mi, sec] = [Number(short[1]), Number(short[2]), Number(short[3]), Number(short[4]), Number(short[5] ?? 0)];
  } else {
    return 0;
  }
  if (time && full?.[4] === undefined) {
    const t = /^(\d{1,2}):(\d{2})/.exec(time);
    if (t) [h, mi] = [Number(t[1]), Number(t[2])];
  }
  const ms = new Date(y, mo - 1, d, h, mi, sec).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

// at(ミリ秒)の新しい順。at が無い・読めない(0)ものは、最後に、もとの順のまま。同じ時刻は、もとの順のまま
export const sortNewestFirst = <T extends { at?: number }>(items: T[]): T[] =>
  items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (b.it.at ?? 0) - (a.it.at ?? 0) || a.i - b.i)
    .map((x) => x.it);

// これから乗る予約・デリバリーは、いちばん上に置く(日時の新しい順の、さらに上)
export const UPCOMING_AT = Number.MAX_SAFE_INTEGER;
