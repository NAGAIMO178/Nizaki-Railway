// 公開記念イベントの中の計算(eventTare)を、実際のダイヤで調べる。
// 日付は、2026-11-02(月)。遅れは、日付と列車番号で決まる自動の遅れと、運行指令(テストで設定)。
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { disruptionManager, type LineDisruption } from '../src/utils/disruptionManager';
import { EXPRESS_TYPES, findExpressTrips, getCachedExpressData } from '../src/utils/diaTimetable';
import {
  EVENT_DESTINATIONS,
  EVENT_TARE,
  EventOrder,
  EventStore,
  getEventState,
  isEventEligibleOrder,
  loadEventData,
  markEventJoined,
  readEventProgress,
  setEventCleared,
} from '../src/utils/eventTare';
import { eventStateFor } from '../src/utils/eventTareState';
import { resetEvent } from '../src/utils/eventTareJoin';

const DATE = '2026-11-02';
const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 2, h, m, s);
const sec = (n: number) => new Date(2026, 10, 2, 0, 0, n);
const win = (globalThis as unknown as { window: { location: { search: string } } }).window;

const meguri = () => {
  const data = getCachedExpressData('meguri')!;
  return findExpressTrips(data, EXPRESS_TYPES.meguri.typeName, '東京', '日立');
};
const orderOf = (i: number, dest = '土浦', over: Partial<EventOrder> = {}): EventOrder => ({
  orderId: `o${i}`,
  trainName: meguri()[i].trainName,
  boardingStation: '東京駅',
  destinationStation: `${dest}駅`,
  reservedDate: DATE,
  ...over,
});

const disruption = (over: Partial<LineDisruption>): LineDisruption => ({
  lineId: 'tsuchiura', lineName: '土浦線', code: 'TC', statusType: 'delay', targetDirection: 'both', maxDelayMinutes: 5,
  durationUntil: '', section: '全線', reason: 'x', customMessage: '', useCustomMessage: false, linkToSystem: true, updatedAt: '', ...over,
});

beforeAll(async () => {
  await loadEventData();
});
beforeEach(() => localStorage.clear());
afterEach(() => {
  win.location.search = '?preview=1';
  localStorage.clear();
  vi.useRealTimers();
});

describe('めぐり(東京発・日立行き)のダイヤの事実', () => {
  it('1日37本(5:05〜23:05)で、東京〜土浦は、どの便も37分', () => {
    const trips = meguri();
    expect(trips).toHaveLength(37);
    expect(trips[0].depTime).toBe('05:05');
    expect(trips[36].depTime).toBe('23:05');
    const data = getCachedExpressData('meguri')!;
    const toTsuchiura = findExpressTrips(data, EXPRESS_TYPES.meguri.typeName, '東京', EVENT_TARE.fatherStation);
    expect(toTsuchiura).toHaveLength(37);
    // 東京〜土浦は、どの便も、同じ所要(秒まであるので、36分40秒。分に丸めて37分)
    const first = toTsuchiura[0].arrSec - toTsuchiura[0].depSec;
    toTsuchiura.forEach((t) => {
      expect(t.arrSec - t.depSec, t.trainName).toBe(first);
      expect(t.minutes, t.trainName).toBe(37);
    });
  });

  it('対象の便は、始発をのぞく36本', () => {
    const eligible = meguri().filter((_, i) => isEventEligibleOrder(orderOf(i)));
    expect(eligible).toHaveLength(36);
    expect(isEventEligibleOrder(orderOf(0))).toBe(false);
    expect(isEventEligibleOrder(orderOf(1))).toBe(true);
  });
});

describe('対象の予約の判定', () => {
  it('降りる駅が、土浦・ひたちなか海浜公園・日立なら対象。それより手前は対象外', () => {
    EVENT_DESTINATIONS.forEach((d) => expect(isEventEligibleOrder(orderOf(5, d)), d).toBe(true));
    for (const d of ['北千住', '松戸', '柏']) expect(isEventEligibleOrder(orderOf(5, d)), d).toBe(false);
  });

  it('東京発・めぐり以外は、対象外', () => {
    expect(isEventEligibleOrder(orderOf(5, '土浦', { boardingStation: '松戸駅' }))).toBe(false);
    expect(isEventEligibleOrder(orderOf(5, '土浦', { boardingStation: undefined }))).toBe(false);
    expect(isEventEligibleOrder(orderOf(5, '土浦', { destinationStation: undefined }))).toBe(false);
    expect(isEventEligibleOrder(orderOf(5, '土浦', { trainName: '特急あやみ 101号' }))).toBe(false);
    expect(isEventEligibleOrder(orderOf(5, '土浦', { trainName: '特急めぐり 99号' }))).toBe(false);
  });

  it('駅名の「駅」は、あってもなくても同じ', () => {
    expect(isEventEligibleOrder(orderOf(5, '土浦', { boardingStation: '東京', destinationStation: '土浦' }))).toBe(true);
  });
});

describe('取り消した予約・乗車日(リンクの指定で公開後の画面を見ているとき)', () => {
  it('取り消した予約の記録は、対象にならない', () => {
    expect(isEventEligibleOrder(orderOf(5))).toBe(true);
    expect(isEventEligibleOrder(orderOf(5, '土浦', { result: 'cancelled' }))).toBe(false);
    expect(isEventEligibleOrder(orderOf(5, '土浦', { result: 'completed' }))).toBe(true);
    expect(getEventState(true, [orderOf(5, '土浦', { result: 'cancelled' })], at(8)).phase).toBe('no_reservation');
  });

  it('公開前の画面の確認(preview)では、乗車日がイベントの開始より前でも、試せる', () => {
    // この確認では、本物の公開の判定(LAUNCH_AT)は、まだ来ていない
    expect(isEventEligibleOrder(orderOf(5, '土浦', { reservedDate: '2026-10-01' }))).toBe(true);
  });
});

describe('進行の段階', () => {
  const trip = 10;
  const o = () => orderOf(trip);
  const depMs = () => meguri()[trip].depSec;

  it('参加前・予約なし・対象外の予約は、それぞれの段階', () => {
    expect(getEventState(false, [o()], at(8)).phase).toBe('not_joined');
    expect(getEventState(true, [], at(8)).phase).toBe('no_reservation');
    expect(getEventState(true, [orderOf(0)], at(8)).phase).toBe('no_reservation');
    expect(getEventState(true, [orderOf(trip, '柏')], at(8)).phase).toBe('no_reservation');
  });

  it('発車の前・乗車中・着いたあと、と進む。クリア済みは、いつでも cleared', () => {
    const dep = depMs();
    const before = getEventState(true, [o()], sec(dep - 120));
    expect(before.phase).toBe('before_departure');
    expect(before.orderId).toBe(`o${trip}`);
    expect(before.playerTrain?.trainNo).toBe(meguri()[trip].code);
    expect(before.playerTrain!.scheduledDepartAt).toEqual(sec(dep));
    expect(getEventState(true, [o()], sec(dep + 60)).phase).toBe('riding');
    expect(getEventState(true, [o()], sec(dep + 3 * 3600)).phase).toBe('arrived');
    expect(getEventState(true, [o()], sec(dep - 120), { cleared: true }).phase).toBe('cleared');
    expect(getEventState(false, [o()], sec(dep + 60), { cleared: true }).phase).toBe('cleared');
  });

  it('複数の予約があれば、まだ終わっていない、いちばん早く終わるもの。みな終わっていれば、いちばん最近のもの', () => {
    const a = orderOf(10);
    const b = orderOf(20);
    const t10 = meguri()[10].depSec;
    expect(getEventState(true, [b, a], sec(t10 - 600)).orderId).toBe('o10');
    expect(getEventState(true, [a, b], sec(meguri()[20].depSec - 600)).orderId).toBe('o20');
    expect(getEventState(true, [a, b], at(23, 59)).orderId).toBe('o20');
  });
});

describe('親父さんの位置と残り時間(遅れなし)', () => {
  const trip = 12; // プレイヤー。親父さんは、1本前(trip 11)
  const find = () => {
    // 自動の遅れが、プレイヤー・親父さんとも、無い日の便を探す(遅れなしの、きれいな数で調べるため)
    for (let i = 1; i < 37; i++) {
      const s = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec + 60));
      if (s.delayMinutes.player === 0 && s.delayMinutes.father === 0) return i;
    }
    throw new Error('遅れのない便が見つからない');
  };

  it('親父さんが土浦に着くのは、プレイヤーの30分前(1本前・30分おきのダイヤ)。残り時間が正しく減る', () => {
    const i = find();
    const dep = meguri()[i].depSec;
    const data = getCachedExpressData('meguri')!;
    const toTsuchiura = findExpressTrips(data, EXPRESS_TYPES.meguri.typeName, '東京', EVENT_TARE.fatherStation);
    const playerArr = toTsuchiura[i].arrSec;
    const fatherArr = toTsuchiura[i - 1].arrSec;
    expect(playerArr - fatherArr).toBe(30 * 60);
    const s = getEventState(true, [orderOf(i)], sec(dep));
    expect(s.minutesToPlayerArrival).toBe(Math.ceil((playerArr - dep) / 60));
    expect(s.minutesToFatherArrival).toBe(Math.ceil((fatherArr - dep) / 60));
    const later = getEventState(true, [orderOf(i)], sec(fatherArr - 90));
    expect(later.minutesToFatherArrival).toBe(2); // 90秒前 → 切り上げて 2 分
    const justAfter = getEventState(true, [orderOf(i)], sec(fatherArr + 1));
    expect(justAfter.minutesToFatherArrival).toBe(0);
    expect(justAfter.phase).toBe('riding'); // プレイヤーは、まだ着いていない
    const down = getEventState(true, [orderOf(i)], sec(playerArr + 1));
    expect(down.phase).toBe('arrived');
    expect(down.minutesToPlayerArrival).toBe(0);
  });

  it('親父さんの位置は、出発前は null。東京から日立へ、順に進み、土浦に着く時刻に「土浦に停車中」になる', () => {
    const i = find();
    const fatherDep = meguri()[i - 1].depSec;
    const order = orderOf(i);
    expect(getEventState(true, [order], sec(fatherDep - 60)).fatherPosition).toBeNull();
    const seen: string[] = [];
    let tsuchiuraAt: number | null = null;
    for (let t = fatherDep; t <= fatherDep + 90 * 60; t += 30) {
      const p = getEventState(true, [order], sec(t)).fatherPosition;
      if (!p) continue;
      const label = p.atStation ? `@${p.atStation}` : `${p.between![0]}>${p.between![1]}`;
      if (seen[seen.length - 1] !== label) seen.push(label);
      if (p.atStation === '土浦' && tsuchiuraAt === null) tsuchiuraAt = t;
    }
    expect(seen[0]).toBe('東京>北千住'); // 始発の東京は、発車の瞬間から走り出す(停車中の表示は無い)
    expect(seen).toContain('@北千住');
    expect(seen).toContain('柏>土浦');
    expect(seen).toContain('ひたちなか海浜公園>日立');
    // 日立に着いたあとは、位置なし(終着)
    expect(getEventState(true, [order], sec(fatherDep + 80 * 60)).fatherPosition).toBeNull();
    // 土浦に着く時刻は、ダイヤの到着(30秒きざみの確認)
    const data = getCachedExpressData('meguri')!;
    const arr = findExpressTrips(data, EXPRESS_TYPES.meguri.typeName, '東京', EVENT_TARE.fatherStation)[i - 1].arrSec;
    expect(tsuchiuraAt).not.toBeNull();
    expect(tsuchiuraAt! - arr).toBeGreaterThanOrEqual(0);
    expect(tsuchiuraAt! - arr).toBeLessThan(30);
  });
});

describe('遅れを入れた計算', () => {
  it('土浦線の遅れがあれば、土浦への到着が、その分遅くなる(列車位置と同じ遅れ)', () => {
    disruptionManager.setLineDisruption(disruption({ maxDelayMinutes: 5 }));
    let checked = 0;
    for (let i = 1; i < 37; i++) {
      const dep = meguri()[i].depSec;
      const s = getEventState(true, [orderOf(i)], sec(dep));
      if (s.delayMinutes.player === 0) continue;
      checked++;
      expect(s.minutesToPlayerArrival).toBe(37 + s.delayMinutes.player);
      expect(s.playerTrain!.scheduledDepartAt).toEqual(sec(dep));
    }
    expect(checked).toBeGreaterThan(10);
    disruptionManager.clearAllDisruptions();
  });

  it('親父さんの列車が、プレイヤーの列車より、あとに着くときは、親父さんが着くまで「乗車中」', () => {
    disruptionManager.setLineDisruption(disruption({ maxDelayMinutes: 120 }));
    let found = -1;
    for (let i = 1; i < 37; i++) {
      const s = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec));
      if (s.minutesToFatherArrival! > s.minutesToPlayerArrival!) {
        found = i;
        break;
      }
    }
    expect(found).toBeGreaterThan(0);
    const dep = meguri()[found].depSec;
    const s0 = getEventState(true, [orderOf(found)], sec(dep));
    const playerArr = dep + s0.minutesToPlayerArrival! * 60;
    const fatherArr = dep + s0.minutesToFatherArrival! * 60;
    expect(getEventState(true, [orderOf(found)], sec(playerArr + 30)).phase).toBe('riding');
    expect(getEventState(true, [orderOf(found)], sec(fatherArr + 30)).phase).toBe('arrived');
    disruptionManager.clearAllDisruptions();
  });
});

describe('参加の時刻(joinedAt): 参加より前に着いた予約は、対象にしない', () => {
  // 遅れのない便(位置や時刻の計算が、きれいな数になる)
  const clean = (() => {
    let found = -1;
    return () => {
      if (found > 0) return found;
      for (let i = 2; i < 37; i++) {
        const s = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec + 60));
        if (s.delayMinutes.player === 0 && s.delayMinutes.father === 0) return (found = i);
      }
      throw new Error('遅れのない便が見つからない');
    };
  })();
  const endOf = (i: number) => {
    const data = getCachedExpressData('meguri')!;
    const t = findExpressTrips(data, EXPRESS_TYPES.meguri.typeName, '東京', EVENT_TARE.fatherStation);
    return Math.max(t[i].arrSec, t[i - 1].arrSec); // 土浦に着く予定(遅い方)。秒
  };

  it('参加より前に、すでに土浦に着いた予約は、対象外(予約なし)', () => {
    const i = clean();
    const joinedAt = sec(endOf(i) + 60).getTime();
    const s = getEventState(true, [orderOf(i)], sec(endOf(i) + 120), { joinedAt });
    expect(s.phase).toBe('no_reservation');
    expect(s.orderId).toBeNull();
    // 参加の時刻を渡さなければ、今までどおり(着いたあと)
    expect(getEventState(true, [orderOf(i)], sec(endOf(i) + 120)).phase).toBe('arrived');
    expect(getEventState(true, [orderOf(i)], sec(endOf(i) + 120), { joinedAt: 0 }).phase).toBe('arrived');
  });

  it('参加のあとに、土浦に着く予約・参加のとき乗車中の予約・参加のとき発車前の予約は、対象', () => {
    const i = clean();
    const dep = meguri()[i].depSec;
    for (const joinedSec of [dep - 3600, dep - 60, dep + 600, endOf(i) - 1]) {
      const s = getEventState(true, [orderOf(i)], sec(joinedSec + 5), { joinedAt: sec(joinedSec).getTime() });
      expect(s.orderId, `参加 ${joinedSec}`).toBe(`o${i}`);
    }
    const riding = getEventState(true, [orderOf(i)], sec(dep + 600), { joinedAt: sec(dep + 300).getTime() });
    expect(riding.phase).toBe('riding');
    const before = getEventState(true, [orderOf(i)], sec(dep - 600), { joinedAt: sec(dep - 1200).getTime() });
    expect(before.phase).toBe('before_departure');
  });

  it('土浦に着く予定の時刻ちょうどに参加した予約は、対象外(着いている)。その1秒前なら対象', () => {
    const i = clean();
    const end = endOf(i);
    expect(getEventState(true, [orderOf(i)], sec(end + 5), { joinedAt: sec(end).getTime() }).phase).toBe('no_reservation');
    expect(getEventState(true, [orderOf(i)], sec(end + 5), { joinedAt: sec(end - 1).getTime() }).orderId).toBe(`o${i}`);
  });

  it('親父さんの列車が、あとに着く予約は、プレイヤーが着いたあとに参加しても、対象(親父さんが着くまで)', () => {
    disruptionManager.setLineDisruption(disruption({ maxDelayMinutes: 120 }));
    let found = -1;
    for (let i = 1; i < 37 && found < 0; i++) {
      const s = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec));
      if (s.minutesToFatherArrival! > s.minutesToPlayerArrival! + 5) found = i;
    }
    expect(found).toBeGreaterThan(0);
    const dep = meguri()[found].depSec;
    const s0 = getEventState(true, [orderOf(found)], sec(dep));
    const playerArr = dep + s0.minutesToPlayerArrival! * 60;
    const fatherArr = dep + s0.minutesToFatherArrival! * 60;
    const joinedAt = sec(playerArr + 60).getTime(); // プレイヤーの列車は着いたが、親父さんの列車は、まだ
    expect(getEventState(true, [orderOf(found)], sec(playerArr + 90), { joinedAt }).orderId).toBe(`o${found}`);
    expect(getEventState(true, [orderOf(found)], sec(fatherArr + 90), { joinedAt: sec(fatherArr + 60).getTime() }).phase).toBe('no_reservation');
    disruptionManager.clearAllDisruptions();
  });

  it('古い予約と新しい予約があるときは、新しいほうが選ばれる。古い予約だけなら、なし', () => {
    const oldI = clean();
    const newI = Math.min(oldI + 6, 36);
    const joinedAt = sec(endOf(oldI) + 600).getTime();
    const now = sec(endOf(oldI) + 900);
    expect(getEventState(true, [orderOf(oldI), orderOf(newI)], now, { joinedAt }).orderId).toBe(`o${newI}`);
    expect(getEventState(true, [orderOf(newI), orderOf(oldI)], now, { joinedAt }).orderId).toBe(`o${newI}`);
    expect(getEventState(true, [orderOf(oldI)], now, { joinedAt }).phase).toBe('no_reservation');
  });
});

describe('n(何本前か)を変える', () => {
  it('n=2 なら、親父さんは、さらに30分前に着き、先頭の2本は対象外', () => {
    const i = 12;
    const s1 = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec));
    const s2 = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec), { prevN: 2 });
    expect(s2.minutesToFatherArrival! - s1.minutesToFatherArrival!).toBe(-30);
    expect(getEventState(true, [orderOf(1)], at(8), { prevN: 2 }).phase).toBe('no_reservation');
    expect(getEventState(true, [orderOf(1)], at(8), { prevN: 1 }).phase).not.toBe('no_reservation');
    expect(getEventState(true, [orderOf(2)], at(8), { prevN: 2 }).phase).not.toBe('no_reservation');
  });
});

describe('公開前は、何も起きない', () => {
  it('公開前は、判定も印も、何もしない', () => {
    const order = orderOf(10); // 公開後の状態で、先に予約を作っておく
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 24, 12, 0)); // 公開日より前
    win.location.search = '';
    localStorage.clear();
    expect(isEventEligibleOrder(order)).toBe(false);
    expect(getEventState(true, [order], at(8), { cleared: false }).phase).toBe('not_joined');
    markEventJoined('a@example.com');
    setEventCleared('a@example.com', true);
    expect(localStorage.getItem('nizaki_event_tare-2026:a@example.com')).toBeNull();
  });
});

describe('参加・クリアの印', () => {
  it('はじめは、どちらもなし。参加の印をつけると残る。会員ごとに別。メールの大文字小文字は同じ', () => {
    expect(readEventProgress('a@example.com')).toEqual({ joined: false, cleared: false, joinedAt: 0, resetAt: 0 });
    markEventJoined('A@Example.com', undefined, 1000);
    expect(readEventProgress('a@example.com')).toEqual({ joined: true, cleared: false, joinedAt: 1000, resetAt: 0 });
    expect(readEventProgress('b@example.com')).toEqual({ joined: false, cleared: false, joinedAt: 0, resetAt: 0 });
    expect(readEventProgress('')).toEqual({ joined: false, cleared: false, joinedAt: 0, resetAt: 0 });
  });

  it('サーバーの結果で、クリア済みを上書きできる(true にも false にも)', () => {
    markEventJoined('a@example.com', undefined, 5000);
    setEventCleared('a@example.com', true);
    expect(readEventProgress('a@example.com')).toEqual({ joined: true, cleared: true, joinedAt: 5000, resetAt: 0 });
    setEventCleared('a@example.com', false);
    expect(readEventProgress('a@example.com')).toEqual({ joined: true, cleared: false, joinedAt: 5000, resetAt: 0 });
    // 参加の印が無くても、クリア済みなら、参加済み
    setEventCleared('c@example.com', true);
    expect(readEventProgress('c@example.com').joined).toBe(true);
  });

  it('デモ会員の store を渡すと、端末の保存先には書かない(画面を開いているあいだだけ)', () => {
    const mem = new Map<string, string>();
    const store: EventStore = { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) };
    markEventJoined('demo@example.com', store);
    expect(readEventProgress('demo@example.com', store).joined).toBe(true);
    expect(localStorage.getItem('nizaki_event_tare-2026:demo@example.com')).toBeNull();
    expect(readEventProgress('demo@example.com').joined).toBe(false);
  });

  it('参加の時刻は、はじめて参加したときだけ記録する。押し直しても変えない。時刻の無い古い印は 0', () => {
    markEventJoined('a@example.com', undefined, 1000);
    markEventJoined('a@example.com', undefined, 9000);
    expect(readEventProgress('a@example.com').joinedAt).toBe(1000);
    // 時刻の無い古い印
    localStorage.setItem('nizaki_event_tare-2026:old@example.com', JSON.stringify({ joined: true, cleared: false }));
    expect(readEventProgress('old@example.com')).toEqual({ joined: true, cleared: false, joinedAt: 0, resetAt: 0 });
    markEventJoined('old@example.com', undefined, 7000);
    expect(readEventProgress('old@example.com').joinedAt).toBe(0);
    // サーバーでクリア済みにしても、参加の時刻は変わらない。参加せずにクリア済みなら 0
    setEventCleared('c@example.com', true);
    expect(readEventProgress('c@example.com').joinedAt).toBe(0);
  });

  it('壊れた保存データは、なしとして扱う', () => {
    const store: EventStore = { get: () => '{こわれた', set: () => undefined };
    expect(readEventProgress('a@example.com', store)).toEqual({ joined: false, cleared: false, joinedAt: 0, resetAt: 0 });
  });
});

describe('画面の配線: 参加の時刻が、状態の計算に渡る(eventStateFor)', () => {
  const pickIdx = () => {
    for (let i = 2; i < 37; i++) {
      const s = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec + 60));
      if (s.delayMinutes.player === 0 && s.delayMinutes.father === 0) return i;
    }
    throw new Error('遅れのない便が見つからない');
  };
  const endSec = (i: number) => {
    const t = findExpressTrips(getCachedExpressData('meguri')!, EXPRESS_TYPES.meguri.typeName, '東京', EVENT_TARE.fatherStation);
    return Math.max(t[i].arrSec, t[i - 1].arrSec);
  };

  it('参加の印の時刻(joinedAt)が、そのまま渡る: 参加より前に着いた予約は「予約なし」', () => {
    const idx = pickIdx();
    markEventJoined('w@example.com', undefined, sec(endSec(idx) + 60).getTime());
    const progress = readEventProgress('w@example.com');
    expect(progress.joinedAt).toBe(sec(endSec(idx) + 60).getTime());
    expect(eventStateFor(progress, [orderOf(idx)], sec(endSec(idx) + 120)).phase).toBe('no_reservation');
  });

  it('参加のあとに着く予約は、対象。参加の時で予約が無ければ「予約なし」から始まる', () => {
    const idx = pickIdx();
    const dep = meguri()[idx].depSec;
    markEventJoined('w2@example.com', undefined, sec(dep - 600).getTime());
    const progress = readEventProgress('w2@example.com');
    expect(eventStateFor(progress, [orderOf(idx)], sec(dep - 300)).phase).toBe('before_departure');
    expect(eventStateFor(progress, [], sec(dep - 300)).phase).toBe('no_reservation');
  });

  it('時刻の無い古い印(0)は、今までどおり(着いたあとも対象)。クリア済みは、クリア済み', () => {
    const idx = pickIdx();
    localStorage.setItem('nizaki_event_tare-2026:old@example.com', JSON.stringify({ joined: true, cleared: false }));
    const old = readEventProgress('old@example.com');
    expect(eventStateFor(old, [orderOf(idx)], sec(endSec(idx) + 120)).phase).toBe('arrived');
    expect(eventStateFor({ joined: true, cleared: true, joinedAt: 0, resetAt: 0 }, [orderOf(idx)], sec(endSec(idx) + 120)).phase).toBe('cleared');
  });
});

describe('やり直したあとの対象の予約', () => {
  const pickIdx = () => {
    for (let i = 2; i < 37; i++) {
      const s = getEventState(true, [orderOf(i)], sec(meguri()[i].depSec + 60));
      if (s.delayMinutes.player === 0 && s.delayMinutes.father === 0) return i;
    }
    throw new Error('遅れのない便が見つからない');
  };
  const endSec = (i: number) => {
    const t = findExpressTrips(getCachedExpressData('meguri')!, EXPRESS_TYPES.meguri.typeName, '東京', EVENT_TARE.fatherStation);
    return Math.max(t[i].arrSec, t[i - 1].arrSec);
  };

  it('すでに土浦に着いた予約は、やり直したあとは対象外。乗車中の予約は、対象のまま。予約は、取り消さない', () => {
    const i = pickIdx();
    const dep = meguri()[i].depSec;
    const orders = [orderOf(i)];
    // 乗車中に、やり直して、参加し直す
    const resetMs = sec(dep + 600).getTime();
    markEventJoined('r@example.com', undefined, sec(dep - 3600).getTime());
    resetEvent('r@example.com', undefined, resetMs);
    markEventJoined('r@example.com', undefined, resetMs + 1000);
    const riding = eventStateFor(readEventProgress('r@example.com'), orders, sec(dep + 700));
    expect(riding.phase).toBe('riding');
    expect(riding.orderId).toBe(`o${i}`);
    // 土浦に着いたあとで、やり直して、参加し直す → その予約は、対象外
    localStorage.clear();
    const after = sec(endSec(i) + 300).getTime();
    markEventJoined('r@example.com', undefined, sec(dep - 3600).getTime());
    resetEvent('r@example.com', undefined, after);
    markEventJoined('r@example.com', undefined, after + 1000);
    const s = eventStateFor(readEventProgress('r@example.com'), orders, sec(endSec(i) + 400));
    expect(s.phase).toBe('no_reservation');
    expect(orders).toHaveLength(1);
  });
});
