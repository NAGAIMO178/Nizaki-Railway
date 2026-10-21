import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { ActiveOrder, EquipItem } from '../src/types';
import {
  MAX_SEATS,
  deliveryBySeat,
  effectiveAllocation,
  formatSeats,
  freeSeatNo,
  hasSeatList,
  seatCountOf,
  seatDisplayName,
  seatLabel,
  seatTitle,
  splitSeats,
} from '../src/utils/seatUtils';
import { pickDefaultSeat, sortSeats, toggleSeat } from '../src/utils/seatPick';

const item = (id: string, name: string) => ({ id, name, price: 800 }) as EquipItem;

describe('座席番号(複数席)の読み書き', () => {
  it('1席は、これまでの文字のまま。席の数は1', () => {
    expect(splitSeats('4B')).toEqual(['4B']);
    expect(seatCountOf('4B')).toBe(1);
    expect(formatSeats('4B')).toBe('4B');
    expect(formatSeats('自由席')).toBe('自由席');
    expect(seatLabel({ carNo: 3, seatType: 'reserved', seatNo: '5A' })).toBe('3号車 普通指定席 5A');
    expect(seatTitle(3, '5A')).toBe('3号車 5A席');
    expect(hasSeatList('4B')).toBe(false);
  });

  it('複数席は、カンマで分け、「・」でつないで見せる', () => {
    expect(splitSeats('4B,4C,4D')).toEqual(['4B', '4C', '4D']);
    expect(seatCountOf('4B,4C,4D')).toBe(3);
    expect(formatSeats('4B,4C')).toBe('4B・4C');
    expect(hasSeatList('4B,4C')).toBe(true);
    expect(seatLabel({ carNo: 4, seatType: 'reserved', seatNo: '4B,4C' })).toBe('4号車 普通指定席 4B・4C');
    expect(seatTitle(4, '4B,4C')).toBe('4号車 4B・4C席');
  });

  it('空の席は数えない', () => {
    expect(splitSeats('4B,,4C,')).toEqual(['4B', '4C']);
  });

  it('自由席の人数は「自由席×3」。1人は「自由席」のまま。6人まで', () => {
    expect(freeSeatNo(1)).toBe('自由席');
    expect(freeSeatNo(3)).toBe('自由席×3');
    expect(freeSeatNo(99)).toBe(`自由席×${MAX_SEATS}`);
    expect(splitSeats('自由席×3')).toEqual(['自由席1', '自由席2', '自由席3']);
    expect(seatCountOf('自由席×3')).toBe(3);
    expect(formatSeats('自由席×3')).toBe('3人');
    expect(hasSeatList('自由席×3')).toBe(false);
    expect(seatDisplayName('自由席2')).toBe('2人目');
    expect(seatDisplayName('4B')).toBe('4B');
    expect(seatTitle(6, '自由席×3')).toBe('6号車 3人');
  });
});

describe('サーバーとの取り決め', () => {
  const ctx: Record<string, unknown> = { PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8'), ctx);

  it('席の読み方は、gas/Code.gs の parseSeats と同じ', () => {
    const parse = ctx.parseSeats as (v: string) => string[];
    for (const text of ['4B', '4B,4C', '4B,,4C,', '10A,10B,10C,10D,9A,9B', '自由席', '自由席×3', '自由席×1', '自由席×9']) {
      expect([...parse(text)]).toEqual(splitSeats(text));
    }
  });

  it('席の数の上限は、サーバー(MAX_SEATS)と同じ', () => {
    expect(vm.runInContext('MAX_SEATS', ctx)).toBe(MAX_SEATS);
  });
});

describe('座席の選び方', () => {
  it('1席のモードは、押した席に置き換わる(これまでと同じ)', () => {
    expect(toggleSeat(['4B'], '5A', 1)).toEqual(['5A']);
    expect(toggleSeat(['4B'], '4B', 1)).toEqual(['4B']);
  });

  it('複数席のモードは、押すと選択・もう一度押すと解除', () => {
    expect(toggleSeat(['4B'], '4C', 6)).toEqual(['4B', '4C']);
    expect(toggleSeat(['4B', '4C'], '4B', 6)).toEqual(['4C']);
    expect(toggleSeat(['4B'], '4B', 6)).toEqual([]);
  });

  it('6席でいっぱいのとき、7席目を押すと、いちばん前に選んだ席が外れる', () => {
    const six = ['1A', '1B', '1C', '1D', '2A', '2B'];
    expect(toggleSeat(six, '2C', 6)).toEqual(['1B', '1C', '1D', '2A', '2B', '2C']);
  });

  it('既定の席: 4B(特別車は 3A)。埋まっていれば、最初の空席。満席なら空', () => {
    expect(pickDefaultSeat([], false)).toBe('4B');
    expect(pickDefaultSeat([], true)).toBe('3A');
    expect(pickDefaultSeat(['4B', '1A', '1B'], false)).toBe('1C');
    const all = Array.from({ length: 10 }, (_, r) => ['A', 'B', 'C', 'D'].map((c) => `${r + 1}${c}`)).flat();
    expect(pickDefaultSeat(all, false)).toBe('');
  });

  it('席は、前の列から、A→D の順に並べる', () => {
    expect(sortSeats(['5B', '4C', '4A', '10A', '4B'], false)).toEqual(['4A', '4B', '4C', '5B', '10A']);
    expect(sortSeats(['3C', '3A', '2B'], true)).toEqual(['2B', '3A', '3C']);
  });
});

describe('デリバリーを席ごとに届ける', () => {
  const seats = ['3A', '3B', '3C'];

  it('指定のない分は先頭の席へ。指定した分は、その席へ', () => {
    expect(effectiveAllocation(3, seats)).toEqual({ '3A': 3 });
    expect(effectiveAllocation(3, seats, { '3B': 1, '3C': 1 })).toEqual({ '3B': 1, '3C': 1, '3A': 1 });
  });

  it('注文の個数を超える指定・この予約にない席・おかしな数は、使わない', () => {
    expect(effectiveAllocation(2, seats, { '3B': 5 })).toEqual({ '3A': 2 });
    expect(effectiveAllocation(2, seats, { '9Z': 1 })).toEqual({ '3A': 2 });
    expect(effectiveAllocation(2, seats, { '3B': -1, '3C': 1.5 })).toEqual({ '3C': 1, '3A': 1 });
  });

  it('席ごとの届け先の一覧(商品がある席だけ、席の並び順)', () => {
    const order: Pick<ActiveOrder, 'seatNo' | 'items' | 'itemSeats'> = {
      seatNo: '3A,3B,3C',
      items: [
        { item: item('a', '駅弁'), quantity: 3 },
        { item: item('b', 'お茶'), quantity: 1 },
      ],
      itemSeats: { a: { '3C': 2 }, b: { '3B': 1 } },
    };
    expect(deliveryBySeat(order)).toEqual([
      { seat: '3A', items: [{ name: '駅弁', quantity: 1 }] },
      { seat: '3B', items: [{ name: 'お茶', quantity: 1 }] },
      { seat: '3C', items: [{ name: '駅弁', quantity: 2 }] },
    ]);
  });

  it('割り振りがなければ、すべて先頭の席', () => {
    expect(deliveryBySeat({ seatNo: '3A,3B', items: [{ item: item('a', '駅弁'), quantity: 2 }] })).toEqual([
      { seat: '3A', items: [{ name: '駅弁', quantity: 2 }] },
    ]);
  });
});
