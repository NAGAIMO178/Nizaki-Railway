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
  'src/components/ReservationTab.tsx': ['className="space-y-4 text-[#221C35] max-w-md mx-auto p-4 pb-20 animate-fadeIn"'],
  'src/components/EquipTab.tsx': ['<div className="space-y-4 pb-12">', 'className="fixed bottom-16 inset-x-0 mx-auto max-w-md px-4 z-30 animate-fadeIn"'],
  'src/components/EventsTab.tsx': ['className="max-w-3xl mx-auto px-4 py-5 pb-24 space-y-5 animate-fadeIn text-[#221C35]"'],
  'src/components/SettingsTab.tsx': ['className="space-y-4 text-[#221C35] max-w-xl mx-auto p-4 pb-28 animate-fadeIn"'],
  'src/App.tsx': ['<div className="max-w-md mx-auto px-4">\n              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="tablist" aria-label="予約の種類">'],
};
// ファイルごとの、PC 用クラスの数
const COUNTS: Record<string, number> = {
  'src/components/TimetableTab.tsx': 3,
  'src/components/TrainLocationTab.tsx': 1,
  'src/components/ReservationTab.tsx': 1,
  'src/components/EquipTab.tsx': 1,
  'src/components/EventsTab.tsx': 1,
  'src/components/SettingsTab.tsx': 1,
  'src/App.tsx': 1,
  'src/components/Header.tsx': 1,
  'src/components/FooterNav.tsx': 1,
};

const strip = (s: string) => s.replaceAll(` ${W}`, '').replaceAll(' pc:max-w-[928px] pc:mx-auto', '');

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

  it('デリバリーの根は、スマホでは上限なし(これまでどおり)。PC の幅だけ 928px(左右の余白 16px ずつで、カードが 960px の枠に収まる)', () => {
    const src = read('src/components/EquipTab.tsx');
    expect(src).toContain('<div className="space-y-4 pb-12 pc:max-w-[928px] pc:mx-auto">');
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

  it('ヘッダー・フッターの PC の幅は、ホーム以外のタブのときだけ', () => {
    const header = read('src/components/Header.tsx');
    const footer = read('src/components/FooterNav.tsx');
    expect(header).toContain("activeTab && activeTab !== 'home' ? ' pc:max-w-[960px]' : ''");
    expect(footer).toContain("activeTab !== 'home' ? ' pc:max-w-[960px]' : ''");
  });
});

describe('ヘッダー・フッターの出力', () => {
  const header = (activeTab?: string) => renderToStaticMarkup(React.createElement(Header as never, { activeTab, onOpenMenu: () => undefined, onGoHome: () => undefined, onOpenLoginModal: () => undefined }));
  const footer = (activeTab: string) => renderToStaticMarkup(React.createElement(FooterNav as never, { activeTab, onChangeTab: () => undefined, onReselect: () => undefined, hasActiveOrder: false }));

  it('ホームのときは、PC 用のクラスが付かない(これまでと同じ)', () => {
    expect(header('home')).not.toContain(W);
    expect(footer('home')).not.toContain(W);
    expect(header('home')).toContain('class="max-w-4xl mx-auto px-4 py-2.5"');
    expect(footer('home')).toContain('class="max-w-md mx-auto flex items-center justify-around"');
  });

  it('ホーム以外のタブ(列車位置・時刻表・予約・イベント・設定)のときは、PC の幅で 960px。スマホのクラスはそのまま', () => {
    for (const tab of ['location', 'timetable', 'reservation', 'events', 'settings']) {
      expect(header(tab), tab).toContain('class="max-w-4xl mx-auto px-4 py-2.5 pc:max-w-[960px]"');
      expect(footer(tab), tab).toContain('class="max-w-md mx-auto flex items-center justify-around pc:max-w-[960px]"');
    }
  });

  it('タブが分からないとき(activeTab なし)のヘッダーは、これまでと同じ', () => {
    expect(header(undefined)).not.toContain(W);
  });
});
