// ログアウトの確認の文: サーバーに同期ずみか、そうでないかで、実際の動きに合わせて変わる
import { describe, expect, it } from 'vitest';
import { logoutNoticeText } from '../src/utils/logoutNotice';

describe('ログアウトの確認の文', () => {
  const synced = logoutNoticeText(true, 1234, 'aya@example.test');
  const local = logoutNoticeText(false, 1234, 'aya@example.test');

  it('サーバーに同期ずみ: 端末の控えは消え、ログインし直すとサーバーから戻る。いまの予約は残る', () => {
    expect(synced).toContain('ログアウトすると、この端末に保存されているN-POINTや履歴の控えは消えます');
    expect(synced).toContain('もう一度ログインすると、サーバーから続きが戻ります（別の端末でも同じです）');
    expect(synced).toContain('いまの予約は、ログアウトしても残ります');
  });

  it('サーバーに同期ずみ: 「残ります」「別の端末には引き継がれません」とは書かない。予約の記録がすべて消える、とも書かない', () => {
    expect(synced).not.toContain('別の端末には引き継がれません');
    expect(synced).not.toContain('予約の記録');
    expect(synced).not.toContain('ポイント（');
    expect(synced).not.toContain('aya@example.test');
  });

  it('同期の前・公開前(端末だけで持っている会員): これまでの文のまま(残高とメールアドレスを入れる)', () => {
    expect(local).toBe(
      'ログアウトしても、この端末に保存されているN-POINT（1,234pt）や予約の記録は残ります。同じ端末で同じメールアドレス（aya@example.test）でログインすると続きから使えます。なお、これらの記録は端末ごとに保存されるため、別の端末には引き継がれません。'
    );
  });

  it('2つの文は、違う', () => {
    expect(synced).not.toBe(local);
  });
});
