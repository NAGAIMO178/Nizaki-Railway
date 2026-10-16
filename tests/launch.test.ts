import { afterEach, describe, expect, it } from 'vitest';
import { LAUNCH_AT, isLaunched } from '../src/utils/launch';

// 公開前の本番の利用者に、新機能が見えないことを守る。
// テストの準備(tests/setup.ts)は ?preview=1 の状態なので、その場で付け外しして確かめる
const win = (globalThis as unknown as { window: { location: { search: string } } }).window;

afterEach(() => {
  win.location.search = '?preview=1';
  localStorage.clear();
});

describe('公開前の機能の隠し方', () => {
  it('?preview=1 のリンクでは、公開後の画面が見える。端末にも覚える', () => {
    win.location.search = '?preview=1';
    expect(isLaunched()).toBe(true);
    win.location.search = '';
    expect(isLaunched()).toBe(true);
  });

  it('?preview=0 で、覚えたのを消す。公開日の前なら、隠れる', () => {
    win.location.search = '?preview=1';
    isLaunched();
    win.location.search = '?preview=0';
    const afterOff = isLaunched();
    expect(afterOff).toBe(LAUNCH_AT !== null && Date.now() >= Date.parse(LAUNCH_AT));
  });

  it('リンクも記憶もない普通の利用者は、公開日の前なら見えない', () => {
    win.location.search = '';
    localStorage.clear();
    expect(isLaunched()).toBe(LAUNCH_AT !== null && Date.now() >= Date.parse(LAUNCH_AT));
  });
});
