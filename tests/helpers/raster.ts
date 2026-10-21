import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library';

// 白い画素の面に、長方形を黒く塗って、読み取りの部品に渡せる形にする(画像の canvas の代わり)
export const raster = (width: number, height: number) => {
  const px = new Uint8ClampedArray(width * height).fill(255);
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j * width + i] = 0;
  };
  const bitmap = () => new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(px, width, height)));
  return { fill, bitmap };
};
