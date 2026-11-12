// ログイン証の期限切れ(14日): アプリは、同期の失敗として扱い、自動でログアウトしない
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CloudSessionError, syncAccount } from '../src/utils/cloudAccount';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('ログイン証の期限切れ', () => {
  it('サーバーが「期限切れ」(code: session)と返したとき、同期は、期限切れの例外で失敗する(文は、サーバーの文のまま)', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error', code: 'session', message: 'ログインの有効期限が切れています。もう一度ログインしてください。' }),
    })) as unknown as typeof fetch;
    const err = await syncAccount('expired-token', null).catch((e) => e);
    expect(err).toBeInstanceOf(CloudSessionError);
    expect((err as Error).message).toBe('ログインの有効期限が切れています。もう一度ログインしてください。');
  });

  it('同期の失敗の扱いは、期限の長さに関係しない(ほかの失敗と同じ。通信できないときも、例外)', async () => {
    globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ status: 'error', message: 'x' }) })) as unknown as typeof fetch;
    await expect(syncAccount('t', null)).rejects.not.toBeInstanceOf(CloudSessionError);
  });

  it('期限切れで、自動ではログアウトしない(同期の失敗の旗を立てるだけ。ログアウトは、利用者の操作だけ)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', 'useCloudAccount.ts'), 'utf-8');
    expect(src).not.toMatch(/onLogout|handleLogout|clearMemberData/);
    expect(src).toContain('setError(true)');
  });
});
