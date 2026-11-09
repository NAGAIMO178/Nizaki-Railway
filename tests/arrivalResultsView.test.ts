// 到着検索の結果: 「おすすめ」の印・特別なカードを出さず、出発の早い順に、同じ作りのカードで並べる(余裕の表示は残す)
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArrivalResults } from '../src/components/ArrivalResults';
import type { ArrivalOption, ArrivalPlan } from '../src/utils/arrivalPlan';

const opt = (dep: number, arr: number, margin: number): ArrivalOption => ({
  depSec: dep,
  arrSec: arr,
  marginMin: margin,
  transfers: 1,
  route: {
    legs: [{ lineCode: 'Y', lineName: '神埼線', trainNo: `n${dep}`, typeAbbr: '快', typeName: '快速', paid: false, destLabel: '', from: '東京', to: '横浜', depSec: dep, arrSec: arr, schedDepSec: dep, schedArrSec: arr, delayMin: 0, km: 10, stops: [], passedVias: [] }],
    connections: [],
    risk: 0,
    depSec: dep,
    arrSec: arr,
    minutes: Math.round((arr - dep) / 60),
    transfers: 1,
    km: 10,
    fare: 500,
    hasPaid: false,
    delayed: false,
  },
});

const plan = (pickIndex: number): ArrivalPlan => ({
  options: [opt(7 * 3600 + 30 * 60, 8 * 3600 + 20 * 60, 40), opt(7 * 3600 + 50 * 60, 8 * 3600 + 40 * 60, 20), opt(8 * 3600 + 10 * 60, 9 * 3600 - 60, 1)],
  pickIndex,
  deadlineSec: 9 * 3600,
  usedDelays: false,
  relaxed: 0,
});

const html = (p: ArrivalPlan): string =>
  renderToStaticMarkup(React.createElement(ArrivalResults, { plan: p, deadlineText: '09:00', lineColor: () => '#8B5CF6', onOpen: () => undefined }));

const emptyHtml = (deadlineText: string): string =>
  renderToStaticMarkup(
    React.createElement(ArrivalResults, { plan: { options: [], pickIndex: -1, deadlineSec: 0, usedDelays: false, relaxed: 0 }, deadlineText, lineColor: () => '#8B5CF6', onOpen: () => undefined })
  );

describe('到着検索の結果が0件のとき', () => {
  it('列車がない時間(ダイヤを調べる前の安全策では 0:30〜3:59)の到着は、「この時間は、列車がありません」(出発側と同じ言葉)', () => {
    for (const t of ['00:30', '01:00', '03:59']) expect(emptyHtml(t)).toContain('この時間は、列車がありません');
  });

  it('終電ぎわ(0:00〜0:29)と、4:00 以降は、これまでの文', () => {
    expect(emptyHtml('00:20')).toContain('00:20 までに着く列車がありません');
    expect(emptyHtml('09:00')).toContain('09:00 までに着く列車がありません');
    expect(emptyHtml('09:00')).not.toContain('この時間は、列車がありません');
  });
});

describe('到着検索の結果', () => {
  it('「おすすめ」の印と、枠つきの特別なカードが無い', () => {
    for (const i of [0, 1, 2]) {
      const h = html(plan(i));
      expect(h).not.toContain('おすすめ');
      expect(h).not.toContain('border-2');
    }
  });

  it('出発の早い順に、全部同じ作りのカードで、おすすめの位置が変わっても並びは同じ', () => {
    const order = (h: string) => [...h.matchAll(/(\d{2}:\d{2}) <span[^>]*>→<\/span> (\d{2}:\d{2})/g)].map((m) => `${m[1]}-${m[2]}`);
    const a = order(html(plan(0)));
    expect(a).toEqual(['07:30-08:20', '07:50-08:40', '08:10-08:59']);
    expect(order(html(plan(1)))).toEqual(a);
    expect(order(html(plan(2)))).toEqual(a);
    // カードは3つとも、同じ文字の大きさ(最初のカードだけ大きい、をやめた)
    expect(html(plan(1)).match(/text-\[34px\]/g)).toBeNull();
    expect(html(plan(1)).match(/<button/g)).toHaveLength(3);
  });

  it('「余裕 ○分」は、残っている。5分より少ないときは黄色の札', () => {
    const h = html(plan(1));
    expect(h).toContain('余裕 40分');
    expect(h).toContain('余裕 20分');
    expect(h).toMatch(/bg-amber-100[^>]*>余裕 1分/);
  });

  it('間に合う便が無いときの文は、そのまま', () => {
    const empty: ArrivalPlan = { options: [], pickIndex: -1, deadlineSec: 9 * 3600, usedDelays: false, relaxed: 0 };
    expect(html(empty)).toContain('09:00 までに着く列車がありません');
  });
});
