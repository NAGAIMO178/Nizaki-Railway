// LINE のアプリ内ブラウザは、ダウンロードが効かない。画像を表示して、長押しで保存してもらう
export const needsLongPressSave = (userAgent: string): boolean => /\bLine\//i.test(userAgent);

// 画像を保存する。共有シートが使えれば(iPhone では「画像を保存」で写真に入る)それを、なければダウンロード。
// LINE 内など、ダウンロードできない場所では、画像を表示するための URL を返す(出したら、閉じるときに URL.revokeObjectURL する)。ふつうは null
export const saveImage = async (blob: Blob, filename: string): Promise<string | null> => {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return null;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null; // 自分で閉じた
    }
  }
  const url = URL.createObjectURL(blob);
  if (needsLongPressSave(navigator.userAgent)) return url;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return null;
};
