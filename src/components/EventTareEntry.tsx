import React from 'react';
import { ArrowRight } from 'lucide-react';
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

// イベントタブのカード(雅石のミステリーのカードと同じ作り: 白いカード・上の細い帯・札・題名・説明・補足・右の紫のボタン)
export const EventTareCard: React.FC<EntryProps> = ({ joined, cleared, onOpen }) => (
  <div
    onClick={onOpen}
    className="group bg-white rounded-2xl border border-[#E5E2EE] hover:border-[#5B21B6]/60 p-4 sm:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
  >
    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-[#5B21B6] to-red-600" />
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="space-y-2 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-[#EDE9FE] text-[#5B21B6] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-[#DDD8EB]">{TARE_BADGE}</span>
          <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">{cleared ? UI.cardSolved : UI.cardOpen}</span>
        </div>
        <div>
          <h4 className="text-base sm:text-lg font-extrabold text-[#221C35] group-hover:text-[#5B21B6] transition-colors">{TARE_TITLE}</h4>
          <p className="text-xs text-[#6B6380] mt-1 leading-relaxed">{UI.cardTagline}</p>
        </div>
        <div className="text-[11px] text-[#857D99] pt-1">{UI.cardReward}</div>
      </div>
      <div className="flex sm:flex-col items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
        >
          <span>{cleared ? UI.cardSeeAgain : joined ? UI.cardContinue : UI.join}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
);
