// LINE のアプリ内ブラウザは、ダウンロードが効かない。画像を表示して、長押しで保存してもらう
export const needsLongPressSave = (userAgent: string): boolean => /\bLine\//i.test(userAgent);

// 端末の手がかり(判定の部品に渡す。テストで、代表的な端末を作れるように、分けてある)
export interface DeviceHints {
  userAgent: string;
  maxTouchPoints?: number; // navigator.maxTouchPoints
  uaMobile?: boolean; // navigator.userAgentData?.mobile
  coarsePointer?: boolean; // matchMedia('(pointer: coarse)')。主な入力が、指(タッチ)
  finePointer?: boolean; // matchMedia('(pointer: fine)')。主な入力が、マウス・トラックパッド
}

// 確実にマウスが主の端末(PC)か。「確実に」だけ true。迷う端末は false(スマホ側。いままでの動き=共有シートを先に出す)
//  - PC の OS(Windows・Mac・Linux のデスクトップ)の UA で、かつ、スマホ・タブレットの手がかりが1つもないとき
//  - スマホ・タブレットの手がかり: userAgentData.mobile・UA の Android/iPhone/iPad/iPod/Mobile/Tablet・LINE・ChromeOS、
//    Mac の UA なのにタッチ点が 2 以上(Mac のふりをした iPad)、主な入力が指(pointer: coarse)
//  - マウスの裏づけ: 主な入力がマウス(pointer: fine)。分からないときは、タッチ点が 0 のときだけ PC
export const isDesktopMouseDevice = (h: DeviceHints): boolean => {
  const ua = h.userAgent || '';
  if (h.uaMobile === true) return false;
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|CrOS/i.test(ua)) return false;
  if (needsLongPressSave(ua)) return false;
  if (h.coarsePointer === true) return false;
  if (!/Windows NT|Macintosh|X11|Linux/i.test(ua)) return false; // PC の OS と分かるときだけ
  const touch = h.maxTouchPoints;
  if (/Macintosh/i.test(ua) && typeof touch === 'number' && touch > 1) return false; // Mac のふりをした iPad
  if (h.finePointer === true) return true;
  return touch === 0;
};

// いまの端末の手がかりを読む(読めないものは、書かない = 迷う側になる)
const readDeviceHints = (): DeviceHints => {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as (Navigator & { userAgentData?: { mobile?: boolean } }) | undefined;
  const mm = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : null;
  const media = (q: string): boolean | undefined => {
    try {
      return mm ? mm(q).matches : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints : undefined,
    uaMobile: typeof nav?.userAgentData?.mobile === 'boolean' ? nav.userAgentData.mobile : undefined,
    coarsePointer: media('(pointer: coarse)'),
    finePointer: media('(pointer: fine)'),
  };
};

// 画像を保存する。スマホ・タブレットは、共有シートが使えれば(iPhone では「画像を保存」で写真に入る)それを、なければダウンロード。
// PC(確実にマウスが主の端末)は、共有シートを出さず、すぐダウンロードする。
// LINE 内など、ダウンロードできない場所では、画像を表示するための URL を返す(出したら、閉じるときに URL.revokeObjectURL する)。ふつうは null
export const saveImage = async (blob: Blob, filename: string): Promise<string | null> => {
  const file = new File([blob], filename, { type: 'image/png' });
  if (!isDesktopMouseDevice(readDeviceHints()) && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
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
