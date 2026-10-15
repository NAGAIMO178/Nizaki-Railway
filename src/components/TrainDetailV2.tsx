import React from 'react';
import { ChevronRight, User } from 'lucide-react';
import type { LiveTrainPos } from './TrainLocationTab';
import { CROWD_LEVELS, CROWD_MAX_LEVEL, crowdInfo } from '../utils/crowd';

// 列車の詳細(公開後の新しい画面。列車位置で列車を押すと出るシートの中身)。
// 上に答え(遅れ・混雑)、下に詳細(これから通る駅)の順。見出しの色は神埼の紫に統一し、路線は小さな丸で見分ける。
// 設計は docs/NIZAKI-2.0-crowd.md。

const TrainIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 28" aria-hidden="true">
    <rect x="2" y="2" width="20" height="22" rx="7" fill="#475569" />
    <rect x="5" y="5" width="14" height="8" rx="2" fill="#E2E8F0" />
    <circle cx="6.5" cy="18" r="1.5" fill="#FBBF24" />
    <circle cx="17.5" cy="18" r="1.5" fill="#FBBF24" />
    <rect x="5" y="24" width="3" height="3" rx="0.5" fill="#1E293B" />
    <rect x="16" y="24" width="3" height="3" rx="0.5" fill="#1E293B" />
  </svg>
);

const typeBadgeBg = (trainType: string): string => {
  if (trainType === '快速' || trainType === '区間快速') return 'bg-sky-600';
  if (trainType === '急行' || trainType === '通勤特快') return 'bg-rose-600';
  if (trainType === '特別快速') return 'bg-amber-600';
  if (trainType.includes('特急') || trainType.includes('めぐり') || trainType.includes('Nライナー') || trainType.includes('あやみ')) return 'bg-purple-700';
  return 'bg-slate-600';
};

const PeopleMeter: React.FC<{ level: number }> = ({ level }) => {
  const info = crowdInfo(level);
  return (
    <span className="inline-flex items-center gap-px shrink-0" aria-hidden="true">
      {CROWD_LEVELS.slice(0, CROWD_MAX_LEVEL).map((l) => (
        <User key={l.level} className="w-4 h-4" strokeWidth={2.2} color={info && l.level <= info.level ? info.icon : '#D6D2E2'} />
      ))}
    </span>
  );
};

interface TrainDetailV2Props {
  train: LiveTrainPos;
  lineName: string;
  onOpenReservation?: () => void;
  contentRef?: React.Ref<HTMLDivElement>;
}

export const TrainDetailV2: React.FC<TrainDetailV2Props> = ({ train, lineName, onOpenReservation, contentRef }) => {
  const delayed = train.delayMinutes > 0;
  const rows = train.rows ?? [];
  const info = train.crowdNow ? crowdInfo(train.crowdNow) : undefined;
  const typeText = train.paid ? '特急' : train.trainType;

  return (
    <div ref={contentRef} className="max-h-[62vh] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-3">
      {/* 見出しの帯: 有料の特急は列車名、ほかは路線名(路線の色は、小さな丸) */}
      <div className="rounded-t-xl bg-[#5B21B6] text-white px-3.5 py-2.5 text-sm font-bold flex items-center gap-2">
        {train.paid && train.expressBand ? (
          train.expressBand
        ) : (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-[#B79BF5] shrink-0" />
            {lineName}
          </>
        )}
      </div>

      {/* 列車 */}
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="flex items-start gap-2.5 min-w-0">
          <TrainIcon className="w-7 h-8 shrink-0" />
          <div className="min-w-0">
            <span className={`inline-block text-[11px] font-bold text-white rounded px-2 ${typeBadgeBg(train.trainType)}`}>{typeText}</span>
            {train.paid && train.expressName && <div className="text-[13px] text-[#221C35] leading-tight mt-0.5">{train.expressName}</div>}
            <div className="text-[17px] font-bold text-[#221C35] leading-tight mt-0.5">
              {train.destination} <span className="text-[13px] font-normal">行</span>
            </div>
            <div className="text-[11px] text-[#857D99]">列車番号: {train.trainNo}</div>
          </div>
        </div>
        <span className="shrink-0 text-xs font-bold bg-[#F0EEF6] text-[#221C35] rounded-md px-2 py-0.5">{train.carCount}両</span>
      </div>

      {/* 遅れ */}
      <div className="px-1">
        <span className={`inline-block text-[13px] font-bold text-white rounded-full px-3.5 py-0.5 ${delayed ? 'bg-[#D14B5F]' : 'bg-[#2E9E6B]'}`}>
          {delayed ? `${train.delayMinutes}分遅れ` : '定刻通り'}
        </span>
      </div>

      {/* 混雑情報 */}
      <div className="rounded-xl border border-[#E6E2EE] overflow-hidden bg-[#F7F6FB]">
        <div className="px-3 py-2 text-xs font-bold text-[#6B6380] bg-[#F0EEF6]">混雑情報</div>
        {train.paid ? (
          <div className="px-3 py-3 bg-white text-center space-y-2">
            <div className="text-sm font-bold text-[#221C35]">特急の混雑情報は提供しておりません</div>
            {onOpenReservation && (
              <button
                type="button"
                onClick={onOpenReservation}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#5B21B6] border border-[#5B21B6] rounded-full px-3.5 py-1 cursor-pointer hover:bg-[#F4F0FC]"
              >
                空席を予約画面で見る
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : info ? (
          <div className="px-3 py-2.5 bg-white flex items-center gap-2.5">
            <span className="shrink-0 text-[11px] font-bold px-2 py-px rounded-full bg-white border border-[#D6D2E2] text-[#6B6380] whitespace-nowrap">いまの混雑</span>
            <div className="leading-tight min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <PeopleMeter level={info.level} />
                <span className="text-[13px] font-bold text-[#221C35]">{info.label}</span>
              </div>
              <div className="text-[11px] text-[#857D99] mt-0.5">※模擬の混雑です</div>
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 bg-white text-center text-sm font-bold text-[#221C35]">混雑情報を提供しておりません</div>
        )}
      </div>

      {/* これから通る駅 */}
      <div className="rounded-xl border border-[#E6E2EE] overflow-hidden bg-[#F7F6FB]">
        <div className="px-3 py-2 text-xs font-bold text-[#6B6380] bg-[#F0EEF6]">停車駅情報</div>
        {rows.length === 0 ? (
          <div className="px-3 py-3 bg-white text-center text-xs text-[#857D99]">まもなく終点に到着します</div>
        ) : (
          rows.map((row, i) => (
            <div
              key={`${row.stationName}-${i}`}
              className={`grid grid-cols-[70px_22px_1fr] items-center bg-white border-t border-[#EFEDF5] ${row.pass ? 'min-h-[32px] text-[12px] text-[#9A93AE]' : 'min-h-[40px] text-[13px]'}`}
            >
              <div className="text-right pr-2 font-mono text-[12px] leading-tight">
                {row.pass ? (
                  '通過'
                ) : delayed ? (
                  <>
                    <span className="block line-through text-[#9A93AE]">{row.scheduledTime}</span>
                    <span className="font-bold text-[#D14B5F]">{row.estimatedTime}</span>
                  </>
                ) : (
                  <span className="font-bold text-[#2E9E6B]">{row.scheduledTime}</span>
                )}
              </div>
              <div className="relative self-stretch">
                <span className="absolute left-[9px] top-0 bottom-0 w-1 bg-[#5B21B6]" />
                {!row.pass && <span className="absolute left-[5px] top-1/2 -mt-1.5 w-3 h-3 rounded-full bg-white border-[3px] border-[#5B21B6]" />}
              </div>
              <div className={row.pass ? '' : 'font-bold text-[#221C35]'}>{row.stationName}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
