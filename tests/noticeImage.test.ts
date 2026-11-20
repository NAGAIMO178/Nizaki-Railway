// 通知の画像: 縮める計算・やり直し・送る(サーバーは、模擬)・サーバーが、まだ、その action を知らないとき
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chooseOutputKind, fitWithin, IMAGE_MAX_OUTPUT_BYTES, JPEG_QUALITIES, NOT_AVAILABLE_YET, outputFileName, planAttempts, PNG_SCALES, runAttempts, uploadNoticeImage, validateOriginalImage,
} from '../src/utils/noticeImage';

const fakeFile = (size: number, type = 'image/jpeg', name = 'photo.JPG') => ({ size, type, name }) as unknown as File;
const blobOf = (size: number) => ({ size }) as unknown as Blob;

describe('縮める計算(fitWithin): 長いほうの辺を 1200px 以下に', () => {
  it('小さければ、そのまま。1200 ちょうども、そのまま', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 });
  });
  it('横長・縦長・正方形: 長いほうが 1200、比率はそのまま', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 900, height: 1200 });
    expect(fitWithin(2400, 2400)).toEqual({ width: 1200, height: 1200 });
    expect(fitWithin(10000, 10)).toEqual({ width: 1200, height: 1 }); // 細長くても、0 にならない
  });
});

describe('出力の種類とやり直し', () => {
  it('透明のあるものは PNG のまま。ほかは JPEG(品質 0.85 から)', () => {
    expect(chooseOutputKind(true)).toBe('png');
    expect(chooseOutputKind(false)).toBe('jpeg');
    expect(planAttempts('jpeg')[0]).toEqual({ scale: 1, quality: 0.85 });
    expect(planAttempts('jpeg').map((a) => a.quality)).toEqual(JPEG_QUALITIES);
    expect(planAttempts('png').map((a) => a.scale)).toEqual(PNG_SCALES);
    expect(planAttempts('png').every((a) => a.quality === undefined)).toBe(true);
  });
  it('1.5MB(1,572,864 バイト)以下になるまで、品質を下げてやり直す。ちょうどは通る', async () => {
    expect(IMAGE_MAX_OUTPUT_BYTES).toBe(1572864);
    const sizes = [2_000_000, 1_800_000, IMAGE_MAX_OUTPUT_BYTES];
    const used: number[] = [];
    const r = await runAttempts(planAttempts('jpeg'), async (a) => { used.push(a.quality as number); return blobOf(sizes[used.length - 1] ?? 100); });
    expect(r.ok).toBe(true);
    expect(used).toEqual([0.85, 0.75, 0.65]);
  });
  it('どこまで下げても超えるなら、失敗(「大きすぎます」)。やり直しは、決まった回数まで', async () => {
    let n = 0;
    const r = await runAttempts(planAttempts('jpeg'), async () => { n++; return blobOf(IMAGE_MAX_OUTPUT_BYTES + 1); });
    expect(r).toEqual({ ok: false });
    expect(n).toBe(JPEG_QUALITIES.length);
  });
  it('1.5MB を超えないものを、最初に作れたら、1回で終わる', async () => {
    let n = 0;
    await runAttempts(planAttempts('png'), async () => { n++; return blobOf(1000); });
    expect(n).toBe(1);
  });
});

describe('元の画像・ファイル名', () => {
  it('JPEG・PNG・WebP・GIF の、10MB まで', () => {
    expect(validateOriginalImage({ size: 10 * 1024 * 1024, type: 'image/png' })).toBeNull();
    expect(validateOriginalImage({ size: 10 * 1024 * 1024 + 1, type: 'image/png' })).toContain('10MB');
    ['image/svg+xml', 'application/pdf', 'text/html', ''].forEach((t) => expect(validateOriginalImage({ size: 10, type: t }), t).not.toBeNull());
  });
  it('出力のファイル名: 拡張子を、種類に合わせる。変な文字は、_ にする', () => {
    expect(outputFileName('photo.JPG', 'jpeg')).toBe('photo.jpg');
    expect(outputFileName('ロゴ 1.png', 'png')).toBe('_1.png');
    expect(outputFileName('', 'jpeg')).toBe('image.jpg');
  });
});

describe('送る(uploadNoticeImage): サーバーは、模擬', () => {
  const ok = { shrink: async () => ({ blob: blobOf(1000), kind: 'jpeg' as const, fileName: 'photo.jpg' }), toBase64: async () => 'QUJD', token: () => 'admin-token' };
  it('adminUploadNoticeImage に、管理トークン・ファイル名・種類・base64 を送り、返ってきた url を返す', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const r = await uploadNoticeImage(fakeFile(1000), { ...ok, call: async (a, p) => { calls.push([a, p]); return { status: 'success', url: 'https://example.test/n/a.jpg', id: 'img1' }; } });
    expect(r).toEqual({ ok: true, url: 'https://example.test/n/a.jpg', id: 'img1' });
    expect(calls).toEqual([['adminUploadNoticeImage', { adminToken: 'admin-token', fileName: 'photo.jpg', mimeType: 'image/jpeg', dataBase64: 'QUJD' }]]);
  });
  it('PNG のときは、mimeType が image/png', async () => {
    let got: Record<string, unknown> = {};
    await uploadNoticeImage(fakeFile(1000, 'image/png', 'a.png'), { ...ok, shrink: async () => ({ blob: blobOf(1), kind: 'png', fileName: 'a.png' }), call: async (_a, p) => { got = p; return { status: 'success', url: 'https://example.test/a.png' }; } });
    expect(got.mimeType).toBe('image/png');
  });
  it('サーバーが、まだ、その action を知らない(status: ignored など、success でない)とき: 壊れず、「まだ使えません」', async () => {
    for (const res of [{ status: 'ignored' }, {}, { status: 'whatever' }]) {
      expect(await uploadNoticeImage(fakeFile(1000), { ...ok, call: async () => res })).toEqual({ ok: false, message: NOT_AVAILABLE_YET });
    }
    expect(NOT_AVAILABLE_YET).toContain('まだ使えません');
  });
  it('サーバーが理由を返したときは、その文。通信の失敗でも、例外を出さない', async () => {
    expect(await uploadNoticeImage(fakeFile(1000), { ...ok, call: async () => ({ status: 'error', message: '画像が大きすぎます。' }) })).toEqual({ ok: false, message: '画像が大きすぎます。' });
    expect(await uploadNoticeImage(fakeFile(1000), { ...ok, call: async () => { throw new Error('offline'); } })).toEqual({ ok: false, message: '通信に失敗しました。' });
  });
  it('返ってきた url が https でなければ、使わない', async () => {
    for (const url of ['http://example.test/a.jpg', 'javascript:alert(1)', '', undefined]) {
      expect(await uploadNoticeImage(fakeFile(1000), { ...ok, call: async () => ({ status: 'success', url }) })).toMatchObject({ ok: false });
    }
  });
  it('元が 10MB を超える・画像でないときは、送らない。縮めても 1.5MB を超えるときは「大きすぎます」(送らない)', async () => {
    let called = false;
    const call = async () => { called = true; return { status: 'success' }; };
    expect(await uploadNoticeImage(fakeFile(11 * 1024 * 1024), { ...ok, call })).toMatchObject({ ok: false, message: expect.stringContaining('10MB') });
    expect(await uploadNoticeImage(fakeFile(10, 'text/html'), { ...ok, call })).toMatchObject({ ok: false });
    expect(await uploadNoticeImage(fakeFile(1000), { ...ok, shrink: async () => null, call })).toMatchObject({ ok: false, message: expect.stringContaining('大きすぎます') });
    expect(called).toBe(false);
  });
  it('縮める途中で失敗しても、例外を出さない', async () => {
    expect(await uploadNoticeImage(fakeFile(1000), { ...ok, shrink: async () => { throw new Error('canvas'); }, call: async () => ({ status: 'success' }) })).toMatchObject({ ok: false });
  });
});

describe('つなぎ込み', () => {
  it('「画像のアドレス」の欄は、そのまま。「画像を選ぶ」で返ってきた url を、画像として足し、小さなプレビューを出す', () => {
    const s = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/AdminNoticeEditor.tsx'), 'utf-8');
    expect(s).toContain('画像のアドレス(https:// から。なくてもよい)');
    expect(s).toContain('画像を選ぶ');
    expect(s).toContain('if (res.ok) setImages(');
    expect(s).toContain('{ url: res.url, id: res.id, fresh: true }');
    expect(s).toContain('h-16 w-16');
  });
});
