// 会員証のバーコードを、別の読み取りの部品(@zxing/library)で読み戻して、会員番号と一致することを確かめる。
// 描く位置は、画面の SVG と同じ memberBarcode の rects。わざと壊すと、読めなくなる(または別の文字になる)ことも確かめる。
import { BarcodeFormat, Code128Reader, DecodeHintType } from '@zxing/library';
import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, CODE128_QUIET, CODE128_STOP } from '../src/utils/code128';
import { memberBarcode } from '../src/utils/memberBarcode';
import { raster } from './helpers/raster';

const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);

// 画面と同じ位置(rects)に、unit 画素ずつの幅で描いて、読む
const readRects = (rects: { x: number; width: number }[], modules: number, unit: number) => {
  const width = (modules + CODE128_QUIET * 2) * unit;
  const { fill, bitmap } = raster(width, 56);
  rects.forEach((r) => fill((r.x + CODE128_QUIET) * unit, 0, r.width * unit, 56));
  return new Code128Reader().decode(bitmap(), hints).getText();
};

describe('会員証のバーコード', () => {
  it('会員番号(KZ-11319 の形)が、読み取りの部品で読める。画面の幅(1〜2px)でも', () => {
    for (const id of ['KZ-11319', 'KZ-00000', 'KZ-99999', 'KZ-1']) {
      const b = memberBarcode(id, 250)!;
      expect(b).not.toBeNull();
      expect(readRects(b.rects, b.code.modules, b.unit)).toBe(id);
      expect(readRects(b.rects, b.code.modules, 2)).toBe(id);
      expect(readRects(b.rects, b.code.modules, 3)).toBe(id);
    }
  });

  it('1モジュールの幅は整数で、置ける幅に収まる(太さの比率を保つ)', () => {
    const b = memberBarcode('KZ-11319', 250)!;
    expect(Number.isInteger(b.unit)).toBe(true);
    expect(b.code.modules * b.unit).toBeLessThanOrEqual(250);
    expect(memberBarcode('K'.repeat(40), 250)!.unit).toBe(1);
  });

  it('会員番号が無い・Code128-B で表せないときは、バーコードを出さない', () => {
    expect(memberBarcode(undefined, 250)).toBeNull();
    expect(memberBarcode('', 250)).toBeNull();
    expect(memberBarcode('未ログイン', 250)).toBeNull();
  });

  it('わざと壊すと、読めない(または別の文字になる)', () => {
    const b = memberBarcode('KZ-11319', 250)!;
    const modules = b.code.modules;
    const read = (rects: { x: number; width: number }[]) => {
      try {
        return readRects(rects, modules, 3);
      } catch {
        return null;
      }
    };
    // バーを1モジュール太らせる
    expect(read(b.rects.map((r, i) => (i === 5 ? { ...r, width: r.width + 1 } : r)))).not.toBe('KZ-11319');
    // バーを1つ消す
    expect(read(b.rects.filter((_, i) => i !== 4))).not.toBe('KZ-11319');
    // 検査の記号を別の記号に差し替える(検査が合わなくなる)
    const bars = b.code.bars.join('');
    const check = bars.slice(-(CODE128_STOP.length + 6), -CODE128_STOP.length);
    const other = CODE128_PATTERNS.find((p) => p !== check && p.length === 6)!;
    const broken = bars.replace(check + CODE128_STOP, other + CODE128_STOP).split('').map(Number);
    const rects: { x: number; width: number }[] = [];
    let x = 0;
    broken.forEach((w, i) => {
      if (i % 2 === 0) rects.push({ x, width: w });
      x += w;
    });
    expect(read(rects)).not.toBe('KZ-11319');
  });
});
