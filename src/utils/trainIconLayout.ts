// 列車位置の路線図で、同じ駅・駅間にいる列車(左側の列車の絵と「通過」などの札)を、横に並べる位置。
// 線路は X=-24px、駅の丸は -31px にあるので、列車は -36px より左に置く。画面の左端で札が切れないよう、左端は -112px を超えない。
export const TRAIN_ICON_RIGHTMOST = -56;
export const TRAIN_ICON_LEFT_LIMIT = -112;
export const COMPACT_SCALE = 0.8; // 3編成以上のときの、札と列車の絵の大きさ

// 3編成以上のときの間隔(最大22px。本数が増えるほどせばめる)
export const trainIconStep = (total: number): number => Math.min(22, Math.floor((TRAIN_ICON_RIGHTMOST - TRAIN_ICON_LEFT_LIMIT) / (total - 1)));

// total 本のうち index 番目(0が最優等)の、中心の X(px)。1本・2本は、これまでどおり
export const trainIconCenter = (total: number, index: number): number => {
  if (total <= 1) return -62;
  if (total === 2) return index === 0 ? -86 : -56;
  return TRAIN_ICON_RIGHTMOST - (total - 1 - index) * trainIconStep(total);
};

// 3編成以上のときは、札と列車の絵を小さくする
export const isCompactTrainIcons = (total: number): boolean => total > 2;
