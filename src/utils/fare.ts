// 営業キロ区分に基づく普通運賃(予約画面と経路検索で、同じ表を使う)
export const calculateFare = (dist: number): number => {
  if (dist <= 0) return 0;
  if (dist <= 3) return 150;
  if (dist <= 5) return 180;
  if (dist <= 10) return 230;
  if (dist <= 30) return 390;
  if (dist <= 50) return 660;
  if (dist <= 100) return 1000;
  if (dist <= 200) return 1980;
  return 3300;
};
