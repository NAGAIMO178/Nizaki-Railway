// 座席選び: ほかの会員が予約した席(getOccupiedSeats)を、予約済みとして足す
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fetchOccupiedSeats } from '../src/utils/occupiedSeats';
import { getLocalDateString } from '../src/utils/orderExpiry';
import { getTodayDateString } from '../src/utils/seatUtils';
import { pickDefaultSeat } from '../src/utils/seatPick';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');

describe('getOccupiedSeats を呼ぶ', () => {
  it('引数は { date, trainName, carNo }(日付 YYYY-MM-DD・列車名・号車)', async () => {
    const calls: { a: string; p: Record<string, unknown> }[] = [];
    await fetchOccupiedSeats('2026-11-22', '特急あやみ 110号', 3, async (a, p) => (calls.push({ a, p }), { status: 'success', seats: [] }));
    expect(calls).toEqual([{ a: 'getOccupiedSeats', p: { date: '2026-11-22', trainName: '特急あやみ 110号', carNo: 3 } }]);
    expect(String(calls[0].p.date)).toMatch(/^\d{4}-\d{2}-\d{2}$/); // サーバーが受ける形
  });
  it('返った席({ seat, from, to })の、席の名前だけを取る。重複・形の違うものは捨てる。区間は使わない', async () => {
    const seats = await fetchOccupiedSeats('2026-11-22', 'x', 2, async () => ({
      status: 'success',
      seats: [{ seat: '4B', from: 0, to: 5 }, { seat: '4B', from: null, to: null }, { seat: '3A', from: null, to: null }, { seat: '自由席' }, { seat: 5 }, null, 'x'],
    }));
    expect(seats).toEqual(['4B', '3A']);
  });
  it('失敗(通信・サーバーの断り・形の違い)は null。例外も外へ出さない', async () => {
    expect(await fetchOccupiedSeats('d', 't', 1, async () => { throw new Error('offline'); })).toBeNull();
    expect(await fetchOccupiedSeats('d', 't', 1, async () => ({ status: 'error' }))).toBeNull();
    expect(await fetchOccupiedSeats('d', 't', 1, async () => ({ status: 'success' }))).toBeNull();
    expect(await fetchOccupiedSeats('d', 't', 1, async () => ({ status: 'success', seats: 'x' }))).toBeNull();
  });
});

describe('予約をサーバーへ送るときと、同じ文字・同じ形', () => {
  it('日付は、予約日(reservedDate)と同じ getLocalDateString。席選びの模擬の日付とも、同じ形', () => {
    const tab = read('src/components/ReservationTab.tsx');
    const modal = read('src/components/SeatSelectionModal.tsx');
    expect(tab).toContain('reservedDate: getLocalDateString()');
    expect(modal).toContain('const date = getLocalDateString();');
    expect(getLocalDateString()).toBe(getTodayDateString());
  });
  it('列車名は、予約の trainName と同じもの(currentTrainInfo.trainName)を渡す。号車は、数', () => {
    const tab = read('src/components/ReservationTab.tsx');
    expect(tab).toContain('trainName={currentTrainInfo?.trainName ?? \'\'}');
    expect(tab).toContain('const trainName = currentTrainInfo.trainName;');
    const modal = read('src/components/SeatSelectionModal.tsx');
    expect(modal).toContain('fetchOccupiedSeats(date, trainName, car, fetchOccupied)');
  });
  it('サーバーは、予約日・列車名・号車・座席を、アプリが送った文字のまま保存し、同じ形で照合する', () => {
    const gas = read('gas/Code.gs');
    expect(gas).toContain("'列車名': limitText(order.trainName, 60)");
    expect(gas).toContain("'予約日': limitText(order.reservedDate, 10)");
    expect(gas).toContain("cellText(r[col['予約日']], 'yyyy-MM-dd') !== d");
    expect(gas).toContain("Number(r[col['号車']]) !== car");
  });
});

describe('席選びの画面の動き(ソースの確認)', () => {
  const modal = read('src/components/SeatSelectionModal.tsx');
  it('号車ごとに1回だけ取る(失敗しても、同じ画面では、もう一度取らない)。開くたびに、取り直す', () => {
    expect(modal).toContain('if (triedRef.current.has(key)) return;');
    expect(modal).toContain('triedRef.current.add(key);');
    expect(modal).toContain('triedRef.current = new Set();');
    expect(modal).toContain('}, [isOpen, trainName, selectedCarNo]);');
  });
  it('返った席は、模擬の埋まり方・断られた席に足す(同じ予約済みの見た目。新しい色・文は足さない)', () => {
    expect(modal).toContain('return [...generated, ...(takenSeats?.[carNo] ?? []), ...(server[carNo] ?? [])];');
    expect(modal).not.toMatch(/serverOccupied[^\n]*className/);
  });
  it('取れなかったとき・空のときは、何も変えない(模擬だけのまま)', () => {
    expect(modal).toContain('if (!seats || seats.length === 0 || gen !== openGen.current) return;');
  });
  it('選んでいる席が重なったら、その席だけ外す。選択が空になったら、空席を1つ選びなおす', () => {
    expect(modal).toContain('const rest = prev.filter((seat) => !seats.includes(seat));');
    expect(modal).toContain('return rest.length > 0 ? rest : defaultSeats(car, next);');
  });
  it('既定の席は、サーバーの席を除いて選ぶ(pickDefaultSeat の、埋まりの一覧に足す)', () => {
    expect(pickDefaultSeat(['4B'], false)).toBe('1A');
    expect(pickDefaultSeat(['4B', '1A'], false)).toBe('1B');
  });
});
