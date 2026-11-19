// 予約をサーバーから取り直す、2つ(サーバー gas/Code.gs):
//  getMyReservations … 自分の、未終了の予約(ログイン証が要る)。LINE_USER_ID は返さない
//  getOccupiedSeats  … 公開用。日・列車・号車の、予約済みの席と区間の番号だけ。会員の情報は返さない。30秒だけ覚える
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

let gas: Gas;
let nowMs = 0;
let grid: unknown[][];
let cache: Record<string, string>;
let cachePuts: { key: string; seconds: number }[];
let H: string[];

const setNow = (iso: string) => void (nowMs = Date.parse(iso));
const add = (over: Record<string, unknown>) => {
  const v: Record<string, unknown> = {
    予約日時: '2026/11/20 09:00:00', 予約番号: 'EQ-1', LINE_USER_ID: 'Usecret', 列車名: '特急あやみ 101号', 号車: 3, 座席番号: '5A', 席種: 'reserved',
    乗車駅: '東京駅', 降車駅: '大宮駅', 合計金額: 1540, ステータス: '予約確定', 会員ID: 'M1', 予約日: '2026-11-20', 出発時刻: '10:00', 到着時刻: '11:00',
    乗車日時: '', 乗車駅番号: '', 降車駅番号: '', 明細: '', ...over,
  };
  grid.push(H.map((h) => (v[h] === undefined ? '' : v[h])));
};
const mine = (token = 'tA') => gas.handleGetMyReservations(token) as { status: string; code?: string; reservations: Array<Record<string, unknown>> };
const seatsOf = (d = '2026-11-20', t = '特急あやみ 101号', c: unknown = 3) => gas.handleGetOccupiedSeats(d, t, c) as { status: string; code?: string; seats: Array<Record<string, unknown>> };

beforeEach(() => {
  setNow('2026-11-20T09:00:00+09:00');
  cache = {};
  cachePuts = [];
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { formatDate: () => '2026/11/20 09:00:00' },
    ContentService: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string, s: number) => void ((cache[k] = v), cachePuts.push({ key: k, seconds: s })),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Date: class extends Date {
      constructor(...a: unknown[]) {
        if (a.length === 0) super(nowMs);
        else super(...(a as [number]));
      }
      static now() {
        return nowMs;
      }
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  gas = ctx;
  H = vm.runInContext('RESERVATION_HEADERS', ctx) as string[];
  if (!H.includes('明細')) H = [...H, '明細'];
  grid = [[...H]];
  gas.createJsonResponse = (d: unknown) => d;
  gas.verifySessionToken = (t: string) => (t === 'tA' ? 'M1' : t === 'tB' ? 'M2' : null);
  gas.findMemberById = (id: string) => ({ memberId: id });
  const sheet = {
    getLastRow: () => grid.length,
    getDataRange: () => ({ getValues: () => grid.map((r) => [...r]) }),
  };
  gas.getDataSpreadsheet = () => ({ getSheetByName: (n: string) => (n === '予約台帳' ? sheet : null) });
});

describe('getMyReservations(自分の未終了の予約)', () => {
  it('ログイン証が無い・偽のときは、断る(code: session)', () => {
    add({});
    expect(mine('').code).toBe('session');
    expect(mine('forged').code).toBe('session');
  });

  it('台帳が空・自分の予約が無いときは、空の一覧', () => {
    expect(mine().reservations).toEqual([]);
    add({ 会員ID: 'M2' });
    expect(mine().reservations).toEqual([]);
  });

  it('自分の未終了の予約だけ。取消・終わった予約・ほかの会員の予約は、入らない', () => {
    add({ 予約番号: 'EQ-ACTIVE' });
    add({ 予約番号: 'EQ-CANCELED', ステータス: 'キャンセル' });
    add({ 予約番号: 'EQ-OLD', 予約日: '2026-11-19' });
    add({ 予約番号: 'EQ-OTHER', 会員ID: 'M2' });
    expect(mine().reservations.map((r) => r.orderId)).toEqual(['EQ-ACTIVE']);
  });

  it('アプリが画面を作る項目を返す。区間の番号・明細(商品・割引・N-POINT払い)・乗車済みの印も', () => {
    add({
      予約番号: 'EQ-FULL', 乗車駅番号: 1, 降車駅番号: 4, 乗車日時: '2026/11/20 09:55:00', 合計金額: 2300,
      明細: JSON.stringify({ items: [{ name: '駅弁', quantity: 2, price: 600 }], itemDiscount: 100, pointsUsed: 50, pointBasis: 2300 }),
    });
    const r = mine().reservations[0];
    expect(r).toEqual({
      orderId: 'EQ-FULL', trainName: '特急あやみ 101号', carNo: 3, seatNo: '5A', seatType: 'reserved',
      boardingStation: '東京駅', destinationStation: '大宮駅', departureTime: '10:00', arrivalTime: '11:00', reservedDate: '2026-11-20',
      totalPrice: 2300, boardIdx: 1, destIdx: 4, items: [{ name: '駅弁', quantity: 2, price: 600 }], itemDiscount: 100, pointsUsed: 50, boarded: true,
    });
  });

  it('区間の番号・明細が無い(または壊れた)予約は、空の値で返す', () => {
    add({ 予約番号: 'EQ-A' });
    add({ 予約番号: 'EQ-B', 明細: '{こわれた', 乗車駅番号: 'あ' });
    for (const r of mine().reservations) {
      expect(r.boardIdx).toBeNull();
      expect(r.destIdx).toBeNull();
      expect(r.items).toEqual([]);
      expect(r.itemDiscount).toBe(0);
      expect(r.pointsUsed).toBe(0);
      expect(r.boarded).toBe(false);
    }
  });

  it('LINE_USER_ID・会員IDは、返さない', () => {
    add({});
    const text = JSON.stringify(mine());
    expect(text).not.toContain('Usecret');
    expect(text).not.toContain('M1');
    expect(text).not.toContain('LINE_USER_ID');
  });

  it('新しい予約が先。到着時刻をすぎると、一覧から消える', () => {
    add({ 予約番号: 'EQ-1' });
    add({ 予約番号: 'EQ-2', 予約日: '2026-11-21' });
    expect(mine().reservations.map((r) => r.orderId)).toEqual(['EQ-2', 'EQ-1']);
    setNow('2026-11-20T11:00:00+09:00');
    expect(mine().reservations.map((r) => r.orderId)).toEqual(['EQ-2']);
  });
});

describe('getOccupiedSeats(予約済みの席。公開用)', () => {
  it('日付・列車・号車が変なときは、断る', () => {
    for (const [d, t, c] of [['2026/11/20', '特急あやみ 101号', 3], ['2026-11-20', '', 3], ['2026-11-20', '特急あやみ 101号', 0], ['2026-11-20', '特急あやみ 101号', 'x'], ['2026-11-20', '特急あやみ 101号', 3.5], [undefined, undefined, undefined]] as const) {
      expect(gas.handleGetOccupiedSeats(d, t, c).code, `${d} ${t} ${c}`).toBe('invalid');
    }
  });

  it('その日・列車・号車の、取消でない予約の席だけを返す。複数席は、1席ずつ。自由席は含めない', () => {
    add({ 予約番号: 'A', 座席番号: '5A' });
    add({ 予約番号: 'B', 座席番号: '4B,4C' });
    add({ 予約番号: 'C', 座席番号: '自由席×3' });
    add({ 予約番号: 'D', 座席番号: '6A', ステータス: 'キャンセル' });
    add({ 予約番号: 'E', 座席番号: '7A', 号車: 4 });
    add({ 予約番号: 'F', 座席番号: '8A', 予約日: '2026-11-21' });
    add({ 予約番号: 'G', 座席番号: '9A', 列車名: '特急あやみ 103号' });
    expect(seatsOf().seats.map((s) => s.seat)).toEqual(['5A', '4B', '4C']);
  });

  it('区間の番号を返す。番号が無い・順番が逆の予約は、from / to が null(全区間)', () => {
    add({ 座席番号: '1A', 乗車駅番号: 0, 降車駅番号: 3 });
    add({ 座席番号: '1B' });
    add({ 座席番号: '1C', 乗車駅番号: 5, 降車駅番号: 2 });
    expect(seatsOf().seats).toEqual([
      { seat: '1A', from: 0, to: 3 },
      { seat: '1B', from: null, to: null },
      { seat: '1C', from: null, to: null },
    ]);
  });

  it('会員の情報は、一切、返さない(席・区間だけ)', () => {
    add({});
    const text = JSON.stringify(seatsOf());
    for (const secret of ['Usecret', 'M1', 'EQ-1', 'LINE', '会員', '予約番号']) expect(text).not.toContain(secret);
    expect(Object.keys(seatsOf().seats[0]).sort()).toEqual(['from', 'seat', 'to']);
  });

  it('30秒だけ覚える。覚えているあいだは、台帳が変わっても、同じ答え', () => {
    add({ 座席番号: '5A' });
    expect(seatsOf().seats).toHaveLength(1);
    expect(cachePuts).toHaveLength(1);
    expect(cachePuts[0].seconds).toBe(30);
    add({ 予約番号: 'EQ-2', 座席番号: '5B' });
    expect(seatsOf().seats).toHaveLength(1); // 覚えている
    cache = {}; // 30秒たつと、キャッシュが消える
    expect(seatsOf().seats).toHaveLength(2);
  });

  it('予約が無いときや、台帳が無いときは、空', () => {
    expect(seatsOf().seats).toEqual([]);
    gas.getDataSpreadsheet = () => ({ getSheetByName: () => null });
    cache = {};
    expect(seatsOf().seats).toEqual([]);
  });
});

describe('doPost の入口', () => {
  it('getMyReservations はログイン証が要り、getOccupiedSeats はログインなしで通る', () => {
    const post = (body: unknown) => gas.doPost({ postData: { contents: JSON.stringify(body) } });
    add({});
    expect(post({ action: 'getMyReservations' }).code).toBe('session');
    expect(post({ action: 'getMyReservations', sessionToken: 'tA' }).reservations).toHaveLength(1);
    expect(post({ action: 'getOccupiedSeats', date: '2026-11-20', trainName: '特急あやみ 101号', carNo: 3 }).seats).toHaveLength(1);
  });
});
