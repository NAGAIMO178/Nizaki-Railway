// アンケート(サーバー gas/Code.gs): 匿名・結果は管理者だけ。作りものの台帳・キャッシュ・ロックで動かす(本番には、何も書き込まない)。
// 定義の検査(質問5問まで・型5つ・選択肢)・回答の検査(各型・必須・範囲)・二重回答・closed・消した扱い・回数制限・管理者トークン・集計・回答後の質問変更の拒否・匿名(印のハッシュ)を調べる。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');
const TOKEN = 'test-admin-token-xyz';
const MARK = 'abcdefghijklmnop1234'; // 端末の印(英数字16〜64字)

let gas: Gas;
let sheets: Record<string, unknown[][]>;
let cache: Record<string, string>;
let props: Record<string, string>;
let lockFails: boolean;
let logs: string[];

type R = { status: string; code?: string; message?: string; id?: string; survey?: Record<string, unknown>; surveys?: Array<Record<string, unknown>>; responseCount?: number; results?: Array<Record<string, any>> };
const Q = {
  single: { id: 'q1', type: 'single', text: '好きな色は', options: ['赤', '青', '緑'], required: true },
  multi: { id: 'q2', type: 'multi', text: '使う路線(複数)', options: ['神埼線', '土浦線', '環状線'], required: false },
  scale: { id: 'q3', type: 'scale5', text: '満足度は', required: true },
  other: { id: 'q4', type: 'singleOther', text: 'きっかけは', options: ['広告', '友人'], required: false },
  text: { id: 'q5', type: 'text', text: 'ご意見', required: false },
};
const ALL = [Q.single, Q.multi, Q.scale, Q.other, Q.text];
const mk = (n: number) => 'mark' + String(n).padStart(12, '0') + 'xyz';
const save = (s: Record<string, unknown>, token: unknown = TOKEN) => gas.handleAdminSaveSurvey(token, s) as R;
const create = (over: Record<string, unknown> = {}) => save({ title: '利用アンケート', description: 'ご協力ください', questions: ALL, status: 'open', ...over }).id as string;
const submit = (id: string, answers: unknown, mark = MARK) => gas.handleSubmitSurvey(id, mark, answers) as R;
const valid = { q1: '赤', q3: 4 };
const results = (id: string) => gas.handleAdminSurveyResults(TOKEN, id) as R;
const surveyRows = () => (sheets['アンケート'] ?? []).slice(1);
const answerRows = () => (sheets['アンケート回答'] ?? []).slice(1);
const answerSheet = () => (gas.getOrCreateSurveyAnswerSheet(), sheets['アンケート回答']); // まだ無ければ作る

beforeEach(() => {
  sheets = {};
  cache = {};
  props = { ADMIN_TOKEN: TOKEN, SESSION_SECRET: 'secret-for-tests' };
  lockFails = false;
  logs = [];
  const ctx: Gas = {
    Logger: { log: (m: string) => void logs.push(m) },
    console: { log: (m: string) => void logs.push(String(m)), error: (m: string) => void logs.push(String(m)) },
    ContentService: {},
    LockService: { getScriptLock: () => ({ waitLock: () => { if (lockFails) throw new Error('busy'); }, releaseLock: () => undefined }) },
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
  vm.runInContext(source, ctx);
  gas = ctx;
  gas.createJsonResponse = (d: unknown) => d;
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
  gas.getDataSpreadsheet = () => ({
    getSheetByName: (n: string) => (sheets[n] ? sheetOf(n) : null),
    insertSheet: (n: string) => {
      sheets[n] = [];
      return sheetOf(n);
    },
  });
});

describe('① 定義の検査(adminSaveSurvey)', () => {
  const refused = (s: Record<string, unknown>, text: string) => {
    const r = save({ title: 't', questions: [Q.single], ...s });
    expect(r.status, JSON.stringify(s)).toBe('error');
    expect(r.code).toBe('invalid');
    expect(r.message).toContain(text);
    expect(sheets['アンケート'] === undefined || surveyRows().length === 0).toBe(true);
  };

  it('5つの型が、すべて通る。シート「アンケート」「アンケート回答」は、自動で作る', () => {
    const id = create();
    expect(id).toMatch(/^s[0-9a-f]{12}$/);
    expect(sheets['アンケート'][0]).toEqual(['アンケートID', '題名', '説明', '質問', '状態', '作成日時', '更新日時', '削除']);
    const got = (gas.handleGetSurvey(id) as R).survey!;
    expect((got.questions as Array<{ type: string }>).map((q) => q.type)).toEqual(['single', 'multi', 'scale5', 'singleOther', 'text']);
    submit(id, valid);
    expect(sheets['アンケート回答'][0]).toEqual(['回答ID', 'アンケートID', '回答日時', '端末の印(ハッシュ)', '回答']);
  });

  it('質問は、1〜5問。0問・6問・配列でないものは、断る', () => {
    refused({ questions: [] }, '1つ以上');
    refused({ questions: undefined }, '1つ以上');
    refused({ questions: 'x' }, '1つ以上');
    refused({ questions: [...ALL, { id: 'q6', type: 'text', text: '6問目' }] }, '5 問まで');
    expect(save({ title: 't', questions: ALL }).status).toBe('success');
  });

  it('型・ID・文の検査', () => {
    refused({ questions: [{ ...Q.single, type: 'rating' }] }, '型');
    refused({ questions: [{ ...Q.single, type: undefined }] }, '型');
    refused({ questions: [{ ...Q.single, id: '' }] }, 'ID');
    refused({ questions: [{ ...Q.single, id: 'a b' }] }, 'ID');
    refused({ questions: [{ ...Q.single, id: 'x'.repeat(21) }] }, 'ID');
    refused({ questions: [Q.single, { ...Q.text, id: 'q1' }] }, '重なって');
    refused({ questions: [{ ...Q.single, text: '   ' }] }, '質問の文');
    refused({ questions: [{ ...Q.single, text: 'あ'.repeat(101) }] }, '100 文字');
    refused({ questions: [{ ...Q.single, required: 'yes' }] }, '必須');
    refused({ questions: ['x'] }, '質問が正しく');
    refused({ questions: [null] }, '質問が正しく');
  });

  it('選択肢: 2〜8個・各40字まで・重複と空は断る。選択肢のない型の options は、捨てる', () => {
    refused({ questions: [{ ...Q.single, options: ['赤'] }] }, '2〜8');
    refused({ questions: [{ ...Q.single, options: Array.from({ length: 9 }, (_, i) => `o${i}`) }] }, '2〜8');
    refused({ questions: [{ ...Q.single, options: undefined }] }, '2〜8');
    refused({ questions: [{ ...Q.single, options: ['赤', '赤'] }] }, '重なって');
    refused({ questions: [{ ...Q.single, options: ['赤', ' '] }] }, '空');
    refused({ questions: [{ ...Q.single, options: ['赤', 'あ'.repeat(41)] }] }, '40 文字');
    refused({ questions: [{ ...Q.single, options: ['赤', 5] }] }, '空');
    expect(save({ title: 't', questions: [{ ...Q.single, options: Array.from({ length: 8 }, (_, i) => `o${i}`) }] }).status).toBe('success');
    expect(save({ title: 't', questions: [{ ...Q.single, options: ['あ'.repeat(40), 'b'] }] }).status).toBe('success');
    const id = save({ title: 'u', questions: [{ ...Q.scale, options: ['x', 'y'] }, { ...Q.text, options: ['x', 'y'] }] }).id as string;
    const q = (gas.handleGetSurvey(id) as R).survey!.questions as Array<Record<string, unknown>>;
    expect(q.every((x) => x.options === undefined)).toBe(true);
  });

  it('題名・説明・状態の検査', () => {
    refused({ title: '  ' }, '題名');
    refused({ title: 'あ'.repeat(61) }, '60 文字');
    refused({ description: 'あ'.repeat(301) }, '300 文字');
    refused({ description: 5 }, '説明');
    refused({ status: 'draft' }, '状態');
    expect(save({ title: 'あ'.repeat(60), description: 'い'.repeat(300), questions: [Q.single] }).status).toBe('success');
    expect(save({ title: 't', questions: [Q.single] }).status).toBe('success'); // 説明なし・状態なし(open)
    expect(gas.handleAdminSaveSurvey(TOKEN, null).code).toBe('invalid');
    expect(gas.handleAdminSaveSurvey(TOKEN, 'x').code).toBe('invalid');
  });

  it('式になる文字で始まる題名・説明は、先頭に「\'」を付けて書く', () => {
    create({ title: '=HYPERLINK("http://x")', description: '+cmd' });
    expect(surveyRows()[0][1]).toBe('\'=HYPERLINK("http://x")');
    expect(surveyRows()[0][2]).toBe("'+cmd");
  });
});

describe('② 公開用 getSurvey', () => {
  it('open のアンケートの、題名・説明・質問だけを返す(状態・日時・ID以外の管理用の中身は、返さない)', () => {
    const id = create();
    const r = gas.handleGetSurvey(id) as R;
    expect(r.status).toBe('success');
    expect(Object.keys(r.survey!).sort()).toEqual(['description', 'id', 'questions', 'title']);
    expect(r.survey!.title).toBe('利用アンケート');
    expect(r.survey!.description).toBe('ご協力ください');
    const qs = r.survey!.questions as Array<Record<string, unknown>>;
    expect(Object.keys(qs[0]).sort()).toEqual(['id', 'options', 'required', 'text', 'type']);
    expect(Object.keys(qs[2]).sort()).toEqual(['id', 'required', 'text', 'type']);
    expect(JSON.stringify(r.survey)).not.toMatch(/responseCount|createdAt|updatedAt|"status"/);
  });

  it('closed は code: closed(受付を終了しました)。無い・消した・IDの形が変は、not_found', () => {
    const id = create({ status: 'closed' });
    const r = gas.handleGetSurvey(id) as R;
    expect(r.code).toBe('closed');
    expect(r.message).toContain('受付を終了しました');
    expect((gas.handleGetSurvey('s000000000000') as R).code).toBe('not_found');
    for (const bad of ['', undefined, null, '../x', 's12', 5]) expect((gas.handleGetSurvey(bad) as R).code, String(bad)).toBe('not_found');
    const open = create();
    gas.handleAdminDeleteSurvey(TOKEN, open);
    expect((gas.handleGetSurvey(open) as R).code).toBe('not_found');
  });
});

describe('③ 回答の検査(submitSurvey)', () => {
  let id: string;
  const bad = (answers: unknown, text: string, mark = mk(Math.floor(Math.random() * 1e6))) => {
    const r = submit(id, answers, mark);
    expect(r.status, JSON.stringify(answers)).toBe('error');
    expect(r.code).toBe('invalid');
    expect(r.message).toContain(text);
    expect(answerRows()).toHaveLength(0);
  };
  beforeEach(() => {
    id = create();
  });

  it('必須だけ答えれば通る。すべて答えても通る。回答は、整えて、JSON で保存する', () => {
    expect(submit(id, valid, mk(1)).status).toBe('success');
    expect(submit(id, { q1: '青', q2: ['神埼線', '環状線'], q3: 5, q4: { other: '  テレビ  ' }, q5: ' よかった ' }, mk(2)).status).toBe('success');
    expect(JSON.parse(answerRows()[0][4] as string)).toEqual({ q1: '赤', q3: 4 });
    expect(JSON.parse(answerRows()[1][4] as string)).toEqual({ q1: '青', q2: ['神埼線', '環状線'], q3: 5, q4: { other: 'テレビ' }, q5: 'よかった' });
  });

  it('必須の質問が、答えられていない・空のときは、断る', () => {
    bad({ q3: 4 }, '1問目は、必須');
    bad({ q1: null, q3: 4 }, '1問目は、必須');
    bad({ q1: '赤' }, '3問目は、必須');
  });

  it('single: 選択肢にない・文字でないものは、断る', () => {
    bad({ ...valid, q1: '黄' }, '選択肢にありません');
    bad({ ...valid, q1: 3 }, '答えが正しくありません');
    bad({ ...valid, q1: ['赤'] }, '答えが正しくありません');
  });

  it('multi: 選択肢にない・重複・配列でないものは、断る。空の配列は、任意なら、答えなし', () => {
    bad({ ...valid, q2: ['ない路線'] }, '選択肢にありません');
    bad({ ...valid, q2: ['神埼線', '神埼線'] }, '重なっています');
    bad({ ...valid, q2: '神埼線' }, '答えが正しくありません');
    bad({ ...valid, q2: [3] }, '選択肢にありません');
    expect(submit(id, { ...valid, q2: [] }, mk(7)).status).toBe('success');
    expect(JSON.parse(answerRows()[0][4] as string).q2).toBeUndefined();
  });

  it('scale5: 1〜5 の整数だけ。0・6・小数・文字・負は、断る', () => {
    for (const v of [0, 6, 3.5, '3', -1, 100, NaN, true]) bad({ q1: '赤', q3: v }, '1〜5 の整数');
    for (const v of [1, 2, 3, 4, 5]) expect(submit(id, { q1: '赤', q3: v }, mk(100 + v)).status).toBe('success');
  });

  it('singleOther: 選択肢か「その他」の、どちらか1つ。両方・知らない項目・選択肢にない・長すぎる(100字まで)は、断る', () => {
    bad({ ...valid, q4: { choice: '広告', other: '雑誌' } }, 'どちらか1つ');
    bad({ ...valid, q4: { choice: 'ない' } }, '選択肢にありません');
    bad({ ...valid, q4: { other: 'あ'.repeat(101) } }, '100 文字');
    bad({ ...valid, q4: { extra: 'x' } }, '答えが正しくありません');
    bad({ ...valid, q4: '広告' }, '答えが正しくありません');
    bad({ ...valid, q4: ['広告'] }, '答えが正しくありません');
    bad({ ...valid, q4: { other: 5 } }, '答えが正しくありません');
    expect(submit(id, { ...valid, q4: { choice: '友人' } }, mk(1)).status).toBe('success');
    expect(submit(id, { ...valid, q4: { other: 'あ'.repeat(100) } }, mk(2)).status).toBe('success');
    expect(submit(id, { ...valid, q4: { other: '   ' } }, mk(3)).status).toBe('success'); // 空の「その他」は、答えなし(任意)
    expect(JSON.parse(answerRows()[2][4] as string).q4).toBeUndefined();
  });

  it('text: 200字まで。長いものは断る。空は、任意なら、答えなし', () => {
    bad({ ...valid, q5: 'あ'.repeat(201) }, '200 文字');
    bad({ ...valid, q5: 5 }, '答えが正しくありません');
    expect(submit(id, { ...valid, q5: 'あ'.repeat(200) }, mk(1)).status).toBe('success');
    expect(submit(id, { ...valid, q5: '   ' }, mk(2)).status).toBe('success');
  });

  it('質問にない項目・形が違う回答は、断る', () => {
    bad({ ...valid, q9: 'x' }, '質問にない項目');
    bad({ ...valid, constructor: 'x' }, '質問にない項目');
    bad([], '回答の形');
    bad('x', '回答の形');
    bad(null, '回答の形');
    bad(undefined, '回答の形');
  });

  it('質問のID が、もとからある名前(constructor など)でも、取り違えない', () => {
    const sid = save({ title: 'p', questions: [{ id: 'constructor', type: 'text', text: '文', required: false }, { id: 'toString', type: 'scale5', text: '数', required: false }] }).id as string;
    expect(submit(sid, { constructor: '答え', toString: 3 }, mk(1)).status).toBe('success');
    expect(submit(sid, { hasOwnProperty: 'x' }, mk(2)).code).toBe('invalid');
    const r = results(sid);
    expect(r.results![0].texts).toEqual(['答え']);
    expect(r.results![1].counts).toEqual([0, 0, 1, 0, 0]);
  });

  it('任意の質問は、答えなくてよい。必須でも、text・multi・singleOther が空なら、必須として断る', () => {
    const sid = save({ title: 'r', questions: [{ ...Q.text, required: true }, { ...Q.multi, id: 'm', required: true }, { ...Q.other, id: 'o', required: true }] }).id as string;
    for (const a of [{ q5: '', m: ['神埼線'], o: { choice: '広告' } }, { q5: 'x', m: [], o: { choice: '広告' } }, { q5: 'x', m: ['神埼線'], o: { other: ' ' } }]) {
      expect(submit(sid, a, mk(Math.random() * 1e6 | 0)).code).toBe('invalid');
    }
    expect(submit(sid, { q5: 'x', m: ['神埼線'], o: { choice: '広告' } }, mk(5)).status).toBe('success');
  });
});

describe('④ 二重回答・closed・消した扱い・不正な印', () => {
  it('同じ印の2回目は、already_answered。別の印・別のアンケートなら通る', () => {
    const a = create();
    const b = create({ title: '別のアンケート' });
    expect(submit(a, valid).status).toBe('success');
    const second = submit(a, valid);
    expect(second.code).toBe('already_answered');
    expect(answerRows()).toHaveLength(1);
    expect(submit(a, valid, mk(2)).status).toBe('success');
    expect(submit(b, valid).status).toBe('success'); // 同じ印でも、別のアンケートは、答えられる
  });

  it('closed・消した・無いアンケートには、答えられない(何も書かない)', () => {
    const closed = create({ status: 'closed' });
    expect(submit(closed, valid).code).toBe('closed');
    const gone = create();
    gas.handleAdminDeleteSurvey(TOKEN, gone);
    expect(submit(gone, valid).code).toBe('not_found');
    expect(submit('s000000000000', valid).code).toBe('not_found');
    expect(submit('bad', valid).code).toBe('not_found');
    expect(answerRows()).toHaveLength(0);
  });

  it('端末の印の形が変(短い・記号・文字でない)は、断る', () => {
    const id = create();
    for (const m of ['', 'short', 'abc-defghijklmnop12', 'a'.repeat(65), 12345678901234567, undefined, null]) {
      cache = {};
      expect((gas.handleSubmitSurvey(id, m, valid) as R).code, String(m)).toBe('invalid');
    }
    expect(answerRows()).toHaveLength(0);
  });

  it('ロックが取れないときは、busy(書かない)', () => {
    const id = create();
    lockFails = true;
    expect(submit(id, valid).code).toBe('busy');
    lockFails = false;
    expect(answerRows()).toHaveLength(0);
  });

  it('1アンケートに、5000件まで。上限を超える回答は、full', () => {
    const id = create();
    submit(id, valid, mk(0));
    const fill = Array.from({ length: 4999 }, (_, i) => ['a' + i, id, 't', 'hash' + i, '{}']);
    answerSheet().push(...fill);
    expect(answerRows()).toHaveLength(5000);
    const r = submit(id, valid, mk(1));
    expect(r.code).toBe('full');
    expect(answerRows()).toHaveLength(5000);
    // ほかのアンケートの回答は、数えない
    const other = create({ title: 'ほか' });
    expect(submit(other, valid, mk(1)).status).toBe('success');
  });
});

describe('⑤ 回数の制限', () => {
  it('同じ印で、1時間に20回まで(検査で断られる試しも数える)。21回目は、rate_limited', () => {
    const id = create();
    for (let i = 0; i < 20; i++) expect(submit(id, { q1: '黄' }).code).toBe('invalid');
    expect(submit(id, valid).code).toBe('rate_limited');
    expect(answerRows()).toHaveLength(0);
    expect(submit(id, valid, mk(2)).status).toBe('success'); // 別の印は、数えない
  });

  it('全体で、1時間に600回まで', () => {
    const id = create();
    cache['survey_rate_all'] = '600';
    expect(submit(id, valid).code).toBe('rate_limited');
  });
});

describe('⑥ 匿名(個人を特定できる情報を、残さない)', () => {
  it('端末の印の元の値は、シートにも、ログにも、キャッシュにも、残らない。保存されるのは、アンケートごとのハッシュ', () => {
    const a = create();
    const b = create({ title: '別' });
    submit(a, valid);
    submit(b, valid);
    const dump = JSON.stringify([sheets, cache, logs]);
    expect(dump).not.toContain(MARK);
    const hashA = answerRows()[0][3] as string;
    const hashB = answerRows()[1][3] as string;
    expect(hashA).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashA).not.toBe(hashB); // 別のアンケートと、結びつけられない
    expect(hashA).toBe(gas.surveyDeviceHash(a, MARK)); // 同じ印は、同じハッシュ(二重回答の判定に使う)
  });

  it('回答の行は、ID・アンケートID・日時・ハッシュ・回答だけ。会員ID・メール・IP の列は無い', () => {
    const id = create();
    submit(id, valid);
    expect(sheets['アンケート回答'][0]).toHaveLength(5);
    expect(answerRows()[0]).toHaveLength(5);
    expect(JSON.stringify(answerRows()[0])).not.toMatch(/M\d{4}|@|\d+\.\d+\.\d+\.\d+/);
  });
});

describe('⑦ 管理者の確かめ(サーバー側)', () => {
  it('トークンが違う・無いときは、一覧・保存・削除・結果の、すべてを断り、何も変えない', () => {
    const id = create();
    submit(id, valid);
    const before = JSON.stringify(sheets);
    for (const bad of ['', 'wrong', undefined, null]) {
      cache = {};
      expect((gas.handleAdminListSurveys(bad) as R).code).toBe('admin');
      expect((gas.handleAdminSaveSurvey(bad, { title: 'x', questions: [Q.single] }) as R).code).toBe('admin');
      expect((gas.handleAdminDeleteSurvey(bad, id) as R).code).toBe('admin');
      expect((gas.handleAdminSurveyResults(bad, id) as R).code).toBe('admin');
    }
    expect(JSON.stringify(sheets)).toBe(before);
  });

  it('doPost の入口: 公開用はトークンなしで通り、管理用はトークンが要る', () => {
    const post = (body: unknown) => gas.doPost({ postData: { contents: JSON.stringify(body) } });
    const saved = post({ action: 'adminSaveSurvey', adminToken: TOKEN, survey: { title: 't', questions: [Q.single] } });
    expect(saved.status).toBe('success');
    expect(post({ action: 'getSurvey', surveyId: saved.id }).status).toBe('success');
    expect(post({ action: 'submitSurvey', surveyId: saved.id, deviceMark: MARK, answers: { q1: '赤' } }).status).toBe('success');
    expect(post({ action: 'adminListSurveys' }).code).toBe('admin');
    expect(post({ action: 'adminSaveSurvey', survey: { title: 't', questions: [Q.single] } }).code).toBe('admin');
    expect(post({ action: 'adminDeleteSurvey', id: saved.id }).code).toBe('admin');
    expect(post({ action: 'adminSurveyResults', surveyId: saved.id }).code).toBe('admin');
    expect(post({ action: 'adminSurveyResults', adminToken: TOKEN, surveyId: saved.id }).responseCount).toBe(1);
  });
});

describe('⑧ 一覧・編集・削除', () => {
  it('一覧: 状態と回答数つき。新しい作成が先。消したアンケートは、出ない', () => {
    const a = create({ title: 'A' });
    const b = create({ title: 'B', status: 'closed' });
    const c = create({ title: 'C' });
    submit(a, valid, mk(1));
    submit(a, valid, mk(2));
    gas.handleAdminDeleteSurvey(TOKEN, c);
    const list = (gas.handleAdminListSurveys(TOKEN) as R).surveys!;
    expect(list.map((s) => s.title)).toEqual(['B', 'A']);
    expect(list.map((s) => [s.status, s.responseCount])).toEqual([['closed', 0], ['open', 2]]);
    expect(list[1].questions).toBeDefined();
    expect(b).toBeTruthy();
  });

  it('回答が無いうちは、質問も、変えられる', () => {
    const id = create();
    const r = save({ id, title: '新しい題名', description: '', questions: [Q.text], status: 'open' });
    expect(r.status).toBe('success');
    expect(((gas.handleGetSurvey(id) as R).survey!.questions as unknown[]).length).toBe(1);
  });

  it('回答が1件でもあれば、質問の中身(型・選択肢・数・文・必須)の変更は断る。題名・説明・状態の変更は通る。同じ質問のままの保存も通る', () => {
    const id = create();
    submit(id, valid);
    const changes: Array<Record<string, unknown>[]> = [
      [Q.single],
      ALL.map((q) => (q.id === 'q1' ? { ...q, options: ['赤', '青', '緑', '黄'] } : q)),
      ALL.map((q) => (q.id === 'q3' ? { ...q, type: 'text' } : q)),
      ALL.map((q) => (q.id === 'q5' ? { ...q, text: '変えた文' } : q)),
      ALL.map((q) => (q.id === 'q5' ? { ...q, required: true } : q)),
      [...ALL].reverse(),
    ];
    for (const questions of changes) {
      const r = save({ id, title: '利用アンケート', questions });
      expect(r.code).toBe('has_answers');
      expect(r.message).toContain('回答がすでにあるため');
    }
    expect(save({ id, title: '題名だけ変更', description: '説明も変更', questions: ALL, status: 'closed' }).status).toBe('success');
    const row = surveyRows()[0];
    expect(row[1]).toBe('題名だけ変更');
    expect(row[2]).toBe('説明も変更');
    expect(row[4]).toBe('closed');
    expect(JSON.parse(row[3] as string)).toHaveLength(5);
  });

  it('編集: 見つからない・IDの形が変は、断る', () => {
    expect(save({ id: 's000000000000', title: 't', questions: [Q.single] }).code).toBe('not_found');
    expect(save({ id: 'bad', title: 't', questions: [Q.single] }).code).toBe('invalid');
  });

  it('削除は「消した扱い」(削除の列に 1)。回答は、残す。公開用からは、見えなくなる', () => {
    const id = create();
    submit(id, valid);
    expect((gas.handleAdminDeleteSurvey(TOKEN, id) as R).status).toBe('success');
    expect(surveyRows()[0][7]).toBe('1');
    expect(answerRows()).toHaveLength(1);
    expect((gas.handleGetSurvey(id) as R).code).toBe('not_found');
    expect((gas.handleAdminDeleteSurvey(TOKEN, id) as R).code).toBe('not_found');
    expect((gas.handleAdminDeleteSurvey(TOKEN, 'bad') as R).code).toBe('invalid');
    expect(results(id).code).toBe('not_found');
  });
});

describe('⑨ 集計(adminSurveyResults)', () => {
  it('回答数と、質問ごとの集計(選択肢ごとの数・その他の一覧・1〜5ごとの数と平均・文の一覧)が、正しい', () => {
    const id = create();
    const A = [
      { q1: '赤', q2: ['神埼線', '土浦線'], q3: 5, q4: { choice: '広告' }, q5: '1つめ' },
      { q1: '赤', q2: ['神埼線'], q3: 4, q4: { other: 'テレビ' }, q5: '2つめ' },
      { q1: '青', q3: 4, q4: { other: 'ラジオ' } },
      { q1: '緑', q2: [], q3: 1, q4: { choice: '友人' }, q5: '<script>alert(1)</script>' },
    ];
    A.forEach((a, i) => expect(submit(id, a, mk(i)).status).toBe('success'));
    const r = results(id);
    expect(r.status).toBe('success');
    expect(r.responseCount).toBe(4);
    expect(r.survey).toEqual({ id, title: '利用アンケート', description: 'ご協力ください', status: 'open' });
    const [q1, q2, q3, q4, q5] = r.results!;
    expect(q1.options).toEqual([{ option: '赤', count: 2 }, { option: '青', count: 1 }, { option: '緑', count: 1 }]);
    expect(q1.answered).toBe(4);
    expect(q2.options).toEqual([{ option: '神埼線', count: 2 }, { option: '土浦線', count: 1 }, { option: '環状線', count: 0 }]);
    expect(q2.answered).toBe(2);
    expect(q3.counts).toEqual([1, 0, 0, 2, 1]);
    expect(q3.average).toBe(3.5); // (5+4+4+1)/4
    expect(q3.answered).toBe(4);
    expect(q4.options).toEqual([{ option: '広告', count: 1 }, { option: '友人', count: 1 }]);
    expect(q4.otherCount).toBe(2);
    expect(q4.others).toEqual(['ラジオ', 'テレビ']); // 新しい順
    expect(q5.texts).toEqual(['<script>alert(1)</script>', '2つめ', '1つめ']); // 新しい順。文は、そのまま(エスケープしない)
    expect(q5.answered).toBe(3);
  });

  it('回答が無いときは、数は 0・平均は null・一覧は空', () => {
    const id = create();
    const r = results(id);
    expect(r.responseCount).toBe(0);
    expect(r.results![2].average).toBeNull();
    expect(r.results![2].counts).toEqual([0, 0, 0, 0, 0]);
    expect(r.results![4].texts).toEqual([]);
    expect(r.results![3].others).toEqual([]);
  });

  it('自由記述・その他の一覧は、新しい順に最大200件', () => {
    const id = create();
    const rows = Array.from({ length: 250 }, (_, i) => ['a' + i, id, 't', 'h' + i, JSON.stringify({ q1: '赤', q3: 3, q5: '文' + i })]);
    answerSheet().push(...rows);
    const r = results(id);
    expect(r.responseCount).toBe(250);
    expect(r.results![4].texts).toHaveLength(200);
    expect(r.results![4].texts![0]).toBe('文249');
    expect(r.results![4].answered).toBe(250);
  });

  it('ほかのアンケートの回答・壊れた行は、数えない。見つからないときは、not_found', () => {
    const a = create();
    const b = create({ title: '別' });
    submit(a, valid, mk(1));
    submit(b, valid, mk(1));
    answerSheet().push(['x', a, 't', 'h', '{こわれた']);
    expect(results(a).responseCount).toBe(1);
    expect((gas.handleAdminSurveyResults(TOKEN, 's000000000000') as R).code).toBe('not_found');
    expect((gas.handleAdminSurveyResults(TOKEN, 'bad') as R).code).toBe('not_found');
  });
});
