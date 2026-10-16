// 管理者画面のパスコード: 初期値を持たず、決めるまでは「未設定」。決めた値は、そのまま使える。
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PIN_STORAGE_KEY, clearPin, getStoredPin, isValidPin, savePin } from '../src/utils/adminPin';

beforeEach(() => localStorage.clear());

describe('管理者パスコード', () => {
  it('決めていないあいだは、未設定(どんな番号でも、初めから通る番号は無い)', () => {
    expect(getStoredPin()).toBeNull();
  });

  it('決めた4桁を保存して、読める。消すと、また未設定', () => {
    expect(savePin('4827')).toBe(true);
    expect(getStoredPin()).toBe('4827');
    clearPin();
    expect(getStoredPin()).toBeNull();
  });

  it('これまでの端末の保存(同じキーの4桁)は、そのまま使える', () => {
    localStorage.setItem(PIN_STORAGE_KEY, '0615');
    expect(getStoredPin()).toBe('0615');
  });

  it('4桁の数字でないものは、保存しない・保存してあっても未設定として扱う', () => {
    ['123', '12345', 'abcd', '12a4', '', ' 123'].forEach((v) => {
      expect(isValidPin(v), v).toBe(false);
      expect(savePin(v), v).toBe(false);
    });
    expect(getStoredPin()).toBeNull();
    localStorage.setItem(PIN_STORAGE_KEY, 'abcd');
    expect(getStoredPin()).toBeNull();
  });

  it('画面のコードに、初期のパスコードを書いていない', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'AdminConsoleModal.tsx'), 'utf-8');
    expect(src).not.toMatch(/DEFAULT_PIN/);
    expect(src).not.toMatch(/PIN\s*=\s*'\d{4}'/);
  });
});
