import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TICKET_STATE_LABEL, fetchAndCacheTicket, readCachedTicketToken } from '../src/utils/ticketApi';

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
