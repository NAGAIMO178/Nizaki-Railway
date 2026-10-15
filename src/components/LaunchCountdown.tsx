import React, { useEffect, useState } from 'react';
import { COUNTDOWN_TO } from '../utils/launch';

const TARGET_MS = Date.parse(COUNTDOWN_TO);

const two = (n: number): string => String(n).padStart(2, '0');

// ホームの上に出す、NIZAKI 2.0 の公開までのカウントダウンの帯(公開前だけ。公開の日時になると消える)
const LaunchCountdown: React.FC = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const left = TARGET_MS - now;
  if (!(left > 0)) return null;

  const sec = Math.floor(left / 1000);
  const days = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  return (
    <div className="bg-[#5B21B6] text-white px-3 py-2 flex items-center justify-between gap-3" role="timer" aria-label="NIZAKI 2.0 公開までの時間">
      <span className="text-xs font-bold">NIZAKI 2.0 公開まで</span>
      <span className="flex items-baseline gap-1 tabular-nums">
        <span className="text-[10px] font-bold text-[#D9CCF5]">あと</span>
        {days > 0 && (
          <>
            <span className="text-base font-black leading-none">{days}</span>
            <span className="text-[10px] font-bold text-[#D9CCF5] mr-1">日</span>
          </>
        )}
        <span className="text-base font-black leading-none">
          {two(h)}:{two(m)}:{two(s)}
        </span>
      </span>
    </div>
  );
};

export default LaunchCountdown;
