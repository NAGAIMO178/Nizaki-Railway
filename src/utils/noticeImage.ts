// 通知の画像: 管理者が選んだ画像を、画面の中で縮めてから、サーバー(GAS の adminUploadNoticeImage)に送る。
//  - 長いほうの辺を 1200px 以下に縮める。写真は JPEG(品質 0.85)。透明のあるものは PNG のまま。
//  - 縮めたあとが 1.5MB を超えるときは、品質(PNG は大きさ)を下げて、やり直す。それでも超えるなら、「大きすぎます」。元の画像は 10MB まで。
//  - サーバーが、まだ、その action を知らないときは、「まだ使えません」と出すだけ(壊れない)。
import { callGas } from './accountApi';
import { getAdminToken } from './disruptionManager';
import { safeHttpsUrl } from './notices';

export const IMAGE_MAX_SIDE = 1200;
export const IMAGE_MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_OUTPUT_BYTES = Math.floor(1.5 * 1024 * 1024);
export const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];
export const PNG_SCALES = [1, 0.8, 0.64, 0.5];
export const NOT_AVAILABLE_YET = 'まだ使えません(サーバーが、画像の保存に、対応していません)。';

export type OutputKind = 'jpeg' | 'png';
export interface Attempt {
  scale: number;
  quality?: number;
}

// 長いほうの辺が max を超えるときだけ、同じ比率で縮める
export const fitWithin = (width: number, height: number, max: number = IMAGE_MAX_SIDE): { width: number; height: number } => {
  const long = Math.max(width, height);
  if (!(long > max)) return { width, height };
  const s = max / long;
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
};

// 透明のあるものは PNG のまま。ほかは JPEG
export const chooseOutputKind = (hasTransparency: boolean): OutputKind => (hasTransparency ? 'png' : 'jpeg');

// やり直しの順番: JPEG は品質を下げる(0.85 → 0.45)。PNG は品質が無いので、大きさを小さくする(1 → 0.5 倍)
export const planAttempts = (kind: OutputKind): Attempt[] => (kind === 'jpeg' ? JPEG_QUALITIES.map((quality) => ({ scale: 1, quality })) : PNG_SCALES.map((scale) => ({ scale })));

export const runAttempts = async (attempts: Attempt[], encode: (a: Attempt) => Promise<Blob | null>, maxBytes: number = IMAGE_MAX_OUTPUT_BYTES): Promise<{ ok: true; blob: Blob; attempt: Attempt } | { ok: false }> => {
  for (const attempt of attempts) {
    const blob = await encode(attempt);
    if (blob && blob.size <= maxBytes) return { ok: true, blob, attempt };
  }
  return { ok: false };
};

export const validateOriginalImage = (file: { size: number; type: string }): string | null => {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return '画像(JPEG・PNG・WebP・GIF)を選んでください。';
  if (file.size > IMAGE_MAX_ORIGINAL_BYTES) return '元の画像は 10MB までです。';
  return null;
};

export const outputFileName = (name: string, kind: OutputKind): string => `${(name || 'image').replace(/\.[^./\\]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'image'}.${kind === 'png' ? 'png' : 'jpg'}`;

// ---- ブラウザの中で縮める ----
export interface ShrunkImage {
  blob: Blob;
  kind: OutputKind;
  fileName: string;
}

const loadBitmap = async (file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> => {
  if (typeof createImageBitmap === 'function') {
    const b = await createImageBitmap(file);
    return { source: b, width: b.width, height: b.height };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('load'));
      i.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const toBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, mime, quality));

export const shrinkImageFile = async (file: File): Promise<ShrunkImage | null> => {
  const bmp = await loadBitmap(file);
  const base = fitWithin(bmp.width, bmp.height);
  const draw = (scale: number, fillWhite: boolean): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(base.width * scale));
    canvas.height = Math.max(1, Math.round(base.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    if (fillWhite) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bmp.source, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  // 透明があるか(PNG・WebP・GIF だけ調べる)
  let transparent = false;
  if (file.type !== 'image/jpeg') {
    const probe = draw(1, false);
    const data = probe.getContext('2d')!.getImageData(0, 0, probe.width, probe.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        transparent = true;
        break;
      }
    }
  }
  const kind = chooseOutputKind(transparent);
  const result = await runAttempts(planAttempts(kind), (a) => toBlob(draw(a.scale, kind === 'jpeg'), kind === 'png' ? 'image/png' : 'image/jpeg', a.quality));
  if (!result.ok) return null;
  return { blob: result.blob, kind, fileName: outputFileName(file.name, kind) };
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(blob);
  });

// ---- 送る ----
type GasLike = { status?: string; message?: string; url?: unknown; id?: unknown };
export type UploadCall = (action: string, payload: Record<string, unknown>) => Promise<GasLike>;
export type UploadResult = { ok: true; url: string; id?: string } | { ok: false; message: string };

export interface UploadDeps {
  call?: UploadCall;
  shrink?: (file: File) => Promise<ShrunkImage | null>;
  toBase64?: (blob: Blob) => Promise<string>;
  token?: () => string;
}

export const uploadNoticeImage = async (file: File, deps: UploadDeps = {}): Promise<UploadResult> => {
  const call = deps.call ?? ((a, p) => callGas(a, p) as Promise<GasLike>);
  const shrink = deps.shrink ?? shrinkImageFile;
  const toBase64 = deps.toBase64 ?? blobToBase64;
  const token = deps.token ?? getAdminToken;
  const problem = validateOriginalImage(file);
  if (problem) return { ok: false, message: problem };
  let shrunk: ShrunkImage | null;
  try {
    shrunk = await shrink(file);
  } catch {
    return { ok: false, message: '画像を読み込めませんでした。' };
  }
  if (!shrunk) return { ok: false, message: '大きすぎます。もっと小さい画像を選んでください。' };
  try {
    const dataBase64 = await toBase64(shrunk.blob);
    const res = await call('adminUploadNoticeImage', { adminToken: token(), fileName: shrunk.fileName, mimeType: shrunk.kind === 'png' ? 'image/png' : 'image/jpeg', dataBase64 });
    if (res && res.status === 'success') {
      const url = safeHttpsUrl(res.url);
      if (!url) return { ok: false, message: '画像のアドレスが返ってきませんでした。' };
      return { ok: true, url, id: typeof res.id === 'string' ? res.id : undefined };
    }
    // サーバーが、まだ、その action を知らない(返事が success でない)ときは、「まだ使えません」。サーバーが理由を返したときは、その文
    return { ok: false, message: res && res.status === 'error' && typeof res.message === 'string' && res.message ? res.message : NOT_AVAILABLE_YET };
  } catch {
    return { ok: false, message: '通信に失敗しました。' };
  }
};
