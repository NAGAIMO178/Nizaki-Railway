import { describe, expect, it } from 'vitest';
import { TicketState } from '../src/utils/ticketApi';
import { shouldDrawQr, ticketQrPhase } from '../src/utils/ticketQrPhase';

const STATES: TicketState[] = ['valid', 'used', 'expired', 'otherDay', 'cancelled', 'invalid'];
const TOKEN = 'EQ-12345.AbCdEfGhIjKl';

describe('QR 画面の段階(状態が届くまで QR を出さない)', () => {
  it('状態が届く前は、署名が端末にあっても、QR を描かない', () => {
    const phase = ticketQrPhase({ state: null, failed: false, token: TOKEN });
    expect(phase).toBe('checking');
    expect(shouldDrawQr(phase)).toBe(false);
    expect(shouldDrawQr(ticketQrPhase({ state: null, failed: false, token: null }))).toBe(false);
  });

  it('有効と分かってから、QR を描く', () => {
    const phase = ticketQrPhase({ state: 'valid', failed: false, token: TOKEN });
    expect(phase).toBe('show');
    expect(shouldDrawQr(phase)).toBe(true);
  });

  it('利用済み・取消済み・期限切れ・別の列車・無効のときは、QR を描かない(状態を出す)', () => {
    for (const state of STATES.filter((s) => s !== 'valid')) {
      const phase = ticketQrPhase({ state, failed: false, token: TOKEN });
      expect(phase).toBe('blocked');
      expect(shouldDrawQr(phase)).toBe(false);
    }
  });

  it('通信できなかったときは、端末に保存した署名があれば QR を描く(確認できなかったことを添える)。なければ描けない', () => {
    const withToken = ticketQrPhase({ state: null, failed: true, token: TOKEN });
    expect(withToken).toBe('unverified');
    expect(shouldDrawQr(withToken)).toBe(true);
    const without = ticketQrPhase({ state: null, failed: true, token: null });
    expect(without).toBe('failed');
    expect(shouldDrawQr(without)).toBe(false);
  });

  it('有効でも署名が無いときは、描かない', () => {
    expect(shouldDrawQr(ticketQrPhase({ state: 'valid', failed: false, token: null }))).toBe(false);
  });

  it('どの組み合わせでも、描くのは「有効と確認できた」か「通信できず、署名がある」ときだけ', () => {
    for (const state of [null, ...STATES]) {
      for (const failed of [false, true]) {
        for (const token of [null, TOKEN]) {
          const expected = (state === 'valid' && token !== null) || (state === null && failed && token !== null);
          expect(shouldDrawQr(ticketQrPhase({ state, failed, token }))).toBe(expected);
        }
      }
    }
  });
});
