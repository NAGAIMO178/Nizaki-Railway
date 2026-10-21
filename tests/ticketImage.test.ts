// 描いた QR とバーコードを、別の読み取りの部品(@zxing/library)で読み戻して、元の文字と一致することを確かめる。
// 画面の canvas と同じ描き方(paintQr / paintCode128)に、画素を塗る関数を渡して、読み取りを確かめる。
import { BarcodeFormat, Code128Reader, DecodeHintType, QRCodeReader } from '@zxing/library';
import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, CODE128_QUIET, CODE128_STOP, encodeCode128B, paintCode128 } from '../src/utils/code128';
import { QR_QUIET, makeQrMatrix, paintQr, qrSvgPath } from '../src/utils/qrImage';
import { buildTicketUrl } from '../src/utils/ticketToken';
import { raster } from './helpers/raster';

const TOKEN = 'EQ-12345.AbCdEfGh_-Ij';
const LOCATION = { origin: 'https://example.github.io', pathname: '/Nizaki-Railway/' };

describe('QR を読み戻す', () => {
  const read = (text: string, unit: number) => {
    const matrix = makeQrMatrix(text);
    const size = (matrix.length + QR_QUIET * 2) * unit;
    const { fill, bitmap } = raster(size, size);
    paintQr(fill, matrix, QR_QUIET * unit, QR_QUIET * unit, unit);
    return new QRCodeReader().decode(bitmap()).getText();
  };

  it('QR乗車券のリンクが、そのまま読める(標準のカメラと同じ QR の規格)', () => {
    const url = buildTicketUrl(TOKEN, LOCATION);
    expect(read(url, 10)).toBe(url);
  });

  it('いちばん長いトークンでも読める。小さく描いても読める', () => {
    const longToken = `EQ-${'9'.repeat(37)}.${'z'.repeat(12)}`;
    const url = buildTicketUrl(longToken, LOCATION);
    expect(read(url, 8)).toBe(url);
    expect(read(buildTicketUrl(TOKEN, LOCATION), 4)).toBe(buildTicketUrl(TOKEN, LOCATION));
  });

  it('画面用の SVG の線は、行列と同じ濃いモジュールを描く', () => {
    const matrix = makeQrMatrix(buildTicketUrl(TOKEN, LOCATION));
    const size = matrix.length;
    const { fill, bitmap } = raster((size + QR_QUIET * 2) * 4, (size + QR_QUIET * 2) * 4);
    // 線 "M x y h len v1 h-len z" を読んで塗る
    for (const m of qrSvgPath(matrix).matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      fill((Number(m[1]) + QR_QUIET) * 4, (Number(m[2]) + QR_QUIET) * 4, Number(m[3]) * 4, 4);
    }
    expect(new QRCodeReader().decode(bitmap()).getText()).toBe(buildTicketUrl(TOKEN, LOCATION));
  });
});

describe('Code128 バーコード', () => {
  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);

  const read = (text: string, unit: number) => {
    const code = encodeCode128B(text);
    const width = (code.modules + CODE128_QUIET * 2) * unit;
    const height = 60;
    const { fill, bitmap } = raster(width, height);
    paintCode128(fill, code, CODE128_QUIET * unit, 0, unit, height);
    const result = new Code128Reader().decode(bitmap(), hints);
    expect(result.getBarcodeFormat()).toBe(BarcodeFormat.CODE_128);
    return result.getText();
  };

  it('記号の表は、規格どおりの形(各11モジュール・止めは13・重複なし)', () => {
    expect(CODE128_PATTERNS).toHaveLength(106);
    for (const p of CODE128_PATTERNS) {
      expect(p).toHaveLength(6);
      expect(p.split('').reduce((s, d) => s + Number(d), 0)).toBe(11);
    }
    expect(new Set(CODE128_PATTERNS).size).toBe(106);
    expect(CODE128_STOP.split('').reduce((s, d) => s + Number(d), 0)).toBe(13);
  });

  it('規格の例: "A" は 開始B + 33 + 検査 + 止め', () => {
    // 開始B=104, 'A'(65-32=33)。検査 = (104 + 33*1) % 103 = 34
    const { bars } = encodeCode128B('A');
    expect(bars.join('')).toBe(`${CODE128_PATTERNS[104]}${CODE128_PATTERNS[33]}${CODE128_PATTERNS[34]}${CODE128_STOP}`);
  });

  it('トークンを、読み取りの部品が読んで、元の文字と一致する', () => {
    expect(read(TOKEN, 3)).toBe(TOKEN);
    expect(read(TOKEN, 2)).toBe(TOKEN);
  });

  it('使える文字をひと通り読み戻せる', () => {
    const all = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
    expect(read(all.slice(0, 48), 3)).toBe(all.slice(0, 48));
    expect(read(all.slice(47), 3)).toBe(all.slice(47));
  });

  it('Code128-B で表せない文字は断る', () => {
    expect(() => encodeCode128B('神埼')).toThrow();
    expect(() => encodeCode128B('a\nb')).toThrow();
  });
});
