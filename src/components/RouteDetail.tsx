import React, { useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { REGISTERABLE_LINES } from './MyStationRegisterCard';
import { formatDiaTime } from '../utils/diaTimetable';
import { fareTierLabel } from '../utils/fare';
import { RouteResult, RouteLeg } from '../utils/routeSearch';
import { crowdInfo } from '../utils/crowd';

const DAY = 86400;

const lineColor = (code: string): string => REGISTERABLE_LINES.find((l) => l.code === code)?.color ?? '#8B5CF6';

const Time: React.FC<{ sec: number; sched: number; className?: string }> = ({ sec, sched, className = '' }) => {
  const delayed = sec !== sched;
  return (
    <div className={`font-mono leading-tight ${className}`}>
      {delayed && <div className="text-[10px] text-[#B4ADC4] line-through">{formatDiaTime(sched)}</div>}
      <div className={`text-sm font-black ${delayed ? 'text-rose-600' : 'text-[#221C35]'}`}>{formatDiaTime(sec)}</div>
    </div>
  );
};

const LegBlock: React.FC<{ leg: RouteLeg }> = ({ leg }) => {
  const [open, setOpen] = useState(false);
  const color = lineColor(leg.lineCode);
  const n = leg.stops.length;

  return (
    <div className="grid grid-cols-[3.25rem_1rem_1fr] gap-x-2">
      {/* 乗る駅 */}
      <Time sec={leg.depSec} sched={leg.schedDepSec} className="text-right pt-0.5" />
      <div className="relative flex justify-center">
        <span className="mt-1.5 w-3 h-3 rounded-full border-[3px] bg-white z-10" style={{ borderColor: color }} />
        <span className="absolute top-3 bottom-[-0.5rem] w-1.5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="text-sm font-black text-[#221C35] pb-2">{leg.from}</div>

      {/* 列車の情報 */}
      <div />
      <div className="relative flex justify-center">
        <span className="absolute top-[-0.5rem] bottom-[-0.5rem] w-1.5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="pb-2">
        <div className="rounded-xl border border-[#E6E2EE] bg-[#F9F8FD] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-black text-[#221C35]">{leg.lineName}</span>
            <span className={`text-[11px] font-bold ${leg.paid ? 'text-amber-600' : 'text-[#6B6380]'}`}>{leg.typeName}</span>
          </div>
          <div className="text-[11px] text-[#6B6380] mt-0.5">{leg.destLabel}</div>
          {leg.delayMin > 0 && (
            <div className="mt-1.5 inline-block text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
              {leg.delayMin}分遅れ
            </div>
          )}
          {leg.crowd && crowdInfo(leg.crowd) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[#6B6380]">
              <span className="font-bold">混雑の目安</span>
              <span
                className="font-black px-1.5 py-0.5 rounded border border-black/10 whitespace-nowrap"
                style={{ background: crowdInfo(leg.crowd)!.color, color: crowdInfo(leg.crowd)!.text }}
              >
                {crowdInfo(leg.crowd)!.label}
              </span>
              <span>(いちばん混む区間・乗車率 {crowdInfo(leg.crowd)!.range})</span>
            </div>
          )}
          {leg.paid && <div className="mt-1.5 text-[10px] font-bold text-amber-700">有料の列車です(特急券が別に必要)</div>}
          {leg.passedVias.map((v) => (
            <div key={v.name} className="mt-1.5 text-[10px] font-bold text-[#5B21B6]">
              経由駅の{v.name}に{v.stopped ? '停車します' : '停まらずに通過します'}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 w-full flex items-center justify-between text-[11px] font-bold text-[#5B21B6] cursor-pointer"
            aria-expanded={open}
          >
            <span>{n}駅目で降りる</span>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {open && (
            <ul className="mt-1.5 border-t border-[#E6E2EE] pt-1.5 space-y-1">
              {leg.stops.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-center justify-between text-[11px] text-[#221C35]">
                  <span className={i === n - 1 ? 'font-bold' : ''}>{s.name}</span>
                  <span className={`font-mono ${s.arrSec !== s.schedArrSec ? 'text-rose-600 font-bold' : 'text-[#6B6380]'}`}>
                    {formatDiaTime(s.arrSec)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 降りる駅 */}
      <Time sec={leg.arrSec} sched={leg.schedArrSec} className="text-right pt-0.5" />
      <div className="relative flex justify-center">
        <span className="absolute top-0 h-2 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="mt-1.5 w-3 h-3 rounded-full border-[3px] bg-white z-10" style={{ borderColor: color }} />
      </div>
      <div className="text-sm font-black text-[#221C35]">{leg.to}</div>
    </div>
  );
};

interface RouteDetailProps {
  result: RouteResult;
  from: string;
  to: string;
  vias: string[];
  dayLabel: string;
  searchedAt: string;
  realtime: boolean;
  onBack: () => void;
}

export const RouteDetail: React.FC<RouteDetailProps> = ({ result: r, from, to, vias, dayLabel, searchedAt, realtime, onBack }) => {
  const [feeOpen, setFeeOpen] = useState(false);

  return (
    <div className="space-y-3 animate-fadeIn">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-[#5B21B6] cursor-pointer">
        <ChevronLeft className="w-4 h-4" />
        <span>検索結果へ</span>
      </button>

      <div className="bg-white border border-[#E6E2EE] rounded-2xl p-3.5 shadow-xs">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-2xl font-black text-[#221C35] font-mono leading-tight">
              {formatDiaTime(r.depSec)} <span className="text-[#B4ADC4]">→</span> {formatDiaTime(r.arrSec)}
              {r.arrSec >= DAY && <span className="ml-1 text-[10px] font-bold text-[#857D99]">翌</span>}
            </div>
            <div className="text-[11px] text-[#857D99] mt-0.5">{dayLabel}</div>
          </div>
          <div className="text-right shrink-0 text-[10px] text-[#857D99]">
            {realtime && <div className="font-bold text-emerald-700">リアルタイム検索</div>}
            <div>検索 {searchedAt}</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-[#6B6380]">
          {from} → {to}
          {vias.length > 0 && <span className="ml-1.5 font-bold text-[#5B21B6]">経由: {vias.join('・')}</span>}
        </div>
      </div>

      <div className="bg-white border border-[#E6E2EE] rounded-2xl p-3.5 shadow-xs space-y-3">
        {r.legs.map((leg, k) => (
          <React.Fragment key={`${leg.trainNo}-${k}`}>
            {k > 0 && (
              <div className="grid grid-cols-[3.25rem_1rem_1fr] gap-x-2 items-center">
                <div />
                <div className="flex justify-center">
                  <span className="h-6 border-l-2 border-dotted border-[#C4BCD8]" />
                </div>
                <div className="text-[11px] text-[#857D99]">
                  {leg.from}で乗換（待ち{Math.round((leg.depSec - r.legs[k - 1].arrSec) / 60)}分）
                </div>
              </div>
            )}
            <LegBlock leg={leg} />
          </React.Fragment>
        ))}
      </div>

      <div className="bg-white border border-[#E6E2EE] rounded-2xl p-3.5 shadow-xs">
        <div className="flex items-baseline justify-center gap-4 text-[#221C35]">
          <span>
            <span className="text-lg font-black">{r.minutes}</span>
            <span className="text-xs ml-0.5">分</span>
          </span>
          <span>
            <span className="text-xs">乗換 </span>
            <span className="text-lg font-black">{r.transfers}</span>
            <span className="text-xs ml-0.5">回</span>
          </span>
          <span>
            <span className="text-lg font-black">¥{r.fare.toLocaleString()}</span>
          </span>
        </div>
        <div className="text-center text-xs text-[#6B6380] mt-1">営業キロ {r.km.toFixed(1)} km</div>

        <button
          type="button"
          onClick={() => setFeeOpen((v) => !v)}
          aria-expanded={feeOpen}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs font-bold text-[#5B21B6] cursor-pointer"
        >
          <span>運賃の内訳を見る</span>
          {feeOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {feeOpen && (
          <div className="mt-2 border-t border-[#EFEDF5] pt-2 space-y-1 text-[11px] text-[#221C35]">
            {r.legs.map((leg, k) => (
              <div key={`${leg.trainNo}-${k}`} className="flex justify-between gap-2">
                <span className="truncate">
                  {leg.from} → {leg.to}（{leg.lineName}）
                </span>
                <span className="font-mono shrink-0">{leg.km.toFixed(1)}km</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[#EFEDF5] pt-1 font-bold">
              <span>営業キロの合計（{fareTierLabel(r.km)}）</span>
              <span className="font-mono">{r.km.toFixed(1)}km</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>普通運賃</span>
              <span className="font-mono">¥{r.fare.toLocaleString()}</span>
            </div>
            {r.hasPaid && <div className="text-amber-700 font-bold">有料の列車の特急券は、運賃とは別に必要です（予約画面でお求めください）。</div>}
          </div>
        )}
      </div>

      <div className="text-[10px] text-[#857D99] leading-relaxed px-1">
        ご利用にあたって: 神埼鉄道は架空の鉄道です。時刻・遅れ・運賃は、アプリの中だけの模擬の情報です。乗換は、同じ駅名で乗り継げる列車を探しています。
      </div>
    </div>
  );
};
