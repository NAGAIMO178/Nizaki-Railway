// 経路検索の0件の文: 列車がない時間(終電のあと〜始発の前)は「この時間は、列車がありません」。それ以外は、これまでの文
import { describe, expect, it } from 'vitest';
import { emptyResultText, NO_TRAIN_AT_NIGHT } from '../src/utils/routeEmptyMessage';

// 実際のダイヤの値(最終の到着 0:23:20 → 0:24 から / 始発の発車 4:51 の手前まで)
const REAL = { fromMin: 24, toMin: 291 };

describe('0件のときの文', () => {
  it('列車がない時間は、「この時間は、列車がありません」だけ(早めるよう案内しない)', () => {
    for (const hasVias of [false, true]) {
      const t = emptyResultText('02:30', hasVias, REAL);
      expect(t.head).toBe(NO_TRAIN_AT_NIGHT);
      expect(t.hint).toBeUndefined();
    }
  });

  it('終電ぎわ(0:00〜0:23)や、始発(4:51)以降は、これまでの文(経由駅があれば「経由駅を減らすか、」つき)', () => {
    const a = emptyResultText('10:00', false, REAL);
    expect(a.head).toBe('この条件で、乗れる列車が見つかりませんでした。');
    expect(a.hint).toBe('（出発の時刻を早めるか、絞り込みを変えてお試しください）');
    expect(emptyResultText('23:55', true, REAL).hint).toBe('（経由駅を減らすか、出発の時刻を早めるか、絞り込みを変えてお試しください）');
    expect(emptyResultText('00:10', false, REAL).head).toContain('見つかりませんでした');
    expect(emptyResultText('04:51', false, REAL).head).toContain('見つかりませんでした');
    expect(emptyResultText(undefined, false, REAL).head).toContain('見つかりませんでした');
  });

  it('ダイヤの値が無いとき(まだ・調べられなかった)は、安全策: 0:00〜0:29 は探す・0:30〜3:59 は、列車がない', () => {
    expect(emptyResultText('00:29', false).head).toContain('見つかりませんでした');
    expect(emptyResultText('00:30', false, null).head).toBe(NO_TRAIN_AT_NIGHT);
    expect(emptyResultText('03:59', false, undefined).head).toBe(NO_TRAIN_AT_NIGHT);
    expect(emptyResultText('04:00', false).head).toContain('見つかりませんでした');
  });
});
