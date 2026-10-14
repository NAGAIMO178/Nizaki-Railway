import React, { useEffect } from 'react';
import { RouteOptions } from '../utils/routeOptions';
import { useDragToDismiss } from '../utils/useDragToDismiss';

interface RouteFilterSheetProps {
  isOpen: boolean;
  options: RouteOptions;
  onChange: (next: RouteOptions) => void;
  onClose: () => void;
}

const Switch: React.FC<{ on: boolean; onToggle: () => void; label: string }> = ({ on, onToggle, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    className={`relative shrink-0 w-12 h-7 rounded-full transition-colors cursor-pointer ${on ? 'bg-[#5B21B6]' : 'bg-[#D8D3E6]'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
  </button>
);

function Segment<T extends string | number>({
  value,
  items,
  onSelect,
  label,
}: {
  value: T;
  items: { value: T; label: string }[];
  onSelect: (v: T) => void;
  label: string;
}) {
  return (
    <div className="grid gap-1 p-1 rounded-xl bg-[#E6E2EE]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button
          key={String(it.value)}
          type="button"
          role="radio"
          aria-checked={value === it.value}
          onClick={() => onSelect(it.value)}
          className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            value === it.value ? 'bg-white text-[#5B21B6] shadow-xs' : 'text-[#6B6380] hover:text-[#221C35]'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export const RouteFilterSheet: React.FC<RouteFilterSheetProps> = ({ isOpen, options, onChange, onClose }) => {
  const drag = useDragToDismiss(onClose);

  // シートを開いているあいだは、うしろの画面をスクロールさせない
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end animate-fadeIn" role="dialog" aria-modal="true" aria-label="絞り込み">
      <button type="button" onClick={onClose} className="flex-1 bg-slate-900/40 cursor-default" aria-label="絞り込みを閉じる" />
      <div style={drag.style} className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* つまみと見出し: ここを下に引くと、閉じる */}
        <div {...drag.handleProps} className="shrink-0 px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing select-none">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#D1C9E3]" />
          <h3 className="text-sm font-black text-[#221C35]">絞り込み</h3>
        </div>

        <div ref={drag.contentRef} className="overflow-y-auto overscroll-contain px-4 pb-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#221C35]">有料の特急を使う</div>
                <div className="text-[11px] text-[#857D99] mt-0.5 leading-relaxed">オフにすると、特急券が必要な列車を使わずに探します。</div>
              </div>
              <Switch on={options.allowPaid} onToggle={() => onChange({ ...options, allowPaid: !options.allowPaid })} label="有料の特急を使う" />
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-bold text-[#221C35]">乗換の余裕</div>
              <Segment
                label="乗換の余裕"
                value={options.relaxedTransfer ? 'relaxed' : 'standard'}
                items={[
                  { value: 'standard', label: '標準(4分)' },
                  { value: 'relaxed', label: 'ゆったり(8分)' },
                ]}
                onSelect={(v) => onChange({ ...options, relaxedTransfer: v === 'relaxed' })}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-bold text-[#221C35]">乗換の回数</div>
              <Segment
                label="乗換の回数"
                value={options.maxTransfers}
                items={[
                  { value: 99 as const, label: '制限なし' },
                  { value: 2 as const, label: '2回まで' },
                  { value: 0 as const, label: '乗換なし' },
                ]}
                onSelect={(v) => onChange({ ...options, maxTransfers: v })}
              />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#221C35]">リアルタイム検索</div>
                <div className="text-[11px] text-[#857D99] mt-0.5 leading-relaxed">
                  列車の遅れを加味して探します。遅れた列車は、遅れた時刻で計算し、運転見合わせの列車は使いません。
                </div>
              </div>
              <Switch on={options.realtime} onToggle={() => onChange({ ...options, realtime: !options.realtime })} label="リアルタイム検索" />
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full py-3 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-sm cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
