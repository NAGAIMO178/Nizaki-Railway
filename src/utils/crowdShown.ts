import { EXPRESS_TYPES } from './diaTimetable';

// 全席指定の特急(めぐり・Nライナー)は、座席を指定して乗るので、混雑(座れる・混んでいる)を出さない。
// 特急あやみは、自由席(6号車)があるので、これまでどおり出す。「空いている順」の計算には、混雑のデータを、そのまま使う
const ALL_RESERVED_TYPE_NAMES: string[] = [EXPRESS_TYPES.nliner.typeName, EXPRESS_TYPES.meguri.typeName];

export const legShowsCrowd = (leg: { typeName: string; crowd?: number }): boolean =>
  !!leg.crowd && !ALL_RESERVED_TYPE_NAMES.includes(leg.typeName);
