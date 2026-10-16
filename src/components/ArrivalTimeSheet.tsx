import React, { useEffect, useState } from 'react';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { ArrivalTime, ArrivalDay, arrivalFromDate, shiftArrival } from '../utils/arrivalInput';

interface ArrivalTimeSheetProps {
  isOpen: boolean;
  value: ArrivalTime;
  onApply: (next: ArrivalTime) => void;
  onClose: () => void;
}

const dateText = (d: Date): string => `${d.getMonth() + 1}/${d.getDate()}(${'日月火水木金土'[d.getDay()]})`;

const selectClass = 'w-full min-w-0 border border-[#E6E2EE] rounded-xl px-2 py-3 bg-white text-base font-bold text-[#221C35] text-center cursor-pointer';
const chipClass = 'flex-1 py-2.5 rounded-xl bg-[#F4F3F8] hover:bg-[#EFE8FA] text-[#5B21B6] text-sm font-bold cursor-pointer';

export const ArrivalTimeSheet: React.FC<ArrivalTimeSheetProps> = ({ isOpen, value, onApply, onClose }) => {
  const [draft, setDraft] = useState<ArrivalTime>(value);
  const drag = useDragToDismiss(onClose);

  useEffect(() => {
    if (isOpen) setDraft(value);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const prevBody = document.body.style.overflow;
    const prevHtml = html.style.overflow;
    document.body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn" role="dialog" aria-modal="true" aria-label="到着の日時">
      <button type="button" onClick={onClose} className="flex-1 cursor-default" aria-label="閉じる" />
      <div style={drag.style} className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl">
        <div {...drag.handleProps} className="shrink-0 px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing select-none">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-[#D1C9E3]" />
        </div>
        <div className="px-4 pb-6 space-y-3">
          <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-2">
            <select
              className={selectClass}
              value={draft.day}
              onChange={(e) => setDraft({ ...draft, day: e.target.value as ArrivalDay })}
              aria-label="日"
            >
              <option value="today">今日 {dateText(today)}</option>
              <option value="tomorrow">明日 {dateText(tomorrow)}</option>
            </select>
            <select className={selectClass} value={draft.hour} onChange={(e) => setDraft({ ...draft, hour: Number(e.target.value) })} aria-label="時">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h} 時
                </option>
              ))}
            </select>
            <select className={selectClass} value={draft.minute} onChange={(e) => setDraft({ ...draft, minute: Number(e.target.value) })} aria-label="分">
              {Array.from({ length: 60 }, (_, m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')} 分
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className={chipClass} onClick={() => setDraft(shiftArrival(draft, -5))}>
              5分前
            </button>
            <button type="button" className={chipClass} onClick={() => setDraft(arrivalFromDate(new Date()))}>
              現在時刻
            </button>
            <button type="button" className={chipClass} onClick={() => setDraft(shiftArrival(draft, 5))}>
              5分後
            </button>
          </div>

          <button
            type="button"
            onClick={() => onApply(draft)}
            className="w-full py-3 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-sm cursor-pointer"
          >
            設定する
          </button>
        </div>
      </div>
    </div>
  );
};
