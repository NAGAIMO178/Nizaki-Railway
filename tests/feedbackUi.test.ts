// ご意見・不具合(メニュー): 動作状況の組み立て・送信の中身・受付コードの画面・サーバーの失敗の扱い・LINE/Googleフォームのアドレス
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeedbackDone, FeedbackSheet } from '../src/components/FeedbackSheet';
import { MenuDrawer } from '../src/components/MenuDrawer';
import { NoticeSheet } from '../src/components/NoticeSheet';
import {
  buildEnvText, buildEnvTextForForm, buildFeedbackFormUrl, EnvInput, FEEDBACK_FORM_ENTRY, openFeedbackForm, FEEDBACK_FORM_SCREEN_CHOICES, FEEDBACK_FORM_SCREEN_LABEL, FEEDBACK_FORM_URL, makeFormCode, FEEDBACK_KINDS, FEEDBACK_SCREENS, getFeedbackDeviceId, lineOaMessageUrl, safeLocation, screenOfTab, submitFeedback, validateFeedback,
} from '../src/utils/feedback';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');
const env = (over: Partial<EnvInput> = {}): EnvInput => ({
  version: '4.7.0', width: 1440, height: 778, dpr: 2, pcLayout: true, userAgent: 'Mozilla/5.0 (Macintosh)', screen: '時刻表', loggedIn: true, errors: [], online: true,
  now: new Date('2026-11-20T08:12:00+09:00'), href: 'https://example.test/Nizaki-Railway/', ...over,
});

describe('動作状況(buildEnvText)', () => {
  it('決まった形(版・画面・UA・いまの画面・ログイン・直近のエラー・サーバー・送信時刻・URL)', () => {
    expect(buildEnvText(env())).toBe(
      ['版: 4.7.0', '画面: 1440x778 (dpr 2) / PC表示: あり', 'UA: Mozilla/5.0 (Macintosh)', 'いまの画面: 時刻表', 'ログイン: あり', '直近のエラー: 0件', 'サーバー: つながる', '送信時刻: 2026-11-20 08:12', 'URL: https://example.test/Nizaki-Railway/'].join('\n')
    );
  });
  it('URL は、? と # より後ろを入れない(QR乗車券のアドレスの、乗車券の情報を守る)', () => {
    const t = buildEnvText(env({ href: 'https://example.test/Nizaki-Railway/?t=SECRET-TICKET&x=1#/ticket/ABC123' }));
    expect(t).toContain('URL: https://example.test/Nizaki-Railway/');
    ['SECRET', 'ABC123', '?', '#'].forEach((w) => expect(t, w).not.toContain(w));
    expect(safeLocation('https://example.test/a/b?x=1#y')).toBe('https://example.test/a/b');
    expect(safeLocation('not a url')).toBe('');
  });
  it('UA は 200 文字まで。エラーは 3 件・件名だけ・200 文字まで。全体で 1500 文字まで', () => {
    const t = buildEnvText(env({ userAgent: 'U'.repeat(500), errors: ['e1', 'e2', 'e3', 'e4', 'x'.repeat(400)] }));
    expect(t).toContain(`UA: ${'U'.repeat(200)}\n`);
    expect(t).toContain('直近のエラー: 1. e1 / 2. e2 / 3. e3');
    expect(t).not.toContain('e4');
    expect(buildEnvText(env({ errors: ['x'.repeat(400)] })).match(/x{50,}/)?.[0]).toHaveLength(200);
    expect(buildEnvText(env({ userAgent: 'U'.repeat(200), errors: ['y'.repeat(400), 'y'.repeat(400), 'y'.repeat(400)], href: `https://example.test/${'p'.repeat(2000)}` })).length).toBeLessThanOrEqual(1500);
  });
  it('メールアドレス・名前・予約の中身・ポイント・端末の識別番号の、入れ物が無い(ログインは、ありなしだけ)', () => {
    const t = buildEnvText(env());
    ['@', 'NZ-', '予約', 'ポイント', 'deviceId', 'nizaki_'].forEach((w) => expect(t, w).not.toContain(w));
    expect(buildEnvText(env({ loggedIn: false }))).toContain('ログイン: なし');
    expect(buildEnvText(env({ online: false }))).toContain('サーバー: つながらない');
    expect(buildEnvText(env({ pcLayout: false }))).toContain('PC表示: なし');
  });
});

describe('入力の確かめ・最初に選ぶ画面', () => {
  it('画面・種類・内容が必須。1000文字まで', () => {
    expect(validateFeedback({ screen: 'ホーム', kind: 'その他', message: 'あ' })).toBeNull();
    expect(validateFeedback({ screen: '', kind: 'その他', message: 'あ' })).toContain('画面');
    expect(validateFeedback({ screen: 'ホーム', kind: '', message: 'あ' })).toContain('種類');
    expect(validateFeedback({ screen: 'ホーム', kind: 'その他', message: '  ' })).toContain('内容');
    expect(validateFeedback({ screen: 'ホーム', kind: 'その他', message: 'あ'.repeat(1001) })).toContain('1000');
  });
  it('いま開いていた画面(下のタブ)を、最初に選んでおく', () => {
    expect(['home', 'location', 'timetable', 'reservation', 'events', 'settings'].map(screenOfTab)).toEqual(['ホーム', '列車位置', '時刻表', '特急予約', 'イベント', '設定']);
    expect(screenOfTab('unknown')).toBe('その他');
  });
  it('対象の画面は16、種類は3', () => {
    expect(FEEDBACK_SCREENS).toHaveLength(16);
    expect([...FEEDBACK_KINDS]).toEqual(['バグ・不具合', '要望・感想', 'その他']);
  });
});

describe('送信(submitFeedback)', () => {
  const input = { screen: '時刻表', kind: 'バグ・不具合', message: '  動きません  ', wantReply: false, env: '版: 4.7.0' };
  it('submitFeedback に、feedback を入れて送る。ログインなしでも送れる(sessionToken を付けない)', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const r = await submitFeedback(input, undefined, async (a, p) => { calls.push([a, p]); return { status: 'success' }; }, 'fb-device-0001');
    expect(r).toEqual({ ok: true, replyCode: undefined, expiresAt: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('submitFeedback');
    expect(calls[0][1]).toEqual({ feedback: { screen: '時刻表', kind: 'バグ・不具合', message: '動きません', wantReply: false, env: '版: 4.7.0', deviceId: 'fb-device-0001' } });
    expect(calls[0][1]).not.toHaveProperty('sessionToken');
  });
  it('ログイン中は、sessionToken を付ける', async () => {
    let got: Record<string, unknown> = {};
    await submitFeedback({ ...input, wantReply: true }, 'tok.123.sig', async (_a, p) => { got = p; return { status: 'success' }; }, 'fb-device-0001');
    expect(got.sessionToken).toBe('tok.123.sig');
    expect((got.feedback as { wantReply: boolean }).wantReply).toBe(true);
  });
  it('返信希望: サーバーが返した受付コード(replyCode)と期限(expiresAt)を、受け取る', async () => {
    const r = await submitFeedback({ ...input, wantReply: true }, undefined, async () => ({ status: 'success', replyCode: 'abc234', expiresAt: 1790000000000 }), 'fb-device-0001');
    expect(r).toEqual({ ok: true, replyCode: 'ABC234', expiresAt: 1790000000000 });
  });
  it('形のおかしい replyCode は、使わない', async () => {
    for (const bad of ['', 'ABC', 'ABC2345', 'AB C23', 5, null]) {
      const r = await submitFeedback(input, undefined, async () => ({ status: 'success', replyCode: bad as never }), 'fb-device-0001');
      expect(r).toMatchObject({ ok: true, replyCode: undefined });
    }
  });
  it('サーバーの失敗(rate_limited・busy・invalid)は、サーバーの文を、そのまま返す。文が無ければ、決まった文', async () => {
    for (const msg of ['短い時間に、たくさん送られたため、しばらくしてからお試しください。', '混み合っています。', 'ご意見の内容を入れてください。']) {
      expect(await submitFeedback(input, undefined, async () => ({ status: 'error', message: msg }), 'fb-device-0001')).toEqual({ ok: false, message: msg });
    }
    expect(await submitFeedback(input, undefined, async () => ({ status: 'error' }), 'fb-device-0001')).toMatchObject({ ok: false, message: expect.stringContaining('送れませんでした') });
  });
  it('通信が失敗しても、例外を出さない', async () => {
    expect(await submitFeedback(input, undefined, async () => { throw new Error('offline'); }, 'fb-device-0001')).toMatchObject({ ok: false, message: expect.stringContaining('通信') });
  });
  it('動作状況は、1500文字まで', async () => {
    let got: Record<string, unknown> = {};
    await submitFeedback({ ...input, env: 'e'.repeat(3000) }, undefined, async (_a, p) => { got = p; return { status: 'success' }; }, 'fb-device-0001');
    expect(((got.feedback as { env: string }).env).length).toBe(1500);
  });
  it('端末ごとの印: 英数字・_・- の 8〜80 文字。同じ端末では、同じもの', () => {
    const id = getFeedbackDeviceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(getFeedbackDeviceId()).toBe(id);
  });
});

describe('受付コードの画面(返信を希望した人)', () => {
  const html = renderToStaticMarkup(React.createElement(FeedbackDone, { replyCode: 'ABC234', copied: false, onCopy: () => undefined }));
  it('コードを大きく・「公式LINEで、この6文字を、そのまま送ってください(10分間有効)」・LINEで送る・コードをコピー・友だち追加', () => {
    expect(html).toContain('>ABC234<');
    expect(html).toContain('text-4xl');
    expect(html).toContain('公式LINEで、この6文字を、そのまま送ってください(10分間有効)');
    expect(html).toContain('LINEで送る');
    expect(html).toContain('コードをコピー');
    expect(html).toContain('公式LINEを友だち追加');
    expect(html).toContain('href="https://lin.ee/TBKmXZ1"');
  });
  it('「LINEで送る」は、コードだけが入力ずみで、LINE を開くアドレス(LINE公式の形: @ は %40)', () => {
    expect(html).toContain('href="https://line.me/R/oaMessage/%40836rgjze/?ABC234"');
    expect(lineOaMessageUrl('XYZ789')).toBe('https://line.me/R/oaMessage/%40836rgjze/?XYZ789');
  });
  it('返信を希望しなかったとき(コードなし)は、「送信しました。ありがとうございます」だけ', () => {
    const plain = renderToStaticMarkup(React.createElement(FeedbackDone, { copied: false, onCopy: () => undefined }));
    expect(plain).toContain('送信しました。ありがとうございます');
    expect(plain).not.toContain('LINE');
  });
});

describe('Googleフォームの入口(事前入力)', () => {
  const E = FEEDBACK_FORM_ENTRY;
  it('欄の番号は、フォームのもの', () => {
    expect(E).toEqual({ screen: 'entry.1400659191', kind: 'entry.1413917765', message: 'entry.239824281', wantReply: 'entry.1934312063', env: 'entry.1559613320', code: 'entry.514912590' });
  });
  it('アドレス: FEEDBACK_FORM_URL + ?usp=pp_url& + entry.番号=値(encodeURIComponent)を & でつなぐ。日本語が、正しくエンコードされる', () => {
    const url = buildFeedbackFormUrl({ screen: '時刻表', kind: 'バグ・不具合', message: '動きません。\nお願いします & 確認', wantReply: true, env: '版: 4.7.0', code: 'K7MQ4X' });
    expect(url).toBe(
      `${FEEDBACK_FORM_URL}?usp=pp_url&entry.1400659191=${encodeURIComponent('時刻表')}&entry.1413917765=${encodeURIComponent('バグ・不具合')}&entry.239824281=${encodeURIComponent('動きません。\nお願いします & 確認')}&entry.1934312063=${encodeURIComponent('する')}&entry.1559613320=${encodeURIComponent('版: 4.7.0')}&entry.514912590=K7MQ4X`
    );
    expect(url).toContain('%E6%99%82%E5%88%BB%E8%A1%A8'); // 時刻表
    expect(url).toContain('%26'); // 本文の & は、%26
    expect(decodeURIComponent(url.split('entry.239824281=')[1].split('&entry')[0])).toBe('動きません。\nお願いします & 確認');
  });
  it('返信を希望しないときは、返信の希望は「しない」。合言葉(code)は、付けない(渡しても、付かない)', () => {
    const url = buildFeedbackFormUrl({ screen: 'ホーム', kind: 'その他', message: 'x', wantReply: false, code: 'K7MQ4X' });
    expect(url).toContain(`entry.1934312063=${encodeURIComponent('しない')}`);
    expect(url).not.toContain('entry.514912590');
    expect(url).not.toContain('K7MQ4X');
  });
  it('選ばれていないものは、付けない(空のまま)。何も無ければ、ただのリンク', () => {
    expect(buildFeedbackFormUrl({})).toBe(FEEDBACK_FORM_URL);
    expect(buildFeedbackFormUrl({ screen: '', kind: '', message: '' })).toBe(FEEDBACK_FORM_URL);
    expect(buildFeedbackFormUrl({ kind: 'その他' })).toBe(`${FEEDBACK_FORM_URL}?usp=pp_url&entry.1413917765=${encodeURIComponent('その他')}`);
  });
  it('番号が null の欄は、付けない', () => {
    const url = buildFeedbackFormUrl({ screen: 'ホーム', kind: 'その他', message: 'x' }, { ...E, screen: null, message: null });
    expect(url).toBe(`${FEEDBACK_FORM_URL}?usp=pp_url&entry.1413917765=${encodeURIComponent('その他')}`);
    expect(url).not.toContain('null');
  });
  it('アドレスは、指定のフォーム', () => {
    expect(FEEDBACK_FORM_URL).toBe('https://docs.google.com/forms/d/e/1FAIpQLSdWczFx3H_qkjhLI2XofaH9GLH0YHgI2WXw-9r_5uag6Er_aQ/viewform');
  });
});

describe('対象の画面: アプリの表示 → フォームの文字', () => {
  const choices = [...FEEDBACK_FORM_SCREEN_CHOICES] as string[];
  it('フォームの選択肢(16個)と、完全に一致する(過不足なし・重なりなし)', () => {
    const values = FEEDBACK_SCREENS.map((s) => FEEDBACK_FORM_SCREEN_LABEL[s]);
    expect(values).toHaveLength(16);
    expect(new Set(values).size).toBe(16);
    expect([...values].sort()).toEqual([...choices].sort());
    values.forEach((v) => expect(choices, v).toContain(v));
  });
  it('表示が違う3つだけ、違う文字', () => {
    expect(FEEDBACK_FORM_SCREEN_LABEL['マイページ']).toBe('マイページ(及びその画面上のコンテンツ)');
    expect(FEEDBACK_FORM_SCREEN_LABEL['会員証']).toBe('会員証(及びその画面上のコンテンツ)');
    expect(FEEDBACK_FORM_SCREEN_LABEL['ログイン・アカウント新規登録']).toBe('ログイン・アカウント新規登録画面');
    const differing = FEEDBACK_SCREENS.filter((s) => FEEDBACK_FORM_SCREEN_LABEL[s] !== s);
    expect(differing).toEqual(['マイページ', '会員証', 'ログイン・アカウント新規登録']);
  });
  it('アドレスの screen には、フォームの文字が入る(種類も、アプリとフォームで同じ文字)', () => {
    const url = buildFeedbackFormUrl({ screen: 'マイページ', kind: '要望・感想' });
    expect(url).toContain(`entry.1400659191=${encodeURIComponent('マイページ(及びその画面上のコンテンツ)')}`);
    expect(decodeURIComponent(url)).toContain('entry.1413917765=要望・感想');
    FEEDBACK_KINDS.forEach((k) => expect(buildFeedbackFormUrl({ kind: k })).toContain(encodeURIComponent(k)));
  });
});

describe('合言葉(Googleフォーム用)', () => {
  it('英数字6文字・大文字・英字を1文字以上・O/0・I/1/l を含まない(2000回)', () => {
    for (let i = 0; i < 2000; i++) {
      const c = makeFormCode();
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      expect(c).toMatch(/[A-Z]/);
      expect(c).not.toMatch(/[OIL01l]/);
    }
  });
  it('数字だけになる乱数は、作り直す(英字を1文字以上)。248 以上の値は、偏りを避けるため、使わない', () => {
    // アルファベットは、前半23文字が英字(A…)、後半8文字が数字(2〜9)。値 23〜30 は、数字だけの6文字になる
    let n = 0;
    const retried = makeFormCode(() => (n++ === 0 ? [23, 24, 25, 26, 27, 28, 29, 30, 23, 24, 25, 26] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    expect(retried).toBe('ABCDEF');
    expect(n).toBe(2);
    let m = 0;
    expect(makeFormCode(() => (m++ === 0 ? Array(12).fill(250) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toBe('ABCDEF'); // 250 は使わない → 次の乱数
  });
  it('送信の前は、コードを、画面に出さない(返信を希望しても、合言葉の枠・「フォーム送信後、10分以内に…」の説明は、無い)', () => {
    const src = read('src/components/FeedbackSheet.tsx');
    expect(src).not.toContain('formCode');
    expect(src).not.toContain('aria-label="合言葉"');
    expect(src).not.toContain('フォーム送信後、10分以内に');
    expect(src).not.toContain('makeFormCode'); // 作るのは、リンクを押した瞬間(utils/feedback.ts の openFeedbackForm)
  });
  it('送信後(模擬の成功)に、サーバーの受付コードだけが出る(コードは、1つ)', async () => {
    const r = await submitFeedback({ screen: 'ホーム', kind: 'その他', message: 'x', wantReply: true, env: '' }, undefined, async () => ({ status: 'success', replyCode: 'JCXEVS', expiresAt: 1790000000000 }), 'fb-device-0001');
    expect(r).toMatchObject({ ok: true, replyCode: 'JCXEVS' });
    const html = renderToStaticMarkup(React.createElement(FeedbackDone, { replyCode: (r as { replyCode: string }).replyCode, copied: false, onCopy: () => undefined }));
    expect(html.match(/aria-label="受付コード"/g)).toHaveLength(1);
    expect(html).toContain('>JCXEVS<');
  });
  it('毎回、ちがうものが出る(2000回で、500種類以上)', () => {
    expect(new Set(Array.from({ length: 2000 }, () => makeFormCode())).size).toBeGreaterThan(500);
  });
});

describe('Googleフォームで送る(openFeedbackForm): 押した瞬間に、合言葉を作る', () => {
  const base = { screen: '時刻表', kind: 'バグ・不具合', message: '本文', env: '版: 4.7.0' };
  it('返信を希望しているとき: 押した瞬間に、合言葉(英数字6文字)を作って、事前入力に入れ、新しいタブで開く', () => {
    const opened: string[] = [];
    const url = openFeedbackForm({ ...base, wantReply: true }, (u) => void opened.push(u));
    expect(opened).toEqual([url]);
    const code = /entry\.514912590=([^&]+)/.exec(url)?.[1] ?? '';
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(code).toMatch(/[A-Z]/);
    expect(code).not.toMatch(/[OIL01l]/);
    expect(url).toContain(`entry.1934312063=${encodeURIComponent('する')}`);
  });
  it('押すたびに、新しい合言葉(前もって作っておかない)', () => {
    let n = 0;
    const make = () => ['AAAAA2', 'BBBBB3'][n++];
    const u1 = openFeedbackForm({ ...base, wantReply: true }, () => undefined, make);
    const u2 = openFeedbackForm({ ...base, wantReply: true }, () => undefined, make);
    expect(u1).toContain('entry.514912590=AAAAA2');
    expect(u2).toContain('entry.514912590=BBBBB3');
    expect(n).toBe(2);
  });
  it('返信を希望しないとき: 返信の希望は「しない」。合言葉は、作らない・付けない', () => {
    let made = 0;
    const opened: string[] = [];
    const url = openFeedbackForm({ ...base, wantReply: false }, (u) => void opened.push(u), () => { made++; return 'ZZZZZ9'; });
    expect(made).toBe(0);
    expect(url).toContain(`entry.1934312063=${encodeURIComponent('しない')}`);
    expect(url).not.toContain('entry.514912590');
    expect(opened).toEqual([url]);
  });
  it('リンクの押し方: 希望するときだけ、押した瞬間に処理する(希望しないときは、ふつうのリンクのまま)。アドレスの href には、合言葉が入っていない', () => {
    const src = read('src/components/FeedbackSheet.tsx');
    expect(src).toContain('if (!wantReply) return;');
    expect(src).toContain('openFeedbackForm(formValues);');
    expect(src).toContain('href={buildFeedbackFormUrl(formValues)}');
    expect(buildFeedbackFormUrl({ ...base, wantReply: true })).not.toContain('entry.514912590');
  });
});

describe('動作状況: Googleフォーム用は 800 文字以内(長いときは UA を短くする)', () => {
  it('短いときは、そのまま。長い UA は、短くして収める(ほかの行は、そのまま)', () => {
    expect(buildEnvTextForForm(env())).toBe(buildEnvText(env()));
    const long = env({ userAgent: 'U'.repeat(500), errors: ['e'.repeat(200), 'f'.repeat(200), 'g'.repeat(200)] });
    expect(buildEnvText(long).length).toBeGreaterThan(800);
    const t = buildEnvTextForForm(long);
    expect(t.length).toBeLessThanOrEqual(800);
    expect(t).toContain('版: 4.7.0');
    expect(t).toContain('サーバー: つながる');
    expect(t).toContain('URL: https://example.test/Nizaki-Railway/');
    expect(t.match(/U+/)?.[0].length ?? 0).toBeLessThan(200);
  });
});

describe('画面(シート・メニュー・通知)', () => {
  const sheet = renderToStaticMarkup(React.createElement(FeedbackSheet, { isOpen: true, onClose: () => undefined, defaultScreen: '時刻表', currentScreenLabel: '時刻表', loggedIn: false }));
  it('対象の画面(16個のラジオ。いま開いていた画面が、選ばれている)・種類(3個)・内容(残り1000)・返信を希望する・動作状況を添える(オン)', () => {
    expect(sheet.match(/name="feedback-screen"/g)).toHaveLength(16);
    expect(sheet.match(/name="feedback-kind"/g)).toHaveLength(3);
    expect(sheet.match(/name="feedback-screen"[^>]*checked/g)).toHaveLength(1);
    expect(sheet).toMatch(/checked="" value="時刻表"/);
    expect(sheet).toContain('残り 1000');
    expect(sheet).toContain('返信を希望する');
    expect(sheet).toContain('動作状況を添える');
    expect(sheet.match(/type="checkbox"[^>]*checked/g)).toHaveLength(1); // 動作状況だけオン
    expect(sheet).toContain('<details');
    expect(sheet).toContain('個人情報(本名・住所など)は入力しないでください');
  });
  it('一番下に、Googleフォームで送る', () => {
    expect(sheet).toContain('Googleフォームで送る');
    // 事前入力ずみ(いま開いていた画面・返信の希望=しない・動作状況)。返信を希望していないので、合言葉は無い
    expect(sheet).toContain(`href="${FEEDBACK_FORM_URL}?usp=pp_url&amp;entry.1400659191=${encodeURIComponent('時刻表')}`);
    expect(sheet).toContain(`entry.1934312063=${encodeURIComponent('しない')}`);
    expect(sheet).not.toContain('entry.514912590');
    expect(sheet).not.toContain('aria-label="合言葉"');
  });
  it('スマホは下から・PC は中央の480px(段階3と同じ作り)', () => {
    const s = read('src/components/FeedbackSheet.tsx');
    expect(s).toContain('pc:max-w-[480px]');
    expect(s).toContain('pc:rounded-3xl');
    expect(s).toContain('const drag = useDragToDrag'.replace('ToDrag', 'ToDismiss') + '(onClose, !pcLayout);');
  });
  const menu = (p: Record<string, unknown>) =>
    renderToStaticMarkup(React.createElement(MenuDrawer, { isOpen: true, onClose: () => undefined, isLoggedIn: false, currentUser: null, onOpenSettings: () => undefined, onOpenMyPage: () => undefined, onOpenNPoint: () => undefined, onOpenRouteMap: () => undefined, onOpenLogin: () => undefined, ...p }));
  it('メニューに、「ご意見・不具合」と「公式LINE」(説明の文なし)。公式LINE は、友だち追加を新しいタブで開く', () => {
    const html = menu({ onOpenFeedback: () => undefined });
    expect(html).toContain('>ご意見・不具合<');
    expect(html).toContain('>公式LINE<');
    expect(html).toContain('fill="#06C755"');
    const rows = html.split('<button').filter((b) => b.includes('>ご意見・不具合<') || b.includes('>公式LINE<'));
    rows.forEach((r) => expect(r).not.toContain('text-[10px] text-[#857D99] mt-0.5')); // note なし
    expect(read('src/components/MenuDrawer.tsx')).toContain("window.open(LINE_OA_ADD_FRIEND_URL, '_blank', 'noopener,noreferrer')");
  });
  it('通知の画面の、いちばん下に、公式LINE(同じアドレス)', () => {
    const html = renderToStaticMarkup(React.createElement(NoticeSheet, { isOpen: true, notices: [], onClose: () => undefined }));
    expect(html).toContain('>公式LINE<');
    expect(html).toContain('href="https://lin.ee/TBKmXZ1"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
