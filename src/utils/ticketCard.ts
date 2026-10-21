import { CARD_FONT, CARD_MONO, CardContext, fitMonoSize, renderPng } from './cardCanvas';
import { CODE128_QUIET, Code128, encodeCode128B, paintCode128 } from './code128';
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

const BAR_HEIGHT = 110;
const QR_TOP = 420;

export interface TicketCardLayout {
  width: number;
  height: number;
  matrix: boolean[][];
  qrUnit: number;
  qrBox: number;
  code: Code128;
  barUnit: number;
  barBox: number;
  barTop: number;
  tokenY: number; // バーコードの下の、読み取る中身の文字(トークン)の基準線。バーコードの下は、この1行だけ
}

// 券面の画像(PNG)の配置
export const ticketCardLayout = (data: TicketCardData): TicketCardLayout => {
  const matrix = makeQrMatrix(buildTicketUrl(data.token));
  const code = encodeCode128B(data.token);
  const qrUnit = Math.max(2, Math.floor(560 / (matrix.length + QR_QUIET * 2)));
  const qrBox = (matrix.length + QR_QUIET * 2) * qrUnit;
  const barUnit = Math.max(1, Math.min(3, Math.floor((W - MARGIN * 2) / (code.modules + CODE128_QUIET * 2))));
  const barBox = (code.modules + CODE128_QUIET * 2) * barUnit;
  const barTop = QR_TOP + qrBox + 56;
  const tokenY = barTop + BAR_HEIGHT + 44;
  return { width: W, height: tokenY + 60, matrix, qrUnit, qrBox, code, barUnit, barBox, barTop, tokenY };
};

// 券面を描く。名前・メール・会員IDは入れない
export const drawTicketCard = (ctx: CardContext, data: TicketCardData, layout: TicketCardLayout) => {
  const { width: W2, height: H, matrix, qrUnit, qrBox, code, barUnit, barBox, barTop } = layout;

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
  // 予約コードは、見出しに1回だけ(バーコードの下には、バーコードの中身の1行だけを置く)
  text(data.orderId, W2 - MARGIN, 120, 36, '#FFFFFF', 700, 'right', CARD_MONO);

  // 列車・区間・座席
  const dep = data.departureTime ? `${data.departureTime}発` : '';
  const date = data.reservedDate ?? '';
  text(data.trainName, MARGIN, 232, 54, DARK, 900);
  text([dep, date].filter(Boolean).join('  '), MARGIN, 280, 30, MUTED, 500);
  text(`${data.boardingStation || '—'} → ${data.destinationStation || '—'}`, MARGIN, 346, 46, DARK, 900);
  text(data.seatText, MARGIN, 392, 38, PURPLE, 900);

  // QR(まわりの白い余白も含めて、枠で囲む)
  const qrLeft = Math.floor((W2 - qrBox) / 2);
  ctx.strokeStyle = '#E6E2EE';
  ctx.lineWidth = 2;
  ctx.strokeRect(qrLeft - 1, QR_TOP - 1, qrBox + 2, qrBox + 2);
  ctx.fillStyle = DARK;
  paintQr((x, y, w, h) => ctx.fillRect(x, y, w, h), matrix, qrLeft + QR_QUIET * qrUnit, QR_TOP + QR_QUIET * qrUnit, qrUnit);

  // バーコード(中身は QR と同じトークン)と、その下に、読み取る中身の文字
  const barLeft = Math.floor((W2 - barBox) / 2);
  ctx.fillStyle = DARK;
  paintCode128((x, y, w, h) => ctx.fillRect(x, y, w, h), code, barLeft + CODE128_QUIET * barUnit, barTop, barUnit, BAR_HEIGHT);
  text(data.token, W2 / 2, layout.tokenY, fitMonoSize(data.token.length, W2 - MARGIN * 2, 28), MUTED, 600, 'center', CARD_MONO);
};

// 券面の画像(PNG)。列車・区間・座席・予約コードと、QR、バーコード(と、その下の中身の文字)だけ
export const renderTicketPng = (data: TicketCardData): Promise<Blob> => {
  const layout = ticketCardLayout(data);
  return renderPng(layout.width, layout.height, (ctx) => drawTicketCard(ctx, data, layout));
};
