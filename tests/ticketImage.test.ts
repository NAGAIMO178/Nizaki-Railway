// 描いた QR を、別の読み取りの部品(@zxing/library)で読み戻して、元の文字と一致することを確かめる。
// 画面の canvas と同じ描き方(paintQr)に、画素を塗る関数を渡して、読み取りを確かめる。
import { QRCodeReader } from '@zxing/library';
import { describe, expect, it } from 'vitest';
import { QR_QUIET, makeQrMatrix, paintQr, qrSvgPath } from '../src/utils/qrImage';
import { buildTicketUrl } from '../src/utils/ticketToken';
import { raster, readQr } from './helpers/raster';

const TOKEN = 'EQ-12345.AbCdEfGh_-Ij';
const LOCATION = { origin: 'https://example.github.io', pathname: '/Nizaki-Railway/' };

describe('QR を読み戻す', () => {
  const draw = (text: string, unit: number) => {
    const matrix = makeQrMatrix(text);
    const size = (matrix.length + QR_QUIET * 2) * unit;
    const r = raster(size, size);
    paintQr(r.fill, matrix, QR_QUIET * unit, QR_QUIET * unit, unit);
    return r;
  };
  // 位置の検出を使わずに読む(符号の中身そのものを確かめる)
  const read = (text: string, unit: number) => readQr(draw(text, unit));

  it('QR乗車券のリンクが、そのまま読める(標準のカメラと同じ QR の規格)', () => {
    const url = buildTicketUrl(TOKEN, LOCATION);
    expect(read(url, 10)).toBe(url);
    expect(new QRCodeReader().decode(draw(url, 10).bitmap()).getText()).toBe(url); // 位置の検出も使う読み方でも
  });

  it('リンクの長さがいくつでも、符号が正しい(20〜100文字)', () => {
    for (let len = 20; len <= 100; len++) {
      const url = ('https://example.github.io/Nizaki-Railway/#/t/EQ-' + '0123456789abcdef'.repeat(8)).slice(0, len);
      expect(read(url, 6)).toBe(url);
    }
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
    expect(readQr({ bitmap })).toBe(buildTicketUrl(TOKEN, LOCATION));
  });
});
