import type { TicketState } from './ticketApi';

// QR 画面の段階
//  checking   状態がまだ届いていない → QR は出さない(枠だけ)
//  show       状態が「有効」→ QR を出す
//  blocked    利用済み・取消済み・期限切れ・別の列車・無効 → QR は出さない(状態を大きく出す)
//  unverified 状態を確認できなかった(電波の悪い場所など)が、端末に保存した署名がある → QR を出す(確認できなかったことを添える)
//  failed     状態も署名も得られなかった → QR は出せない(「もう一度」)
export type QrPhase = 'checking' | 'show' | 'blocked' | 'unverified' | 'failed';

export const ticketQrPhase = (input: { state: TicketState | null; failed: boolean; token: string | null }): QrPhase => {
  const { state, failed, token } = input;
  if (state !== null) {
    if (state !== 'valid') return 'blocked';
    return token ? 'show' : 'failed';
  }
  if (failed) return token ? 'unverified' : 'failed';
  return 'checking';
};

// QR を描くのは、この2つの段階だけ
export const shouldDrawQr = (phase: QrPhase): boolean => phase === 'show' || phase === 'unverified';
