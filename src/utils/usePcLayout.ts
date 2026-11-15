// 「PC 表示が出ていて、かつ、PC の幅(1024px 以上)か」。CSS の pc: と同じ条件を、JavaScript で見るとき用。
import { useSyncExternalStore } from 'react';
import { getPcLayoutMarked, PC_MIN_WIDTH_PX, subscribePcLayout } from './pcLayout';
import { useMediaQuery } from './useMediaQuery';

export const usePcLayout = (): boolean => {
  const marked = useSyncExternalStore(subscribePcLayout, getPcLayoutMarked, () => false);
  const wide = useMediaQuery(`(min-width: ${PC_MIN_WIDTH_PX}px)`);
  return marked && wide;
};
