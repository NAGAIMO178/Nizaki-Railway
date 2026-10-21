// EAN-13(JAN-13)のバーコード。13桁の数字。
// 並び: 左の余白・左ガード(101)・左6桁・中央ガード(01010)・右6桁・右ガード(101)・右の余白。全部で95モジュール。
// 左6桁の符号(L か G)は、先頭の桁で決まる。右6桁は R。先頭の桁は、バーでは表さない(数字だけ、バーの左の外に書く)
const L_CODES = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R_CODES = L_CODES.map((c) => c.replace(/[01]/g, (b) => (b === '0' ? '1' : '0')));
const G_CODES = R_CODES.map((c) => c.split('').reverse().join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export const EAN13_MODULES = 95;
export const EAN13_QUIET = 11; // 左右に必要な白い余白(モジュール数)

// 先頭の12桁から、チェックデジット(13桁目)。右から順に、奇数番目 ×3・偶数番目 ×1 を足し、下1桁を10から引く
export const ean13CheckDigit = (first12: string): number => {
  if (!/^\d{12}$/.test(first12)) throw new Error('12桁の数字ではありません');
  const sum = first12
    .split('')
    .reverse()
    .reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
};

export const isValidEan13 = (digits: string): boolean => /^\d{13}$/.test(digits) && ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12]);

// 会員番号・予約番号(KZ-11319 など)から、13桁を作る。
// 先頭2桁 20(JAN の「店舗内・社内用」の範囲。実在の商品とかぶらない)+ 種別1桁(会員証 1・乗車券 2)+ 番号の数字部分を9桁(左をゼロで埋める)+ チェックデジット。
// 数字部分が無い・9桁を超えるときは null
export const ean13FromId = (kind: '1' | '2', id: string | undefined): string | null => {
  const m = /(\d+)$/.exec(id ?? '');
  if (!m || m[1].length > 9) return null;
  const first12 = `20${kind}${m[1].padStart(9, '0')}`;
  return first12 + ean13CheckDigit(first12);
};

export interface Ean13 {
  digits: string;
  modules: string; // 95文字の '1'(バー)と '0'(スペース)
  bars: { x: number; width: number; guard: boolean }[]; // 黒いバー(モジュール単位)。ガードのバーは、下へ長く描く
}

export const encodeEan13 = (digits: string): Ean13 => {
  if (!isValidEan13(digits)) throw new Error('EAN-13 の13桁ではありません(桁数・チェックデジット)');
  const parity = PARITY[Number(digits[0])];
  let modules = '101';
  for (let i = 0; i < 6; i++) modules += (parity[i] === 'L' ? L_CODES : G_CODES)[Number(digits[1 + i])];
  modules += '01010';
  for (let i = 0; i < 6; i++) modules += R_CODES[Number(digits[7 + i])];
  modules += '101';

  const bars: Ean13['bars'] = [];
  for (let x = 0; x < modules.length; ) {
    if (modules[x] !== '1') {
      x++;
      continue;
    }
    let end = x;
    while (end < modules.length && modules[end] === '1') end++;
    const guard = x < 3 || (x >= 45 && x < 50) || x >= 92;
    bars.push({ x, width: end - x, guard });
    x = end;
  }
  return { digits, modules, bars };
};

// バーを塗る。fill は (x, y, 幅, 高さ) で長方形を塗る関数(画像の canvas でも、確かめるときの画素でも使える)。
// x は、左ガードの左端(余白は含まない)。ガードのバーは、guardExtra だけ下へ長く
export const paintEan13 = (
  fill: (x: number, y: number, w: number, h: number) => void,
  ean: Ean13,
  x: number,
  y: number,
  unit: number,
  height: number,
  guardExtra: number,
) => {
  ean.bars.forEach((b) => fill(x + b.x * unit, y, b.width * unit, height + (b.guard ? guardExtra : 0)));
};

// 数字の位置(標準の表記): 先頭の1桁は、バーの左の外。次の6桁は左半分、次の6桁は右半分。cx は、数字の中心(x と同じ座標)
export const ean13DigitCells = (ean: Ean13, x: number, unit: number): { digit: string; cx: number }[] =>
  ean.digits.split('').map((digit, i) => ({
    digit,
    cx: i === 0 ? x - (EAN13_QUIET / 2) * unit : x + (i <= 6 ? 3 + (i - 1) * 7 + 3.5 : 50 + (i - 7) * 7 + 3.5) * unit,
  }));
