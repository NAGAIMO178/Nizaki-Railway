// PC 表示を、日時(PC_LAYOUT_AT)まで隠すしくみ。launch.ts の ?preview=1 と同じ要領の、確認用の ?pc=1 つき。
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPcLayout, getPcLayoutMarked, isPcLayoutOn, PC_LAYOUT_ATTR, PC_LAYOUT_AT, PC_LAYOUT_KEY, PC_MIN_WIDTH_PX, startPcLayout, subscribePcLayout } from '../src/utils/pcLayout';
import { TK_LAUNCH_AT } from '../src/utils/tkLine';

const AT = Date.parse(PC_LAYOUT_AT as string);
const root = path.resolve(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf-8');

type G = typeof globalThis & { window: { location: { search: string } }; localStorage: Storage; document?: unknown };
const g = globalThis as unknown as G;
const origSearch = g.window.location.search;
const origStorage = g.localStorage;

const setSearch = (s: string) => {
  g.window.location.search = s;
};

beforeEach(() => {
  setSearch('');
  origStorage.removeItem(PC_LAYOUT_KEY);
});
afterEach(() => {
  setSearch(origSearch);
  origStorage.removeItem(PC_LAYOUT_KEY);
  Object.defineProperty(globalThis, 'localStorage', { value: origStorage, configurable: true, writable: true });
  delete (g as { document?: unknown }).document;
  vi.useRealTimers();
});

describe('日時の判定', () => {
  it('公開の日時は、2026-11-20 8:00(日本時間)=高宮線の公開と同じ時刻', () => {
    expect(PC_LAYOUT_AT).toBe('2026-11-20T08:00:00+09:00');
    expect(PC_LAYOUT_AT).toBe(TK_LAUNCH_AT);
  });

  it('1ミリ秒前=無効、ちょうど=有効、そのあと=有効', () => {
    expect(isPcLayoutOn(AT - 1)).toBe(false);
    expect(isPcLayoutOn(AT - 24 * 3600 * 1000)).toBe(false);
    expect(isPcLayoutOn(AT)).toBe(true);
    expect(isPcLayoutOn(AT + 1)).toBe(true);
  });
});

describe('確認用の ?pc=1 / ?pc=0', () => {
  it('?pc=1 で有効になり、この端末に覚える。次からは、?pc=1 が無くても有効', () => {
    expect(isPcLayoutOn(AT - 1)).toBe(false);
    setSearch('?pc=1');
    expect(isPcLayoutOn(AT - 1)).toBe(true);
    expect(origStorage.getItem(PC_LAYOUT_KEY)).toBe('1');
    setSearch('');
    expect(isPcLayoutOn(AT - 1)).toBe(true);
  });

  it('?pc=0 で解除する(日時の前なら、無効に戻る。日時のあとは、そのまま有効)', () => {
    setSearch('?pc=1');
    expect(isPcLayoutOn(AT - 1)).toBe(true);
    setSearch('?pc=0');
    expect(isPcLayoutOn(AT - 1)).toBe(false);
    expect(origStorage.getItem(PC_LAYOUT_KEY)).toBeNull();
    expect(isPcLayoutOn(AT)).toBe(true);
  });

  it('?preview=1(公開後の確認用)とは、別のもの(?preview=1 だけでは、PC 表示は出ない)', () => {
    setSearch('?preview=1');
    expect(isPcLayoutOn(AT - 1)).toBe(false);
  });

  it('保存できない環境でも、日時の判定は動く(?pc=1 は効かない)', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: bad, configurable: true, writable: true });
    setSearch('?pc=1');
    expect(isPcLayoutOn(AT - 1)).toBe(false);
    expect(isPcLayoutOn(AT)).toBe(true);
  });
});

describe('画面全体の印(<html data-pc-layout="on">)', () => {
  const fakeDoc = () => {
    const attrs = new Map<string, string>();
    const doc = { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } };
    (g as { document?: unknown }).document = doc;
    return attrs;
  };

  it('有効のときだけ印を付け、無効なら外す。変わったときだけ、知らせる', () => {
    const attrs = fakeDoc();
    const cb = vi.fn();
    const off = subscribePcLayout(cb);
    expect(applyPcLayout(AT - 1)).toBe(false);
    expect(attrs.has(PC_LAYOUT_ATTR)).toBe(false);
    expect(getPcLayoutMarked()).toBe(false);
    expect(applyPcLayout(AT)).toBe(true);
    expect(attrs.get(PC_LAYOUT_ATTR)).toBe('on');
    expect(getPcLayoutMarked()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    applyPcLayout(AT + 5);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSearch('?pc=0');
    applyPcLayout(AT - 1);
    expect(attrs.has(PC_LAYOUT_ATTR)).toBe(false);
    expect(getPcLayoutMarked()).toBe(false);
  });

  it('アプリを開いたまま日時をまたぐと、その瞬間に切り替わる', () => {
    const attrs = fakeDoc();
    vi.useFakeTimers();
    vi.setSystemTime(AT - 3000);
    const stop = startPcLayout();
    expect(attrs.has(PC_LAYOUT_ATTR)).toBe(false);
    vi.advanceTimersByTime(2900);
    expect(attrs.has(PC_LAYOUT_ATTR)).toBe(false);
    vi.advanceTimersByTime(300);
    expect(attrs.get(PC_LAYOUT_ATTR)).toBe('on');
    stop();
  });
});

describe('CSS(pc: )と、つなぎ', () => {
  const css = read('src', 'index.css');
  it('pc: は、「印が付いている」かつ「幅 1024px 以上」のときだけ効く(PC_MIN_WIDTH_PX と同じ値)', () => {
    expect(PC_MIN_WIDTH_PX).toBe(1024);
    expect(css).toMatch(/@custom-variant pc \{\s*@media \(min-width: 1024px\) \{\s*&:where\(\[data-pc-layout="on"\] \*\) \{\s*@slot;/);
  });
  it('アプリの起動時に、描くより先に、印を付ける', () => {
    const main = read('src', 'main.tsx');
    expect(main).toContain("import { startPcLayout } from './utils/pcLayout';");
    expect(main.indexOf('startPcLayout();')).toBeLessThan(main.indexOf('createRoot('));
  });
});

describe('JavaScript で見た目を切り替えている所(列車位置の詳細)', () => {
  it('幅だけでなく、PC 表示が出ているかも見る(隠れているあいだは、スマホと同じ動き)', () => {
    const hook = read('src', 'utils', 'usePcLayout.ts');
    expect(hook).toContain('return marked && wide;');
    expect(hook).toContain('PC_MIN_WIDTH_PX');
    const loc = read('src', 'components', 'TrainLocationTab.tsx');
    expect(loc).toContain('const isPc = usePcLayout();');
    expect(loc).not.toContain("useMediaQuery('(min-width: 1024px)')");
  });
  it('PC 用の指定(max-w の 960 など)は、lg: では書かない(PC 表示を日時まで隠すため、pc: だけ)', () => {
    for (const f of ['TimetableTab', 'TrainLocationTab', 'TrainDetailV2', 'TimetableLegend', 'Header', 'FooterNav', 'EquipTab', 'ReservationTab', 'SettingsTab']) {
      expect(read('src', 'components', `${f}.tsx`), f).not.toMatch(/\blg:/);
    }
    expect(read('src', 'App.tsx')).not.toMatch(/lg:overflow-y-visible|lg:max-w-\[960px\]/);
    // イベントには、もとから PC と関係のない lg: がある(触らない)。足したのは pc:max-w-[960px] だけ
    expect(read('src', 'components', 'EventsTab.tsx')).not.toMatch(/lg:max-w-\[960px\]/);
  });
});
