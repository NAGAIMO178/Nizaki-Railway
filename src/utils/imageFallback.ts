import type React from 'react';

// 商品の画像が読み込めないときの代わりの絵(アプリの中に持つ。外部のサイトの写真は使わない)
export const IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='#E6E2EE'/><path d='M10 29 L17 17 L22 24 L26 19 L31 29 Z' fill='#B8AFCF'/></svg>"
  );

export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const target = e.currentTarget;
  target.onerror = null;
  target.src = IMAGE_PLACEHOLDER;
};
