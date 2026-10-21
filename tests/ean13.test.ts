// EAN-13(JAN-13)の符号化を、規格の例と、別の読み取りの部品(@zxing/library)で確かめる。
import { BarcodeFormat, DecodeHintType, EAN13Reader } from '@zxing/library';
import { describe, expect, it } from 'vitest';
import { EAN13_QUIET, ean13CheckDigit, ean13DigitCells, ean13FromId, encodeEan13, isValidEan13, paintEan13 } from '../src/utils/ean13';
import { raster } from './helpers/raster';

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
  [DecodeHintType.TRY_HARDER, true],
]);

// 余白つきで描いて、読む
const readEan = (digits: string, unit: number, skip: number | null = null) => {
  const ean = encodeEan13(digits);
  const width = (95 + EAN13_QUIET * 2) * unit;
  const { fill, bitmap } = raster(width, 80);
  let i = 0;
  paintEan13(
    (x, y, w, h) => {
      if (i++ !== skip) fill(x, y, w, h);
    },
    ean,
    EAN13_QUIET * unit,
    0,
    unit,
    70,
    8,
  );
  const result = new EAN13Reader().decode(bitmap(), hints);
  expect(result.getBarcodeFormat()).toBe(BarcodeFormat.EAN_13);
  return result.getText();
};

describe('チェックデジット', () => {
  it('JAN の例: 4912345123459・4901234567894・4006381333931', () => {
    expect(ean13CheckDigit('491234512345')).toBe(9);
    expect(ean13CheckDigit('490123456789')).toBe(4);
    expect(ean13CheckDigit('400638133393')).toBe(1);
    for (const d of ['4912345123459', '4901234567894', '4006381333931']) expect(isValidEan13(d)).toBe(true);
  });

  it('1桁でも違うと、正しい13桁ではない。桁数・文字が違うものも断る', () => {
    expect(isValidEan13('4912345123450')).toBe(false);
    expect(isValidEan13('491234512345')).toBe(false);
    expect(isValidEan13('49123451234590')).toBe(false);
    expect(isValidEan13('491234512345a')).toBe(false);
    expect(() => encodeEan13('4912345123450')).toThrow();
    expect(() => ean13CheckDigit('12345')).toThrow();
  });
});

describe('13桁を作る(会員証 1・乗車券 2)', () => {
  it('先頭 20 + 種別 + 番号の数字を9桁(左をゼロ埋め)+ チェックデジット', () => {
    const member = ean13FromId('1', 'KZ-11319')!;
    expect(member).toMatch(/^201000011319\d$/);
    expect(isValidEan13(member)).toBe(true);
    const ticket = ean13FromId('2', 'EQ-12345')!;
    expect(ticket).toMatch(/^202000012345\d$/);
    expect(isValidEan13(ticket)).toBe(true);
    expect(ean13FromId('1', 'KZ-0')).toMatch(/^201000000000\d$/);
    expect(ean13FromId('1', 'KZ-123456789')).toMatch(/^201123456789\d$/);
  });

  it('JAN の「店舗内・社内用」の範囲(20〜29)から始まる', () => {
    expect(ean13FromId('1', 'KZ-11319')!.startsWith('20')).toBe(true);
  });

  it('数字の部分が取れない・9桁を超える番号は null', () => {
    for (const id of [undefined, '', 'KZ-', '未ログイン', 'KZ-1234567890', 'EQ-12a']) expect(ean13FromId('1', id)).toBeNull();
  });
});

describe('バーの形', () => {
  it('標準の例 4912345123459 のモジュール列(先頭の4 は LGLLGG)', () => {
    const { modules, bars } = encodeEan13('4912345123459');
    const expected =
      '101' +
      ['0001011', '0110011', '0010011', '0111101', '0011101', '0111001'].join('') + // 左6桁 9 1 2 3 4 5 = L G L L G G
      '01010' +
      ['1100110', '1101100', '1000010', '1011100', '1001110', '1110100'].join('') + // 右6桁 1 2 3 4 5 9 = R
      '101';
    expect(modules).toBe(expected);
    expect(modules).toHaveLength(95);
    // ガードのバーは、左2本・中央2本・右2本
    expect(bars.filter((b) => b.guard)).toHaveLength(6);
  });

  it('数字の位置: 先頭の1桁はバーの左の外、次の6桁は左半分、次の6桁は右半分', () => {
    const ean = encodeEan13('4912345123459');
    const cells = ean13DigitCells(ean, EAN13_QUIET, 1);
    expect(cells.map((c) => c.digit).join('')).toBe('4912345123459');
    expect(cells[0].cx).toBeLessThan(EAN13_QUIET); // 外
    expect(cells[1].cx).toBeGreaterThan(EAN13_QUIET + 3);
    expect(cells[6].cx).toBeLessThan(EAN13_QUIET + 45);
    expect(cells[7].cx).toBeGreaterThan(EAN13_QUIET + 50);
    expect(cells[12].cx).toBeLessThan(EAN13_QUIET + 92);
  });
});

describe('描いたバーコードを読み戻す', () => {
  it('JAN の例も、会員証・乗車券の13桁も、そのまま読める。小さくても読める', () => {
    for (const d of ['4912345123459', '4901234567894', ean13FromId('1', 'KZ-11319')!, ean13FromId('2', 'EQ-12345')!, ean13FromId('1', 'KZ-0')!]) {
      expect(readEan(d, 2)).toBe(d);
      expect(readEan(d, 6)).toBe(d);
    }
  });

  it('先頭の桁(パリティの並び)がすべての数字でも読める', () => {
    for (let first = 0; first < 10; first++) {
      const first12 = `${first}12345678901`.slice(0, 12);
      const d = first12 + ean13CheckDigit(first12);
      expect(readEan(d, 3)).toBe(d);
    }
  });

  it('わざと壊すと(バーを1本描かない)、読めない(または別の数字になる)', () => {
    const d = '4912345123459';
    for (const skip of [3, 8, 14, 20]) {
      let text: string | null;
      try {
        text = readEan(d, 3, skip);
      } catch {
        text = null;
      }
      expect(text).not.toBe(d);
    }
  });
});
