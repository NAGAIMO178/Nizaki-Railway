// 列車位置の詳細(パソコン幅)の「×」が、下の中身(見出し・スクロールする枠)に重ならない。
// 重なりの原因だった、閉じる行の「下の余白をマイナスにするクラス(-mb-)」が、列車の詳細の2か所(グループ表示・1本だけ)に無いこと。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('src/components/TrainLocationTab.tsx', 'utf8');

describe('列車の詳細の閉じる行(PC の幅だけ)', () => {
  // 閉じる行: <div className="hidden pc:flex justify-end..."> のあと、onClick={clearTrainSelection} の×
  const rows = [...src.matchAll(/<div className="(hidden pc:flex justify-end[^"]*)">\s*<button\s+type="button"\s+onClick=\{clearTrainSelection\}/g)];
  it('グループ表示と1本だけ、の2か所', () => {
    expect(rows).toHaveLength(2);
  });
  it('どちらも、下の余白をマイナスにしていない', () => {
    for (const r of rows) expect(r[1]).toBe('hidden pc:flex justify-end');
  });
});

describe('駅の詳細・到着時刻のシートの閉じる行(PC の幅だけ)も、重ならない', () => {
  it('駅の詳細の閉じる行は、下の余白をマイナスにしていない', () => {
    const m = src.match(/<div className="(hidden pc:flex justify-end[^"]*)">\s*<button\s+type="button"\s+onClick=\{\(\) => setSelectedStation\(null\)\}/);
    expect(m?.[1]).toBe('hidden pc:flex justify-end');
  });
  it('到着時刻のシートの閉じる行も、同じ', () => {
    const arrival = readFileSync('src/components/ArrivalTimeSheet.tsx', 'utf8');
    expect(arrival).toContain('<div className="hidden pc:flex justify-end">');
    expect(arrival).not.toMatch(/pc:flex justify-end -mb-/);
  });
});
