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

// 運賃表の区分の名前(運賃の内訳の表示用)
export const fareTierLabel = (dist: number): string => {
  if (dist <= 0) return '—';
  if (dist <= 3) return '3km以下';
  if (dist <= 5) return '3.1〜5km';
  if (dist <= 10) return '5.1〜10km';
  if (dist <= 30) return '10.1〜30km';
  if (dist <= 50) return '30.1〜50km';
  if (dist <= 100) return '50.1〜100km';
  if (dist <= 200) return '100.1〜200km';
  return '200.1km以上';
};
