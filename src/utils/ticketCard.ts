import { CODE128_QUIET, encodeCode128B, paintCode128 } from './code128';
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
const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", system-ui, sans-serif';
const DARK = '#221C35';
const PURPLE = '#5B21B6';
const MUTED = '#857D99';

// 券面の画像(PNG)。列車・区間・座席・予約コードと、QR、バーコードだけ。名前・メール・会員IDは入れない
export const renderTicketPng = (data: TicketCardData): Promise<Blob> => {
  const matrix = makeQrMatrix(buildTicketUrl(data.token));
  const code = encodeCode128B(data.token);

  const qrUnit = Math.max(2, Math.floor(560 / (matrix.length + QR_QUIET * 2)));
  const qrBox = (matrix.length + QR_QUIET * 2) * qrUnit;
  const barUnit = Math.max(1, Math.min(3, Math.floor((W - MARGIN * 2) / (code.modules + CODE128_QUIET * 2))));
  const barBox = (code.modules + CODE128_QUIET * 2) * barUnit;

  const qrTop = 420;
  const barTop = qrTop + qrBox + 56;
  const H = barTop + 120 + 90;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('画像を作れませんでした'));

  const text = (value: string, x: number, y: number, size: number, color: string, weight = 700, align: CanvasTextAlign = 'left') => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 見出し
  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, W, 150);
  text('神埼鉄道', MARGIN, 66, 30, '#DDD6FE');
  text('QR乗車券', MARGIN, 120, 52, '#FFFFFF', 900);

  // 列車・区間・座席
  const dep = data.departureTime ? `${data.departureTime}発` : '';
  const date = data.reservedDate ?? '';
  text(data.trainName, MARGIN, 232, 54, DARK, 900);
  text([dep, date].filter(Boolean).join('  '), MARGIN, 280, 30, MUTED, 500);
  text(`${data.boardingStation || '—'} → ${data.destinationStation || '—'}`, MARGIN, 346, 46, DARK, 900);
  text(data.seatText, MARGIN, 396 - 4, 38, PURPLE, 900);

  // QR(まわりの白い余白も含めて、枠で囲む)
  const qrLeft = Math.floor((W - qrBox) / 2);
  ctx.strokeStyle = '#E6E2EE';
  ctx.lineWidth = 2;
  ctx.strokeRect(qrLeft - 1, qrTop - 1, qrBox + 2, qrBox + 2);
  ctx.fillStyle = DARK;
  paintQr((x, y, w, h) => ctx.fillRect(x, y, w, h), matrix, qrLeft + QR_QUIET * qrUnit, qrTop + QR_QUIET * qrUnit, qrUnit);

  // バーコード(中身は QR と同じトークン)
  const barLeft = Math.floor((W - barBox) / 2);
  ctx.fillStyle = DARK;
  paintCode128((x, y, w, h) => ctx.fillRect(x, y, w, h), code, barLeft + CODE128_QUIET * barUnit, barTop, barUnit, 110);
  text(data.orderId, W / 2, barTop + 110 + 52, 32, DARK, 700, 'center');

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画像を作れませんでした'))), 'image/png');
  });
};

// 画像を保存する。共有シートが使えれば(iPhone では「画像を保存」で写真に入る)それを、なければダウンロード
export const saveImage = async (blob: Blob, filename: string): Promise<void> => {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return; // 自分で閉じた
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
