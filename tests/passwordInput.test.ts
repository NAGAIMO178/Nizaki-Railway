// パスワード入力欄の「表示/隠す」ボタン
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PasswordInput, PasswordInputView, passwordInputType, passwordToggleLabel, toggleShown } from '../src/components/PasswordInput';

const view = (shown: boolean, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(PasswordInputView, { shown, onToggle: () => undefined, id: 'login-password', name: 'password', autoComplete: 'current-password webauthn', maxLength: 128, value: 'abc', onChange: () => undefined, ...extra }));

describe('切り替えの決まり', () => {
  it('はじめは隠す(password)。押すと表示(text)、もう一度で隠す', () => {
    let shown = false;
    expect(passwordInputType(shown)).toBe('password');
    shown = toggleShown(shown);
    expect(passwordInputType(shown)).toBe('text');
    shown = toggleShown(shown);
    expect(passwordInputType(shown)).toBe('password');
  });

  it('欄ごとに、独立(1つを切り替えても、ほかは変わらない)', () => {
    const fields = { password: false, confirm: false };
    const next = { ...fields, confirm: toggleShown(fields.confirm) };
    expect(next).toEqual({ password: false, confirm: true });
  });

  it('ボタンの名前: 隠れているときは「パスワードを表示」、表示中は「パスワードを隠す」', () => {
    expect(passwordToggleLabel(false)).toBe('パスワードを表示');
    expect(passwordToggleLabel(true)).toBe('パスワードを隠す');
  });
});

describe('入力欄とボタンの作り', () => {
  it('はじめ(隠す): type=password・aria-pressed=false・aria-label=パスワードを表示・button type=button', () => {
    const h = renderToStaticMarkup(React.createElement(PasswordInput, { id: 'x', name: 'password', autoComplete: 'current-password', value: '', onChange: () => undefined }));
    expect(h).toContain('type="password"');
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain('aria-label="パスワードを表示"');
    expect(h).toMatch(/<button type="button"/);
  });

  it('表示中: type=text・aria-pressed=true・aria-label=パスワードを隠す', () => {
    const h = view(true);
    expect(h).toContain('type="text"');
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain('aria-label="パスワードを隠す"');
  });

  it('autoComplete・name・id・maxLength は、表示/隠すに関係なく、そのまま(パスワードマネージャーの自動入力を壊さない)', () => {
    for (const shown of [false, true]) {
      const h = view(shown);
      expect(h).toContain('autoComplete="current-password webauthn"');
      expect(h).toContain('name="password"');
      expect(h).toContain('id="login-password"');
      expect(h).toContain('maxLength="128"');
    }
    expect(view(false, { autoComplete: 'new-password', name: 'new-password' })).toContain('autoComplete="new-password"');
  });

  it('押しやすさ: ボタンは 44px 角(w-11 h-11)。入力欄の右に余白(pr-11)があり、長い文字が下に潜らない', () => {
    const h = view(false);
    expect(h).toMatch(/<button[^>]*class="[^"]*\bw-11\b[^"]*\bh-11\b/);
    expect(h).toMatch(/<input[^>]*class="[^"]*\bpr-11\b/);
  });
});

describe('画面での使い方(ソースの見張り)', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', f), 'utf-8');

  it('ログイン・新規登録(確認用)・再設定(確認用)の5欄と、退会の確認の1欄が、すべて PasswordInput', () => {
    const login = read('LoginModal.tsx');
    expect((login.match(/<PasswordInput/g) ?? []).length).toBe(5);
    expect(login).not.toContain('type="password"');
    for (const id of ['login-password', 'register-password', 'register-password-confirm', 'reset-password', 'reset-password-confirm']) expect(login, id).toContain(`id="${id}"`);
    const my = read('MyPageModal.tsx');
    expect((my.match(/<PasswordInput/g) ?? []).length).toBe(1);
    expect(my).not.toContain('type="password"');
  });

  it('自動入力の autoComplete は、そのまま(ログイン current-password / 登録・再設定 new-password / 退会 current-password)', () => {
    const login = read('LoginModal.tsx');
    expect((login.match(/autoComplete="new-password"/g) ?? []).length).toBe(4);
    expect(login).toContain('autoComplete="current-password webauthn"');
    expect(read('MyPageModal.tsx')).toContain('autoComplete="current-password"');
  });
});
