// 経路検索の候補カードで、路線の色の棒を、直通(乗ったまま続く区間)だけ、すき間なくつなぐための決まり。
// leg.through は「前の区間から、同じ列車に乗ったまま続く」ことなので、その区間の棒は、前の区間の棒とつなぐ
export interface LegBarJoin {
  prev: boolean; // 上の棒とつなぐ
  next: boolean; // 下の棒とつなぐ
}

export const legBarJoins = (legs: { through?: boolean }[]): LegBarJoin[] =>
  legs.map((leg, k) => ({
    prev: k > 0 && !!leg.through,
    next: k < legs.length - 1 && !!legs[k + 1].through,
  }));
