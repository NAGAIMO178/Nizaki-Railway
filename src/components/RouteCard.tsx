import React from 'react';
import { ChevronRight } from 'lucide-react';
import { crowdInfo } from '../utils/crowd';
import { formatDiaTime } from '../utils/diaTimetable';
import { RouteResult } from '../utils/routeSearch';
import { routeCardMark, ROUTE_CARD_MARK_TEXT } from '../utils/routeCardMark';

const DAY = 86400;

interface RouteCardProps {
  result: RouteResult;
  index: number;
  lineColor: (code: string) => string;
  onOpen: () => void;
}

// 経路検索の候補カード。区間の行は、棒・路線名・種別・混雑の札・区間を、全カードで同じ位置から始める
export const RouteCard: React.FC<RouteCardProps> = ({ result: r, index, lineColor, onOpen }) => {
  const mark = routeCardMark(r);
  const hasCrowd = r.legs.some((l) => l.crowd && crowdInfo(l.crowd));
  const columns = `6px 5.1em 1.1em ${hasCrowd ? '4.3em ' : ''}minmax(0,1fr)`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-white border border-[#E6E2EE] rounded-2xl shadow-xs overflow-hidden hover:border-[#C4B5FD] active:bg-[#F9F8FD] transition-colors cursor-pointer"
    >
      <div className="px-3.5 pt-3 pb-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-[#857D99]">
            候補 {index + 1}
            {mark && <span className="ml-1.5 text-rose-700">{ROUTE_CARD_MARK_TEXT[mark]}</span>}
          </div>
          <div className={`text-2xl font-black font-mono leading-tight whitespace-nowrap ${r.delayed ? 'text-rose-600' : 'text-[#221C35]'}`}>
            {formatDiaTime(r.depSec)} <span className="text-[#B4ADC4]">→</span> {formatDiaTime(r.arrSec)}
            {r.arrSec >= DAY && <span className="ml-1 text-[11px] font-bold text-[#857D99]">翌</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-black text-[#5B21B6]">{r.minutes}分</div>
          <div className="text-[11px] text-[#857D99]">乗換 {r.transfers}回</div>
          <div className="text-[11px] font-bold text-[#221C35]">¥{r.fare.toLocaleString()}</div>
        </div>
      </div>

      <div className="border-t border-[#EFEDF5] px-3.5 py-2.5 flex items-center gap-2">
        <div className="flex-1 min-w-0 grid items-center gap-x-1 gap-y-1.5 text-[11px] text-[#221C35]" style={{ gridTemplateColumns: columns }}>
          {r.legs.map((leg, k) => {
            const crowd = leg.crowd ? crowdInfo(leg.crowd) : undefined;
            return (
              <React.Fragment key={`${leg.trainNo}-${k}`}>
                <span className="w-1.5 h-4 rounded-full" style={{ backgroundColor: lineColor(leg.lineCode) }} />
                <span className="font-bold whitespace-nowrap">{leg.lineName}</span>
                <span className={leg.paid ? 'text-amber-600 font-bold' : 'text-[#857D99]'}>{leg.typeAbbr}</span>
                {hasCrowd && (
                  <span>
                    {crowd && (
                      <span
                        className="inline-block w-full text-center text-[11px] font-black px-0.5 py-px rounded border border-black/10 whitespace-nowrap"
                        style={{ background: crowd.color, color: crowd.text }}
                      >
                        {crowd.short}
                      </span>
                    )}
                  </span>
                )}
                <span className="text-[#857D99] truncate">
                  {leg.from} {formatDiaTime(leg.depSec)} → {leg.to} {formatDiaTime(leg.arrSec)}
                </span>
              </React.Fragment>
            );
          })}
        </div>
        <ChevronRight className="w-4 h-4 text-[#B4ADC4] shrink-0" />
      </div>
      <span className="sr-only">{r.legs[0].from}から詳細を見る</span>
    </button>
  );
};
