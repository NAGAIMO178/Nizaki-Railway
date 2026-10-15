// テストの準備: ブラウザの代わりに、保存先(localStorage)と、ダイヤ・混雑のデータの読み込み(fetch)を用意する。
// データは、public/data の中のファイルを、そのまま読む。公開後のダイヤ(dia-2)が読まれるように、公開後の確認用の指定(?preview=1)にする。
import fs from 'node:fs';
import path from 'node:path';

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

Object.assign(globalThis, {
  localStorage: localStorageStub,
  window: { location: { search: '?preview=1' }, localStorage: localStorageStub },
});

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input).split('?')[0].replace(/^\.?\/+/, '');
  const file = path.join(PUBLIC_DIR, url);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) {
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }
  const text = fs.readFileSync(file, 'utf-8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) } as Response;
}) as typeof fetch;
