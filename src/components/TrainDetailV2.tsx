import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Clock, User, Users } from 'lucide-react';
import type { LiveTrainPos } from './TrainLocationTab';
import { CROWD_LEVELS, CROWD_MAX_LEVEL, crowdInfo } from '../utils/crowd';
import { isLaunched } from '../utils/launch';
import { THROUGH_STYLE } from '../utils/throughLine';
import { typeStyleOf } from '../utils/trainTypeStyle';
import { normalizeStationName } from '../utils/diaTimetable';

// 列車の詳細(公開後の新しい画面。列車位置で列車を押すと出るシートの中身)。
// 上に答え(遅れ・混雑)、下に詳細(これから通る駅)の順。見出しの色は神埼の紫に統一し、路線は小さな丸で見分ける。

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
  onOpenLine?: (lineId: string) => void; // 直通先の札を押したとき、その路線の列車位置へ
  onOpenReservation?: () => void;
  contentRef?: React.Ref<HTMLDivElement>;
  // 束ねた札から、複数の列車のカードを縦に並べるとき(外側のシートがスクロールするので、このカードは、自分ではスクロールしない)
  embedded?: boolean;
  // 「停車駅情報」を、押して開け閉めできるようにする(束ねた札のカードで使う)と、はじめに開いているか
  collapsibleStops?: boolean;
  stopsDefaultOpen?: boolean;
}

export const TrainDetailV2: React.FC<TrainDetailV2Props> = ({ train, lineName, onOpenLine, onOpenReservation, contentRef, embedded, collapsibleStops, stopsDefaultOpen = true }) => {
  const [stopsOpen, setStopsOpen] = useState(stopsDefaultOpen);
  const delayed = train.delayMinutes > 0;
  const rows = train.rows ?? [];
  const through = train.through;
  const info = train.crowdNow ? crowdInfo(train.crowdNow) : undefined;
  const typeText = train.paid ? '特急' : train.trainType;
  // 番線の列(公開後のダイヤだけ。どの駅にも番線が無いときは、列ごと出さない)
  const showPlatform = isLaunched() && rows.some((r) => !r.pass && r.platform);

  // 札・枠・見出しは、アプリのほかの画面(発車案内・列車位置)と同じ作り(角の小さい札・太い字・はっきりした縁・うす紫の見出し)
  const cardHead = 'px-3 py-2.5 bg-[#EFE8FA]/60 border-b border-[#E6E2EE] flex items-center gap-2 text-xs font-bold text-[#5B21B6]';
  const card = 'bg-[#F9F8FD] rounded-xl border border-[#E6E2EE] overflow-hidden';

  return (
    <div ref={contentRef} className={embedded ? 'space-y-3' : 'max-h-[62vh] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-3'}>
      {/* 見出しの帯: 有料の特急は列車名、ほかは路線名(路線の色は、小さな丸) */}
      <div className="rounded-xl bg-[#5B21B6] text-white px-3.5 py-2 text-sm font-black flex items-center gap-2 shadow-xs">
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
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md text-white ${typeStyleOf(train.trainType).solid}`}>{typeText}</span>
              {delayed ? (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-white border border-amber-600 whitespace-nowrap shadow-2xs">
                  [+{train.delayMinutes}分遅れ]
                </span>
              ) : (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-600 text-white border border-emerald-700 whitespace-nowrap shadow-2xs">
                  [定刻通り]
                </span>
              )}
            </div>
            {train.paid && train.expressName && <div className="text-xs font-bold text-[#221C35]">{train.expressName}</div>}
            <div className="text-base font-bold text-[#221C35]">{train.destination} 行き</div>
            {train.runNo && <div className="text-[10px] font-bold text-[#857D99]">運行番号 {train.runNo}</div>}
          </div>
        </div>
        <span className="shrink-0 text-xs font-bold bg-[#F4F3F8] text-[#221C35] px-2.5 py-1 rounded-xl border border-[#E6E2EE]">{train.carCount}両</span>
      </div>

      {/* 混雑情報 */}
      <div className={card}>
        <div className={cardHead}>
          <Users className="w-4 h-4" />
          <span>混雑情報</span>
        </div>
        {train.paid ? (
          <div className="p-3 text-center space-y-2">
            <div className="text-xs font-bold text-[#221C35]">特急の混雑情報は提供しておりません</div>
            {onOpenReservation && (
              <button
                type="button"
                onClick={onOpenReservation}
                className="inline-flex items-center gap-1 text-xs font-bold text-white bg-[#5B21B6] hover:bg-[#4C1D95] rounded-md px-3 py-1.5 cursor-pointer shadow-2xs"
              >
                空席を予約画面で見る
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : info ? (
          <div className="p-3 flex items-center gap-2.5">
            <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded bg-white text-[#5B21B6] border border-[#C4B5FD] whitespace-nowrap shadow-2xs">いまの混雑</span>
            <div className="leading-tight min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <PeopleMeter level={info.level} />
                <span className="text-xs font-bold text-[#221C35]">{info.label}</span>
              </div>
              <div className="text-[10px] font-bold text-[#857D99] mt-0.5">※模擬の混雑です</div>
            </div>
          </div>
        ) : (
          <div className="p-3 text-center text-xs font-bold text-[#221C35]">混雑情報を提供しておりません</div>
        )}
      </div>

      {/* これから通る駅 */}
      <div className={card}>
        {collapsibleStops ? (
          <button type="button" onClick={() => setStopsOpen((v) => !v)} aria-expanded={stopsOpen} className={`${cardHead} w-full text-left cursor-pointer ${stopsOpen ? '' : 'border-b-0'}`}>
            <Clock className="w-4 h-4" />
            <span>停車駅情報</span>
            <span className="ml-auto flex items-center gap-1">
              {showPlatform && stopsOpen && <span>番線</span>}
              {stopsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>
        ) : (
          <div className={cardHead}>
            <Clock className="w-4 h-4" />
            <span>停車駅情報</span>
            {showPlatform && <span className="ml-auto">番線</span>}
          </div>
        )}
        {!collapsibleStops || stopsOpen ? (rows.length === 0 ? (
          <div className="p-3 text-center text-xs font-bold text-[#857D99]">まもなく終点に到着します</div>
        ) : (
          rows.map((row, i) => (
            <div
              key={`${row.stationName}-${i}`}
              className={`grid ${showPlatform ? 'grid-cols-[70px_22px_1fr_3rem]' : 'grid-cols-[70px_22px_1fr]'} items-center border-b border-[#E6E2EE]/50 last:border-b-0 text-xs font-bold ${row.pass ? 'min-h-[30px] text-[#A59FB5]' : 'min-h-[40px]'}`}
            >
              <div className="text-right pr-2 font-mono leading-tight">
                {row.pass ? (
                  '通過'
                ) : delayed ? (
                  <>
                    <span className="block line-through text-[#A59FB5]">{row.scheduledTime}</span>
                    <span className="text-rose-600">{row.estimatedTime}</span>
                  </>
                ) : (
                  <span className="text-emerald-600">{row.scheduledTime}</span>
                )}
              </div>
              <div className="relative self-stretch">
                <span className="absolute left-[9px] top-0 bottom-0 w-1 bg-[#5B21B6]" />
                {!row.pass && <span className="absolute left-[5px] top-1/2 -mt-1.5 w-3 h-3 rounded-full bg-white border-[3px] border-[#5B21B6]" />}
              </div>
              <div className={row.pass ? '' : 'text-[#221C35]'}>
                {row.stationName}
                {/* 直通の列車: つなぎ目の駅の行に、直通先の路線の札(押すと、その路線の列車位置へ) */}
                {through && !row.pass && normalizeStationName(row.stationName) === through.stationName && (
                  <button
                    type="button"
                    onClick={() => onOpenLine?.(through.lineId)}
                    className="ml-2 inline-flex items-center gap-0.5 rounded-full border-[1.5px] bg-white pl-2 pr-1 py-px text-[10px] font-extrabold leading-tight whitespace-nowrap align-middle cursor-pointer active:scale-95"
                    style={{ borderColor: THROUGH_STYLE[through.lineId]?.color ?? '#8B5CF6', color: THROUGH_STYLE[through.lineId]?.text ?? '#6D28D9' }}
                    title={`${through.lineName}の列車位置を見る`}
                  >
                    {through.lineName}
                    <ChevronRight className="w-3 h-3" strokeWidth={3} />
                  </button>
                )}
              </div>
              {showPlatform && (
                <div className="text-center">
                  {!row.pass && row.platform && (
                    <span className="inline-block min-w-[22px] px-1.5 py-px rounded bg-[#EDE9FE] text-[#5B21B6] text-xs font-extrabold">{row.platform}</span>
                  )}
                </div>
              )}
            </div>
          ))
        )) : null}
      </div>
    </div>
  );
};
