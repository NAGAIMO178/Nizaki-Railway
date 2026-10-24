import { describe, expect, it } from 'vitest';
import { ACT1, ACT2, ACT3_BEFORE_RESERVATION, ACT3_RESERVED, ACT5, ACT6, EPILOGUE } from '../src/data/eventTareScript';
import {
  isSceneSeen,
  markSceneSeen,
  prefersReducedMotion,
  revealDelayMs,
  revealSchedule,
  scrollBehavior,
  startsInstant,
  totalRevealMs,
  TYPING_MAX_MS,
  TYPING_MIN_MS,
  visibleCount,
} from '../src/utils/eventTareReveal';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('1つずつ出す', () => {
  it('入力中の長さは、0.6〜1秒。長い文ほど長い', () => {
    const short = revealDelayMs({ who: '広報', text: 'はい' });
    const long = revealDelayMs({ who: '広報', text: 'あ'.repeat(200) });
    expect(short).toBeGreaterThanOrEqual(TYPING_MIN_MS);
    expect(long).toBe(TYPING_MAX_MS);
    expect(revealDelayMs({ who: '店主', text: 'あ'.repeat(30) })).toBeGreaterThan(short);
    [...ACT1, ...ACT2, ...ACT5, ...ACT6, ...EPILOGUE].forEach((l) => {
      const d = revealDelayMs(l);
      expect(d).toBeLessThanOrEqual(TYPING_MAX_MS);
      expect(d).toBeGreaterThan(0);
    });
  });

  it('導入(第1幕)は、全体で7〜8秒ぐらい(6〜9秒の中)', () => {
    const total = totalRevealMs(ACT1);
    expect(total).toBeGreaterThanOrEqual(6000);
    expect(total).toBeLessThanOrEqual(9000);
  });

  it('1行ずつ、順番に出る(前の行より、あとに出る)', () => {
    [ACT1, ACT2, ACT3_BEFORE_RESERVATION, ACT3_RESERVED, ACT5, ACT6, EPILOGUE].forEach((lines) => {
      const at = revealSchedule(lines);
      expect(at.length).toBe(lines.length);
      for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
    });
  });

  it('時間がたつにつれて、1つずつ増える。最初は0、タップ(無限大)で、全部', () => {
    const at = revealSchedule(ACT1);
    expect(visibleCount(ACT1, 0)).toBe(0);
    expect(visibleCount(ACT1, at[0] - 1)).toBe(0);
    expect(visibleCount(ACT1, at[0])).toBe(1);
    expect(visibleCount(ACT1, at[2])).toBe(3);
    expect(visibleCount(ACT1, Infinity)).toBe(ACT1.length);
  });
});

describe('見た場面・動きを減らす設定', () => {
  it('見た場面の印は、場面ごとに付く', () => {
    const store = memory();
    expect(isSceneSeen('act1', store)).toBe(false);
    markSceneSeen('act1', store);
    expect(isSceneSeen('act1', store)).toBe(true);
    expect(isSceneSeen('act2', store)).toBe(false);
  });

  it('保存できない環境でも、止まらない', () => {
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    expect(isSceneSeen('act1', broken)).toBe(false);
    expect(() => markSceneSeen('act1', broken)).not.toThrow();
    expect(isSceneSeen('act1', null)).toBe(false);
  });

  it('「動きを減らす」設定を読む(無い環境は false)', () => {
    expect(prefersReducedMotion()).toBe(false);
    const w = globalThis as unknown as { window: Record<string, unknown> };
    const prev = w.window.matchMedia;
    w.window.matchMedia = (q: string) => ({ matches: q.includes('reduce') });
    expect(prefersReducedMotion()).toBe(true);
    w.window.matchMedia = prev;
  });
});

describe('すぐ出すか', () => {
  it('見た印があれば、すぐ出す。見ていなければ、1つずつ', () => {
    expect(startsInstant(true)).toBe(true);
    expect(startsInstant(false)).toBe(false);
  });
  it('参加前の導入(replay)は、見た印があっても、1つずつ出す', () => {
    expect(startsInstant(true, true)).toBe(false);
    expect(startsInstant(false, true)).toBe(false);
  });
  it('「動きを減らす」設定でも、見ていない場面は、1つずつ出す(順番は変えない)', () => {
    const w = globalThis as unknown as { window: Record<string, unknown> };
    const prev = w.window.matchMedia;
    w.window.matchMedia = (q: string) => ({ matches: q.includes('reduce') });
    expect(prefersReducedMotion()).toBe(true);
    expect(startsInstant(false)).toBe(false);
    expect(startsInstant(false, true)).toBe(false);
    w.window.matchMedia = prev;
  });
  it('「動きを減らす」設定のときだけ、スクロールをなめらかにしない', () => {
    const w = globalThis as unknown as { window: Record<string, unknown> };
    const prev = w.window.matchMedia;
    expect(scrollBehavior()).toBe('smooth');
    w.window.matchMedia = (q: string) => ({ matches: q.includes('reduce') });
    expect(scrollBehavior()).toBe('auto');
    w.window.matchMedia = prev;
  });
});
