import React from 'react';
import { LegendRow } from '../utils/timetableLegend';

// 時刻表の凡例。行(種別・行先・時刻など)を、順に出す
export const TimetableLegend: React.FC<{ rows: LegendRow[] }> = ({ rows }) => (
  <div className="bg-white border border-[#E6E2EE] rounded-2xl px-3 py-2.5 space-y-1.5 text-xs text-[#221C35]">
    {rows.map((row) => (
      <div key={row.key} className="flex items-baseline gap-2.5">
        <span className="shrink-0 w-[2.6em] text-[11px] font-bold text-[#857D99]">{row.title}</span>
        <span className="flex flex-wrap gap-x-3.5 gap-y-0.5">
          {row.items.map((it) => (
            <span key={`${it.mark}-${it.text}`} className="whitespace-nowrap">
              {it.mark && <b className={`mr-0.5 font-extrabold ${it.tone === 'paid' ? 'text-amber-600' : 'text-[#857D99]'}`}>{it.mark}</b>}
              {it.mark ? '=' : ''}
              {it.text}
            </span>
          ))}
        </span>
      </div>
    ))}
  </div>
);
