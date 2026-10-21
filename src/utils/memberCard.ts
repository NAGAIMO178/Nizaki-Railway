import { CARD_FONT, CardContext, renderPng } from './cardCanvas';
import { CODE128_QUIET, Code128, encodeCode128B, paintCode128 } from './code128';

const DARK = '#0F172A';
const MARGIN = 80;
const BAR_HEIGHT = 220;

export interface MemberCardLayout {
  width: number;
  height: number;
  code: Code128;
  unit: number;
  barLeft: number;
  barTop: number;
  textY: number;
}

// 会員証のバーコードの画像(PNG)の配置。白地・余白つき・バーコードの下に会員番号の文字
export const memberCardLayout = (memberId: string): MemberCardLayout => {
  const code = encodeCode128B(memberId);
  const unit = Math.max(2, Math.min(5, Math.floor(720 / (code.modules + CODE128_QUIET * 2))));
  const barBox = (code.modules + CODE128_QUIET * 2) * unit;
  const width = barBox + MARGIN * 2;
  const barTop = MARGIN;
  const textY = barTop + BAR_HEIGHT + 76;
  return { width, height: textY + MARGIN, code, unit, barLeft: MARGIN + CODE128_QUIET * unit, barTop, textY };
};

export const drawMemberCard = (ctx: CardContext, memberId: string, layout: MemberCardLayout) => {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = DARK;
  paintCode128((x, y, w, h) => ctx.fillRect(x, y, w, h), layout.code, layout.barLeft, layout.barTop, layout.unit, BAR_HEIGHT);
  ctx.font = `700 56px ${CARD_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(memberId, layout.width / 2, layout.textY);
};

// 会員証のバーコードの画像(PNG)。入れるのは、会員番号だけ(名前・メールは入れない)
export const renderMemberCardPng = (memberId: string): Promise<Blob> => {
  const layout = memberCardLayout(memberId);
  return renderPng(layout.width, layout.height, (ctx) => drawMemberCard(ctx, memberId, layout));
};
