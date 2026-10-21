import { CardContext, renderPng } from './cardCanvas';
import { QR_QUIET, makeQrMatrix, paintQr } from './qrImage';
import { buildTicketUrl } from './ticketToken';

const TARGET = 1000; // 一辺(px)のめやす。1モジュールは整数の px にして、にじませない
const DARK = '#221C35';

export interface QrImageLayout {
  size: number; // 一辺(余白を含む)
  matrix: boolean[][];
  unit: number;
}

// QR乗車券の画像(PNG)の配置。QR だけ: 白地・まわりに4モジュールの余白・文字なし
export const qrImageLayout = (token: string): QrImageLayout => {
  const matrix = makeQrMatrix(buildTicketUrl(token));
  const unit = Math.max(4, Math.floor(TARGET / (matrix.length + QR_QUIET * 2)));
  return { size: (matrix.length + QR_QUIET * 2) * unit, matrix, unit };
};

export const drawQrImage = (ctx: CardContext, layout: QrImageLayout) => {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, layout.size, layout.size);
  ctx.fillStyle = DARK;
  paintQr((x, y, w, h) => ctx.fillRect(x, y, w, h), layout.matrix, QR_QUIET * layout.unit, QR_QUIET * layout.unit, layout.unit);
};

// QR乗車券の画像(PNG)。入っているのは、署名つきのリンクの QR だけ(見出し・列車名・座席・予約コードは入れない)
export const renderTicketQrPng = (token: string): Promise<Blob> => {
  const layout = qrImageLayout(token);
  return renderPng(layout.size, layout.size, (ctx) => drawQrImage(ctx, layout));
};
