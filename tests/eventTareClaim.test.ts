import { beforeEach, describe, expect, it, vi } from 'vitest';

const callGas = vi.fn();
vi.mock('../src/utils/accountApi', () => ({ callGas: (...a: unknown[]) => callGas(...a) }));

import { claimEventTare } from '../src/utils/eventTareClaim';

beforeEach(() => callGas.mockReset());

describe('ごほうびの受け取り(サーバーへの薄い呼び出し)', () => {
  it('予約番号だけを送る(額は送らない)', async () => {
    callGas.mockResolvedValue({ status: 'success', added: true, points: 350, balance: 900 });
    const r = await claimEventTare('tok', 'EQ-1');
    expect(callGas).toHaveBeenCalledWith('claimEventTare', { sessionToken: 'tok', orderId: 'EQ-1' });
    expect(r).toEqual({ ok: true, added: true, points: 350, balance: 900 });
  });

  it('返事のコードを、理由に直す', async () => {
    const cases: [string, string][] = [
      ['event_not_yet', 'notYet'],
      ['event_locked', 'locked'],
      ['event_busy', 'busy'],
      ['session', 'session'],
      ['other', 'error'],
    ];
    for (const [code, reason] of cases) {
      callGas.mockResolvedValueOnce({ status: 'error', code, message: 'm' });
      const r = await claimEventTare('tok', 'EQ-1');
      expect(r).toEqual({ ok: false, reason, message: 'm' });
    }
  });
});
