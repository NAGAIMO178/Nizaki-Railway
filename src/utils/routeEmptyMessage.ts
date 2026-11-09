// 経路検索で、結果が0件のときの文。列車がない時間(終電のあと〜始発の前。quietTime.ts)の検索は、
// 「出発の時刻を早めるか…」(逆の案内)ではなく、「この時間は、列車がありません」と出す。
import { isQuietTime, type QuietWindow } from './quietTime';

export const NO_TRAIN_AT_NIGHT = 'この時間は、列車がありません';

export interface EmptyResultText {
  head: string;
  hint?: string; // 2行目(列車がない時間のときは無し)
}

// window: ダイヤから決めた「列車がない時間」(調べられていなければ、安全策の目安)
export const emptyResultText = (timeText: string | undefined, hasVias: boolean, window?: QuietWindow | null): EmptyResultText =>
  isQuietTime(timeText, window)
    ? { head: NO_TRAIN_AT_NIGHT }
    : { head: 'この条件で、乗れる列車が見つかりませんでした。', hint: `（${hasVias ? '経由駅を減らすか、' : ''}出発の時刻を早めるか、絞り込みを変えてお試しください）` };
