// 予約画面で、いま選ばれている列車と、予約できるかの判定。欄に見える列車と、判定に使う列車は、必ず同じにする。
// 発車の5分前を過ぎた列車は、予約できない。

export interface TripLike {
  code: string;
  depTime: string; // HH:mm
}

// 発車5分前(発車時刻 - 5分)を過ぎたか。nowMin は、0時からの分
export const trainEnded = (depTime: string, nowMin: number): boolean => {
  const [h, m] = depTime.split(':').map(Number);
  return nowMin >= h * 60 + m - 5;
};

// いま選ばれている列車。選ばれた列車が、予約できるならそれ。できない(過ぎた・一覧に無い・まだ選ばれていない)ときは、予約できる最初の列車。
// 予約できる列車が1本も無いときだけ、選ばれた列車(無ければ先頭)を返す(「予約できません」の案内の元になる)
export const pickCurrentTrip = <T extends TripLike>(trips: T[], selectedCode: string, nowMin: number): T | undefined => {
  const selected = trips.find((t) => t.code === selectedCode);
  if (selected && !trainEnded(selected.depTime, nowMin)) return selected;
  return trips.find((t) => !trainEnded(t.depTime, nowMin)) ?? selected ?? trips[0];
};
