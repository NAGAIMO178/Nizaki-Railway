import React from 'react';

// 行き先の表示。運転整理で行き先が変わった列車だけ、もとの行き先に赤い取り消し線を引き、新しい行き先を赤い太字で出す。
// 変わっていない列車は、これまでと同じ「○○ 行き」(original が無い・同じなら、何も変わらない)。
// 赤は、見合わせ・運休と同じ赤(rose)。発車目前の紫の背景では、読めるよう明るい赤にする。
export const DestinationLabel: React.FC<{ destination: string; original?: string; onDark?: boolean }> = ({ destination, original, onDark = false }) => {
  if (!original || original === destination) return <>{destination} 行き</>;
  return (
    <span className="inline-flex max-w-full min-w-0 items-baseline gap-1 align-bottom">
      <span className={`min-w-0 truncate line-through decoration-2 ${onDark ? 'decoration-rose-300' : 'decoration-rose-600'}`}>{original}</span>
      <span className={`shrink-0 whitespace-nowrap font-black ${onDark ? 'text-rose-200' : 'text-rose-600'}`}>{destination} 行き</span>
    </span>
  );
};
