// 通知(メニューの「通知」): 赤丸・既読(最後に開いた時刻だけ)・一覧(新しい順に20件)・https だけの画像とリンク・サーバーが無いときに静かに動く
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateNoticeForm } from '../src/components/AdminNoticeEditor';
import { Header } from '../src/components/Header';
import { MenuDrawer } from '../src/components/MenuDrawer';
import { NoticeSheet } from '../src/components/NoticeSheet';
import { fetchNotices, getNoticeOpenedAt, hasNewNotice, markNoticesOpened, normalizeNotices, Notice, safeHttpsUrl } from '../src/utils/notices';

const HOUR = 3600 * 1000;
const NOW = Date.UTC(2026, 10, 17, 3, 0, 0); // 2026-11-17 12:00 JST
const n = (over: Partial<Notice> = {}): Notice => ({ id: 'n1', kind: 'normal', title: '題名', body: '本文', imageUrl: '', linkUrl: '', publishAt: NOW - HOUR, ...over });
const raw = (over: Record<string, unknown> = {}) => ({ id: 'n1', kind: 'normal', title: '題名', body: '本文', imageUrl: '', linkUrl: '', publishAt: NOW - HOUR, ...over });
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');

describe('https だけ(safeHttpsUrl)', () => {
  it('https:// で始まるものだけ通す', () => {
    expect(safeHttpsUrl('https://example.test/a.png?x=1#y')).toBe('https://example.test/a.png?x=1#y');
    expect(safeHttpsUrl('  https://example.test/  ')).toBe('https://example.test/');
  });
  it('http・javascript:・data:・//・空白入り・ユーザー名つき・500文字超・文字でないものは、通さない', () => {
    ['http://example.test/', 'javascript:alert(1)', 'data:text/html,x', '//example.test/a', 'https://exa mple.test/', 'https://u:p@example.test/', 'https://example.test/' + 'a'.repeat(500), '', '   ', 'https://', null, undefined, 5, {}].forEach((u) => expect(safeHttpsUrl(u), String(u)).toBeNull());
  });
});

describe('一覧を整える(normalizeNotices)', () => {
  it('新しい順に、最新の20件だけ', () => {
    const many = Array.from({ length: 25 }, (_, i) => raw({ id: `n${i}`, title: `t${i}`, publishAt: NOW - (30 - i) * HOUR }));
    const got = normalizeNotices(many, NOW);
    expect(got).toHaveLength(20);
    expect(got[0].id).toBe('n24');
    expect(got[19].id).toBe('n5');
  });
  it('公開前のもの・形の合わないもの・題名のないものは、出さない', () => {
    const got = normalizeNotices([raw({ id: 'a' }), raw({ id: 'future', publishAt: NOW + HOUR }), raw({ id: '' }), raw({ id: 'x', title: '  ' }), raw({ id: 'y', publishAt: 'abc' }), null, 5, 'z'], NOW);
    expect(got.map((g) => g.id)).toEqual(['a']);
  });
  it('配列でないときは、空', () => {
    [undefined, null, {}, 'x', 5].forEach((v) => expect(normalizeNotices(v, NOW)).toEqual([]));
  });
  it('種類が不明なら通常。画像・リンクは、https のものだけ残る。長すぎる文字は切る', () => {
    const [g] = normalizeNotices([raw({ kind: 'survey', imageUrl: 'http://example.test/a.png', linkUrl: 'https://example.test/x', title: 'あ'.repeat(80), body: 'い'.repeat(1200) })], NOW);
    expect(g.kind).toBe('normal');
    expect(g.imageUrl).toBe('');
    expect(g.linkUrl).toBe('https://example.test/x');
    expect(g.title).toHaveLength(60);
    expect(g.body).toHaveLength(1000);
  });
  it('種類は、通常・イベント・重要の3つ', () => {
    expect(normalizeNotices(['normal', 'event', 'important'].map((k, i) => raw({ id: `k${i}`, kind: k })), NOW).map((g) => g.kind).sort()).toEqual(['event', 'important', 'normal']);
  });
});

describe('赤丸と既読(最後に通知を開いた時刻だけ)', () => {
  it('開いた時刻より新しい通知があるときだけ、赤丸', () => {
    expect(hasNewNotice([n({ publishAt: NOW })], NOW - 1)).toBe(true);
    expect(hasNewNotice([n({ publishAt: NOW })], NOW)).toBe(false); // 同じ時刻は、既読
    expect(hasNewNotice([n({ publishAt: NOW - HOUR }), n({ publishAt: NOW - 2 * HOUR })], NOW)).toBe(false);
    expect(hasNewNotice([], 0)).toBe(false); // 通知がなければ、出ない
    expect(hasNewNotice([n()], 0)).toBe(true); // まだ一度も開いていない端末
  });
  it('開くと、すべて既読(開いた時刻を、保存する)。そのあとに公開された通知だけが、新しい', () => {
    const list = [n({ publishAt: NOW - HOUR }), n({ id: 'n2', publishAt: NOW - 2 * HOUR })];
    expect(hasNewNotice(list, getNoticeOpenedAt())).toBe(true);
    const at = markNoticesOpened(NOW, list);
    expect(at).toBe(NOW);
    expect(getNoticeOpenedAt()).toBe(NOW);
    expect(hasNewNotice(list, getNoticeOpenedAt())).toBe(false);
    expect(hasNewNotice([...list, n({ id: 'n3', publishAt: NOW + HOUR })], getNoticeOpenedAt())).toBe(true);
  });
  it('端末の時計より先の公開日時があっても、開けば、赤丸は消える', () => {
    const list = [n({ publishAt: NOW + 5 * HOUR })];
    expect(hasNewNotice(list, markNoticesOpened(NOW, list))).toBe(false);
  });
  it('端末に残すのは、時刻1つだけ(1件ごとの既読は、持たない)', () => {
    const keys: string[] = [];
    const orig = globalThis.localStorage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = { getItem: () => null, setItem: (k: string) => void keys.push(k), removeItem: () => undefined };
    markNoticesOpened(NOW + 123, [n(), n({ id: 'n2' }), n({ id: 'n3' })]);
    (globalThis as unknown as { localStorage: Storage }).localStorage = orig;
    expect(keys).toEqual(['nizaki_notice_opened_at']);
  });
  it('保存できない端末でも、壊れない(開いているあいだは、覚えている)', () => {
    const orig = globalThis.localStorage;
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = broken;
    try {
      const at = markNoticesOpened(NOW + 999, [n()]);
      expect(getNoticeOpenedAt()).toBe(at);
      expect(hasNewNotice([n()], getNoticeOpenedAt())).toBe(false);
    } finally {
      (globalThis as unknown as { localStorage: Storage }).localStorage = orig;
    }
  });
});

describe('サーバーから読む(fetchNotices): 無い・つながらないときは、静かに(エラーにしない)', () => {
  it('成功: 整えた一覧', async () => {
    const got = await fetchNotices(async () => ({ status: 'success', notices: [raw({ id: 'a' })] }), NOW);
    expect(got?.map((g) => g.id)).toEqual(['a']);
  });
  it('サーバーに、通知のアクションが無い(status: ignored)・エラー・形が違う: null(何も出さない)', async () => {
    expect(await fetchNotices(async () => ({ status: 'ignored' }), NOW)).toBeNull();
    expect(await fetchNotices(async () => ({ status: 'error' }), NOW)).toBeNull();
    expect(await fetchNotices(async () => undefined as never, NOW)).toBeNull();
  });
  it('通信が失敗しても、例外を出さない', async () => {
    expect(await fetchNotices(async () => { throw new Error('offline'); }, NOW)).toBeNull();
  });
  it('success でも、中身が配列でなければ、空', async () => {
    expect(await fetchNotices(async () => ({ status: 'success', notices: 'x' }), NOW)).toEqual([]);
  });
  it('読むのは、通知の一覧だけ(getNotices)。ログイン情報・管理トークンは、送らない', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await fetchNotices(async (a, p) => { calls.push([a, p]); return { status: 'ignored' }; }, NOW);
    expect(calls).toEqual([['getNotices', {}]]);
  });
});

describe('メニューとヘッダーの赤丸', () => {
  const menu = (props: Record<string, unknown>) =>
    renderToStaticMarkup(React.createElement(MenuDrawer, { isOpen: true, onClose: () => undefined, isLoggedIn: false, currentUser: null, onOpenSettings: () => undefined, onOpenMyPage: () => undefined, onOpenNPoint: () => undefined, onOpenRouteMap: () => undefined, onOpenLogin: () => undefined, ...props }));
  it('メニューに、「通知」の行がある。新しい通知があるときだけ、赤丸', () => {
    const on = menu({ onOpenNotices: () => undefined, hasNewNotice: true });
    const off = menu({ onOpenNotices: () => undefined, hasNewNotice: false });
    expect(on).toContain('>通知<');
    expect(off).toContain('>通知<');
    expect(on).toContain('新しい通知があります');
    expect(off).not.toContain('新しい通知があります');
    expect(on).toContain('bg-[#DC2626]');
    expect(off).not.toContain('bg-[#DC2626]');
  });
  it('「通知」の行は、案内の中。ヘッダーには、ベルを足さない(Header に Bell は無い)', () => {
    const html = menu({ onOpenNotices: () => undefined });
    expect(html.indexOf('>案内<')).toBeLessThan(html.indexOf('>通知<'));
    expect(html.indexOf('>通知<')).toBeLessThan(html.indexOf('>設定<'));
    expect(read('src/components/Header.tsx')).not.toMatch(/\bBell\b/);
  });
  it('onOpenNotices が無ければ、行を出さない', () => {
    expect(menu({})).not.toContain('>通知<');
  });
  const header = (hasNewNotice: boolean) => renderToStaticMarkup(React.createElement(Header, { hasNewNotice }));
  it('メニューを開くボタンに、新しい通知があるときだけ、小さな赤丸', () => {
    expect(header(true)).toContain('bg-[#DC2626]');
    expect(header(false)).not.toContain('bg-[#DC2626]');
    expect(header(true)).toContain('メニューを開く(新しい通知があります)');
    expect(header(false)).toContain('aria-label="メニューを開く"');
  });
});

describe('通知の一覧(NoticeSheet)', () => {
  const sheet = (notices: Notice[], isOpen = true) => renderToStaticMarkup(React.createElement(NoticeSheet, { isOpen, notices, onClose: () => undefined }));
  it('閉じているときは、何も出さない', () => {
    expect(sheet([n()], false)).toBe('');
  });
  it('1件ごとに、種類の印・日付・題名・本文。「NEW」の印は、つけない', () => {
    const html = sheet([n({ kind: 'event', title: 'イベント題名', body: 'イベント本文', publishAt: NOW })]);
    expect(html).toContain('イベント');
    expect(html).toContain('2026/11/17');
    expect(html).toContain('イベント題名');
    expect(html).toContain('イベント本文');
    expect(html).not.toMatch(/NEW/i);
  });
  it('種類は、通常・イベント・重要。「重要」だけ、目立たせる(赤い枠と背景)', () => {
    const html = sheet([n({ id: 'a', kind: 'normal', title: 'A' }), n({ id: 'b', kind: 'event', title: 'B' }), n({ id: 'c', kind: 'important', title: 'C' })]);
    ['通常', 'イベント', '重要'].forEach((l) => expect(html).toContain(`>${l}<`));
    expect(html.match(/border-\[#FCA5A5\] bg-\[#FEF2F2\]/g)).toHaveLength(1);
  });
  it('題名・本文は、文字として出す(HTMLとして解釈しない)', () => {
    const html = sheet([n({ title: '<script>alert(1)</script>', body: '<img src=x onerror=alert(1)>' })]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('画像は、https のものだけ表示する。リンクは、https のものだけ。新しいタブで開く(noopener)', () => {
    const ok = sheet([n({ imageUrl: 'https://example.test/a.png', linkUrl: 'https://example.test/x' })]);
    expect(ok).toContain('<img src="https://example.test/a.png"');
    expect(ok).toContain('href="https://example.test/x"');
    expect(ok).toContain('target="_blank"');
    expect(ok).toContain('rel="noopener noreferrer"');
    const bad = sheet([n({ imageUrl: 'http://example.test/a.png', linkUrl: 'javascript:alert(1)' })]);
    expect(bad).not.toContain('<img');
    expect(bad).not.toContain('<a ');
    expect(bad).not.toContain('javascript:');
  });
  it('画像・リンクが無ければ、出さない。通知が0件なら、「通知はありません」', () => {
    const html = sheet([n()]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a ');
    expect(sheet([])).toContain('通知はありません');
  });
  it('順番は、渡された順(新しい順に整えたものを、そのまま)', () => {
    const html = sheet([n({ id: 'a', title: '新しい' }), n({ id: 'b', title: '古い' })]);
    expect(html.indexOf('新しい')).toBeLessThan(html.indexOf('古い'));
  });
});

describe('作りは、ほかのシートと同じ(段階3): スマホは下から、PC は中央の480px', () => {
  const s = read('src/components/NoticeSheet.tsx');
  it('スマホ: 下から出る・上だけ丸い・高さは85%まで・つまみ', () => {
    const phone = s.replace(/ pc:[^\s"'`}]+/g, '');
    expect(phone).toContain('className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn"');
    expect(phone).toContain('className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"');
    expect(phone).toContain('<div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#D1C9E3]" />');
  });
  it('PC: 中央の480px・四隅とも丸い・つまみは出さない・引いて閉じる動きは付けない', () => {
    expect(s).toContain('pc:max-w-[480px]');
    expect(s).toContain('pc:rounded-3xl');
    expect(s).toContain('pc:justify-center pc:items-center pc:p-4');
    expect(s).toContain('const drag = useDragToDismiss(onClose, !pcLayout);');
    expect(s).toContain("if (e.key === 'Escape') onClose();");
  });
});

describe('つなぎ込み', () => {
  it('アプリを開いたとき・メニューを開いたときに読む。通知を開くと、既読。ヘッダーとメニューに赤丸を渡す', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('const notice = useNotices();');
    expect(app).toContain('void notice.refresh();');
    expect(app).toContain('notice.markRead(); // 開くと、すべて既読');
    expect(app).toContain('hasNewNotice={notice.hasNew}');
    expect(app).toContain('<NoticeSheet isOpen={isNoticeOpen}');
  });
  it('短い間隔の繰り返しは、しない(60秒以内の再取得は飛ばす・タイマーを使わない)', () => {
    const hook = read('src/utils/useNotices.ts');
    expect(hook).toContain('MIN_REFETCH_MS = 60 * 1000');
    expect(hook).not.toMatch(/setInterval|setTimeout/);
  });
  it('管理者コンソールに、「通知」の書き込み画面(種類・題名・本文・画像・リンク・公開日時・送信・直す・消す)', () => {
    expect(read('src/components/AdminConsoleModal.tsx')).toContain("{activeTab === 'notices' && <AdminNoticeEditor />}");
    const ed = read('src/components/AdminNoticeEditor.tsx');
    ['種類', '題名', '本文', '画像のアドレス', 'リンクのアドレス', '公開する日時', '送信', '直す', '消す'].forEach((w) => expect(ed).toContain(w));
    ['adminListNotices', 'adminSaveNotice', 'adminDeleteNotice'].forEach((a) => expect(ed).toContain(a));
  });
});

describe('管理者の書き込み画面の入力チェック(サーバー側でも、同じ確認をする)', () => {
  const ok = { title: '題名', body: '', imageUrl: '', linkUrl: '', publishAt: '2026-11-17T12:00' };
  it('通る・通らない', () => {
    expect(validateNoticeForm(ok)).toBeNull();
    expect(validateNoticeForm({ ...ok, title: '' })).toContain('題名');
    expect(validateNoticeForm({ ...ok, title: 'あ'.repeat(61) })).toContain('60');
    expect(validateNoticeForm({ ...ok, body: 'あ'.repeat(1001) })).toContain('1000');
    expect(validateNoticeForm({ ...ok, imageUrl: 'http://example.test/a.png' })).toContain('https://');
    expect(validateNoticeForm({ ...ok, linkUrl: 'javascript:alert(1)' })).toContain('https://');
    expect(validateNoticeForm({ ...ok, imageUrl: 'https://example.test/a.png', linkUrl: 'https://example.test/' })).toBeNull();
    expect(validateNoticeForm({ ...ok, publishAt: '' })).toContain('日時');
  });
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());
