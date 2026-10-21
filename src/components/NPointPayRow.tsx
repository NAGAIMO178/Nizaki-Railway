import React, { useEffect, useState } from 'react';

interface NPointPayRowProps {
  balance: number; // N-POINTの残高
  max: number; // 今回、使える上限(残高と、お支払い額の小さいほう)
  on: boolean; // 使うか
  amount: number; // 使うポイント(1pt=1円)
  onToggle: (on: boolean) => void;
  onAmountChange: (amount: number) => void;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

// 「N-POINTを使う」の切り替えと、使う額(1pt単位。「ぜんぶ」で上限まで)。予約と、デリバリーの注文で使う
export const NPointPayRow: React.FC<NPointPayRowProps> = ({ balance, max, on, amount, onToggle, onAmountChange }) => {
  const shown = clamp(amount, max);
  const [text, setText] = useState(String(shown));

  // 外から変わったとき(切り替えた・ぜんぶ・上限が変わった)は、欄の文字を合わせる
  useEffect(() => {
    setText(String(shown));
  }, [shown]);

  return (
    <div className="rounded-xl border border-[#DDD6FE] bg-[#F9F8FD] mb-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onToggle(!on)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 cursor-pointer text-left"
      >
        <span className="min-w-0 flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-bold text-[#221C35]">N-POINTを使う</span>
          <span className="text-[11px] text-[#6B6380]">残高 {balance.toLocaleString()}pt ・ 1pt=1円</span>
        </span>
        <span className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-[#5B21B6]' : 'bg-[#C4BCD8]'}`}>
          <span className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${on ? 'translate-x-4' : ''}`} />
        </span>
      </button>
      {on && (
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <span className="text-[11px] font-bold text-[#6B6380] shrink-0">使う額</span>
          <input
            type="text"
            inputMode="numeric"
            value={text}
            aria-label="使うN-POINT"
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 7);
              setText(digits);
              onAmountChange(clamp(parseInt(digits || '0', 10), max));
            }}
            onBlur={() => setText(String(shown))}
            className="w-24 min-w-0 bg-white border border-[#D1C9E3] rounded-lg px-2 py-1 text-right text-sm font-mono font-bold text-[#221C35] focus:outline-none focus:border-[#5B21B6]"
          />
          <span className="text-[11px] font-bold text-[#6B6380] shrink-0">pt</span>
          <button
            type="button"
            onClick={() => onAmountChange(max)}
            className="ml-auto shrink-0 text-[11px] font-bold text-[#5B21B6] bg-[#EFE8FA] hover:bg-[#E0D5F5] px-2.5 py-1 rounded-lg cursor-pointer"
          >
            ぜんぶ ({max.toLocaleString()}pt)
          </button>
        </div>
      )}
    </div>
  );
};
