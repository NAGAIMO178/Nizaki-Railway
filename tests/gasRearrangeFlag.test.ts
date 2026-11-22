// 運転整理(ダイヤ整理案)の、入り・切り(サーバー gas/Code.gs): 1つの真偽をスクリプトプロパティに持つ。作りもの(本番には、何も書き込まない)。
// 初めは切れている・入れて読むと入っている・切ると戻る・管理者だけが書ける・boolean 以外は断る・30秒の覚えは書くと消える・既存のアクションは壊れていない。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');
const TOKEN = 'test-admin-token-xyz';

let gas: Gas;
let cache: Record<string, string>;
let cachePuts: { key: string; seconds: number }[];
let props: Record<string, string>;
let lockFails: boolean;
let lockCalls: number;
let propReads: number;

type R = { status: string; code?: string; message?: string; enabled?: boolean };
const get = () => gas.handleGetRearrangeFlag() as R;
const set = (enabled: unknown, token: unknown = TOKEN) => gas.handleAdminSetRearrangeFlag(token, enabled) as R;
const post = (body: unknown) => gas.doPost({ postData: { contents: JSON.stringify(body) } }) as R & Record<string, unknown>;

beforeEach(() => {
  cache = {};
  cachePuts = [];
  props = { ADMIN_TOKEN: TOKEN };
  lockFails = false;
  lockCalls = 0;
  propReads = 0;
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    ContentService: {},
    // ロックの1回目は、管理トークンの確認。2回目以降が、書き込みのロック
    LockService: { getScriptLock: () => ({ waitLock: () => { lockCalls++; if (lockFails && lockCalls > 1) throw new Error('busy'); }, releaseLock: () => undefined }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => {
          if (k === 'REARRANGE_ENABLED') propReads++;
          return props[k] ?? null;
        },
        setProperty: (k: string, v: string) => void (props[k] = v),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string, s: number) => void ((cache[k] = v), cachePuts.push({ key: k, seconds: s })),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Utilities: { formatDate: () => '2026/11/23 12:00:00', getUuid: () => 'uuid' },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  gas = ctx;
  gas.createJsonResponse = (d: unknown) => d;
});

describe('読む(getRearrangeFlag。認証なし)', () => {
  it('一度も設定されていないときは、enabled: false(初めは、切れている)', () => {
    expect(get()).toEqual({ status: 'success', enabled: false });
    expect(props.REARRANGE_ENABLED).toBeUndefined(); // 読むだけでは、何も書かない
  });

  it('入れると、入っている。切ると、戻る(何度でも)', () => {
    expect(set(true)).toEqual({ status: 'success', enabled: true });
    expect(get().enabled).toBe(true);
    expect(set(false)).toEqual({ status: 'success', enabled: false });
    expect(get().enabled).toBe(false);
    expect(set(true).enabled).toBe(true);
    expect(get().enabled).toBe(true);
  });

  it('保存された値が、文字の true のときだけ、入っている(壊れた値・ほかの文字は、切れている)', () => {
    for (const v of ['false', '', 'TRUE', '1', 'yes', 'null']) {
      props.REARRANGE_ENABLED = v;
      cache = {};
      expect(get().enabled, v).toBe(false);
    }
    props.REARRANGE_ENABLED = 'true';
    cache = {};
    expect(get().enabled).toBe(true);
  });

  it('30秒だけ覚える。覚えているあいだは、保存を読み直さない', () => {
    props.REARRANGE_ENABLED = 'true';
    expect(get().enabled).toBe(true);
    expect(cachePuts).toEqual([{ key: 'rearrange_flag_v1', seconds: 30 }]);
    expect(propReads).toBe(1);
    expect(get().enabled).toBe(true);
    expect(propReads).toBe(1);
    // 保存を直接変えても、覚えているあいだは、同じ答え(30秒たつと、覚えが消えて、読み直す)
    props.REARRANGE_ENABLED = 'false';
    expect(get().enabled).toBe(true);
    cache = {};
    expect(get().enabled).toBe(false);
  });

  it('切れている状態も、覚える(読むたびに、保存を読まない)', () => {
    get();
    get();
    expect(propReads).toBe(1);
  });

  it('覚えられなくても(キャッシュの書き込みが失敗しても)、読める', () => {
    props.REARRANGE_ENABLED = 'true';
    gas.CacheService = { getScriptCache: () => ({ get: () => null, put: () => { throw new Error('too large'); }, remove: () => undefined }) };
    expect(get()).toEqual({ status: 'success', enabled: true });
  });
});

describe('書く(adminSetRearrangeFlag。管理者だけ)', () => {
  it('管理トークンが違う・無いときは、何も書かず、断る(既存の管理者の返し方)', () => {
    for (const bad of ['', 'wrong', undefined, null]) {
      cache = {};
      const r = gas.handleAdminSetRearrangeFlag(bad, true) as R; // 既定の引数に置き換わらないよう、直接呼ぶ
      expect(r.status).toBe('error');
      expect(r.code).toBe('admin');
    }
    expect(props.REARRANGE_ENABLED).toBeUndefined();
    expect(get().enabled).toBe(false);
  });

  it('トークンの失敗が続いて止まっているときは、正しいトークンでも断る(admin_locked)', () => {
    for (let i = 0; i < 12; i++) set(true, 'wrong');
    expect(set(true).code).toBe('admin_locked');
    expect(props.REARRANGE_ENABLED).toBeUndefined();
  });

  it('管理トークンが、サーバーに設定されていないときは、断る', () => {
    delete props.ADMIN_TOKEN;
    expect(set(true, TOKEN).code).toBe('admin');
    expect(props.REARRANGE_ENABLED).toBeUndefined();
  });

  it('enabled が boolean でないときは、拒否して、書かない(文字の "true"・数・null・無し・配列・オブジェクト)', () => {
    for (const bad of ['true', 'false', 1, 0, null, undefined, [], {}, 'yes']) {
      cache = {};
      const r = set(bad);
      expect(r.status, JSON.stringify(bad)).toBe('error');
      expect(r.code).toBe('invalid');
    }
    expect(props.REARRANGE_ENABLED).toBeUndefined();
    expect(get().enabled).toBe(false);
  });

  it('書くと、30秒の覚えを消す(切り替えが、すぐ反映される)', () => {
    expect(get().enabled).toBe(false); // 切れている状態を、覚えさせる
    expect(cache['rearrange_flag_v1']).toBe('0');
    set(true);
    expect(cache['rearrange_flag_v1']).toBeUndefined();
    expect(get().enabled).toBe(true);
    expect(cache['rearrange_flag_v1']).toBe('1');
    set(false);
    expect(get().enabled).toBe(false);
  });

  it('保存は、スクリプトプロパティ REARRANGE_ENABLED に、文字の true / false で入る', () => {
    set(true);
    expect(props.REARRANGE_ENABLED).toBe('true');
    set(false);
    expect(props.REARRANGE_ENABLED).toBe('false');
  });

  it('書き込みのロックが取れないときは、busy(書かない・覚えも消さない)', () => {
    set(false); // 切れている
    expect(get().enabled).toBe(false);
    lockFails = true;
    lockCalls = 0;
    const r = set(true);
    expect(r.code).toBe('busy');
    expect(props.REARRANGE_ENABLED).toBe('false');
    expect(cache['rearrange_flag_v1']).toBe('0');
  });

  it('保存の失敗は、内部の詳細を返さない(server_error)', () => {
    gas.PropertiesService = { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: () => { throw new Error('権限がありません: secret'); } }) };
    const r = set(true);
    expect(r.code).toBe('server_error');
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('読み出しの失敗も、内部の詳細を返さない(server_error)', () => {
    gas.PropertiesService = { getScriptProperties: () => ({ getProperty: () => { throw new Error('secret'); } }) };
    const r = get();
    expect(r.code).toBe('server_error');
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});

describe('doPost の入口と、既存のアクション', () => {
  it('getRearrangeFlag は、認証なしで通る。adminSetRearrangeFlag は、トークンが要る', () => {
    expect(post({ action: 'getRearrangeFlag' })).toEqual({ status: 'success', enabled: false });
    expect(post({ action: 'adminSetRearrangeFlag', enabled: true }).code).toBe('admin');
    expect(post({ action: 'adminSetRearrangeFlag', adminToken: TOKEN, enabled: 'true' }).code).toBe('invalid');
    expect(post({ action: 'adminSetRearrangeFlag', adminToken: TOKEN, enabled: true })).toEqual({ status: 'success', enabled: true });
    expect(post({ action: 'getRearrangeFlag' })).toEqual({ status: 'success', enabled: true });
  });

  it('既存のアクション(管理トークンの確認・運行支障の取得と保存)は、そのまま動く', () => {
    expect(post({ action: 'verifyAdminToken', adminToken: TOKEN }).status).toBe('success');
    cache = {};
    expect(post({ action: 'verifyAdminToken', adminToken: 'wrong' }).code).toBe('admin');
    cache = {};
    expect(post({ action: 'setDisruptions', adminToken: TOKEN, disruptions: { kanzaki: { statusType: 'delay' } }, forecasts: [] }).status).toBe('success');
    const got = post({ action: 'getDisruptions' }) as unknown as { status: string; disruptions: Record<string, unknown> };
    expect(got.status).toBe('success');
    expect(Object.keys(got.disruptions)).toEqual(['kanzaki']);
    // 運転整理の入り・切りは、運行支障の保存に、触れない
    post({ action: 'adminSetRearrangeFlag', adminToken: TOKEN, enabled: true });
    expect(Object.keys((post({ action: 'getDisruptions' }) as unknown as { disruptions: Record<string, unknown> }).disruptions)).toEqual(['kanzaki']);
    expect(post({ action: 'noSuchAction' }).status).toBe('ignored');
  });
});
