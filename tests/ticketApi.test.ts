import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TICKET_STATE_LABEL, fetchAndCacheTicket, readCachedTicketToken, summarizeTicket, ticketBadgeLabel, ticketSeatsOf, useTicket } from '../src/utils/ticketApi';

const realFetch = globalThis.fetch;
let reply: unknown;
let calls: { action: string; orderId?: string }[];

beforeEach(() => {
  localStorage.clear();
  calls = [];
  reply = undefined;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => reply } as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('QR乗車券の状態の言葉', () => {
  it('使い終わった券は「利用済み」(「乗車済み」とは出さない)', () => {
    expect(TICKET_STATE_LABEL.used).toBe('利用済み');
    expect(Object.values(TICKET_STATE_LABEL).join('')).not.toContain('乗車済み');
  });

  it('6つの状態に、それぞれ言葉がある', () => {
    expect(TICKET_STATE_LABEL).toEqual({
      valid: '有効',
      used: '利用済み',
      expired: '期限切れ',
      otherDay: '別の列車',
      cancelled: '取消済み',
      invalid: '無効',
    });
  });
});

describe('予約カードの札に使う、状態の取得(1回だけ呼ぶ)', () => {
  it('利用済みの状態を受け取り、トークンを端末に残す', async () => {
    reply = { status: 'success', state: 'used', usedAt: '10:32', token: 'EQ-12345.AbCdEfGhIjKl' };
    const r = await fetchAndCacheTicket('session', 'EQ-12345');
    expect(r.state).toBe('used');
    expect(calls).toEqual([{ action: 'getTicket', sessionToken: 'session', orderId: 'EQ-12345' }]);
    expect(readCachedTicketToken('EQ-12345')).toBe('EQ-12345.AbCdEfGhIjKl');
  });

  it('取れなかったとき(サーバーの断り・知らない状態)は、失敗として扱い、何も残さない', async () => {
    reply = { status: 'error', code: 'ticket_not_ready', message: '登録されていません' };
    await expect(fetchAndCacheTicket('session', 'EQ-12345')).rejects.toThrow();
    reply = { status: 'success', state: 'unknown', token: 'EQ-12345.AbCdEfGhIjKl' };
    await expect(fetchAndCacheTicket('session', 'EQ-12345')).rejects.toThrow();
    expect(readCachedTicketToken('EQ-12345')).toBeNull();
  });
});

describe('席ごとの利用', () => {
  const info = { trainName: '', boardingStation: '', destinationStation: '', carNo: 4, seatNo: '4B,4C,4D', seatType: 'reserved', reservedDate: '', departureTime: '', arrivalTime: '' };

  it('「利用する」は、席を指定して送る。席なし(1席の予約)は、これまでどおり token だけ', async () => {
    reply = { status: 'success', state: 'valid', seats: [] };
    await useTicket('EQ-1.abcdefghijkl', '4C');
    await useTicket('EQ-1.abcdefghijkl');
    expect(calls).toEqual([
      expect.objectContaining({ action: 'useTicket', token: 'EQ-1.abcdefghijkl', seat: '4C' }),
      expect.objectContaining({ action: 'useTicket', token: 'EQ-1.abcdefghijkl' }),
    ]);
    expect(calls[1]).not.toHaveProperty('seat');
  });

  it('席の一覧が無い応答(1席)は、全体の状態の1席として読む', () => {
    expect(ticketSeatsOf({ state: 'used', usedAt: '10:32', ticket: { ...info, seatNo: '5A' } })).toEqual([{ seat: '5A', state: 'used', usedAt: '10:32' }]);
  });

  it('札: 全席が利用済みなら「利用済み」、一部だけなら「一部利用済み(2/3)」、まだなら札なし', () => {
    const seats = (...states: ('valid' | 'used')[]) => states.map((state, i) => ({ seat: `4${'BCD'[i]}`, state }));
    expect(ticketBadgeLabel(summarizeTicket({ state: 'used', seats: seats('used', 'used', 'used') }))).toBe('利用済み');
    expect(ticketBadgeLabel(summarizeTicket({ state: 'valid', seats: seats('used', 'used', 'valid') }))).toBe('一部利用済み(2/3)');
    expect(ticketBadgeLabel(summarizeTicket({ state: 'valid', seats: seats('valid', 'valid', 'valid') }))).toBeNull();
    expect(ticketBadgeLabel(summarizeTicket({ state: 'cancelled', seats: seats('valid', 'valid', 'valid') }))).toBeNull();
    expect(ticketBadgeLabel(null)).toBeNull();
  });

  it('1席の予約の札は、これまでどおり(利用済みだけ)', () => {
    expect(ticketBadgeLabel(summarizeTicket({ state: 'used', ticket: { ...info, seatNo: '5A' } }))).toBe('利用済み');
    expect(ticketBadgeLabel(summarizeTicket({ state: 'valid', ticket: { ...info, seatNo: '5A' } }))).toBeNull();
  });
});
