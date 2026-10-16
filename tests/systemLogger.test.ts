// エラーの記録(systemLogger)の決まりを調べる。
// 100件までしか残さない・開発用の雑音は記録しない・保存データが壊れていても動く・画面の外で起きたエラーを拾う、を確かめる。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'nizaki_system_logs';

type Handler = (event: unknown) => void;
const handlers: Record<string, Handler> = {};

// 保存データを読むのは、読み込みのときなので、毎回、読み込み直す
const load = async () => {
  vi.resetModules();
  return (await import('../src/utils/systemLogger')).systemLogger;
};

const originalConsoleError = console.error;

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(handlers)) delete handlers[k];
  Object.assign(window, {
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
  });
});

afterEach(() => {
  console.error = originalConsoleError;
  vi.restoreAllMocks();
});

describe('記録の追加', () => {
  it('新しいものが先頭に来て、種類・出どころ・内容が入る', async () => {
    const log = await load();
    log.error('一つめ', 'A');
    log.warn('二つめ', 'B', '詳細');
    const [first, second] = log.getLogs();
    expect(first).toMatchObject({ level: 'warn', source: 'B', message: '二つめ', details: '詳細' });
    expect(second).toMatchObject({ level: 'error', source: 'A', message: '一つめ' });
    expect(first.id).not.toBe(second.id);
  });

  it('出どころを省くと App になる', async () => {
    const log = await load();
    expect(log.addLog({ level: 'info', source: '', message: 'x' })?.source).toBe('App');
  });

  it('100件を超えたら、古いものから消える(保存データも100件まで)', async () => {
    const log = await load();
    for (let n = 0; n < 130; n++) log.info(`m${n}`);
    const logs = log.getLogs();
    expect(logs).toHaveLength(100);
    expect(logs[0].message).toBe('m129');
    expect(logs[99].message).toBe('m30');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(100);
  });

  it('開発用の雑音や、昔の試験用の記録は、残さない', async () => {
    const log = await load();
    expect(log.error('[vite] failed to connect to websocket')).toBeUndefined();
    expect(log.error('WebSocket closed without opened')).toBeUndefined();
    expect(log.error('[管理者テスト] x')).toBeUndefined();
    expect(log.getLogs()).toHaveLength(0);
  });
});

describe('保存データ', () => {
  it('次に開いたときも、残っている', async () => {
    const a = await load();
    a.error('残る');
    const b = await load();
    expect(b.getLogs().map((l) => l.message)).toEqual(['残る']);
  });

  it('壊れた保存データや、配列でないものは、空として扱う', async () => {
    localStorage.setItem(STORAGE_KEY, '{こわれた');
    expect((await load()).getLogs()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, '{"a":1}');
    expect((await load()).getLogs()).toEqual([]);
  });

  it('読み込むとき、保存データの中の雑音は取り除く', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1', level: 'error', source: 'x', message: '診断用エラーが発生しました', timestamp: '' },
        { id: '2', level: 'error', source: 'x', message: '本物のエラー', timestamp: '' },
      ])
    );
    const log = await load();
    expect(log.getLogs().map((l) => l.message)).toEqual(['本物のエラー']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1);
  });

  it('消去すると空になり、「消去された」という一件だけが残る', async () => {
    const log = await load();
    log.error('a');
    log.error('b');
    log.clearLogs();
    expect(log.getLogs().map((l) => l.message)).toEqual(['ログが消去されました。']);
  });
});

describe('変更の通知', () => {
  it('登録すると、すぐ今の一覧が届き、追加のたびに届き、外すと届かない', async () => {
    const log = await load();
    log.info('既にある');
    const seen: number[] = [];
    const off = log.subscribe((logs) => seen.push(logs.length));
    expect(seen).toEqual([1]);
    log.info('追加');
    expect(seen).toEqual([1, 2]);
    off();
    log.info('外した後');
    expect(seen).toEqual([1, 2]);
  });

  it('通知先が失敗しても、記録も、ほかの通知先も止まらない', async () => {
    const log = await load();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = vi.fn();
    let ready = false;
    log.subscribe(() => {
      if (ready) throw new Error('boom');
    });
    log.subscribe(ok);
    ok.mockClear();
    ready = true;
    log.info('x');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(log.getLogs()).toHaveLength(1);
  });
});

describe('画面の外で起きたエラーを拾う', () => {
  it('実行時のエラーと、拾われなかった約束の失敗を記録する', async () => {
    const log = await load();
    log.init();
    handlers.error({ message: '壊れた', filename: 'a.js', lineno: 3, colno: 5, error: new Error('x') });
    handlers.unhandledrejection({ reason: new Error('通信失敗') });
    handlers.unhandledrejection({ reason: '文字の理由' });
    handlers.unhandledrejection({ reason: { code: 7 } });
    const msgs = log.getLogs().map((l) => `${l.source}:${l.message}`);
    expect(msgs).toContain('Window.OnError:壊れた');
    expect(msgs).toContain('UnhandledRejection:通信失敗');
    expect(msgs).toContain('UnhandledRejection:文字の理由');
    expect(msgs).toContain('UnhandledRejection:{"code":7}');
    expect(log.getLogs().find((l) => l.message === '壊れた')?.details).toBe('a.js:3:5');
  });

  it('console.error も記録し、元の出力もそのまま行う(雑音と、記録機能自身の警告は除く)', async () => {
    const spy = vi.fn();
    console.error = spy;
    const log = await load();
    log.init();
    console.error('読み込み失敗', { id: 1 });
    console.error('[SystemLogger] 自分の警告');
    console.error('[vite] failed to connect to websocket');
    expect(spy).toHaveBeenCalledTimes(3);
    const consoleLogs = log.getLogs().filter((l) => l.source === 'console.error');
    expect(consoleLogs.map((l) => l.message)).toEqual(['読み込み失敗 {"id":1}']);
  });

  it('二度 init しても、重ねて登録しない', async () => {
    const add = vi.fn();
    Object.assign(window, { addEventListener: add });
    const log = await load();
    log.init();
    log.init();
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('起動したことと、版番号を記録する', async () => {
    const log = await load();
    log.init();
    expect(log.getLogs().some((l) => l.source === 'SystemCore' && l.message.includes('vtest'))).toBe(true);
  });
});
