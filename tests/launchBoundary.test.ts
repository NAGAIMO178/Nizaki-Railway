// 公開(2026-11-01 0:00 日本時間)の前後の切り替えを、時計を固定して確かめる。
// launch.ts は、本物の中身のまま、LAUNCH_AT の行だけを '2026-11-01T00:00:00+09:00' にしたもの(tests/helpers/fixedLaunch.ts)を使う。
// 画面は、react-dom/server で、その時刻の見え方を作って調べる(動かさずに、文字だけ見る)。
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/launch', async () => (await import('./helpers/fixedLaunch')).buildLaunchModule('2026-11-01T00:00:00+09:00'));
vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import LaunchCountdown from '../src/components/LaunchCountdown';
import { EventsTab } from '../src/components/EventsTab';
import { NPointModal } from '../src/components/NPointModal';
import { ReservationTab } from '../src/components/ReservationTab';
import { SettingsTab } from '../src/components/SettingsTab';
import { TimetableTab } from '../src/components/TimetableTab';
import { isLaunchBonusOpen, isLaunched, withPreviewFlag, LAUNCH_AT } from '../src/utils/launch';
import { buildTicketUrl, ticketRouteToken } from '../src/utils/ticketToken';
import { markEventJoined, readEventProgress, getEventState, isEventEligibleOrder, loadEventData } from '../src/utils/eventTare';
import { EXPRESS_TYPES, findExpressTrips, getCachedExpressData } from '../src/utils/diaTimetable';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// 日本時間の日時で、時計を合わせる
const JST = (s: string) => new Date(`${s}+09:00`);
// ダイヤの時刻は、端末の時刻帯で見るので、1日のなかの時刻は、端末の時刻で作る(11/1 の h:m)
const L = (h: number, m = 0) => new Date(2026, 10, 1, h, m);
const setClock = (s: string) => vi.setSystemTime(JST(s));
const win = (globalThis as unknown as { window: Record<string, unknown> & { location: { search: string; hash: string } } }).window;
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const BEFORE = '2026-10-31T23:59:59';
const AT = '2026-11-01T00:00:00';
const AFTER = '2026-11-01T00:00:01';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setClock(BEFORE);
  win.location.search = ''; // 作業用リンクの指定は、はじめは無い
  win.location.hash = '';
  localStorage.clear();
  Object.assign(win, {
    navigator: { userAgent: 'test', onLine: true, platform: '' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 400,
  });
});
afterEach(() => {
  win.location.search = '?preview=1';
  win.location.hash = '';
  localStorage.clear();
  vi.useRealTimers();
});

describe('1・2. 公開の切り替わり(isLaunched)', () => {
  it('公開前(10/31 23:59:59)は偽、0:00:00 ちょうどと 0:00:01 は真', () => {
    setClock(BEFORE);
    expect(isLaunched()).toBe(false);
    setClock('2026-10-31T23:59:59.999');
    expect(isLaunched()).toBe(false);
    setClock(AT);
    expect(isLaunched()).toBe(true);
    setClock(AFTER);
    expect(isLaunched()).toBe(true);
    setClock('2027-01-01T00:00:00');
    expect(isLaunched()).toBe(true);
  });

  it('公開の時刻は、端末の時刻帯に関係なく、日本時間の 11/1 0:00', () => {
    expect(Date.parse(LAUNCH_AT!)).toBe(JST(AT).getTime());
  });
});

describe('4. ?preview=1 と ?preview=0', () => {
  it('公開前: ?preview=1 で公開後の画面が見え、覚える。?preview=0 で消える', () => {
    setClock(BEFORE);
    expect(isLaunched()).toBe(false);
    win.location.search = '?preview=1';
    expect(isLaunched()).toBe(true);
    win.location.search = ''; // 指定が無くても、覚えている
    expect(isLaunched()).toBe(true);
    win.location.search = '?preview=0';
    expect(isLaunched()).toBe(false);
    win.location.search = '';
    expect(isLaunched()).toBe(false);
  });

  it('公開後(0:00 以降)は、preview の指定に関係なく、公開後の画面', () => {
    setClock(AT);
    for (const search of ['', '?preview=0', '?preview=1', '?preview=0']) {
      win.location.search = search;
      expect(isLaunched(), search).toBe(true);
    }
    localStorage.clear();
    win.location.search = '?preview=0';
    expect(isLaunched()).toBe(true);
  });

  it('QRのリンクには、公開の日時が入っているので、?preview=1 は付かない(公開前も、公開後も)', () => {
    for (const t of [BEFORE, AT]) {
      setClock(t);
      expect(withPreviewFlag(new URL('https://example.com/app/')).searchParams.has('preview'), t).toBe(false);
      expect(buildTicketUrl('TOKEN', { origin: 'https://example.com', pathname: '/app/' })).not.toContain('preview');
    }
  });
});

describe('5. 公開記念ボーナスの期間(公開から30日)', () => {
  it('公開前は出ない。公開から 11/30 の終わりまで出て、12/1 0:00 に消える', () => {
    setClock(BEFORE);
    expect(isLaunchBonusOpen()).toBe(false);
    setClock(AT);
    expect(isLaunchBonusOpen()).toBe(true);
    setClock('2026-11-15T12:00:00');
    expect(isLaunchBonusOpen()).toBe(true);
    setClock('2026-11-30T23:59:59');
    expect(isLaunchBonusOpen()).toBe(true);
    setClock('2026-12-01T00:00:00');
    expect(isLaunchBonusOpen()).toBe(false);
    setClock('2026-12-01T00:00:01');
    expect(isLaunchBonusOpen()).toBe(false);
  });

  it('公開前に、preview で見ているときは、案内が出る。12/1 以降は、preview でも出ない', () => {
    setClock(BEFORE);
    win.location.search = '?preview=1';
    expect(isLaunchBonusOpen()).toBe(true);
    setClock('2026-12-01T00:00:00');
    expect(isLaunchBonusOpen()).toBe(false);
  });
});

describe('1・2. 画面(その時刻の見え方)', () => {
  const eventTare = { joined: false, cleared: false, onOpen: () => undefined };
  const events = () => strip(renderToString(createElement(EventsTab, { eventTare })));
  const timetable = () => strip(renderToString(createElement(TimetableTab as never, { onReserve: () => undefined })));
  const settings = () =>
    strip(renderToString(createElement(SettingsTab as never, { nPointBalance: 0, registeredStations: [], onUpdateRegisteredStations: () => undefined, onOpenNPointModal: () => undefined })));
  const nPoint = () =>
    strip(renderToString(createElement(NPointModal as never, { isOpen: true, onClose: () => undefined, balance: 100, currentUser: { email: 'a@b.c', name: 'x', memberId: 'M0000123' } })));
  const reservation = () =>
    strip(
      renderToString(
        createElement(ReservationTab as never, { activeOrder: null, onOpenDeliveryCatalog: () => undefined, onConfirmOrder: () => undefined, onCancelOrder: () => undefined, isLoggedIn: true, onRequireLogin: () => undefined, nPointBalance: 100, currentUser: { email: 'a@b.c', name: 'x' } })
      )
    );

  it('ホームの「公開まで あと○日」の帯: 公開前は出て、公開の時刻で消える(帯が、自分で消える)', () => {
    setClock(BEFORE);
    const before = strip(renderToString(createElement(LaunchCountdown)));
    expect(before).toContain('NIZAKI 2.0 公開まで');
    expect(before).toMatch(/00\s*:\s*00\s*:\s*01/);
    setClock('2026-10-25T00:00:00'); // ちょうど7日前
    expect(strip(renderToString(createElement(LaunchCountdown)))).toMatch(/7\s*日/);
    setClock(AT);
    expect(renderToString(createElement(LaunchCountdown))).toBe('');
    setClock(AFTER);
    expect(renderToString(createElement(LaunchCountdown))).toBe('');
  });

  it('イベント: 公開前は、試運転の謎が出て、公開記念イベントは出ない。公開後は、反対(雅石は、どちらも残る)', () => {
    setClock(BEFORE);
    const before = events();
    expect(before).toContain('斬丸と三つの雅石');
    expect(before).toContain('消えた試運転列車の謎');
    expect(before).not.toContain('幻のタレ');
    expect(before).toContain('参加可能イベント（タップして開始）');
    setClock(AT);
    const after = events();
    expect(after).toContain('斬丸と三つの雅石');
    expect(after).not.toContain('消えた試運転列車の謎');
    expect(after).toContain('幻のタレと消えた頑固職人');
    expect(after).not.toContain('（タップして開始）');
  });

  it('時刻表: 経路検索は、公開前は出ず、公開後に出る', () => {
    setClock(BEFORE);
    expect(timetable()).not.toContain('経路検索');
    setClock(AT);
    expect(timetable()).toContain('経路検索');
  });

  it('設定: 遅れの知らせの設定は、公開後だけ。管理者の入口の帯は、公開前だけ', () => {
    setClock(BEFORE);
    const before = settings();
    expect(before).not.toContain('列車の遅れの知らせ');
    expect(before).toContain('管理者用設定');
    setClock(AT);
    const after = settings();
    expect(after).toContain('列車の遅れの知らせ');
    expect(after).not.toContain('管理者用設定');
  });

  it('会員証: 本物のバーコード(画像で保存)は、公開後だけ', () => {
    setClock(BEFORE);
    expect(nPoint()).toContain('バーコードは表示イメージです');
    expect(nPoint()).not.toContain('画像で保存');
    setClock(AT);
    expect(nPoint()).toContain('画像で保存');
    expect(nPoint()).not.toContain('バーコードは表示イメージです');
  });

  it('予約: 「特急券・座席指定予約」の見出しは、公開前だけ', () => {
    setClock(BEFORE);
    expect(reservation()).toContain('特急券・座席指定予約');
    setClock(AT);
    expect(reservation()).not.toContain('特急券・座席指定予約');
  });
});

describe('1・2. QR乗車券・ダイヤ・混雑・番線', () => {
  it('QR乗車券のリンクを開いても、公開前は、いつものアプリのまま。公開後は、検札の画面', () => {
    const hash = `#/t/ORDER-123.${'a'.repeat(12)}`;
    win.location.hash = hash;
    setClock(BEFORE);
    expect(ticketRouteToken()).toBeNull();
    setClock(AT);
    expect(ticketRouteToken()).not.toBeNull();
  });

  // 読み込むファイルの名前を記録して、新旧どちらのダイヤ・混雑データを読んだか見る
  const recordFetch = () => {
    const urls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input).split('?')[0]);
      return orig(input, init);
    }) as typeof fetch;
    return { urls, restore: () => void (globalThis.fetch = orig) };
  };

  it('公開前は data/dia(旧ダイヤ)・混雑なし・番線なし。公開後は data/dia-2(新ダイヤ)・混雑あり・番線あり', async () => {
    const result: Record<string, { urls: string[]; platform: boolean; crowd: boolean; joined: string }> = {};
    for (const [label, t] of [['before', BEFORE], ['after', AT]] as const) {
      vi.resetModules();
      setClock(t);
      const rec = recordFetch();
      try {
        const dia = await import('../src/utils/diaTimetable');
        const route = await import('../src/utils/routeSearch');
        const line = await dia.loadLineData('Y');
        const found = await route.searchRoutes('東京', '横浜', 7 * 3600, undefined, 1);
        const express = await dia.loadExpressData('meguri');
        result[label] = {
          urls: rec.urls,
          platform: Array.isArray(line.trains[0][9]),
          crowd: found.length > 0 && found[0].crowd !== undefined,
          joined: express.code,
        };
      } finally {
        rec.restore();
      }
    }
    const b = result.before;
    const a = result.after;
    expect(b.urls.some((u) => u.includes('/data/dia/'))).toBe(true);
    expect(b.urls.some((u) => u.includes('/data/dia-2/'))).toBe(false);
    expect(b.urls.some((u) => u.includes('crowd-2'))).toBe(false);
    expect(b.platform).toBe(false);
    expect(b.crowd).toBe(false);
    expect(b.joined).toBe('TC'); // 公開前のめぐりは、土浦線だけ
    expect(a.urls.some((u) => u.includes('/data/dia-2/'))).toBe(true);
    expect(a.urls.some((u) => u.includes('/data/dia/'))).toBe(false);
    expect(a.urls.some((u) => u.includes('crowd-2'))).toBe(true);
    expect(a.platform).toBe(true);
    expect(a.crowd).toBe(true);
    expect(a.joined).toBe('SC+TC'); // 公開後のめぐりは、東京〜日立の通し
  });
});

describe('3. アプリを開いたまま 0:00 をまたぐ(今の動きの記録。直していない)', () => {
  it('その場で判定(isLaunched)は、時計が 0:00 を過ぎた瞬間から、真になる', () => {
    setClock(BEFORE);
    expect(isLaunched()).toBe(false);
    setClock(AT); // 再読み込みなしで、時計だけ進む
    expect(isLaunched()).toBe(true);
  });

  it('すでに読んだ路線のダイヤは、古いまま。0:00 のあとに、はじめて読む路線だけが、新しいダイヤ(混ざる)', async () => {
    vi.resetModules();
    setClock(BEFORE);
    const dia = await import('../src/utils/diaTimetable');
    const yBefore = await dia.loadLineData('Y');
    expect(Array.isArray(yBefore.trains[0][9])).toBe(false);
    setClock('2026-11-01T00:00:10'); // 開いたまま、公開の時刻を過ぎた
    const yAfter = await dia.loadLineData('Y');
    expect(yAfter).toBe(yBefore); // 読み込みずみのダイヤが、そのまま返る
    expect(Array.isArray(yAfter.trains[0][9])).toBe(false);
    const ni = await dia.loadLineData('NI'); // まだ読んでいなかった路線
    expect(Array.isArray(ni.trains[0][9])).toBe(true);
  });
});

describe('6. イベント(公開の境と、時計に合った進み方)', () => {
  const DATE = '2026-11-01'; // 公開の日。最初の対象の便は、5:35発
  let order: { orderId: string; trainName: string; boardingStation: string; destinationStation: string; reservedDate: string };
  const oldOrder = () => ({ ...order, orderId: 'old', reservedDate: '2026-10-31' });

  beforeEach(async () => {
    setClock(AT);
    await loadEventData();
    const trips = findExpressTrips(getCachedExpressData('meguri')!, EXPRESS_TYPES.meguri.typeName, '東京', '日立');
    expect(trips[1].depTime).toBe('05:35');
    order = { orderId: 'new', trainName: trips[1].trainName, boardingStation: '東京駅', destinationStation: '土浦駅', reservedDate: DATE };
  });

  it('公開前は、イベントは何も動かない(参加の印も付かない)', () => {
    setClock(BEFORE);
    markEventJoined('a@example.com', undefined, Date.now());
    expect(localStorage.getItem('nizaki_event_tare-2026:a@example.com')).toBeNull();
    expect(getEventState(true, [order], L(5, 40)).phase).toBe('not_joined');
    expect(isEventEligibleOrder(order)).toBe(false);
  });

  it('公開後: 参加 → 予約 → 乗車中 → 到着 と、時計に合って進む', () => {
    setClock(AT);
    markEventJoined('a@example.com', undefined, Date.now()); // 公開の瞬間に参加
    const progress = readEventProgress('a@example.com');
    expect(progress.joined).toBe(true);
    const state = (now: Date, orders = [order]) => getEventState(progress.joined, orders, now, { cleared: progress.cleared, joinedAt: progress.joinedAt });
    expect(state(L(0, 40), []).phase).toBe('no_reservation'); // 参加したが、予約がまだ
    expect(state(L(0, 40)).phase).toBe('before_departure'); // 予約した(5:35発を、夜のうちに)
    expect(state(L(5, 0)).phase).toBe('before_departure');
    expect(state(L(5, 45)).phase).toBe('riding'); // 発車のあと(遅れがあっても、5分以内)
    expect(state(L(5, 45)).fatherPosition).not.toBeNull(); // 親父さんは、1本前(5:05発)で、走っている
    expect(state(L(7, 0)).phase).toBe('arrived'); // 土浦に着いた(6:12ごろ)
    expect(getEventState(true, [order], L(7, 0), { cleared: true }).phase).toBe('cleared');
  });

  it('公開より前の日(10/31)の予約は、対象にならない', () => {
    setClock(AT);
    expect(isEventEligibleOrder(oldOrder())).toBe(false);
    expect(getEventState(true, [oldOrder()], L(5, 45)).phase).toBe('no_reservation');
  });
});

describe('7. 版番号・お知らせ', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };
  const notes = JSON.parse(read('release-notes.json')) as { notes: unknown };

  it('版番号は X.Y.Z の形で、お知らせ(release-notes.json)は、中身のある一覧(今の版でも、4.0.0 でも成り立つ)', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Array.isArray(notes.notes)).toBe(true);
    const list = notes.notes as unknown[];
    expect(list.length).toBeGreaterThan(0);
    list.forEach((n) => {
      expect(typeof n).toBe('string');
      expect((n as string).trim().length).toBeGreaterThan(0);
    });
    expect(new Set(list).size).toBe(list.length);
    // 公開のリポジトリなので、作業用リンクの書き方は、お知らせに入れない
    expect(JSON.stringify(list)).not.toMatch(/preview/i);
  });

  it('ビルドは、package.json の版と release-notes.json の中身を、そのまま version.json と画面の版数に使う', () => {
    const config = read('vite.config.ts');
    expect(config).toContain('version: pkg.version');
    expect(config).toContain('notes: releaseNotes.notes');
    expect(config).toContain('__APP_VERSION__: JSON.stringify(pkg.version)');
  });

  it('公開の日時(LAUNCH_AT)が入っているときは、カウントダウンの先(COUNTDOWN_TO)と同じ時刻。4.0.0 以降では、必ず入っている', () => {
    const src = read('src/utils/launch.ts');
    const launchAt = /export const LAUNCH_AT: string \| null = (null|'([^']*)')/.exec(src);
    const countdown = /export const COUNTDOWN_TO = '([^']*)'/.exec(src);
    expect(launchAt).not.toBeNull();
    expect(countdown).not.toBeNull();
    expect(Date.parse(countdown![1])).toBe(JST(AT).getTime());
    if (launchAt![2] !== undefined) expect(Date.parse(launchAt![2])).toBe(Date.parse(countdown![1]));
    const major = Number(pkg.version.split('.')[0]);
    if (major >= 4) expect(launchAt![2]).toBeDefined();
  });
});

describe('公開前に出さない決まりが、コードに残っている(組み立てを動かせない所の見張り)', () => {
  it('App の、公開後だけの入口は、isLaunched() で守られている', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/!isLaunched\(\) && <LaunchCountdown/);
    expect(app).toMatch(/enabled: isLaunched\(\) && delayMode !== 'off'/); // 遅れの見張り
    expect(app).toMatch(/enabled: isLaunched\(\) && isLoggedIn/); // 予約の見守り(発車リマインド)
    expect(app).toMatch(/isLaunched\(\) \? TicketQRModal : QRCodeModal/); // QR乗車券
    expect(app).toMatch(/eventTare=\{isLaunched\(\)/); // イベントの入口
  });

  it('公開後だけの機能を持つ画面・部品は、isLaunched を使っている(複数席・ポイントの支払い・番線・混雑・経路検索 など)', () => {
    const files = [
      'src/components/ReservationTab.tsx', // 複数席(MAX_SEATS)・東京〜日立の通し
      'src/components/EDeliveryModal.tsx', // 席ごとの配達・ポイントの支払い
      'src/components/RouteSearch.tsx',
      'src/components/RouteDetail.tsx', // 番線・混雑・号数
      'src/components/MyStationCard.tsx', // 番線
      'src/components/TrainDetailV2.tsx', // 番線
      'src/components/MyPageModal.tsx',
      'src/components/ArrivalResults.tsx',
      'src/utils/routeSearch.ts', // 混雑
      'src/utils/diaTimetable.ts', // 新ダイヤ・混雑・直通
      'src/utils/useCloudAccount.ts',
      'src/utils/ticketToken.ts',
      'src/utils/eventTare.ts',
    ];
    for (const f of files) expect(read(f), f).toContain('isLaunched');
  });
});
