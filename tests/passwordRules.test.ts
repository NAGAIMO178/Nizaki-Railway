// パスワードの決まり: 最低8文字(新規登録のとき)。画面とサーバーの数字・文言が、そろっていること
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validatePassword } from '../src/utils/passwordRules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gas: Record<string, any>;
beforeAll(() => {
  const ctx: Record<string, unknown> = {
    Logger: { log: () => undefined },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { formatDate: () => 'x' },
    ContentService: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8'), ctx);
  gas = ctx;
});

describe('パスワードの最低文字数(画面)', () => {
  it('最低8文字。7文字は断り、8文字は通る(文字の種類がそろっているとき)', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(validatePassword('Abc1!ef')).toBe('パスワードは8文字以上で入力してください。');
    expect(validatePassword('Abc1!efg')).toBeNull();
    expect(validatePassword('Ab1!')).toBe('パスワードは8文字以上で入力してください。');
  });

  it('上の決まり(128文字まで・小文字・大文字・数字・記号)は、そのまま', () => {
    expect(validatePassword('Aa1!' + 'x'.repeat(124))).toBeNull();
    expect(validatePassword('Aa1!' + 'x'.repeat(125))).toBe('パスワードは128文字以内で入力してください。');
    expect(validatePassword('ABCDEFG1!')).toMatch(/小文字/);
    expect(validatePassword('abcdefg1!')).toMatch(/大文字/);
    expect(validatePassword('Abcdefgh!')).toMatch(/数字/);
    expect(validatePassword('Abcdefg12')).toMatch(/記号/);
  });
});

describe('画面とサーバーが、同じ数字・同じ文言', () => {
  it('数字がそろっている(最低・最高・メールの長さ)', () => {
    expect(vm.runInContext('MIN_PASSWORD_LENGTH', gas)).toBe(MIN_PASSWORD_LENGTH);
    expect(vm.runInContext('MAX_PASSWORD_LENGTH', gas)).toBe(MAX_PASSWORD_LENGTH);
    expect(vm.runInContext('MAX_EMAIL_LENGTH', gas)).toBe(MAX_EMAIL_LENGTH);
  });

  it('いろいろなパスワードで、サーバーの断りの文が、画面と同じ(通るものは、どちらも通る)', () => {
    const samples = ['', 'a', 'Ab1!', 'Abc1!ef', 'Abc1!efg', 'ABCDEFG1!', 'abcdefg1!', 'Abcdefgh!', 'Abcdefg12', 'Aa1!' + 'x'.repeat(124), 'Aa1!' + 'x'.repeat(125), '日本語のパスワードAa1!'];
    samples.forEach((pw) => {
      const server = gas.validatePasswordServer(pw);
      const client = validatePassword(pw);
      // 記号の断りだけは、画面が「例: ! # % & など」を添える(これまでどおり)。ほかは、同じ文言
      if (client && client.includes('記号')) expect(server, JSON.stringify(pw)).toMatch(/記号/);
      else expect(server, JSON.stringify(pw)).toBe(client);
    });
  });

  it('サーバー: 7文字の登録のパスワードは断り、8文字は通る', () => {
    expect(gas.validatePasswordServer('Abc1!ef')).toBe('パスワードは8文字以上で入力してください。');
    expect(gas.validatePasswordServer('Abc1!efg')).toBeNull();
  });
});
