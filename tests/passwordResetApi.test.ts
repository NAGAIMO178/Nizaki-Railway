// パスワードの再設定: アプリの通信(送る項目)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetPassword, startPasswordReset } from '../src/utils/accountApi';

const realFetch = globalThis.fetch;
let sent: Array<Record<string, unknown>>;
const reply = (body: unknown) => {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
};
beforeEach(() => {
  sent = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('パスワードの再設定の通信', () => {
  it('合言葉の発行: 送るのは、メールアドレスだけ', async () => {
    reply({ status: 'success', token: 'ABC234' });
    expect(await startPasswordReset('taro@example.test')).toMatchObject({ status: 'success', token: 'ABC234' });
    expect(sent).toEqual([{ action: 'startPasswordReset', email: 'taro@example.test' }]);
  });

  it('再設定: メール・合言葉・認証コード・新しいパスワードを送る', async () => {
    reply({ status: 'success' });
    await resetPassword('taro@example.test', 'ABC234', '123456', 'Newpass2@y');
    expect(sent).toEqual([{ action: 'resetPassword', email: 'taro@example.test', token: 'ABC234', code: '123456', password: 'Newpass2@y' }]);
  });

  it('断られたときは、サーバーの文を、そのまま返す', async () => {
    reply({ status: 'error', message: '認証コードが正しくありません。' });
    expect(await resetPassword('a@example.test', 'ABC234', '000000', 'Newpass2@y')).toMatchObject({ status: 'error', message: '認証コードが正しくありません。' });
  });
});
