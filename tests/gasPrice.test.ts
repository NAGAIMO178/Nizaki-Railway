// サーバー(gas/Code.gs)の、予約の金額の「上限」の検査。
// いちばん大事なのは、正しい予約を、1件も断らないこと。アプリの運賃表・特急料金・商品の価格で作った予約を、全部流して確かめる。
// 次に、水増しした金額(安い席なのに、大きな金額)が、断られること。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { MOCK_EQUIP_ITEMS } from '../src/data/mockData';
import { EXPRESS_TYPES, type ExpressKey, getExpressStations, getTripDistanceKm, loadExpressData } from '../src/utils/diaTimetable';
import { calculateFare } from '../src/utils/fare';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

let gas: Gas;
const read = <T,>(name: string): T => vm.runInContext(name, gas) as T;

beforeAll(() => {
  const ctx: Gas = {
    Logger: { log: () => undefined },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { formatDate: () => '2026/11/12 12:00:00' },
    ContentService: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  gas = ctx;
});

// ---- アプリの料金の決まり(src/components/ReservationTab.tsx の calculateTicketPrice と同じ) ----
const SEAT_TYPES = ['standard', 'reserved', 'green', 'premium', 'megu'] as const;
const appExpressFee = (type: ExpressKey, seatType: string): number => {
  if (type === 'ayami') return seatType === 'standard' ? 750 : seatType === 'reserved' ? 1150 : seatType === 'green' ? 2200 : 1150;
  if (type === 'nliner') return 1250;
  return seatType === 'megu' ? 2050 : 1250;
};
const seatNoFor = (count: number): string => (count >= 2 ? `自由席×${count}` : '自由席');
const DISH20_DISCOUNT = (prices: number[]) => (prices.length ? Math.ceil(Math.max(...prices) * 0.2) : 0);

interface AppOrderOpts {
  trainName: string;
  seatType: string;
  seatNo: string;
  ticketTotal: number;
  items: Array<{ id: string; quantity: number }>;
  itemCoupon: boolean;
  pointsUsedRatio: number; // 0〜1(合計のうち、N-POINTで払う割合)
}

// アプリが送る予約(合計金額は、N-POINTで払った分を引いた額。商品とクーポンの割引を含む)
const appOrder = (o: AppOrderOpts) => {
  const priceOf = (id: string) => MOCK_EQUIP_ITEMS.find((i) => i.id === id)!.price;
  const itemsTotal = o.items.reduce((s, i) => s + priceOf(i.id) * i.quantity, 0);
  const itemDiscount = o.itemCoupon ? DISH20_DISCOUNT(o.items.filter((i) => i.quantity > 0).map((i) => priceOf(i.id))) : 0;
  const gross = Math.max(0, o.ticketTotal + itemsTotal - itemDiscount);
  const pointsUsed = Math.floor(gross * o.pointsUsedRatio);
  return {
    orderId: 'EQ-TESTORDER01',
    trainName: o.trainName,
    carNo: 4,
    seatNo: o.seatNo,
    seatType: o.seatType,
    boardingStation: '東京駅',
    destinationStation: '大宮駅',
    departureTime: '10:00',
    arrivalTime: '11:00',
    reservedDate: '2099-01-01',
    totalPrice: gross - pointsUsed,
    ...(pointsUsed > 0 ? { pointsUsed } : {}),
    items: o.items.map((i) => ({ id: i.id, name: 'x', quantity: i.quantity, price: priceOf(i.id) })),
    itemDiscount,
  };
};

const ITEM_PATTERNS: Array<Array<{ id: string; quantity: number }>> = [
  [],
  [{ id: 'eq-04', quantity: 1 }],
  [{ id: 'eq-01', quantity: 9 }, { id: 'eq-05', quantity: 9 }, { id: 'eq-02', quantity: 2 }], // 20個(最大の注文)
  MOCK_EQUIP_ITEMS.map((i, n) => ({ id: i.id, quantity: n % 3 + 1 })),
];

describe('正しい予約は、1件も断らない(アプリの料金で作った予約を、全部流す)', () => {
  (Object.keys(EXPRESS_TYPES) as ExpressKey[]).forEach((type) => {
    it(`${EXPRESS_TYPES[type].label}: 全駅の組 × 席種 × 席の数 × クーポン × デリバリー(あり・なし・最大)× N-POINT払い`, async () => {
      const data = await loadExpressData(type);
      const stations = getExpressStations(data, EXPRESS_TYPES[type].typeName);
      expect(stations.length).toBeGreaterThan(5);
      const check = gas.checkOrderPrice as (o: unknown) => string | null;
      let checked = 0;
      const refused: string[] = [];
      for (const b of stations) {
        for (const d of stations) {
          if (b === d) continue;
          const dist = getTripDistanceKm(data, b, d);
          const fare = calculateFare(dist);
          for (const seatType of SEAT_TYPES) {
            for (const count of [1, 2, 3, 6]) {
              for (const coupon of [false, true]) {
                const express = Math.max(0, appExpressFee(type, seatType) - (coupon && type === 'ayami' && seatType === 'reserved' ? 300 : 0));
                const ticketTotal = (fare + express) * count;
                for (const items of ITEM_PATTERNS) {
                  for (const ratio of [0, 0.5, 1]) {
                    const o = appOrder({ trainName: `${EXPRESS_TYPES[type].label} 15号`, seatType, seatNo: seatNoFor(count), ticketTotal, items, itemCoupon: items.length > 0, pointsUsedRatio: ratio });
                    checked++;
                    const r = check(o);
                    if (r !== null && refused.length < 5) refused.push(`${b}→${d} ${seatType} ×${count} ${r}`);
                  }
                }
              }
            }
          }
        }
      }
      expect(refused).toEqual([]);
      expect(checked).toBeGreaterThan(5000);
    });
  });

  it('指定席の座席番号(1席・複数席)・席種が表にないもの・列車名が分からないもの・商品の更新(合算)も、断らない', () => {
    const check = gas.checkOrderPrice as (o: unknown) => string | null;
    const seats = ['4B', '4B,4D', '10A,10B,10C,10D,9A,9B'];
    seats.forEach((seatNo) => {
      const n = seatNo.split(',').length;
      expect(check(appOrder({ trainName: '特急めぐり 3号', seatType: 'megu', seatNo, ticketTotal: (1980 + 2050) * n, items: [{ id: 'eq-01', quantity: 1 }], itemCoupon: true, pointsUsedRatio: 0.3 }))).toBeNull();
    });
    expect(check(appOrder({ trainName: '特急あやみ 101号', seatType: 'premium', seatNo: '自由席', ticketTotal: 1000 + 1150, items: [], itemCoupon: false, pointsUsedRatio: 0 }))).toBeNull();
    expect(check(appOrder({ trainName: '(古い形の列車名)', seatType: 'reserved', seatNo: '自由席×2', ticketTotal: (3300 + 2200) * 2, items: [], itemCoupon: false, pointsUsedRatio: 0 }))).toBeNull();
    // デリバリーを何度も足した、合算の予約(商品が増えるたびに、合計が増える)
    let items: Array<{ id: string; quantity: number }> = [];
    for (let step = 1; step <= 5; step++) {
      items = [{ id: 'eq-02', quantity: step }, { id: 'eq-06', quantity: step }];
      expect(check(appOrder({ trainName: '特急Nライナー 5号', seatType: 'reserved', seatNo: '自由席', ticketTotal: 390 + 1250, items, itemCoupon: step % 2 === 0, pointsUsedRatio: 0.2 }))).toBeNull();
    }
  });

  it('運賃の最高の区分(3300円)は、アプリの運賃表の最高と同じ。実際の路線は、最高の区分に届かない', async () => {
    expect(read<number>('PRICE_FARE_MAX')).toBe(calculateFare(1e6));
    for (const type of Object.keys(EXPRESS_TYPES) as ExpressKey[]) {
      const data = await loadExpressData(type);
      const stations = getExpressStations(data, EXPRESS_TYPES[type].typeName);
      const max = Math.max(...stations.flatMap((b) => stations.map((d) => calculateFare(getTripDistanceKm(data, b, d)))));
      expect(max).toBeLessThanOrEqual(read<number>('PRICE_FARE_MAX'));
    }
  });
});

describe('サーバーの表が、アプリの値と、そろっている', () => {
  it('商品の価格の表は、アプリの商品(src/data/mockData.ts)と、同じ番号・同じ価格', () => {
    const table = read<Record<string, number>>('EQUIP_ITEM_PRICES');
    expect(Object.keys(table).sort()).toEqual(MOCK_EQUIP_ITEMS.map((i) => i.id).sort());
    MOCK_EQUIP_ITEMS.forEach((i) => expect(table[i.id], i.id).toBe(i.price));
  });

  it('特急料金の表は、予約画面(ReservationTab.tsx)の値と同じ(画面の値を書き換えたら、ここで気づく)', () => {
    const tab = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'ReservationTab.tsx'), 'utf-8');
    ['baseExpressFee = 750', 'baseExpressFee = 1150', 'baseExpressFee = 2200', 'baseExpressFee = 1250', 'baseExpressFee = 2050', 'expressDiscount = 300'].forEach((w) => expect(tab, w).toContain(w));
    const fee = gas.expressFeeMax as (t: string, s: string) => number;
    (Object.keys(EXPRESS_TYPES) as ExpressKey[]).forEach((type) => {
      SEAT_TYPES.forEach((seatType) => expect(fee(`${EXPRESS_TYPES[type].label} 1号`, seatType), `${type}/${seatType}`).toBe(appExpressFee(type, seatType)));
    });
    expect(fee('特急(Nライナー) 1号', 'reserved')).toBe(1250);
    expect(fee('', 'reserved')).toBe(read<number>('EXPRESS_FEE_UNKNOWN_TRAIN'));
    expect(read<number>('EXPRESS_FEE_UNKNOWN_TRAIN')).toBe(Math.max(...(Object.keys(EXPRESS_TYPES) as ExpressKey[]).flatMap((t) => SEAT_TYPES.map((s) => appExpressFee(t, s)))));
  });

  it('座席の数の上限は、アプリの上限と同じ(6席)', () => {
    expect(read<number>('MAX_SEATS')).toBe(6);
  });
});

describe('水増しした金額は、断る', () => {
  const check = (o: unknown): string | null => gas.checkOrderPrice(o);
  const base = (over: Record<string, unknown> = {}) => ({
    orderId: 'EQ-TESTORDER02', trainName: '特急あやみ 101号', seatNo: '自由席', seatType: 'reserved', totalPrice: 1540, items: [], itemDiscount: 0, ...over,
  });

  it('安い席(あやみ・指定席・1席)に、大きな金額を送ると、断る。上限ちょうど(最高の運賃+特急料金)は通る', () => {
    expect(check(base({ totalPrice: 3300 + 1150 }))).toBeNull();
    expect(check(base({ totalPrice: 3300 + 1150 + 1 }))).toMatch(/予約内容/);
    expect(check(base({ totalPrice: 50000 }))).toMatch(/予約内容/);
    expect(check(base({ totalPrice: 99999 }))).toMatch(/予約内容/);
  });

  it('席の数だけ、上限が増える(6席で、上限は6倍)', () => {
    expect(check(base({ seatNo: '自由席×6', totalPrice: (3300 + 1150) * 6 }))).toBeNull();
    expect(check(base({ seatNo: '自由席×6', totalPrice: (3300 + 1150) * 6 + 1 }))).toMatch(/予約内容/);
    expect(check(base({ seatNo: '4B,4D', totalPrice: (3300 + 1150) * 2 + 1 }))).toMatch(/予約内容/);
  });

  it('席の数を少なく申告して、金額を大きくしても、断る', () => {
    expect(check(base({ seatNo: '4B', totalPrice: 20000 }))).toMatch(/予約内容/);
  });

  it('N-POINTで払った分(pointsUsed)を足しても、上限を超えたら、断る(払った分を隠して、金額を小さく見せられない)', () => {
    expect(check(base({ totalPrice: 100, pointsUsed: 4350 }))).toBeNull();
    expect(check(base({ totalPrice: 100, pointsUsed: 4351 }))).toMatch(/予約内容/);
  });

  it('商品: 表の価格で数える。表にない商品・価格が違う商品は、断る', () => {
    const ok = base({ totalPrice: 4450 + 2850, items: [{ id: 'eq-01', name: 'x', quantity: 1, price: 2850 }] });
    expect(check(ok)).toBeNull();
    expect(check({ ...ok, totalPrice: 4450 + 2850 + 1 })).toMatch(/予約内容/);
    expect(check({ ...ok, items: [{ id: 'eq-99', name: 'x', quantity: 1, price: 2850 }] })).toMatch(/予約内容/);
    expect(check({ ...ok, items: [{ name: 'x', quantity: 1, price: 2850 }] })).toMatch(/予約内容/);
    expect(check({ ...ok, items: [{ id: 'eq-01', name: 'x', quantity: 1, price: 10 }] })).toMatch(/予約内容/);
    expect(check({ ...ok, items: [{ id: 'eq-01', name: 'x', quantity: 1, price: 99999 }], totalPrice: 5000 })).toMatch(/予約内容/);
  });

  it('商品の個数を多く申告して、合計を大きくしても、断る(個数は、表の価格 × 個数で、上限に足される)', () => {
    const items = [{ id: 'eq-06', name: 'x', quantity: 9, price: 450 }];
    expect(check(base({ totalPrice: 4450 + 450 * 9, items }))).toBeNull();
    expect(check(base({ totalPrice: 4450 + 450 * 9 + 1, items }))).toMatch(/予約内容/);
  });

  it('列車名・席種を偽っても、上限は、その申告の特急料金まで(あやみ自由席は750円まで)', () => {
    expect(check(base({ seatType: 'standard', totalPrice: 3300 + 750 }))).toBeNull();
    expect(check(base({ seatType: 'standard', totalPrice: 3300 + 750 + 1 }))).toMatch(/予約内容/);
  });
});

describe('予約の登録の入口(handleCreateReservation)', () => {
  const FIXED = (r: { status?: string; code?: string }) => r;
  const header = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻'];

  const run = (order: Record<string, unknown>, award: boolean) => {
    const grid: unknown[][] = [[...header]];
    const sheet = {
      getDataRange: () => ({ getValues: () => grid.map((r) => [...r]) }),
      appendRow: (r: unknown[]) => void grid.push([...r]),
      getLastRow: () => grid.length,
      getLastColumn: () => grid[0].length,
      getRange: (row: number, col: number) => ({
        getValues: () => [grid[row - 1].slice(col - 1, col)],
        setValue: (v: unknown) => void (grid[row - 1][col - 1] = v),
        setValues: (vs: unknown[][]) => vs.forEach((r, i) => r.forEach((v, j) => void (grid[row - 1 + i][col - 1 + j] = v))),
        setNumberFormat: () => undefined,
      }),
    };
    gas.verifySessionToken = () => 'M1';
    gas.findMemberById = () => ({ memberId: 'M1', lineUserId: '' });
    gas.getOrCreateReservationsSheet = () => sheet;
    gas.createJsonResponse = (d: unknown) => d;
    gas.getOrCreateSheetWithHeaders = () => ({ getDataRange: () => ({ getValues: () => [['日時', '会員ID', '種別', '名札', 'ポイント', 'タイトル'], ['t', 'M1', 'welcome', 'welcome', 0, 'x']] }), appendRow: () => undefined });
    return { res: FIXED(gas.handleCreateReservation('t', order, award)), grid };
  };

  const good = { orderId: 'EQ-TESTORDER03', trainName: '特急あやみ 101号', carNo: 1, seatNo: '自由席', seatType: 'reserved', boardingStation: '東京駅', destinationStation: '大宮駅', departureTime: '10:00', arrivalTime: '11:00', reservedDate: '2099-01-01', totalPrice: 1540, items: [], itemDiscount: 0 };

  it('ふつうの予約は通る。水増しした予約は、断られて、台帳に書かれない', () => {
    expect(run(good, true).res.status).toBe('success');
    const bad = run({ ...good, totalPrice: 60000 }, true);
    expect(bad.res).toMatchObject({ status: 'error', code: 'order_limit' });
    expect(bad.grid.length).toBe(1);
  });

  it('ポイントが付かない呼び出し(公開前のアプリ・同期できなかったとき)は、明細を送らないので、これまでの上限だけ(誤って断らない)', () => {
    expect(run({ ...good, totalPrice: 8000 }, false).res.status).toBe('success'); // 商品入りの合計でも、断らない
  });
});
