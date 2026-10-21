import { CARD_FONT, CARD_MONO, CardContext, drawEanDigits, renderPng } from './cardCanvas';
import { EAN13_MODULES, Ean13, ean13FromId, encodeEan13, paintEan13 } from './ean13';
import { QR_QUIET, makeQrMatrix, paintQr } from './qrImage';
import { buildTicketUrl } from './ticketToken';

export interface TicketCardData {
  token: string;
  orderId: string;
  trainName: string;
  departureTime?: string;
  boardingStation?: string;
  destinationStation?: string;
  seatText: string; // 例: 3号車 指定席 5A
  reservedDate?: string;
}

const W = 960;
const MARGIN = 56;
const DARK = '#221C35';
const PURPLE = '#5B21B6';
const MUTED = '#857D99';

const BAR_HEIGHT = 120;
const GUARD_EXTRA = 20;
const BAR_UNIT = 6;
const DIGIT_SIZE = 44;
const QR_TOP = 420;

export interface TicketCardLayout {
  width: number;
  height: number;
  matrix: boolean[][];
  qrUnit: number;
  qrBox: number;
  qrLeft: number;
  qrTop: number;
  ean: Ean13 | null; // 予約番号に数字部分が無いときは null(バーコードは出さない)
  barTop: number;
  textY: number; // バーコードの下の13桁の数字の基準線。バーコードの下は、この1行だけ
}

// 券面の画像(PNG)の配置
export const ticketCardLayout = (data: TicketCardData): TicketCardLayout => {
  const matrix = makeQrMatrix(buildTicketUrl(data.token));
  const qrUnit = Math.max(2, Math.floor(560 / (matrix.length + QR_QUIET * 2)));
  const qrBox = (matrix.length + QR_QUIET * 2) * qrUnit;
  const digits = ean13FromId('2', data.orderId);
  const ean = digits ? encodeEan13(digits) : null;
  const qrBottom = QR_TOP + qrBox;
  const barTop = qrBottom + 56;
  const textY = barTop + BAR_HEIGHT + DIGIT_SIZE;
  return { width: W, height: (ean ? textY : qrBottom) + 60, matrix, qrUnit, qrBox, qrLeft: Math.floor((W - qrBox) / 2), qrTop: QR_TOP, ean, barTop, textY };
};

// 券面を描く。名前・メール・会員IDは入れない
export const drawTicketCard = (ctx: CardContext, data: TicketCardData, layout: TicketCardLayout) => {
  const { width: W2, height: H, matrix, qrUnit, qrBox, qrLeft, qrTop, ean, barTop } = layout;

  const text = (value: string, x: number, y: number, size: number, color: string, weight = 700, align: CanvasTextAlign = 'left', family = CARD_FONT) => {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W2, H);

  // 見出し
  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, W2, 150);
  text('神埼鉄道', MARGIN, 66, 30, '#DDD6FE');
  text('QR乗車券', MARGIN, 120, 52, '#FFFFFF', 900);
  // 予約コードは、見出しに1回だけ(バーコードの近くには置かない)
  text(data.orderId, W2 - MARGIN, 120, 36, '#FFFFFF', 700, 'right', CARD_MONO);

  // 列車・区間・座席
  const dep = data.departureTime ? `${data.departureTime}発` : '';
  const date = data.reservedDate ?? '';
  text(data.trainName, MARGIN, 232, 54, DARK, 900);
  text([dep, date].filter(Boolean).join('  '), MARGIN, 280, 30, MUTED, 500);
  text(`${data.boardingStation || '—'} → ${data.destinationStation || '—'}`, MARGIN, 346, 46, DARK, 900);
  text(data.seatText, MARGIN, 392, 38, PURPLE, 900);

  // QR(まわりの白い余白も含めて、枠で囲む。署名つきのトークンは、QR の中のリンクに入っている)
  ctx.strokeStyle = '#E6E2EE';
  ctx.lineWidth = 2;
  ctx.strokeRect(qrLeft - 1, qrTop - 1, qrBox + 2, qrBox + 2);
  ctx.fillStyle = DARK;
  paintQr((x, y, w, h) => ctx.fillRect(x, y, w, h), matrix, qrLeft + QR_QUIET * qrUnit, qrTop + QR_QUIET * qrUnit, qrUnit);

  // バーコード(EAN-13。予約番号から作る13桁)と、その下の13桁の数字(これだけ)
  if (ean) {
    const barLeft = Math.floor((W2 - EAN13_MODULES * BAR_UNIT) / 2);
    ctx.fillStyle = DARK;
    paintEan13((x, y, w, h) => ctx.fillRect(x, y, w, h), ean, barLeft, barTop, BAR_UNIT, BAR_HEIGHT, GUARD_EXTRA);
    drawEanDigits(ctx, ean, barLeft, BAR_UNIT, layout.textY, DIGIT_SIZE);
  }
};

// 券面の画像(PNG)。列車・区間・座席・予約コードと、QR、バーコード(と、その下の13桁の数字)だけ
export const renderTicketPng = (data: TicketCardData): Promise<Blob> => {
  const layout = ticketCardLayout(data);
  return renderPng(layout.width, layout.height, (ctx) => drawTicketCard(ctx, data, layout));
};
