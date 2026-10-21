// 券面(QR乗車券)と会員証の画像(PNG)を、canvas の代わりに描いたものを記録して確かめる。
// ① 描いた画素から、QR・バーコードが読み戻せる ② バーコードの下に、読み取る中身の文字が、画像の中に収まって入る ③ わざと壊すと、読めない
import { BarcodeFormat, Code128Reader, DecodeHintType, QRCodeReader } from '@zxing/library';
import { beforeAll, describe, expect, it } from 'vitest';
import { MONO_CHAR_RATIO } from '../src/utils/cardCanvas';
import { memberCardLayout, drawMemberCard } from '../src/utils/memberCard';
import { needsLongPressSave } from '../src/utils/imageSave';
import { drawTicketCard, ticketCardLayout, TicketCardData } from '../src/utils/ticketCard';
import { buildTicketUrl } from '../src/utils/ticketToken';
import { RecordingContext, fontSize } from './helpers/raster';

// 券面の QR に入るリンクは、いま開いている場所から作る。テストでは、場所を決めておく
beforeAll(() => {
  Object.assign((globalThis as unknown as { window: { location: object } }).window.location, {
    origin: 'https://example.test',
    pathname: '/app/',
  });
});

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
  [DecodeHintType.TRY_HARDER, true],
]);

const TOKEN = 'EQ-12345.AbCdEfGhIjKl';
const ticket = (token = TOKEN): TicketCardData => ({
  token,
  orderId: token.split('.')[0],
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

// 文字の左右の端(等幅の文字の幅の目安から)
const extent = (t: { x: number; text: string; font: string; align: string }) => {
  const w = t.text.length * fontSize(t.font) * MONO_CHAR_RATIO;
  const left = t.align === 'center' ? t.x - w / 2 : t.x;
  return [left, left + w];
};

describe('QR乗車券の券面(PNG)', () => {
  it('描いた画素から、バーコードがトークンで、QR がリンクで読み戻せる', () => {
    const { layout, ctx } = drawTicket(ticket());
    const r = ctx.toRaster(layout.width, layout.height);
    expect(new Code128Reader().decode(r.bitmap(), hints).getText()).toBe(TOKEN);
    expect(new QRCodeReader().decode(r.bitmap()).getText()).toBe(buildTicketUrl(TOKEN));
  });

  it('バーコードの下に、読み取る中身(トークン)の文字が、画像の中に収まって入る', () => {
    const { layout, ctx } = drawTicket(ticket());
    const token = ctx.texts.find((t) => t.text === TOKEN)!;
    expect(token).toBeDefined();
    expect(token.font).toMatch(/ui-monospace|monospace/);
    // バーコードの下端
    const bars = ctx.rects.filter((q) => q.y === layout.barTop && q.h > 0);
    const barBottom = Math.max(...bars.map((q) => q.y + q.h));
    expect(token.y - fontSize(token.font)).toBeGreaterThanOrEqual(barBottom);
    expect(token.y).toBeLessThan(layout.height);
    const [left, right] = extent(token);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(layout.width);
  });

  it('バーコードの下は、バーコード自身の中身の1行だけ。予約コードは見出しに1回だけで、バーコードの近くには置かない', () => {
    const { layout, ctx } = drawTicket(ticket());
    const barBottom = Math.max(...ctx.rects.filter((q) => q.y === layout.barTop && q.h > 0).map((q) => q.y + q.h));
    const below = ctx.texts.filter((t) => t.y > barBottom);
    expect(below.map((t) => t.text)).toEqual([TOKEN]);
    const order = ctx.texts.filter((t) => t.text === 'EQ-12345');
    expect(order).toHaveLength(1);
    expect(order[0].y).toBeLessThan(150); // 見出しの中
  });

  it('いちばん長いトークンでも、文字が左右の余白の内側に収まる', () => {
    const long = `EQ-${'9'.repeat(37)}.${'z'.repeat(12)}`;
    const { layout, ctx } = drawTicket(ticket(long));
    const token = ctx.texts.find((t) => t.text === long)!;
    const [left, right] = extent(token);
    expect(left).toBeGreaterThanOrEqual(56);
    expect(right).toBeLessThanOrEqual(layout.width - 56);
    const r = ctx.toRaster(layout.width, layout.height);
    expect(new Code128Reader().decode(r.bitmap(), hints).getText()).toBe(long);
  });

  it('個人情報は入らない(文字は、列車・区間・座席・日付・予約コード・トークンだけ)', () => {
    const { ctx } = drawTicket(ticket());
    expect(ctx.texts.map((t) => t.text)).toEqual([
      '神埼鉄道',
      'QR乗車券',
      'EQ-12345',
      '特急めぐり3号',
      '10:15発  2026-11-03',
      '神埼 → 東桜',
      '3号車 普通指定席 5A',
      TOKEN,
    ]);
  });

  it('わざと壊すと、バーコードが読めなくなる(または別の文字になる)', () => {
    const { layout } = drawTicket(ticket());
    const broken = (skipIndex: number) => {
      const { ctx } = drawTicket(ticket(), (i) => i === skipIndex);
      const r = ctx.toRaster(layout.width, layout.height);
      try {
        return new Code128Reader().decode(r.bitmap(), hints).getText();
      } catch {
        return null;
      }
    };
    // 長方形は、背景・見出し(2つ)のあと、QR のモジュール、そのあとバーコードのバー。バーコードのバーを1本ずつ消す
    const { ctx } = drawTicket(ticket());
    const firstBar = ctx.rects.findIndex((q) => q.y === layout.barTop);
    expect(firstBar).toBeGreaterThan(0);
    for (const offset of [2, 7, 12]) expect(broken(firstBar + offset)).not.toBe(TOKEN);
  });
});

describe('会員証のバーコード(PNG)', () => {
  const draw = (id: string) => {
    const layout = memberCardLayout(id);
    const ctx = new RecordingContext();
    drawMemberCard(ctx, id, layout);
    return { layout, ctx, r: ctx.toRaster(layout.width, layout.height) };
  };

  it('白地で、バーコードが会員番号で読み戻せる', () => {
    for (const id of ['KZ-11319', 'KZ-00000', 'KZ-99999']) {
      const { layout, r } = draw(id);
      expect(r.pixel(0, 0)).toBe(255);
      expect(r.pixel(layout.width - 1, layout.height - 1)).toBe(255);
      expect(new Code128Reader().decode(r.bitmap(), hints).getText()).toBe(id);
    }
  });

  it('バーコードの下に会員番号の文字が入り、画像の中に収まる。余白がある', () => {
    const { layout, ctx, r } = draw('KZ-11319');
    expect(ctx.texts).toHaveLength(1);
    const t = ctx.texts[0];
    expect(t.text).toBe('KZ-11319');
    const barBottom = Math.max(...ctx.rects.filter((q) => q.gray < 60).map((q) => q.y + q.h));
    expect(t.y - fontSize(t.font)).toBeGreaterThanOrEqual(barBottom);
    expect(t.y).toBeLessThan(layout.height);
    // バーコードの下は、その中身の1行だけ(ほかの文字は、どこにも無い)
    expect(ctx.texts.map((x) => x.text)).toEqual(['KZ-11319']);
    const [left, right] = extent(t);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(layout.width);
    // 上と左右の端は、白い余白
    for (let x = 0; x < layout.width; x += 7) expect(r.pixel(x, layout.barTop - 1)).toBe(255);
    for (let y = 0; y < layout.height; y += 7) {
      expect(r.pixel(0, y)).toBe(255);
      expect(r.pixel(layout.width - 1, y)).toBe(255);
    }
  });

  it('わざと壊すと、読めなくなる(または別の文字になる)', () => {
    const layout = memberCardLayout('KZ-11319');
    for (const skip of [3, 6, 9]) {
      const ctx = new RecordingContext((i) => i === skip);
      drawMemberCard(ctx, 'KZ-11319', layout);
      let text: string | null;
      try {
        text = new Code128Reader().decode(ctx.toRaster(layout.width, layout.height).bitmap(), hints).getText();
      } catch {
        text = null;
      }
      expect(text).not.toBe('KZ-11319');
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
