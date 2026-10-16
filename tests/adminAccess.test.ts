// 管理者画面を開く条件: サーバーが管理トークンを認めたときだけ(通信は作りものに差し替える)
import { beforeEach, describe, expect, it } from 'vitest';
import { checkStoredAdminKey, submitAdminKey, type AdminAccessDeps } from '../src/utils/adminAccess';

let saved: string;
let calls: Array<{ action: string; payload: Record<string, unknown> }>;

const deps = (reply: unknown | Error): AdminAccessDeps => ({
  call: async (action, payload) => {
    calls.push({ action, payload });
    if (reply instanceof Error) throw reply;
    return reply as { status?: string; code?: string };
  },
  getToken: () => saved,
  setToken: (t) => void (saved = t),
});

const OK = { status: 'success' };
const WRONG = { status: 'error', code: 'admin' };
const LOCKED = { status: 'error', code: 'admin_locked' };

beforeEach(() => {
  saved = '';
  calls = [];
  localStorage.clear();
});

describe('開いたとき(保存してある鍵を確かめる)', () => {
  it('保存が無ければ、サーバーに聞かず、入力を求める', async () => {
    expect(await checkStoredAdminKey(deps(OK))).toBe('needKey');
    expect(calls).toEqual([]);
  });

  it('保存した鍵を、サーバーで確かめて、通れば、そのまま入れる', async () => {
    saved = 'mykey';
    expect(await checkStoredAdminKey(deps(OK))).toBe('ok');
    expect(calls).toEqual([{ action: 'verifyAdminToken', payload: { adminToken: 'mykey' } }]);
    expect(saved).toBe('mykey');
  });

  it('保存した鍵が合わなければ、入れず、端末の鍵を消す', async () => {
    saved = 'oldkey';
    expect(await checkStoredAdminKey(deps(WRONG))).toBe('denied');
    expect(saved).toBe('');
  });

  it('失敗が続いてサーバーが断っているときは、locked(鍵は消さない)', async () => {
    saved = 'mykey';
    expect(await checkStoredAdminKey(deps(LOCKED))).toBe('locked');
    expect(saved).toBe('mykey');
  });

  it('通信できない・サーバーが未対応のときは、入れない(offline)。鍵は消さない', async () => {
    saved = 'mykey';
    expect(await checkStoredAdminKey(deps(new Error('network')))).toBe('offline');
    expect(await checkStoredAdminKey(deps({ status: 'ignored' }))).toBe('offline');
    expect(await checkStoredAdminKey(deps({}))).toBe('offline');
    expect(saved).toBe('mykey');
  });

  it('通ったら、使わなくなった4桁のパスコードの保存を消す', async () => {
    localStorage.setItem('nizaki_admin_pin', '0000');
    saved = 'mykey';
    await checkStoredAdminKey(deps(OK));
    expect(localStorage.getItem('nizaki_admin_pin')).toBeNull();
  });
});

describe('鍵を入力したとき', () => {
  it('サーバーが認めたときだけ、端末に保存する(前後の空白は取る)', async () => {
    expect(await submitAdminKey('  mykey \n', deps(OK))).toBe('ok');
    expect(saved).toBe('mykey');
    expect(calls[0].payload).toEqual({ adminToken: 'mykey' });
  });

  it('合わない鍵は、保存しない', async () => {
    expect(await submitAdminKey('bad', deps(WRONG))).toBe('denied');
    expect(saved).toBe('');
  });

  it('空の入力は、サーバーに聞かずに断る', async () => {
    expect(await submitAdminKey('   ', deps(OK))).toBe('denied');
    expect(calls).toEqual([]);
  });

  it('断られた・通信できないときは、保存しない', async () => {
    expect(await submitAdminKey('k', deps(LOCKED))).toBe('locked');
    expect(await submitAdminKey('k', deps(new Error('x')))).toBe('offline');
    expect(saved).toBe('');
  });
});
