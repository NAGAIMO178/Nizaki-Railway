// 運転整理の結果(短い形 CompactResult)の、保存と配信(サーバー gas/Code.gs)。作りものの台帳・キャッシュ・ロック・スクリプトプロパティで動かす(本番にも、管理者トークンの実物にも、触れない)。
// 保存・取得・解除で消える・入り切りが切れていれば返さない・管理者だけ・形と大きさの検査・既存のアクション(運行乱れ・トグル)が壊れていないこと、を調べる。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');
const TOKEN = 'test-admin-token-xyz';
const HOUR = 3600 * 1000;

let gas: Gas;
let sheets: Record<string, unknown[][]>;
let cache: Record<string, string>;
let props: Record<string, string>;
let nowMs: number;
let lockFails: boolean;
let lockCalls: number;
let logs: string[];

type R = { status: string; code?: string; message?: string; result?: unknown; saved?: boolean; enabled?: boolean };
const COMPACT = {
  v: 1,
  cancelled: ['151071', '回151072'],
  trains: [{ no: '106051', o: 3, d: 9, x: [[4, 60, 120], [5, 0, 30]] }, { no: '106053', x: [[2, -30, 0]] }, { no: '106055', d: 7 }],
  pass: [['106051', '106053', 5]],
  hold: [['106055', 4, 90]],
};
const setDisruptions = (d: Record<string, unknown>) => void (props.OPERATION_DISRUPTIONS = JSON.stringify({ disruptions: d, forecasts: [] }));
const delay = (over: Record<string, unknown> = {}) => ({ lineId: 'kanzaki', statusType: 'delay', section: '全線', maxDelayMinutes: 15, targetDirection: 'both', linkToSystem: true, updatedAt: '10:00', ...over });
const save = (result: unknown, token: unknown = TOKEN, basedOn?: unknown) => gas.handleAdminSaveRearrangeResult(token, result, basedOn) as R;
const get = () => gas.handleGetRearrangeResult() as R;
const flag = (on: boolean) => gas.handleAdminSetRearrangeFlag(TOKEN, on) as R;
const post = (body: unknown) => gas.doPost({ postData: { contents: JSON.stringify(body) } }) as R & Record<string, unknown>;
const dataRows = () => (sheets['ダイヤ整理'] ?? []).slice(1);

beforeEach(() => {
  sheets = {};
  cache = {};
  props = { ADMIN_TOKEN: TOKEN, SESSION_SECRET: 'secret-for-tests', REARRANGE_ENABLED: 'true' };
  nowMs = Date.parse('2026-11-23T12:00:00+09:00');
  lockFails = false;
  lockCalls = 0;
  logs = [];
  const ctx: Gas = {
    Logger: { log: (m: string) => void logs.push(m) },
    console: { log: () => undefined, error: () => undefined },
    ContentService: {},
    // ロックの1回目は、管理トークンの確認。2回目以降が、書き込みのロック
    LockService: { getScriptLock: () => ({ waitLock: () => { lockCalls++; if (lockFails && lockCalls > 1) throw new Error('busy'); }, releaseLock: () => undefined }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => void (props[k] = v) }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string) => void (cache[k] = v),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Utilities: {
      formatDate: () => '2026/11/23 12:00:00',
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (payload: string, secret: string) => Array.from(crypto.createHmac('sha256', secret).update(payload).digest()),
      base64EncodeWebSafe: (bytes: number[]) => Buffer.from(bytes.map((b) => b & 0xff)).toString('base64url'),
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
  gas.createJsonResponse = (d: unknown) => d;
  const chain = { setBackground: () => chain, setFontColor: () => chain, setFontWeight: () => chain, setNumberFormat: () => chain };
  const sheetOf = (name: string) => {
    const g = sheets[name];
    return {
      getLastRow: () => g.length,
      appendRow: (r: unknown[]) => void g.push([...r]),
      setFrozenRows: () => undefined,
      getRange: (r: number, c: number, nr = 1, nc = 1) => ({
        ...chain,
        getValues: () => g.slice(r - 1, r - 1 + nr).map((row) => Array.from({ length: nc }, (_, i) => row[c - 1 + i] ?? '')),
        setValues: (vals: unknown[][]) => vals.forEach((vr, ri) => vr.forEach((v, ci) => void (g[r - 1 + ri][c - 1 + ci] = v))),
      }),
    };
  };
  gas.getDataSpreadsheet = () => ({
    getSheetByName: (n: string) => (sheets[n] ? sheetOf(n) : null),
    insertSheet: (n: string) => {
      sheets[n] = [];
      return sheetOf(n);
    },
  });
  setDisruptions({ kanzaki: delay() });
});

describe('保存と取得', () => {
  it('保存して、取得すると、同じ結果が返る(運行乱れが、あるあいだ)。シート「ダイヤ整理」は自動で作る', () => {
    expect(save(COMPACT)).toEqual({ status: 'success', saved: true });
    expect(get()).toEqual({ status: 'success', result: COMPACT });
    expect(sheets['ダイヤ整理'][0]).toEqual(['保存日時', '保存日時(ms)', '運行乱れの印', '保存した側の印', '結果']);
  });

  it('まだ保存されていないときは、null', () => {
    expect(get()).toEqual({ status: 'success', result: null });
  });

  it('保存するたびに、前の結果を置き換える(最新の1件だけ。行は増えない)', () => {
    save(COMPACT);
    const next = { ...COMPACT, cancelled: ['151999'] };
    save(next);
    expect(get().result).toEqual(next);
    expect(dataRows()).toHaveLength(1);
  });

  it('保存したものは、文字として台帳に入る(JSON の文字)。印(basedOn)の、式になる文字は、先頭に「\'」を付ける', () => {
    save(COMPACT, TOKEN, '=HYPERLINK("http://x")');
    expect(typeof dataRows()[0][4]).toBe('string');
    expect(JSON.parse(dataRows()[0][4] as string)).toEqual(COMPACT);
    expect(dataRows()[0][3]).toBe('\'=HYPERLINK("http://x")');
  });

  it('空の結果(変わった列車が無い)も、保存できる', () => {
    const empty = { v: 1, cancelled: [], trains: [], pass: [], hold: [] };
    expect(save(empty).status).toBe('success');
    expect(get().result).toEqual(empty);
  });
});

describe('解除で消える(運行乱れの印が、保存したときと、違えば、null)', () => {
  it('運行乱れが、解除されたら(保存からなくなったら)、null', () => {
    save(COMPACT);
    expect(get().result).not.toBeNull();
    setDisruptions({});
    expect(get().result).toBeNull();
  });

  it('平常(normal)に戻したら、null', () => {
    save(COMPACT);
    setDisruptions({ kanzaki: delay({ statusType: 'normal' }) });
    expect(get().result).toBeNull();
  });

  it('自動解除の時刻が来たら、null(運行乱れの自動解除と、同じ時刻)', () => {
    setDisruptions({ kanzaki: delay({ expiresAtTimestamp: nowMs + HOUR }) });
    save(COMPACT);
    nowMs += HOUR - 1;
    expect(get().result).toEqual(COMPACT);
    nowMs += 1;
    expect(get().result).toBeNull();
    // 自動解除のあとに、遅れて届いた結果は、保存しない
    expect(save(COMPACT).code).toBe('no_disruption');
  });

  it('複数の運行乱れのうち、1つが自動解除されたら、null(印が変わるため。作り直した結果を、保存し直す)', () => {
    setDisruptions({ kanzaki: delay(), tsuchiura: delay({ lineId: 'tsuchiura', expiresAtTimestamp: nowMs + HOUR }) });
    save(COMPACT);
    nowMs += 2 * HOUR;
    expect(get().result).toBeNull();
    expect(save({ ...COMPACT, cancelled: [] }).status).toBe('success');
    expect(get().result).toEqual({ ...COMPACT, cancelled: [] });
  });

  it('運行乱れの内容が、変わったら(更新・区間・遅れ)、null。保存し直すと、返る', () => {
    save(COMPACT);
    for (const over of [{ updatedAt: '10:05' }, { section: '大宮 〜 横浜 間' }, { maxDelayMinutes: 30 }, { statusType: 'suspended' }, { targetDirection: 'up' }]) {
      setDisruptions({ kanzaki: delay(over) });
      expect(get().result, JSON.stringify(over)).toBeNull();
      expect(save(COMPACT).status).toBe('success');
      expect(get().result).toEqual(COMPACT);
      setDisruptions({ kanzaki: delay() });
      save(COMPACT);
    }
  });

  it('平常(normal)だけのときも、「運行乱れが無い」として、保存しない', () => {
    setDisruptions({ kanzaki: delay({ statusType: 'normal' }) });
    expect(save(COMPACT).code).toBe('no_disruption');
    expect(dataRows()).toHaveLength(0);
  });

  it('運行乱れが、いま無いときは、保存しない(code: no_disruption)。書かない', () => {
    setDisruptions({});
    const r = save(COMPACT);
    expect(r.code).toBe('no_disruption');
    expect(dataRows()).toHaveLength(0);
    expect(get().result).toBeNull();
  });

  it('「覚え」が残っていても、解除は、すぐ見える(読むたびに、いまの運行乱れと、照らす)', () => {
    save(COMPACT);
    expect(get().result).not.toBeNull(); // 覚えさせる
    expect(cache['rearrange_result_v1']).toBeTruthy();
    setDisruptions({});
    expect(get().result).toBeNull();
  });

  it('result が null のときは、保存してある結果を消す。保存してある結果が、無くても、成功', () => {
    expect(save(null)).toEqual({ status: 'success', saved: false });
    save(COMPACT);
    expect(save(null)).toEqual({ status: 'success', saved: false });
    expect(get().result).toBeNull();
    expect(dataRows()[0].every((c) => c === '')).toBe(true);
    // 運行乱れが無くても、消すことはできる
    save(COMPACT);
    setDisruptions({});
    expect(save(null).status).toBe('success');
  });

  it('運行乱れの保存・取得・自動解除の仕組みは、そのまま(結果の項目は、混ざらない)', () => {
    save(COMPACT);
    const got = gas.handleGetDisruptions() as unknown as { status: string; disruptions: Record<string, unknown>; forecasts: unknown[] };
    expect(got.status).toBe('success');
    expect(Object.keys(got.disruptions)).toEqual(['kanzaki']);
    expect(JSON.stringify(got)).not.toContain('151071');
    setDisruptions({ kanzaki: delay({ expiresAtTimestamp: nowMs - 1 }) });
    expect(Object.keys((gas.handleGetDisruptions() as unknown as { disruptions: object }).disruptions)).toEqual([]);
  });
});

describe('入り・切り(REARRANGE_ENABLED)が切れているとき', () => {
  it('取得は null。保存は、断って、何も書かない(code: disabled)', () => {
    props.REARRANGE_ENABLED = 'false';
    const r = save(COMPACT);
    expect(r.status).toBe('error');
    expect(r.code).toBe('disabled');
    expect(dataRows()).toHaveLength(0);
    expect(get()).toEqual({ status: 'success', result: null });
  });

  it('設定されたことが無い(初期値)ときも、切れている', () => {
    delete props.REARRANGE_ENABLED;
    expect(save(COMPACT).code).toBe('disabled');
    expect(get().result).toBeNull();
  });

  it('保存したあとに切ると、すぐ null。また入れると、保存してあった結果が、(運行乱れが続いていれば)返る', () => {
    save(COMPACT);
    expect(get().result).not.toBeNull();
    expect(flag(false).enabled).toBe(false);
    expect(get().result).toBeNull();
    expect(flag(true).enabled).toBe(true);
    expect(get().result).toEqual(COMPACT);
  });

  it('切れているときは、結果を消す操作(null)も、何も書かない', () => {
    save(COMPACT);
    props.REARRANGE_ENABLED = 'false';
    cache = {};
    expect(save(null).code).toBe('disabled');
    expect(dataRows()[0][4]).not.toBe('');
  });
});

describe('管理者の確かめ(サーバー側)', () => {
  it('トークンが違う・無いときは、何も保存せず、断る(既存の管理者の返し方)。保存してある結果は、そのまま', () => {
    save(COMPACT);
    const before = JSON.stringify(sheets);
    for (const bad of ['', 'wrong', undefined, null]) {
      cache = {};
      const r = gas.handleAdminSaveRearrangeResult(bad, { ...COMPACT, cancelled: [] }) as R;
      expect(r.status).toBe('error');
      expect(r.code).toBe('admin');
      expect((gas.handleAdminSaveRearrangeResult(bad, null) as R).code).toBe('admin');
    }
    expect(JSON.stringify(sheets)).toBe(before);
    expect(get().result).toEqual(COMPACT);
  });

  it('失敗が続いて止まっているときは、正しいトークンでも断る(admin_locked)', () => {
    for (let i = 0; i < 12; i++) gas.handleAdminSaveRearrangeResult('wrong', COMPACT);
    expect(save(COMPACT).code).toBe('admin_locked');
    expect(dataRows()).toHaveLength(0);
  });

  it('取得は、認証なしで通る', () => {
    save(COMPACT);
    expect(post({ action: 'getRearrangeResult' })).toEqual({ status: 'success', result: COMPACT });
  });
});

describe('形と大きさの検査', () => {
  const refused = (result: unknown, code = 'invalid') => {
    const r = save(result);
    expect(r.status, JSON.stringify(result)?.slice(0, 80)).toBe('error');
    expect(r.code).toBe(code);
    expect(dataRows()).toHaveLength(0);
    expect(get().result).toBeNull();
  };

  it('形が違うものは、断る(値でない・配列・文字・項目の過不足・版が違う)', () => {
    for (const bad of [undefined, 'x', 5, [], true]) refused(bad);
    refused({ ...COMPACT, v: 2 });
    refused({ ...COMPACT, v: '1' });
    refused({ cancelled: [], trains: [], pass: [], hold: [] });
    refused({ ...COMPACT, extra: 1 });
    refused({ ...COMPACT, __proto__x: 1 });
    for (const k of ['cancelled', 'trains', 'pass', 'hold']) {
      refused({ ...COMPACT, [k]: 'x' });
      refused({ ...COMPACT, [k]: {} });
      refused({ ...COMPACT, [k]: null });
    }
  });

  it('列車番号は、英数字・回・_・- の16文字まで(タグ・空白・長すぎるものは、断る)', () => {
    refused({ ...COMPACT, cancelled: ['<script>alert(1)</script>'] });
    refused({ ...COMPACT, cancelled: ['a b'] });
    refused({ ...COMPACT, cancelled: [''] });
    refused({ ...COMPACT, cancelled: ['x'.repeat(17)] });
    refused({ ...COMPACT, cancelled: [151071] });
    refused({ ...COMPACT, trains: [{ no: '=1+1' }] });
    refused({ ...COMPACT, pass: [['1;DROP', '106053', 5]] });
    refused({ ...COMPACT, hold: [['106051\n', 4, 90]] });
    expect(save({ ...COMPACT, cancelled: ['x'.repeat(16)] }).status).toBe('success');
  });

  it('列車の項目: 知らない項目・駅番号の範囲・整数でない・x の形・遅れの範囲は、断る', () => {
    refused({ ...COMPACT, trains: [{ no: '106051', z: 1 }] });
    refused({ ...COMPACT, trains: [{ no: '106051', o: -1 }] });
    refused({ ...COMPACT, trains: [{ no: '106051', o: 1000 }] });
    refused({ ...COMPACT, trains: [{ no: '106051', d: 1.5 }] });
    refused({ ...COMPACT, trains: [{ no: '106051', o: '3' }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: [[4, 60]] }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: [[4, 60, 120, 5]] }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: [[4, 'a', 120]] }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: [[1000, 0, 0]] }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: [[4, 172801, 0]] }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: [[4, 0, -86401]] }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: [[4, 0.5, 0]] }] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: 'x' }] });
    refused({ ...COMPACT, trains: [null] });
    refused({ ...COMPACT, trains: [[]] });
    refused({ ...COMPACT, trains: [{ no: '106051', x: Array.from({ length: 201 }, () => [1, 0, 0]) }] });
    expect(save({ ...COMPACT, trains: [{ no: '106051', x: Array.from({ length: 200 }, () => [999, 172800, -86400]) }] }).status).toBe('success');
  });

  it('待避・待機の形: 3つ組・駅番号と秒の範囲を、確かめる', () => {
    refused({ ...COMPACT, pass: [['106051', '106053']] });
    refused({ ...COMPACT, pass: [['106051', '106053', 1000]] });
    refused({ ...COMPACT, pass: [['106051', 106053, 5]] });
    refused({ ...COMPACT, hold: [['106051', 4]] });
    refused({ ...COMPACT, hold: [['106051', 4, 86401]] });
    refused({ ...COMPACT, hold: [['106051', 4, -1]] });
    refused({ ...COMPACT, hold: [['106051', 4.5, 1]] });
    expect(save({ ...COMPACT, hold: [['106051', 999, 86400]] }).status).toBe('success');
  });

  it('件数: それぞれ2000件まで。2001件は断る', () => {
    refused({ ...COMPACT, cancelled: Array.from({ length: 2001 }, (_, i) => `t${i}`) });
    refused({ ...COMPACT, pass: Array.from({ length: 2001 }, () => ['a', 'b', 1]) });
    refused({ ...COMPACT, hold: Array.from({ length: 2001 }, () => ['a', 1, 1]) });
    refused({ ...COMPACT, trains: Array.from({ length: 2001 }, (_, i) => ({ no: `t${i}` })) });
  });

  it('大きさ: 5万字未満。極端な場合(約22,000字)は通り、5万字以上は、too_large', () => {
    const train = (i: number) => ({ no: `10${String(i).padStart(4, '0')}`, o: 12, d: 30, x: Array.from({ length: 12 }, (_, j) => [j, 120000 + j, 86000 - j]) });
    const big = { v: 1, cancelled: [], trains: Array.from({ length: 130 }, (_, i) => train(i)), pass: [], hold: [] };
    const len = JSON.stringify(big).length;
    expect(len).toBeGreaterThan(20000);
    expect(len).toBeLessThan(50000);
    expect(save(big).status).toBe('success');
    expect(get().result).toEqual(big);
    const tooBig = { v: 1, cancelled: [], trains: Array.from({ length: 400 }, (_, i) => train(i)), pass: [], hold: [] };
    expect(JSON.stringify(tooBig).length).toBeGreaterThanOrEqual(50000);
    const r = save(tooBig);
    expect(r.code).toBe('too_large');
    expect(get().result).toEqual(big); // 前の結果は、そのまま
  });

  it('5万字ちょうどの境目: 49,999字は通り、50,000字は、too_large', () => {
    const heavy = (i: number) => ({ no: `h${i}`, x: Array.from({ length: 200 }, () => [999, 172800, -86400]) });
    const build = (target: number) => {
      const trains = Array.from({ length: 11 }, (_, i) => heavy(i));
      const make = (n: number, extra: number) => ({ v: 1, cancelled: [...Array.from({ length: n }, () => 'a'.repeat(16)), ...(extra ? ['b'.repeat(extra)] : [])], trains, pass: [], hold: [] });
      for (let n = 0; n < 2000; n++) {
        for (let extra = 0; extra <= 16; extra++) {
          if (JSON.stringify(make(n, extra)).length === target) return make(n, extra);
        }
      }
      throw new Error('長さを合わせられない');
    };
    const ok = build(49999);
    const ng = build(50000);
    expect(JSON.stringify(ok).length).toBe(49999);
    expect(JSON.stringify(ng).length).toBe(50000);
    expect(save(ok).status).toBe('success');
    expect(save(ng).code).toBe('too_large');
    expect(get().result).toEqual(ok);
  });

  it('受け取っていない項目は、保存しない(整えて、組み立て直す)', () => {
    const r = save({ ...COMPACT, trains: [{ no: '106051', o: 3 }] });
    expect(r.status).toBe('success');
    expect(get().result).toEqual({ ...COMPACT, trains: [{ no: '106051', o: 3 }] });
  });

  it('基にした運行乱れの印(basedOn)は、文字の100文字まで(任意)', () => {
    expect(save(COMPACT, TOKEN, 'a'.repeat(100)).status).toBe('success');
    expect(save(COMPACT, TOKEN, 'a'.repeat(101)).code).toBe('invalid');
    expect(save(COMPACT, TOKEN, 5).code).toBe('invalid');
    expect(save(COMPACT, TOKEN, {}).code).toBe('invalid');
    expect(save(COMPACT, TOKEN, null).status).toBe('success');
  });
});

describe('ロック・失敗・覚え', () => {
  it('書き込みのロックが取れないときは、busy(書かない・覚えも、消さない)', () => {
    save(COMPACT);
    get(); // 覚えさせる
    const cached = cache['rearrange_result_v1'];
    lockFails = true;
    lockCalls = 0;
    const r = save({ ...COMPACT, cancelled: [] });
    expect(r.code).toBe('busy');
    expect(cache['rearrange_result_v1']).toBe(cached);
    lockFails = false;
    expect(get().result).toEqual(COMPACT);
  });

  it('台帳の失敗は、内部の詳細を返さない(server_error)', () => {
    gas.getDataSpreadsheet = () => { throw new Error('権限がありません: secret'); };
    const a = save(COMPACT);
    const b = get();
    for (const r of [a, b]) {
      expect(r.code).toBe('server_error');
      expect(JSON.stringify(r)).not.toContain('secret');
    }
  });

  it('保存してある行が壊れていても、null を返す(返さない)', () => {
    save(COMPACT);
    dataRows()[0][4] = '{こわれた';
    cache = {};
    expect(get()).toEqual({ status: 'success', result: null });
  });

  it('取得は、30秒だけ、保存した行を覚える。保存すると、覚えを消す', () => {
    save(COMPACT);
    get();
    expect(cache['rearrange_result_v1']).toBeTruthy();
    save({ ...COMPACT, cancelled: ['151000'] });
    expect(cache['rearrange_result_v1']).toBeUndefined();
    expect((get().result as { cancelled: string[] }).cancelled).toEqual(['151000']);
  });
});

describe('doPost の入口と、既存のアクション', () => {
  it('adminSaveRearrangeResult は、トークンが要る。basedOn も渡せる。getRearrangeResult は、認証なし', () => {
    expect(post({ action: 'adminSaveRearrangeResult', result: COMPACT }).code).toBe('admin');
    expect(post({ action: 'adminSaveRearrangeResult', adminToken: TOKEN, result: COMPACT, basedOn: 'rev-7' })).toEqual({ status: 'success', saved: true });
    expect(dataRows()[0][3]).toBe('rev-7');
    expect(post({ action: 'getRearrangeResult' })).toEqual({ status: 'success', result: COMPACT });
  });

  it('既存のアクション(トグル・運行乱れの保存と取得・管理トークンの確認)は、そのまま動く', () => {
    expect(post({ action: 'getRearrangeFlag' })).toEqual({ status: 'success', enabled: true });
    expect(post({ action: 'adminSetRearrangeFlag', adminToken: TOKEN, enabled: false })).toEqual({ status: 'success', enabled: false });
    expect(post({ action: 'getRearrangeFlag' })).toEqual({ status: 'success', enabled: false });
    cache = {};
    expect(post({ action: 'verifyAdminToken', adminToken: TOKEN }).status).toBe('success');
    expect(post({ action: 'setDisruptions', adminToken: TOKEN, disruptions: { tsuchiura: delay({ lineId: 'tsuchiura' }) }, forecasts: [] }).status).toBe('success');
    const got = post({ action: 'getDisruptions' }) as unknown as { disruptions: Record<string, unknown> };
    expect(Object.keys(got.disruptions)).toEqual(['tsuchiura']);
  });
});
