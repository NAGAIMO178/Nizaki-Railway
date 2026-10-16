import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ArrivalOption, ArrivalPlan } from '../utils/arrivalPlan';
import { formatDiaTime } from '../utils/diaTimetable';
import { isLaunched } from '../utils/launch';

const DAY = 86400;
// 余裕が、この分数より少ないときは、黄色の札にする
const TIGHT_MARGIN_MIN = 5;

interface ArrivalResultsProps {
  plan: ArrivalPlan;
  deadlineText: string; // "09:00"
  lineColor: (code: string) => string;
  onOpen: (option: ArrivalOption) => void;
}

const Tag: React.FC<{ tone: 'plain' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={`text-[11px] font-black px-2 py-0.5 rounded whitespace-nowrap ${
      tone === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-[#F4F3F8] text-[#6B6380]'
    }`}
  >
    {children}
  </span>
);

const Tags: React.FC<{ option: ArrivalOption; showPaid?: boolean }> = ({ option, showPaid }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <Tag tone={option.marginMin < TIGHT_MARGIN_MIN ? 'warn' : 'plain'}>余裕 {option.marginMin}分</Tag>
    <Tag tone="plain">乗換 {option.transfers}回</Tag>
    {showPaid && option.route.hasPaid && <Tag tone="warn">特急券が別に必要</Tag>}
  </div>
);

const Legs: React.FC<{ option: ArrivalOption; lineColor: (code: string) => string }> = ({ option, lineColor }) => (
  <div className="space-y-1">
    {option.route.legs.map((leg, k) => (
      <div key={`${leg.trainNo}-${k}`} className="flex items-center gap-1.5 text-[11px] text-[#221C35]">
        <span className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: lineColor(leg.lineCode) }} />
        {leg.through && <span className="shrink-0 text-[11px] font-bold text-[#5B21B6] bg-[#EFE8FA] px-1 py-px rounded">直通</span>}
        <span className="font-bold truncate">{leg.lineName}</span>
        <span className={`shrink-0 ${leg.paid ? 'text-amber-600 font-bold' : 'text-[#857D99]'}`}>{leg.typeAbbr}</span>
        <span className="text-[#857D99] truncate">
          {leg.from} {formatDiaTime(leg.depSec)} → {leg.to} {formatDiaTime(leg.arrSec)}
        </span>
      </div>
    ))}
  </div>
);

const TimeRange: React.FC<{ option: ArrivalOption; className: string }> = ({ option, className }) => (
  <span className={`font-mono font-black text-[#221C35] ${className}`}>
    {formatDiaTime(option.depSec)} <span className="text-[#B4ADC4]">→</span> {formatDiaTime(option.arrSec)}
    {option.arrSec >= DAY && <span className="ml-1 text-[11px] font-bold text-[#857D99]">翌</span>}
  </span>
);

export const ArrivalResults: React.FC<ArrivalResultsProps> = ({ plan, deadlineText, lineColor, onOpen }) => {
  if (!isLaunched()) return null;

  if (plan.options.length === 0) {
    return (
      <div className="bg-white border border-[#E6E2EE] rounded-2xl p-5 text-center text-sm font-bold text-[#6B6380]">
        {deadlineText} までに着く列車がありません
      </div>
    );
  }

  const pick = plan.options[plan.pickIndex];
  const others = plan.options.filter((_, i) => i !== plan.pickIndex);

  return (
    <div className="space-y-2.5 animate-fadeIn">
      <button
        type="button"
        onClick={() => onOpen(pick)}
        className="w-full text-left bg-white border-2 border-[#5B21B6] rounded-2xl p-4 shadow-xs cursor-pointer active:bg-[#F9F8FD] space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black text-white bg-[#5B21B6] rounded px-2.5 py-0.5">おすすめ</span>
          <span className="text-sm font-black text-[#221C35]">¥{pick.route.fare.toLocaleString()}</span>
        </div>
        <TimeRange option={pick} className="block text-[34px] leading-tight tracking-tight" />
        <Tags option={pick} showPaid />
        <div className="border-t border-[#EFEDF5] pt-2 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Legs option={pick} lineColor={lineColor} />
          </div>
          <ChevronRight className="w-4 h-4 text-[#B4ADC4] shrink-0" />
        </div>
      </button>

      {others.map((o) => (
        <button
          type="button"
          key={`${o.depSec}-${o.arrSec}`}
          onClick={() => onOpen(o)}
          className="w-full text-left bg-white border border-[#E6E2EE] rounded-2xl p-3 shadow-xs cursor-pointer hover:border-[#C4B5FD] active:bg-[#F9F8FD] space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <TimeRange option={o} className="text-base" />
            <span className="text-sm font-black text-[#221C35]">¥{o.route.fare.toLocaleString()}</span>
          </div>
          <Tags option={o} showPaid />
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Legs option={o} lineColor={lineColor} />
            </div>
            <ChevronRight className="w-4 h-4 text-[#B4ADC4] shrink-0" />
          </div>
        </button>
      ))}
    </div>
  );
};
