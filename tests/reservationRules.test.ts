import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { ActiveOrder } from '../src/types';
import { MOCK_EQUIP_ITEMS } from '../src/data/mockData';
import {
  RULE_MESSAGES,
  buildReservationOrder,
  fetchMyReservations,
  orderSignature,
  parseMyReservations,
  pickReservationToImport,
  refusalOf,
  serverReservationToOrder,
} from '../src/utils/reservationRules';
import { judgeResponse } from '../src/utils/reservationSync';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');

const serverRow = (over: Record<string, unknown> = {}) => ({
  orderId: 'EQ-ABC123',
  trainName: '特急めぐり 3号',
  carNo: 3,
  seatNo: '4B,4C',
  seatType: 'reserved',
  boardingStation: '神埼駅',
  destinationStation: '高宮駅',
  departureTime: '10:00',
  arrivalTime: '11:00',
  reservedDate: '2026-11-21',
  totalPrice: 3200,
  boardIdx: 0,
  destIdx: 5,
  items: [],
  itemDiscount: 0,
  pointsUsed: 0,
  boarded: false,
  ...over,
});

describe('サーバーの断り(refusalOf)', () => {
  it('seat_taken・active_exists は、サーバーの message をそのまま使う', () => {
    expect(refusalOf({ status: 'error', code: 'seat_taken', message: 'その座席は、すでに予約されています。' })).toEqual({ code: 'seat_taken', message: 'その座席は、すでに予約されています。' });
    expect(refusalOf({ status: 'error', code: 'active_exists', message: 'いま、ほかの予約があります。その予約が終わってから、ご予約ください。' })?.code).toBe('active_exists');
  });
  it('message が無いときは、同じ内容の文を使う', () => {
    expect(refusalOf({ status: 'error', code: 'seat_taken' })?.message).toBe(RULE_MESSAGES.seat_taken);
    expect(refusalOf({ status: 'error', code: 'active_exists', message: '  ' })?.message).toBe(RULE_MESSAGES.active_exists);
  });
  it('成功・ほかの失敗・返事なしは、断りではない', () => {
    expect(refusalOf({ status: 'success' })).toBeNull();
    expect(refusalOf({ status: 'error', message: '混み合っています。' })).toBeNull();
    expect(refusalOf({ status: 'error', code: 'order_limit', message: 'x' })).toBeNull();
    expect(refusalOf(undefined)).toBeNull();
  });
  it('サーバーのいまの文と、アプリの予備の文が、同じ', () => {
    const gas = read('gas/Code.gs');
    expect(gas).toContain(`message: '${RULE_MESSAGES.seat_taken}'`);
    expect(gas).toContain(`message: '${RULE_MESSAGES.active_exists}'`);
  });
  it('断りは、送り直さない失敗(直らない)として扱われる', () => {
    const o = judgeResponse({ status: 'error', code: 'seat_taken', message: 'その座席は、すでに予約されています。' });
    expect(o.ok).toBe(false);
    expect(o.retryable).toBe(false);
  });
});

describe('サーバーの予約を端末の予約にする', () => {
  it('getMyReservations の返事を読む(形の合わないものは飛ばす・失敗は null)', () => {
    expect(parseMyReservations({ status: 'error', message: 'x' })).toBeNull();
    expect(parseMyReservations(undefined)).toBeNull();
    const list = parseMyReservations({ status: 'success', reservations: [serverRow(), null, serverRow({ orderId: '!!' })] });
    expect(list?.map((r) => r.orderId)).toEqual(['EQ-ABC123']);
  });

  it('通信が失敗したら null(断りではない)', async () => {
    expect(await fetchMyReservations(async () => { throw new Error('offline'); }, 't')).toBeNull();
    expect(await fetchMyReservations(async () => ({ status: 'success', reservations: [serverRow()] }), 't')).toHaveLength(1);
  });

  it('予約の項目・デリバリーの商品(名前で探す)・席ごとの個数を、写す', () => {
    const known = MOCK_EQUIP_ITEMS[0];
    const [r] = parseMyReservations({
      status: 'success',
      reservations: [serverRow({ items: [{ name: known.name, quantity: 2, price: known.price, seats: { '4B': 1, '4C': 1 } }, { name: '消えた商品', quantity: 1, price: 500 }], itemDiscount: 100, pointsUsed: 300 })],
    })!;
    const o = serverReservationToOrder(r, 'a@example.com', MOCK_EQUIP_ITEMS);
    expect(o).toMatchObject({
      orderId: 'EQ-ABC123', trainName: '特急めぐり 3号', carNo: 3, seatNo: '4B,4C', seatType: 'reserved',
      boardingStation: '神埼駅', destinationStation: '高宮駅', departureTime: '10:00', arrivalTime: '11:00', reservedDate: '2026-11-21',
      totalPrice: 3200, status: 'confirmed', ownerEmail: 'a@example.com', itemDiscount: 100, pointsUsed: 300, deliveryStation: '神埼駅',
    });
    expect(o.items[0].item.id).toBe(known.id);
    expect(o.items[0].quantity).toBe(2);
    expect(o.items[1].item.name).toBe('消えた商品');
    expect(o.itemSeats?.[known.id]).toEqual({ '4B': 1, '4C': 1 });
  });

  it('席種が分からない値は付けない', () => {
    const [r] = parseMyReservations({ status: 'success', reservations: [serverRow({ seatType: 'なぞ' })] })!;
    expect(serverReservationToOrder(r, undefined, MOCK_EQUIP_ITEMS).seatType).toBeUndefined();
  });

  it('端末にすでに予約があれば、出さない(同じ予約番号も、1件のまま)', () => {
    const list = parseMyReservations({ status: 'success', reservations: [serverRow()] });
    const local = { orderId: 'EQ-ABC123' } as ActiveOrder;
    expect(pickReservationToImport(list, local, new Set())).toBeNull();
    expect(pickReservationToImport(list, { orderId: 'EQ-OTHER' } as ActiveOrder, new Set())).toBeNull();
    expect(pickReservationToImport(list, null, new Set())?.orderId).toBe('EQ-ABC123');
  });

  it('複数あっても1件だけ(新しい順の先頭)。この端末で取り消した予約は、出さない。取れなかったら、何もしない', () => {
    const list = parseMyReservations({ status: 'success', reservations: [serverRow({ orderId: 'EQ-NEW111' }), serverRow({ orderId: 'EQ-OLD222' })] });
    expect(pickReservationToImport(list, null, new Set())?.orderId).toBe('EQ-NEW111');
    expect(pickReservationToImport(list, null, new Set(['EQ-NEW111']))?.orderId).toBe('EQ-OLD222');
    expect(pickReservationToImport(null, null, new Set())).toBeNull();
    expect(pickReservationToImport([], null, new Set())).toBeNull();
  });
});

describe('同じ中身は、もう一度送らない(印)', () => {
  const order = (over: Partial<ActiveOrder> = {}): ActiveOrder => ({
    orderId: 'EQ-ABC123', trainName: '特急めぐり 3号', carNo: 3, seatNo: '4B', seatType: 'reserved', boardingStation: '神埼駅', destinationStation: '高宮駅',
    departureTime: '10:00', arrivalTime: '11:00', reservedDate: '2026-11-21', items: [], totalPrice: 1600, status: 'confirmed', estimatedDeliveryTime: '', deliveryStation: '神埼駅', ...over,
  });
  it('確定のとき足される ownerEmail・earnedPoints では、印が変わらない', () => {
    expect(orderSignature({ ...order(), ownerEmail: 'a@example.com', earnedPoints: 50 })).toBe(orderSignature(order()));
  });
  it('サーバーから取った予約は、そのまま送り直しの印と一致する(中身が変わったら、変わる)', () => {
    const [r] = parseMyReservations({ status: 'success', reservations: [serverRow()] })!;
    const imported = serverReservationToOrder(r, 'a@example.com', MOCK_EQUIP_ITEMS);
    expect(orderSignature(imported)).toBe(orderSignature({ ...imported }));
    expect(orderSignature({ ...imported, totalPrice: imported.totalPrice + 500 })).not.toBe(orderSignature(imported));
  });
  it('台帳へ送る中身は、これまでと同じ項目', () => {
    expect(Object.keys(buildReservationOrder(order())).sort()).toEqual(
      ['arrivalTime', 'boardingStation', 'carNo', 'departureTime', 'destinationStation', 'itemDiscount', 'items', 'orderId', 'pointsUsed', 'reservedDate', 'seatNo', 'seatType', 'totalPrice', 'trainName']
    );
  });
});

describe('画面の流れ(ソースの確認)', () => {
  const tab = read('src/components/ReservationTab.tsx');
  const app = read('src/App.tsx');
  it('ポイントを引く前に、ほかの予約を確かめ、確定の前に、サーバーへ送る', () => {
    const fn = tab.slice(tab.indexOf('const handleConfirmSeatSelection'));
    const pre = fn.indexOf('bookingGate.precheck()');
    const spend = fn.indexOf('onSpendPoints(orderId');
    const submit = fn.indexOf('bookingGate.submit(newOrder)');
    const confirm = fn.indexOf('onConfirmOrder(newOrder)');
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(spend);
    expect(spend).toBeLessThan(submit);
    expect(submit).toBeLessThan(confirm);
  });
  it('断られたら、席が埋まっていたときは、その席を選べなくして、席を選ぶ画面へ戻す', () => {
    expect(tab).toContain("refused.code === 'seat_taken'");
    expect(tab).toContain('takenSeats={takenSeats}');
    expect(tab).toContain("refusal.code === 'seat_taken' ? '席を選びなおす' : '予約を見る'");
    expect(tab).toContain('setIsSeatSelectionModalOpen(true)');
  });
  it('サーバーが規則を見る会員(公開後のクラウドの会員)だけに、確かめを渡す。デモ会員は、渡さない', () => {
    expect(app).toMatch(/const rulesOnServer = isLaunched\(\) && !!sessionToken && cloudOn && cloud\.ready && !cloud\.error;/);
    expect(app).toContain('bookingGate={bookingGate}');
  });
  it('サーバーから取った予約・確定の前に送った予約は、効果の中で送り直さない', () => {
    expect(app).toContain('sentSignatureRef.current[orderId] === orderSignature(activeOrder)');
  });
});
