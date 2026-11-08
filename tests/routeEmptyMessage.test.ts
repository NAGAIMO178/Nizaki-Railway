// 経路検索の0件の文: 0:00〜3:59 は「この時間は、列車がありません」。それ以外は、これまでの文
import { describe, expect, it } from 'vitest';
import { emptyResultText, isDeepNight, NO_TRAIN_AT_NIGHT } from '../src/utils/routeEmptyMessage';

describe('深夜の時刻', () => {
  it('0:00〜3:59 だけが、深夜。4:00 からは、ちがう', () => {
    for (const t of ['00:00', '00:30', '01:15', '03:59', '3:59', '0:00']) expect(isDeepNight(t), t).toBe(true);
    for (const t of ['04:00', '04:01', '12:00', '23:59', '', undefined, '深夜', '25:00x']) expect(isDeepNight(t as string | undefined), String(t)).toBe(false);
  });
});

describe('0件のときの文', () => {
  it('深夜は、「この時間は、列車がありません」だけ(早めるよう案内しない)', () => {
    for (const hasVias of [false, true]) {
      const t = emptyResultText('02:30', hasVias);
      expect(t.head).toBe(NO_TRAIN_AT_NIGHT);
      expect(t.hint).toBeUndefined();
    }
  });

  it('深夜でないときは、これまでの文(経由駅があれば「経由駅を減らすか、」つき)', () => {
    const a = emptyResultText('10:00', false);
    expect(a.head).toBe('この条件で、乗れる列車が見つかりませんでした。');
    expect(a.hint).toBe('（出発の時刻を早めるか、絞り込みを変えてお試しください）');
    expect(emptyResultText('23:55', true).hint).toBe('（経由駅を減らすか、出発の時刻を早めるか、絞り込みを変えてお試しください）');
    expect(emptyResultText(undefined, false).head).toContain('見つかりませんでした');
  });
});
