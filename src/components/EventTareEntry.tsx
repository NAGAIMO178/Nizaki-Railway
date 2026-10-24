import React from 'react';
import { TARE_BADGE, TARE_TITLE, UI } from '../data/eventTareScript';

// 公開記念イベントの入口(公開後だけ。呼ぶ側が isLaunched() の内側で出す)。雅石のミステリーと同じ、暗い背景と琥珀色。
interface EntryProps {
  joined: boolean;
  cleared: boolean;
  onOpen: () => void;
}

// 予約画面の、細い帯(解決したあとは出さない)
export const EventTareBand: React.FC<EntryProps> = ({ joined, cleared, onOpen }) => {
  if (cleared) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-2.5 rounded-xl border border-amber-600/45 bg-gradient-to-r from-[#1b1320] to-[#0C0A10] px-3 py-2 text-left cursor-pointer"
    >
      <span className="w-7 h-7 rounded-lg bg-[#991B1B] text-amber-100 text-xs font-black flex items-center justify-center shrink-0">秘</span>
      <span className="min-w-0 flex-1 text-xs font-bold text-amber-100 truncate">
        {TARE_BADGE} {joined ? UI.entryResume : UI.entryOpen}
      </span>
      <span className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-black text-[#1c1410]">{joined ? UI.entryContinue : UI.entryDetail}</span>
    </button>
  );
};

// イベントタブの先頭の、大きなカード
export const EventTareCard: React.FC<EntryProps> = ({ joined, cleared, onOpen }) => (
  <div className="rounded-2xl border border-amber-600/50 bg-gradient-to-b from-[#1d1522] to-[#0C0A10] p-4 space-y-3">
    <div className="flex items-center gap-1.5">
      <span className="rounded-full bg-[#991B1B] px-2.5 py-0.5 text-[10px] font-extrabold text-red-100">{cleared ? UI.cardSolved : UI.cardOpen}</span>
      <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-400">{TARE_BADGE}</span>
    </div>
    <div>
      <h4 className="font-serif text-lg font-extrabold leading-snug text-amber-100">{TARE_TITLE}</h4>
      <p className="mt-1 text-xs text-stone-400">{UI.cardTagline}</p>
    </div>
    <button
      type="button"
      onClick={onOpen}
      className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#1c1410] text-sm font-black cursor-pointer"
    >
      {cleared ? UI.cardSeeAgain : joined ? UI.entryContinue : UI.join}
    </button>
  </div>
);
