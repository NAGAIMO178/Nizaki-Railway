import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Route } from 'lucide-react';
import { Mileage, RANKS } from '../utils/mileage';

// マイレージと乗車記録(マイページ。公開後だけ出る)
export const MileageCard: React.FC<{ mileage: Mileage }> = ({ mileage: m }) => {
  const [open, setOpen] = useState(false);
  const shown = m.log.slice(0, 30);

  return (
    <div className="bg-white p-3.5 rounded-xl border border-[#E6E2EE] shadow-2xs space-y-3">
      <div className="flex items-center justify-between text-[#857B98] text-[10px] font-bold">
        <span>マイレージ</span>
        <Route className="w-3.5 h-3.5 text-[#5B21B6]" />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold text-[#221C35] font-mono">
            {m.totalKm.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            <span className="text-xs font-normal text-slate-500 ml-0.5">km</span>
          </div>
          <div className="text-[10px] text-[#857D99]">累計の営業キロ</div>
        </div>
        <div className="text-right text-[11px] text-[#6B6380]">
          <div>
            乗車 <span className="font-bold text-[#221C35]">{m.rides}</span> 回
          </div>
          <div>
            訪れた駅 <span className="font-bold text-[#221C35]">{m.stationCount}</span> / {m.totalStations}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-[#5B21B6]">{m.rank}</span>
          <span className="text-[#857D99]">
            {m.nextRank ? `あと ${m.kmToNext.toLocaleString(undefined, { maximumFractionDigits: 1 })}km で ${m.nextRank}` : '最上位のランクです'}
          </span>
        </div>
        <div className="h-2 rounded-full bg-[#EFEDF5] overflow-hidden" role="progressbar" aria-valuenow={Math.round(m.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#5B21B6] transition-all" style={{ width: `${Math.round(m.progress * 100)}%` }} />
        </div>
        <div className="text-[10px] text-[#B4ADC4]">
          {RANKS.map((r) => `${r.name} ${r.km.toLocaleString()}km〜`).join(' / ')}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-xs font-bold text-[#5B21B6] cursor-pointer"
      >
        <span>乗車記録（{m.rides}件）</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="border-t border-[#EFEDF5] pt-2">
          {shown.length === 0 ? (
            <div className="text-[11px] text-[#857D99] py-2">まだ、乗車の記録がありません。特急を予約して、乗車すると、ここに残ります。</div>
          ) : (
            <ul className="divide-y divide-[#F0EEF6]">
              {shown.map((r) => (
                <li key={r.orderId} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#221C35] truncate">
                      {r.from} → {r.to}
                    </div>
                    <div className="text-[10px] text-[#857D99] truncate">
                      {r.date.replace(/-/g, '/')}　{r.trainName}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-mono font-bold text-[#221C35]">{r.km.toFixed(1)}km</div>
                    <div className="text-[10px] font-mono text-[#857D99]">¥{r.fare.toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {m.rides > shown.length && <div className="text-[10px] text-[#B4ADC4] pt-1">新しい{shown.length}件を表示しています(距離の累計は、すべての乗車の分です)</div>}
        </div>
      )}
    </div>
  );
};
