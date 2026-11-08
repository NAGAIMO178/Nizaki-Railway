// localStorage が使えない端末でも、アプリを開いているあいだは、設定・通知済みの記録・運行情報を覚えておける
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn() }));

import { callGas } from '../src/utils/accountApi';
import { clearSafeStorageMemory, safeStorage } from '../src/utils/safeStorage';
import { getDelayNotifyLines, getDelayNotifyMode, setDelayNotifyLines, setDelayNotifyMode } from '../src/utils/delayNotifySettings';
import { disruptionManager, type LineDisruption } from '../src/utils/disruptionManager';

const g = globalThis as unknown as { localStorage: unknown; window: Record<string, unknown>; CustomEvent: unknown };
const original = g.localStorage;
const broken = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
  clear() {
    throw new Error('SecurityError');
  },
};

beforeEach(() => {
  g.window.dispatchEvent = () => true;
  g.CustomEvent = class {
    constructor(public type: string, public init?: unknown) {}
  };
  clearSafeStorageMemory();
  vi.mocked(callGas).mockResolvedValue({ status: 'success' } as never);
});
afterEach(() => {
  g.localStorage = original;
  g.window.localStorage = original;
  clearSafeStorageMemory();
});

const disruption = (): LineDisruption => ({
  lineId: 'kanzaki',
  lineName: '神埼線',
  code: 'Y',
  statusType: 'suspended',
  targetDirection: 'both',
  maxDelayMinutes: 0,
  durationUntil: '',
  section: '全線',
  reason: '車両点検のため',
  customMessage: '',
  useCustomMessage: false,
  linkToSystem: true,
  updatedAt: '',
});

describe('使えるとき(ふつう)', () => {
  it('localStorage に書いて、読める。メモリには残さない', () => {
    safeStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(safeStorage.getItem('k')).toBe('v');
    safeStorage.removeItem('k');
    expect(localStorage.getItem('k')).toBeNull();
    expect(safeStorage.getItem('k')).toBeNull();
  });
});

describe('localStorage が使えない端末', () => {
  beforeEach(() => {
    g.localStorage = broken;
    g.window.localStorage = broken;
  });

  it('書いても読めて、消せる(例外にならない)', () => {
    expect(() => safeStorage.setItem('a', '1')).not.toThrow();
    expect(safeStorage.getItem('a')).toBe('1');
    safeStorage.setItem('a', '2');
    expect(safeStorage.getItem('a')).toBe('2');
    expect(() => safeStorage.removeItem('a')).not.toThrow();
    expect(safeStorage.getItem('a')).toBeNull();
    expect(safeStorage.getItem('ない')).toBeNull();
  });

  it('遅れの知らせの設定が、元に戻らない(選んだ路線も)', () => {
    setDelayNotifyMode('lines');
    setDelayNotifyLines(['tsuchiura']);
    expect(getDelayNotifyMode()).toBe('lines');
    expect(getDelayNotifyLines()).toEqual(['tsuchiura']);
    setDelayNotifyMode('off');
    expect(getDelayNotifyMode()).toBe('off');
  });

  it('運行情報(運行指令)が、捨てられず、そのまま読める(「平常」に見えない)', () => {
    disruptionManager.setLineDisruption(disruption());
    expect(disruptionManager.getLineDisruption('kanzaki')?.statusType).toBe('suspended');
    disruptionManager.clearAllDisruptions();
    expect(disruptionManager.getLineDisruption('kanzaki')).toBeNull();
  });
});

describe('一度書けなくなって、あとで書けるようになったとき', () => {
  it('新しい値を localStorage に書き、古いメモリの値で、上書きされない', () => {
    g.localStorage = broken;
    safeStorage.setItem('x', 'メモリ');
    g.localStorage = original;
    expect(safeStorage.getItem('x')).toBe('メモリ');
    safeStorage.setItem('x', '新しい');
    expect(safeStorage.getItem('x')).toBe('新しい');
    expect(localStorage.getItem('x')).toBe('新しい');
    localStorage.removeItem('x');
  });
});
