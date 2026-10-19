// 画面ごとの読み込みが失敗したときに、白い画面にならず、「再読み込み」が出ること
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LazyBoundary, LoadFailed } from '../src/components/LazyBoundary';
import { claimPreloadReload } from '../src/utils/preloadReload';

const memoryStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('読み込み失敗の受け皿', () => {
  it('失敗の表示に、メッセージと再読み込みのボタンがある', () => {
    const html = renderToString(React.createElement(LoadFailed));
    expect(html).toContain('読み込めませんでした');
    expect(html).toContain('再読み込み');
    expect(html).toContain('<button');
  });

  it('モーダル用は、画面全体を覆う形で出る', () => {
    const html = renderToString(React.createElement(LoadFailed, { overlay: true }));
    expect(html).toContain('fixed inset-0');
    expect(html).toContain('再読み込み');
  });

  it('部品が読み込みに失敗(例外)すると、境界が失敗の表示に切り替わる', () => {
    const boundary = new LazyBoundary({ children: null });
    expect(boundary.state.failed).toBe(false);
    boundary.state = LazyBoundary.getDerivedStateFromError();
    const html = renderToString(boundary.render() as React.ReactElement);
    expect(html).toContain('読み込めませんでした');
    expect(html).toContain('再読み込み');
  });

  it('遅延読み込みの部品は、すべて LazyBoundary の中に置く(素の Suspense を使わない)', () => {
    const files = ['src/App.tsx', 'src/components/EventsTab.tsx', 'src/components/SettingsTab.tsx', 'src/components/LazyOnOpen.tsx'];
    for (const f of files) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');
      expect(src, f).not.toMatch(/<Suspense\b/);
    }
  });
});

describe('ファイルが取れないときの自動の再読み込み', () => {
  it('1回めは再読み込みしてよく、2回めは繰り返さない', () => {
    const store = memoryStore();
    expect(claimPreloadReload(store)).toBe(true);
    expect(claimPreloadReload(store)).toBe(false);
    expect(claimPreloadReload(store)).toBe(false);
  });

  it('保存先が使えないときは、自動では再読み込みしない(無限に繰り返さない)', () => {
    expect(claimPreloadReload(null)).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(claimPreloadReload(broken)).toBe(false);
  });
});
