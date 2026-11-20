// ご意見・不具合(メニュー →「ご意見・不具合」)。サーバー(GAS の submitFeedback)に送る。
//  - 返信がほしい人には、サーバーが、受付コード(6文字・10分・使い捨て)を返す。その人が、公式LINEにそのまま送ると、結びつく
//  - 「動作状況」(版・画面の大きさ・直近のエラーなど)を添えられる。メール・名前・予約の中身・ポイント・端末の識別番号は、入れない。URL は、? より後ろを入れない
import { callGas, LINE_OA_ADD_FRIEND_URL } from './accountApi';
import { safeStorage } from './safeStorage';

export const FEEDBACK_MESSAGE_MAX = 1000;
export const FEEDBACK_ENV_MAX = 1500; // サーバーの上限
export const FEEDBACK_UA_MAX = 200;
export const FEEDBACK_ERROR_MAX = 200;

export const FEEDBACK_SCREENS = [
  'ホーム', '列車位置', '時刻表', '経路検索', '特急予約', 'デリバリー商品選択', 'イベント', 'メニュー', 'マイページ', '会員証',
  'ログイン・アカウント新規登録', '通知', '路線図', 'NIZAKI 2.0紹介', '設定', 'その他',
] as const;
export type FeedbackScreen = (typeof FEEDBACK_SCREENS)[number];

export const FEEDBACK_KINDS = ['バグ・不具合', '要望・感想', 'その他'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

// いま開いていた画面(下のタブ)から、最初に選んでおく「対象の画面」
export const screenOfTab = (tab: string): FeedbackScreen => {
  switch (tab) {
    case 'home': return 'ホーム';
    case 'location': return '列車位置';
    case 'timetable': return '時刻表';
    case 'reservation': return '特急予約';
    case 'events': return 'イベント';
    case 'settings': return '設定';
    default: return 'その他';
  }
};

// ---- 公式LINE ----
export const LINE_OA_ID = '@836rgjze';
export { LINE_OA_ADD_FRIEND_URL };
// LINE を、受付コードだけが入力ずみの状態で開く(LINE 公式: https://line.me/R/oaMessage/{パーセントエンコードした LINE ID}/?{パーセントエンコードした文}。@ は %40)
export const lineOaMessageUrl = (code: string): string => `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(code)}`;

// ---- Googleフォームの入口 ----
export const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdWczFx3H_qkjhLI2XofaH9GLH0YHgI2WXw-9r_5uag6Er_aQ/viewform';
// フォームの欄の番号(entry.数字)。番号が null の間は、事前入力を付けない(ただのリンク)
export const FEEDBACK_FORM_ENTRY: Record<'screen' | 'kind' | 'message' | 'wantReply' | 'env' | 'code', string | null> = {
  screen: 'entry.1400659191', // 対象の画面(ラジオ)
  kind: 'entry.1413917765', // 種類(ラジオ)
  message: 'entry.239824281', // 内容(長い文章)
  wantReply: 'entry.1934312063', // 返信の希望(ラジオ: する / しない)
  env: 'entry.1559613320', // 利用環境(動作状況)
  code: 'entry.514912590', // 合言葉(英数字6文字)
};

// フォームの「対象の画面」の選択肢の文字(完全に一致させる。一致しないと、選ばれない状態で開く)
export const FEEDBACK_FORM_SCREEN_CHOICES = [
  'ホーム', '列車位置', '時刻表', '経路検索', '特急予約', 'デリバリー商品選択', 'イベント', 'メニュー', 'マイページ(及びその画面上のコンテンツ)', '会員証(及びその画面上のコンテンツ)',
  'ログイン・アカウント新規登録画面', '通知', '路線図', 'NIZAKI 2.0紹介', '設定', 'その他',
] as const;
// アプリの表示 → フォームの文字(アプリとフォームで、一部、表示が違う)
export const FEEDBACK_FORM_SCREEN_LABEL: Record<FeedbackScreen, string> = {
  'ホーム': 'ホーム',
  '列車位置': '列車位置',
  '時刻表': '時刻表',
  '経路検索': '経路検索',
  '特急予約': '特急予約',
  'デリバリー商品選択': 'デリバリー商品選択',
  'イベント': 'イベント',
  'メニュー': 'メニュー',
  'マイページ': 'マイページ(及びその画面上のコンテンツ)',
  '会員証': '会員証(及びその画面上のコンテンツ)',
  'ログイン・アカウント新規登録': 'ログイン・アカウント新規登録画面',
  '通知': '通知',
  '路線図': '路線図',
  'NIZAKI 2.0紹介': 'NIZAKI 2.0紹介',
  '設定': '設定',
  'その他': 'その他',
};
export const formScreenLabel = (screen: string): string => (FEEDBACK_FORM_SCREEN_LABEL as Record<string, string>)[screen] ?? '';

// フォームの「返信の希望」の選択肢
export const FORM_WANT_REPLY_YES = 'する';
export const FORM_WANT_REPLY_NO = 'しない';

// ---- 合言葉(Googleフォーム用): 英数字6文字・大文字・O/0・I/1/l を使わない・英字を1文字以上 ----
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // I・L・O を除く23文字
const CODE_ALPHABET = CODE_LETTERS + '23456789'; // 31文字(0・1 を除く)
export const makeFormCode = (random: (n: number) => number[] = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)))): string => {
  for (;;) {
    let out = '';
    for (const b of random(12)) {
      if (b < 248 && out.length < 6) out += CODE_ALPHABET.charAt(b % 31); // 31 の倍数(248)未満だけ使う(偏りをなくす)
    }
    if (out.length === 6 && /[A-Z]/.test(out)) return out;
  }
};
const FORM_ENV_MAX = 800; // アドレスの長さの制限があるので、動作状況は 800 文字まで

export interface FeedbackFormValues {
  screen?: string;
  kind?: string;
  message?: string;
  wantReply?: boolean;
  env?: string;
  code?: string;
}

export const buildFeedbackFormUrl = (values: FeedbackFormValues = {}, entries = FEEDBACK_FORM_ENTRY): string => {
  const params: string[] = [];
  const add = (key: keyof typeof entries, value: string | undefined) => {
    const id = entries[key];
    if (id && value) params.push(`${encodeURIComponent(id)}=${encodeURIComponent(value)}`);
  };
  add('screen', values.screen ? formScreenLabel(values.screen) : undefined);
  add('kind', values.kind);
  add('message', values.message ? values.message.slice(0, FEEDBACK_MESSAGE_MAX) : values.message);
  add('wantReply', values.wantReply === undefined ? undefined : values.wantReply ? FORM_WANT_REPLY_YES : FORM_WANT_REPLY_NO);
  add('env', values.env ? values.env.slice(0, FORM_ENV_MAX) : values.env);
  add('code', values.wantReply ? values.code : undefined); // 返信を希望しないときは、合言葉を付けない
  return params.length === 0 ? FEEDBACK_FORM_URL : `${FEEDBACK_FORM_URL}?usp=pp_url&${params.join('&')}`;
};

// 「Googleフォームで送る」を押した瞬間: 返信を希望するときだけ、合言葉(英数字6文字)を作って、事前入力に入れて、フォームを新しいタブで開く。
// 合言葉は、アプリの画面には出さない(フォームの合言葉の欄に入る)。希望しないときは、合言葉を付けない。作ったアドレスを返す
export const openFeedbackForm = (values: FeedbackFormValues, open: (url: string) => void = (u) => void window.open(u, '_blank', 'noopener,noreferrer'), makeCode: () => string = makeFormCode): string => {
  const url = buildFeedbackFormUrl(values.wantReply ? { ...values, code: makeCode() } : { ...values, code: undefined });
  open(url);
  return url;
};

// ---- 端末ごとの、ランダムな印(連投の制限に使う。氏名・メールなどとは、結びつかない) ----
const DEVICE_KEY = 'nizaki_feedback_device';
const randomChars = (n: number): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const out: string[] = [];
  try {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    bytes.forEach((b) => out.push(chars[b % chars.length]));
  } catch {
    for (let i = 0; i < n; i++) out.push(chars[Math.floor(Math.random() * chars.length)]);
  }
  return out.join('');
};
export const getFeedbackDeviceId = (): string => {
  try {
    const saved = safeStorage.getItem(DEVICE_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,80}$/.test(saved)) return saved;
  } catch {
    // 読めなければ、新しく作る
  }
  const id = `fb-${randomChars(24)}`;
  try {
    safeStorage.setItem(DEVICE_KEY, id);
  } catch {
    // 覚えられなくても、送れる
  }
  return id;
};

// ---- 動作状況 ----
export interface EnvInput {
  version: string;
  width: number;
  height: number;
  dpr: number;
  pcLayout: boolean;
  userAgent: string;
  screen: string; // いまの画面
  loggedIn: boolean;
  errors: string[]; // 直近のエラーの件名(新しい順。3件まで使う)
  online: boolean;
  now: Date;
  href: string; // 開いているアドレス(? 以降は、使わない)
}

// アドレスは、origin + pathname だけ(? と # 以降は、乗車券の情報などが入ることがあるので、絶対に入れない)
export const safeLocation = (href: string): string => {
  try {
    const u = new URL(href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '';
  }
};

const jstText = (d: Date): string => {
  const p = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour').replace('24', '00')}:${get('minute')}`;
};

const oneLine = (s: string, max: number): string => s.replace(/\s+/g, ' ').trim().slice(0, max);

// Googleフォームの事前入力用: 800文字以内。長いときは、UA を短くして収める
export const buildEnvTextForForm = (i: EnvInput, max: number = FORM_ENV_MAX): string => {
  const full = buildEnvText(i);
  if (full.length <= max) return full;
  const ua = i.userAgent.replace(/\s+/g, ' ').trim().slice(0, FEEDBACK_UA_MAX);
  const shortUa = ua.slice(0, Math.max(0, ua.length - (full.length - max)));
  return buildEnvText({ ...i, userAgent: shortUa }).slice(0, max);
};

export const buildEnvText = (i: EnvInput): string => {
  const errors = i.errors.slice(0, 3).map((e) => oneLine(e, FEEDBACK_ERROR_MAX));
  const lines = [
    `版: ${i.version}`,
    `画面: ${Math.round(i.width)}x${Math.round(i.height)} (dpr ${i.dpr}) / PC表示: ${i.pcLayout ? 'あり' : 'なし'}`,
    `UA: ${oneLine(i.userAgent, FEEDBACK_UA_MAX)}`,
    `いまの画面: ${i.screen}`,
    `ログイン: ${i.loggedIn ? 'あり' : 'なし'}`,
    `直近のエラー: ${errors.length === 0 ? '0件' : errors.map((e, n) => `${n + 1}. ${e}`).join(' / ')}`,
    `サーバー: ${i.online ? 'つながる' : 'つながらない'}`,
    `送信時刻: ${jstText(i.now)}`,
    `URL: ${safeLocation(i.href)}`,
  ];
  return lines.join('\n').slice(0, FEEDBACK_ENV_MAX);
};

// ---- 送る ----
export interface FeedbackInput {
  screen: string;
  kind: string;
  message: string;
  wantReply: boolean;
  env: string; // 動作状況(添えないときは '')
}
export interface FeedbackPayload extends FeedbackInput {
  deviceId: string;
}

export type FeedbackResult =
  | { ok: true; replyCode?: string; expiresAt?: number }
  | { ok: false; message: string };

type GasLike = { status?: string; message?: string; replyCode?: unknown; expiresAt?: unknown };
export type FeedbackCall = (action: string, payload: Record<string, unknown>) => Promise<GasLike>;

export const validateFeedback = (f: { screen: string; kind: string; message: string }): string | null => {
  if (!f.screen) return '対象の画面を選んでください。';
  if (!f.kind) return '種類を選んでください。';
  if (!f.message.trim()) return '内容を入れてください。';
  if (f.message.length > FEEDBACK_MESSAGE_MAX) return `内容は ${FEEDBACK_MESSAGE_MAX} 文字までです。`;
  return null;
};

export const submitFeedback = async (
  input: FeedbackInput,
  sessionToken?: string,
  call: FeedbackCall = (a, p) => callGas(a, p) as Promise<GasLike>,
  deviceId: string = getFeedbackDeviceId()
): Promise<FeedbackResult> => {
  const feedback: FeedbackPayload = { ...input, message: input.message.trim(), env: input.env.slice(0, FEEDBACK_ENV_MAX), deviceId };
  try {
    const res = await call('submitFeedback', sessionToken ? { feedback, sessionToken } : { feedback });
    if (res && res.status === 'success') {
      const code = typeof res.replyCode === 'string' && /^[A-Za-z0-9]{6}$/.test(res.replyCode) ? res.replyCode.toUpperCase() : undefined;
      return { ok: true, replyCode: code, expiresAt: typeof res.expiresAt === 'number' ? res.expiresAt : undefined };
    }
    // サーバーの文を、そのまま出す(rate_limited・busy・invalid など)。文が無ければ、決まった文
    return { ok: false, message: res && typeof res.message === 'string' && res.message ? res.message : '送れませんでした。しばらくしてからもう一度お試しください。' };
  } catch {
    return { ok: false, message: '通信に失敗しました。しばらくしてからもう一度お試しください。' };
  }
};
