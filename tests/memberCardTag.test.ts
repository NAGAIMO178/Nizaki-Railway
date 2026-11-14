// 名札(公開記念イベント「幻のタレ事件」をクリアした会員だけ): マイページの上の紫のカードに出す。会員証(N-POINT)には出さない。
// クリアしていない会員の画面は、1文字も変わらない。
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { MyPageModal } from '../src/components/MyPageModal';
import { NPointModal } from '../src/components/NPointModal';
import { EVENT_TARE } from '../src/utils/eventTare';

const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');
const user = { memberId: 'M0000123', name: 'テスト', email: 'test@example.invalid', rank: 'レギュラー', joinDate: '2026-10-03' };

const renderMyPage = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(MyPageModal as never, {
      isOpen: true,
      onClose: () => undefined,
      currentUser: user,
      balance: 1200,
      pointHistory: [],
      activeOrder: null,
      orderHistory: [],
      onLogout: () => undefined,
      onOpenNPointModal: () => undefined,
      onOpenQRCodeModal: () => undefined,
      ...props,
    })
  );
const renderCard = (props: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(NPointModal as never, { isOpen: true, onClose: () => undefined, balance: 1200, currentUser: user, ...props }));

// 名札と同じ形(特設ページの名札の、色・形の部分)
const TAG_CLASS = 'rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-400';
const tagBlock = `<div class="mt-2"><span class="inline-block whitespace-nowrap ${TAG_CLASS}">${EVENT_TARE.tagName}</span></div>`;

describe('マイページの上のカードの名札', () => {
  it('クリアしていない会員(指定なし・false)には、名札が出ない。指定なしと false は、同じ画面', () => {
    const none = renderMyPage({});
    expect(renderMyPage({ eventCleared: false })).toBe(none);
    expect(none).not.toContain(EVENT_TARE.tagName);
    expect(none).not.toContain('amber-500/50');
  });

  it('クリア済みの会員には、名札(EVENT_TARE.tagName =「味覚捜査班」)が出る', () => {
    const cleared = renderMyPage({ eventCleared: true });
    expect(EVENT_TARE.tagName).toBe('味覚捜査班');
    expect(cleared).toContain(tagBlock);
    expect(cleared).not.toContain('調査班');
  });

  it('名札だけが増える: 名札を取り除くと、クリアしていない会員のマイページと、1文字も違わない(ほかの文字・ボタン・アバターは、そのまま)', () => {
    const none = renderMyPage({});
    const cleared = renderMyPage({ eventCleared: true });
    expect(cleared.replace(tagBlock, '')).toBe(none);
  });

  it('名札は、会員番号・入会日のすぐ下。イベントの特設ページの名札と、同じ色・形(琥珀色の小さな帯)', () => {
    const cleared = renderMyPage({ eventCleared: true });
    const at = cleared.indexOf(EVENT_TARE.tagName);
    expect(at).toBeGreaterThan(cleared.indexOf('入会日:'));
    expect(cleared.slice(cleared.indexOf('入会日:'), at)).toContain('2026年10月3日');
    expect(at).toBeLessThan(cleared.indexOf('N-POINT')); // 次の N-POINT の欄より前
    expect(read('src', 'components', 'EventTarePage.tsx')).toContain(`<span className="${TAG_CLASS}">名札『{EVENT_TARE.tagName}』</span>`);
    expect(read('src', 'components', 'MyPageModal.tsx')).not.toContain('味覚捜査班'); // 名前は、直書きしない
  });
});

describe('会員証(N-POINT)には、名札を出さない', () => {
  it('クリア済みでも、会員証は、名札なしの見た目(指定があっても、1文字も変わらない)', () => {
    const plain = renderCard({});
    expect(plain).not.toContain(EVENT_TARE.tagName);
    expect(renderCard({ eventCleared: true })).toBe(plain);
    expect(plain).not.toContain('amber-500/50');
  });

  it('会員証の部品は、名札の指定(eventCleared)も、イベントの定数も、持たない', () => {
    const src = read('src', 'components', 'NPointModal.tsx');
    expect(src).not.toContain('eventCleared');
    expect(src).not.toContain('EVENT_TARE');
  });
});

describe('つなぎ', () => {
  it('画面は、イベントの画面と同じ「クリア済み」の印(readEventProgress。サーバーの記録で、端末の印も更新される)を、公開後だけ、マイページに渡す', () => {
    const app = read('src', 'App.tsx');
    expect(app).toContain('eventCleared={isLaunched() && eventProgress.cleared}');
    expect((app.match(/eventCleared=\{/g) ?? []).length).toBe(1); // 会員証には渡していない
    expect(app).toContain('const eventProgress = isLaunched() ? readEventProgress(eventOwner, eventStore) : { joined: false, cleared: false };');
    expect(app.indexOf('eventCleared={')).toBeGreaterThan(app.indexOf('<MyPageModal'));
    expect(app.indexOf('eventCleared={')).toBeLessThan(app.indexOf('<RouteMapModal'));
  });

  it('会員証の画像(PNG)・バーコードの部品には、名札を入れていない(画面とは別の作り)', () => {
    for (const f of ['cardCanvas.ts', 'memberCard.ts', 'memberBarcode.ts']) {
      const src = read('src', 'utils', f);
      expect(src, f).not.toContain('tagName');
      expect(src, f).not.toContain('味覚捜査班');
    }
  });
});
