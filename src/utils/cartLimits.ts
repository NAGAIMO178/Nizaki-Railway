// 車内デリバリーの数量の上限(画面で止める)。1つの商品は9個まで、1つの予約の合計は20個まで。
// すでに注文した分(予約の追加注文のとき)も、数えて足す。
export const MAX_PER_ITEM = 9;
export const MAX_TOTAL_QUANTITY = 20;

export type Quantities = { [itemId: string]: number };

const sum = (q: Quantities): number => Object.values(q).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

// カゴ(これから注文する分)に、もう1つ足せるか。purchased は、すでに注文した分
export const canAddOne = (cart: Quantities, itemId: string, purchased: Quantities = {}): boolean => {
  const item = (cart[itemId] || 0) + (purchased[itemId] || 0);
  return item < MAX_PER_ITEM && sum(cart) + sum(purchased) < MAX_TOTAL_QUANTITY;
};

// カゴが、上限の中に収まっているか(注文を確定する前の、最後の確認)
export const withinLimits = (cart: Quantities, purchased: Quantities = {}): boolean =>
  Object.entries(cart).every(([id, n]) => Number.isInteger(n) && n >= 0 && n + (purchased[id] || 0) <= MAX_PER_ITEM) &&
  sum(cart) + sum(purchased) <= MAX_TOTAL_QUANTITY;
