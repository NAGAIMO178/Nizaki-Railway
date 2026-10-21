import { afterEach, describe, expect, it } from 'vitest';
import { LAUNCH_AT } from '../src/utils/launch';
import { buildTicketUrl, parseTicketHash, ticketRouteToken } from '../src/utils/ticketToken';

const win = (globalThis as unknown as { window: { location: { search: string } } }).window;

afterEach(() => {
  win.location.search = '?preview=1';
  localStorage.clear();
});

const TOKEN = 'EQ-12345.AbCdEfGh_-Ij';

describe('QR乗車券のリンク', () => {
  it('リンクを作って、ハッシュから同じトークンを取り出せる', () => {
    const url = new URL(buildTicketUrl(TOKEN, { origin: 'https://example.test', pathname: '/app/' }));
    expect(url.origin + url.pathname).toBe('https://example.test/app/');
    expect(parseTicketHash(url.hash)).toBe(TOKEN);
  });

  it('公開日が決まるまでは、公開後の画面を見る指定が付く。決まったあとは付かない', () => {
    const url = new URL(buildTicketUrl(TOKEN, { origin: 'https://example.test', pathname: '/app/' }));
    expect(url.searchParams.has('preview')).toBe(LAUNCH_AT === null);
  });

  it('形の違うハッシュは、検札の画面にならない', () => {
    for (const hash of ['', '#', '#/t/', '#/t/EQ-12345', '#/t/EQ-12345.short', `#/t/${TOKEN}x`, `#/x/${TOKEN}`, `#/t/<script>.AbCdEfGhIjKl`, '#/t/EQ-12345.AbCdEfGhIj%4B']) {
      expect(parseTicketHash(hash)).toBeNull();
    }
  });

  it('公開前の普通の利用者がリンクを開いても、検札の画面にならない(いつものアプリのまま)', () => {
    win.location.search = '?preview=0';
    expect(ticketRouteToken(`#/t/${TOKEN}`)).toBeNull();
  });

  it('公開後の画面を見られるときは、検札の画面になる', () => {
    win.location.search = '?preview=1';
    expect(ticketRouteToken(`#/t/${TOKEN}`)).toBe(TOKEN);
  });
});
