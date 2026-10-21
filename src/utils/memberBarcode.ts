import { Code128, encodeCode128B } from './code128';

export interface MemberBarcode {
  code: Code128;
  rects: { x: number; width: number }[]; // 黒いバーの位置と幅(モジュール単位)
  unit: number; // 1モジュールの幅(CSS の px)。整数にして、バーの太さの比率を保つ
}

// 会員証のバーコード(Code128-B。中身は会員番号)。会員番号が空・表せない文字のときは null
// maxWidth: 左右の白い余白を除いた、置ける幅(px)
export const memberBarcode = (memberId: string | undefined, maxWidth: number): MemberBarcode | null => {
  if (!memberId) return null;
  try {
    const code = encodeCode128B(memberId);
    const rects: MemberBarcode['rects'] = [];
    let x = 0;
    code.bars.forEach((width, i) => {
      if (i % 2 === 0) rects.push({ x, width });
      x += width;
    });
    return { code, rects, unit: Math.max(1, Math.min(2, Math.floor(maxWidth / code.modules))) };
  } catch {
    return null;
  }
};
