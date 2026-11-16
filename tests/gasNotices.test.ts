// 通知(メニューの「通知」): サーバー(gas/Code.gs)を、作りものの台帳・キャッシュ・ロックで動かす。
// 公開用(getNotices)は、公開ずみ・消されていないものだけを、新しい順に、最大20件。管理用は、管理トークンを、サーバー側で必ず確かめる。
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
let grid: unknown[][] | null; // null = シートがまだ無い
let cache: Record<string, string>;
let props: Record<string, string>;
let lockFails: boolean;
let lockCalls: number;
let sheetCreated: number;

const note = (over: Record<string, unknown> = {}) => ({ kind: 'normal', title: '題名', body: '本文', imageUrl: '', linkUrl: '', publishAt: Date.now() - HOUR, ...over });
const save = (n: Record<string, unknown>, token: unknown = TOKEN) => gas.handleAdminSaveNotice(token, n);
const list = () => gas.handleAdminListNotices(TOKEN).notices as Array<Record<string, unknown>>;
const pub = () => gas.handleGetNotices().notices as Array<Record<string, unknown>>;

beforeEach(() => {
  grid = null;
  cache = {};
  props = { ADMIN_TOKEN: TOKEN };
  lockFails = false;
  lockCalls = 0;
  sheetCreated = 0;
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    ContentService: {},
    // ロックの1回目は、管理トークンの確認。2回目以降が、書き込みのロック
    LockService: { getScriptLock: () => ({ waitLock: () => { lockCalls++; if (lockFails && lockCalls > 1) throw new Error('busy'); }, releaseLock: () => undefined }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string) => void (cache[k] = v),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Utilities: { formatDate: () => '2026-11-17 12:00', getUuid: () => crypto.randomUUID() },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  gas = ctx;
  gas.createJsonResponse = (d: unknown) => d;
  const chain = { setBackground: () => chain, setFontColor: () => chain, setFontWeight: () => chain };
  const sheet = {
    getLastRow: () => (grid as unknown[][]).length,
    appendRow: (r: unknown[]) => void (grid as unknown[][]).push([...r]),
    setFrozenRows: () => undefined,
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({
      ...chain,
      getValues: () => (grid as unknown[][]).slice(r - 1, r - 1 + nr).map((row) => Array.from({ length: nc }, (_, i) => row[c - 1 + i] ?? '')),
      setValues: (vals: unknown[][]) => vals.forEach((vr, ri) => vr.forEach((v, ci) => void ((grid as unknown[][])[r - 1 + ri][c - 1 + ci] = v))),
    }),
  };
  gas.getDataSpreadsheet = () => ({
    getSheetByName: (n: string) => (n === '通知' ? (grid ? sheet : null) : null),
    insertSheet: (n: string) => {
      expect(n).toBe('通知');
      grid = [];
      sheetCreated++;
      return sheet;
    },
  });
});

describe('① 「通知」のシート', () => {
  it('なければ、自動で作る(見出しの行つき)。あれば、作り直さない', () => {
    expect(grid).toBeNull();
    expect(pub()).toEqual([]);
    expect(sheetCreated).toBe(1);
    expect((grid as unknown[][])[0]).toEqual(['通知ID', '種類', '題名', '本文', '画像URL', 'リンクURL', '公開日時(ms)', '公開日時', '更新日時', '削除']);
    gas.handleAdminListNotices(TOKEN);
    expect(sheetCreated).toBe(1);
  });
});

describe('② 公開用(getNotices): ログインなしで読める', () => {
  it('公開日時が、いま以前で、消されていないものだけを、新しい順に返す。公開前・消したものは、出ない', () => {
    save(note({ title: '古い', publishAt: Date.now() - 3 * HOUR }));
    save(note({ title: '新しい', publishAt: Date.now() - HOUR }));
    save(note({ title: '公開前', publishAt: Date.now() + 5 * HOUR }));
    const id = save(note({ title: '消す', publishAt: Date.now() - 2 * HOUR })).id as string;
    gas.handleAdminDeleteNotice(TOKEN, id);
    expect(pub().map((n) => n.title)).toEqual(['新しい', '古い']);
  });

  it('最大20件(新しいほうの20件)', () => {
    for (let i = 0; i < 25; i++) save(note({ title: `n${i}`, publishAt: Date.now() - (30 - i) * HOUR }));
    const got = pub();
    expect(got).toHaveLength(20);
    expect(got[0].title).toBe('n24');
    expect(got[19].title).toBe('n5');
  });

  it('返す項目は、決まったものだけ(削除の印・更新日時・シートの行は、出ない)', () => {
    save(note({ kind: 'important', imageUrl: 'https://example.test/a.png', linkUrl: 'https://example.test/x' }));
    const n = pub()[0];
    expect(Object.keys(n).sort()).toEqual(['body', 'id', 'imageUrl', 'kind', 'linkUrl', 'publishAt', 'title']);
    expect(n.id).toMatch(/^n[0-9a-f]{12}$/);
  });

  it('60秒覚えるが、書く・消すと、すぐ新しくなる', () => {
    expect(pub()).toEqual([]);
    save(note({ title: 'できた' }));
    expect(pub().map((n) => n.title)).toEqual(['できた']);
    const first = pub();
    expect(cache['notices_public_v1']).toBeTruthy();
    expect(pub()).toEqual(first);
    gas.handleAdminDeleteNotice(TOKEN, first[0].id);
    expect(pub()).toEqual([]);
  });
});

describe('③ 管理用: 管理トークンを、サーバー側で必ず確かめる', () => {
  it('トークンが無い・違う・サーバーに未設定のときは、断る。書き込み・消す・全件の一覧に、触れない', () => {
    const id = save(note()).id as string;
    const before = JSON.stringify(grid);
    [undefined, null, '', 'wrong', TOKEN + 'x', 123].forEach((t) => {
      expect(gas.handleAdminListNotices(t), String(t)).toMatchObject({ status: 'error' });
      expect(gas.handleAdminSaveNotice(t, note({ title: '不正' })), String(t)).toMatchObject({ status: 'error' });
      expect(gas.handleAdminDeleteNotice(t, id), String(t)).toMatchObject({ status: 'error' });
    });
    expect(JSON.stringify(grid)).toBe(before);
    cache = {}; // 失敗の回数制限を、いったん外す
    props = {};
    expect(save(note(), TOKEN)).toMatchObject({ status: 'error', code: 'admin' });
  });

  it('失敗が続くと、しばらく断る(既存の回数制限)', () => {
    for (let i = 0; i < 5; i++) gas.handleAdminListNotices('wrong');
    expect(gas.handleAdminListNotices(TOKEN)).toMatchObject({ status: 'error', code: 'admin_locked' });
  });

  it('doPost の入口も、4つの操作を持つ(公開用だけ、トークンなし)', () => {
    expect(source).toContain("json.action === 'getNotices'");
    expect(source).toContain("handleAdminListNotices(json.adminToken)");
    expect(source).toContain("handleAdminSaveNotice(json.adminToken, json.notice)");
    expect(source).toContain("handleAdminDeleteNotice(json.adminToken, json.id)");
    // 管理用の3つは、先頭で、管理トークンを確かめている
    for (const fn of ['handleAdminListNotices', 'handleAdminSaveNotice', 'handleAdminDeleteNotice']) {
      const body = source.slice(source.indexOf(`function ${fn}(`));
      expect(body.slice(0, 200)).toContain('adminTokenErrorResponse(checkAdminToken(adminToken))');
    }
  });

  it('全件の一覧は、公開前のものも含む。消したものは、出ない', () => {
    save(note({ title: '公開前', publishAt: Date.now() + 5 * HOUR }));
    save(note({ title: '公開ずみ' }));
    expect(list().map((n) => n.title).sort()).toEqual(['公開ずみ', '公開前']);
  });
});

describe('④ 入力の確かめ(長さ・https・種類・日時)', () => {
  it('題名は1〜60文字、本文は1000文字まで(ちょうどは通る。1文字超えると、断る)', () => {
    expect(save(note({ title: 'あ'.repeat(60) })).status).toBe('success');
    expect(save(note({ title: 'あ'.repeat(61) }))).toMatchObject({ status: 'error', code: 'invalid' });
    expect(save(note({ title: '  ' }))).toMatchObject({ status: 'error', code: 'invalid' });
    expect(save(note({ body: 'あ'.repeat(1000) })).status).toBe('success');
    expect(save(note({ body: 'あ'.repeat(1001) }))).toMatchObject({ status: 'error', code: 'invalid' });
  });

  it('画像・リンクは、https:// だけ・500文字まで。http・javascript:・空白入り・@つき・長すぎるものは、断る', () => {
    const ok = 'https://example.test/a.png?x=1#y';
    expect(save(note({ imageUrl: ok, linkUrl: ok })).status).toBe('success');
    expect(save(note({ imageUrl: 'https://example.test/' + 'a'.repeat(470) })).status).toBe('success');
    ['http://example.test/a.png', 'javascript:alert(1)', 'data:text/html,x', 'https://exa mple.test/', 'https://user:pw@example.test/', 'https://', '//example.test/a.png', 'ftp://example.test/', 'https://example.test/' + 'a'.repeat(500)].forEach((u) => {
      expect(save(note({ imageUrl: u })), u).toMatchObject({ status: 'error', code: 'invalid' });
      expect(save(note({ linkUrl: u })), u).toMatchObject({ status: 'error', code: 'invalid' });
    });
  });

  it('種類は、通常・イベント・重要(normal/event/important)だけ。公開日時は、数で、近い範囲だけ', () => {
    ['normal', 'event', 'important'].forEach((k) => expect(save(note({ kind: k })).status).toBe('success'));
    ['survey', '', undefined, null, 5].forEach((k) => expect(save(note({ kind: k })), String(k)).toMatchObject({ status: 'error', code: 'invalid' }));
    [NaN, 'abc', undefined, Date.now() + 10 * 365 * 86400000, 0].forEach((t) => expect(save(note({ publishAt: t })), String(t)).toMatchObject({ status: 'error', code: 'invalid' }));
  });

  it('シートに書く文字が「=」などで始まるときは、式として動かないよう、先頭に \' を付ける', () => {
    save(note({ title: '=HYPERLINK("https://example.test","x")', body: '+1' }));
    const row = (grid as unknown[][])[1];
    expect(row[2]).toBe('\'=HYPERLINK("https://example.test","x")');
    expect(row[3]).toBe("'+1");
  });

  it('通知の内容が、無い・オブジェクトでないときは、断る', () => {
    [undefined, null, 'x', 5].forEach((n) => expect(gas.handleAdminSaveNotice(TOKEN, n), String(n)).toMatchObject({ status: 'error' }));
  });
});

describe('⑤ 直す・消す', () => {
  it('同じIDで送ると、その行を直す(件数は増えない)。公開日時を未来にすると、公開前になる', () => {
    const id = save(note({ title: '前' })).id as string;
    expect(save({ ...note({ title: '後', kind: 'event' }), id }).id).toBe(id);
    expect(list()).toHaveLength(1);
    expect(list()[0]).toMatchObject({ id, title: '後', kind: 'event' });
    save({ ...note({ title: '後', publishAt: Date.now() + 9 * HOUR }), id });
    expect(pub()).toEqual([]);
  });

  it('IDの形がおかしい・無い通知を直す・消すときは、断る。行は、増えない', () => {
    expect(save({ ...note(), id: 'bad id' })).toMatchObject({ status: 'error', code: 'invalid' });
    expect(save({ ...note(), id: 'n000000000000' })).toMatchObject({ status: 'error', code: 'not_found' });
    expect(gas.handleAdminDeleteNotice(TOKEN, 'nope')).toMatchObject({ status: 'error', code: 'invalid' });
    expect(gas.handleAdminDeleteNotice(TOKEN, 'n000000000000')).toMatchObject({ status: 'error', code: 'not_found' });
    expect((grid as unknown[][]).length).toBe(1); // 見出しの行だけ
  });

  it('消すのは、論理削除: 行は残り、「削除」の列に 1 が入る。消したものは、もう直せない・もう一度は消せない', () => {
    const id = save(note()).id as string;
    expect(gas.handleAdminDeleteNotice(TOKEN, id).status).toBe('success');
    expect((grid as unknown[][])).toHaveLength(2);
    expect((grid as unknown[][])[1][9]).toBe('1');
    expect(list()).toEqual([]);
    expect(save({ ...note(), id })).toMatchObject({ status: 'error', code: 'not_found' });
    expect(gas.handleAdminDeleteNotice(TOKEN, id)).toMatchObject({ status: 'error', code: 'not_found' });
  });

  it('ロックを取れないときは、混み合っていると返す(書かない)', () => {
    lockFails = true;
    expect(save(note())).toMatchObject({ status: 'error', code: 'busy' });
  });
});
