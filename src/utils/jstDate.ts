// 履歴・乗車券の確認ページの日付の表示。台帳(スプレッドシート)の日付は、ふつう、サーバー(GAS)が日本時間の文字
// ('2026/10/03 12:34:56'・'2026-10-03')にして返す。ところが、日付型として保存されたセルが、時区つきの時刻
// ('2026-10-02T15:00:00.000Z')のまま届くと、元の文字のまま画面に出てしまう。
// ここでは、時区つきの時刻(…Z・+09:00 など)だけを、日本時間の、その画面がいつも出している形に直す。
// それ以外(すでに読める形・空・壊れた値)は、1文字も変えずに、そのまま返す。端末の時区には、左右されない。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ZONED = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i;

interface JstParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

// 時区つきの時刻を、日本時間の年月日・時分秒にする。時区つきの時刻でない・実在しない日時は null
const zonedToJst = (value: unknown): JstParts | null => {
  if (typeof value !== 'string') return null;
  const m = ZONED.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  const s = Number(m[6] ?? 0);
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate() || h > 23 || mi > 59 || s > 59) return null;
  let offsetMin = 0;
  if (m[7].toUpperCase() !== 'Z') {
    const digits = m[7].slice(1).replace(':', '');
    offsetMin = (m[7][0] === '-' ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
  }
  const j = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60 * 1000 + JST_OFFSET_MS);
  if (Number.isNaN(j.getTime())) return null;
  return { y: j.getUTCFullYear(), mo: j.getUTCMonth() + 1, d: j.getUTCDate(), h: j.getUTCHours(), mi: j.getUTCMinutes(), s: j.getUTCSeconds() };
};

const p2 = (n: number) => String(n).padStart(2, '0');

// 履歴の日時(ポイント履歴・利用履歴)。サーバーが返す形は '2026/10/03 12:34:56'。時区つきの時刻だけを、その形に直す
export const ledgerDateTimeText = <T,>(value: T): T | string => {
  const p = zonedToJst(value);
  return p ? `${p.y}/${p2(p.mo)}/${p2(p.d)} ${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}` : value;
};

// 予約日。サーバーが返す形は '2026-10-03'(利用履歴の画面は、ふだん '2026/10/03' で出す)。sep で、区切りを選ぶ
export const ledgerDateText = <T,>(value: T, sep: '-' | '/' = '-'): T | string => {
  const p = zonedToJst(value);
  return p ? `${p.y}${sep}${p2(p.mo)}${sep}${p2(p.d)}` : value;
};
