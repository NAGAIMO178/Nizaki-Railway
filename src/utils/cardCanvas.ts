// 券面・会員証の画像(PNG)を描くための、小さな共通部分。
// 描く処理は、canvas の代わりに「CardContext」を受け取る(確かめるときは、記録するだけの作りものを渡せる)
import { Ean13, ean13DigitCells } from './ean13';

export interface CardContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export const CARD_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
// 等幅の文字の、1文字の幅(文字の大きさに対する比)の目安
export const MONO_CHAR_RATIO = 0.62;

// バーコードの下に、13桁の数字だけ(標準の表記: 先頭の1桁はバーの左の外)を描く
export const drawEanDigits = (ctx: CardContext, ean: Ean13, barLeft: number, unit: number, textY: number, size: number) => {
  ctx.font = `600 ${size}px ${CARD_MONO}`;
  ctx.textAlign = 'center';
  ean13DigitCells(ean, barLeft, unit).forEach((c) => ctx.fillText(c.digit, c.cx, textY));
};

export const renderPng = (width: number, height: number, draw: (ctx: CardContext) => void): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('画像を作れませんでした'));
  draw(ctx);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画像を作れませんでした'))), 'image/png');
  });
};
