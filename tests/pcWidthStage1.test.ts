// PC 表示 段階1: 本体の幅だけを、PC の幅(pc: = PC 表示が出ていて、かつ 1024px 以上)のときに 448px → 960px に広げる。PC 表示は、日時(pcLayout.ts)まで隠す。
// スマホ(1024px 未満)のクラスは変えない。ホームは、1文字も変えない。
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { FooterNav } from '../src/components/FooterNav';
import { Header } from '../src/components/Header';

const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');
const W = 'pc:max-w-[960px]';

// 段階1で足した PC 用のクラスを取り除くと、スマホのクラスが、これまでと同じ文字列に戻る(=スマホは1文字も変わらない)
const PHONE_ORIGINALS: Record<string, string[]> = {
  'src/components/TimetableTab.tsx': ['className="max-w-md mx-auto px-4 py-4 pb-28 space-y-3 animate-fadeIn"'],
  'src/components/TrainLocationTab.tsx': ['pb-24 max-w-md mx-auto relative font-sans'],
  'src/components/EventsTab.tsx': ['className="max-w-3xl mx-auto px-4 py-5 pb-24 space-y-5 animate-fadeIn text-[#221C35]"'],
  'src/components/SettingsTab.tsx': ['className="space-y-4 text-[#221C35] max-w-xl mx-auto p-4 pb-28 animate-fadeIn"'],
};
// ファイルごとの、PC 用クラスの数
const COUNTS: Record<string, number> = {
  'src/components/TimetableTab.tsx': 3,
  'src/components/TrainLocationTab.tsx': 1,
  'src/components/EventsTab.tsx': 1,
  'src/components/SettingsTab.tsx': 1,
};

const strip = (s: string) => s.replaceAll(` ${W}`, '');

describe('PC 用のクラスは、pc: だけ(lg: では、書かない)', () => {
  it('960px は、pc: の付いた形でしか、どこにも書かれていない(スマホ・タブレットの幅には効かない)', () => {
    for (const f of Object.keys(COUNTS)) {
      const src = read(f);
      expect(src.match(/max-w-\[960px\]/g)?.length ?? 0, f).toBe(COUNTS[f]);
      expect(src, f).not.toMatch(/(?<!pc:)max-w-\[960px\]/);
      expect(src, f).not.toMatch(/\b(sm|md|lg|xl|2xl):max-w-\[9(28|60)px\]/);
    }
  });

  it('PC 用のクラスを取り除くと、スマホのクラスは、これまでと同じ', () => {
    for (const [f, originals] of Object.entries(PHONE_ORIGINALS)) {
      const src = strip(read(f));
      for (const o of originals) expect(src, f).toContain(o);
    }
  });

  it('予約タブ(特急券・座席/デリバリー)は、広げない: PC 用の指定が、1つもない(ReservationTab・EquipTab・予約の種類の切り替えの枠)', () => {
    // (予約タブの画面・席の一覧は、PC 用の指定なし。ReservationTab の中のキャンセル確認、座席選択・デリバリー注文のモーダルは、段階3で、中央の枠の幅だけ pc: がある: tests/pcStage3.test.ts)
    for (const f of ['EquipTab', 'SeatList']) expect(read('src', 'components', `${f}.tsx`), f).not.toMatch(/\bpc:/);
    const app = read('src/App.tsx');
    expect(app).toContain('<div className="max-w-md mx-auto px-4">\n              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="tablist" aria-label="予約の種類">');
    expect(app).toContain('<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-28 md:pb-12">');
    expect(app).not.toMatch(/pc:max-w-\[960px\]/);
  });
});

describe('ホームは、変えない', () => {
  it('ホームの本体は、max-w-md の1列のまま(PC 用のクラスなし)', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('<div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-3.5 animate-fadeIn">');
    for (const f of ['StatusCard', 'MyStationCard', 'MyStationRegisterCard', 'LaunchCountdown']) {
      expect(read('src', 'components', `${f}.tsx`), f).not.toContain('pc:max-w-[960px]');
    }
  });
});

describe('ヘッダー・フッターは、どのタブでも、同じ幅(PC 表示でも動かさない)', () => {
  it('ヘッダー・フッターのファイルに、PC 用の指定が、1つもない(幅は、これまでの max-w-4xl / max-w-md のまま)', () => {
    const header = read('src/components/Header.tsx');
    const footer = read('src/components/FooterNav.tsx');
    expect(header).not.toMatch(/\bpc:/);
    expect(footer).not.toMatch(/\bpc:/);
    expect(header).toContain('<div className="max-w-4xl mx-auto px-4 py-2.5">');
    expect(footer).toContain('<div className="max-w-md mx-auto flex items-center justify-around">');
  });

  const header = (activeTab?: string) => renderToStaticMarkup(React.createElement(Header as never, { activeTab, onOpenMenu: () => undefined, onGoHome: () => undefined, onOpenLoginModal: () => undefined }));
  const footer = (activeTab: string) => renderToStaticMarkup(React.createElement(FooterNav as never, { activeTab, onChangeTab: () => undefined, onReselect: () => undefined, hasActiveOrder: false }));

  it('どのタブのときも、出力のクラスは同じ(幅が、タブで変わらない)', () => {
    const tabs = ['home', 'location', 'timetable', 'reservation', 'events', 'settings'];
    const hs = new Set(tabs.map((t) => header(t).match(/class="max-w-4xl[^"]*"/)?.[0]));
    const fs2 = new Set(tabs.map((t) => footer(t).match(/class="max-w-md mx-auto flex[^"]*"/)?.[0]));
    expect([...hs]).toEqual(['class="max-w-4xl mx-auto px-4 py-2.5"']);
    expect([...fs2]).toEqual(['class="max-w-md mx-auto flex items-center justify-around"']);
    expect(header(undefined)).toContain('class="max-w-4xl mx-auto px-4 py-2.5"');
  });
});
