// 高宮線(非表示)の有料特急「すみかぜ」の決めごと(車両・座席・料金)。ここだけ直せば、予約画面・座席表・サーバーの検査の見張り(tests)が追ってくる。
// 仕様(オーナー提供): 新型特急車両・6両編成・368席(普通車5両 320席 + 特別車1両 48席)・全席指定・全区間一律料金(普通車 1,250円・特別車 2,200円。1席)。
// ★仮の決め(仕様に無かったので、既存の特急に合わせた): 特別車は1号車(あやみ+・めぐシートと同じ)・普通車は2〜6号車・
//   特別車は 1+2列(A・B・C。既存の特別席と同じ並び)を16列 = 48席・普通車は 2+2列(A〜D)を16列 = 64席・席番号は「列+席」(4B など)。
export const SUMIKAZE = {
  cars: 6,
  specialCar: 1,
  normalCars: [2, 3, 4, 5, 6],
  specialRows: 16, // 1+2列(A・B・C)× 16 = 48席
  normalRows: 16, // 2+2列(A〜D)× 16 = 64席
  fees: { reserved: 1250, special: 2200 }, // 特急料金(1席)。普通車指定席 / 特別車
} as const;

export const SUMIKAZE_SPECIAL_SEATS = SUMIKAZE.specialRows * 3; // 48
export const SUMIKAZE_NORMAL_SEATS = SUMIKAZE.normalRows * 4; // 64
export const SUMIKAZE_TOTAL_SEATS = SUMIKAZE_SPECIAL_SEATS + SUMIKAZE_NORMAL_SEATS * SUMIKAZE.normalCars.length; // 368

// すみかぜの特急料金(1席)。特別車は 2,200円、それ以外(普通車指定席)は 1,250円
export const sumikazeFee = (seatType: string): number => (seatType === 'special' ? SUMIKAZE.fees.special : SUMIKAZE.fees.reserved);
