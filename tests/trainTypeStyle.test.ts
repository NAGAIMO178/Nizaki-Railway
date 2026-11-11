// 種別の色・帯の字の表(trainTypeStyle.ts)
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bandLabelOf, typeStyleOf } from '../src/utils/trainTypeStyle';
import { displayType } from '../src/utils/diaTimetable';
import { trainRank } from '../src/utils/trainIconLayout';
import { PIN_WIDTH, TrainPinBundle } from '../src/components/TrainPin';
import { TrainDetailV2 } from '../src/components/TrainDetailV2';
import type { LiveTrainPos } from '../src/components/TrainLocationTab';

describe('帯の字(種別の略称。帯専用の表)', () => {
  it('各=各停・急=急行・快=快速・区快=区間快速・特快=特別快速・通快=通勤特快・あやみ・めぐり・N', () => {
    expect(bandLabelOf('各停')).toBe('各');
    expect(bandLabelOf('普通')).toBe('各');
    expect(bandLabelOf('急行')).toBe('急');
    expect(bandLabelOf('快速')).toBe('快');
    expect(bandLabelOf('区間快速')).toBe('区快');
    expect(bandLabelOf('特別快速')).toBe('特快');
    expect(bandLabelOf('通勤特快')).toBe('通快');
    expect(bandLabelOf('特急あやみ')).toBe('あやみ');
    expect(bandLabelOf('特急めぐり')).toBe('めぐり');
    expect(bandLabelOf('特急(Nライナー)')).toBe('N');
    expect(bandLabelOf('特急')).toBe('特'); // 宇都宮線の特急
  });

  it('帯の字は、3文字まで(9pxで、幅38pxに収まる)', () => {
    const dia = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', 'master-ut.json'), 'utf-8')) as Record<string, { types: [string, string, number][] }>;
    const names = new Set(Object.values(dia).flatMap((m) => m.types.map((t) => displayType(t[0]))));
    expect(names.size).toBeGreaterThanOrEqual(9);
    for (const n of names) expect(bandLabelOf(n).length, n).toBeLessThanOrEqual(3);
  });

  it('master の types の2番目の値(時刻表の凡例などの略称)は、別物。帯用の表で、置き換えていない', () => {
    // 凡例の記号は 特・特快・通快・快・区快・急・各(timetableLegend.ts)。帯は、有料特急だけが違う(あやみ・めぐり・N)
    expect(bandLabelOf('特急あやみ')).not.toBe('特');
    const dia = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', 'master.json'), 'utf-8')) as Record<string, { types: [string, string, number][] }>;
    const abbrs = new Set(Object.values(dia).flatMap((m) => m.types.map((t) => t[1])));
    expect([...abbrs].sort()).toEqual(['区快', '各', '急', '快', '特', '特快', '通快'].sort());
  });
});

describe('種別の色(画面ごとにそろえた、1か所の表)', () => {
  it('各停=灰・快速=青・区間快速=緑・急行=赤・通勤特快=赤・特別快速=黄・有料特急=紫', () => {
    const hex = (t: string) => typeStyleOf(t).hex;
    expect(hex('各停')).toBe('#64748B');
    expect(hex('快速')).toBe('#0284C7');
    expect(hex('区間快速')).toBe('#059669');
    expect(hex('急行')).toBe('#E11D48');
    expect(hex('通勤特快')).toBe('#E11D48');
    expect(hex('特別快速')).toBe('#F59E0B');
    expect(hex('特急あやみ')).toBe('#6D28D9');
    expect(hex('特急(Nライナー)')).toBe('#6D28D9');
    expect(hex('特急めぐり')).toBe('#7C3AED');
  });

  it('区間快速は、快速と別の色(緑と青)。急行と通勤特快は、同じ赤', () => {
    expect(typeStyleOf('区間快速').solid).toBe('bg-emerald-600');
    expect(typeStyleOf('区間快速').soft).toContain('emerald');
    expect(typeStyleOf('快速').solid).toBe('bg-sky-600');
    expect(typeStyleOf('急行').solid).toBe(typeStyleOf('通勤特快').solid);
    expect(typeStyleOf('急行').soft).toBe(typeStyleOf('通勤特快').soft);
    expect(typeStyleOf('急行').soft).toContain('rose');
    expect(typeStyleOf('急行').soft).not.toContain('orange'); // 発車案内の急行は、橙ではなく赤
  });

  it('ダイヤの種別は、すべて、知っている種別(各停の灰に落ちるのは、各停・普通だけ)', () => {
    const dia = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', 'master-ut.json'), 'utf-8')) as Record<string, { types: [string, string, number][] }>;
    for (const m of Object.values(dia)) {
      for (const t of m.types) {
        const n = displayType(t[0]);
        if (n !== '各停' && n !== '普通') expect(typeStyleOf(n).hex, n).not.toBe('#64748B');
      }
    }
  });
});

describe('優等な順(束ねた札の先頭は、いちばん優等)', () => {
  it('特急 > 通勤特快・特別快速 > 急行・快速 > 区間快速 > 各停', () => {
    const order = ['特急あやみ', '通勤特快', '特別快速', '急行', '快速', '区間快速', '各停'];
    const ranks = order.map(trainRank);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i - 1], `${order[i - 1]} ≥ ${order[i]}`).toBeGreaterThanOrEqual(ranks[i]);
    expect(trainRank('区間快速')).toBeLessThan(trainRank('快速'));
    expect(trainRank('各停')).toBeLessThan(trainRank('区間快速'));
  });
});

const live = (over: Partial<LiveTrainPos> & { id: string; runNo: string; trainType: string }): LiveTrainPos => ({
  lineId: 'tsuchiura',
  direction: 2,
  destination: '土浦',
  carCount: 8,
  stationId: 'TC09',
  isBetween: true,
  isStopStation: true,
  delayMinutes: 0,
  crowdNow: 1,
  timetable: [],
  trainNo: over.id,
  typeName: over.trainType,
  paid: false,
  rows: [{ stationName: '土浦', pass: false, scheduledTime: '08:18', estimatedTime: '08:18', platform: '5' }],
  ...over,
});
const pinOf = (label: string) => ({ label, color: '#64748B', direction: 2 as const, delayMinutes: 0, passing: false, crowd: 1 });

describe('束ねた札', () => {
  it('札の枚数は、先頭1枚 + 後ろにずらす本数−1枚(最大5枚)。数字は出さない。大きさは1本と同じ幅', () => {
    for (const [n, want] of [[3, 3], [4, 4], [6, 6], [9, 6]] as const) {
      const html = renderToStaticMarkup(React.createElement(TrainPinBundle, { pins: Array.from({ length: n }, () => pinOf('各')) }));
      expect((html.match(/class="pbody|overflow-hidden bg-white/g) ?? []).length, `n=${n}`).toBe(want);
      expect(html).toContain(`width:${PIN_WIDTH}px`);
      expect(html).not.toMatch(/>\s*\d+\s*</); // 本数の数字は出さない
    }
  });
});

describe('束ねた札のシート: 列車ごとのカードを、縦に並べる', () => {
  it('重なっている列車すべてが、カードで出る。先頭のカードだけ「停車駅情報」を開き、ほかは閉じる。カードは、自分でスクロールしない', () => {
    const trains = [live({ id: 'a', runNo: '33K', trainType: '通勤特快' }), live({ id: 'b', runNo: '36K', trainType: '快速' }), live({ id: 'c', runNo: '10K', trainType: '各停' })];
    const html = trains.map((t, i) => renderToStaticMarkup(React.createElement(TrainDetailV2, { train: t, lineName: '土浦線', embedded: true, collapsibleStops: true, stopsDefaultOpen: i === 0 }))).join('');
    for (const t of trains) expect(html).toContain(`運行番号 ${t.runNo}`);
    expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('max-h-[62vh]');
    // 1本のシートは、これまでどおり(自分でスクロールする)
    expect(renderToStaticMarkup(React.createElement(TrainDetailV2, { train: trains[0], lineName: '土浦線' }))).toContain('max-h-[62vh]');
  });
});

describe('束ねた札の、浮かせる札(通過・+n分)', () => {
  const pin = (direction: 1 | 2) => ({ label: 'あやみ', color: '#6D28D9', direction, delayMinutes: 5, passing: true, crowd: 1 });
  it('先端が下(下り)は、本体の上へ 5px のすき間。先端が上(上り)は、後ろの札のはみ出しを避けて、下へ 5px + ずらしの分', () => {
    const down = renderToStaticMarkup(React.createElement(TrainPinBundle, { pins: [pin(1), pin(1), pin(1)] }));
    expect(down).toContain('margin-bottom:5px');
    const up = renderToStaticMarkup(React.createElement(TrainPinBundle, { pins: [pin(2), pin(2), pin(2), pin(2)] }));
    expect(up).toContain(`margin-top:${5 + 4 * 3}px`); // 4本 → 後ろに3枚 → 4px×3 離す
  });
});
