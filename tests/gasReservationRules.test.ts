// 予約の重複を断る決まり(サーバー gas/Code.gs の handleCreateReservation の、ロックの中):
//  ① 同じ会員の、未終了の予約は、1件まで(同じ予約番号の更新は、通す)
//  ② 同じ日・同じ列車・同じ号車・同じ席で、区間が重なる予約は、ほかの会員も含めて断る(降車駅 = 次の人の乗車駅 は、重ならない。区間の番号が無ければ、全区間)
// どちらも、公開後のアプリ(awardPoints: true)の予約だけが対象。スクリプトプロパティ(ENFORCE_*)が、文字の 'true' のときだけ、働く(初めは、オフ)。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

let gas: Gas;
let props: Record<string, string>;
let nowMs = 0; // サーバーの「いま」(vm の中の Date は、テストの時計と別なので、作りものの Date を渡す)
let grid: unknown[][];
let H: string[];
const col = (name: string) => H.indexOf(name);
const setNow = (iso: string) => void (nowMs = Date.parse(iso));

const base = {
  trainName: '特急あやみ 101号', carNo: 3, seatNo: '5A', seatType: 'reserved',
  boardingStation: '東京駅', destinationStation: '大宮駅', departureTime: '10:00', arrivalTime: '11:00',
  reservedDate: '2026-11-20', totalPrice: 1540, items: [], itemDiscount: 0,
};
const REFUSED_ACTIVE = 'いま、ほかの予約があります。その予約が終わってから、ご予約ください。';
const REFUSED_SEAT = 'その座席は、すでに予約されています。';

// token 'tA' = 会員 M1、'tB' = 会員 M2
const send = (orderId: string, over: Record<string, unknown> = {}, token = 'tA', award = true) =>
  gas.handleCreateReservation(token, { orderId, ...base, ...over }, award) as { status: string; code?: string; message?: string };
const rowOf = (orderId: string) => grid.find((r, i) => i > 0 && r[col('予約番号')] === orderId) as unknown[];
const cancel = (orderId: string) => void (rowOf(orderId)[col('ステータス')] = 'キャンセル');

beforeEach(() => {
  setNow('2026-11-20T09:00:00+09:00');
  props = { ENFORCE_ONE_ACTIVE: 'true', ENFORCE_SEAT_CONFLICT: 'true' }; // この中の試験は、判定を入れた状態で調べる(切り替えの試験は、プロパティを変える)
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { formatDate: () => '2026/11/20 09:00:00', getUuid: () => 'uuid' },
    ContentService: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
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
  gas.verifySessionToken = (t: string) => (t === 'tA' ? 'M1' : t === 'tB' ? 'M2' : null);
  gas.findMemberById = (id: string) => ({ memberId: id, lineUserId: '' });
  gas.getOrCreateReservationsSheet = () => sheet;
  gas.createJsonResponse = (d: unknown) => d;
  gas.getOrCreateSheetWithHeaders = () => ({ getDataRange: () => ({ getValues: () => [['日時', '会員ID', '種別', '名札', 'ポイント', 'タイトル']] }), appendRow: () => undefined });
});

describe('切り替え(スクリプトプロパティ)と定数', () => {
  it('未終了の予約は、1件まで(上限の20件は、そのまま)', () => {
    expect(vm.runInContext('MAX_ACTIVE_PER_MEMBER', gas)).toBe(1);
    expect(vm.runInContext('MAX_ACTIVE_RESERVATIONS', gas)).toBe(20);
  });

  it('値が、文字の \'true\' のときだけ、入る。プロパティが無い・ほかの値(false・TRUE・1・空)は、切れている(初めは、オフ)', () => {
    for (const name of ['ENFORCE_ONE_ACTIVE', 'ENFORCE_SEAT_CONFLICT']) {
      const on = () => (name === 'ENFORCE_ONE_ACTIVE' ? gas.isOneActiveEnforced() : gas.isSeatConflictEnforced());
      expect(on(), `${name}=true`).toBe(true);
      delete props[name];
      expect(on(), `${name} なし`).toBe(false);
      for (const v of ['false', 'TRUE', 'True', '1', '', ' true', 'yes']) {
        props[name] = v;
        expect(on(), `${name}=${v}`).toBe(false);
      }
      props[name] = 'true';
      expect(on()).toBe(true);
    }
  });

  it('判定のたびに読む(起動のあとにプロパティを変えると、すぐ効く)', () => {
    send('EQ-1');
    expect(send('EQ-2', { seatNo: '6A' }).code).toBe('active_exists');
    props.ENFORCE_ONE_ACTIVE = 'false';
    expect(send('EQ-2', { seatNo: '6A' }).status).toBe('success');
  });

  it('プロパティが無いときは、2つとも、断らない(初めの状態)', () => {
    props = {};
    expect(send('EQ-1').status).toBe('success');
    expect(send('EQ-2', { seatNo: '6A' }).status).toBe('success'); // 1人1件でも断らない
    expect(send('EQ-3', { seatNo: '5A' }, 'tB').status).toBe('success'); // 同じ席でも断らない
  });
});

describe('① 同じ会員の未終了の予約は、1件まで', () => {
  it('2件目の新しい予約は、断る(決まった文・code: active_exists)。台帳には書かない', () => {
    expect(send('EQ-1').status).toBe('success');
    const r = send('EQ-2', { seatNo: '6A' });
    expect(r).toMatchObject({ status: 'error', code: 'active_exists', message: REFUSED_ACTIVE });
    expect(grid).toHaveLength(2);
  });

  it('同じ予約番号の更新(デリバリーの追加など)は、通る', () => {
    expect(send('EQ-1').status).toBe('success');
    expect(send('EQ-1', { totalPrice: 2000 }).status).toBe('success');
    expect(grid).toHaveLength(2);
    expect(rowOf('EQ-1')[col('合計金額')]).toBe(2000);
  });

  it('取り消すと、また予約できる。ほかの会員の予約は、数えない', () => {
    send('EQ-1');
    expect(send('EQ-X', { seatNo: '7A' }, 'tB').status).toBe('success'); // 別の会員は、自分の1件目
    cancel('EQ-1');
    expect(send('EQ-2', { seatNo: '6A' }).status).toBe('success');
  });

  it('到着時刻をすぎたら、終わった予約。その1分前までは、まだ未終了', () => {
    send('EQ-1'); // 11/20 10:00〜11:00
    setNow('2026-11-20T10:59:00+09:00');
    expect(send('EQ-2', { seatNo: '6A', reservedDate: '2026-11-21' }).code).toBe('active_exists');
    setNow('2026-11-20T11:00:00+09:00');
    expect(send('EQ-2', { seatNo: '6A', reservedDate: '2026-11-21' }).status).toBe('success');
  });

  it('到着時刻が無い予約は、予約日の終わり(翌日の0時)まで、未終了', () => {
    send('EQ-1', { arrivalTime: '', departureTime: '' });
    setNow('2026-11-20T23:59:00+09:00');
    expect(send('EQ-2', { seatNo: '6A', reservedDate: '2026-11-22' }).code).toBe('active_exists');
    setNow('2026-11-21T00:00:00+09:00');
    expect(send('EQ-2', { seatNo: '6A', reservedDate: '2026-11-22' }).status).toBe('success');
  });

  it('日付も到着時刻も無い予約は、予約日時から24時間', () => {
    send('EQ-1');
    const r = rowOf('EQ-1');
    r[col('予約日')] = '';
    r[col('到着時刻')] = '';
    r[col('予約日時')] = '2026/11/20 09:00:00';
    setNow('2026-11-21T08:59:00+09:00');
    expect(send('EQ-2', { seatNo: '6A', reservedDate: '2026-11-22' }).code).toBe('active_exists');
    setNow('2026-11-21T09:00:00+09:00');
    expect(send('EQ-2', { seatNo: '6A', reservedDate: '2026-11-22' }).status).toBe('success');
  });

  it('公開前のアプリ(awardPoints なし)は、断らない。プロパティを切ると、断らない', () => {
    send('EQ-1');
    expect(send('EQ-2', { seatNo: '6A' }, 'tA', false).status).toBe('success');
    delete props.ENFORCE_ONE_ACTIVE;
    expect(send('EQ-3', { seatNo: '7A' }).status).toBe('success');
  });
});

describe('② 同じ席の、重なる区間の予約を断る', () => {
  // 別の会員(M2)が、すでに予約している席を、M1 が取ろうとする
  const taken = (over: Record<string, unknown> = {}) => {
    const r = send('EQ-OTHER', { boardIdx: 0, destIdx: 3, ...over }, 'tB');
    expect(r.status, '先に取られた席の予約').toBe('success');
    return r;
  };

  it('同じ日・列車・号車・席で、区間が重なれば、断る(code: seat_taken)', () => {
    taken();
    const r = send('EQ-1', { boardIdx: 2, destIdx: 5 });
    expect(r).toMatchObject({ status: 'error', code: 'seat_taken', message: REFUSED_SEAT });
    expect(grid).toHaveLength(2);
  });

  it('降車駅 = 次の人の乗車駅 は、重ならない(通る)。手前・先でも、重ならなければ通る', () => {
    taken(); // [0,3)
    expect(send('EQ-1', { boardIdx: 3, destIdx: 6 }).status).toBe('success');
    cancel('EQ-1');
    expect(send('EQ-2', { boardIdx: 3, destIdx: 4 }).status).toBe('success');
  });

  it('区間が、包む・包まれる・同じ、のときも、断る(前後どちらの順でも)', () => {
    taken({ boardIdx: 2, destIdx: 4 });
    expect(send('EQ-1', { boardIdx: 0, destIdx: 9 }).code).toBe('seat_taken');
    expect(send('EQ-2', { boardIdx: 3, destIdx: 4 }).code).toBe('seat_taken');
    expect(send('EQ-3', { boardIdx: 2, destIdx: 4 }).code).toBe('seat_taken');
    expect(send('EQ-4', { boardIdx: 0, destIdx: 2 }).status).toBe('success'); // 手前で降りる
  });

  it('区間の番号が無いときは、全区間として扱う(アプリが、まだ番号を送らないとき)', () => {
    taken({ boardIdx: undefined, destIdx: undefined }); // 全区間
    expect(send('EQ-1', { boardIdx: 8, destIdx: 9 }).code).toBe('seat_taken');
    cancel('EQ-OTHER');
    expect(send('EQ-OTHER2', { boardIdx: 0, destIdx: 3 }, 'tB').status).toBe('success'); // [0,3)
    expect(send('EQ-2', {}).code).toBe('seat_taken'); // 新しい予約が、番号なし = 全区間
  });

  it('番号が変(逆順・同じ・数でない)は、番号なしと同じ(全区間)。台帳には、空で入る', () => {
    expect(send('EQ-1', { boardIdx: 5, destIdx: 2 }).status).toBe('success');
    expect(rowOf('EQ-1')[col('乗車駅番号')]).toBe('');
    expect(rowOf('EQ-1')[col('降車駅番号')]).toBe('');
    expect(send('EQ-2', { boardIdx: 'あ', destIdx: 3 }, 'tB').code).toBe('seat_taken');
    expect(send('EQ-3', { boardIdx: 2, destIdx: 2 }, 'tB').code).toBe('seat_taken');
  });

  it('区間の番号は、数なら、台帳の「乗車駅番号」「降車駅番号」に書く(数の文字も受ける)', () => {
    expect(send('EQ-1', { boardIdx: 1, destIdx: 4 }).status).toBe('success');
    expect(rowOf('EQ-1')[col('乗車駅番号')]).toBe(1);
    expect(rowOf('EQ-1')[col('降車駅番号')]).toBe(4);
    cancel('EQ-1');
    expect(send('EQ-2', { boardIdx: '2', destIdx: '5', seatNo: '9A' }, 'tB').status).toBe('success');
    expect(rowOf('EQ-2')[col('乗車駅番号')]).toBe(2);
  });

  it('日・列車・号車・席のどれかが違えば、重ならない', () => {
    taken();
    for (const [i, over] of [{ seatNo: '5B' }, { carNo: 4 }, { trainName: '特急あやみ 103号' }, { reservedDate: '2026-11-21' }].entries()) {
      if (i > 0) cancel(`EQ-${i - 1}`); // 1人1件の決まりに当たらないよう、前の予約は取り消す
      expect(send(`EQ-${i}`, { boardIdx: 0, destIdx: 3, ...over }).status, JSON.stringify(over)).toBe('success');
    }
  });

  it('取り消された予約は、席をふさがない', () => {
    taken();
    cancel('EQ-OTHER');
    expect(send('EQ-1', { boardIdx: 0, destIdx: 3 }).status).toBe('success');
  });

  it('自由席は、対象外(同じ号車で、何人でも)', () => {
    expect(send('EQ-OTHER', { seatNo: '自由席×3', seatType: 'standard', totalPrice: 2250 }, 'tB').status).toBe('success');
    expect(send('EQ-1', { seatNo: '自由席×3', seatType: 'standard', totalPrice: 2250 }).status).toBe('success'); // 同じ表記でも、席ではないので、重ならない
    cancel('EQ-1'); // 1人1件の決まりに当たらないよう、取り消してから
    expect(send('EQ-2', { seatNo: '自由席', seatType: 'standard' }).status).toBe('success');
  });

  it('複数席は、1席でも重なれば断る。重ならなければ通る', () => {
    const two = { totalPrice: 3080, boardIdx: 0, destIdx: 3 }; // 2席ぶんの金額
    expect(send('EQ-OTHER', { seatNo: '4B,4C', ...two }, 'tB').status).toBe('success');
    expect(send('EQ-1', { seatNo: '4C,4D', ...two }).code).toBe('seat_taken');
    expect(send('EQ-2', { seatNo: '4A,4D', ...two }).status).toBe('success');
  });

  it('同じ予約番号の更新は、自分の行を除いて調べる。席を変えて、ほかの人の席に重なるときは、断る', () => {
    taken({ seatNo: '8A' });
    expect(send('EQ-1', { boardIdx: 0, destIdx: 3 }).status).toBe('success');
    expect(send('EQ-1', { boardIdx: 0, destIdx: 3, totalPrice: 2000 }).status).toBe('success'); // 自分の席の更新
    expect(send('EQ-1', { seatNo: '8A', boardIdx: 1, destIdx: 2 }).code).toBe('seat_taken'); // 8A は、ほかの人
    expect(rowOf('EQ-1')[col('座席番号')]).toBe('5A'); // 台帳は、変わっていない
  });

  it('公開前のアプリ(awardPoints なし)は、断らない。プロパティを切ると、断らない', () => {
    taken();
    expect(send('EQ-1', { boardIdx: 0, destIdx: 3 }, 'tA', false).status).toBe('success');
    cancel('EQ-1');
    delete props.ENFORCE_SEAT_CONFLICT;
    expect(send('EQ-2', { boardIdx: 0, destIdx: 3 }).status).toBe('success');
  });

  it('断られたときは、ポイントも付かず、台帳にも書かれない', () => {
    taken();
    const before = grid.length;
    send('EQ-1', { boardIdx: 0, destIdx: 3 });
    expect(grid).toHaveLength(before);
  });
});
