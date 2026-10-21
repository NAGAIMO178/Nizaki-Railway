// QR乗車券の画像(QR だけ)と、会員証の画像(バーコードと13桁だけ)の PNG を、canvas の代わりに描いたものを記録して確かめる。
// ① 描いた画素から、QR・バーコード(EAN-13)が読み戻せる ② 余計な文字・見出しが入らない。バーコードの下には、その13桁の数字だけが、標準の位置に入る ③ わざと壊すと、読めない
import { BarcodeFormat, DecodeHintType, EAN13Reader } from '@zxing/library';
import { beforeAll, describe, expect, it } from 'vitest';
import { MONO_CHAR_RATIO } from '../src/utils/cardCanvas';
import { EAN13_MODULES, ean13FromId } from '../src/utils/ean13';
import { drawMemberCard, memberCardLayout } from '../src/utils/memberCard';
import { needsLongPressSave } from '../src/utils/imageSave';
import { drawQrImage, qrImageLayout } from '../src/utils/ticketQrImage';
import { buildTicketUrl } from '../src/utils/ticketToken';
import { RecordingContext, fontSize, readQr } from './helpers/raster';

// 券面の QR に入るリンクは、いま開いている場所から作る。テストでは、場所を決めておく
beforeAll(() => {
  Object.assign((globalThis as unknown as { window: { location: object } }).window.location, {
    origin: 'https://example.test',
    pathname: '/app/',
  });
});

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
  [DecodeHintType.TRY_HARDER, true],
]);

const readEan = (r: { bitmap: () => Parameters<EAN13Reader['decode']>[0] }): string | null => {
  try {
    return new EAN13Reader().decode(r.bitmap(), hints).getText();
  } catch {
    return null;
  }
};

const TOKEN = 'EQ-12345.AbCdEfGhIjKl';

const drawQr = (token = TOKEN, skip?: (i: number) => boolean) => {
  const layout = qrImageLayout(token);
  const ctx = new RecordingContext(skip);
  drawQrImage(ctx, layout);
  return { layout, ctx, r: ctx.toRaster(layout.size, layout.size) };
};

describe('QR乗車券の画像(PNG)', () => {
  it('QR が、署名つきのリンクで読み戻せる。白地で、一辺は 800〜1100px', () => {
    const { layout, r } = drawQr();
    expect(readQr(r)).toBe(buildTicketUrl(TOKEN));
    expect(layout.size).toBeGreaterThanOrEqual(800);
    expect(layout.size).toBeLessThanOrEqual(1100);
    expect(r.pixel(0, 0)).toBe(255);
    expect(r.pixel(layout.size - 1, layout.size - 1)).toBe(255);
  });

  it('文字も、バーコードも、見出しも入らない(QR のモジュールと白地だけ)', () => {
    const { layout, ctx } = drawQr();
    expect(ctx.texts).toEqual([]);
    // 長方形は、白地1つと、QR の濃いモジュールだけ。すべて、1モジュールの正方形(整数の位置)
    const [background, ...modules] = ctx.rects;
    expect(background).toMatchObject({ x: 0, y: 0, w: layout.size, h: layout.size, gray: 255 });
    expect(modules.length).toBe(layout.matrix.flat().filter(Boolean).length);
    modules.forEach((q) => {
      expect(q.w).toBe(layout.unit);
      expect(q.h).toBe(layout.unit);
      expect(q.x % layout.unit).toBe(0);
      expect(q.y % layout.unit).toBe(0);
      expect(q.gray).toBeLessThan(80);
    });
  });

  it('まわりに、4モジュール以上の白い余白がある', () => {
    const { layout, r } = drawQr();
    const margin = 4 * layout.unit;
    for (let i = 0; i < layout.size; i += 3) {
      for (let k = 0; k < margin; k += 5) {
        expect(r.pixel(i, k)).toBe(255);
        expect(r.pixel(i, layout.size - 1 - k)).toBe(255);
        expect(r.pixel(k, i)).toBe(255);
        expect(r.pixel(layout.size - 1 - k, i)).toBe(255);
      }
    }
  });

  it('最長のトークンでも、読み戻せる', () => {
    const long = `EQ-${'9'.repeat(37)}.${'z'.repeat(12)}`;
    const { r } = drawQr(long);
    expect(readQr(r)).toBe(buildTicketUrl(long));
  });

  it('わざと壊すと(濃いモジュールを大きく欠く)、読めない(または別のリンクになる)', () => {
    const { ctx } = drawQr();
    const dark = ctx.rects.length - 1;
    const broken = drawQr(TOKEN, (i) => i > 0 && i % 3 !== 0 && i < dark * 0.9).r;
    let text: string | null;
    try {
      text = readQr(broken);
    } catch {
      text = null;
    }
    expect(text).not.toBe(buildTicketUrl(TOKEN));
  });
});

const barBottomOf = (ctx: RecordingContext, barTop: number) => Math.max(...ctx.rects.filter((q) => q.y === barTop && q.h > 0).map((q) => q.y + q.h));

describe('会員証のバーコード(PNG)', () => {
  const draw = (id: string, skip?: (i: number) => boolean) => {
    const layout = memberCardLayout(id)!;
    const ctx = new RecordingContext(skip);
    drawMemberCard(ctx, layout);
    return { layout, ctx, r: ctx.toRaster(layout.width, layout.height) };
  };

  it('白地で、バーコードが会員番号の数字から作った13桁で読み戻せる', () => {
    for (const id of ['KZ-11319', 'KZ-00000', 'KZ-99999']) {
      const { layout, r } = draw(id);
      expect(r.pixel(0, 0)).toBe(255);
      expect(r.pixel(layout.width - 1, layout.height - 1)).toBe(255);
      expect(readEan(r)).toBe(ean13FromId('1', id));
    }
  });

  it('バーコードの下は、その13桁の数字だけ(標準の位置)。ほかの文字は無い。余白がある', () => {
    const { layout, ctx, r } = draw('KZ-11319');
    const digits = ean13FromId('1', 'KZ-11319')!;
    expect(ctx.texts.map((t) => t.text).join('')).toBe(digits);
    expect(ctx.texts).toHaveLength(13);
    const barBottom = barBottomOf(ctx, layout.barTop);
    const barLeft = layout.barLeft;
    const barRight = barLeft + EAN13_MODULES * layout.unit;
    ctx.texts.forEach((t) => {
      expect(t.y).toBe(layout.textY);
      expect(t.y).toBeLessThan(layout.height);
      const w = fontSize(t.font) * MONO_CHAR_RATIO;
      expect(t.x - w / 2).toBeGreaterThan(0);
      expect(t.x + w / 2).toBeLessThan(layout.width);
    });
    expect(ctx.texts[0].x).toBeLessThan(barLeft);
    ctx.texts.slice(1).forEach((t) => {
      expect(t.x).toBeGreaterThan(barLeft);
      expect(t.x).toBeLessThan(barRight);
    });
    expect(layout.textY - fontSize(ctx.texts[0].font)).toBeGreaterThanOrEqual(barBottom - 40);
    // 上と左右の端は、白い余白
    for (let x = 0; x < layout.width; x += 7) expect(r.pixel(x, layout.barTop - 1)).toBe(255);
    for (let y = 0; y < layout.height; y += 7) {
      expect(r.pixel(0, y)).toBe(255);
      expect(r.pixel(layout.width - 1, y)).toBe(255);
    }
  });

  it('数字の部分が取れない会員番号では、画像を作らない', () => {
    expect(memberCardLayout('未ログイン')).toBeNull();
    expect(memberCardLayout('KZ-1234567890')).toBeNull();
  });

  it('わざと壊すと、読めなくなる(または別の13桁になる)', () => {
    for (const skip of [3, 6, 9]) {
      expect(readEan(draw('KZ-11319', (i) => i === skip).r)).not.toBe(ean13FromId('1', 'KZ-11319'));
    }
  });
});

describe('画像の保存', () => {
  it('LINE 内のブラウザだけ、画像を表示して長押しで保存する', () => {
    expect(needsLongPressSave('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.5.0')).toBe(true);
    expect(needsLongPressSave('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Line/14.5.0')).toBe(true);
    expect(needsLongPressSave('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(needsLongPressSave('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe(false);
  });
});
