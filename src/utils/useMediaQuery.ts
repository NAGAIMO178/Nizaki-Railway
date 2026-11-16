// 画面の条件(幅・動きを減らす設定など)に合っているかを、返す。使えない環境(テストなど)では、合っていない(false)
import { useEffect, useState } from 'react';

export const matchesQuery = (query: string): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => matchesQuery(query));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
};
