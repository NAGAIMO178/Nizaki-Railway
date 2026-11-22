// アンケート(お知らせのリンクから、アプリ内の専用画面 ?survey=<アンケートID> を開いて答える)。
//  - 匿名。結果は管理者だけが見る。公開用は getSurvey / submitSurvey、管理用は adminListSurveys / adminSaveSurvey / adminDeleteSurvey / adminSurveyResults
//  - 質問は5問まで。型は5つ: single(1つ選ぶ)・multi(複数選ぶ)・scale5(1〜5)・singleOther(1つ選ぶ+その他の短文)・text(短い自由記述)
//  - 同じ端末が2回答えるのを防ぐため、端末ごとにランダムな印を1つ作って覚えておく(氏名・メール・会員IDは、送らない)。
//    サーバーは、この印を、アンケートごとのハッシュにして保存する
//  - 上限・書式は、サーバー(gas/Code.gs の「アンケート」の節)と同じ。サーバーも、同じ検査をする
import { callGas } from './accountApi';
import { safeStorage } from './safeStorage';
import { withPreviewFlag } from './launch';

export type SurveyType = 'single' | 'multi' | 'scale5' | 'singleOther' | 'text';
export const SURVEY_TYPES: SurveyType[] = ['single', 'multi', 'scale5', 'singleOther', 'text'];
export const SURVEY_TYPE_LABEL: Record<SurveyType, string> = {
  single: '1つ選ぶ',
  multi: '複数選ぶ',
  scale5: '5段階(1〜5)',
  singleOther: '1つ選ぶ+その他',
  text: '自由記述',
};
export const SURVEY_TYPES_WITH_OPTIONS: SurveyType[] = ['single', 'multi', 'singleOther'];

export const SURVEY_TITLE_MAX = 60;
export const SURVEY_DESCRIPTION_MAX = 300;
export const SURVEY_QUESTION_MAX = 5;
export const SURVEY_QUESTION_TEXT_MAX = 100;
export const SURVEY_OPTION_MIN = 2;
export const SURVEY_OPTION_MAX = 8;
export const SURVEY_OPTION_TEXT_MAX = 40;
export const SURVEY_TEXT_ANSWER_MAX = 200;
export const SURVEY_OTHER_ANSWER_MAX = 100;

export const SURVEY_ID_PATTERN = /^s[0-9a-f]{12}$/;
const SURVEY_MARK_PATTERN = /^[A-Za-z0-9]{16,64}$/;

export interface SurveyQuestion {
  id: string;
  type: SurveyType;
  text: string;
  required: boolean;
  options?: string[];
}

export interface PublicSurvey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
}

type GasLike = { status?: string; code?: string; message?: string; survey?: unknown; surveys?: unknown; results?: unknown; responseCount?: unknown; id?: unknown };
export type SurveyCall = (action: string, payload: Record<string, unknown>) => Promise<GasLike>;
const defaultCall: SurveyCall = (a, p) => callGas(a, p) as Promise<GasLike>;

// ---- リンク ----

// ?survey=… の値。なければ null。あれば(形が合わなくても)そのまま返す(画面が「見つかりません」を出す)
export const surveyParamFromSearch = (search: string = window.location.search): string | null => {
  try {
    const v = new URLSearchParams(search).get('survey');
    return v === null ? null : v.trim();
  } catch {
    return null;
  }
};

// お知らせの「リンク」に貼る、アンケートのリンク。公開URLは、いま開いているアプリの場所から作る(コードには書かない)
export const buildSurveyUrl = (id: string, location: { origin: string; pathname: string } = window.location): string => {
  const url = withPreviewFlag(new URL(location.origin + location.pathname));
  url.searchParams.set('survey', id);
  return url.toString();
};

// ---- 端末の印 ----

const MARK_KEY = 'nizaki_survey_mark';
const DONE_KEY_PREFIX = 'nizaki_survey_done_';
const MARK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const randomMark = (len = 32): string => {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (let i = 0; i < len; i++) out += MARK_CHARS[bytes[i] % MARK_CHARS.length];
  return out;
};

// この端末の印(英数字16〜64文字)。なければ作って、端末に覚える。覚えられない環境では、開いているあいだだけ同じ
export const getDeviceMark = (): string => {
  try {
    const saved = safeStorage.getItem(MARK_KEY);
    if (saved && SURVEY_MARK_PATTERN.test(saved)) return saved;
  } catch {
    // 読めなければ、作りなおす
  }
  const mark = randomMark();
  try {
    safeStorage.setItem(MARK_KEY, mark);
  } catch {
    // 覚えられなくても、送れる
  }
  return mark;
};

// 「この端末で、このアンケートに、答えた」の印
export const hasAnswered = (surveyId: string): boolean => {
  try {
    return safeStorage.getItem(DONE_KEY_PREFIX + surveyId) === '1';
  } catch {
    return false;
  }
};
export const markAnswered = (surveyId: string): void => {
  try {
    safeStorage.setItem(DONE_KEY_PREFIX + surveyId, '1');
  } catch {
    // 覚えられなくても、サーバーが、2回目を断る
  }
};

// ---- 文言 ----

export type EndReason = 'already_answered' | 'closed' | 'not_found' | 'full';

export const END_TEXT: Record<EndReason, { title: string; body: string }> = {
  already_answered: { title: 'すでに回答ずみです', body: 'このアンケートには、すでに回答いただいています。ありがとうございました。' },
  closed: { title: '受付を終了しました', body: 'このアンケートは、受付を終了しました。ご協力、ありがとうございました。' },
  not_found: { title: 'アンケートが見つかりません', body: 'リンクが古いか、アンケートが取り下げられたかもしれません。' },
  full: { title: '受付を終了しました', body: 'このアンケートは、回答の数が上限に達したため、受付を終了しました。' },
};

export const NETWORK_ERROR_TEXT = '通信できませんでした。電波のよいところで、もう一度お試しください。';
const NOT_DEPLOYED_TEXT = 'アンケートに、まだ対応していません。しばらくしてから、もう一度お試しください。';
const RETRY_TEXT: Record<string, string> = {
  rate_limited: '短い時間に、たくさん送られたため、しばらくしてからお試しください。',
  busy: '混み合っています。しばらくしてからもう一度お試しください。',
};

// ---- 読み込み(getSurvey) ----

export type LoadResult = { kind: 'ok'; survey: PublicSurvey } | { kind: 'end'; reason: 'closed' | 'not_found' } | { kind: 'error'; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// サーバーの質問を、画面で扱える形にする。読めないものは捨てる(型が知らないもの・選択肢が足りないもの)
export const normalizeQuestions = (raw: unknown): SurveyQuestion[] => {
  if (!Array.isArray(raw)) return [];
  const out: SurveyQuestion[] = [];
  for (const q of raw) {
    if (!isObj(q) || typeof q.id !== 'string' || typeof q.text !== 'string') continue;
    if (typeof q.type !== 'string' || !(SURVEY_TYPES as string[]).includes(q.type)) continue;
    const type = q.type as SurveyType;
    const base: SurveyQuestion = { id: q.id, type, text: q.text, required: q.required === true };
    if (SURVEY_TYPES_WITH_OPTIONS.includes(type)) {
      const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string') : [];
      if (options.length < SURVEY_OPTION_MIN) continue;
      base.options = options;
    }
    out.push(base);
  }
  return out;
};

export const parsePublicSurvey = (raw: unknown): PublicSurvey | null => {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  const questions = normalizeQuestions(raw.questions);
  if (questions.length === 0) return null;
  return { id: raw.id, title: raw.title, description: typeof raw.description === 'string' ? raw.description : '', questions };
};

export const fetchSurvey = async (surveyId: string, call: SurveyCall = defaultCall): Promise<LoadResult> => {
  if (!SURVEY_ID_PATTERN.test(surveyId)) return { kind: 'end', reason: 'not_found' };
  try {
    const res = await call('getSurvey', { surveyId });
    if (res?.status === 'success') {
      const survey = parsePublicSurvey(res.survey);
      return survey ? { kind: 'ok', survey } : { kind: 'error', message: NETWORK_ERROR_TEXT };
    }
    if (res?.code === 'closed') return { kind: 'end', reason: 'closed' };
    if (res?.code === 'not_found') return { kind: 'end', reason: 'not_found' };
    if (res?.status === 'ignored') return { kind: 'error', message: NOT_DEPLOYED_TEXT };
    return { kind: 'error', message: NETWORK_ERROR_TEXT };
  } catch {
    return { kind: 'error', message: NETWORK_ERROR_TEXT };
  }
};

// ---- 答え ----

// 画面で入力中の、1問ぶんの答え
export interface AnswerInput {
  choice: string; // single / singleOther(選択肢を選んだとき)
  choices: string[]; // multi
  scale: number; // scale5(0 = 未回答)
  otherOn: boolean; // singleOther で「その他」を選んでいる
  other: string; // singleOther の「その他」の文
  text: string; // text
}

export const emptyAnswerInput = (): AnswerInput => ({ choice: '', choices: [], scale: 0, otherOn: false, other: '', text: '' });

export type AnswerInputs = Record<string, AnswerInput>;

// サーバーへ送る形(質問のIDごと。答えていない質問は、入れない)
export const buildAnswers = (questions: SurveyQuestion[], inputs: AnswerInputs): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    const a = inputs[q.id] ?? emptyAnswerInput();
    if (q.type === 'single') {
      if (a.choice && q.options?.includes(a.choice)) out[q.id] = a.choice;
    } else if (q.type === 'multi') {
      const picked = (q.options ?? []).filter((o) => a.choices.includes(o)); // 選択肢の並び順で
      if (picked.length > 0) out[q.id] = picked;
    } else if (q.type === 'scale5') {
      if (Number.isInteger(a.scale) && a.scale >= 1 && a.scale <= 5) out[q.id] = a.scale;
    } else if (q.type === 'singleOther') {
      if (a.otherOn) {
        const other = a.other.trim();
        if (other) out[q.id] = { other };
      } else if (a.choice && q.options?.includes(a.choice)) {
        out[q.id] = { choice: a.choice };
      }
    } else if (q.type === 'text') {
      const t = a.text.trim();
      if (t) out[q.id] = t;
    }
  }
  return out;
};

// 送る前の確認。問題があれば、何問目かと、その文。なければ null
export const validateAnswerInputs = (questions: SurveyQuestion[], inputs: AnswerInputs): { index: number; message: string } | null => {
  const answers = buildAnswers(questions, inputs);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const no = `${i + 1}問目`;
    const a = inputs[q.id] ?? emptyAnswerInput();
    if (q.type === 'text' && a.text.trim().length > SURVEY_TEXT_ANSWER_MAX) return { index: i, message: `${no}は、${SURVEY_TEXT_ANSWER_MAX}文字までです。` };
    if (q.type === 'singleOther' && a.otherOn && a.other.trim().length > SURVEY_OTHER_ANSWER_MAX) return { index: i, message: `${no}の「その他」は、${SURVEY_OTHER_ANSWER_MAX}文字までです。` };
    if (q.required && !(q.id in answers)) {
      return { index: i, message: q.type === 'singleOther' && a.otherOn ? `${no}は、「その他」の内容を入れてください。` : `${no}は、必須です。答えてください。` };
    }
  }
  return null;
};

// ---- 送る(submitSurvey) ----

export type SubmitResult = { kind: 'done' } | { kind: 'end'; reason: EndReason } | { kind: 'error'; message: string };

export const submitSurveyAnswers = async (surveyId: string, answers: Record<string, unknown>, call: SurveyCall = defaultCall): Promise<SubmitResult> => {
  try {
    const res = await call('submitSurvey', { surveyId, deviceMark: getDeviceMark(), answers });
    if (res?.status === 'success') return { kind: 'done' };
    const code = res?.code;
    if (code === 'already_answered' || code === 'closed' || code === 'not_found' || code === 'full') return { kind: 'end', reason: code };
    if (code && RETRY_TEXT[code]) return { kind: 'error', message: RETRY_TEXT[code] };
    if (res?.status === 'ignored') return { kind: 'error', message: NOT_DEPLOYED_TEXT };
    // invalid など: サーバーの文(「3問目は、必須です。」など。やさしい日本語)を、そのまま出す
    if (typeof res?.message === 'string' && res.message.trim()) return { kind: 'error', message: res.message };
    return { kind: 'error', message: '送れませんでした。もう一度お試しください。' };
  } catch {
    return { kind: 'error', message: NETWORK_ERROR_TEXT };
  }
};

// ---- 管理者: 作る・直す ----

export interface AdminSurvey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  responseCount: number;
}

export const normalizeAdminSurveys = (raw: unknown): AdminSurvey[] => {
  if (!Array.isArray(raw)) return [];
  const out: AdminSurvey[] = [];
  for (const r of raw) {
    if (!isObj(r) || typeof r.id !== 'string' || !SURVEY_ID_PATTERN.test(r.id)) continue;
    out.push({
      id: r.id,
      title: String(r.title ?? ''),
      description: String(r.description ?? ''),
      questions: normalizeQuestions(r.questions),
      status: r.status === 'open' ? 'open' : 'closed',
      createdAt: String(r.createdAt ?? ''),
      updatedAt: String(r.updatedAt ?? ''),
      responseCount: typeof r.responseCount === 'number' && isFinite(r.responseCount) ? r.responseCount : 0,
    });
  }
  return out;
};

// 編集中の質問(選択肢は、1行に1つの文字で持つ)
export interface DraftQuestion {
  id: string;
  type: SurveyType;
  text: string;
  required: boolean;
  optionsText: string;
}

export interface SurveyDraft {
  id: string; // '' = 新しく作る
  title: string;
  description: string;
  status: 'open' | 'closed';
  questions: DraftQuestion[];
}

export const optionLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');

// 使われていない質問のID(q1〜q5 …)
export const nextQuestionId = (questions: { id: string }[]): string => {
  const used = new Set(questions.map((q) => q.id));
  for (let n = 1; n < 100; n++) if (!used.has(`q${n}`)) return `q${n}`;
  return `q${Date.now().toString(36).slice(-8)}`;
};

export const newDraftQuestion = (existing: { id: string }[], type: SurveyType = 'single'): DraftQuestion => ({
  id: nextQuestionId(existing),
  type,
  text: '',
  required: false,
  optionsText: '',
});

export const emptyDraft = (): SurveyDraft => ({ id: '', title: '', description: '', status: 'open', questions: [newDraftQuestion([])] });

export const draftFromSurvey = (sv: AdminSurvey): SurveyDraft => ({
  id: sv.id,
  title: sv.title,
  description: sv.description,
  status: sv.status,
  questions: sv.questions.map((q) => ({ id: q.id, type: q.type, text: q.text, required: q.required, optionsText: (q.options ?? []).join('\n') })),
});

// サーバーへ送る質問(選択肢のない型には、選択肢を付けない)
export const draftQuestionsToPayload = (questions: DraftQuestion[]): SurveyQuestion[] =>
  questions.map((q) => {
    const base: SurveyQuestion = { id: q.id, type: q.type, text: q.text.trim(), required: q.required };
    if (SURVEY_TYPES_WITH_OPTIONS.includes(q.type)) base.options = optionLines(q.optionsText);
    return base;
  });

// 入力を確かめる。問題があれば、その文。なければ null
export const validateSurveyDraft = (d: SurveyDraft): string | null => {
  if (!d.title.trim()) return '題名を入れてください。';
  if (d.title.trim().length > SURVEY_TITLE_MAX) return `題名は ${SURVEY_TITLE_MAX} 文字までです。`;
  if (d.description.trim().length > SURVEY_DESCRIPTION_MAX) return `説明は ${SURVEY_DESCRIPTION_MAX} 文字までです。`;
  if (d.questions.length < 1) return '質問を、1つ以上入れてください。';
  if (d.questions.length > SURVEY_QUESTION_MAX) return `質問は、${SURVEY_QUESTION_MAX} 問までです。`;
  for (let i = 0; i < d.questions.length; i++) {
    const q = d.questions[i];
    const no = `${i + 1}問目`;
    const text = q.text.trim();
    if (!text) return `${no}の質問の文を入れてください。`;
    if (text.length > SURVEY_QUESTION_TEXT_MAX) return `${no}の質問の文は、${SURVEY_QUESTION_TEXT_MAX} 文字までです。`;
    if (SURVEY_TYPES_WITH_OPTIONS.includes(q.type)) {
      const opts = optionLines(q.optionsText);
      if (opts.length < SURVEY_OPTION_MIN || opts.length > SURVEY_OPTION_MAX) return `${no}の選択肢は、${SURVEY_OPTION_MIN}〜${SURVEY_OPTION_MAX} 個にしてください。`;
      if (opts.some((o) => o.length > SURVEY_OPTION_TEXT_MAX)) return `${no}の選択肢は、${SURVEY_OPTION_TEXT_MAX} 文字までです。`;
      if (new Set(opts).size !== opts.length) return `${no}の選択肢が、重なっています。`;
    }
  }
  return null;
};

export const draftToPayload = (d: SurveyDraft) => ({
  ...(d.id ? { id: d.id } : {}),
  title: d.title.trim(),
  description: d.description.trim(),
  status: d.status,
  questions: draftQuestionsToPayload(d.questions),
});

// ---- 管理者: 結果(adminSurveyResults) ----

export interface QuestionResult {
  id: string;
  type: SurveyType;
  text: string;
  answered: number;
  options: { option: string; count: number }[]; // single / multi / singleOther
  otherCount: number;
  others: string[];
  counts: number[]; // scale5: 1〜5 の人数
  average: number | null;
  texts: string[];
}

export interface SurveyResults {
  title: string;
  status: string;
  responseCount: number;
  results: QuestionResult[];
}

const nonNegInt = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

export const normalizeResults = (res: { survey?: unknown; results?: unknown; responseCount?: unknown }): SurveyResults | null => {
  if (!isObj(res.survey) || !Array.isArray(res.results)) return null;
  const results: QuestionResult[] = [];
  for (const r of res.results) {
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.type !== 'string' || !(SURVEY_TYPES as string[]).includes(r.type)) continue;
    const counts = Array.isArray(r.counts) ? r.counts.map(nonNegInt) : [];
    while (counts.length < 5) counts.push(0);
    results.push({
      id: r.id,
      type: r.type as SurveyType,
      text: String(r.text ?? ''),
      answered: nonNegInt(r.answered),
      options: Array.isArray(r.options) ? r.options.filter(isObj).map((o) => ({ option: String(o.option ?? ''), count: nonNegInt(o.count) })) : [],
      otherCount: nonNegInt(r.otherCount),
      others: strList(r.others),
      counts: counts.slice(0, 5),
      average: typeof r.average === 'number' && isFinite(r.average) ? r.average : null,
      texts: strList(r.texts),
    });
  }
  return { title: String(res.survey.title ?? ''), status: String(res.survey.status ?? ''), responseCount: nonNegInt(res.responseCount), results };
};

// 棒グラフの長さ(%)。分母が 0 のときは 0
export const percentOf = (count: number, total: number): number => (total > 0 ? Math.round((count / total) * 100) : 0);
