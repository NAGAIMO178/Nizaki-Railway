// 遅れの知らせの設定(NIZAKI 2.0。公開後だけ使う)。この端末に保存する。
//   all   … すべての路線・方面の遅れ(初期設定)
//   lines … 選んだ路線の遅れだけ
//   off   … 知らせない
// 以前の「マイ駅だけ」('mystation')を保存していた端末は、「すべて」に読み替える。
import { useEffect, useState } from 'react';
import { safeStorage } from './safeStorage';
import { TK_LINE_COLOR, withTk } from './tkLine';

export type DelayNotifyMode = 'all' | 'lines' | 'off';

// 選べる路線(画面の路線ID。useDelayWatcher の路線と同じ)
// 高宮線は、見せるのは、tkLine.ts のスイッチが入ってから
export const DELAY_NOTIFY_LINES: { id: string; name: string; color: string }[] = withTk(
  [
    { id: 'kanzaki', name: '神埼線', color: '#8B5CF6' },
    { id: 'kanzaki_kosoku', name: '神埼高速線', color: '#3B82F6' },
    { id: 'saichi_loop', name: '埼千環状線', color: '#EC4899' },
    { id: 'tsuchiura', name: '土浦線', color: '#3CB371' },
  ],
  { id: 'takamiya', name: '高宮線', color: TK_LINE_COLOR }
);
const LINE_IDS: string[] = DELAY_NOTIFY_LINES.map((l) => l.id);

const KEY = 'nizaki_delay_notify_mode';
const LINES_KEY = 'nizaki_delay_notify_lines';
const EVENT = 'nizaki-delay-notify-mode';

// 保存された値を、いまの設定に読み替える(読めない・古い値は、初期設定)
export const parseDelayNotifyMode = (v: string | null): DelayNotifyMode => (v === 'lines' || v === 'off' || v === 'all' ? v : 'all');

// 選んだ路線の保存値。まだ選んでいない(保存が無い・壊れている)ときは、4路線とも選んだ状態。ID は、いまある路線だけ、もとの並びで返す
export const parseDelayNotifyLines = (raw: string | null): string[] => {
  try {
    const v = JSON.parse(raw || 'null');
    if (Array.isArray(v)) return LINE_IDS.filter((id) => v.includes(id));
  } catch {
    // 読めなければ、初期設定
  }
  return [...LINE_IDS];
};

export const getDelayNotifyMode = (): DelayNotifyMode => {
  try {
    return parseDelayNotifyMode(safeStorage.getItem(KEY));
  } catch {
    return 'all';
  }
};

export const getDelayNotifyLines = (): string[] => {
  try {
    return parseDelayNotifyLines(safeStorage.getItem(LINES_KEY));
  } catch {
    return [...LINE_IDS];
  }
};

interface Detail {
  mode: DelayNotifyMode;
  lines: string[];
}

const announce = () => window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { mode: getDelayNotifyMode(), lines: getDelayNotifyLines() } }));

export const setDelayNotifyMode = (mode: DelayNotifyMode) => {
  try {
    safeStorage.setItem(KEY, mode);
  } catch {
    // 保存できなくても、この画面を開いているあいだは、変わる
  }
  announce();
};

export const setDelayNotifyLines = (lines: string[]) => {
  try {
    safeStorage.setItem(LINES_KEY, JSON.stringify(LINE_IDS.filter((id) => lines.includes(id))));
  } catch {
    // 同上
  }
  announce();
};

// 設定画面と、見張りの部品が、同じ値を見るための部品
export const useDelayNotifyMode = (): [DelayNotifyMode, (m: DelayNotifyMode) => void] => {
  const [mode, setMode] = useState<DelayNotifyMode>(getDelayNotifyMode);
  useEffect(() => {
    const onChange = (e: Event) => setMode((e as CustomEvent<Detail>).detail.mode);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [mode, setDelayNotifyMode];
};

export const useDelayNotifyLines = (): [string[], (l: string[]) => void] => {
  const [lines, setLines] = useState<string[]>(getDelayNotifyLines);
  useEffect(() => {
    const onChange = (e: Event) => setLines((e as CustomEvent<Detail>).detail.lines);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [lines, setDelayNotifyLines];
};
