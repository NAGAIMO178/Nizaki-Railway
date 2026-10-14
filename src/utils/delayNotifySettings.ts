// 遅れの知らせの設定(NIZAKI 2.0。公開後だけ使う)。この端末に保存する。
//   all     … すべての路線・方面の遅れ(初期設定)
//   mystation … マイ駅に、これから停まる列車の遅れだけ
//   off     … 知らせない
import { useEffect, useState } from 'react';

export type DelayNotifyMode = 'all' | 'mystation' | 'off';

const KEY = 'nizaki_delay_notify_mode';
const EVENT = 'nizaki-delay-notify-mode';

export const getDelayNotifyMode = (): DelayNotifyMode => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'all' || v === 'mystation' || v === 'off') return v;
  } catch {
    // 読めなければ、初期設定
  }
  return 'all';
};

export const setDelayNotifyMode = (mode: DelayNotifyMode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // 保存できなくても、この画面を開いているあいだは、変わる
  }
  window.dispatchEvent(new CustomEvent<DelayNotifyMode>(EVENT, { detail: mode }));
};

// 設定画面と、見張りの部品が、同じ値を見るための部品
export const useDelayNotifyMode = (): [DelayNotifyMode, (m: DelayNotifyMode) => void] => {
  const [mode, setMode] = useState<DelayNotifyMode>(getDelayNotifyMode);
  useEffect(() => {
    const onChange = (e: Event) => setMode((e as CustomEvent<DelayNotifyMode>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [mode, setDelayNotifyMode];
};
