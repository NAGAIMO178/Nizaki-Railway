// 予約で付く N-POINT の計算(端末で付けるとき・マイページの表示用)。
// サーバー(gas/Code.gs の RESERVATION_POINT_RATE / RESERVATION_POINT_MIN)と、同じ数字にそろえる。
export const RESERVATION_POINT_RATE = 0.03;
export const RESERVATION_POINT_MIN = 50;

// 新しい予約: 合計金額の3%。最低50pt
export const calcReservationPoints = (amount: number): number =>
  Math.max(RESERVATION_POINT_MIN, Math.floor(amount * RESERVATION_POINT_RATE));

// デリバリーを足したとき: 増えた金額の3%。最低はなし(少額を重ねて、最低分を集められないように)
export const calcDeliveryAddPoints = (addedAmount: number): number =>
  addedAmount > 0 ? Math.floor(addedAmount * RESERVATION_POINT_RATE) : 0;
