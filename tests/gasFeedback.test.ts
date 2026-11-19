// ご意見・不具合(サーバー gas/Code.gs): 作りものの台帳・キャッシュ・ロック・LINE で動かす。
// 受付コードの作り方・LINE との結びつけ(順番が逆でも)・連投の制限・匿名・管理用の確認(管理トークン)・Googleフォームの受け口を調べる。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');
const TOKEN = 'test-admin-token-xyz';
const DEVICE = 'device-abcdefgh12345';

let gas: Gas;
let grid: unknown[][] | null;
let cache: Record<string, string>;
let props: Record<string, string>;
let nowMs: number;
let replies: { replyToken: string; messages: unknown[] }[];
let pushes: { to: string; messages: unknown[] }[];
let pushStatus: number;
let triggers: { handler: string; formId?: string }[];

const fb = (over: Record<string, unknown> = {}) => ({ screen: '予約', kind: '不具合', message: 'ボタンが押せません', wantReply: false, env: 'iPhone', deviceId: DEVICE, ...over });
const submit = (f: Record<string, unknown>, session?: string) => gas.handleSubmitFeedback(f, session);
const adminList = () => gas.handleAdminListFeedback(TOKEN).feedback as Array<Record<string, unknown>>;
const row = (i = 0) => (grid as unknown[][])[i + 1];
const COL = { id: 0, entry: 2, screen: 3, kind: 4, message: 5, wantReply: 6, code: 7, codeState: 8, codeExpiry: 9, lineUser: 10, memberId: 11, env: 12, status: 13, repliedAt: 14 };
const line = (text: string, userId = 'U1') => gas.handleLineMessage({ replyToken: 'rt-' + text, source: { userId }, message: { text } });

beforeEach(() => {
  grid = null;
  cache = {};
  props = { ADMIN_TOKEN: TOKEN, LINE_CHANNEL_ACCESS_TOKEN: 'line-token' };
  nowMs = Date.parse('2026-11-20T12:00:00+09:00');
  replies = [];
  pushes = [];
  pushStatus = 200;
  triggers = [];
  const ctx: Gas = {
    Logger: { log: () => undefined },
    console: { log: () => undefined, error: () => undefined },
    ContentService: {},
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string) => void (cache[k] = v),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Utilities: {
      formatDate: () => '2026/11/20 12:00:00',
      getUuid: () => crypto.randomUUID(),
    },
    UrlFetchApp: {
      fetch: (_url: string, opts: { payload: string }) => {
        const body = JSON.parse(opts.payload);
        if (body.to) pushes.push({ to: body.to, messages: body.messages });
        return { getResponseCode: () => pushStatus, getContentText: () => '' };
      },
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler, id: t })),
      deleteTrigger: (t: { id: { handler: string } }) => void triggers.splice(triggers.indexOf(t.id as never), 1),
      newTrigger: (handler: string) => ({ forForm: (form: { id: string }) => ({ onFormSubmit: () => ({ create: () => void triggers.push({ handler, formId: form.id }) }) }) }),
    },
    FormApp: { openById: (id: string) => ({ id }) },
    Date: class extends Date {
      constructor(...a: unknown[]) {
        if (a.length === 0) super(nowMs);
        else super(...(a as [number]));
      }
      static now() {
        return nowMs;
      }
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  gas = ctx;
  gas.createJsonResponse = (d: unknown) => d;
  // LINE の返信は、記録だけ(通信しない)
  gas.replyToLine = (replyToken: string, messages: unknown[]) => void replies.push({ replyToken, messages });
  gas.verifySessionToken = (t: string) => (t === 'good-session' ? 'M0001' : null);
  const chain = { setBackground: () => chain, setFontColor: () => chain, setFontWeight: () => chain, setNumberFormat: () => chain };
  const sheet = {
    getLastRow: () => (grid as unknown[][]).length,
    appendRow: (r: unknown[]) => void (grid as unknown[][]).push([...r]),
    setFrozenRows: () => undefined,
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({
      ...chain,
      getValues: () => (grid as unknown[][]).slice(r - 1, r - 1 + nr).map((rw) => Array.from({ length: nc }, (_, i) => rw[c - 1 + i] ?? '')),
      setValues: (vals: unknown[][]) => vals.forEach((vr, ri) => vr.forEach((v, ci) => void ((grid as unknown[][])[r - 1 + ri][c - 1 + ci] = v))),
    }),
  };
  gas.getDataSpreadsheet = () => ({
    getSheetByName: (n: string) => (n === 'ご意見' ? (grid ? sheet : null) : null),
    insertSheet: (n: string) => {
      expect(n).toBe('ご意見');
      grid = [];
      return sheet;
    },
  });
});

describe('① 送る(ログインなし)', () => {
  it('シート「ご意見」は、なければ作り、1件を書く。匿名なら、会員IDも、返信先も、コードも無い', () => {
    expect(grid).toBeNull();
    const r = submit(fb());
    expect(r.status).toBe('success');
    expect(r.replyCode).toBeUndefined();
    expect((grid as unknown[][])[0]).toContain('受付コード');
    expect(row()[COL.entry]).toBe('app');
    expect(row()[COL.message]).toBe('ボタンが押せません');
    expect(row()[COL.wantReply]).toBe(0);
    expect(row()[COL.memberId]).toBe('');
    expect(row()[COL.code]).toBe('');
    expect(row()[COL.status]).toBe('未対応');
  });

  it('返信希望でないときは、ログインの証があっても、会員IDを保存しない(匿名)', () => {
    submit(fb({ wantReply: false }), 'good-session');
    expect(row()[COL.memberId]).toBe('');
  });

  it('返信希望で、ログインの証が本物なら、会員IDを保存する。偽の証・証なしなら、保存しない', () => {
    submit(fb({ wantReply: true }), 'good-session');
    submit(fb({ wantReply: true }), 'forged-session');
    submit(fb({ wantReply: true }));
    expect(row(0)[COL.memberId]).toBe('M0001');
    expect(row(1)[COL.memberId]).toBe('');
    expect(row(2)[COL.memberId]).toBe('');
  });

  it('内容は、空・1000文字を超えるのは断る。屋内の長さは、切り詰める(対象の画面60・種類40・利用環境1500)', () => {
    expect(submit(fb({ message: '   ' })).code).toBe('invalid');
    expect(submit(fb({ message: 'あ'.repeat(1001) })).code).toBe('invalid');
    expect(submit(fb({ message: 'あ'.repeat(1000) })).status).toBe('success');
    submit(fb({ screen: 'x'.repeat(200), kind: 'y'.repeat(200), env: 'z'.repeat(3000) }));
    expect((row(1)[COL.screen] as string).length).toBe(60);
    expect((row(1)[COL.kind] as string).length).toBe(40);
    expect((row(1)[COL.env] as string).length).toBe(1500);
  });

  it('入力が変・端末の印が無いときは、断る。式になる文字で始まる入力は、先頭に「\'」を付けて書く', () => {
    expect(gas.handleSubmitFeedback(null).code).toBe('invalid');
    expect(gas.handleSubmitFeedback('x').code).toBe('invalid');
    expect(submit(fb({ deviceId: '' })).code).toBe('invalid');
    expect(submit(fb({ deviceId: 'short' })).code).toBe('invalid');
    submit(fb({ message: '=HYPERLINK("http://x")', screen: '+cmd', env: '@x' }));
    expect(row()[COL.message]).toBe('\'=HYPERLINK("http://x")');
    expect(row()[COL.screen]).toBe("'+cmd");
    expect(row()[COL.env]).toBe("'@x");
  });

  it('同じ端末の印は、1時間に5回まで。6回目は断る。別の端末の印は、数えない', () => {
    for (let i = 0; i < 5; i++) expect(submit(fb()).status).toBe('success');
    const r = submit(fb());
    expect(r.status).toBe('error');
    expect(r.code).toBe('rate_limited');
    expect(submit(fb({ deviceId: 'another-device-12345' })).status).toBe('success');
    expect((grid as unknown[][]).length).toBe(1 + 6);
  });
});

describe('② 受付コード', () => {
  it('返信希望のときだけ、6文字の英数字(O/0・I/1/l なし・英字を1文字以上)を返し、10分の期限を書く', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      cache = {};
      const r = submit(fb({ wantReply: true, deviceId: `dev-${i}-abcdefgh` }));
      expect(r.status).toBe('success');
      expect(r.replyCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(r.replyCode).toMatch(/[A-Z]/);
      expect(r.expiresAt).toBe(nowMs + 600_000);
      seen.add(r.replyCode);
    }
    expect(seen.size).toBeGreaterThan(30);
    expect(row(0)[COL.codeState]).toBe('waiting');
    expect(row(0)[COL.codeExpiry]).toBe(nowMs + 600_000);
  });

  it('数字だけのコードは、作り直す(英字を1文字以上、含める)', () => {
    let n = 0;
    gas.secureToken = () => ['234567', '987654', 'ABC234'][Math.min(n++, 2)];
    expect(submit(fb({ wantReply: true })).replyCode).toBe('ABC234');
  });

  it('待ち中の、登録・パスワード再設定の合言葉・ほかの受付コードとは、重ならない', () => {
    // 作れるコードを、ほぼ全部ふさぐと、作れない(ふさがれた合言葉を、避けている)
    const realSecure = gas.secureToken;
    let n = 0;
    gas.secureToken = () => ['AAAAAA', 'BBBBBB', 'CCCCCC', 'DDDDDD'][Math.min(n++, 3)];
    cache['line_pending_AAAAAA'] = '1';
    cache['line_reset_pending_BBBBBB'] = '{}';
    cache['fb_code_CCCCCC'] = 'f000000000000';
    const r = submit(fb({ wantReply: true }));
    expect(r.replyCode).toBe('DDDDDD');
    gas.secureToken = realSecure;
  });
});

describe('③ LINE で結びつける', () => {
  const pending = () => {
    const r = submit(fb({ wantReply: true }));
    return r.replyCode as string;
  };

  it('待ち中のコードが届いたら、返信先を結びつけて、決まった文を返す。コードは消え、使い捨て', () => {
    const code = pending();
    line(code.toLowerCase(), 'Uabc');
    expect(replies).toHaveLength(1);
    expect(replies[0].messages).toEqual([{ type: 'text', text: 'ご意見を、受け付けました。内容を確認して、お返事します。' }]);
    expect(row()[COL.lineUser]).toBe('Uabc');
    expect(row()[COL.codeState]).toBe('matched');
    expect(row()[COL.code]).toBe('');
    // 同じコードを、もう一度送っても、何も起きない
    line(code, 'Uother');
    expect(replies).toHaveLength(1);
    expect(row()[COL.lineUser]).toBe('Uabc');
  });

  it('全角・小文字・空白・記号まじりでも、同じ扱い', () => {
    const code = pending();
    const wide = code.replace(/[A-Z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).split('').join(' ');
    line(wide);
    expect(replies).toHaveLength(1);
    expect(row()[COL.codeState]).toBe('matched');
  });

  it('待ち中のコードと一致しない言葉・短い・長い言葉には、何も返さない(「banana」など)', () => {
    pending();
    for (const t of ['banana', 'こんにちは', 'ABC', 'ABCDEFGH', '12345']) line(t);
    expect(replies).toHaveLength(0);
    expect(row()[COL.codeState]).toBe('waiting');
  });

  it('10分をすぎたコードは、結びつかない(期限切れの印になる)', () => {
    const code = pending();
    nowMs += 600_001;
    delete cache['fb_code_' + code]; // 本物のキャッシュは、10分で消える
    line(code);
    expect(replies).toHaveLength(0);
    // キャッシュに残っていた場合も、台帳の期限で断る
    cache['fb_code_' + code] = row()[COL.id] as string;
    line(code);
    expect(replies).toHaveLength(0);
    expect(row()[COL.codeState]).toBe('expired');
    expect(row()[COL.lineUser]).toBe('');
  });

  it('登録・パスワード再設定の合言葉は、これまでどおり、先に判定される(ご意見のコードに取られない)', () => {
    cache['line_pending_QQQQQQ'] = '1';
    let routed = '';
    gas.handleLineVerificationMessage = (_rt: string, _u: string, t: string) => void (routed = 'verify:' + t);
    gas.handleLineResetMessage = () => void (routed = 'reset');
    line('qqqqqq');
    expect(routed).toBe('verify:QQQQQQ');
    expect(replies).toHaveLength(0);
    cache['line_reset_pending_RRRRRR'] = '{}';
    line('RRRRRR');
    expect(routed).toBe('reset');
  });

  it('LINE が先に届いたときは、10分だけ覚えて、あとから同じコードの意見が来たら、その場で結びつく(Googleフォーム)', () => {
    line('H7K2M9', 'Ufirst');
    expect(replies).toHaveLength(0);
    expect(cache['fb_line_H7K2M9']).toBe('Ufirst');
    gas.onFeedbackFormSubmit({ response: formResponse({ '対象の画面': '予約', '種類': '不具合', '内容': '押せません', '返信の希望': 'する', '利用環境': 'iPhone', 'LINEで利用する合言葉6桁を作成してください(英数字)': 'h7k2m9' }) });
    expect(row()[COL.entry]).toBe('form');
    expect(row()[COL.lineUser]).toBe('Ufirst');
    expect(row()[COL.codeState]).toBe('matched');
    expect(row()[COL.code]).toBe('');
    expect(cache['fb_line_H7K2M9']).toBeUndefined();
    expect(pushes).toEqual([{ to: 'Ufirst', messages: [{ type: 'text', text: 'ご意見を、受け付けました。内容を確認して、お返事します。' }] }]);
  });

  it('同じ LINE ユーザーIDからの試行は、10分に10回まで。超えたら、一致するコードでも、何も返さない', () => {
    for (let i = 0; i < 10; i++) line(`ZZZZ${String(i).padStart(2, '0')}`, 'Uspam');
    const code = pending();
    line(code, 'Uspam');
    expect(replies).toHaveLength(0);
    expect(row()[COL.codeState]).toBe('waiting');
    line(code, 'Unew');
    expect(replies).toHaveLength(1);
  });
});

// Googleフォームの回答の、作りもの
const formResponse = (answers: Record<string, string | string[]>) => ({
  getItemResponses: () => Object.entries(answers).map(([title, response]) => ({ getItem: () => ({ getTitle: () => title }), getResponse: () => response })),
});

describe('④ Googleフォームの受け口(onFeedbackFormSubmit)', () => {
  const form = (over: Record<string, string> = {}) => ({
    response: formResponse({
      '対象の画面': '時刻表', '種類': 'ご意見', '内容': '見やすいです', '返信の希望': 'しない', '利用環境': 'Android',
      'LINEで利用する合言葉6桁を作成してください(返信を希望する方のみ)': '', ...over,
    }),
  });

  it('質問の見出しの、前方一致で読み、同じシートに、入口=form で書く。返信しないときは、コードなし', () => {
    gas.onFeedbackFormSubmit(form());
    expect(row()[COL.entry]).toBe('form');
    expect(row()[COL.screen]).toBe('時刻表');
    expect(row()[COL.kind]).toBe('ご意見');
    expect(row()[COL.message]).toBe('見やすいです');
    expect(row()[COL.wantReply]).toBe(0);
    expect(row()[COL.code]).toBe('');
    expect(row()[COL.env]).toBe('Android');
  });

  it('返信を希望して、6文字の英数字の合言葉なら、受付コードにする(期限10分)。LINEにそのコードが届くと、結びつく', () => {
    gas.onFeedbackFormSubmit(form({ '返信の希望': 'する', 'LINEで利用する合言葉6桁を作成してください(返信を希望する方のみ)': 'ab-12cd' }));
    expect(row()[COL.code]).toBe('AB12CD');
    expect(row()[COL.codeState]).toBe('waiting');
    expect(row()[COL.codeExpiry]).toBe(nowMs + 600_000);
    line('ab12cd', 'Uform');
    expect(replies).toHaveLength(1);
    expect(row()[COL.lineUser]).toBe('Uform');
  });

  it('合言葉が6文字の英数字でないとき・待ち中のほかの合言葉と重なるときは、コードにしない(意見は残る)', () => {
    gas.onFeedbackFormSubmit(form({ '返信の希望': 'する', 'LINEで利用する合言葉6桁を作成してください(返信を希望する方のみ)': '123' }));
    expect(row(0)[COL.code]).toBe('');
    cache['line_pending_ABCDEF'] = '1';
    gas.onFeedbackFormSubmit(form({ '返信の希望': 'する', 'LINEで利用する合言葉6桁を作成してください(返信を希望する方のみ)': 'abcdef' }));
    expect(row(1)[COL.code]).toBe('');
    expect(row(1)[COL.codeState]).toBe('expired');
    expect((grid as unknown[][]).length).toBe(3);
  });

  it('内容が空・回答が無いときは、何も書かない。式になる文字は、先頭に「\'」を付ける', () => {
    gas.onFeedbackFormSubmit(form({ '内容': '' }));
    gas.onFeedbackFormSubmit({});
    gas.onFeedbackFormSubmit(null);
    expect(grid === null || (grid as unknown[][]).length <= 1).toBe(true);
    gas.onFeedbackFormSubmit(form({ '内容': '=1+1' }));
    expect(row()[COL.message]).toBe("'=1+1");
  });

  it('setupFeedbackFormTrigger は、前のトリガーを消してから、フォームの送信時のトリガーを1つ作る', () => {
    triggers.push({ handler: 'onFeedbackFormSubmit', formId: 'old' }, { handler: 'other' });
    gas.setupFeedbackFormTrigger('FORM123');
    expect(triggers).toEqual([{ handler: 'other' }, { handler: 'onFeedbackFormSubmit', formId: 'FORM123' }]);
  });
});

describe('⑤ 管理用(管理トークンを、必ず、サーバーで確かめる)', () => {
  it('トークンが違えば、一覧・返信・状態の変更は、すべて断る。一覧にも返信にも触れない', () => {
    submit(fb({ wantReply: true }));
    const id = row()[COL.id] as string;
    for (const bad of ['', 'wrong', undefined, null]) {
      cache = {}; // 管理トークンの失敗の回数が、たまって、止まらないように(ここは、断る動きだけを見る)
      expect(gas.handleAdminListFeedback(bad).code).toBe('admin');
      expect(gas.handleAdminReplyFeedback(bad, id, 'こんにちは').code).toBe('admin');
      expect(gas.handleAdminSetFeedbackStatus(bad, id, '対応済').code).toBe('admin');
    }
    expect(pushes).toHaveLength(0);
    expect(row()[COL.status]).toBe('未対応');
  });

  it('一覧は、新しい順。LINE_USER_ID も、会員IDも、受付コードも返さず、「返信先あり」の印だけ', () => {
    submit(fb({ message: '1つめ', wantReply: true }), 'good-session');
    submit(fb({ message: '2つめ' }));
    line((cache && Object.keys(cache).find((k) => k.startsWith('fb_code_'))!.slice(8)) as string, 'Usecret');
    const list = adminList();
    expect(list.map((f) => f.message)).toEqual(['2つめ', '1つめ']);
    expect(list[1].canReply).toBe(true);
    expect(list[0].canReply).toBe(false);
    const text = JSON.stringify(list);
    expect(text).not.toContain('Usecret');
    expect(text).not.toContain('M0001');
    expect(list[1]).not.toHaveProperty('lineUserId');
    expect(list[1]).not.toHaveProperty('memberId');
    expect(list[1]).not.toHaveProperty('code');
  });

  it('返信: 返信先があるときだけ、LINEにプッシュで送り、状態を「対応済」・返信日時を書く', () => {
    submit(fb({ wantReply: true }));
    const id = row()[COL.id] as string;
    // まだ LINE に結びついていない
    expect(gas.handleAdminReplyFeedback(TOKEN, id, 'お返事です').code).toBe('no_line');
    expect(pushes).toHaveLength(0);
    line(Object.keys(cache).find((k) => k.startsWith('fb_code_'))!.slice(8), 'Ureply');
    const r = gas.handleAdminReplyFeedback(TOKEN, id, ' お返事です ');
    expect(r.status).toBe('success');
    expect(pushes).toEqual([{ to: 'Ureply', messages: [{ type: 'text', text: 'お返事です' }] }]);
    expect(row()[COL.status]).toBe('対応済');
    expect(row()[COL.repliedAt]).toBe('2026/11/20 12:00:00');
  });

  it('返信: LINE に送れなかったら、状態を変えず、エラーを返す。ID・文が変なときは、断る', () => {
    submit(fb({ wantReply: true }));
    const id = row()[COL.id] as string;
    line(Object.keys(cache).find((k) => k.startsWith('fb_code_'))!.slice(8), 'Ureply');
    pushStatus = 500;
    expect(gas.handleAdminReplyFeedback(TOKEN, id, 'お返事').code).toBe('push_failed');
    expect(row()[COL.status]).toBe('未対応');
    expect(gas.handleAdminReplyFeedback(TOKEN, 'bad', 'x').code).toBe('invalid');
    expect(gas.handleAdminReplyFeedback(TOKEN, id, '  ').code).toBe('invalid');
    expect(gas.handleAdminReplyFeedback(TOKEN, id, 'あ'.repeat(1001)).code).toBe('invalid');
    expect(gas.handleAdminReplyFeedback(TOKEN, 'f000000000000', 'x').code).toBe('not_found');
  });

  it('LINEのアクセストークンが未設定なら、送れず(push_failed)、状態は変わらない', () => {
    submit(fb({ wantReply: true }));
    const id = row()[COL.id] as string;
    line(Object.keys(cache).find((k) => k.startsWith('fb_code_'))!.slice(8), 'Ureply');
    delete props.LINE_CHANNEL_ACCESS_TOKEN;
    vm.runInContext("CONFIG.ACCESS_TOKEN = ''", gas as vm.Context);
    expect(gas.handleAdminReplyFeedback(TOKEN, id, 'お返事').code).toBe('push_failed');
    expect(row()[COL.status]).toBe('未対応');
  });

  it('状態の変更: 「未対応」「対応済」だけ。ほかは断る', () => {
    submit(fb());
    const id = row()[COL.id] as string;
    expect(gas.handleAdminSetFeedbackStatus(TOKEN, id, '対応済').status).toBe('success');
    expect(row()[COL.status]).toBe('対応済');
    expect(gas.handleAdminSetFeedbackStatus(TOKEN, id, '未対応').status).toBe('success');
    expect(row()[COL.status]).toBe('未対応');
    expect(gas.handleAdminSetFeedbackStatus(TOKEN, id, '削除').code).toBe('invalid');
    expect(gas.handleAdminSetFeedbackStatus(TOKEN, 'bad', '対応済').code).toBe('invalid');
    expect(gas.handleAdminSetFeedbackStatus(TOKEN, 'f000000000000', '対応済').code).toBe('not_found');
  });
});

describe('⑥ doPost の入口', () => {
  it('submitFeedback は、ログインなしで通り、管理用は、トークンなしでは断る', () => {
    const post = (body: unknown) => gas.doPost({ postData: { contents: JSON.stringify(body) } });
    expect(post({ action: 'submitFeedback', feedback: fb() }).status).toBe('success');
    expect(post({ action: 'adminListFeedback' }).code).toBe('admin');
    expect(post({ action: 'adminReplyFeedback', id: 'f000000000000', text: 'x' }).code).toBe('admin');
    expect(post({ action: 'adminSetFeedbackStatus', id: 'f000000000000', status: '対応済' }).code).toBe('admin');
    expect(post({ action: 'adminListFeedback', adminToken: TOKEN }).status).toBe('success');
  });
});
