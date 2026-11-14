// 会員証の名札(公開記念イベント「幻のタレ事件」をクリアした会員だけ)。クリアしていない会員の会員証は、1文字も変わらない。
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { NPointModal } from '../src/components/NPointModal';
import { EVENT_TARE } from '../src/utils/eventTare';

const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');
const user = { memberId: 'M0000123', name: 'テスト', email: 'test@example.invalid', rank: 'レギュラー', joinDate: '2026-11-01' };
const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(NPointModal as never, { isOpen: true, onClose: () => undefined, balance: 1200, currentUser: user, ...props }));

// 名札と同じ形(特設ページの名札の、色・形の部分)
const TAG_CLASS = 'rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-400';

describe('会員証の名札', () => {
  it('クリアしていない会員(指定なし・false)の会員証には、名札が出ない。指定なしと false は、同じ画面', () => {
    const none = render({});
    const no = render({ eventCleared: false });
    expect(no).toBe(none);
    expect(none).not.toContain(EVENT_TARE.tagName);
    expect(none).not.toContain('amber-500');
  });

  it('クリア済みの会員には、名札(EVENT_TARE.tagName)が出る。出る名前は「味覚捜査班」', () => {
    const cleared = render({ eventCleared: true });
    expect(EVENT_TARE.tagName).toBe('味覚捜査班');
    expect(cleared).toContain(`>${EVENT_TARE.tagName}</span>`);
    expect(cleared).not.toContain('調査班');
  });

  it('名札だけが増える: 名札を取り除くと、クリアしていない会員の会員証と、1文字も違わない(ほかの文字・バーコードは、そのまま)', () => {
    const none = render({});
    const cleared = render({ eventCleared: true });
    const tag = `<div class="relative h-0"><span class="absolute bottom-0 right-0 mb-0.5 whitespace-nowrap ${TAG_CLASS}">${EVENT_TARE.tagName}</span></div>`;
    expect(cleared).toContain(tag);
    expect(cleared.replace(tag, '')).toBe(none);
  });

  it('名札は、会員番号(神埼ID)のすぐ上。イベントの特設ページの名札と、同じ色・形(琥珀色の小さな帯)', () => {
    const cleared = render({ eventCleared: true });
    expect(cleared.indexOf(EVENT_TARE.tagName)).toBeLessThan(cleared.indexOf('神埼ID: M0000123'));
    expect(cleared.indexOf(EVENT_TARE.tagName)).toBeGreaterThan(cleared.indexOf('N-POINT 保有残高'));
    expect(read('src', 'components', 'EventTarePage.tsx')).toContain(`<span className="${TAG_CLASS}">名札『{EVENT_TARE.tagName}』</span>`);
    expect(read('src', 'components', 'NPointModal.tsx')).not.toContain('味覚捜査班'); // 名前は、直書きしない
  });

  it('ログインしていない(会員証が、会員のものでない)ときは、クリア済みの指定があっても、出さない', () => {
    expect(render({ currentUser: null, eventCleared: true })).not.toContain(EVENT_TARE.tagName);
  });

  it('画面は、イベントの画面と同じ「クリア済み」の印(readEventProgress。サーバーの記録で、端末の印も更新される)を、公開後だけ渡す', () => {
    const app = read('src', 'App.tsx');
    expect(app).toContain('eventCleared={isLaunched() && eventProgress.cleared}');
    expect(app).toContain("const eventProgress = isLaunched() ? readEventProgress(eventOwner, eventStore) : { joined: false, cleared: false };");
  });

  it('会員証の画像(PNG)・バーコードの部品には、名札を入れていない(画面とは別の作り)', () => {
    for (const f of ['cardCanvas.ts', 'memberCard.ts', 'memberBarcode.ts']) {
      const src = read('src', 'utils', f);
      expect(src, f).not.toContain('tagName');
      expect(src, f).not.toContain('味覚捜査班');
    }
  });
});
