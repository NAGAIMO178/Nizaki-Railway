import { Star } from 'lucide-react';

// イベントのカードの、いちばん下の1行(難易度 ・ 特典など)。カードごとに書き分けない
export function EventMetaRow({ difficulty, items }: { difficulty: number; items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#857D99] pt-1">
      <span className="flex items-center gap-1">
        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
        難易度: {'★'.repeat(difficulty)}
        {'☆'.repeat(5 - difficulty)}
      </span>
      {items.map((t) => (
        <span key={t} className="contents">
          <span>・</span>
          <span>{t}</span>
        </span>
      ))}
    </div>
  );
}
