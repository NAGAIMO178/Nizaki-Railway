// マイページの入会日の表示。会員台帳(スプレッドシート)の入会日は、セルの形によって、いろいろな形で届く
// (登録時の '2026-10-03'・シートが日付として持ったときの '2026-10-02T15:00:00.000Z'・'2026/10/03' など)。
// どれも、日本時間の日付にして「2026年10月3日」の形で出す。端末の時区には左右されない(日付は、すべて UTC の関数で組み立てる)。
// 日付として読めないものは、そのまま出さず、「—」にする。
export const JOIN_DATE_EMPTY = '—';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const isRealDate = (y: number, m: number, d: number): boolean => {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // その月の日数(うるう年も)
  return d <= last;
};

const label = (y: number, m: number, d: number): string => (isRealDate(y, m, d) ? `${y}年${m}月${d}日` : JOIN_DATE_EMPTY);

// 時刻(ミリ秒)を、日本時間の日付にする
const fromMs = (ms: number): string => {
  if (!Number.isFinite(ms)) return JOIN_DATE_EMPTY;
  const j = new Date(ms + JST_OFFSET_MS);
  if (Number.isNaN(j.getTime())) return JOIN_DATE_EMPTY;
  return label(j.getUTCFullYear(), j.getUTCMonth() + 1, j.getUTCDate());
};

export const formatJoinDate = (value: unknown): string => {
  if (value instanceof Date) return fromMs(value.getTime());
  if (typeof value === 'number') return value > 1e11 ? fromMs(value) : JOIN_DATE_EMPTY; // ミリ秒の時刻だけ。小さな数は、日付ではない
  if (typeof value !== 'string') return JOIN_DATE_EMPTY;
  const s = value.trim();
  if (!s) return JOIN_DATE_EMPTY;

  // すでに日本語の表記(2026年10月3日)
  let m = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/.exec(s);
  if (m) return label(Number(m[1]), Number(m[2]), Number(m[3]));

  // 区切りは - / . のどれか。日付だけ、または、日付 + 時刻(+ 時区)
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(s);
  if (!m) return JOIN_DATE_EMPTY;
  const [, ys, ms, ds, hs, mins, secs, zone] = m;
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  if (!isRealDate(y, mo, d)) return JOIN_DATE_EMPTY;
  if (hs === undefined || !zone) return label(y, mo, d); // 日付だけ・時区の無い時刻 = シートの時区(日本時間)の日付
  // 時区つきの時刻(2026-10-02T15:00:00.000Z など)は、時刻として読んで、日本時間の日付にする
  const hh = Number(hs);
  const mm = Number(mins);
  const ss = Number(secs ?? 0);
  if (hh > 23 || mm > 59 || ss > 59) return JOIN_DATE_EMPTY;
  let offsetMin = 0;
  if (zone.toUpperCase() !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
  }
  return fromMs(Date.UTC(y, mo - 1, d, hh, mm, ss) - offsetMin * 60 * 1000);
};
