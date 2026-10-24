// 公開記念イベントの文を、LINE のように、1つずつ、間をあけて出す。
//  - 出る前に、「…」の入力中の表示(長い文は、少し長く)
//  - すでに見た場面・端末の「動きを減らす」設定のときは、全部すぐ出す
//  - タップで、残りを全部すぐ出す(画面側)
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScriptLine } from '../data/eventTareScript';

export const TYPING_MIN_MS = 600;
export const TYPING_MAX_MS = 1000;
export const GAP_MS = 300; // ふきだしが出てから、次の「…」が出るまでの間

// その文が出るまでの、入力中の長さ(ms)。ナレーションは、少し短い
export const revealDelayMs = (line: Pick<ScriptLine, 'who' | 'text'>): number => {
  if (line.who === 'ナレーション') return Math.min(800, 450 + line.text.length * 5);
  return Math.min(TYPING_MAX_MS, TYPING_MIN_MS + line.text.length * 7);
};

export const totalRevealMs = (lines: Pick<ScriptLine, 'who' | 'text'>[]): number => lines.reduce((sum, l) => sum + GAP_MS + revealDelayMs(l), 0);

// 各行が出る時刻(開始からの ms)。1行ずつ、前の行が出てから、次の入力中が始まる
export const revealSchedule = (lines: Pick<ScriptLine, 'who' | 'text'>[]): number[] => {
  let t = 0;
  return lines.map((l) => (t += GAP_MS + revealDelayMs(l)));
};

// 開始から elapsedMs たったとき、出ている行の数。skip(タップ)や、見た場面のときは、elapsedMs を無限大にする
export const visibleCount = (lines: Pick<ScriptLine, 'who' | 'text'>[], elapsedMs: number): number =>
  revealSchedule(lines).filter((at) => at <= elapsedMs).length;

// 見た場面の印(端末の中)
const SEEN_PREFIX = 'nizaki_tare_seen:';
export interface SeenStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const defaultStore = (): SeenStore | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
export const isSceneSeen = (key: string, store: SeenStore | null = defaultStore()): boolean => {
  try {
    return store?.getItem(SEEN_PREFIX + key) === '1';
  } catch {
    return false;
  }
};
export const markSceneSeen = (key: string, store: SeenStore | null = defaultStore()): void => {
  try {
    store?.setItem(SEEN_PREFIX + key, '1');
  } catch {
    // 保存できない環境でも、画面は動く
  }
};

export const prefersReducedMotion = (): boolean => {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// 1つずつ出す。skipSignal の数が変わると(タップ)、残りを全部すぐ出す
export const useReveal = (lines: ScriptLine[], key: string, skipSignal = 0) => {
  const instant = useMemo(() => isSceneSeen(key) || prefersReducedMotion(), [key]);
  const [count, setCount] = useState(instant ? lines.length : 0);
  const [showTyping, setShowTyping] = useState(false);
  const lastSignal = useRef(skipSignal);

  useEffect(() => {
    if (skipSignal !== lastSignal.current) {
      lastSignal.current = skipSignal;
      setCount(lines.length);
    }
  }, [skipSignal, lines.length]);

  useEffect(() => {
    if (count >= lines.length) {
      markSceneSeen(key);
      return;
    }
    // 間をあけて「…」を出し、決まった長さのあと、ふきだしを出す
    const t1 = window.setTimeout(() => setShowTyping(true), GAP_MS);
    const t2 = window.setTimeout(() => {
      setShowTyping(false);
      setCount((c) => c + 1);
    }, GAP_MS + revealDelayMs(lines[count]));
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [count, lines, key]);

  const done = count >= lines.length;
  return { count, typing: !done && showTyping, done, skip: () => setCount(lines.length) };
};
