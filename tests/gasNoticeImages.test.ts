// 通知の画像を、複数枚(4枚まで)にする(サーバー gas/Code.gs)。
//  - シートの「画像URL」の列に、改行区切り。API は imageUrls(配列)を足し、imageUrl(最初の1枚)も、これまでどおり返す(古いアプリを壊さない)
//  - 編集で外れた画像・通知の削除で付いていた画像は、ゴミ箱へ(フォルダ「神埼線アプリ_通知画像」の中の、lh3 のアドレスだけ。ほかの通知が使っていれば、残す。失敗しても、保存・削除は成功)
// ドライブは、作りもの(本物には、何も触らない)。
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
const FOLDER = 'folder-1';

let gas: Gas;
let grid: unknown[][] | null;
let cache: Record<string, string>;
let props: Record<string, string>;
let drive: Record<string, { parent: string; trashed: boolean; failTrash?: boolean }>;
let trashCalls: string[];
let errors: string[];

const idOf = (n: number) => `fileid${String(n).padStart(8, '0')}abcdef`; // 10文字以上の英数字
const lh3 = (n: number) => `https://lh3.googleusercontent.com/d/${idOf(n)}`;
const ext = (n: number) => `https://example.test/${n}.png`;
const note = (over: Record<string, unknown> = {}) => ({ kind: 'normal', title: '題名', body: '本文', imageUrl: '', linkUrl: '', publishAt: Date.now() - HOUR, ...over });
const save = (n: Record<string, unknown>) => gas.handleAdminSaveNotice(TOKEN, n);
const list = () => gas.handleAdminListNotices(TOKEN).notices as Array<Record<string, unknown>>;
const pub = () => gas.handleGetNotices().notices as Array<Record<string, unknown>>;
const cell = (row = 1) => (grid as unknown[][])[row][4];
const trashed = (n: number) => drive[idOf(n)]?.trashed === true;
const stored = (n: number, parent = FOLDER) => void (drive[idOf(n)] = { parent, trashed: false });

beforeEach(() => {
  grid = null;
  cache = {};
  props = { ADMIN_TOKEN: TOKEN, NOTICE_IMAGE_FOLDER_ID: FOLDER };
  drive = {};
  trashCalls = [];
  errors = [];
  const ctx: Gas = {
    Logger: { log: (m: string) => void errors.push(m) },
    console: { log: () => undefined, error: () => undefined },
    ContentService: {},
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string) => void (cache[k] = v),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Utilities: { formatDate: () => '2026-11-21 12:00', getUuid: () => crypto.randomUUID() },
    DriveApp: {
      getFileById: (id: string) => {
        const f = drive[id];
        if (!f) throw new Error('not found');
        return {
          getParents: () => {
            let i = 0;
            return { hasNext: () => i < 1, next: () => ({ getId: () => (i++, f.parent) }) };
          },
          setTrashed: (t: boolean) => {
            trashCalls.push(id);
            if (f.failTrash) throw new Error('権限がありません: secret');
            f.trashed = t;
          },
        };
      },
    },
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
    insertSheet: () => {
      grid = [];
      return sheet;
    },
  });
});

describe('① 保存と返却', () => {
  it('imageUrls(配列)を、シートの「画像URL」の列に、改行区切りで保存し、imageUrls と imageUrl(最初の1枚)を返す', () => {
    save(note({ imageUrls: [ext(1), ext(2), ext(3), ext(4)] }));
    expect(cell()).toBe(`${ext(1)}\n${ext(2)}\n${ext(3)}\n${ext(4)}`);
    for (const n of [pub()[0], list()[0]]) {
      expect(n.imageUrls).toEqual([ext(1), ext(2), ext(3), ext(4)]);
      expect(n.imageUrl).toBe(ext(1));
    }
  });

  it('古い呼び方(imageUrl だけ)は、配列1個として扱う。返す imageUrl は、これまでどおり', () => {
    save(note({ imageUrl: ext(1) }));
    expect(cell()).toBe(ext(1));
    expect(pub()[0].imageUrls).toEqual([ext(1)]);
    expect(pub()[0].imageUrl).toBe(ext(1));
  });

  it('画像が無いときは、imageUrls は空の配列で、imageUrl は空の文字', () => {
    save(note());
    expect(pub()[0].imageUrls).toEqual([]);
    expect(pub()[0].imageUrl).toBe('');
  });

  it('両方あるときは、imageUrls を優先する。imageUrls が空の配列なら、画像なし', () => {
    save(note({ imageUrl: ext(9), imageUrls: [ext(1), ext(2)] }));
    expect(pub()[0].imageUrls).toEqual([ext(1), ext(2)]);
    save(note({ title: 'もう1つ', imageUrl: ext(9), imageUrls: [] }));
    expect(pub().find((n) => n.title === 'もう1つ')!.imageUrls).toEqual([]);
  });

  it('いままでの通知(1つだけの、シートの値)は、そのまま読める。改行や空行まじりでも、4枚までを読む', () => {
    save(note());
    (grid as unknown[][])[1][4] = ext(1);
    expect(pub()[0].imageUrls).toEqual([ext(1)]);
    cache = {}; // 公開用は、60秒覚えているので、シートを直接変えたあとは、消してから読む
    (grid as unknown[][])[1][4] = `\n${ext(1)}\r\n\n${ext(2)}\n${ext(3)}\n${ext(4)}\n${ext(5)}\n`;
    expect(pub()[0].imageUrls).toEqual([ext(1), ext(2), ext(3), ext(4)]);
    expect(pub()[0].imageUrl).toBe(ext(1));
  });

  it('空のアドレスは、飛ばす。前後の空白は、取る', () => {
    save(note({ imageUrls: [`  ${ext(1)} `, '', '   ', ext(2)] }));
    expect(pub()[0].imageUrls).toEqual([ext(1), ext(2)]);
  });

  it('編集で、枚数・順番を変えられる', () => {
    const id = save(note({ imageUrls: [ext(1), ext(2)] })).id;
    save({ ...note({ imageUrls: [ext(2), ext(1), ext(3)] }), id });
    expect(pub()[0].imageUrls).toEqual([ext(2), ext(1), ext(3)]);
  });
});

describe('② 検査(日本語のメッセージ)', () => {
  const refused = (r: { status: string; code?: string; message?: string }, text: string) => {
    expect(r.status).toBe('error');
    expect(r.code).toBe('invalid');
    expect(r.message).toContain(text);
    expect(grid === null || (grid as unknown[][]).length <= 1).toBe(true);
  };

  it('5枚以上は、断る', () => {
    refused(save(note({ imageUrls: [ext(1), ext(2), ext(3), ext(4), ext(5)] })), '4 枚まで');
  });

  it('同じアドレスの重複は、断る', () => {
    refused(save(note({ imageUrls: [ext(1), ext(2), ext(1)] })), '重なっています');
  });

  it('1枚ずつ、https のアドレスの検査を通す(http・空白まじり・ユーザー名つき・500文字超は断る)', () => {
    refused(save(note({ imageUrls: [ext(1), 'http://example.test/a.png'] })), 'https://');
    refused(save(note({ imageUrls: ['https://example.test/a b.png'] })), 'https://');
    refused(save(note({ imageUrls: ['https://user@example.test/a.png'] })), 'https://');
    refused(save(note({ imageUrls: ['https://example.test/' + 'a'.repeat(500)] })), 'https://');
  });

  it('配列でない imageUrls・文字でない要素は、断る', () => {
    refused(save(note({ imageUrls: 'https://example.test/a.png' })), '画像の一覧');
    refused(save(note({ imageUrls: [ext(1), 5] })), '画像のアドレス');
    refused(save(note({ imageUrls: [ext(1), null] })), '画像のアドレス');
  });

  it('このアドレス(lh3 の形・代わりの形)は、通る', () => {
    expect(save(note({ imageUrls: [lh3(1), `https://drive.google.com/thumbnail?id=${idOf(2)}&sz=w1600`] })).status).toBe('success');
  });
});

describe('③ 外した画像を、ゴミ箱へ(編集)', () => {
  it('編集で、新しい一覧から外れた画像だけ、ゴミ箱に入れる。残した画像・足した画像は、触らない', () => {
    [1, 2, 3, 4].forEach((n) => stored(n));
    const id = save(note({ imageUrls: [lh3(1), lh3(2), lh3(3)] })).id;
    expect(trashCalls).toEqual([]);
    save({ ...note({ imageUrls: [lh3(2), lh3(4)] }), id });
    expect(trashed(1)).toBe(true);
    expect(trashed(3)).toBe(true);
    expect(trashed(2)).toBe(false);
    expect(trashed(4)).toBe(false);
    expect(trashCalls.sort()).toEqual([idOf(1), idOf(3)].sort());
  });

  it('順番を変えただけ・同じ内容で保存し直しても、何も、ゴミ箱に入れない', () => {
    [1, 2].forEach((n) => stored(n));
    const id = save(note({ imageUrls: [lh3(1), lh3(2)] })).id;
    save({ ...note({ imageUrls: [lh3(2), lh3(1)] }), id });
    save({ ...note({ imageUrls: [lh3(2), lh3(1)] }), id });
    expect(trashCalls).toEqual([]);
  });

  it('古い呼び方(imageUrl だけ)で、画像を替えたときも、前の画像を、ゴミ箱に入れる', () => {
    [1, 2].forEach((n) => stored(n));
    const id = save(note({ imageUrl: lh3(1) })).id;
    save({ ...note({ imageUrl: lh3(2) }), id });
    expect(trashed(1)).toBe(true);
    expect(trashed(2)).toBe(false);
  });

  it('フォルダの外のファイル・外部のアドレス・lh3 の形でないものは、触らない', () => {
    stored(1, 'someone-elses-folder');
    const id = save(note({ imageUrls: [lh3(1), ext(2), `https://drive.google.com/thumbnail?id=${idOf(3)}&sz=w1600`] })).id;
    stored(3);
    save({ ...note({ imageUrls: [] }), id });
    expect(trashed(1)).toBe(false);
    expect(trashed(3)).toBe(false);
    expect(trashCalls).toEqual([]);
  });

  it('ほかの(消されていない)通知が、同じアドレスを使っていたら、ゴミ箱に入れない', () => {
    [1, 2].forEach((n) => stored(n));
    const a = save(note({ title: 'A', imageUrls: [lh3(1), lh3(2)] })).id;
    save(note({ title: 'B', imageUrls: [lh3(1)] }));
    save({ ...note({ title: 'A', imageUrls: [] }), id: a });
    expect(trashed(1)).toBe(false); // B が使っている
    expect(trashed(2)).toBe(true);
  });

  it('消された通知が使っていたアドレスは、「使っている」に数えない', () => {
    stored(1);
    const dead = save(note({ title: '消す', imageUrls: [lh3(1)] })).id;
    gas.handleAdminDeleteNotice(TOKEN, dead);
    trashCalls.length = 0;
    drive[idOf(1)].trashed = false;
    const live = save(note({ title: '生きている', imageUrls: [lh3(1)] })).id;
    save({ ...note({ title: '生きている', imageUrls: [] }), id: live });
    expect(trashed(1)).toBe(true);
  });

  it('ゴミ箱に入れるのに失敗しても、保存は成功する(失敗は、記録だけ。詳細は、返さない)', () => {
    stored(1);
    drive[idOf(1)].failTrash = true;
    const id = save(note({ imageUrls: [lh3(1)] })).id;
    const r = save({ ...note({ imageUrls: [] }), id });
    expect(r.status).toBe('success');
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(pub()[0].imageUrls).toEqual([]);
    expect(errors.some((m) => m.includes('trashNoticeImageByUrl'))).toBe(true);
  });

  it('フォルダのIDが、まだ無いとき・ファイルが、もう無いときは、何もせずに、保存は成功する', () => {
    delete props.NOTICE_IMAGE_FOLDER_ID;
    stored(1);
    const id = save(note({ imageUrls: [lh3(1)] })).id;
    expect(save({ ...note({ imageUrls: [] }), id }).status).toBe('success');
    expect(trashCalls).toEqual([]);
    props.NOTICE_IMAGE_FOLDER_ID = FOLDER;
    const id2 = save(note({ title: '2', imageUrls: [lh3(99)] })).id; // ドライブに無い
    expect(save({ ...note({ title: '2', imageUrls: [] }), id: id2 }).status).toBe('success');
  });

  it('編集で、通知そのものが見つからないときは、何もゴミ箱に入れない', () => {
    stored(1);
    const r = save({ ...note({ imageUrls: [] }), id: 'n000000000000' });
    expect(r.code).toBe('not_found');
    expect(trashCalls).toEqual([]);
  });
});

describe('④ 通知を削除したら、付いていた画像を、ゴミ箱へ', () => {
  it('付いていた画像(フォルダの中の lh3 のもの)を、ゴミ箱に入れる。外部のアドレスは、触らない', () => {
    [1, 2].forEach((n) => stored(n));
    const id = save(note({ imageUrls: [lh3(1), ext(5), lh3(2)] })).id;
    expect(gas.handleAdminDeleteNotice(TOKEN, id).status).toBe('success');
    expect(trashed(1)).toBe(true);
    expect(trashed(2)).toBe(true);
    expect(trashCalls).toHaveLength(2);
    expect(pub()).toEqual([]);
  });

  it('ほかの通知が使っている画像は、残す', () => {
    [1, 2].forEach((n) => stored(n));
    const a = save(note({ title: 'A', imageUrls: [lh3(1), lh3(2)] })).id;
    save(note({ title: 'B', imageUrls: [lh3(2)] }));
    gas.handleAdminDeleteNotice(TOKEN, a);
    expect(trashed(1)).toBe(true);
    expect(trashed(2)).toBe(false);
  });

  it('ゴミ箱に入れるのに失敗しても、削除は成功する。画像の無い通知の削除も、いままでどおり', () => {
    stored(1);
    drive[idOf(1)].failTrash = true;
    const id = save(note({ imageUrls: [lh3(1)] })).id;
    expect(gas.handleAdminDeleteNotice(TOKEN, id).status).toBe('success');
    expect(pub()).toEqual([]);
    const plain = save(note({ title: '画像なし' })).id;
    expect(gas.handleAdminDeleteNotice(TOKEN, plain).status).toBe('success');
  });

  it('管理トークンが違えば、削除も、ゴミ箱も、しない(いままでどおり)', () => {
    stored(1);
    const id = save(note({ imageUrls: [lh3(1)] })).id;
    cache = {};
    expect(gas.handleAdminDeleteNotice('wrong', id).code).toBe('admin');
    expect(trashCalls).toEqual([]);
    expect(pub()).toHaveLength(1);
  });
});

describe('⑤ アップロード・削除の API は、そのまま', () => {
  it('adminDeleteNoticeImage は、これまでどおり(フォルダの中のファイルだけ)', () => {
    stored(1);
    stored(2, 'other');
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, idOf(1)).status).toBe('success');
    expect(trashed(1)).toBe(true);
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, idOf(2)).code).toBe('not_found');
    expect(trashed(2)).toBe(false);
  });
});
