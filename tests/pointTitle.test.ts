// イベント「幻のタレ事件」のごほうびの行の題名: 「解決報奨」→「解決報酬」。台帳の行は書き換えず、画面で直して見せる。
// あわせて、「ごほうびの行がある = サーバーが名札の印(eventTareCleared)を立てる」関係を確かめる。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { pointTitleText } from '../src/utils/pointTitle';
import { NPointModal } from '../src/components/NPointModal';

const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');
const OLD = '幻のタレ事件 解決報奨（味覚捜査班）';
const NEW = '幻のタレ事件 解決報酬（味覚捜査班）';

describe('題名の表示', () => {
  it('台帳にすでにある「解決報奨」は、「解決報酬」で見せる。カッコの形(全角・半角)など、ほかの文字はそのまま', () => {
    expect(pointTitleText(OLD)).toBe(NEW);
    expect(pointTitleText('幻のタレ事件 解決報奨(味覚捜査班)')).toBe('幻のタレ事件 解決報酬(味覚捜査班)');
    expect(pointTitleText(NEW)).toBe(NEW);
  });

  it('ほかの題名は、1文字も変えない(神埼奇譚の「解明報奨」・登録ボーナス・空・文字でない値も)', () => {
    for (const t of ['神埼奇譚 第1幕解明報奨', '神埼ID 新規登録ウェルカムボーナス', '特急あやみ 124号 乗車・デリバリー利用', '', '解決報奨', 'X幻のタレ事件 解決報奨']) {
      expect(pointTitleText(t), t).toBe(t);
    }
    expect(pointTitleText(undefined)).toBeUndefined();
    expect(pointTitleText(null)).toBeNull();
  });

  it('ポイント獲得履歴の画面に、「解決報酬」で出る(台帳の題名は「解決報奨」のまま届く)', () => {
    const user = { memberId: 'M0000123', name: 'テスト', email: 'test@example.invalid', rank: 'レギュラー', joinDate: '2026-11-01' };
    const html = renderToStaticMarkup(
      React.createElement(NPointModal as never, {
        isOpen: true,
        onClose: () => undefined,
        balance: 350,
        currentUser: user,
        pointHistory: [{ id: 'pt_cloud_0', title: OLD, date: '2026/11/01 09:45:18', points: 350, type: 'stamp' }],
      })
    );
    expect(html).toContain('幻のタレ事件 解決報酬（味覚捜査班）');
    expect(html).not.toContain('解決報奨');
    expect(html).toContain('2026/11/01 09:45:18');
  });

  it('2つの画面(マイページの利用履歴・ポイント獲得履歴)が、表示の直しを通している', () => {
    expect(read('src', 'components', 'MyPageModal.tsx')).toContain('title: pointTitleText(p.title),');
    expect(read('src', 'components', 'NPointModal.tsx')).toContain('{pointTitleText(item.title)}');
  });
});

describe('GAS: 題名の文字は、判定にも重複の検査にも使われない', () => {
  const gasSrc = read('gas', 'Code.gs');

  it('定数の題名は「解決報酬」。使われているのは、定義と、台帳に書く1か所だけ(鍵 EVENT_TARE_KEY で、受け取り済みを見る)', () => {
    expect(gasSrc).toContain("const EVENT_TARE_TITLE = '幻のタレ事件 解決報酬（味覚捜査班）';");
    expect(gasSrc).not.toContain('解決報奨');
    expect((gasSrc.match(/EVENT_TARE_TITLE/g) ?? []).length).toBe(2); // 定義と、台帳に書く1か所だけ
    expect(gasSrc).toContain("addPointEntry(ledger, a.memberId, 'event', EVENT_TARE_KEY, EVENT_TARE_POINTS, EVENT_TARE_TITLE);");
    // 重複の検査は、鍵(名札の列)だけ。題名では見ない
    expect(gasSrc).toContain('if (ledger.keys[EVENT_TARE_KEY]) {');
    expect(gasSrc).toContain('if (ledger.keys[key]) return false;');
  });

  // ごほうびの行(鍵 event:tare)があれば、サーバーは、名札の印を立てる。題名が違っても同じ
  const buildAccount = (rows: unknown[][]) => {
    const ctx: Record<string, unknown> = { Logger: { log: () => undefined }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }, ContentService: {} };
    vm.createContext(ctx);
    vm.runInContext(gasSrc, ctx);
    const g = ctx as Record<string, (...a: unknown[]) => unknown>;
    g.getOrCreateSheetWithHeaders = () => ({ getDataRange: () => ({ getValues: () => [['日時', '会員ID', '種別', '名札', 'ポイント', 'タイトル'], ...rows] }) });
    g.readMemberOrders = () => [];
    g.readMemberRides = () => [];
    g.readEventJoinedAt = () => null;
    const ledger = g.readMemberPoints('M1');
    return g.buildAccountData('M1', ledger, { codes: [] }, { stage: 0, stamps: [], cleared: false }) as { eventTareCleared: boolean; history: { title: string; kind: string }[] };
  };

  it('鍵 event:tare の行がある会員は、名札の印が立つ。題名が「解決報奨」でも「解決報酬」でも、同じ', () => {
    for (const title of [OLD, NEW]) {
      const a = buildAccount([['2026/11/01 09:45:18', 'M1', 'event', 'event:tare', 350, title]]);
      expect(a.eventTareCleared, title).toBe(true);
      expect(a.history[0]).toMatchObject({ title, kind: 'event' });
    }
  });

  it('鍵が違う・空の行(題名だけが同じ手書きの行など)では、印は立たない(題名では見ない)', () => {
    expect(buildAccount([['2026/11/01 09:45:18', 'M1', 'event', '', 350, OLD]]).eventTareCleared).toBe(false);
    expect(buildAccount([['2026/11/01 09:45:18', 'M1', 'event', 'event:stage1', 350, OLD]]).eventTareCleared).toBe(false);
    expect(buildAccount([['2026/11/01 09:45:18', 'M2', 'event', 'event:tare', 350, OLD]]).eventTareCleared).toBe(false); // 別の会員の行
    expect(buildAccount([]).eventTareCleared).toBe(false);
  });
});
