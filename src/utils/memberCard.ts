import { CardContext, drawEanDigits, renderPng } from './cardCanvas';
import { EAN13_MODULES, EAN13_QUIET, Ean13, ean13FromId, encodeEan13, paintEan13 } from './ean13';

const DARK = '#0F172A';
const MARGIN = 80;
const UNIT = 6;
const BAR_HEIGHT = 260;
const GUARD_EXTRA = 28;
const DIGIT_SIZE = 56;

export interface MemberCardLayout {
  width: number;
  height: number;
  ean: Ean13;
  unit: number;
  barLeft: number; // 左ガードの左端
  barTop: number;
  textY: number; // 数字の基準線
}

// 会員証のバーコードの画像(PNG)の配置。白地・余白つき・バーコード(EAN-13)とその下の13桁の数字。会員番号に数字部分が無いときは null
export const memberCardLayout = (memberId: string): MemberCardLayout | null => {
  const digits = ean13FromId('1', memberId);
  if (!digits) return null;
  const width = (EAN13_MODULES + EAN13_QUIET * 2) * UNIT + MARGIN * 2;
  const textY = MARGIN + BAR_HEIGHT + DIGIT_SIZE;
  return { width, height: textY + MARGIN, ean: encodeEan13(digits), unit: UNIT, barLeft: MARGIN + EAN13_QUIET * UNIT, barTop: MARGIN, textY };
};

export const drawMemberCard = (ctx: CardContext, layout: MemberCardLayout) => {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = DARK;
  paintEan13((x, y, w, h) => ctx.fillRect(x, y, w, h), layout.ean, layout.barLeft, layout.barTop, layout.unit, BAR_HEIGHT, GUARD_EXTRA);
  drawEanDigits(ctx, layout.ean, layout.barLeft, layout.unit, layout.textY, DIGIT_SIZE);
};

// 会員証のバーコードの画像(PNG)。入っているのは、バーコードと13桁の数字だけ
export const renderMemberCardPng = (memberId: string): Promise<Blob> => {
  const layout = memberCardLayout(memberId);
  if (!layout) return Promise.reject(new Error('バーコードを作れませんでした'));
  return renderPng(layout.width, layout.height, (ctx) => drawMemberCard(ctx, layout));
};
