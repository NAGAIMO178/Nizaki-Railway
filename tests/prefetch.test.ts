// 先読み: 回線が細いときはしない / ページの読み込みが終わってから、手が空いたときに、ひとつずつ / 先読みした画面は、待たずに出る
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { canPrefetch, lazyScreen, prefetchScreens } from '../src/utils/lazyScreen';

// 手動で進められる環境(idle と load を、テストから起こす)
const fakeEnv = (connection?: { saveData?: boolean; effectiveType?: string } | null) => {
  const idleQueue: (() => void)[] = [];
  const loadQueue: (() => void)[] = [];
  return {
    env: {
      connection,
      idle: (cb: () => void) => {
        idleQueue.push(cb);
        return () => {
          const i = idleQueue.indexOf(cb);
          if (i >= 0) idleQueue.splice(i, 1);
        };
      },
      whenLoaded: (cb: () => void) => {
        loadQueue.push(cb);
        return () => {};
      },
    },
    fireLoad: () => loadQueue.splice(0).forEach((f) => f()),
    runIdle: async () => {
      idleQueue.splice(0).forEach((f) => f());
      await new Promise((r) => setTimeout(r, 0)); // preload の完了(次の予約)を待つ
    },
    pendingIdle: () => idleQueue.length,
  };
};

const screen = (log: string[], name: string) => ({
  preload: () => {
    log.push(name);
    return Promise.resolve();
  },
});

describe('先読みの条件', () => {
  it('データ節約・遅い回線(3G以下)では先読みしない', () => {
    expect(canPrefetch({ saveData: true, effectiveType: '4g' })).toBe(false);
    for (const t of ['slow-2g', '2g', '3g']) expect(canPrefetch({ effectiveType: t })).toBe(false);
  });

  it('4G、または回線の情報が取れないときは先読みする', () => {
    expect(canPrefetch({ effectiveType: '4g' })).toBe(true);
    expect(canPrefetch({})).toBe(true);
    expect(canPrefetch(undefined)).toBe(true);
  });
});

describe('prefetchScreens', () => {
  it('ページの読み込みが終わる前は、何も読み込まない', async () => {
    const log: string[] = [];
    const f = fakeEnv();
    prefetchScreens([screen(log, 'a')], f.env);
    await f.runIdle();
    expect(log).toEqual([]);
  });

  it('読み込みが終わったあと、手が空くたびに、順番に、ひとつずつ読み込む', async () => {
    const log: string[] = [];
    const f = fakeEnv();
    prefetchScreens([screen(log, 'a'), screen(log, 'b'), screen(log, 'c')], f.env);
    f.fireLoad();
    await f.runIdle();
    expect(log).toEqual(['a']);
    await f.runIdle();
    expect(log).toEqual(['a', 'b']);
    await f.runIdle();
    expect(log).toEqual(['a', 'b', 'c']);
    expect(f.pendingIdle()).toBe(0);
  });

  it('データ節約のときは、まったく読み込まない', async () => {
    const log: string[] = [];
    const f = fakeEnv({ saveData: true });
    prefetchScreens([screen(log, 'a')], f.env);
    f.fireLoad();
    await f.runIdle();
    expect(log).toEqual([]);
  });

  it('止めると、そのあとは読み込まない', async () => {
    const log: string[] = [];
    const f = fakeEnv();
    const stop = prefetchScreens([screen(log, 'a'), screen(log, 'b')], f.env);
    f.fireLoad();
    await f.runIdle();
    stop();
    await f.runIdle();
    expect(log).toEqual(['a']);
  });

  it('ひとつ失敗しても、次の読み込みは続く', async () => {
    const log: string[] = [];
    const f = fakeEnv();
    const failing = { preload: () => Promise.reject(new Error('offline')) };
    prefetchScreens([failing, screen(log, 'b')], f.env);
    f.fireLoad();
    await f.runIdle();
    await f.runIdle();
    expect(log).toEqual(['b']);
  });
});

describe('lazyScreen', () => {
  const Hello = () => React.createElement('p', null, 'こんにちは');
  const make = () => lazyScreen<typeof Hello>(() => Promise.resolve({ Hello }), 'Hello');

  it('先読みしたあとは、待たずに(読み込み中にならず)、その場で出る', async () => {
    const Screen = make();
    await Screen.preload();
    expect(renderToString(React.createElement(Screen))).toContain('こんにちは');
  });

  it('先読みしていない画面は、同じ書き方では、すぐには出ない(開くときに読み込む)', () => {
    const Screen = make();
    let html = '';
    try {
      html = renderToString(React.createElement(Screen));
    } catch {
      // 読み込み待ちで中断される
    }
    expect(html).not.toContain('こんにちは');
  });
});
