// 予約番号の作り方。他の予約(ほかの会員・自分の過去の予約)と、重ならないように、乱数を十分に長くする。
//  - 形: EQ- + 12文字(読み間違えやすい 0/O・1/I を除いた、32種類の英数字)。例: EQ-7K3QX9M2HT4B。32の12乗(約1.2×10の18乗)通り。
//  - 以前の形(EQ- + 5桁の数字)の予約番号も、そのまま使える(サーバーの検証は、英数字とハイフンの3〜40文字)。
//  - サーバー(gas/Code.gs)の検証: 予約番号 /^[A-Za-z0-9-]{3,40}$/、QR乗車券のトークン「予約番号.12文字」、
//    デリバリーの支払い番号「予約番号-D(時刻の36進数)」(3〜40文字)。この長さに収まる。
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32文字(5ビット)
export const ORDER_ID_RANDOM_LENGTH = 12;

// サーバーの予約番号の検証と同じ
export const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{3,40}$/;

const randomBytes = (n: number): Uint8Array => {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(out);
  } else {
    // 暗号用の乱数が使えない環境の、最後の手段(重なりにくさは、下がる)
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
};

export const newOrderId = (): string => {
  const bytes = randomBytes(ORDER_ID_RANDOM_LENGTH);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += ALPHABET[bytes[i] & 31]; // 32種類なので、かたよらない
  return `EQ-${s}`;
};
