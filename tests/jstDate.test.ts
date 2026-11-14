// 履歴・乗車券の確認ページの日付: 時区つきの時刻だけを、日本時間の「いつもの形」に直す。ほかは、1文字も変えない
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { ledgerDateText, ledgerDateTimeText } from '../src/utils/jstDate';
import { NPointModal } from '../src/components/NPointModal';

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf-8');

describe('日時(ポイント履歴・利用履歴): 時区つきの時刻 → 日本時間の 2026/10/03 00:00:00 の形', () => {
  it('報告された例・UTC 15:00 の境目', () => {
    expect(ledgerDateTimeText('2026-10-02T15:00:00.000Z')).toBe('2026/10/03 00:00:00');
    expect(ledgerDateTimeText('2026-10-02T14:59:59.999Z')).toBe('2026/10/02 23:59:59');
    expect(ledgerDateTimeText('2026-10-02T00:00:00Z')).toBe('2026/10/02 09:00:00');
    expect(ledgerDateTimeText('2026-10-02T15:00Z')).toBe('2026/10/03 00:00:00');
  });

  it('月末・年またぎ・うるう日', () => {
    expect(ledgerDateTimeText('2026-10-31T15:30:45.000Z')).toBe('2026/11/01 00:30:45');
    expect(ledgerDateTimeText('2026-12-31T15:00:00.000Z')).toBe('2027/01/01 00:00:00');
    expect(ledgerDateTimeText('2026-12-31T14:59:59.000Z')).toBe('2026/12/31 23:59:59');
    expect(ledgerDateTimeText('2028-02-28T15:00:00.000Z')).toBe('2028/02/29 00:00:00');
  });

  it('+09:00・-05:00 などの書き方も、日本時間に直す', () => {
    expect(ledgerDateTimeText('2026-10-03T12:34:56+09:00')).toBe('2026/10/03 12:34:56');
    expect(ledgerDateTimeText('2026-10-02T10:00:00-05:00')).toBe('2026/10/03 00:00:00');
    expect(ledgerDateTimeText('2026-10-03 12:34:56+0900')).toBe('2026/10/03 12:34:56');
  });

  it.each(['2026/10/03 12:34:56', '2026/10/03 12:34', '2026-10-03', '2026-10-03T12:34:56', '2026年10月3日', '', '   ', 'abc', '2026-13-45T00:00:00Z', '2026-02-30T00:00:00Z', '2026-10-03T25:00:00Z', '2026-10-02T15:00:00.000Z extra'])(
    '読める形・空・壊れた値は、1文字も変えない: %j',
    (v) => {
      expect(ledgerDateTimeText(v)).toBe(v);
    }
  );

  it('文字でない値(未設定・数)も、そのまま', () => {
    expect(ledgerDateTimeText(undefined)).toBeUndefined();
    expect(ledgerDateTimeText(null)).toBeNull();
    expect(ledgerDateTimeText(123)).toBe(123);
  });
});

describe('予約日(乗車券の確認ページ・利用履歴): 時区つきの時刻 → 日本時間の 2026-10-03(利用履歴は 2026/10/03)', () => {
  it('ハイフン・スラッシュ', () => {
    expect(ledgerDateText('2026-10-02T15:00:00.000Z')).toBe('2026-10-03');
    expect(ledgerDateText('2026-10-02T14:59:59.999Z')).toBe('2026-10-02');
    expect(ledgerDateText('2026-10-02T15:00:00.000Z', '/')).toBe('2026/10/03');
    expect(ledgerDateText('2026-12-31T15:00:00.000Z', '/')).toBe('2027/01/01');
    expect(ledgerDateText('2026-10-31T15:00:00.000Z')).toBe('2026-11-01');
  });

  it.each(['2026-10-03', '2026/10/03', '', 'abc', '2026-13-45T00:00:00Z', '2026-10-03T00:00:00'])('すでに読める形・空・壊れた値は、そのまま: %j', (v) => {
    expect(ledgerDateText(v)).toBe(v);
    expect(ledgerDateText(v, '/')).toBe(v);
  });

  it('未設定は、そのまま(いまの画面の動きを変えない)', () => {
    expect(ledgerDateText(undefined)).toBeUndefined();
  });
});

describe('画面とのつなぎ', () => {
  const user = { memberId: 'M0000123', name: 'テスト', email: 'test@example.invalid', rank: 'レギュラー', joinDate: '2026-11-01' };
  const render = (history: { id: string; title: string; date: string; points: number; type: string }[]) =>
    renderToStaticMarkup(React.createElement(NPointModal as never, { isOpen: true, onClose: () => undefined, balance: 100, currentUser: user, pointHistory: history }));

  it('ポイント獲得履歴: 時区つきの時刻は日本時間の形で出る。すでに読める形は、そのまま出る', () => {
    const html = render([
      { id: 'a', title: 'A', date: '2026-10-02T15:00:00.000Z', points: 50, type: 'reservation' },
      { id: 'b', title: 'B', date: '2026/10/03 12:34:56', points: 50, type: 'reservation' },
      { id: 'c', title: 'C', date: '2026/10/03 12:34', points: 50, type: 'coupon' },
    ]);
    expect(html).toContain('>2026/10/03 00:00:00</div>');
    expect(html).toContain('>2026/10/03 12:34:56</div>');
    expect(html).toContain('>2026/10/03 12:34</div>');
    expect(html).not.toContain('T15:00:00');
  });

  it('3か所とも、日付を通している(元の値を、そのまま出さない)', () => {
    expect(read('src', 'components', 'NPointModal.tsx')).toContain('{ledgerDateTimeText(item.date)}');
    expect(read('src', 'components', 'MyPageModal.tsx')).toContain('date: ledgerDateTimeText(p.date),');
    expect(read('src', 'components', 'MyPageModal.tsx')).toContain("ledgerDateText(h.reservedDate, '/')");
    expect(read('src', 'components', 'TicketCheckPage.tsx')).toContain("{ label: '日付', value: ledgerDateText(info.reservedDate) }");
  });
});
