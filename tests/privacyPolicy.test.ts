// プライバシーポリシー: 公開前は今の文のまま(画面は変えない)。公開後は、サーバーに残すデータに合わせた文
// (2026-11-11: 公式LINEでの応答・ご請求の受付を、いまの動きに合わせて直した。公開前・公開後の両方の文に入っている)
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivacyPolicyModal } from '../src/components/PrivacyPolicyModal';

const win = (globalThis as unknown as { window: { location: { search: string } } }).window;
const html = (): string => renderToStaticMarkup(React.createElement(PrivacyPolicyModal, { isOpen: true, onClose: () => undefined }));
const text = (): string => html().replace(/<[^>]+>/g, '');

afterEach(() => {
  win.location.search = '?preview=1';
  localStorage.clear();
  vi.useRealTimers();
});

// 「公開前」の確認は、時計を公開の前に合わせる(公開の日をすぎても、通るように)
const beforeLaunch = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00+09:00'));
};

describe('公開前', () => {
  it('今の文のまま(画面の中身が、意図しないかぎり、1文字も変わらない)', () => {
    beforeLaunch();
    win.location.search = '';
    localStorage.clear();
    const h = createHash('sha256').update(html()).digest('hex');
    expect(h).toBe('abb4ab194f6d682c24300614b16497d29843660ba1b73a76a3281d0eff5e01ea');
  });
});

describe('公開後', () => {
  const pre = (): string => {
    beforeLaunch();
    win.location.search = '';
    localStorage.clear();
    return html();
  };
  const post = (): string => {
    win.location.search = '?preview=1';
    return html();
  };
  const part = (h: string, from: string): string => h.slice(h.indexOf(from));

  it('サーバーに残すものを書く(メール・パスワード・予約・N-POINT・使用済みクーポン・ミステリー・イベントの参加時刻と報酬・マイレージ)', () => {
    win.location.search = '?preview=1';
    const t = text();
    ['メールアドレス', 'ソルト付きのハッシュ値', '予約コード', 'N-POINTの残高と履歴', '使用済みクーポン', 'ミステリーの進み具合', '公開記念イベントに参加した時刻', '受け取った報酬', 'マイレージは、乗車済みの予約の記録から計算'].forEach((w) => expect(t, w).toContain(w));
    expect(t).toContain('サーバー（Googleのスプレッドシート）に保存');
  });

  it('端末の中だけのもの・デモ会員・チャット・位置情報(サーバーへ送らない)', () => {
    win.location.search = '?preview=1';
    const t = text();
    expect(t).toContain('端末（ブラウザのLocalStorage等）の中だけに保存');
    expect(t).toContain('マイ駅設定、見た場面の印、イベントの参加の印');
    expect(t).toContain('イベントのチャットの内容は、保存しません');
    expect(t).toContain('デモ会員のデータは、サーバーへは送らず、画面を開いているあいだだけ');
    expect(t).toContain('位置情報は端末内で計算し、サーバーへは送信・保存しません');
  });

  it('LINE(予約は、そのLINEに紐づく分だけ・アンケート)と、ログイン証・失敗の回数', () => {
    win.location.search = '?preview=1';
    const t = text();
    expect(t).toContain('そのLINEアカウントに紐づく予約だけをお返しします');
    expect(t).toContain('LINEのアンケート（リサーチ）を行うことがあります');
    expect(t).toContain('個人が特定されない形で、結果だけを見ます');
    expect(t).toContain('署名つきのログイン証（有効14日）');
    expect(t).toContain('約10分');
  });

  it('削除で消えるもの・匿名にして残るもの(予約台帳・クーポン発行の記録)', () => {
    win.location.search = '?preview=1';
    const t = text();
    expect(t).toContain('会員台帳（メールアドレス、表示名、パスワード、LINEユーザーID）、N-POINTの履歴、使用済みクーポン、ミステリーの進み具合、イベントに参加した時刻、受け取った報酬の記録');
    expect(t).toContain('LINEユーザーIDと会員IDを「削除済み」に置き換えて');
    expect(t).toContain('マイレージは、この記録から計算するため、削除したあとは計算されません');
  });

  it('公開前の古い言い方(状態・残高・履歴が端末内だけ)は、公開後の文に残らない', () => {
    win.location.search = '?preview=1';
    const t = text();
    expect(t).not.toContain('N-POINTの残高・履歴、終了した予約の履歴、使用済みクーポン、マイ駅設定などは、お使いの端末');
    expect(t).toContain('改定日：2026年11月1日（');
    expect(pre().replace(/<[^>]+>/g, '')).not.toContain('改定日：2026年11月1日（'); // 公開前の文には、公開の日の改定は書かない
  });

  it('6(請求)・7(会員規約)・問い合わせ先は、公開前と同じ', () => {
    const a = part(pre(), '<section class="space-y-1.5"><h3 class="text-sm font-extrabold text-[#221C35]">6.');
    const b = part(post(), '<section class="space-y-1.5"><h3 class="text-sm font-extrabold text-[#221C35]">6.');
    // 制定日の下の「改定日」の行だけが違う
    const cut = (h: string) => h.replace(/改定日：2026年11月1日（[^<]*<br\/>/, '');
    expect(cut(b)).toBe(cut(a));
    expect(a.length).toBeGreaterThan(1000);
  });
});

describe('公式LINEでの応答・ご請求(2026-11-11 の改定)', () => {
  const both = (): string[] => {
    beforeLaunch();
    win.location.search = '';
    localStorage.clear();
    const pre = text();
    win.location.search = '?preview=1';
    return [pre, text()];
  };

  it('公式LINEの自動の返事(予約の照会)は、書いたまま。人が個別に返すお問い合わせは、書かない。運行情報・お知らせの配信は、そのまま', () => {
    both().forEach((t) => {
      expect(t).not.toContain('お問い合わせへの対応');
      expect(t).toContain('公式LINEでの運行情報・お知らせの配信');
    });
    const post = both()[1];
    expect(post).toContain('公式LINEに「予約」などと送ると、そのLINEアカウントに紐づく予約だけをお返しします（ほかの人の予約は見られません）。');
    expect(post).not.toContain('予約の照会などの応答を行っておりません');
  });

  it('6: 請求は受け付けていない。神埼IDの削除は、マイページから自分でできる。公式LINEへのリンクは、ない', () => {
    both().forEach((t) => {
      expect(t).toContain('現在、開示・訂正・追加・削除・利用停止の請求は、受け付けておりません');
      expect(t).toContain('神埼IDの削除は、マイページの「神埼IDを削除する」から、いつでも、ご自身で行えます');
      expect(t).not.toContain('のトークで');
      expect(t).not.toContain('個人情報の開示請求');
    });
    both().forEach((_, i) => {
      const h = i === 0 ? (beforeLaunch(), (win.location.search = ''), localStorage.clear(), html()) : ((win.location.search = '?preview=1'), html());
      expect(h).not.toContain('lin.ee');
      expect(h).not.toContain('<a ');
    });
  });

  it('5: 完全なデータ消去を「下記6でご請求」とは案内しない。受け付けていないと書く', () => {
    both().forEach((t) => {
      expect(t).not.toContain('完全なデータ消去を希望される場合');
      expect(t).not.toContain('下記6の手続き');
      expect(t).toContain('これらの記録を個別に消すご請求は、現在、受け付けておりません（下記6）');
    });
  });

  it('見出しの番号は、1〜7が、順に並ぶ(下記6の参照が、ずれない)', () => {
    both().forEach((t) => {
      const heads = [...t.matchAll(/(?:^|[^\d])([1-7])\. (?=[^\s])/g)].map((m) => m[1]);
      expect(heads.join('')).toContain('1234567');
      expect(t).toContain('6. データの削除と、ご請求について');
      expect(t).toContain('7. 会員規約');
    });
  });

  it('改定日は、2026年11月11日(公開前・公開後の両方)。お問い合わせ対応と請求の受付の説明を更新した、と書く', () => {
    both().forEach((t) => expect(t).toContain('改定日：2026年11月11日（公式LINEでのお問い合わせ対応と、ご請求の受付についての説明を更新しました）'));
  });

  it('LINEユーザーIDの取得の説明(1)は、そのまま(連携が動いているか確認するまで、触らない)', () => {
    both().forEach((t) => expect(t).toContain('LINEユーザーID（本人確認のため、当社公式LINEを友だち追加しメッセージを送信した際に取得します）'));
  });
});

