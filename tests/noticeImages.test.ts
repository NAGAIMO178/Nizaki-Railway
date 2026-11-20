// 通知の画像(複数枚・4枚まで・全画面)
import { describe, it, expect } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { NOTICE_IMAGE_MAX, cleanImageUrls, normalizeNotices, noticeImages, type Notice } from '../src/utils/notices';
import { trashFreshImages, validateNoticeForm } from '../src/components/AdminNoticeEditor';
import { NoticeSheet } from '../src/components/NoticeSheet';
import { SWIPE_MIN_PX, stepIndex, swipeDirection } from '../src/components/NoticeImageViewer';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');
const NOW = Date.parse('2026-11-21T12:00:00+09:00');
const u = (i: number) => `https://example.test/${i}.png`;
const raw = (over: Record<string, unknown> = {}) => ({ id: 'n1', kind: 'normal', title: '題名', body: '', imageUrl: '', linkUrl: '', publishAt: NOW - 1000, ...over });
const notice = (over: Partial<Notice> = {}): Notice => ({ id: 'n1', kind: 'normal', title: '題名', body: '', imageUrl: '', imageUrls: [], linkUrl: '', publishAt: NOW - 1000, ...over });

describe('サーバーから来た画像の整え方', () => {
  it('imageUrls(0〜4個)を読む。imageUrl は、最初の1枚', () => {
    const [n] = normalizeNotices([raw({ imageUrls: [u(1), u(2), u(3), u(4)], imageUrl: u(1) })], NOW);
    expect(n.imageUrls).toEqual([u(1), u(2), u(3), u(4)]);
    expect(n.imageUrl).toBe(u(1));
    expect(normalizeNotices([raw({ imageUrls: [] })], NOW)[0].imageUrls).toEqual([]);
  });
  it('imageUrls が無い(古いデータ)ときは、imageUrl を1枚として使う', () => {
    const [n] = normalizeNotices([raw({ imageUrl: u(7) })], NOW);
    expect(n.imageUrls).toEqual([u(7)]);
    expect(n.imageUrl).toBe(u(7));
    expect(noticeImages({ imageUrl: u(7) })).toEqual([u(7)]);
    expect(noticeImages({ imageUrl: '' })).toEqual([]);
  });
  it('https:// 以外・重複は捨て、5枚目からは読まない', () => {
    expect(cleanImageUrls([u(1), 'http://example.test/a.png', u(1), 'javascript:alert(1)', u(2)])).toEqual([u(1), u(2)]);
    expect(cleanImageUrls([u(1), u(2), u(3), u(4), u(5)])).toHaveLength(NOTICE_IMAGE_MAX);
    expect(cleanImageUrls('x')).toEqual([]);
  });
});

describe('読む人の通知の画面', () => {
  const html = (n: Notice) => renderToStaticMarkup(React.createElement(NoticeSheet, { isOpen: true, notices: [n], onClose: () => undefined }));
  it('画像が2枚以上のときは、縦に並べ、1枚ごとに「大きく見る」ボタンになる', () => {
    const h = html(notice({ imageUrls: [u(1), u(2), u(3)], imageUrl: u(1) }));
    expect((h.match(/aria-label="画像を大きく見る"/g) || []).length).toBe(3);
    expect(h).toContain('space-y-2');
  });
  it('1枚のときも、押せる(全画面は出る)。画像が無ければ、何も出ない', () => {
    expect((html(notice({ imageUrls: [u(1)], imageUrl: u(1) })).match(/aria-label="画像を大きく見る"/g) || []).length).toBe(1);
    expect(html(notice())).not.toContain('画像を大きく見る');
  });
  it('imageUrls が無い古いデータでも、imageUrl が1枚として出る', () => {
    const old = { ...notice(), imageUrl: u(9) } as Notice & { imageUrls?: string[] };
    delete old.imageUrls;
    expect(html(old as Notice)).toContain(u(9));
  });
  it('危ないアドレス(http・javascript)の画像は、出さない', () => {
    expect(html(notice({ imageUrls: ['http://example.test/a.png'] as string[], imageUrl: '' }))).not.toContain('example.test/a.png');
  });
});

describe('全画面の動き', () => {
  it('はらう向き: 左へ=次・右へ=前。短い・縦の動きは、動かさない', () => {
    expect(swipeDirection(-SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeDirection(SWIPE_MIN_PX, 10)).toBe(-1);
    expect(swipeDirection(-(SWIPE_MIN_PX - 1), 0)).toBe(0);
    expect(swipeDirection(-80, 90)).toBe(0);
  });
  it('前後へ動く。端で止まる', () => {
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(2);
  });
  const v = read('src/components/NoticeImageViewer.tsx');
  it('左右キー・Esc・閉じるボタン・「戻る」で閉じる。矢印は、2枚以上のときだけ(端では、その向きを出さない)', () => {
    expect(v).toContain("e.key === 'ArrowLeft'");
    expect(v).toContain("e.key === 'ArrowRight'");
    expect(v).toContain("e.key === 'Escape'");
    expect(v).toContain('useBackClose(true, onClose)');
    expect(v).toContain('const many = urls.length > 1;');
    expect(v).toContain('many && index > 0');
    expect(v).toContain('many && index < urls.length - 1');
  });
});

describe('管理者の画面', () => {
  const s = read('src/components/AdminNoticeEditor.tsx');
  it('保存は、imageUrls(配列)を渡す。imageUrl は、もう渡さない', () => {
    expect(s).toContain('imageUrls: allUrls');
    expect(s).not.toMatch(/notice: \{[^}]*imageUrl:/);
  });
  it('4枚になったら、「画像を選ぶ」と「足す」を押せなくする', () => {
    expect(s).toContain('const full = images.length >= NOTICE_IMAGE_MAX;');
    expect(s).toContain('disabled={uploading || full}');
    expect(s).toContain('disabled={full || !imageUrl.trim()}');
    expect(s).toContain('images.length >= NOTICE_IMAGE_MAX) return;'); // 選ぶ画面を通らなくても、4枚のときは、サーバーへ送らない
  });
  it('既存の通知(1枚だけ・imageUrls なし)を開くと、1枚として出る', () => {
    expect(s).toContain('setImages(noticeImages(n).map((url) => ({ url, fresh: false })));');
  });
  it('validateNoticeForm: 5枚・重複・https でない画像は断る。4枚までは通す', () => {
    const ok = { title: '題名', body: '', linkUrl: '', publishAt: '2026-11-17T12:00' };
    expect(validateNoticeForm({ ...ok, imageUrls: [u(1), u(2), u(3), u(4)] })).toBeNull();
    expect(validateNoticeForm({ ...ok, imageUrls: [u(1), u(2), u(3), u(4), u(5)] })).toContain('4 枚');
    expect(validateNoticeForm({ ...ok, imageUrls: [u(1), u(1)] })).toContain('同じ');
    expect(validateNoticeForm({ ...ok, imageUrls: ['http://example.test/a.png'] })).toContain('https://');
  });
  it('新しく選んだ画像(fresh)だけ、adminDeleteNoticeImage でゴミ箱へ。保存ずみ・手で貼った画像は、呼ばない', async () => {
    const calls: { a: string; p: Record<string, unknown> }[] = [];
    const call = async (a: string, p: Record<string, unknown>) => (calls.push({ a, p }), { status: 'success' });
    const ok = await trashFreshImages([{ url: u(1), id: 'FILEID00001', fresh: true }, { url: u(2), fresh: false }, { url: u(3), id: 'FILEID00003', fresh: false }, { url: u(4), fresh: true }], call);
    expect(ok).toBe(true);
    expect(calls.map((c) => [c.a, c.p.id])).toEqual([['adminDeleteNoticeImage', 'FILEID00001']]);
  });
  it('ゴミ箱に入れられなかった(断り・通信の失敗)ときは、false', async () => {
    expect(await trashFreshImages([{ url: u(1), id: 'FILEID00001', fresh: true }], async () => ({ status: 'error' }))).toBe(false);
    expect(await trashFreshImages([{ url: u(1), id: 'FILEID00001', fresh: true }], async () => { throw new Error('x'); })).toBe(false);
  });
  it('×・やめる・別の通知を開く・閉じる(部品が外れる)ときに、新しい画像を、ゴミ箱へ。保存できたときは、入れない', () => {
    expect(s).toContain('const discardFresh');
    expect(s).toContain('useEffect(() => () => discardFresh(), []);');
    expect(s).toContain('resetForm(false)');
    expect(s).toContain('void trashFreshImages([im], call)');
    expect(s).toMatch(/const edit = \(n: Notice\) => \{\s*discardFresh\(\);/);
  });
});
