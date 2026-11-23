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
