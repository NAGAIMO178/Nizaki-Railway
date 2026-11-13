// 高宮線(非表示)の有料特急「すみかぜ」の予約: 車両・座席・料金・サーバーの検査・予約から乗車券まで・見せないあいだは何も変わらないこと。
// 仕様(オーナー提供): 6両・368席(普通車5両 320席 + 特別車1両 48席)・全席指定・全区間一律(普通車 1,250円・特別車 2,200円)。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUMIKAZE, SUMIKAZE_NORMAL_SEATS, SUMIKAZE_SPECIAL_SEATS, SUMIKAZE_TOTAL_SEATS, sumikazeFee } from '../src/utils/sumikaze';
import { EXPRESS_TYPES, findExpressTrips, getExpressStations, getTripDistanceKm, loadExpressData, visibleExpressKeys } from '../src/utils/diaTimetable';
import { calculateFare } from '../src/utils/fare';
import { canOrderItem, canUseDelivery, formatSeats, getSeatClassLabel, getSeatClassRibbonName, generateOccupiedSeats, seatLabel, seatTitle } from '../src/utils/seatUtils';
import { pickDefaultSeat, sortSeats } from '../src/utils/seatPick';
import { legShowsCrowd } from '../src/utils/crowdShown';
import { MOCK_EQUIP_ITEMS } from '../src/data/mockData';
import { SeatSelectionModal } from '../src/components/SeatSelectionModal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.resolve(root, ...p), 'utf-8');

describe('すみかぜの決めごと(sumikaze.ts)', () => {
  it('6両・368席(普通車5両 320席 + 特別車1両 48席)・特別車は1号車・普通車は2〜6号車', () => {
    expect(SUMIKAZE.cars).toBe(6);
    expect(SUMIKAZE.specialCar).toBe(1);
    expect([...SUMIKAZE.normalCars]).toEqual([2, 3, 4, 5, 6]);
    expect(SUMIKAZE_NORMAL_SEATS).toBe(64);
    expect(SUMIKAZE_SPECIAL_SEATS).toBe(48);
    expect(SUMIKAZE_NORMAL_SEATS * SUMIKAZE.normalCars.length).toBe(320);
    expect(SUMIKAZE_TOTAL_SEATS).toBe(368);
    expect(SUMIKAZE.normalCars.length + 1).toBe(SUMIKAZE.cars);
  });

  it('特急料金: 普通車指定席 1,250円・特別車 2,200円(全区間一律。自由席は、ない)', () => {
    expect(sumikazeFee('reserved')).toBe(1250);
    expect(sumikazeFee('special')).toBe(2200);
    expect(sumikazeFee('standard')).toBe(1250);
  });
});

describe('座席表(座席選択の画面)', () => {
  const render = (over: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(SeatSelectionModal, {
        isOpen: true,
        onClose: () => undefined,
        trainName: '特急すみかぜ 1号',
        departureTime: '10:00',
        boardingStation: '大宮駅',
        destinationStation: '高根沢駅',
        basePrice: 3000,
        onConfirmSeat: () => undefined,
        ...over,
      })
    );
  const seatCells = (html: string): string[] => [...html.matchAll(/>(\d{1,2}[A-D])</g)].map((m) => m[1]);

  it('特別車(1号車): 1+2列(A・B・C)× 16列 = 48席。号車は 1号車だけ', () => {
    const html = render({ expressType: 'sumikaze', initialSeatType: 'special' });
    const cells = seatCells(html);
    expect(cells).toHaveLength(48);
    expect(new Set(cells.map((c) => c.slice(-1)))).toEqual(new Set(['A', 'B', 'C']));
    expect(Math.max(...cells.map((c) => parseInt(c, 10)))).toBe(16);
    expect(html).toContain('1号車 (特別車)');
    expect(html).toContain('特別車');
  });

  it('普通車(2〜6号車): 2+2列(A〜D)× 16列 = 64席。号車は 2〜6号車', () => {
    const html = render({ expressType: 'sumikaze', initialSeatType: 'reserved' });
    const cells = seatCells(html);
    expect(cells).toHaveLength(64);
    expect(new Set(cells.map((c) => c.slice(-1)))).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(Math.max(...cells.map((c) => parseInt(c, 10)))).toBe(16);
    expect(html).toContain('2〜6号車 (普通車)');
    SUMIKAZE.normalCars.forEach((c) => expect(html).toContain(`${c}号車`));
    expect(html).not.toContain('7号車');
  });

  it('既存の特急の座席表は、そのまま(あやみ・めぐり: 普通車 10列×4 = 40席・特別車 8列×3 = 24席)', () => {
    expect(seatCells(render({ expressType: 'ayami', initialSeatType: 'reserved' }))).toHaveLength(40);
    expect(seatCells(render({ expressType: 'ayami', initialSeatType: 'green' }))).toHaveLength(24);
    expect(seatCells(render({ expressType: 'meguri', initialSeatType: 'megu' }))).toHaveLength(24);
    expect(seatCells(render({ expressType: 'nliner', initialSeatType: 'reserved' }))).toHaveLength(40);
  });

  it('埋まっている席: すみかぜは 16列の中から決まり(同じ日・同じ列車・同じ号車なら同じ)、既存の特急の決め方は、変えていない', () => {
    const a = generateOccupiedSeats('2026-11-13', 'sumikaze_特急すみかぜ 1号', 3, false, SUMIKAZE.normalRows);
    expect(a).toEqual(generateOccupiedSeats('2026-11-13', 'sumikaze_特急すみかぜ 1号', 3, false, SUMIKAZE.normalRows));
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThan(SUMIKAZE_NORMAL_SEATS);
    a.forEach((s) => expect(s).toMatch(/^(1[0-6]|[1-9])[A-D]$/));
    // 列の数を渡さなければ、これまでどおり(普通車10列・特別車8列)
    generateOccupiedSeats('2026-11-13', 'ayami_x', 2, false).forEach((s) => expect(parseInt(s, 10)).toBeLessThanOrEqual(10));
    generateOccupiedSeats('2026-11-13', 'ayami_x', 1, true).forEach((s) => expect(parseInt(s, 10)).toBeLessThanOrEqual(8));
  });

  it('初期の席: 既定席(特別車 3A・普通車 4B)が埋まっていれば、その号車の最初の空席。満席なら選ばない(16列ぶん探す)', () => {
    expect(pickDefaultSeat([], true, 16)).toBe('3A');
    expect(pickDefaultSeat([], false, 16)).toBe('4B');
    const allNormal = Array.from({ length: 16 }, (_, r) => ['A', 'B', 'C', 'D'].map((c) => `${r + 1}${c}`)).flat();
    expect(pickDefaultSeat(allNormal, false, 16)).toBe('');
    expect(pickDefaultSeat(allNormal.filter((s) => s !== '16D'), false, 16)).toBe('16D'); // 最後の列まで探す
    const allSpecial = Array.from({ length: 16 }, (_, r) => ['A', 'B', 'C'].map((c) => `${r + 1}${c}`)).flat();
    expect(pickDefaultSeat(allSpecial.filter((s) => s !== '16C'), true, 16)).toBe('16C');
    // 列の数を渡さなければ、これまでどおり
    expect(pickDefaultSeat(allNormal, false)).toBe('');
  });

  it('席番号: 「列+席」(4B・16D)。複数席は、前の列から並べる。台帳・サーバーの書式(1〜2桁+A〜D)に合う', () => {
    expect(sortSeats(['16D', '2A', '10B', '2C'], false)).toEqual(['2A', '2C', '10B', '16D']);
    const pattern = new RegExp(vm.runInNewContext(`(${read('gas', 'Code.gs').match(/const STRICT_SEAT_PATTERN = (\/.*\/);/)![1]})`).source);
    for (let r = 1; r <= 16; r++) for (const c of ['A', 'B', 'C', 'D']) expect(`${r}${c}`).toMatch(pattern);
  });
});

describe('席種の表示(特別車)', () => {
  it('名前は「特別車」。予約カードの帯・履歴・QR・検札の見出しにも、その名前が出る', () => {
    expect(getSeatClassLabel('special')).toBe('特別車');
    expect(getSeatClassRibbonName('special')).toBe('特別車');
    expect(getSeatClassLabel('reserved')).toBe('普通指定席');
    expect(seatLabel({ carNo: 1, seatType: 'special', seatNo: '3A,3B' })).toBe('1号車 特別車 3A・3B');
    expect(seatTitle(1, '3A')).toBe('1号車 3A席');
    expect(formatSeats('12D')).toBe('12D');
  });

  it('車内デリバリー: めぐシートだけ。すみかぜ(特別車も普通車指定席も)は、使えない・商品も頼めない', () => {
    expect(canUseDelivery('special')).toBe(false);
    expect(canUseDelivery('reserved')).toBe(false);
    expect(canUseDelivery('megu')).toBe(true);
    const meguOnly = MOCK_EQUIP_ITEMS.filter((i) => i.onlySeatTypes?.includes('megu'));
    expect(meguOnly.length).toBeGreaterThan(0);
    meguOnly.forEach((i) => {
      expect(canOrderItem(i, 'special')).toBe(false);
      expect(canOrderItem(i, 'reserved')).toBe(false);
    });
  });

  it('混雑: すみかぜは全席指定なので、混雑(座れる・混んでいる)を出さない', () => {
    expect(legShowsCrowd({ typeName: EXPRESS_TYPES.sumikaze.typeName, crowd: 3 })).toBe(false);
    expect(legShowsCrowd({ typeName: EXPRESS_TYPES.ayami.typeName, crowd: 3 })).toBe(true); // あやみは、これまでどおり
  });
});

describe('見せないあいだ(高宮線のスイッチが切れているとき)', () => {
  it('予約できる特急は、あやみ・Nライナー・めぐりの3つだけ。すみかぜは、画面に出ない', async () => {
    expect(visibleExpressKeys()).toEqual(['ayami', 'nliner', 'meguri']);
    const { ReservationTab } = await import('../src/components/ReservationTab');
    const html = renderToStaticMarkup(
      React.createElement(ReservationTab, { activeOrder: null, onOpenDeliveryCatalog: () => undefined, onConfirmOrder: () => undefined, onCancelOrder: () => undefined })
    );
    expect(html).not.toContain('すみかぜ');
    expect(html).toContain('grid-cols-3');
  });
});

describe('スイッチを入れたとき(このテストの中だけ)', () => {
  let tab: typeof import('../src/components/ReservationTab');
  let dia: typeof import('../src/utils/diaTimetable');
  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('../src/utils/tkLine', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/utils/tkLine')>()), isTkLaunched: () => true, visibleLineCodes: (codes: string[]) => codes }));
    tab = await import('../src/components/ReservationTab');
    dia = await import('../src/utils/diaTimetable');
  });

  it('予約画面の特急の切り替えに「すみかぜ」が出る(4つ)', () => {
    expect(dia.visibleExpressKeys()).toEqual(['ayami', 'nliner', 'meguri', 'sumikaze']);
    const html = renderToStaticMarkup(
      React.createElement(tab.ReservationTab, { activeOrder: null, onOpenDeliveryCatalog: () => undefined, onConfirmOrder: () => undefined, onCancelOrder: () => undefined })
    );
    expect(html).toContain('すみかぜ');
    expect(html).toContain('grid-cols-4');
  });

  it('列車: 特急すみかぜ N号(下りは奇数・上りは偶数)。列車名の頭が、ダイヤの種別名と、サーバーの料金表の頭に一致する', async () => {
    const data = await dia.loadExpressData('sumikaze');
    expect(EXPRESS_TYPES.sumikaze.typeName).toBe('特急すみかぜ');
    expect(data.master.types.some((t) => t[0] === EXPRESS_TYPES.sumikaze.typeName && t[2] === 1)).toBe(true); // 有料(master の3つ目の値 1)
    const stops = dia.getExpressStations(data, EXPRESS_TYPES.sumikaze.typeName);
    expect(stops).toEqual(['大宮', '古賀', '宇都宮', '高根沢']); // どの列車かが停まる駅(宇都宮〜高根沢だけの列車も、大宮〜高根沢の列車もある)
    const down = dia.findExpressTrips(data, EXPRESS_TYPES.sumikaze.typeName, '大宮', '高根沢');
    expect(down.length).toBeGreaterThan(3);
    down.forEach((t) => {
      expect(t.trainName).toMatch(/^特急すみかぜ \d+号$/);
      expect(t.directionLabel).toBe('下り');
      expect(read('gas', 'Code.gs')).toContain(`prefix: '${t.trainName.split(' ')[0]}'`);
    });
    const short = dia.findExpressTrips(data, EXPRESS_TYPES.sumikaze.typeName, '宇都宮', '高根沢');
    expect(short.length).toBeGreaterThan(down.length); // 宇都宮〜高根沢は、短い区間の列車も乗れる
    expect(dia.findExpressTrips(data, EXPRESS_TYPES.sumikaze.typeName, '高根沢', '大宮')[0].directionLabel).toBe('上り');
  });
});

// ---- サーバー(gas/Code.gs) ----
const source = read('gas', 'Code.gs');
let gas: Gas;
const readGas = <T,>(name: string): T => vm.runInContext(name, gas) as T;

const loadGas = (): Gas => {
  const props = new Map<string, string>();
  const ctx: Gas = {
    Logger: { log: () => undefined },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: {
      formatDate: (d: Date, _tz: string, pattern: string) => {
        const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const p2 = (n: number) => String(n).padStart(2, '0');
        const date = `${j.getUTCFullYear()}-${p2(j.getUTCMonth() + 1)}-${p2(j.getUTCDate())}`;
        const time = `${p2(j.getUTCHours())}:${p2(j.getUTCMinutes())}`;
        return pattern === 'yyyy-MM-dd' ? date : pattern === 'HH:mm' ? time : `${date.replace(/-/g, '/')} ${time}:${p2(j.getUTCSeconds())}`;
      },
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (value: string, key: string) => [...crypto.createHmac('sha256', key).update(value).digest()],
      base64EncodeWebSafe: (bytes: number[]) => Buffer.from(bytes).toString('base64url'),
    },
    ContentService: {},
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? '',
        setProperty: (k: string, v: string) => void props.set(k, v),
      }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return ctx;
};
beforeAll(() => {
  gas = loadGas();
});

describe('サーバーの検査: すみかぜの正しい予約は断らず、水増しは断る', () => {
  const order = (o: Record<string, unknown>) => ({ orderId: 'EQ-SUMI00001', trainName: '特急すみかぜ 1号', carNo: 2, seatNo: '4B', seatType: 'reserved', totalPrice: 0, items: [], itemDiscount: 0, ...o });
  const check = (o: unknown): string | null => gas.checkOrderPrice(o);
  const seatsOf = (n: number) => ['4A', '4B', '4C', '4D', '5A', '5B'].slice(0, n).join(',');

  it('特急料金の表は、アプリの決めごとと同じ(普通車 1,250円・特別車 2,200円)', () => {
    expect(gas.expressFeeMax('特急すみかぜ 3号', 'reserved')).toBe(SUMIKAZE.fees.reserved);
    expect(gas.expressFeeMax('特急すみかぜ 3号', 'special')).toBe(SUMIKAZE.fees.special);
    expect(gas.expressFeeMax('特急すみかぜ 3号', 'standard')).toBe(1250); // 自由席は、ない。表にない席種は、安い方
  });

  it('全駅の組 × 2席種 × 席の数 1〜6 × デリバリーなし × N-POINT払いあり/なし: 1件も断らない(運賃は、最高の区分で見る)', async () => {
    vi.resetModules();
    vi.doMock('../src/utils/tkLine', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/utils/tkLine')>()), isTkLaunched: () => true, visibleLineCodes: (codes: string[]) => codes }));
    const d = await import('../src/utils/diaTimetable');
    const data = await d.loadExpressData('sumikaze');
    const names = Array.from(new Set(data.master.stations.map((s) => s[0]))); // 路線の全駅(停車駅だけでなく、念のため)
    let checked = 0;
    const refused: string[] = [];
    for (const b of names) {
      for (const dd of names) {
        if (b === dd) continue;
        const fare = calculateFare(d.getTripDistanceKm(data, b, dd));
        for (const seatType of ['reserved', 'special'] as const) {
          for (let n = 1; n <= 6; n++) {
            for (const ratio of [0, 0.5, 1]) {
              const total = (fare + sumikazeFee(seatType)) * n;
              const points = Math.floor(total * ratio);
              checked++;
              const r = check(order({ seatType, seatNo: seatsOf(n), totalPrice: total - points, ...(points > 0 ? { pointsUsed: points } : {}) }));
              if (r !== null && refused.length < 5) refused.push(`${b}→${dd} ${seatType} ×${n} ${r}`);
            }
          }
        }
      }
    }
    expect(refused).toEqual([]);
    expect(checked).toBeGreaterThan(1000);
  });

  it('水増しは断る: 普通車は (最高の運賃+1,250)×席数 を超えたら、特別車は (最高の運賃+2,200)×席数 を超えたら', () => {
    const fareMax = readGas<number>('PRICE_FARE_MAX');
    for (const [seatType, fee] of [['reserved', 1250], ['special', 2200]] as const) {
      for (let n = 1; n <= 6; n++) {
        const limit = (fareMax + fee) * n;
        expect(check(order({ seatType, seatNo: seatsOf(n), totalPrice: limit })), `${seatType}×${n} ちょうど`).toBeNull();
        expect(check(order({ seatType, seatNo: seatsOf(n), totalPrice: limit + 1 })), `${seatType}×${n} +1`).toMatch(/予約内容/);
      }
    }
    // 普通車指定席のまま、特別車の金額は送れない(1席: 3300+2200 は、特別車の上限)
    expect(check(order({ seatType: 'reserved', totalPrice: fareMax + 2200 }))).toMatch(/予約内容/);
    // N-POINTで払った分を足しても、上限を超えたら断る
    expect(check(order({ seatType: 'special', totalPrice: 100, pointsUsed: fareMax + 2200 }))).toMatch(/予約内容/);
    // 席の数を少なく申告して、金額を大きくしても断る
    expect(check(order({ seatType: 'special', seatNo: '1A', totalPrice: (fareMax + 2200) * 2 }))).toMatch(/予約内容/);
  });
});

describe('予約の登録 → QR乗車券 → 検札・利用 → 取消(すみかぜ)', () => {
  const header = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻', '乗車日時'];
  let grid: unknown[][];
  let awarded: { total: number; trainName: string }[];

  beforeEach(() => {
    grid = [[...header]];
    awarded = [];
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
    gas = loadGas();
    gas.createJsonResponse = (d: unknown) => d;
    gas.verifySessionToken = (t: string) => (t === 't' ? 'M1' : null);
    gas.authMember = (t: string) => (t === 't' ? { memberId: 'M1' } : { error: { status: 'error', code: 'session' } });
    gas.findMemberById = () => ({ memberId: 'M1', lineUserId: '' });
    gas.getOrCreateReservationsSheet = () => sheet;
    gas.getDataSpreadsheet = () => ({ getSheetByName: () => sheet });
    gas.awardReservationPoints = (_m: string, _o: string, total: number, _p: unknown, trainName: string) => void awarded.push({ total, trainName });
    gas.saveReservationDetail = () => undefined;
    gas.revokeReservationPoints = () => undefined;
  });

  const sumi = (o: Record<string, unknown> = {}) => ({
    orderId: 'EQ-SUMI00002', trainName: '特急すみかぜ 5号', carNo: 1, seatNo: '3A,3B', seatType: 'special', boardingStation: '大宮駅', destinationStation: '高根沢駅',
    departureTime: '23:00', arrivalTime: '23:59', reservedDate: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), totalPrice: (1980 + 2200) * 2, items: [], itemDiscount: 0, ...o,
  });

  it('特別車(1号車)の2席: 登録でき、台帳に 席種=special・号車=1・座席=3A,3B が残る。ポイントは、合計金額の 3% の計算に渡る', () => {
    const r = gas.handleCreateReservation('t', sumi(), true);
    expect(r.status).toBe('success');
    const row = grid[1];
    expect(row[header.indexOf('列車名')]).toBe('特急すみかぜ 5号');
    expect(row[header.indexOf('号車')]).toBe(1);
    expect(row[header.indexOf('座席番号')]).toBe('3A,3B');
    expect(row[header.indexOf('席種')]).toBe('special');
    expect(awarded).toEqual([{ total: (1980 + 2200) * 2, trainName: '特急すみかぜ 5号' }]);
    expect(Math.floor(awarded[0].total * readGas<number>('RESERVATION_POINT_RATE'))).toBe(Math.floor(8360 * 0.03));
  });

  it('普通車(2〜6号車)の1席・6席も、登録できる。水増しは断られ、台帳に残らない', () => {
    expect(gas.handleCreateReservation('t', sumi({ orderId: 'EQ-SUMI00003', carNo: 6, seatNo: '16D', seatType: 'reserved', totalPrice: 1980 + 1250 }), true).status).toBe('success');
    expect(gas.handleCreateReservation('t', sumi({ orderId: 'EQ-SUMI00004', carNo: 2, seatNo: '1A,1B,1C,1D,2A,2B', seatType: 'reserved', totalPrice: (1980 + 1250) * 6 }), true).status).toBe('success');
    const before = grid.length;
    const bad = gas.handleCreateReservation('t', sumi({ orderId: 'EQ-SUMI00005', carNo: 2, seatNo: '1A', seatType: 'reserved', totalPrice: 60000 }), true);
    expect(bad).toMatchObject({ status: 'error', code: 'order_limit' });
    expect(grid.length).toBe(before);
  });

  it('QR乗車券: 持ち主に券が出て、検札で、列車・号車・席・席種(special)が正しく見え、席ごとに利用できる', () => {
    gas.handleCreateReservation('t', sumi({ orderId: 'EQ-SUMI00006' }), false);
    const t = gas.handleGetTicket('t', 'EQ-SUMI00006');
    expect(t.status).toBe('success');
    expect(t.token).toMatch(/^EQ-SUMI00006\./);
    const v = gas.handleVerifyTicket(t.token);
    expect(v.ticket).toMatchObject({ trainName: '特急すみかぜ 5号', carNo: 1, seatNo: '3A,3B', seatType: 'special', boardingStation: '大宮駅', destinationStation: '高根沢駅' });
    expect(v.seats.map((s: { seat: string }) => s.seat)).toEqual(['3A', '3B']);
    const used = gas.handleUseTicket(t.token, '3A');
    expect(used.justUsed).toBe(true);
    expect(used.state).toBe('valid'); // 1席だけ利用 → まだ有効
    expect(gas.handleUseTicket(t.token, '3B').state).toBe('used');
  });

  it('取消: 持ち主が取り消すと、台帳が「キャンセル」になり、券は取消になる', () => {
    gas.handleCreateReservation('t', sumi({ orderId: 'EQ-SUMI00007' }), false);
    const t = gas.handleGetTicket('t', 'EQ-SUMI00007');
    gas.handleCancelReservation('t', 'EQ-SUMI00007', false);
    expect(grid[1][header.indexOf('ステータス')]).toBe('キャンセル');
    expect(gas.handleVerifyTicket(t.token).state).toBe('cancelled');
  });
});

describe('予約の流れの部品が、すみかぜを知っている(見張り)', () => {
  it('予約画面: 料金・席種・駅の初期値・座席表への受け渡しが、すみかぜの決めごとを使っている', () => {
    const tab = read('src', 'components', 'ReservationTab.tsx');
    ["sumikazeFee(seatType)", 'SUMIKAZE.fees.reserved', 'SUMIKAZE.fees.special', "setSeatType('special')", "expressType === 'sumikaze'", "handleExpressTypeChange('sumikaze')", 'showSumikaze'].forEach((w) => expect(tab, w).toContain(w));
    // クーポン(AYAMI300)は、特急あやみの普通指定席だけ(すみかぜには、効かない)
    expect(tab).toContain("expressType === 'ayami' && seatType === 'reserved'");
  });

  it('経路検索から予約へ・予約の見守り・走行距離は、見せているあいだ、すみかぜの予約を扱える(特急の種類の表を使っている)', async () => {
    for (const f of ['routeReserve.ts', 'useReservationWatcher.ts', 'mileage.ts']) expect(read('src', 'utils', f), f).toContain('visibleExpressKeys');
    expect(read('src', 'components', 'TrainLocationTab.tsx')).toContain('visibleExpressKeys');
    expect(getTripDistanceKm).toBeTypeOf('function');
    expect(findExpressTrips).toBeTypeOf('function');
    expect(getExpressStations).toBeTypeOf('function');
    expect(loadExpressData).toBeTypeOf('function');
  });
});
