// 経路検索で、結果が0件のときの文。0:00〜3:59 に出発する検索は、列車が走っていない時間なので、
// 「出発の時刻を早めるか…」(逆の案内)ではなく、「この時間は、列車がありません」と出す。
export const NO_TRAIN_AT_NIGHT = 'この時間は、列車がありません';

// "HH:MM" が、0:00〜3:59 か
export const isDeepNight = (timeText: string | undefined): boolean => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((timeText || '').trim());
  if (!m) return false;
  const h = Number(m[1]);
  return h >= 0 && h < 4;
};

export interface EmptyResultText {
  head: string;
  hint?: string; // 2行目(深夜のときは無し)
}

export const emptyResultText = (timeText: string | undefined, hasVias: boolean): EmptyResultText =>
  isDeepNight(timeText)
    ? { head: NO_TRAIN_AT_NIGHT }
    : { head: 'この条件で、乗れる列車が見つかりませんでした。', hint: `（${hasVias ? '経由駅を減らすか、' : ''}出発の時刻を早めるか、絞り込みを変えてお試しください）` };
