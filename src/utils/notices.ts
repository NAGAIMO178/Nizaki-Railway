// 通知(メニューの「通知」): サーバー(GAS)から、公開ずみの通知を読む。端末に残すのは、「最後に通知を開いた時刻」だけ。
//  - 赤丸は、その時刻より新しい通知があるときだけ。通知を開くと、すべて既読(1件ごとの既読は、持たない)。
//  - サーバーに、通知のしくみが、まだ無いとき・つながらないときは、何も出さない(エラーにしない)。
import { callGas } from './accountApi';
import { safeStorage } from './safeStorage';

export type NoticeKind = 'normal' | 'event' | 'important';
export const NOTICE_KINDS: NoticeKind[] = ['normal', 'event', 'important'];
export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = { normal: '通常', event: 'イベント', important: '重要' };

export const NOTICE_LIMIT = 20; // 一覧に出す件数
export const NOTICE_TITLE_MAX = 60;
export const NOTICE_BODY_MAX = 1000;
export const NOTICE_URL_MAX = 500;
export const NOTICE_IMAGE_MAX = 4; // 1つの通知に付けられる画像の数

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  imageUrl: string; // 最初の1枚(https:// のみ。なければ '')。古いデータは、これだけ
  imageUrls: string[]; // 画像(https:// のみ・0〜4枚・重複なし)
  linkUrl: string; // https:// のみ。なければ ''
  publishAt: number; // 公開の日時(ms)
}

// https:// で始まる、500文字までのアドレスだけ通す(それ以外は null)
export const safeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > NOTICE_URL_MAX || /\s/.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
    return v;
  } catch {
    return null;
  }
};

// 画像のアドレスの並びを整える: https:// のものだけ・重複を除く・最大4枚
export const cleanImageUrls = (list: unknown): string[] => {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const v of list) {
    const u = safeHttpsUrl(v);
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= NOTICE_IMAGE_MAX) break;
  }
  return out;
};

// 通知の画像の一覧。imageUrls が無い(または空の)古いデータは、imageUrl を1枚として使う
export const noticeImages = (n: { imageUrl?: unknown; imageUrls?: unknown }): string[] => {
  const urls = cleanImageUrls(n.imageUrls);
  if (urls.length > 0) return urls;
  const one = safeHttpsUrl(n.imageUrl);
  return one ? [one] : [];
};

const isKind = (v: unknown): v is NoticeKind => typeof v === 'string' && (NOTICE_KINDS as string[]).includes(v);

const toNotice = (raw: unknown): Notice | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const publishAt = Number(r.publishAt);
  if (typeof r.id !== 'string' || !r.id || !Number.isFinite(publishAt)) return null;
  const title = typeof r.title === 'string' ? r.title.slice(0, NOTICE_TITLE_MAX) : '';
  if (!title.trim()) return null;
  const images = noticeImages(r);
  return {
    id: r.id,
    kind: isKind(r.kind) ? r.kind : 'normal',
    title,
    body: typeof r.body === 'string' ? r.body.slice(0, NOTICE_BODY_MAX) : '',
    imageUrl: images[0] ?? '',
    imageUrls: images,
    linkUrl: safeHttpsUrl(r.linkUrl) ?? '',
    publishAt,
  };
};

// サーバーから来た一覧を、整える: 形の合わないものは捨てる・公開前のものは出さない・新しい順・最新の20件だけ
export const normalizeNotices = (raw: unknown, nowMs: number = Date.now()): Notice[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(toNotice)
    .filter((n): n is Notice => n !== null && n.publishAt <= nowMs)
    .sort((a, b) => b.publishAt - a.publishAt)
    .slice(0, NOTICE_LIMIT);
};

// ---- 最後に通知を開いた時刻(ms)。保存できない端末でも、safeStorage が、開いているあいだは覚えている ----
const OPENED_KEY = 'nizaki_notice_opened_at';

export const getNoticeOpenedAt = (): number => {
  try {
    const n = Number(safeStorage.getItem(OPENED_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
};

export const markNoticesOpened = (nowMs: number = Date.now(), notices: Notice[] = []): number => {
  // 端末の時計より先の公開日時の通知があっても、赤丸が残らないよう、新しいほうに合わせる
  const at = Math.max(nowMs, ...notices.map((n) => n.publishAt));
  try {
    safeStorage.setItem(OPENED_KEY, String(at));
  } catch {
    // 保存できなくても、続ける
  }
  return at;
};

export const hasNewNotice = (notices: Notice[], openedAt: number): boolean => notices.some((n) => n.publishAt > openedAt);

// ---- サーバーから読む ----
type GasLike = { status?: string; notices?: unknown };
export type NoticeCall = (action: string, payload: Record<string, unknown>) => Promise<GasLike>;

// 読めなかったとき・サーバーに通知のしくみが無いとき(status が success でない)は、null(静かに、何も変えない。エラーにしない)
export const fetchNotices = async (call: NoticeCall = (a, p) => callGas(a, p) as Promise<GasLike>, nowMs: number = Date.now()): Promise<Notice[] | null> => {
  try {
    const res = await call('getNotices', {});
    if (!res || res.status !== 'success') return null;
    return normalizeNotices(res.notices, nowMs);
  } catch {
    return null;
  }
};
