import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library';
import type { CardContext } from '../../src/utils/cardCanvas';

// 白い画素の面に、長方形を塗って、読み取りの部品に渡せる形にする(画像の canvas の代わり)。gray は 0(黒)〜255(白)
export const raster = (width: number, height: number) => {
  const px = new Uint8ClampedArray(width * height).fill(255);
  const fill = (x: number, y: number, w: number, h: number, gray = 0) => {
    for (let j = Math.max(0, y); j < Math.min(height, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(width, x + w); i++) px[j * width + i] = gray;
    }
  };
  const bitmap = () => new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(px, width, height)));
  const pixel = (x: number, y: number) => px[y * width + x];
  return { fill, bitmap, pixel };
};

const grayOf = (color: unknown): number => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(color));
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
};

export interface DrawnText {
  text: string;
  x: number;
  y: number;
  font: string;
  align: string;
}

// canvas の代わりに、描いた長方形と文字を記録する(券面・会員証の描画を、画素と文字の位置で確かめる)
export class RecordingContext implements CardContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth = 1;
  font = '';
  textAlign: CanvasTextAlign = 'left';
  rects: { x: number; y: number; w: number; h: number; gray: number }[] = [];
  texts: DrawnText[] = [];
  constructor(private skip: (index: number) => boolean = () => false) {}
  fillRect(x: number, y: number, w: number, h: number) {
    // skip: わざと、n 番目の長方形を描かない(壊したときの確認用)
    if (this.skip(this.rects.length)) {
      this.rects.push({ x, y, w: 0, h: 0, gray: 255 });
      return;
    }
    this.rects.push({ x, y, w, h, gray: grayOf(this.fillStyle) });
  }
  strokeRect() {}
  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y, font: this.font, align: this.textAlign });
  }
  // 描いたものを、画素にする
  toRaster(width: number, height: number) {
    const r = raster(width, height);
    this.rects.forEach((q) => r.fill(q.x, q.y, q.w, q.h, q.gray));
    return r;
  }
}

// 文字の大きさ(font の指定から)
export const fontSize = (font: string): number => Number(/(\d+)px/.exec(font)?.[1]);
