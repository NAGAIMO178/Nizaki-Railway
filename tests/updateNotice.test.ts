// 更新のお知らせの、出す・保留する(showAfter)の決まりを調べる。
// 「更新を止めない」ことがいちばん大事なので、showAfter が無い・壊れているときの動きを、特に確かめる。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isDismissed,
  buildVersionJson,
  checkForUpdate,
  delayUntilRecheck,
  evaluateUpdate,
  parseShowAfter,
} from '../src/utils/updateNotice';
import { TK_LAUNCH_AT } from '../src/utils/tkLine';

const LAUNCH = Date.parse('2026-11-01T00:00:00+09:00');
const APP = '3.49.16';
const NEW = { version: '4.0.0', notes: ['NIZAKI 2.0 を公開しました！', '2行目'] };

describe('showAfter の読み方', () => {
  it('日時として読めるものだけを、時刻にする。ほかは null(保留しない)', () => {
    expect(parseShowAfter('2026-11-01T00:00:00+09:00')).toBe(LAUNCH);
    for (const bad of [undefined, null, '', '   ', 'あした', 'abc', '2026-13-45', 123, {}, [], true]) {
      expect(parseShowAfter(bad), String(bad)).toBeNull();
    }
  });
});

describe('出す・保留する・何もしない', () => {
  it('版が同じ・版が無い・形が違うときは、何もしない', () => {
    expect(evaluateUpdate({ version: APP, notes: ['x'] }, APP, LAUNCH).kind).toBe('none');
    expect(evaluateUpdate({ notes: ['x'] }, APP, LAUNCH).kind).toBe('none');
    expect(evaluateUpdate({ version: 4 }, APP, LAUNCH).kind).toBe('none');
    for (const bad of [null, undefined, 'x', 5, []]) expect(evaluateUpdate(bad, APP, LAUNCH).kind, String(bad)).toBe('none');
  });

  it('showAfter が無いときは、今までどおり、版が違えば出す', () => {
    expect(evaluateUpdate(NEW, APP, 0)).toEqual({ kind: 'show', version: NEW.version, notes: NEW.notes });
    expect(evaluateUpdate({ version: '4.0.0' }, APP, 0)).toEqual({ kind: 'show', version: '4.0.0', notes: [] });
    expect(evaluateUpdate({ version: '4.0.0', notes: 'x' }, APP, 0)).toEqual({ kind: 'show', version: '4.0.0', notes: [] });
    expect(evaluateUpdate({ version: '4.0.0', notes: ['a', 1, null, 'b'] }, APP, 0)).toEqual({ kind: 'show', version: '4.0.0', notes: ['a', 'b'] });
  });

  it('showAfter があり、まだ前なら、出さない(保留)。時刻ちょうどと、それより後は、出す', () => {
    const data = { ...NEW, showAfter: '2026-11-01T00:00:00+09:00' };
    expect(evaluateUpdate(data, APP, LAUNCH - 1)).toEqual({ kind: 'held', showAtMs: LAUNCH });
    expect(evaluateUpdate(data, APP, LAUNCH - 24 * 3600 * 1000)).toEqual({ kind: 'held', showAtMs: LAUNCH });
    expect(evaluateUpdate(data, APP, LAUNCH)).toEqual({ kind: 'show', version: NEW.version, notes: NEW.notes });
    expect(evaluateUpdate(data, APP, LAUNCH + 1)).toEqual({ kind: 'show', version: NEW.version, notes: NEW.notes });
  });

  it('showAfter が壊れているときは、保留せず、出す(更新を止めない)', () => {
    for (const bad of ['あした', '', 'abc', 123, null, {}, [], '2026-13-45T99:99:99']) {
      expect(evaluateUpdate({ ...NEW, showAfter: bad }, APP, 0).kind, String(bad)).toBe('show');
    }
  });
});

describe('version.json を取りに行く', () => {
  const okFetch = (data: unknown): typeof fetch => (async () => ({ ok: true, json: async () => data })) as unknown as typeof fetch;

  it('取れたら判定する。取れない・読めないときは、何もしない', async () => {
    expect(await checkForUpdate(okFetch(NEW), APP, 0)).toEqual({ kind: 'show', version: NEW.version, notes: NEW.notes });
    expect(await checkForUpdate((async () => ({ ok: false })) as unknown as typeof fetch, APP, 0)).toEqual({ kind: 'none' });
    expect(await checkForUpdate((async () => { throw new Error('offline'); }) as unknown as typeof fetch, APP, 0)).toEqual({ kind: 'none' });
    expect(await checkForUpdate((async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })) as unknown as typeof fetch, APP, 0)).toEqual({ kind: 'none' });
  });

  it('いつもの取り方(時刻つきの相対パス・キャッシュなし)で取る', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ version: APP }) };
    }) as unknown as typeof fetch;
    await checkForUpdate(f, APP, 12345);
    expect(seen).toEqual({ url: './version.json?t=12345', init: { cache: 'no-store' } });
  });

  it('保留中は出ず、5分ごとの確認で、公開の時刻をまたいだら、出る(開いたまま)', async () => {
    const data = { ...NEW, showAfter: '2026-11-01T00:00:00+09:00' };
    const f = okFetch(data);
    expect((await checkForUpdate(f, APP, LAUNCH - 4 * 60 * 1000)).kind).toBe('held'); // 23:56
    expect((await checkForUpdate(f, APP, LAUNCH + 60 * 1000)).kind).toBe('show'); // 0:01
  });
});

describe('時刻の直後に、もう一度確かめる待ち時間', () => {
  it('時刻の 1 秒あとまで。もう過ぎた・長すぎるときは、待たない(null)', () => {
    expect(delayUntilRecheck(LAUNCH, LAUNCH - 60_000)).toBe(61_000);
    expect(delayUntilRecheck(LAUNCH, LAUNCH)).toBe(1000);
    expect(delayUntilRecheck(LAUNCH, LAUNCH + 1000)).toBeNull();
    expect(delayUntilRecheck(LAUNCH, LAUNCH + 60_000)).toBeNull();
    expect(delayUntilRecheck(LAUNCH, LAUNCH - 30 * 24 * 3600 * 1000)).toBeNull(); // setTimeout の上限(約24日)を超える
    expect(delayUntilRecheck(LAUNCH, LAUNCH - 20 * 24 * 3600 * 1000)).not.toBeNull();
  });
});

describe('version.json の中身(ビルド)', () => {
  it('showAfter が無いときは、これまでと同じ { version, notes } のまま(順番も同じ)', () => {
    expect(buildVersionJson('3.49.16', { notes: ['軽微な修正'] })).toBe('{"version":"3.49.16","notes":["軽微な修正"]}');
  });

  it('showAfter があれば、そのまま載る', () => {
    const json = JSON.parse(buildVersionJson('4.0.0', { notes: ['a'], showAfter: '2026-11-01T00:00:00+09:00' }));
    expect(json).toEqual({ version: '4.0.0', notes: ['a'], showAfter: '2026-11-01T00:00:00+09:00' });
  });

  it('いまの package.json と release-notes.json からは、これまでと同じ形が出る(showAfter が入るのは、書いたときだけ)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
    const notes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'release-notes.json'), 'utf-8'));
    const out = JSON.parse(buildVersionJson(pkg.version, notes));
    expect(out.version).toBe(pkg.version);
    expect(out.notes).toEqual(notes.notes);
    expect('showAfter' in out).toBe('showAfter' in notes);
  });

  it('保留する日時が書いてあるときは、いま公開を待っている機能の公開の日時(高宮線: TK_LAUNCH_AT / NIZAKI 2.0: LAUNCH_AT)と同じ時刻(ずれたら落ちる)', () => {
    const notes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'release-notes.json'), 'utf-8'));
    if (notes.showAfter === undefined) return;
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', 'launch.ts'), 'utf-8');
    const m = /export const LAUNCH_AT: string \| null = '([^']*)'/.exec(src);
    const launchTimes = [TK_LAUNCH_AT, m ? m[1] : null].filter((t): t is string => t !== null).map((t) => Date.parse(t));
    expect(launchTimes, 'どちらかの公開の日時').not.toHaveLength(0);
    expect(launchTimes).toContain(Date.parse(notes.showAfter));
  });
});

// お知らせは、機能ごとに、そのつど届ける。ただし、高宮線の予告だけは、公開の時刻(TK_LAUNCH_AT)まで隠す(その分だけ、別の版・別の組にして、showAfter をつける)。
//  形A(いまの版 4.6.2): showAfter なし・高宮線の言葉なし。すでに出した機能のお知らせが、すぐ届く
//  形B(公開の前日にマージする版 4.7.2): showAfter あり(=TK_LAUNCH_AT)・高宮線の2行 + 同じ公開で届く4行(6行)
const NOTES_A = ['マイページに、名札を出せるようにしました', '駅を選ぶとき、最寄り駅を探せるようにしました', '設定から、位置情報を許可できるようにしました'];
const NOTES_B = ['新しい路線「高宮線」ができました', '有料特急「すみかぜ」を、予約できるようになりました', 'パソコンの画面を、広く使えるようにしました', '通知を見られるようにしました', 'ご意見・不具合を、アプリから送れるようにしました', '別の端末でログインしても、予約を見られるようにしました'];
const FORM_A = { version: '4.6.2', notes: NOTES_A };
const FORM_B = { version: '4.7.2', notes: NOTES_B, showAfter: TK_LAUNCH_AT };
//  形C(いまの版 4.7.2): その更新の分だけ・showAfter なし。毎回、この行(版と文)を、その更新の分に書き換える
const NOTES_C = ['別の端末でログインしても、予約を見られるようにしました'];
const FORM_C = { version: '4.7.2', notes: NOTES_C };

describe('形A: すぐ届くお知らせ(showAfter なし・3行・高宮線の言葉なし)', () => {
  const out = JSON.parse(buildVersionJson(FORM_A.version, { notes: FORM_A.notes }));

  it('前の版(4.6.1・4.6.0 など)のアプリには、公開の時刻より前でも、すぐ出す(保留しない)', () => {
    const AT = Date.parse(TK_LAUNCH_AT as string);
    for (const app of ['4.6.1', '4.6.0', '4.5.1']) {
      for (const t of [0, AT - 1, AT, AT + 1]) expect(evaluateUpdate(out, app, t), `${app} @ ${t}`).toEqual({ kind: 'show', version: '4.6.2', notes: NOTES_A });
    }
  });

  it('すでに 4.6.2 のアプリには、出さない', () => {
    expect(evaluateUpdate(out, '4.6.2', 0).kind).toBe('none');
  });

  it('showAfter は入らない(これまでと同じ { version, notes } の形)。高宮線の言葉は、1つも入っていない(公開の前に、予告が見えない)', () => {
    expect(buildVersionJson(FORM_A.version, { notes: FORM_A.notes })).toBe(`{"version":"4.6.2","notes":${JSON.stringify(NOTES_A)}}`);
    expect(JSON.stringify(out)).not.toMatch(/高宮|すみかぜ/);
  });
});

describe('形B: 高宮線の公開のお知らせ(showAfter あり・4行)は、公開の時刻(TK_LAUNCH_AT)より前は出さず、その時刻から出す', () => {
  const AT = Date.parse(TK_LAUNCH_AT as string);
  const out = JSON.parse(buildVersionJson(FORM_B.version, { notes: FORM_B.notes, showAfter: FORM_B.showAfter }));

  it('前の版(4.6.2 など)のアプリには、公開の 1 ミリ秒前まで出さず(保留)、ちょうどの時刻とそのあとは出す', () => {
    for (const app of ['4.6.2', '4.6.1', '4.5.1']) {
      expect(evaluateUpdate(out, app, AT - 1), app).toEqual({ kind: 'held', showAtMs: AT });
      expect(evaluateUpdate(out, app, AT - 7 * 24 * 3600 * 1000), app).toEqual({ kind: 'held', showAtMs: AT });
      expect(evaluateUpdate(out, app, AT), app).toEqual({ kind: 'show', version: '4.7.2', notes: NOTES_B });
      expect(evaluateUpdate(out, app, AT + 3600 * 1000), app).toEqual({ kind: 'show', version: '4.7.2', notes: NOTES_B });
    }
  });

  it('すでに同じ版のアプリには、いつでも出さない', () => {
    for (const t of [AT - 1, AT, AT + 1]) expect(evaluateUpdate(out, '4.7.2', t).kind).toBe('none');
  });

  it('showAfter は、高宮線の公開の日時(TK_LAUNCH_AT)と同じ', () => {
    expect(Date.parse(out.showAfter)).toBe(AT);
  });
});

describe('いまの package.json と release-notes.json は、形A・形B・形C のどれか', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8')) as { version: string };
  const notes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'release-notes.json'), 'utf-8')) as { notes: string[]; showAfter?: string };
  const out = JSON.parse(buildVersionJson(pkg.version, notes));

  it('出る version.json が、形A(4.6.2)・形B(4.7.2)・形C(4.7.2)のどれかと、そのまま同じ', () => {
    const a = JSON.parse(buildVersionJson(FORM_A.version, { notes: FORM_A.notes }));
    const b = JSON.parse(buildVersionJson(FORM_B.version, { notes: FORM_B.notes, showAfter: FORM_B.showAfter }));
    const c = JSON.parse(buildVersionJson(FORM_C.version, { notes: FORM_C.notes }));
    expect([a, b, c]).toContainEqual(out);
  });

  it('showAfter が無い(すぐ届く)形に、高宮線の言葉が入っていない。showAfter がある形は、決めた6行', () => {
    if (notes.showAfter === undefined) {
      expect(JSON.stringify(notes.notes)).not.toMatch(/高宮|すみかぜ/);
    } else {
      expect(Date.parse(notes.showAfter)).toBe(Date.parse(TK_LAUNCH_AT as string));
      // 公開の日時まで出さない形(4.7.2): 高宮線の2行のあとに、同じ公開で届く4行(パソコンの画面・通知・ご意見・別の端末の予約)
      expect(notes.notes.slice(0, 2)).toEqual(NOTES_B.slice(0, 2));
      expect(notes.notes).toEqual(NOTES_B);
    }
  });

  it('いまの内容は、その更新の分だけ(形C: 1行・showAfter なし)', () => {
    expect(notes.notes).toEqual(NOTES_C);
    expect(notes.showAfter).toBeUndefined();
    expect(pkg.version).toBe(FORM_C.version);
  });
});

describe('「あとで」で閉じたあと', () => {
  it('閉じた版では、もう出さない。新しい版が来たら、また出る。まだ閉じていなければ、出る', () => {
    expect(isDismissed('4.1.1', '4.1.1')).toBe(true);
    expect(isDismissed('4.1.1', '4.1.2')).toBe(false);
    expect(isDismissed(null, '4.1.1')).toBe(false);
  });
});
