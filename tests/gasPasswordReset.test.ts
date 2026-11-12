// パスワードを忘れたときの再設定(LINE で本人確認)。サーバー(gas/Code.gs)を、作りものの台帳・LINE・キャッシュで動かす。
// 値(メール・LINE の ID・パスワード・コード)は、すべて、テスト用の架空のもの
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gas = Record<string, any>;
const source = fs.readFileSync(path.resolve(__dirname, '..', 'gas', 'Code.gs'), 'utf-8');

const HEAD = ['登録日時', 'メールアドレス', '会員ID', '表示名', 'パスワードソルト', 'パスワードハッシュ', 'ランク', '入会日', 'LINE_USER_ID'];
const EMAIL = 'taro@example.test';
const LINE_ID = 'U-test-line-id-0001';
const OTHER_LINE_ID = 'U-test-line-id-9999';
const OLD_PW = 'Oldpass1!x';
const NEW_PW = 'Newpass2@y';

let gas: Gas;
let grid: unknown[][];
let cache: Record<string, string>;
let props: Record<string, string>;
let logs: string[];
let replies: Array<{ replyToken: string; text: string }>;
let lockHeld: boolean;
let lockFails: boolean;
let hashCalls: Array<{ held: boolean }>;

const legacyHash = (pw: string, salt: string) => crypto.createHash('sha256').update(pw + ':' + salt, 'utf8').digest('hex');
const pbkdf2 = (pw: string, salt: string, n: number) => crypto.pbkdf2Sync(Buffer.from(pw, 'utf8'), Buffer.from(salt, 'utf8'), n, 32, 'sha256').toString('hex');
const addMember = (email: string, salt: string, hash: string, line: string) => grid.push(['t', email, 'NZ-1', '太郎', salt, hash, 'レギュラー', '2026-10-01', line]);
const row = () => ({ salt: String(grid[1][4]), hash: String(grid[1][5]) });

beforeEach(() => {
  grid = [[...HEAD]];
  cache = {};
  props = { PASSWORD_HASH_ITERATIONS: '10000' };
  logs = [];
  replies = [];
  lockHeld = false;
  lockFails = false;
  hashCalls = [];
  const ctx: Gas = {
    Logger: { log: (m: string) => void logs.push(String(m)) },
    console: { log: (m: string) => void logs.push(String(m)), error: (m: string) => void logs.push(String(m)) },
    ContentService: {},
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          if (lockFails) throw new Error('busy');
          lockHeld = true;
        },
        releaseLock: () => void (lockHeld = false),
      }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache[k] ?? null,
        put: (k: string, v: string) => void (cache[k] = v),
        remove: (k: string) => void Reflect.deleteProperty(cache, k),
      }),
    },
    Utilities: {
      formatDate: () => '2026/11/12 12:00:00',
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_a: string, input: string) => Array.from(crypto.createHash('sha256').update(input, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes: number[]) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64url'),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  gas = ctx;
  gas.createJsonResponse = (d: unknown) => d;
  const sheet = {
    getDataRange: () => ({ getValues: () => grid.map((r) => [...r]) }),
    appendRow: (r: unknown[]) => void grid.push([...r]),
    getRange: (r: number, c: number) => ({ setValue: (v: unknown) => void (grid[r - 1][c - 1] = v) }),
  };
  gas.getDataSpreadsheet = () => ({ getSheetByName: (n: string) => (n === '会員台帳' ? sheet : null) });
  gas.getOrCreateMembersSheet = () => sheet;
  gas.replyToLine = (replyToken: string, messages: Array<{ text: string }>) => void replies.push({ replyToken, text: messages[0].text });
  // ハッシュの計算が、ロックの外で行われることを見張る
  const real = vm.runInContext('pbkdf2Sha256Hex', gas) as (p: string, s: string, n: number) => string;
  gas.pbkdf2Sha256Hex = (p: string, s: string, n: number) => {
    hashCalls.push({ held: lockHeld });
    return real(p, s, n);
  };
  addMember(EMAIL, 'old-salt', legacyHash(OLD_PW, 'old-salt'), LINE_ID);
});

const start = (email: unknown = EMAIL) => gas.handleStartPasswordReset(email);
const lineSays = (token: string, userId: string) =>
  gas.handleLineMessage({ replyToken: 'rt', source: { userId }, message: { type: 'text', text: token } });
const reset = (token: string, code: unknown, password: unknown = NEW_PW, email: unknown = EMAIL) => gas.handleResetPassword(email, token, code, password);
const codeIn = (reply: string) => /認証コード: (\d{6})/.exec(reply)?.[1] ?? '';

// 合言葉をもらい、LINEで送って、認証コードを受け取るまで
const issue = (userId = LINE_ID) => {
  const token = start().token as string;
  lineSays(token, userId);
  return { token, code: codeIn(replies[replies.length - 1]?.text ?? '') };
};

describe('① 合言葉の発行(startPasswordReset)', () => {
  it('合言葉(6文字)を返す。登録されているメールでも、いないメールでも、応答の形は同じ(会員の有無が分からない)', () => {
    const a = start(EMAIL);
    const b = start('nobody@example.test');
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.status).toBe(b.status);
    [a.token, b.token].forEach((t) => expect(t).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/));
    expect(JSON.parse(cache[`line_reset_pending_${a.token}`])).toEqual({ email: EMAIL });
    expect(JSON.parse(cache[`line_reset_pending_${b.token}`])).toEqual({ email: 'nobody@example.test' });
  });

  it('メールの形がおかしい・文字でない・長すぎるときは、断る(会員の有無とは関係なく)', () => {
    [undefined, null, 5, {}, '', 'no-at', 'a@b', 'a'.repeat(250) + '@x.test'].forEach((e) => expect(gas.handleStartPasswordReset(e), String(e)).toMatchObject({ status: 'error' }));
  });

  it('メールごとに、10分に5回まで。6回目は断る。ほかのメールは、影響を受けない', () => {
    for (let i = 0; i < 5; i++) expect(start().status).toBe('success');
    expect(start()).toMatchObject({ status: 'error', code: 'reset_locked' });
    expect(start('other@example.test').status).toBe('success');
  });

  it('全体でも、10分に200回まで(キャッシュを、埋めさせない)', () => {
    for (let i = 0; i < 200; i++) expect(start(`user${i}@example.test`).status).toBe('success');
    expect(start('another@example.test')).toMatchObject({ status: 'error', code: 'reset_locked' });
  });

  it('ロックを取れないときは、混み合っていると返す', () => {
    lockFails = true;
    expect(start()).toMatchObject({ status: 'error', message: expect.stringContaining('混み合って') });
  });
});

describe('② LINE に合言葉が届いたとき', () => {
  it('送った LINE ID が、そのメールの会員に紐づくものと同じなら、6桁の認証コードを返信する', () => {
    const { token, code } = issue();
    expect(code).toMatch(/^\d{6}$/);
    expect(replies.length).toBe(1);
    expect(replies[0].text).toContain('パスワード再設定の認証コード');
    expect(JSON.parse(cache[`line_reset_otp_${token}`])).toMatchObject({ email: EMAIL, code });
  });

  it('LINE ID が違う・会員がいない・会員に LINE の紐づけが無い、は、コードを出さず、同じ短い文を返す', () => {
    const t1 = start().token;
    lineSays(t1, OTHER_LINE_ID); // 違う LINE ID
    const t2 = start('nobody@example.test').token;
    lineSays(t2, LINE_ID); // 会員がいない
    grid[1][8] = ''; // 紐づけが無い会員
    const t3 = start().token;
    lineSays(t3, LINE_ID);
    expect(replies.length).toBe(3);
    const fail = '確認できませんでした。登録のときに使ったLINEアカウントから、もう一度お試しください。';
    replies.forEach((r) => expect(r.text).toBe(fail));
    [t1, t2, t3].forEach((t) => expect(cache[`line_reset_otp_${t}`]).toBeUndefined());
  });

  it('合言葉は、1回だけ使える(2回目は、反応しない)', () => {
    const { token } = issue();
    expect(cache[`line_reset_pending_${token}`]).toBeUndefined();
    gas.handleReservationInquiry = () => undefined;
    lineSays(token, LINE_ID);
    expect(replies.length).toBe(1);
  });

  it('LINE の Webhook の秘密の確認(#204)の対象。秘密が合わなければ、無視する(合言葉を消費しない)', () => {
    props.LINE_WEBHOOK_SECRET = 'test-only-secret-abcdefghijklmnopqrstuvwxyz';
    props.LINE_WEBHOOK_ENFORCE = 'true';
    const token = start().token;
    const post = (secret?: string) =>
      gas.doPost({ postData: { contents: JSON.stringify({ events: [{ type: 'message', replyToken: 'rt', source: { userId: LINE_ID }, message: { type: 'text', text: token } }] }) }, parameter: secret ? { secret } : {} });
    expect(post('wrong')).toEqual({ status: 'ignored' });
    expect(cache[`line_reset_pending_${token}`]).toBeDefined();
    expect(replies).toEqual([]);
    expect(post(props.LINE_WEBHOOK_SECRET)).toEqual({ status: 'success' });
    expect(replies.length).toBe(1);
  });
});

describe('③ 認証コードを確かめて、パスワードを変える(resetPassword)', () => {
  it('成功: 新しい方式で保存され、新しいパスワードで入れて、古いパスワードでは入れない', () => {
    const { token, code } = issue();
    expect(reset(token, code)).toEqual({ status: 'success' });
    const { salt, hash } = row();
    expect(salt).not.toBe('old-salt');
    expect(hash).toBe('v2$10000$' + pbkdf2(NEW_PW, salt, 10000));
    gas.loginFailureKey = (e: string) => 'fail:' + e;
    gas.createSessionToken = (id: string) => 'tok-' + id;
    expect(gas.handleLogin(EMAIL, NEW_PW).status).toBe('success');
    expect(gas.handleLogin(EMAIL, OLD_PW)).toMatchObject({ status: 'error' });
  });

  it('成功したら、ログイン失敗の回数が消える(ロックされていても、入れる)。認証コードは、再使用できない', () => {
    gas.loginFailureKey = (e: string) => 'fail:' + e;
    gas.createSessionToken = (id: string) => 'tok-' + id;
    for (let i = 0; i < 5; i++) gas.handleLogin(EMAIL, 'bad' + i);
    expect(gas.handleLogin(EMAIL, OLD_PW)).toMatchObject({ message: expect.stringContaining('しばらく') });
    const { token, code } = issue();
    expect(reset(token, code).status).toBe('success');
    expect(gas.handleLogin(EMAIL, NEW_PW).status).toBe('success');
    expect(reset(token, code, 'Another3#z')).toMatchObject({ status: 'error' }); // 再使用は不可
    expect(gas.handleLogin(EMAIL, NEW_PW).status).toBe('success');
  });

  it('新しいパスワードが決まりに合わないときは、断り、認証コードを使わせない(やり直せる)', () => {
    const { token, code } = issue();
    ['short1!', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoDigits!!!', 'NoSymbol123Ab', undefined, null, 12345678, 'Aa1!' + 'x'.repeat(125)].forEach((p) => {
      expect(gas.handleResetPassword(EMAIL, token, code, p), String(p)).toMatchObject({ status: 'error' });
    });
    expect(cache[`line_reset_fail_${token}`]).toBeUndefined(); // 試す回数も、減っていない
    expect(row().salt).toBe('old-salt');
    expect(reset(token, code).status).toBe('success');
  });

  it('認証コードの間違いは、5回まで。5回目で無効になり、正しいコードでも通らない', () => {
    const { token, code } = issue();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect(reset(token, wrong)).toMatchObject({ message: '認証コードが正しくありません。' });
    expect(reset(token, wrong)).toMatchObject({ message: expect.stringContaining('無効') });
    expect(reset(token, code)).toMatchObject({ status: 'error' });
    expect(row().salt).toBe('old-salt');
  });

  it('合言葉・コードが無い・期限切れ・型違い・メールが違う、は、断る(メールが違う試しも、数える)', () => {
    const { token, code } = issue();
    expect(reset('ZZZZZZ', code)).toMatchObject({ status: 'error' });
    [undefined, null, 5, {}, ['x']].forEach((t) => expect(reset(t as string, code), String(t)).toMatchObject({ status: 'error' }));
    [undefined, null, 'abcdef'].forEach((c) => expect(reset(token, c), String(c)).toMatchObject({ status: 'error' }));
    expect(reset(token, code, NEW_PW, 'nobody@example.test')).toMatchObject({ status: 'error' });
    expect(Number(cache[`line_reset_fail_${token}`])).toBeGreaterThanOrEqual(1);
    delete cache[`line_reset_otp_${token}`]; // 期限切れ
    expect(reset(token, code)).toMatchObject({ status: 'error' });
    expect(row().salt).toBe('old-salt');
  });

  it('同じ LINE アカウントで2つの会員に紐づいていても、自分のコードで、ほかの会員のメールを指定しては、通らない(コードは、発行したメールだけに使える)', () => {
    grid.push(['t', 'other@example.test', 'NZ-2', '花子', 'old2', legacyHash('Other1!pass', 'old2'), 'レギュラー', '2026-10-01', LINE_ID]);
    const { token, code } = issue(); // 太郎のメールの合言葉・太郎のコード
    expect(reset(token, code, NEW_PW, 'other@example.test')).toMatchObject({ status: 'error' });
    expect(String(grid[2][4])).toBe('old2'); // 花子のパスワードは、変わらない
    expect(row().salt).toBe('old-salt');
  });

  it('試す回数は、確かめる前に確保する(5回試したあとは、正しいコードでも、確かめずに断る)', () => {
    const { token, code } = issue();
    cache[`line_reset_fail_${token}`] = '5';
    expect(reset(token, code)).toMatchObject({ status: 'error', message: expect.stringContaining('無効') });
    expect(row().salt).toBe('old-salt');
  });

  it('コードを受け取ったあとで、会員の LINE の紐づけが変わっていたら、断る', () => {
    const { token, code } = issue();
    grid[1][8] = OTHER_LINE_ID;
    expect(reset(token, code)).toMatchObject({ status: 'error' });
    expect(row().salt).toBe('old-salt');
  });

  it('書き込みの直前に、台帳の保存が変わっていたら、書かない(混み合っている、と返す)', () => {
    const { token, code } = issue();
    const real = gas.findMemberByEmail;
    gas.findMemberByEmail = (e: string) => {
      const m = real(e);
      grid[1][5] = legacyHash('changed-meanwhile', 'old-salt'); // 確かめたあと、計算している間に、別の更新が入った
      return m;
    };
    expect(reset(token, code)).toMatchObject({ status: 'error', message: expect.stringContaining('混み合って') });
    expect(row().hash).toBe(legacyHash('changed-meanwhile', 'old-salt'));
  });

  it('ハッシュの計算は、ロックの外で行う', () => {
    const { token, code } = issue();
    reset(token, code);
    expect(hashCalls.length).toBeGreaterThanOrEqual(1);
    expect(hashCalls.every((c) => !c.held)).toBe(true);
  });

  it('すでに新しい方式(v2)の会員も、再設定できる', () => {
    grid[1][4] = 's2';
    grid[1][5] = 'v2$10000$' + pbkdf2(OLD_PW, 's2', 10000);
    const { token, code } = issue();
    expect(reset(token, code).status).toBe('success');
    expect(row().hash).toBe('v2$10000$' + pbkdf2(NEW_PW, row().salt, 10000));
  });
});

describe('乱数と、秘密の扱い', () => {
  it('合言葉・認証コードは、Math.random を使わない(使うと、例外になる状態でも、動く)', () => {
    vm.runInContext('Math.random = function () { throw new Error("Math.random は使わない"); }', gas);
    const { token, code } = issue();
    expect(token).toMatch(/^[A-Z2-9]{6}$/);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('合言葉は32文字の中から、認証コードは0〜999999の中から、偏りなく選ぶ(固定の桁が、混ざらない)', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) for (const c of gas.secureToken(6)) counts[c] = (counts[c] || 0) + 1;
    const chars = Object.keys(counts);
    expect(chars.length).toBe(32);
    const expected = (4000 * 6) / 32; // 750
    chars.forEach((c) => expect(counts[c], c).toBeGreaterThan(expected * 0.7));
    chars.forEach((c) => expect(counts[c], c).toBeLessThan(expected * 1.3));
    const digits: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) for (const d of gas.secureCode6()) digits[d] = (digits[d] || 0) + 1;
    expect(Object.keys(digits).length).toBe(10);
    Object.values(digits).forEach((n) => expect(n).toBeGreaterThan(1800 * 0.7));
  });

  it('乱数のバイト列は、UUID の固定の桁(バージョン・種類)を使わない', () => {
    const seen: string[] = [];
    gas.Utilities.getUuid = () => {
      const u = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';
      seen.push(u);
      return u;
    };
    // 固定の桁(4 と 9)を除いた30桁の16進が、バイトになる
    expect(gas.secureRandomBytes(15)).toEqual('aaaaaaaabbbbcccdddeeeeeeeeeeee'.match(/../g)!.map((h: string) => parseInt(h, 16)));
    expect(seen.length).toBe(1);
  });

  it('認証コードの偏りを避ける(15,000,000 以上の値は、捨てて、引き直す)', () => {
    const queue = [[255, 255, 255], [228, 226, 0], [0, 0, 7]]; // 16,777,215 → 捨てる / 15,000,064 → 捨てる / 7 → 採用
    gas.secureRandomBytes = () => queue.shift();
    expect(gas.secureCode6()).toBe('000007');
    expect(queue.length).toBe(0);
  });

  it('メール・LINE の ID・認証コード・パスワードは、ログにも、応答にも、出ない', () => {
    const { token, code } = issue();
    const responses = [
      start('nobody@example.test'),
      reset(token, '000000'),
      reset(token, code),
      reset(token, code),
      reset('ZZZZZZ', '1', NEW_PW, 'x@example.test'),
    ];
    const text = logs.join('\n') + JSON.stringify(responses.map((r) => ({ ...r, token: undefined })));
    [EMAIL, 'nobody@example.test', LINE_ID, OTHER_LINE_ID, code, NEW_PW, OLD_PW].forEach((v) => expect(text, v).not.toContain(v));
  });

  it('ふつうのログイン・新規登録の流れは、そのまま動く(登録の合言葉は、再設定の合言葉と別)', () => {
    cache['line_pending_ABC234'] = '1';
    lineSays('ABC234', LINE_ID);
    expect(replies[0].text).toContain('新規登録の認証コード');
    expect(cache['line_otp_ABC234']).toBeDefined();
  });
});
