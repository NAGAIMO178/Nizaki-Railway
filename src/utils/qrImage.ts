import { encode } from 'uqr';

// QR の読み取りに必要な、まわりの白い余白(モジュール数)
export const QR_QUIET = 4;

// 文字列 → QR の行列(true が濃いモジュール)。誤り訂正は M
export const makeQrMatrix = (text: string): boolean[][] => encode(text, { ecc: 'M', border: 0 }).data;

// 画面の SVG 用の線(横に続く濃いモジュールを1本にまとめる)。座標はモジュール単位
export const qrSvgPath = (matrix: boolean[][]): string => {
  const parts: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      parts.push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return parts.join('');
};

// 濃いモジュールを塗る。fill は (x, y, 幅, 高さ) で長方形を塗る関数(画像の canvas でも、確かめるときの画素でも使える)
export const paintQr = (
  fill: (x: number, y: number, w: number, h: number) => void,
  matrix: boolean[][],
  x: number,
  y: number,
  unit: number,
) => {
  matrix.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) fill(x + c * unit, y + r * unit, unit, unit);
    });
  });
};
