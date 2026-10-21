// 自己都合キャンセルの違約金: 元の料金(N-POINTで払った分も含む)の1.5倍 + 手数料500円
export const CANCEL_FEE_YEN = 500;
export const CANCEL_PENALTY_RATE = 1.5;

export const calcCancelPenalty = (totalPrice: number, pointsUsed = 0): number =>
  Math.round((totalPrice + pointsUsed) * CANCEL_PENALTY_RATE) + CANCEL_FEE_YEN;
