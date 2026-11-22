// アンケート(アプリ側): リンク・端末の印・答えの組み立てと確認・送信の結果の出し分け・管理者の作成の検査・結果の整え。
// 最後に、本物の gas/Code.gs を、作りものの台帳で動かして、アプリの送る形が、サーバーに通ることを確かめる(本番には、何も書かない)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSafeStorageMemory, safeStorage } from '../src/utils/safeStorage';
import {
  AnswerInputs, DraftQuestion, SurveyCall, SurveyDraft, SurveyQuestion,
  buildAnswers, buildSurveyUrl, draftFromSurvey, draftToPayload, emptyAnswerInput, emptyDraft, fetchSurvey, getDeviceMark, hasAnswered, markAnswered, newDraftQuestion,
  nextQuestionId, normalizeAdminSurveys, normalizeQuestions, normalizeResults, optionLines, parsePublicSurvey, percentOf, submitSurveyAnswers, surveyParamFromSearch,
  validateAnswerInputs, validateSurveyDraft,
} from '../src/utils/survey';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');

const QS: SurveyQuestion[] = [
  { id: 'q1', type: 'single', text: '好きな色は', options: ['赤', '青', '緑'], required: true },
  { id: 'q2', type: 'multi', text: '使う路線', options: ['神埼線', '土浦線', '環状線'], required: false },
  { id: 'q3', type: 'scale5', text: '満足度は', required: true },
  { id: 'q4', type: 'singleOther', text: 'きっかけは', options: ['広告', '友人'], required: false },
  { id: 'q5', type: 'text', text: 'ご意見', required: false },
];
const ID = 's0123456789ab';

beforeEach(() => {
  clearSafeStorageMemory();
  localStorage.clear(); // テストの準備(tests/setup.ts)の保存先も、空にする
});

describe('リンク', () => {
  it('?survey= の値を取り出す。なければ null。形が合わなくても、そのまま返す(画面が「見つかりません」を出す)', () => {
    expect(surveyParamFromSearch(`?survey=${ID}`)).toBe(ID);
    expect(surveyParamFromSearch(`?x=1&survey=${ID}`)).toBe(ID);
    expect(surveyParamFromSearch('')).toBeNull();
    expect(surveyParamFromSearch('?ticket=1')).toBeNull();
    expect(surveyParamFromSearch('?survey=abc')).toBe('abc');
    expect(surveyParamFromSearch('?survey=')).toBe('');
  });
  it('お知らせに貼るリンクは、いま開いている場所から作る。取り出すと、同じIDに戻る', () => {
    const url = buildSurveyUrl(ID, { origin: 'https://example.test', pathname: '/app/' });
    expect(url).toBe(`https://example.test/app/?survey=${ID}`);
    expect(surveyParamFromSearch(new URL(url).search)).toBe(ID);
  });
});

describe('端末の印', () => {
  it('英数字16〜64文字。1回作ると、同じ端末では、同じ値', () => {
    const a = getDeviceMark();
    expect(a).toMatch(/^[A-Za-z0-9]{16,64}$/);
    expect(getDeviceMark()).toBe(a);
  });
  it('保存されていた値が壊れていれば、作りなおす', () => {
    safeStorage.setItem('nizaki_survey_mark', 'x y');
    const m = getDeviceMark();
    expect(m).toMatch(/^[A-Za-z0-9]{16,64}$/);
  });
  it('端末ごとに、違う値になる(乱数)', () => {
    const marks = new Set<string>();
    for (let i = 0; i < 20; i++) {
      localStorage.clear();
      marks.add(getDeviceMark());
    }
    expect(marks.size).toBe(20);
  });
  it('答えた印は、アンケートごと', () => {
    expect(hasAnswered(ID)).toBe(false);
    markAnswered(ID);
    expect(hasAnswered(ID)).toBe(true);
    expect(hasAnswered('s000000000000')).toBe(false);
  });
});

describe('質問の読み込み', () => {
  it('知らない型・選択肢が足りない質問は、捨てる', () => {
    const qs = normalizeQuestions([
      QS[0],
      { id: 'x', type: 'ranking', text: 'x', required: false },
      { id: 'y', type: 'single', text: 'y', options: ['1つだけ'], required: false },
      { id: 'z', type: 'text', text: 'z' },
      null,
      5,
      { id: 1, type: 'text', text: 'z' },
    ]);
    expect(qs.map((q) => q.id)).toEqual(['q1', 'z']);
    expect(qs[1].required).toBe(false);
    expect(normalizeQuestions('x')).toEqual([]);
  });
  it('質問が1つも読めないアンケートは、使わない', () => {
    expect(parsePublicSurvey({ id: ID, title: 't', description: '', questions: [] })).toBeNull();
    expect(parsePublicSurvey({ id: ID, title: 't', questions: [QS[4]] })?.description).toBe('');
    expect(parsePublicSurvey(null)).toBeNull();
  });
});

describe('getSurvey の結果', () => {
  const call = (res: unknown): SurveyCall => (async () => res) as SurveyCall;
  it('success は、アンケート。closed・not_found は、終了の画面。IDの形が変なら、サーバーに聞かず not_found', async () => {
    const ok = await fetchSurvey(ID, call({ status: 'success', survey: { id: ID, title: '題', description: '説明', questions: QS } }));
    expect(ok).toMatchObject({ kind: 'ok', survey: { title: '題' } });
    expect(await fetchSurvey(ID, call({ status: 'error', code: 'closed' }))).toEqual({ kind: 'end', reason: 'closed' });
    expect(await fetchSurvey(ID, call({ status: 'error', code: 'not_found' }))).toEqual({ kind: 'end', reason: 'not_found' });
    let called = 0;
    const counting: SurveyCall = async () => {
      called++;
      return { status: 'success' };
    };
    expect(await fetchSurvey('abc', counting)).toEqual({ kind: 'end', reason: 'not_found' });
    expect(called).toBe(0);
  });
  it('通信の失敗・サーバーが未対応・読めない返事は、「もう一度」の画面', async () => {
    const boom: SurveyCall = async () => {
      throw new Error('net');
    };
    expect((await fetchSurvey(ID, boom)).kind).toBe('error');
    expect((await fetchSurvey(ID, call({ status: 'ignored' }))).kind).toBe('error');
    expect((await fetchSurvey(ID, call({ status: 'success', survey: { id: ID, title: 't', questions: [] } }))).kind).toBe('error');
    expect((await fetchSurvey(ID, call(undefined))).kind).toBe('error');
  });
});

describe('答えの組み立て(buildAnswers)', () => {
  const inp = (patch: Partial<ReturnType<typeof emptyAnswerInput>>) => ({ ...emptyAnswerInput(), ...patch });
  it('型ごとに、サーバーの形にする。答えていない質問は、入れない', () => {
    const inputs: AnswerInputs = {
      q1: inp({ choice: '赤' }),
      q2: inp({ choices: ['環状線', '神埼線'] }),
      q3: inp({ scale: 4 }),
      q4: inp({ choice: '友人' }),
      q5: inp({ text: '  よかった  ' }),
    };
    expect(buildAnswers(QS, inputs)).toEqual({ q1: '赤', q2: ['神埼線', '環状線'], q3: 4, q4: { choice: '友人' }, q5: 'よかった' });
    expect(buildAnswers(QS, {})).toEqual({});
  });
  it('「その他」は、選択肢と同時には送らない。空の「その他」は、答えなし', () => {
    expect(buildAnswers(QS, { q4: inp({ otherOn: true, choice: '広告', other: '  口コミ ' }) }).q4).toEqual({ other: '口コミ' });
    expect(buildAnswers(QS, { q4: inp({ otherOn: true, other: '   ' }) })).toEqual({});
  });
  it('選択肢にない値・範囲外の段階は、送らない', () => {
    expect(buildAnswers(QS, { q1: inp({ choice: '黄' }), q2: inp({ choices: ['空路'] }), q3: inp({ scale: 6 }) })).toEqual({});
  });
});

describe('送る前の確認(validateAnswerInputs)', () => {
  const inp = (patch: Partial<ReturnType<typeof emptyAnswerInput>>) => ({ ...emptyAnswerInput(), ...patch });
  it('必須が答えられていなければ、何問目かと文を返す(いちばん上の1つ)', () => {
    expect(validateAnswerInputs(QS, {})).toEqual({ index: 0, message: '1問目は、必須です。答えてください。' });
    expect(validateAnswerInputs(QS, { q1: inp({ choice: '赤' }) })).toEqual({ index: 2, message: '3問目は、必須です。答えてください。' });
    expect(validateAnswerInputs(QS, { q1: inp({ choice: '赤' }), q3: inp({ scale: 1 }) })).toBeNull();
  });
  it('必須の「その他」が空なら、その旨', () => {
    const qs: SurveyQuestion[] = [{ ...QS[3], required: true }];
    expect(validateAnswerInputs(qs, { q4: inp({ otherOn: true }) })?.message).toBe('1問目は、「その他」の内容を入れてください。');
    expect(validateAnswerInputs(qs, { q4: inp({ otherOn: true, other: '口コミ' }) })).toBeNull();
  });
  it('文字数の上限(自由記述200・その他100)', () => {
    expect(validateAnswerInputs([QS[4]], { q5: inp({ text: 'あ'.repeat(201) }) })?.message).toBe('1問目は、200文字までです。');
    expect(validateAnswerInputs([QS[4]], { q5: inp({ text: 'あ'.repeat(200) }) })).toBeNull();
    expect(validateAnswerInputs([QS[3]], { q4: inp({ otherOn: true, other: 'あ'.repeat(101) }) })?.message).toBe('1問目の「その他」は、100文字までです。');
  });
});

describe('送信の結果(submitSurvey)', () => {
  const call = (res: unknown, seen?: Record<string, unknown>[]): SurveyCall => (async (_a, p) => {
    seen?.push(p);
    return res;
  }) as SurveyCall;
  it('success は done。送る中身は、アンケートID・端末の印・答えだけ(名前・メール・会員ID・トークンは、無い)', async () => {
    const seen: Record<string, unknown>[] = [];
    expect(await submitSurveyAnswers(ID, { q1: '赤' }, call({ status: 'success' }, seen))).toEqual({ kind: 'done' });
    expect(Object.keys(seen[0]).sort()).toEqual(['answers', 'deviceMark', 'surveyId']);
    expect(seen[0].deviceMark).toBe(getDeviceMark());
  });
  it('already_answered・closed・not_found・full は、それぞれの終了の画面', async () => {
    for (const code of ['already_answered', 'closed', 'not_found', 'full'] as const) {
      expect(await submitSurveyAnswers(ID, {}, call({ status: 'error', code, message: 'x' }))).toEqual({ kind: 'end', reason: code });
    }
  });
  it('rate_limited・busy は、やさしい文(サーバーの文に頼らない)。invalid は、サーバーの文', async () => {
    expect(await submitSurveyAnswers(ID, {}, call({ status: 'error', code: 'rate_limited' }))).toEqual({ kind: 'error', message: '短い時間に、たくさん送られたため、しばらくしてからお試しください。' });
    expect(await submitSurveyAnswers(ID, {}, call({ status: 'error', code: 'busy' }))).toEqual({ kind: 'error', message: '混み合っています。しばらくしてからもう一度お試しください。' });
    expect(await submitSurveyAnswers(ID, {}, call({ status: 'error', code: 'invalid', message: '3問目は、必須です。' }))).toEqual({ kind: 'error', message: '3問目は、必須です。' });
    expect((await submitSurveyAnswers(ID, {}, call({ status: 'error', code: 'invalid' }))).kind).toBe('error');
  });
  it('通信の失敗・未対応は、エラーの文(終了にしない)', async () => {
    const boom: SurveyCall = async () => {
      throw new Error('net');
    };
    expect(await submitSurveyAnswers(ID, {}, boom)).toMatchObject({ kind: 'error' });
    expect(await submitSurveyAnswers(ID, {}, call({ status: 'ignored' }))).toMatchObject({ kind: 'error' });
  });
});

describe('管理者: 作る・直す', () => {
  const dq = (patch: Partial<DraftQuestion>): DraftQuestion => ({ id: 'q1', type: 'single', text: '質問', required: false, optionsText: 'A\nB', ...patch });
  const draft = (patch: Partial<SurveyDraft> = {}): SurveyDraft => ({ id: '', title: '題名', description: '', status: 'open', questions: [dq({})], ...patch });
  it('選択肢は、1行に1つ。空の行・前後の空白は、捨てる', () => {
    expect(optionLines(' A \r\n\n  B\n   \nC')).toEqual(['A', 'B', 'C']);
  });
  it('質問のIDは、使われていない q1〜 を選ぶ', () => {
    expect(nextQuestionId([])).toBe('q1');
    expect(nextQuestionId([{ id: 'q1' }, { id: 'q3' }])).toBe('q2');
    expect(newDraftQuestion([{ id: 'q1' }]).id).toBe('q2');
    expect(emptyDraft().questions).toHaveLength(1);
  });
  it('サーバーと同じ上限で確かめる', () => {
    expect(validateSurveyDraft(draft())).toBeNull();
    expect(validateSurveyDraft(draft({ title: '  ' }))).toBe('題名を入れてください。');
    expect(validateSurveyDraft(draft({ title: 'あ'.repeat(61) }))).toBe('題名は 60 文字までです。');
    expect(validateSurveyDraft(draft({ title: 'あ'.repeat(60) }))).toBeNull();
    expect(validateSurveyDraft(draft({ description: 'あ'.repeat(301) }))).toBe('説明は 300 文字までです。');
    expect(validateSurveyDraft(draft({ questions: [] }))).toBe('質問を、1つ以上入れてください。');
    const six = Array.from({ length: 6 }, (_, i) => dq({ id: `q${i + 1}` }));
    expect(validateSurveyDraft(draft({ questions: six }))).toBe('質問は、5 問までです。');
    expect(validateSurveyDraft(draft({ questions: six.slice(0, 5) }))).toBeNull();
    expect(validateSurveyDraft(draft({ questions: [dq({ text: ' ' })] }))).toBe('1問目の質問の文を入れてください。');
    expect(validateSurveyDraft(draft({ questions: [dq({ text: 'あ'.repeat(101) })] }))).toBe('1問目の質問の文は、100 文字までです。');
  });
  it('選択肢は 2〜8個・各40字まで・重複なし。選択肢のない型では、見ない', () => {
    expect(validateSurveyDraft(draft({ questions: [dq({ optionsText: 'A' })] }))).toBe('1問目の選択肢は、2〜8 個にしてください。');
    expect(validateSurveyDraft(draft({ questions: [dq({ optionsText: Array.from({ length: 9 }, (_, i) => `o${i}`).join('\n') })] }))).toBe('1問目の選択肢は、2〜8 個にしてください。');
    expect(validateSurveyDraft(draft({ questions: [dq({ optionsText: Array.from({ length: 8 }, (_, i) => `o${i}`).join('\n') })] }))).toBeNull();
    expect(validateSurveyDraft(draft({ questions: [dq({ optionsText: `${'あ'.repeat(41)}\nB` })] }))).toBe('1問目の選択肢は、40 文字までです。');
    expect(validateSurveyDraft(draft({ questions: [dq({ optionsText: 'A\nA' })] }))).toBe('1問目の選択肢が、重なっています。');
    expect(validateSurveyDraft(draft({ questions: [dq({ type: 'text', optionsText: '' }), dq({ id: 'q2', type: 'scale5', optionsText: 'x' })] }))).toBeNull();
  });
  it('サーバーへ送る形。選択肢のない型には、選択肢を付けない。新規は id を付けない', () => {
    const p = draftToPayload(draft({ title: ' 題 ', questions: [dq({ type: 'text', optionsText: 'A\nB' }), dq({ id: 'q2', optionsText: ' A \nB' })] }));
    expect(p).toEqual({
      title: '題',
      description: '',
      status: 'open',
      questions: [
        { id: 'q1', type: 'text', text: '質問', required: false },
        { id: 'q2', type: 'single', text: '質問', required: false, options: ['A', 'B'] },
      ],
    });
    expect('id' in p).toBe(false);
    expect(draftToPayload(draft({ id: ID })).id).toBe(ID);
  });
  it('サーバーの定義 → 編集用 → 送る形で、質問の中身が変わらない(回答があっても、保存が通る)', () => {
    const [sv] = normalizeAdminSurveys([{ id: ID, title: '題', description: '', questions: QS, status: 'open', createdAt: '2026/11/22', updatedAt: '', responseCount: 3 }]);
    expect(sv.responseCount).toBe(3);
    expect(draftToPayload(draftFromSurvey(sv)).questions).toEqual(QS);
  });
  it('一覧の整え: 形の合わないものは捨てる。状態は open だけ受付中', () => {
    const list = normalizeAdminSurveys([{ id: 'bad' }, null, { id: ID, title: 't', status: 'weird', questions: [] }, 5]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'closed', responseCount: 0, questions: [] });
    expect(normalizeAdminSurveys('x')).toEqual([]);
  });
});

describe('管理者: 結果の整え', () => {
  it('サーバーの集計を読む。足りない数は 0 で埋める。文は、そのまま(エスケープしない)', () => {
    const r = normalizeResults({
      survey: { id: ID, title: '題', status: 'open' },
      responseCount: 2,
      results: [
        { id: 'q1', type: 'single', text: 'Q', answered: 2, options: [{ option: '赤', count: 2 }, { option: '青', count: 0 }] },
        { id: 'q3', type: 'scale5', text: 'S', answered: 2, counts: [0, 0, 1], average: 3.5 },
        { id: 'q5', type: 'text', text: 'T', answered: 1, texts: ['<img src=x onerror=alert(1)>'] },
        { id: 'bad', type: 'ranking', text: '?' },
      ],
    });
    expect(r?.responseCount).toBe(2);
    expect(r?.results.map((x) => x.id)).toEqual(['q1', 'q3', 'q5']);
    expect(r?.results[1].counts).toEqual([0, 0, 1, 0, 0]);
    expect(r?.results[1].average).toBe(3.5);
    expect(r?.results[2].texts).toEqual(['<img src=x onerror=alert(1)>']);
    expect(normalizeResults({ survey: null, results: [] })).toBeNull();
  });
  it('割合(分母 0 は 0)', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(2, 2)).toBe(100);
  });
});

describe('つなぎ込み(ソースの確かめ)', () => {
  it('入口: ?survey= の画面は、アプリ本体を開かず、通知の登録・アクセス記録も、しない', () => {
    const m = read('src/main.tsx');
    expect(m).toContain("lazy(() => import('./components/SurveyPage'))");
    expect(m).toContain('surveyParamFromSearch()');
    expect(m).toContain('<SurveyPage surveyId={surveyId} />');
    expect(m).toContain('if (!ticketRouteToken() && surveyParamFromSearch() === null) {');
  });
  it('管理者コンソールに「アンケート」のタブ(通知・ご意見のタブと同じ作り)', () => {
    const m = read('src/components/AdminConsoleModal.tsx');
    expect(m).toContain("{activeTab === 'surveys' && <AdminSurveyPanel />}");
    expect(m).toContain("onClick={() => setActiveTab('surveys')}");
    expect(m).toContain('<span>アンケート</span>');
  });
  it('管理の4つの action に、管理トークンを付ける。リンクのコピーのボタンがある', () => {
    const src = read('src/components/AdminSurveyPanel.tsx');
    ['adminListSurveys', 'adminSaveSurvey', 'adminDeleteSurvey', 'adminSurveyResults'].forEach((a) => expect(src).toContain(`'${a}'`));
    expect(src.match(/adminToken: getAdminToken\(\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(src).toContain('お知らせに貼る用のリンクをコピー');
    expect(src).toContain('buildSurveyUrl(id)');
  });
  it('管理パネルの call の既定値は、外に置いた1つの関数(中に書くと、描きなおすたびに一覧を読み直し続ける)', () => {
    const src = read('src/components/AdminSurveyPanel.tsx');
    expect(src).toContain('({ call = defaultCall }) => {');
    expect(src).toContain('const defaultCall: SurveyCall = ');
    expect(src).not.toMatch(/call = \(a, p\)/);
  });
  it('回答・結果の文は、HTML として読まない(dangerouslySetInnerHTML を使わない)。答える画面は、会員の情報を送らない', () => {
    for (const f of ['src/components/AdminSurveyPanel.tsx', 'src/components/SurveyPage.tsx', 'src/utils/survey.ts']) expect(read(f)).not.toContain('dangerouslySetInnerHTML');
    for (const f of ['src/components/SurveyPage.tsx', 'src/utils/survey.ts']) {
      const src = read(f);
      expect(src).not.toMatch(/sessionToken|memberId|email/i);
    }
  });
});

// ---- 本物のサーバー(gas/Code.gs)に、アプリの送る形が、通ること ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const gasSource = read('gas/Code.gs');
const TOKEN = 'test-admin-token-xyz';

const makeGas = (): Gas => {
  const sheets: Record<string, unknown[][]> = {};
  const cache: Record<string, string> = {};
  const props: Record<string, string> = { ADMIN_TOKEN: TOKEN, SESSION_SECRET: 'secret-for-tests' };
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    ContentService: {},
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => void (props[k] = v) }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string) => void (cache[k] = v),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Utilities: {
      formatDate: () => '2026/11/22 12:00:00',
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (payload: string, secret: string) => Array.from(crypto.createHmac('sha256', secret).update(payload).digest()),
      base64EncodeWebSafe: (bytes: number[]) => Buffer.from(bytes.map((b) => b & 0xff)).toString('base64url'),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(gasSource, ctx);
  ctx.createJsonResponse = (d: unknown) => d;
  const chain = { setBackground: () => chain, setFontColor: () => chain, setFontWeight: () => chain, setNumberFormat: () => chain };
  const sheetOf = (name: string) => {
    const g = sheets[name];
    return {
      getLastRow: () => g.length,
      appendRow: (r: unknown[]) => void g.push([...r]),
      setFrozenRows: () => undefined,
      getRange: (r: number, c: number, nr = 1, nc = 1) => ({
        ...chain,
        getValues: () => g.slice(r - 1, r - 1 + nr).map((row) => Array.from({ length: nc }, (_, i) => row[c - 1 + i] ?? '')),
        setValues: (vals: unknown[][]) => vals.forEach((vr, ri) => vr.forEach((v, ci) => void (g[r - 1 + ri][c - 1 + ci] = v))),
      }),
    };
  };
  ctx.getDataSpreadsheet = () => ({
    getSheetByName: (n: string) => (sheets[n] ? sheetOf(n) : null),
    insertSheet: (n: string) => {
      sheets[n] = [];
      return sheetOf(n);
    },
  });
  return ctx;
};

describe('本物のサーバーとの突き合わせ', () => {
  let gas: Gas;
  // アプリの callGas と同じく、doPost に JSON を渡して、JSON で受け取る
  const call: SurveyCall = async (action, payload) => JSON.parse(JSON.stringify(gas.doPost({ postData: { contents: JSON.stringify({ action, ...payload }) } })));
  beforeEach(() => {
    gas = makeGas();
  });

  const draft: SurveyDraft = {
    id: '',
    title: '利用アンケート',
    description: 'ご協力ください',
    status: 'open',
    questions: [
      { id: 'q1', type: 'single', text: '好きな色は', required: true, optionsText: '赤\n青\n緑' },
      { id: 'q2', type: 'multi', text: '使う路線', required: false, optionsText: '神埼線\n土浦線' },
      { id: 'q3', type: 'scale5', text: '満足度は', required: true, optionsText: '' },
      { id: 'q4', type: 'singleOther', text: 'きっかけは', required: false, optionsText: '広告\n友人' },
      { id: 'q5', type: 'text', text: 'ご意見', required: false, optionsText: '' },
    ],
  };

  it('作る → 読む → 答える → 結果。アプリの形が、そのまま通り、集計に出る。回答後は、質問を変えられない', async () => {
    expect(validateSurveyDraft(draft)).toBeNull();
    const saved = await call('adminSaveSurvey', { adminToken: TOKEN, survey: draftToPayload(draft) });
    expect(saved.status).toBe('success');
    const id = saved.id as string;
    expect(id).toMatch(/^s[0-9a-f]{12}$/);

    const loaded = await fetchSurvey(id, call);
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.survey.questions).toHaveLength(5);

    const inputs: AnswerInputs = {
      q1: { ...emptyAnswerInput(), choice: '青' },
      q2: { ...emptyAnswerInput(), choices: ['土浦線', '神埼線'] },
      q3: { ...emptyAnswerInput(), scale: 5 },
      q4: { ...emptyAnswerInput(), otherOn: true, other: '口コミ <b>' },
      q5: { ...emptyAnswerInput(), text: '  よかった  ' },
    };
    expect(validateAnswerInputs(loaded.survey.questions, inputs)).toBeNull();
    const answers = buildAnswers(loaded.survey.questions, inputs);
    expect(await submitSurveyAnswers(id, answers, call)).toEqual({ kind: 'done' });
    // 同じ端末(同じ印)の2回目は、サーバーが断る
    expect(await submitSurveyAnswers(id, answers, call)).toEqual({ kind: 'end', reason: 'already_answered' });

    const res = normalizeResults(await call('adminSurveyResults', { adminToken: TOKEN, surveyId: id }));
    expect(res?.responseCount).toBe(1);
    expect(res?.results[0].options.find((o) => o.option === '青')?.count).toBe(1);
    expect(res?.results[1].options.map((o) => o.count)).toEqual([1, 1]);
    expect(res?.results[2].average).toBe(5);
    expect(res?.results[3].others).toEqual(['口コミ <b>']);
    expect(res?.results[4].texts).toEqual(['よかった']);

    // 回答があるアンケートを、編集画面の形のまま保存し直しても、通る(質問は、変わらない)
    const [sv] = normalizeAdminSurveys((await call('adminListSurveys', { adminToken: TOKEN })).surveys);
    expect(sv.responseCount).toBe(1);
    const again = await call('adminSaveSurvey', { adminToken: TOKEN, survey: draftToPayload({ ...draftFromSurvey(sv), title: '題名を直した', status: 'closed' }) });
    expect(again.status).toBe('success');
    // 質問を変えると、has_answers で断られる(サーバーの文が、そのまま出る)
    const changed = draftFromSurvey(sv);
    changed.questions[0] = { ...changed.questions[0], text: '変えた' };
    const refused = await call('adminSaveSurvey', { adminToken: TOKEN, survey: draftToPayload(changed) });
    expect(refused).toMatchObject({ status: 'error', code: 'has_answers' });
    // 受付を終えると、読み込みも、回答も、終了の画面
    expect(await fetchSurvey(id, call)).toEqual({ kind: 'end', reason: 'closed' });
    expect(await submitSurveyAnswers(id, answers, call)).toEqual({ kind: 'end', reason: 'closed' });
  });

  it('必須が抜けた答えは、アプリの確認で止まる。素通りして送っても、サーバーが断り、アプリは、サーバーの文を出す', async () => {
    const id = (await call('adminSaveSurvey', { adminToken: TOKEN, survey: draftToPayload(draft) })).id as string;
    const loaded = await fetchSurvey(id, call);
    if (loaded.kind !== 'ok') throw new Error('not ok');
    expect(validateAnswerInputs(loaded.survey.questions, {})).toEqual({ index: 0, message: '1問目は、必須です。答えてください。' });
    expect(await submitSurveyAnswers(id, {}, call)).toEqual({ kind: 'error', message: '1問目は、必須です。' });
  });

  it('見つからない・消した・形の変なIDは、終了の画面', async () => {
    expect(await fetchSurvey('s000000000000', call)).toEqual({ kind: 'end', reason: 'not_found' });
    const id = (await call('adminSaveSurvey', { adminToken: TOKEN, survey: draftToPayload(draft) })).id as string;
    expect((await call('adminDeleteSurvey', { adminToken: TOKEN, id })).status).toBe('success');
    expect(await fetchSurvey(id, call)).toEqual({ kind: 'end', reason: 'not_found' });
    expect(await submitSurveyAnswers(id, { q1: '赤', q3: 3 }, call)).toEqual({ kind: 'end', reason: 'not_found' });
  });

  it('管理者トークンが無いと、一覧・結果は断られる(アプリは、サーバーの文を出す)', async () => {
    const res = await call('adminListSurveys', { adminToken: '' });
    expect(res.status).toBe('error');
    expect(typeof res.message === 'string' || res.code === 'admin').toBe(true);
  });
});
