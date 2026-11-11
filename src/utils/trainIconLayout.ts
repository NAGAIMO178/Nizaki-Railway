// 列車位置の路線図で、同じ駅・駅間にいる列車(左側の札)の並べ方。
//  - 1本・2本: 横に並べる(線路は X=-24px、駅の丸は -31px にあるので、札(幅38px)は、右端が -36px より左になるように置く)。
//  - 3本以上: 札を1枚に束ねる(後ろにずらした札で、本数を表す。TrainPin.tsx の TrainPinBundle)。小さくして並べることは、しない。
export const BUNDLE_MIN_TRAINS = 3;

// 3本以上なら、束ねる
export const isBundle = (total: number): boolean => total >= BUNDLE_MIN_TRAINS;

// total 本のうち index 番目(0が最優等)の、中心の X(px)。1本・束ねた札は -62、2本は左右(最優等が左)
export const trainIconCenter = (total: number, index: number): number => {
  if (total === 2) return index === 0 ? -98 : -56;
  return -62;
};

// 優等度(大きいほど優等): 特急・めぐり・スカイ > 通勤特快・特別快速 > 快速・急行 > 準急・区間快速 > 各停・普通。
// 同じ場所の列車は、優等な順に並べる(2本は優等が左。束ねた札は、先頭が最も優等)
export const trainRank = (trainType: string): number => {
  if (trainType.includes('特急') || trainType.includes('めぐり') || trainType.includes('スカイ') || trainType.includes('ライナー')) return 10;
  if (trainType.includes('通勤特快') || trainType.includes('特別快速') || trainType.includes('特快') || trainType.includes('快特')) return 8;
  // 区間快速は、「快速」の字を含むので、先に調べる(快速より、劣る)
  if (trainType.includes('準急') || trainType.includes('区間快速')) return 4;
  if (trainType.includes('通勤快速') || trainType.includes('快速') || trainType.includes('急行')) return 5;
  return 1; // 各駅停車・普通
};
