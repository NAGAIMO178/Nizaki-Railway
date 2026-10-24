import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';

const Stars = ({ difficulty }: { difficulty: number }) => (
  <span className="flex items-center gap-1">
    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
    難易度: {'★'.repeat(difficulty)}
    {'☆'.repeat(5 - difficulty)}
  </span>
);

const ROW = 'flex flex-wrap items-center gap-3 text-[11px] text-[#857D99] pt-1';

// イベントのカードの、いちばん下の1行(難易度 ・ 特典など)。カードごとに書き分けない。
// dotsOnlyWhenFit: 1行に収まるときだけ「・」を出す(狭くて折り返すときは、行末や行頭に「・」を残さない)
export function EventMetaRow({ difficulty, items, dotsOnlyWhenFit = false }: { difficulty: number; items: string[]; dotsOnlyWhenFit?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const oneLineRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    if (!dotsOnlyWhenFit) return;
    const box = boxRef.current;
    const one = oneLineRef.current;
    if (!box || !one) return;
    const measure = () => setFits(one.offsetWidth <= box.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [dotsOnlyWhenFit, difficulty, items]);

  const withDots = !dotsOnlyWhenFit || fits;
  return (
    <div ref={boxRef} className={dotsOnlyWhenFit ? `${ROW} relative` : ROW}>
      <Stars difficulty={difficulty} />
      {items.map((t) => (
        <Fragment key={t}>
          {withDots && <span>・</span>}
          <span>{t}</span>
        </Fragment>
      ))}
      {dotsOnlyWhenFit && (
        // 1行に並べたときの幅を測るための、見えない写し(幅の判定に、「・」の有る無しが影響しない)
        <div ref={oneLineRef} aria-hidden className="invisible absolute left-0 top-0 flex items-center gap-3 whitespace-nowrap pointer-events-none">
          <Stars difficulty={difficulty} />
          {items.map((t) => (
            <Fragment key={t}>
              <span>・</span>
              <span>{t}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
