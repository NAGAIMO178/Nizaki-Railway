// 更新のお知らせの、出す・保留する(showAfter)の決まりを調べる。
// 「更新を止めない」ことがいちばん大事なので、showAfter が無い・壊れているときの動きを、特に確かめる。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildVersionJson,
  checkForUpdate,
  delayUntilRecheck,
  evaluateUpdate,
  parseShowAfter,
} from '../src/utils/updateNotice';

const LAUNCH = Date.parse('2026-11-01T00:00:00+09:00');
const APP = '3.49.16';
const NEW = { version: '4.0.0', notes: ['NIZAKI 2.0 を公開しました！', '2行目'] };

describe('showAfter の読み方', () => {
  it('日時として読めるものだけを、時刻にする。ほかは null(保留しない)', () => {
    expect(parseShowAfter('2026-11-01T00:00:00+09:00')).toBe(LAUNCH);
    for (const bad of [undefined, null, '', '   ', 'あした', 'abc', '2026-13-45', 123, {}, [], true]) {
      expect(parseShowAfter(bad), String(bad)).toBeNull();
    }
  });
});

describe('出す・保留する・何もしない', () => {
  it('版が同じ・版が無い・形が違うときは、何もしない', () => {
    expect(evaluateUpdate({ version: APP, notes: ['x'] }, APP, LAUNCH).kind).toBe('none');
    expect(evaluateUpdate({ notes: ['x'] }, APP, LAUNCH).kind).toBe('none');
    expect(evaluateUpdate({ version: 4 }, APP, LAUNCH).kind).toBe('none');
    for (const bad of [null, undefined, 'x', 5, []]) expect(evaluateUpdate(bad, APP, LAUNCH).kind, String(bad)).toBe('none');
  });

  it('showAfter が無いときは、今までどおり、版が違えば出す', () => {
    expect(evaluateUpdate(NEW, APP, 0)).toEqual({ kind: 'show', notes: NEW.notes });
    expect(evaluateUpdate({ version: '4.0.0' }, APP, 0)).toEqual({ kind: 'show', notes: [] });
    expect(evaluateUpdate({ version: '4.0.0', notes: 'x' }, APP, 0)).toEqual({ kind: 'show', notes: [] });
    expect(evaluateUpdate({ version: '4.0.0', notes: ['a', 1, null, 'b'] }, APP, 0)).toEqual({ kind: 'show', notes: ['a', 'b'] });
  });

  it('showAfter があり、まだ前なら、出さない(保留)。時刻ちょうどと、それより後は、出す', () => {
    const data = { ...NEW, showAfter: '2026-11-01T00:00:00+09:00' };
    expect(evaluateUpdate(data, APP, LAUNCH - 1)).toEqual({ kind: 'held', showAtMs: LAUNCH });
    expect(evaluateUpdate(data, APP, LAUNCH - 24 * 3600 * 1000)).toEqual({ kind: 'held', showAtMs: LAUNCH });
    expect(evaluateUpdate(data, APP, LAUNCH)).toEqual({ kind: 'show', notes: NEW.notes });
    expect(evaluateUpdate(data, APP, LAUNCH + 1)).toEqual({ kind: 'show', notes: NEW.notes });
  });

  it('showAfter が壊れているときは、保留せず、出す(更新を止めない)', () => {
    for (const bad of ['あした', '', 'abc', 123, null, {}, [], '2026-13-45T99:99:99']) {
      expect(evaluateUpdate({ ...NEW, showAfter: bad }, APP, 0).kind, String(bad)).toBe('show');
    }
  });
});

describe('version.json を取りに行く', () => {
  const okFetch = (data: unknown): typeof fetch => (async () => ({ ok: true, json: async () => data })) as unknown as typeof fetch;

  it('取れたら判定する。取れない・読めないときは、何もしない', async () => {
    expect(await checkForUpdate(okFetch(NEW), APP, 0)).toEqual({ kind: 'show', notes: NEW.notes });
    expect(await checkForUpdate((async () => ({ ok: false })) as unknown as typeof fetch, APP, 0)).toEqual({ kind: 'none' });
    expect(await checkForUpdate((async () => { throw new Error('offline'); }) as unknown as typeof fetch, APP, 0)).toEqual({ kind: 'none' });
    expect(await checkForUpdate((async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })) as unknown as typeof fetch, APP, 0)).toEqual({ kind: 'none' });
  });

  it('いつもの取り方(時刻つきの相対パス・キャッシュなし)で取る', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ version: APP }) };
    }) as unknown as typeof fetch;
    await checkForUpdate(f, APP, 12345);
    expect(seen).toEqual({ url: './version.json?t=12345', init: { cache: 'no-store' } });
  });

  it('保留中は出ず、5分ごとの確認で、公開の時刻をまたいだら、出る(開いたまま)', async () => {
    const data = { ...NEW, showAfter: '2026-11-01T00:00:00+09:00' };
    const f = okFetch(data);
    expect((await checkForUpdate(f, APP, LAUNCH - 4 * 60 * 1000)).kind).toBe('held'); // 23:56
    expect((await checkForUpdate(f, APP, LAUNCH + 60 * 1000)).kind).toBe('show'); // 0:01
  });
});

describe('時刻の直後に、もう一度確かめる待ち時間', () => {
  it('時刻の 1 秒あとまで。もう過ぎた・長すぎるときは、待たない(null)', () => {
    expect(delayUntilRecheck(LAUNCH, LAUNCH - 60_000)).toBe(61_000);
    expect(delayUntilRecheck(LAUNCH, LAUNCH)).toBe(1000);
    expect(delayUntilRecheck(LAUNCH, LAUNCH + 1000)).toBeNull();
    expect(delayUntilRecheck(LAUNCH, LAUNCH + 60_000)).toBeNull();
    expect(delayUntilRecheck(LAUNCH, LAUNCH - 30 * 24 * 3600 * 1000)).toBeNull(); // setTimeout の上限(約24日)を超える
    expect(delayUntilRecheck(LAUNCH, LAUNCH - 20 * 24 * 3600 * 1000)).not.toBeNull();
  });
});

describe('version.json の中身(ビルド)', () => {
  it('showAfter が無いときは、これまでと同じ { version, notes } のまま(順番も同じ)', () => {
    expect(buildVersionJson('3.49.16', { notes: ['軽微な修正'] })).toBe('{"version":"3.49.16","notes":["軽微な修正"]}');
  });

  it('showAfter があれば、そのまま載る', () => {
    const json = JSON.parse(buildVersionJson('4.0.0', { notes: ['a'], showAfter: '2026-11-01T00:00:00+09:00' }));
    expect(json).toEqual({ version: '4.0.0', notes: ['a'], showAfter: '2026-11-01T00:00:00+09:00' });
  });

  it('いまの package.json と release-notes.json からは、これまでと同じ形が出る(showAfter が入るのは、書いたときだけ)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
    const notes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'release-notes.json'), 'utf-8'));
    const out = JSON.parse(buildVersionJson(pkg.version, notes));
    expect(out.version).toBe(pkg.version);
    expect(out.notes).toEqual(notes.notes);
    expect('showAfter' in out).toBe('showAfter' in notes);
  });

  it('保留する日時が書いてあるときは、公開の日時(LAUNCH_AT)と同じ時刻(ずれたら落ちる)', () => {
    const notes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'release-notes.json'), 'utf-8'));
    if (notes.showAfter === undefined) return;
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', 'launch.ts'), 'utf-8');
    const m = /export const LAUNCH_AT: string \| null = '([^']*)'/.exec(src);
    expect(m, 'launch.ts の LAUNCH_AT').not.toBeNull();
    expect(Date.parse(notes.showAfter)).toBe(Date.parse(m![1]));
  });
});
