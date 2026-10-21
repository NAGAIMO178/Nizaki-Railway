// 券面(QR乗車券)と会員証の画像(PNG)を、canvas の代わりに描いたものを記録して確かめる。
// ① 描いた画素から、QR・バーコード(EAN-13)が読み戻せる ② バーコードの下には、その13桁の数字だけが、標準の位置に入る ③ わざと壊すと、読めない
import { BarcodeFormat, DecodeHintType, EAN13Reader } from '@zxing/library';
import { beforeAll, describe, expect, it } from 'vitest';
import { MONO_CHAR_RATIO } from '../src/utils/cardCanvas';
import { EAN13_MODULES, ean13FromId } from '../src/utils/ean13';
import { drawMemberCard, memberCardLayout } from '../src/utils/memberCard';
import { needsLongPressSave } from '../src/utils/imageSave';
import { drawTicketCard, ticketCardLayout, TicketCardData } from '../src/utils/ticketCard';
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
const DIGITS = ean13FromId('2', 'EQ-12345')!;
const ticket = (orderId = 'EQ-12345'): TicketCardData => ({
  token: `${orderId}.AbCdEfGhIjKl`,
  orderId,
  trainName: '特急めぐり3号',
  departureTime: '10:15',
  boardingStation: '神埼',
  destinationStation: '東桜',
  seatText: '3号車 普通指定席 5A',
  reservedDate: '2026-11-03',
});

const drawTicket = (data: TicketCardData, skip?: (i: number) => boolean) => {
  const layout = ticketCardLayout(data);
  const ctx = new RecordingContext(skip);
  drawTicketCard(ctx, data, layout);
  return { layout, ctx };
};

const barBottomOf = (ctx: RecordingContext, barTop: number) => Math.max(...ctx.rects.filter((q) => q.y === barTop && q.h > 0).map((q) => q.y + q.h));

describe('QR乗車券の券面(PNG)', () => {
  it('描いた画素から、バーコードが13桁で、QR が署名つきのリンクで読み戻せる', () => {
    const { layout, ctx } = drawTicket(ticket());
    const r = ctx.toRaster(layout.width, layout.height);
    expect(readEan(r)).toBe(DIGITS);
    // QR の部分(まわりの余白を含む四角)を切り出して読む
    const box = layout.qrBox;
    const qr = ctx.toRaster(box, box, { x: layout.qrLeft, y: layout.qrTop });
    expect(readQr(qr)).toBe(buildTicketUrl(TOKEN));
  });

  it('バーコードの下は、その13桁の数字だけ。標準の位置(先頭の1桁は左の外・6桁・6桁)で、画像の中に収まる', () => {
    const { layout, ctx } = drawTicket(ticket());
    const barBottom = barBottomOf(ctx, layout.barTop);
    const below = ctx.texts.filter((t) => t.y > barBottom);
    expect(below.map((t) => t.text).join('')).toBe(DIGITS);
    expect(below).toHaveLength(13);
    below.forEach((t) => {
      expect(t.font).toMatch(/monospace/);
      expect(t.y).toBe(layout.textY);
      expect(t.y - fontSize(t.font)).toBeGreaterThanOrEqual(barBottom - 20); // ガードの延びの横に収まる
      expect(t.y).toBeLessThan(layout.height);
      const w = fontSize(t.font) * MONO_CHAR_RATIO;
      expect(t.x - w / 2).toBeGreaterThanOrEqual(0);
      expect(t.x + w / 2).toBeLessThanOrEqual(layout.width);
    });
    const barLeft = Math.min(...ctx.rects.filter((q) => q.y === layout.barTop && q.h > 0).map((q) => q.x));
    const barRight = Math.max(...ctx.rects.filter((q) => q.y === layout.barTop && q.h > 0).map((q) => q.x + q.w));
    expect(below[0].x).toBeLessThan(barLeft); // 先頭の1桁は、バーの左の外
    below.slice(1).forEach((t) => {
      expect(t.x).toBeGreaterThan(barLeft);
      expect(t.x).toBeLessThan(barRight);
    });
    // 左右の半分に6桁ずつ
    const middle = (barLeft + barRight) / 2;
    expect(below.slice(1, 7).every((t) => t.x < middle)).toBe(true);
    expect(below.slice(7).every((t) => t.x > middle)).toBe(true);
  });

  it('予約コードは見出しに1回だけ。トークンの文字や、ほかの行は、バーコードの近くに無い。文字は決まったものだけ(個人情報なし)', () => {
    const { layout, ctx } = drawTicket(ticket());
    const order = ctx.texts.filter((t) => t.text === 'EQ-12345');
    expect(order).toHaveLength(1);
    expect(order[0].y).toBeLessThan(150);
    expect(ctx.texts.some((t) => t.text.includes('AbCdEfGhIjKl'))).toBe(false);
    expect(ctx.texts.filter((t) => t.y >= layout.barTop).every((t) => /^\d$/.test(t.text))).toBe(true);
    expect(ctx.texts.filter((t) => !/^\d$/.test(t.text)).map((t) => t.text)).toEqual([
      '神埼鉄道',
      'QR乗車券',
      'EQ-12345',
      '特急めぐり3号',
      '10:15発  2026-11-03',
      '神埼 → 東桜',
      '3号車 普通指定席 5A',
    ]);
  });

  it('予約番号に数字の部分が無いときは、バーコードも数字も出さない(QR は出る)', () => {
    const { layout, ctx } = drawTicket(ticket('EQ-AB'));
    expect(layout.ean).toBeNull();
    expect(ctx.texts.some((t) => /^\d$/.test(t.text))).toBe(false);
    const r = ctx.toRaster(layout.width, layout.height);
    expect(readEan(r)).toBeNull();
    expect(readQr(ctx.toRaster(layout.qrBox, layout.qrBox, { x: layout.qrLeft, y: layout.qrTop }))).toBe(buildTicketUrl('EQ-AB.AbCdEfGhIjKl'));
    expect(layout.height).toBeLessThan(ticketCardLayout(ticket()).height);
  });

  it('わざと壊すと、バーコードが読めなくなる(または別の13桁になる)', () => {
    const { layout, ctx } = drawTicket(ticket());
    const firstBar = ctx.rects.findIndex((q) => q.y === layout.barTop);
    expect(firstBar).toBeGreaterThan(0);
    for (const offset of [2, 7, 12]) {
      const broken = drawTicket(ticket(), (i) => i === firstBar + offset).ctx.toRaster(layout.width, layout.height);
      expect(readEan(broken)).not.toBe(DIGITS);
    }
  });
});

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
