import { EAN13_MODULES, EAN13_QUIET, Ean13, encodeEan13, ean13FromId } from './ean13';

export interface MemberBarcode {
  ean: Ean13;
  unit: number; // 1モジュールの幅(CSS の px)。整数にして、バーの太さの比率を保つ
}

// 会員証のバーコード(EAN-13。会員番号 KZ-11319 の数字部分から作る13桁)。数字部分が取れないときは null
// maxWidth: 置ける幅(px。左右の余白も含む)
export const memberBarcode = (memberId: string | undefined, maxWidth: number): MemberBarcode | null => {
  const digits = ean13FromId('1', memberId);
  if (!digits) return null;
  return { ean: encodeEan13(digits), unit: Math.max(1, Math.min(2, Math.floor(maxWidth / (EAN13_MODULES + EAN13_QUIET * 2)))) };
};
