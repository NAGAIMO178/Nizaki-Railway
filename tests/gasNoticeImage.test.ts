// 通知の画像(サーバー gas/Code.gs): 管理者コンソールから送った画像を、Google ドライブに保存して、アドレスを返す。
// ドライブは、作りもの(本物には、何も保存しない)。管理トークン・大きさ・種類(中身の先頭のバイトも)・連続の制限・保存・削除を調べる。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');
const TOKEN = 'test-admin-token-xyz';

interface FakeFile { id: string; name: string; mime: string; bytes: number[]; sharing: unknown[]; trashed: boolean; parent: string }
let gas: Gas;
let cache: Record<string, string>;
let props: Record<string, string>;
let files: FakeFile[];
let folders: { id: string; name: string }[];
let folderLookups: number;
let lockCalls: number;
let lockFails: boolean;
let decodeCalls: number;

// 画像の先頭(マジックナンバー)と、続きの中身
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38];
const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
const pad = (head: number[], size: number) => [...head, ...new Array(Math.max(0, size - head.length)).fill(7)];
const upload = (over: Record<string, unknown> = {}, token: unknown = TOKEN) => {
  const o = { fileName: '写真.jpg', mimeType: 'image/jpeg', dataBase64: b64(pad(JPEG, 100)), ...over };
  return gas.handleAdminUploadNoticeImage(token, o.fileName, o.mimeType, o.dataBase64) as { status: string; code?: string; message?: string; url?: string; id?: string };
};

beforeEach(() => {
  cache = {};
  props = { ADMIN_TOKEN: TOKEN };
  files = [];
  folders = [];
  folderLookups = 0;
  lockCalls = 0;
  lockFails = false;
  decodeCalls = 0;
  const toBytes = (b: Buffer) => Array.from(b).map((v) => (v > 127 ? v - 256 : v)); // GAS のバイトは、符号つき
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    ContentService: {},
    // ロックの1回目は、管理トークンの確認。2回目以降が、保存・削除のロック
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
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s: string) => {
        decodeCalls++;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) throw new Error('bad base64');
        return toBytes(Buffer.from(s, 'base64'));
      },
      newBlob: (bytes: number[], mime: string, name: string) => ({ bytes, mime, name }),
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFoldersByName: (name: string) => {
        folderLookups++;
        const hit = folders.filter((f) => f.name === name);
        let i = 0;
        return { hasNext: () => i < hit.length, next: () => folderObj(hit[i++].id) };
      },
      createFolder: (name: string) => {
        const f = { id: 'folder-' + (folders.length + 1), name };
        folders.push(f);
        return folderObj(f.id);
      },
      getFolderById: (id: string) => {
        if (!folders.some((f) => f.id === id)) throw new Error('not found');
        return folderObj(id);
      },
      getFileById: (id: string) => {
        const f = files.find((x) => x.id === id);
        if (!f) throw new Error('not found');
        return fileObj(f);
      },
    },
  };
  const folderObj = (id: string) => ({
    getId: () => id,
    createFile: (blob: { bytes: number[]; mime: string; name: string }) => {
      const f: FakeFile = { id: 'file-' + crypto.randomUUID().replace(/-/g, '').slice(0, 20), name: blob.name, mime: blob.mime, bytes: blob.bytes, sharing: [], trashed: false, parent: id };
      files.push(f);
      return fileObj(f);
    },
  });
  const fileObj = (f: FakeFile) => ({
    getId: () => f.id,
    setSharing: (a: unknown, p: unknown) => void f.sharing.push(a, p),
    setTrashed: (t: boolean) => void (f.trashed = t),
    getParents: () => {
      let i = 0;
      return { hasNext: () => i < 1, next: () => ({ getId: () => (i++, f.parent) }) };
    },
  });
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  gas = ctx;
  gas.createJsonResponse = (d: unknown) => d;
});

describe('管理者の確かめ(サーバー側)', () => {
  it('管理トークンが違う・無いときは、何も保存せず、断る(既存の管理者の返し方)', () => {
    for (const bad of ['', 'wrong', undefined, null]) {
      cache = {};
      const r = gas.handleAdminUploadNoticeImage(bad, 'a.jpg', 'image/jpeg', b64(pad(JPEG, 60)));
      expect(r.code, String(bad)).toBe('admin');
    }
    expect(files).toHaveLength(0);
    expect(folders).toHaveLength(0);
    expect(gas.handleAdminDeleteNoticeImage('wrong', 'abcdefghij12').code).toBe('admin');
  });

  it('失敗が続いて止まっているときは、正しいトークンでも断る(admin_locked)', () => {
    for (let i = 0; i < 12; i++) gas.handleAdminUploadNoticeImage('wrong', 'a.jpg', 'image/jpeg', 'AAAA');
    expect(upload().code).toBe('admin_locked');
    expect(files).toHaveLength(0);
  });
});

describe('検査', () => {
  it('JPEG・PNG・WebP は、通る', () => {
    expect(upload({ mimeType: 'image/jpeg', dataBase64: b64(pad(JPEG, 50)) }).status).toBe('success');
    expect(upload({ mimeType: 'image/png', dataBase64: b64(pad(PNG, 50)) }).status).toBe('success');
    expect(upload({ mimeType: 'image/webp', dataBase64: b64(pad(WEBP, 50)) }).status).toBe('success');
    expect(files.map((f) => f.name.split('.').pop())).toEqual(['jpg', 'png', 'webp']);
  });

  it('1.5MB ちょうどは通り、1バイトでも超えたら、too_large', () => {
    expect(upload({ dataBase64: b64(pad(JPEG, 1572864)) }).status).toBe('success');
    const r = upload({ dataBase64: b64(pad(JPEG, 1572865)) });
    expect(r.code).toBe('too_large');
    expect(files).toHaveLength(1);
  });

  it('巨大な文字は、読み解かずに、too_large', () => {
    const r = upload({ dataBase64: 'A'.repeat(5_000_000) });
    expect(r.code).toBe('too_large');
    expect(files).toHaveLength(0);
    expect(decodeCalls).toBe(0); // 文字の長さだけで断る
  });

  it('種類(mimeType)が、3つのどれでもないときは、invalid。GIF・SVG・PDF・空・数など', () => {
    for (const mimeType of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', '', undefined, null, 5, 'IMAGE/JPEG']) {
      cache = {};
      expect(upload({ mimeType }).code, String(mimeType)).toBe('invalid');
    }
    expect(files).toHaveLength(0);
  });

  it('中身が、申告の画像でないときは、invalid(名前や申告だけを、信じない)', () => {
    // JPEG と申告して、PNG の中身
    expect(upload({ mimeType: 'image/jpeg', dataBase64: b64(pad(PNG, 50)) }).code).toBe('invalid');
    // 画像と申告して、HTML・スクリプトの中身
    expect(upload({ mimeType: 'image/png', dataBase64: b64(Array.from(Buffer.from('<script>alert(1)</script>'))) }).code).toBe('invalid');
    // WebP の頭だけ(RIFF)で、WEBP の印が無い
    expect(upload({ mimeType: 'image/webp', dataBase64: b64(pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45], 40)) }).code).toBe('invalid');
    // PNG の頭の4バイトだけが合っていて、続きが違う
    expect(upload({ mimeType: 'image/png', dataBase64: b64(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0b, 0x1a, 0x0a], 40)) }).code).toBe('invalid');
    // 短すぎる
    expect(upload({ mimeType: 'image/png', dataBase64: b64([0x89, 0x50]) }).code).toBe('invalid');
    expect(files).toHaveLength(0);
  });

  it('中身が空・文字でない・base64 でないときは、invalid', () => {
    for (const dataBase64 of ['', '   ', undefined, null, 123, '!!!!', 'あいう', 'data:image/jpeg;base64,/9j/4AAQ', 'AAA*']) {
      cache = {};
      expect(upload({ dataBase64 }).code, String(dataBase64)).toBe('invalid');
    }
    expect(files).toHaveLength(0);
  });

  it('改行や空白の入った base64 は、そのまま読める', () => {
    const text = b64(pad(JPEG, 90)).replace(/(.{20})/g, '$1\n');
    expect(upload({ dataBase64: text }).status).toBe('success');
  });
});

describe('連続の制限', () => {
  it('1時間に20回まで。21回目は、rate_limited(保存しない)', () => {
    for (let i = 0; i < 20; i++) expect(upload().status).toBe('success');
    const r = upload();
    expect(r.code).toBe('rate_limited');
    expect(files).toHaveLength(20);
  });

  it('検査で断られた送信も、回数に数える(試し打ちを、無制限にさせない)', () => {
    for (let i = 0; i < 20; i++) upload({ mimeType: 'image/gif' });
    expect(upload().code).toBe('rate_limited');
  });
});

describe('保存', () => {
  it('フォルダ「神埼線アプリ_通知画像」がなければ作り、IDをスクリプトプロパティに覚える。2回目からは、作り直さない', () => {
    expect(upload().status).toBe('success');
    expect(folders).toEqual([{ id: 'folder-1', name: '神埼線アプリ_通知画像' }]);
    expect(props.NOTICE_IMAGE_FOLDER_ID).toBe('folder-1');
    expect(upload().status).toBe('success');
    expect(folders).toHaveLength(1);
    expect(files.every((f) => f.parent === 'folder-1')).toBe(true);
  });

  it('同じ名前のフォルダが、すでにあれば、それを使う。覚えたフォルダが消えていたら、探し直す', () => {
    folders.push({ id: 'existing', name: '神埼線アプリ_通知画像' });
    expect(upload().status).toBe('success');
    expect(props.NOTICE_IMAGE_FOLDER_ID).toBe('existing');
    expect(folders).toHaveLength(1);
    props.NOTICE_IMAGE_FOLDER_ID = 'deleted-folder';
    expect(upload().status).toBe('success');
    expect(props.NOTICE_IMAGE_FOLDER_ID).toBe('existing');
  });

  it('ファイル名は、サーバーが決める(n + 時刻 + ランダム + 拡張子)。ユーザーのファイル名は、使わない', () => {
    upload({ fileName: '../../悪い名前<script>.jpg' });
    expect(files[0].name).toMatch(/^n\d+_[0-9a-f]{10}\.jpg$/);
    upload({ fileName: '../../悪い名前<script>.jpg' });
    expect(files[1].name).not.toBe(files[0].name);
    expect(JSON.stringify(files)).not.toContain('悪い名前');
  });

  it('共有は、リンクを知っている全員が、閲覧のみ', () => {
    upload();
    expect(files[0].sharing).toEqual(['ANYONE_WITH_LINK', 'VIEW']);
  });

  it('成功の返事: status・url(https の画像アドレス)・id(ドライブのファイルID)。中身は、そのまま保存される', () => {
    const r = upload({ mimeType: 'image/png', dataBase64: b64(pad(PNG, 64)) });
    expect(r.status).toBe('success');
    expect(r.id).toBe(files[0].id);
    expect(r.url).toBe(`https://lh3.googleusercontent.com/d/${files[0].id}`);
    expect(files[0].mime).toBe('image/png');
    expect(files[0].bytes.map((v) => v & 0xff)).toEqual(pad(PNG, 64));
  });

  it('保存のロックが取れないときは、busy(保存しない)', () => {
    lockFails = true;
    const r = upload();
    expect(r.code).toBe('busy');
    expect(files).toHaveLength(0);
  });

  it('ドライブの失敗は、内部の詳細を返さない(server_error)', () => {
    gas.DriveApp = { ...gas.DriveApp, getFoldersByName: () => { throw new Error('権限がありません: secret'); } };
    const r = upload();
    expect(r.code).toBe('server_error');
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});

describe('通知の保存で、画像のアドレスが通る', () => {
  it('このアドレスの形(lh3 と、代わりの形)は、通知の画像アドレスの検査を通る。http・ほかの形は、通らない', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123456';
    expect(gas.isHttpsNoticeUrl(`https://lh3.googleusercontent.com/d/${id}`)).toBe(true);
    expect(gas.isHttpsNoticeUrl(`https://drive.google.com/thumbnail?id=${id}&sz=w1600`)).toBe(true);
    expect(gas.isHttpsNoticeUrl(`http://lh3.googleusercontent.com/d/${id}`)).toBe(false);
    expect(gas.isHttpsNoticeUrl('https://user@evil.example/x')).toBe(false);
    const cleaned = gas.cleanNoticeInput({ kind: 'normal', title: 't', body: '', imageUrl: `https://lh3.googleusercontent.com/d/${id}`, linkUrl: '', publishAt: Date.now() });
    expect(cleaned.error).toBeUndefined();
    expect(cleaned.value.imageUrl).toBe(`https://lh3.googleusercontent.com/d/${id}`);
  });
});

describe('画像を消す(ゴミ箱に入れる)', () => {
  it('上のフォルダのファイルは、ゴミ箱に入れる。ほかのファイル・知らないIDは、触れない', () => {
    const id = upload().id as string;
    files.push({ id: 'otherfile12345', name: 'x.jpg', mime: 'image/jpeg', bytes: [], sharing: [], trashed: false, parent: 'someone-elses-folder' });
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, 'otherfile12345').code).toBe('not_found');
    expect(files.find((f) => f.id === 'otherfile12345')!.trashed).toBe(false);
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, 'unknownfile1234').code).toBe('not_found');
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, id).status).toBe('success');
    expect(files.find((f) => f.id === id)!.trashed).toBe(true);
  });

  it('IDの形が変なときは、invalid。フォルダが、まだ無いときは、not_found', () => {
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, '../x').code).toBe('invalid');
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, '').code).toBe('invalid');
    expect(gas.handleAdminDeleteNoticeImage(TOKEN, 'abcdefghij12').code).toBe('not_found');
  });
});

describe('doPost の入口', () => {
  it('adminUploadNoticeImage は、契約の項目(adminToken・fileName・mimeType・dataBase64)で通る。トークンなしは、断る', () => {
    const post = (body: unknown) => gas.doPost({ postData: { contents: JSON.stringify(body) } });
    const ok = post({ action: 'adminUploadNoticeImage', adminToken: TOKEN, fileName: 'a.jpg', mimeType: 'image/jpeg', dataBase64: b64(pad(JPEG, 60)) });
    expect(ok.status).toBe('success');
    expect(ok.url).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\//);
    expect(post({ action: 'adminUploadNoticeImage', fileName: 'a.jpg', mimeType: 'image/jpeg', dataBase64: b64(pad(JPEG, 60)) }).code).toBe('admin');
    expect(post({ action: 'adminDeleteNoticeImage', id: ok.id }).code).toBe('admin');
    expect(post({ action: 'adminDeleteNoticeImage', adminToken: TOKEN, id: ok.id }).status).toBe('success');
  });
});
