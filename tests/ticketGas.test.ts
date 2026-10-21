// サーバー(gas/Code.gs)の QR乗車券(署名・検札・「利用する」)を、スプレッドシートの代わりの表で動かして調べる。
// Code.gs を、そのまま読み込んで、Google のサービス(シート・ロック・鍵・時計)だけを、作りものに差し替える。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;

const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

const pad = (n: number) => String(n).padStart(2, '0');
const jst = (ms: number) => {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    sec: pad(d.getUTCSeconds()),
  };
};

let nowMs = 0;
let rows: unknown[][] = [];
let events: string[] = [];
let lockFails = false;
let gas: Gas;

// ctx の中の「今」を、テストで決めた時刻にする
class FakeDate extends Date {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(nowMs);
    else super(...(args as [string]));
  }
  static now() {
    return nowMs;
  }
}

const at = (iso: string) => {
  nowMs = Date.parse(iso);
};

const loadGas = (): Gas => {
  const props = new Map<string, string>();
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    appendRow: (r: unknown[]) => void rows.push([...r]),
    getLastRow: () => rows.length,
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({
      setValues: (v: unknown[][]) => {
        events.push(`setValues:${r}`);
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = v[i][j];
      },
      setValue: (v: unknown) => {
        events.push(`setValue:${r}:${c}`);
        rows[r - 1][c - 1] = v;
      },
      setNumberFormat: () => undefined,
    }),
  };
  const ctx: Gas = {
    Date: FakeDate,
    Logger: { log: () => undefined },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          if (lockFails) throw new Error('busy');
          events.push('lock');
        },
        releaseLock: () => void events.push('release'),
      }),
    },
    Utilities: {
      formatDate: (d: Date, _tz: string, pattern: string) => {
        const j = jst(d.getTime());
        if (pattern === 'yyyy-MM-dd') return j.date;
        if (pattern === 'HH:mm') return j.time;
        return `${j.date.replace(/-/g, '/')} ${j.time}:${j.sec}`;
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
  ctx.createJsonResponse = (d: unknown) => d;
  ctx.getOrCreateReservationsSheet = () => sheet;
  ctx.getDataSpreadsheet = () => ({ getSheetByName: () => sheet });
  ctx.authMember = (token: string) =>
    token === 'ok1' ? { memberId: 'M1' } : token === 'ok2' ? { memberId: 'M2' } : { error: { status: 'error', code: 'session' } };
  ctx.verifySessionToken = (token: string) => (token === 'ok1' ? 'M1' : null);
  ctx.findMemberById = (id: string) => ({ memberId: id, lineUserId: 'U-line-secret' });
  return ctx;
};

const headers = (): string[] => vm.runInContext('RESERVATION_HEADERS', gas);

interface Opt {
  orderId?: string;
  member?: string;
  status?: string;
  date?: string;
  dep?: string;
  arr?: string;
  boardedAt?: string;
}

const put = (o: Opt = {}) => {
  const v: Record<string, unknown> = {
    予約日時: '2026/11/03 08:00:00',
    予約番号: o.orderId ?? 'EQ-12345',
    LINE_USER_ID: 'U-line-secret',
    列車名: '特急めぐり3号',
    号車: 3,
    座席番号: '5A',
    席種: 'reserved',
    乗車駅: '神埼',
    降車駅: '東桜',
    合計金額: 1980,
    ステータス: o.status ?? '予約確定',
    会員ID: o.member ?? 'M1',
    予約日: o.date ?? '2026-11-03',
    出発時刻: o.dep ?? '10:15',
    到着時刻: o.arr ?? '11:40',
    乗車日時: o.boardedAt ?? '',
  };
  rows.push(headers().map((h) => v[h] ?? ''));
};

const col = (name: string) => headers().indexOf(name);
const boardedAtOf = (rowIndex = 1) => rows[rowIndex][col('乗車日時')];

const tokenOf = (orderId = 'EQ-12345', member = 'ok1') => gas.handleGetTicket(member, orderId).token as string;

beforeEach(() => {
  at('2026-11-03T09:00:00+09:00');
  events = [];
  lockFails = false;
  gas = loadGas();
  rows = [headers()];
});

describe('QR乗車券: トークン', () => {
  it('台帳の列に「乗車日時」がある', () => {
    expect(headers()).toContain('乗車日時');
  });

  it('持ち主に、予約番号+署名(12文字)のトークンが返り、その場で検札できる', () => {
    put();
    const r = gas.handleGetTicket('ok1', 'EQ-12345');
    expect(r.status).toBe('success');
    expect(r.token).toMatch(/^EQ-12345\.[A-Za-z0-9_-]{12}$/);
    expect(r.state).toBe('valid');
    const v = gas.handleVerifyTicket(r.token);
    expect(v.state).toBe('valid');
    expect(v.ticket).toEqual({
      trainName: '特急めぐり3号',
      boardingStation: '神埼',
      destinationStation: '東桜',
      carNo: 3,
      seatNo: '5A',
      seatType: 'reserved',
      reservedDate: '2026-11-03',
      departureTime: '10:15',
      arrivalTime: '11:40',
    });
  });

  it('署名は、同じ予約番号なら同じ・違う予約番号なら違う', () => {
    put();
    put({ orderId: 'EQ-22222' });
    expect(tokenOf('EQ-12345')).toBe(tokenOf('EQ-12345'));
    expect(tokenOf('EQ-12345').split('.')[1]).not.toBe(tokenOf('EQ-22222').split('.')[1]);
  });

  it('改ざん・でたらめなトークンは invalid で、券の中身を返さない', () => {
    put();
    const good = tokenOf();
    const [id, sig] = good.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    const bad = [
      `${id}.${flipped}`,
      `EQ-12346.${sig}`,
      id,
      `${id}.`,
      `${id}.${sig.slice(0, 11)}`,
      `${id}.${sig}x`,
      `${id}.${sig} `,
      '',
      '.',
      `${id}.${'A'.repeat(12)}`,
      null,
      undefined,
      12345,
      { token: good },
    ];
    for (const t of bad) {
      expect(gas.handleVerifyTicket(t)).toEqual({ status: 'success', state: 'invalid' });
      expect(gas.handleUseTicket(t)).toEqual({ status: 'success', state: 'invalid' });
    }
    expect(boardedAtOf()).toBe('');
  });

  it('署名が正しくても、台帳に無い予約は invalid', () => {
    put();
    const t = tokenOf();
    rows.length = 1;
    expect(gas.handleVerifyTicket(t)).toEqual({ status: 'success', state: 'invalid' });
  });

  it('他人の予約・未登録の予約は、持ち主でも署名を受け取れない。ログイン証が無くても同じ', () => {
    put();
    expect(gas.handleGetTicket('ok2', 'EQ-12345').status).toBe('error');
    expect(gas.handleGetTicket('ok1', 'EQ-99999').code).toBe('ticket_not_ready');
    expect(gas.handleGetTicket('ok1', '../x').status).toBe('error');
    expect(gas.handleGetTicket('none', 'EQ-12345').code).toBe('session');
  });
});

describe('QR乗車券: 状態', () => {
  const stateOf = () => gas.handleVerifyTicket(tokenOf()).state;

  it('当日で到着前は valid(朝に夜の列車の券を読んでも valid)', () => {
    put({ dep: '22:00', arr: '23:30' });
    expect(stateOf()).toBe('valid');
  });

  it('到着時刻をすぎたら expired', () => {
    put();
    at('2026-11-03T11:40:00+09:00');
    expect(stateOf()).toBe('expired');
  });

  it('過去の日付は expired', () => {
    put({ date: '2026-11-02' });
    expect(stateOf()).toBe('expired');
  });

  it('日またぎの夜行(昨日の予約で、いま乗っている)は valid。到着をすぎたら expired', () => {
    put({ date: '2026-11-02', dep: '23:00', arr: '01:00' });
    at('2026-11-03T00:30:00+09:00');
    expect(stateOf()).toBe('valid');
    at('2026-11-03T01:00:00+09:00');
    expect(stateOf()).toBe('expired');
  });

  it('予約日が先の日付なら otherDay(日付と列車は返す)', () => {
    put({ date: '2026-11-04' });
    const v = gas.handleVerifyTicket(tokenOf());
    expect(v.state).toBe('otherDay');
    expect(v.ticket.reservedDate).toBe('2026-11-04');
  });

  it('取り消した予約は cancelled', () => {
    put({ status: 'キャンセル' });
    expect(stateOf()).toBe('cancelled');
  });

  it('乗車済みは used(時刻つき)。期限をすぎても used', () => {
    put({ boardedAt: '2026/11/03 10:32:10' });
    const v = gas.handleVerifyTicket(tokenOf());
    expect(v.state).toBe('used');
    expect(v.usedAt).toBe('10:32');
    at('2026-11-03T12:00:00+09:00');
    expect(stateOf()).toBe('used');
  });

  it('日付と時刻の無い古い行は、期限なしの valid', () => {
    put({ date: '', dep: '', arr: '' });
    expect(stateOf()).toBe('valid');
  });
});

describe('QR乗車券: 利用する', () => {
  it('有効な券を乗車済みにする。ロックの中で書く', () => {
    put();
    const t = tokenOf();
    events = [];
    at('2026-11-03T10:32:10+09:00');
    const r = gas.handleUseTicket(t);
    expect(r.state).toBe('used');
    expect(r.justUsed).toBe(true);
    expect(r.usedAt).toBe('10:32');
    expect(boardedAtOf()).toBe('2026/11/03 10:32:10');
    expect(events).toEqual(['lock', `setValue:2:${col('乗車日時') + 1}`, 'release']);
  });

  it('2回目は used のまま。書き込みは1回だけ', () => {
    put();
    const t = tokenOf();
    events = [];
    at('2026-11-03T10:32:10+09:00');
    gas.handleUseTicket(t);
    at('2026-11-03T10:40:00+09:00');
    const second = gas.handleUseTicket(t);
    expect(second.state).toBe('used');
    expect(second.justUsed).toBeUndefined();
    expect(second.usedAt).toBe('10:32');
    expect(events.filter((e) => e.startsWith('setValue'))).toHaveLength(1);
    expect(boardedAtOf()).toBe('2026/11/03 10:32:10');
  });

  it('ロックを取ったあとで読み直す(同時に押した2人目は、1人目の書き込みを見て used になる)', () => {
    put();
    const t = tokenOf();
    // 2人目がロックを待っているあいだに、1人目が書き終わった状態を作る
    gas.withScriptLock = (fn: () => unknown) => {
      rows[1][col('乗車日時')] = '2026/11/03 09:00:01';
      return fn();
    };
    const r = gas.handleUseTicket(t);
    expect(r.state).toBe('used');
    expect(r.justUsed).toBeUndefined();
    expect(rows[1][col('乗車日時')]).toBe('2026/11/03 09:00:01');
  });

  it('有効でない券(別の日・取消済み・期限切れ)には書かない', () => {
    put({ orderId: 'EQ-11111', date: '2026-11-04' });
    put({ orderId: 'EQ-22222', status: 'キャンセル' });
    put({ orderId: 'EQ-33333', date: '2026-11-02' });
    const tokens = ['EQ-11111', 'EQ-22222', 'EQ-33333'].map((id) => tokenOf(id));
    events = [];
    expect(tokens.map((t) => gas.handleUseTicket(t).state)).toEqual(['otherDay', 'cancelled', 'expired']);
    expect(events.filter((e) => e.startsWith('set'))).toEqual([]);
    expect(rows.slice(1).map((r) => r[col('乗車日時')])).toEqual(['', '', '']);
  });

  it('ロックが取れないときは、書かずに断る', () => {
    put();
    const t = tokenOf();
    lockFails = true;
    const r = gas.handleUseTicket(t);
    expect(r.status).toBe('error');
    expect(boardedAtOf()).toBe('');
  });
});

describe('QR乗車券: 個人情報を返さない', () => {
  it('検札の応答に、会員ID・LINE のID・金額・台帳の見出しが入らない', () => {
    put();
    const token = tokenOf();
    const all = JSON.stringify([gas.handleVerifyTicket(token), gas.handleUseTicket(token), gas.handleVerifyTicket(token)]);
    for (const secret of ['M1', 'U-line-secret', '1980', '会員ID', 'LINE_USER_ID', '合計金額', 'EQ-12345']) {
      expect(all).not.toContain(secret);
    }
  });
});

describe('QR乗車券: 予約の更新との関係', () => {
  const order = (over: Record<string, unknown> = {}) => ({
    orderId: 'EQ-12345',
    trainName: '特急めぐり3号',
    carNo: 3,
    seatNo: '5A',
    seatType: 'reserved',
    boardingStation: '神埼',
    destinationStation: '東桜',
    totalPrice: 1980,
    reservedDate: '2026-11-03',
    departureTime: '10:15',
    arrivalTime: '11:40',
    ...over,
  });

  it('予約の登録で作った行は、そのまま券として使える(乗車日時は空)', () => {
    gas.handleCreateReservation('ok1', order(), false);
    expect(rows).toHaveLength(2);
    expect(boardedAtOf()).toBe('');
    expect(gas.handleVerifyTicket(tokenOf()).state).toBe('valid');
  });

  it('乗車済みのあとで予約を更新(デリバリーを足す)しても、乗車日時は消えない', () => {
    gas.handleCreateReservation('ok1', order(), false);
    const t = tokenOf();
    at('2026-11-03T10:32:10+09:00');
    gas.handleUseTicket(t);
    gas.handleCreateReservation('ok1', order({ totalPrice: 2480 }), false);
    expect(rows).toHaveLength(2);
    expect(boardedAtOf()).toBe('2026/11/03 10:32:10');
    expect(gas.handleVerifyTicket(t).state).toBe('used');
    expect(gas.handleUseTicket(t).justUsed).toBeUndefined();
  });
});
