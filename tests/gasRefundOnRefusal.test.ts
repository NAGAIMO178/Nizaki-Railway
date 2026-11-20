// 予約が規則(同じ席・1人1件)で断られたとき、その予約番号のために引いた N-POINT(spendPoints)を、サーバーが、自動で戻す。
// 作りものの台帳(予約台帳・ポイント台帳)で動かす。本番には、何も書き込まない。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

let gas: Gas;
let nowMs = 0;
let grid: unknown[][]; // 予約台帳
let ledger: unknown[][]; // ポイント台帳(見出しの行つき)
let H: string[];

const base = {
  trainName: '特急あやみ 101号', carNo: 3, seatNo: '5A', seatType: 'reserved',
  boardingStation: '東京駅', destinationStation: '大宮駅', departureTime: '10:00', arrivalTime: '11:00',
  reservedDate: '2026-11-20', totalPrice: 1000, items: [], itemDiscount: 0,
};
type Res = { status: string; code?: string; message?: string; refunded?: number; spent?: number; added?: boolean };
// token 'tA' = 会員 M1、'tB' = 会員 M2
const reserve = (orderId: string, over: Record<string, unknown> = {}, token = 'tA') => gas.handleCreateReservation(token, { orderId, ...base, ...over }, true) as Res;
const spend = (orderId: string, points: number, token = 'tA') => gas.handleSpendPoints(token, orderId, points, '') as Res;
// N-POINT の使用・戻しだけの残高(予約で付くポイントは、除く。成功した予約には、ポイントが付くため)
const balance = (member: string) => ledger.slice(1).filter((r) => r[1] === member && ['welcome', 'spend', 'refund'].includes(r[2] as string)).reduce((s, r) => s + (r[4] as number), 0);
const rowsOf = (member: string, kind: string) => ledger.slice(1).filter((r) => r[1] === member && r[2] === kind);
const welcome = (member: string, points = 3000) => {
  ledger.push(['t', member, 'welcome', 'welcome', points, '初回']);
};

beforeEach(() => {
  nowMs = Date.parse('2026-11-20T09:00:00+09:00');
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { formatDate: () => '2026/11/20 09:00:00', getUuid: () => 'uuid' },
    ContentService: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
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
  grid = [[...H]];
  ledger = [['日時', '会員ID', '種別', '名札', 'ポイント', 'タイトル']];
  welcome('M1');
  welcome('M2');
  const sheet = {
    getDataRange: () => ({ getValues: () => grid.map((r) => [...r]) }),
    appendRow: (r: unknown[]) => void grid.push([...r]),
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getRange: (row: number, c: number, nr = 1, nc = 1) => ({
      getValues: () => [Array.from({ length: nc }, (_, i) => grid[row - 1][c - 1 + i])],
      setValue: (v: unknown) => void (grid[row - 1][c - 1] = v),
      setValues: (vs: unknown[][]) => vs.forEach((r, i) => r.forEach((v, j) => void (grid[row - 1 + i][c - 1 + j] = v))),
      setNumberFormat: () => undefined,
    }),
  };
  const pointSheet = {
    getDataRange: () => ({ getValues: () => ledger.map((r) => [...r]) }),
    appendRow: (r: unknown[]) => void ledger.push([...r]),
  };
  gas.createJsonResponse = (d: unknown) => d;
  gas.verifySessionToken = (t: string) => (t === 'tA' ? 'M1' : t === 'tB' ? 'M2' : null);
  gas.findMemberById = (id: string) => ({ memberId: id, lineUserId: '' });
  gas.getOrCreateReservationsSheet = () => sheet;
  gas.getOrCreateSheetWithHeaders = () => pointSheet;
  gas.getDataSpreadsheet = () => ({ getSheetByName: (n: string) => (n === '予約台帳' ? sheet : null) });
  // 規則は、入れておく(本番の、true にしたあとの状態)
  gas.ENFORCE_ONE_ACTIVE = true;
  gas.ENFORCE_SEAT_CONFLICT = true;
});

describe('断られたら、使った N-POINT が戻る', () => {
  it('同じ席(seat_taken)で断られたら、引いた点数が、戻る。返事に refunded が付き、code・message は、これまでどおり', () => {
    expect(reserve('EQ-OTHER', {}, 'tB').status).toBe('success'); // M2 が、先に、同じ席を取った
    expect(spend('EQ-1', 500).status).toBe('success');
    expect(balance('M1')).toBe(2500);
    const r = reserve('EQ-1');
    expect(r).toEqual({ status: 'error', code: 'seat_taken', message: 'その座席は、すでに予約されています。', refunded: 500 });
    expect(balance('M1')).toBe(3000);
    const back = rowsOf('M1', 'refund');
    expect(back).toHaveLength(1);
    expect(back[0].slice(3, 5)).toEqual(['refund:EQ-1', 500]);
    expect(String(back[0][5])).toContain('お戻し');
  });

  it('1人1件(active_exists)で断られたときも、戻る', () => {
    expect(reserve('EQ-A', { seatNo: '6A' }).status).toBe('success'); // M1 の、未終了の予約
    expect(spend('EQ-B', 700).status).toBe('success');
    const r = reserve('EQ-B', { seatNo: '7A' });
    expect(r).toMatchObject({ status: 'error', code: 'active_exists', refunded: 700 });
    expect(r.message).toBe('いま、ほかの予約があります。その予約が終わってから、ご予約ください。');
    expect(balance('M1')).toBe(3000);
  });

  it('何度、断られても、二重には戻さない。2回目以降の返事に、refunded は付かない', () => {
    reserve('EQ-OTHER', {}, 'tB');
    spend('EQ-1', 500);
    expect(reserve('EQ-1').refunded).toBe(500);
    for (let i = 0; i < 3; i++) {
      const r = reserve('EQ-1');
      expect(r.code).toBe('seat_taken');
      expect(r.refunded).toBeUndefined();
    }
    expect(rowsOf('M1', 'refund')).toHaveLength(1);
    expect(balance('M1')).toBe(3000);
  });

  it('戻したあとの、同じ予約番号の spendPoints は、引き直さず、断る(払わずに予約できてしまわないように)。新しい予約番号なら、使える', () => {
    reserve('EQ-OTHER', {}, 'tB');
    spend('EQ-1', 500);
    reserve('EQ-1');
    const again = spend('EQ-1', 500);
    expect(again.status).toBe('error');
    expect(again.code).toBe('refunded');
    expect(balance('M1')).toBe(3000);
    expect(spend('EQ-2', 400).status).toBe('success');
    expect(balance('M1')).toBe(2600);
  });
});

describe('戻さないとき', () => {
  it('別の会員は、戻らない(会員ごとの台帳だけを見る)', () => {
    reserve('EQ-OTHER', {}, 'tB');
    spend('EQ-1', 500, 'tA'); // M1 が、EQ-1 のために引いた
    // M2 が、同じ予約番号 EQ-1 で、同じ席を取ろうとして、断られる(M2 は、引いていない)
    const r = reserve('EQ-1', {}, 'tB');
    expect(r.code).toBe('seat_taken'); // M2 自身の EQ-OTHER と、同じ席
    expect(r.refunded).toBeUndefined();
    expect(balance('M1')).toBe(2500); // M1 の引いた分は、そのまま(M1 の予約は、まだ、断られていない)
    expect(rowsOf('M1', 'refund')).toHaveLength(0);
    expect(rowsOf('M2', 'refund')).toHaveLength(0);
  });

  it('spendPoints が無い予約(ポイントを使っていない)は、何もしない', () => {
    reserve('EQ-OTHER', {}, 'tB');
    const r = reserve('EQ-1');
    expect(r.code).toBe('seat_taken');
    expect(r.refunded).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(['code', 'message', 'status']); // これまでと同じ形
    expect(ledger.filter((r) => ['spend', 'refund'].includes(r[2] as string))).toHaveLength(0);
  });

  it('成功した予約は、戻らない(引いたまま)。取消(cancelReservation)でも、使ったポイントは戻らない', () => {
    spend('EQ-1', 500);
    expect(reserve('EQ-1').status).toBe('success');
    expect(balance('M1')).toBe(2500);
    expect(rowsOf('M1', 'refund')).toHaveLength(0);
    gas.handleCancelReservation('tA', 'EQ-1', true);
    expect(balance('M1')).toBe(2500);
    expect(rowsOf('M1', 'refund')).toHaveLength(0);
  });

  it('すでにある予約の更新(デリバリーの追加など)が断られたときは、戻さない(予約は、残っているため)', () => {
    spend('EQ-1', 500);
    expect(reserve('EQ-1').status).toBe('success');
    // M2 が、EQ-1 の席に、先に重なる予約を作ることはできない(席が埋まっている)ので、台帳を直接書き換えて、重なる状態を作る
    (grid[1] as unknown[])[H.indexOf('座席番号')] = '5A';
    grid.push(H.map((h) => ({ 予約番号: 'EQ-X', 会員ID: 'M2', 予約日: '2026-11-20', 列車名: base.trainName, 号車: 3, 座席番号: '5A', ステータス: '予約確定' } as Record<string, unknown>)[h] ?? ''));
    const r = reserve('EQ-1', { totalPrice: 2000 });
    expect(r.code).toBe('seat_taken');
    expect(r.refunded).toBeUndefined();
    expect(balance('M1')).toBe(2500);
  });

  it('ほかの理由(上限・内容の誤りなど)で断られたときは、この変更では、戻さない', () => {
    spend('EQ-1', 500);
    const r = reserve('EQ-1', { totalPrice: 99999999 });
    expect(r.status).toBe('error');
    expect(r.code).toBe('order_limit');
    expect(r.refunded).toBeUndefined();
    expect(balance('M1')).toBe(2500);
  });

  it('ログインの証が無い・偽のときは、何も戻さない', () => {
    reserve('EQ-OTHER', {}, 'tB');
    spend('EQ-1', 500);
    expect(reserve('EQ-1', {}, 'forged').status).toBe('error');
    expect(balance('M1')).toBe(2500);
  });
});

describe('ポイント台帳との関係', () => {
  it('戻しは、予約で付いたポイントに数えない(1日の上限・残高の計算が、おかしくならない)', () => {
    reserve('EQ-OTHER', {}, 'tB');
    spend('EQ-1', 500);
    reserve('EQ-1');
    const readLedger = gas.readMemberPoints('M1');
    expect(gas.pointsAwardedToday(readLedger)).toBe(0);
    expect(gas.ledgerBalance(readLedger)).toBe(3000);
    // 1日の上限(10000pt)いっぱいまで付いている会員でも、戻しで、上限の計算は変わらない
    expect(vm.runInContext('DAILY_RESERVATION_POINT_CAP', gas)).toBe(10000);
  });

  it('ほかの会員の台帳は、変わらない', () => {
    reserve('EQ-OTHER', {}, 'tB');
    const before = JSON.stringify(ledger.filter((r) => r[1] === 'M2'));
    spend('EQ-1', 500);
    reserve('EQ-1');
    expect(JSON.stringify(ledger.filter((r) => r[1] === 'M2'))).toBe(before);
  });

  it('最初の同期の前(台帳が空)で、spendPoints が無いときは、何も書かない', () => {
    ledger = [['日時', '会員ID', '種別', '名札', 'ポイント', 'タイトル']];
    reserve('EQ-OTHER', {}, 'tB');
    const r = reserve('EQ-1');
    expect(r.code).toBe('seat_taken');
    expect(ledger).toHaveLength(1);
  });
});
