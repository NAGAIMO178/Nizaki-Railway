// 「画像で保存」: PC(確実にマウスが主の端末)は、共有シートを出さず、すぐダウンロード。スマホ・タブレット・迷う端末は、いままでどおり。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceHints, isDesktopMouseDevice, needsLongPressSave, saveImage } from '../src/utils/imageSave';
import fs from 'node:fs';
import path from 'node:path';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1',
  ipadSafariAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  ipadOldUa: 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  lineIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.5.0',
  lineAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 Line/14.5.0',
  lineDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Line/8.0.0',
};

const pc = (ua: string, extra: Partial<DeviceHints> = {}) => isDesktopMouseDevice({ userAgent: ua, ...extra });

describe('PC(確実にマウスが主の端末)の判定', () => {
  it('PC: Windows の Chrome・Edge、Mac の Safari・Chrome、Linux の Firefox(マウスの端末)', () => {
    for (const ua of [UA.windowsChrome, UA.windowsEdge, UA.macSafari, UA.macChrome, UA.linuxFirefox]) {
      expect(pc(ua, { maxTouchPoints: 0, finePointer: true, coarsePointer: false, uaMobile: false }), ua).toBe(true);
      expect(pc(ua, { maxTouchPoints: 0 }), `${ua}(入力の種類が分からなくても、タッチ点が 0)`).toBe(true);
    }
  });

  it('タッチ画面つきの Windows ノートでも、主な入力がマウス(pointer: fine)なら、PC', () => {
    expect(pc(UA.windowsChrome, { maxTouchPoints: 10, finePointer: true, coarsePointer: false })).toBe(true);
  });

  it('スマホ: iPhone の Safari・Chrome・Android の Chrome は、スマホ側', () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.androidChrome]) {
      expect(pc(ua, { maxTouchPoints: 5, coarsePointer: true, finePointer: false }), ua).toBe(false);
      expect(pc(ua), `${ua}(手がかりが UA だけ)`).toBe(false);
    }
  });

  it('タブレット: iPad は、Mac のふりをした UA でも(タッチ点が 2 以上)、古い iPad の UA でも、スマホ側。Android のタブレットも、スマホ側', () => {
    expect(pc(UA.ipadSafariAsMac, { maxTouchPoints: 5, finePointer: true })).toBe(false); // pointer: fine と言っても(外付けマウス・トラックパッド)、タッチ点で iPad と分かる
    expect(pc(UA.ipadSafariAsMac, { maxTouchPoints: 5 })).toBe(false);
    expect(pc(UA.ipadOldUa, { maxTouchPoints: 5 })).toBe(false);
    expect(pc(UA.androidTablet, { maxTouchPoints: 5, coarsePointer: true })).toBe(false);
    expect(pc(UA.androidTablet)).toBe(false);
  });

  it('LINE 内は、どの端末でも、スマホ側(いままでの動きのまま)。needsLongPressSave も、そのまま', () => {
    for (const ua of [UA.lineIphone, UA.lineAndroid, UA.lineDesktop]) {
      expect(pc(ua, { maxTouchPoints: 0, finePointer: true }), ua).toBe(false);
      expect(needsLongPressSave(ua), ua).toBe(true);
    }
    expect(needsLongPressSave(UA.iphoneSafari)).toBe(false);
    expect(needsLongPressSave(UA.windowsChrome)).toBe(false);
  });

  it('迷う端末は、スマホ側: userAgentData が mobile・主な入力が指・タッチ点が分からない/あり(入力の種類が分からない)・ChromeOS・知らない UA・空', () => {
    expect(pc(UA.windowsChrome, { maxTouchPoints: 0, uaMobile: true })).toBe(false);
    expect(pc(UA.windowsChrome, { maxTouchPoints: 0, coarsePointer: true })).toBe(false);
    expect(pc(UA.windowsChrome)).toBe(false); // タッチ点が分からない・入力の種類も分からない
    expect(pc(UA.windowsChrome, { maxTouchPoints: 10 })).toBe(false); // タッチあり・入力の種類が分からない
    expect(pc(UA.macSafari, { maxTouchPoints: 5 })).toBe(false);
    expect(pc(UA.chromeOs, { maxTouchPoints: 0, finePointer: true })).toBe(false);
    expect(pc('SomeUnknownBrowser/1.0', { maxTouchPoints: 0, finePointer: true })).toBe(false);
    expect(pc('', { maxTouchPoints: 0, finePointer: true })).toBe(false);
  });
});

// ---- saveImage の動き(端末を作りものにして、共有シート・ダウンロード・長押し保存の、どれになるか) ----
const click = vi.fn();
const share = vi.fn(async () => undefined);
const appended: { href?: string; download?: string }[] = [];

const setup = (ua: string, o: { touch?: number; fine?: boolean; coarse?: boolean; canShare?: boolean; shareError?: string; uaMobile?: boolean } = {}) => {
  click.mockClear();
  share.mockReset();
  share.mockImplementation(async () => {
    if (o.shareError) throw Object.assign(new Error('x'), { name: o.shareError });
    return undefined;
  });
  appended.length = 0;
  vi.stubGlobal('navigator', {
    userAgent: ua,
    maxTouchPoints: o.touch ?? 0,
    ...(o.uaMobile === undefined ? {} : { userAgentData: { mobile: o.uaMobile } }),
    ...(o.canShare === false ? {} : { canShare: () => true }),
    share,
  });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') ? !!o.coarse : q.includes('fine') ? !!o.fine : false }));
  vi.stubGlobal('document', {
    createElement: () => {
      const a: { href?: string; download?: string; click: () => void; remove: () => void } = { click: () => click(a.href, a.download), remove: () => undefined };
      return a;
    },
    body: { appendChild: (a: { href?: string; download?: string }) => void appended.push(a) },
  });
};
const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveImage: PC はすぐダウンロード', () => {
  it.each([['Windows Chrome', UA.windowsChrome], ['Windows Edge', UA.windowsEdge], ['Mac Safari', UA.macSafari], ['Mac Chrome', UA.macChrome]])(
    '%s(共有シートが使える環境でも): 共有シートは出さず、ダウンロード(<a download>)が走る',
    async (_n, ua) => {
      setup(ua, { touch: 0, fine: true, canShare: true });
      expect(await saveImage(blob(), 'nizaki-card-M0000123.png')).toBeNull();
      expect(share).not.toHaveBeenCalled();
      expect(click).toHaveBeenCalledTimes(1);
      expect(appended[0].download).toBe('nizaki-card-M0000123.png');
      expect(appended[0].href).toMatch(/^blob:/);
    }
  );
});

describe('saveImage: スマホ・タブレット・迷う端末は、いままでどおり(共有シートを先に出す)', () => {
  it.each([
    ['iPhone Safari', UA.iphoneSafari, { touch: 5, coarse: true }],
    ['iPad Safari(Mac の UA)', UA.ipadSafariAsMac, { touch: 5, fine: true }],
    ['Android Chrome', UA.androidChrome, { touch: 5, coarse: true }],
    ['Android タブレット', UA.androidTablet, { touch: 5, coarse: true }],
    ['迷う端末(Windows でタッチあり・入力の種類が不明)', UA.windowsChrome, { touch: 10 }],
  ])('%s: 共有シートが出て、ダウンロードは走らない', async (_n, ua, o) => {
    setup(ua, o);
    expect(await saveImage(blob(), 'x.png')).toBeNull();
    expect(share).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });

  it('共有シートを自分で閉じたとき(AbortError)は、何もしない。失敗したときは、ダウンロードに切り替える', async () => {
    setup(UA.iphoneSafari, { touch: 5, coarse: true, shareError: 'AbortError' });
    expect(await saveImage(blob(), 'x.png')).toBeNull();
    expect(click).not.toHaveBeenCalled();
    setup(UA.androidChrome, { touch: 5, coarse: true, shareError: 'NotAllowedError' });
    expect(await saveImage(blob(), 'x.png')).toBeNull();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('共有シートが使えないスマホは、ダウンロード', async () => {
    setup(UA.androidChrome, { touch: 5, coarse: true, canShare: false });
    expect(await saveImage(blob(), 'x.png')).toBeNull();
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('saveImage: LINE 内は、いままでどおり(画像を表示して、長押しで保存)', () => {
  it.each([['LINE の iPhone', UA.lineIphone, { touch: 5, coarse: true }], ['LINE の Android', UA.lineAndroid, { touch: 5, coarse: true }]])('%s: 共有シートが使えない/失敗なら、URL を返す(ダウンロードは走らない)', async (_n, ua, o) => {
    setup(ua, { ...o, canShare: false });
    const url = await saveImage(blob(), 'x.png');
    expect(url).toMatch(/^blob:/);
    expect(click).not.toHaveBeenCalled();
  });

  it('LINE の中の PC 版(UA に Line/)も、共有シートを先に試す(PC と見なさない)。使えなければ、URL を返す', async () => {
    setup(UA.lineDesktop, { touch: 0, fine: true, canShare: true, shareError: 'NotAllowedError' });
    const url = await saveImage(blob(), 'x.png');
    expect(share).toHaveBeenCalledTimes(1);
    expect(url).toMatch(/^blob:/);
  });
});

describe('2か所とも、同じ関数を通る', () => {
  it('会員証(NPointModal)・QR乗車券(TicketQRModal)の「画像で保存」は、どちらも saveImage を呼ぶ(判定は、saveImage の中の1か所)', () => {
    for (const f of ['NPointModal.tsx', 'TicketQRModal.tsx']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', f), 'utf-8');
      expect(src, f).toContain("import { saveImage } from '../utils/imageSave';");
      expect(src, f).toMatch(/await saveImage\(/);
      expect(src, f).not.toContain('navigator.share');
      expect(src, f).not.toContain('canShare');
    }
  });
});
