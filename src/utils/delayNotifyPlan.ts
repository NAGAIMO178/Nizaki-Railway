// 遅れの知らせの、「どれを、どう知らせるか」の決まり(useDelayWatcher から使う。画面や保存は持たない)。
//  - 同じ列車でも、遅れの分数が変われば、新しい知らせ。
//  - 路線・種別・行き先・遅れ分数が同じ列車は、同じ内容の知らせとして、1本にまとめる(文面が同じ知らせを、重ねて出さない)。
//  - 同じ内容は、CONTENT_WINDOW_MS のあいだ、もう一度は知らせない。
//  - 路線ごとのクールダウン、起動直後のまとめ(2本以上なら1回)も、ここで決める。

export const LINE_COOLDOWN_MS = 15 * 60 * 1000; // 同じ路線で、続けて知らせない時間
export const CONTENT_WINDOW_MS = 60 * 60 * 1000; // 同じ内容を、もう一度は知らせない時間

export interface NotifyCandidate {
  key: string; // 日付・列車ID・遅れ分数
  contentKey: string; // 路線・種別・行き先・遅れ分数
  lineId: string;
  lineName: string;
  text: string;
}

export interface NotifiedState {
  keys: Set<string>;
  contents: Map<string, number>; // 内容 → 知らせた時刻(ms)
}

export type NotifyPlan =
  | { kind: 'none' }
  | { kind: 'summary'; trains: NotifyCandidate[]; lineNames: string[] }
  | { kind: 'single'; train: NotifyCandidate; group: NotifyCandidate[] };

// まだ知らせていない列車(同じ列車の重複は1本。同じ内容を、最近知らせていれば、除く)
export const freshCandidates = (all: NotifyCandidate[], state: NotifiedState, nowMs: number): NotifyCandidate[] => {
  const seen = new Set<string>();
  return all.filter((c) => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    if (state.keys.has(c.key)) return false;
    const at = state.contents.get(c.contentKey);
    return at === undefined || nowMs - at >= CONTENT_WINDOW_MS;
  });
};

export const planNotification = (args: {
  candidates: NotifyCandidate[];
  state: NotifiedState;
  lastByLine: Record<string, number>;
  nowMs: number;
  firstScan: boolean;
}): NotifyPlan => {
  const { state, lastByLine, nowMs, firstScan } = args;
  const fresh = freshCandidates(args.candidates, state, nowMs);

  // 起動直後: すでに遅れている列車が2本以上なら、まとめて1回だけ
  if (firstScan && fresh.length >= 2) {
    return { kind: 'summary', trains: fresh, lineNames: Array.from(new Set(fresh.map((c) => c.lineName))) };
  }

  // 1回の確認で、知らせるのは1本だけ(路線のクールダウン中は、あとで)。同じ内容の列車は、まとめて知らせたことにする
  const train = fresh.find((c) => nowMs - (lastByLine[c.lineId] ?? 0) >= LINE_COOLDOWN_MS);
  if (!train) return { kind: 'none' };
  return { kind: 'single', train, group: fresh.filter((c) => c.contentKey === train.contentKey) };
};

// 知らせたことを、記録に足す
export const markNotified = (state: NotifiedState, trains: NotifyCandidate[], nowMs: number): void => {
  trains.forEach((c) => {
    state.keys.add(c.key);
    state.contents.set(c.contentKey, nowMs);
  });
};
