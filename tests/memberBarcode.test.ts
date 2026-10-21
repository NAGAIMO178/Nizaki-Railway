// 会員証のバーコード(EAN-13)を、画面と同じ作り(memberBarcode)で描いて、別の読み取り部品(@zxing/library)で読み戻す。
import { BarcodeFormat, DecodeHintType, EAN13Reader } from '@zxing/library';
import { describe, expect, it } from 'vitest';
import { EAN13_MODULES, EAN13_QUIET, ean13FromId, isValidEan13 } from '../src/utils/ean13';
import { memberBarcode } from '../src/utils/memberBarcode';
import { raster } from './helpers/raster';

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
  [DecodeHintType.TRY_HARDER, true],
]);

describe('会員証のバーコード', () => {
  it('会員番号 KZ-11319 の数字から作った13桁が、読み取りの部品で読める。画面の幅(1〜2px)でも', () => {
    for (const id of ['KZ-11319', 'KZ-00000', 'KZ-99999', 'KZ-1']) {
      const b = memberBarcode(id, 250)!;
      expect(b).not.toBeNull();
      expect(b.ean.digits).toBe(ean13FromId('1', id));
      expect(isValidEan13(b.ean.digits)).toBe(true);
      const unit = b.unit;
      const { fill, bitmap } = raster((EAN13_MODULES + EAN13_QUIET * 2) * unit, 50 * unit);
      b.ean.bars.forEach((bar) => fill((EAN13_QUIET + bar.x) * unit, 0, bar.width * unit, 34 * unit));
      expect(new EAN13Reader().decode(bitmap(), hints).getText()).toBe(b.ean.digits);
    }
  });

  it('1モジュールの幅は整数で、置ける幅に収まる(太さの比率を保つ)', () => {
    const b = memberBarcode('KZ-11319', 250)!;
    expect(Number.isInteger(b.unit)).toBe(true);
    expect((EAN13_MODULES + EAN13_QUIET * 2) * b.unit).toBeLessThanOrEqual(250);
    expect(memberBarcode('KZ-11319', 100)!.unit).toBe(1);
  });

  it('数字の部分が取れない会員番号・空のときは、バーコードを出さない', () => {
    expect(memberBarcode(undefined, 250)).toBeNull();
    expect(memberBarcode('', 250)).toBeNull();
    expect(memberBarcode('未ログイン', 250)).toBeNull();
    expect(memberBarcode('KZ-1234567890', 250)).toBeNull();
  });
});
