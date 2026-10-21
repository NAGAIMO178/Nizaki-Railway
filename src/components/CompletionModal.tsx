import React from 'react';
import { Check } from 'lucide-react';

export interface CompletionRow {
  label: string;
  value: React.ReactNode;
}

interface CompletionModalProps {
  title: string;
  orderId: string;
  rows: CompletionRow[];
  buttonLabel: string;
  onClose: () => void;
  secondary?: { label: string; onClick: () => void }; // 主ボタンの上に出す、副ボタン
}

// 予約完了・デリバリー完了で使う、同じ作りの画面
export const CompletionModal: React.FC<CompletionModalProps> = ({ title, orderId, rows, buttonLabel, onClose, secondary }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn" role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-white rounded-3xl border border-[#E5E2EE] shadow-2xl p-6 text-center animate-scaleUp">
      <div className="w-14 h-14 rounded-full bg-[#EDE9FE] text-[#5B21B6] flex items-center justify-center mx-auto">
        <Check className="w-7 h-7" strokeWidth={3} />
      </div>
      <h3 className="text-xl font-black text-[#221C35] mt-3 mb-2.5">{title}</h3>
      <div className="inline-flex items-baseline gap-2 bg-[#F4F3F8] border border-[#E6E2EE] rounded-xl px-3 py-1.5">
        <span className="text-[11px] font-bold text-[#857D99]">予約コード</span>
        <span className="font-mono text-[15px] font-bold tracking-wide text-[#5B21B6]">{orderId}</span>
      </div>

      <div className="mt-4 bg-[#F9F8FD] border border-[#E6E2EE] rounded-2xl px-3.5 py-1 text-left">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3 py-2.5 border-b border-[#EFEDF5] last:border-b-0 text-[13px]">
            <span className="text-[#857D99] shrink-0">{r.label}</span>
            <span className="font-bold text-[#221C35] text-right min-w-0 break-words">{r.value}</span>
          </div>
        ))}
      </div>

      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="w-full mt-4 bg-[#EDE9FE] hover:bg-[#E0D5F5] text-[#5B21B6] font-bold text-sm py-3 rounded-xl cursor-pointer transition-colors"
        >
          {secondary.label}
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        className={`w-full ${secondary ? 'mt-2' : 'mt-4'} bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-sm py-3 rounded-xl cursor-pointer transition-colors`}
      >
        {buttonLabel}
      </button>
    </div>
  </div>
);
