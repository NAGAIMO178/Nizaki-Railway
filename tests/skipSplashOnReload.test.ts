// 再読み込みで開いたときは、起動の画面(#initial-splash)を出さない。index.html のインラインのスクリプトを、そのまま取り出して動かして調べる。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');
const code = /<script id="skip-splash-on-reload">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

// 起動の画面1枚だけの、作りものの document
const makeDoc = () => {
  const root = { children: ['splash'] as string[] };
  const splash = { parentNode: { removeChild: () => void (root.children = []) } };
  return { doc: { getElementById: (id: string) => (id === 'initial-splash' && root.children.length ? splash : null) }, root };
};
const run = (perf: unknown) => {
  const { doc, root } = makeDoc();
  new Function('performance', 'document', code)(perf, doc);
  return root.children.length; // 1: 起動の画面が残っている / 0: 取り除かれた
};
const navType = (type: string | undefined) => ({ getEntriesByType: (k: string) => (k === 'navigation' ? (type === undefined ? [] : [{ type }]) : []) });

describe('再読み込みのとき、起動の画面を出さない', () => {
  it('index.html に、そのスクリプトが、起動の画面の直後にある', () => {
    expect(code.length).toBeGreaterThan(0);
    expect(html.indexOf('id="initial-splash"')).toBeLessThan(html.indexOf('id="skip-splash-on-reload"'));
    expect(html.indexOf('id="skip-splash-on-reload"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });

  it('再読み込み(reload)なら、起動の画面の要素を取り除く', () => {
    expect(run(navType('reload'))).toBe(0);
  });

  it('最初に開くとき(新規の読み込み・戻る/進む・先読み)は、起動の画面を残す', () => {
    for (const t of ['navigate', 'back_forward', 'prerender']) expect(run(navType(t)), t).toBe(1);
  });

  it('判定が取れない環境(履歴なし・関数なし・例外)は、これまでどおり残す。例外も外に出さない', () => {
    expect(run(navType(undefined))).toBe(1);
    expect(run({})).toBe(1);
    expect(run(undefined)).toBe(1);
    expect(run({ getEntriesByType: () => { throw new Error('x'); } })).toBe(1);
  });
});
