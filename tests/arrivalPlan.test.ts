// 到着時刻からの逆算(arrivalPlan)の決まりを、実際のダイヤで調べる。
// 日時は、月曜の朝6時に固定する(遅れは、日付と、いまの運行指令で決まるため)。
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { ArrivalPlan, NEIGHBOR_GAP_MIN, planArrival } from '../src/utils/arrivalPlan';
import { disruptionManager, type LineDisruption } from '../src/utils/disruptionManager';
import { DEFAULT_ROUTE_OPTIONS } from '../src/utils/routeOptions';
import { loadRouteStations, searchRoutes, searchRoutesInWindow, serviceDayStartMs } from '../src/utils/routeSearch';

const hm = (h: number, m = 0) => h * 3600 + m * 60;
const NOW = new Date(2026, 10, 2, 6, 0); // 月曜 6:00

const plan = (over: Partial<Parameters<typeof planArrival>[0]> = {}): Promise<ArrivalPlan> =>
  planArrival({ from: '東京', to: '横浜', day: 'today', arriveBy: '09:00', now: NOW, ...over });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await loadRouteStations();
});
afterAll(() => vi.useRealTimers());
beforeEach(() => localStorage.clear());

describe('到着時刻からの逆算: 結果の決まり', () => {
  it('間に合う便だけを、出発の早い順に、最大3つ返し、おすすめの位置が正しい', async () => {
    const p = await plan();
    expect(p.options.length).toBeGreaterThanOrEqual(1);
    expect(p.options.length).toBeLessThanOrEqual(3);
    expect(p.deadlineSec).toBe(hm(9));
    expect(p.pickIndex).toBeGreaterThanOrEqual(0);
    expect(p.pickIndex).toBeLessThan(p.options.length);
    p.options.forEach((o, i) => {
      expect(o.arrSec).toBeLessThanOrEqual(hm(9));
      expect(o.marginMin).toBe(Math.floor((hm(9) - o.arrSec) / 60));
      expect(o.marginMin).toBeGreaterThanOrEqual(0);
      expect(o.depSec).toBe(o.route.depSec);
      expect(o.transfers).toBe(o.route.transfers);
      if (i > 0) expect(o.depSec).toBeGreaterThan(p.options[i - 1].depSec);
    });
  });

  it('前後の便は、おすすめと、一定の分数以上、出発がずれている', async () => {
    const p = await plan();
    const pick = p.options[p.pickIndex];
    p.options.forEach((o, i) => {
      if (i !== p.pickIndex) expect(Math.abs(o.depSec - pick.depSec)).toBeGreaterThanOrEqual(NEIGHBOR_GAP_MIN * 60);
    });
    p.options.slice(0, p.pickIndex).forEach((o) => expect(o.depSec).toBeLessThan(pick.depSec));
    p.options.slice(p.pickIndex + 1).forEach((o) => expect(o.depSec).toBeGreaterThan(pick.depSec));
  });

  it('本数の多い区間では、前・おすすめ・後の3つがそろう', async () => {
    const p = await plan();
    expect(p.options).toHaveLength(3);
    expect(p.pickIndex).toBe(1);
  });

  it('締め切りを変えても、前後の便は、おすすめと一定の分数以上ずれている', async () => {
    for (let m = 7 * 60 + 30; m <= 9 * 60; m += 4) {
      const p = await plan({ arriveBy: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` });
      const pick = p.options[p.pickIndex];
      p.options.forEach((o, i) => {
        if (i !== p.pickIndex) expect(Math.abs(o.depSec - pick.depSec), `締め切り ${m}分`).toBeGreaterThanOrEqual(NEIGHBOR_GAP_MIN * 60);
      });
    }
  });

  it('いろいろな駅の組み合わせで、おすすめは、条件に合う便のうち、乗換が少ない', async () => {
    const names = await loadRouteStations();
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let checked = 0;
    for (let n = 0; n < 40; n++) {
      const a = names[Math.floor(rnd() * names.length)];
      const b = names[Math.floor(rnd() * names.length)];
      if (a === b) continue;
      const deadline = hm(10 + Math.floor(rnd() * 10));
      const arriveBy = `${deadline / 3600}:00`;
      const p = await plan({ from: a, to: b, arriveBy });
      const all = await searchRoutesInWindow({ from: a, to: b, fromSec: deadline - 2 * 3600, untilArrSec: deadline, serviceDayStartMs: serviceDayStartMs(hm(7)), withDelays: true });
      const ok = all.filter((r) => r.arrSec <= deadline - 5 * 60 && r.risk <= 0.05);
      if (ok.length === 0) continue;
      checked++;
      // 探す範囲は、締め切りの2時間前以上なので、この2時間のなかの最少より、多くはならない
      expect(p.relaxed, `${a}→${b} ${arriveBy}`).toBe(0);
      expect(p.options[p.pickIndex].transfers, `${a}→${b} ${arriveBy}`).toBeLessThanOrEqual(Math.min(...ok.map((r) => r.transfers)));
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('おすすめは、余裕5分以上のうち、乗換がいちばん少ない便', async () => {
    const p = await plan({ from: '大宮', to: '土浦' });
    const pick = p.options[p.pickIndex];
    expect(p.relaxed).toBe(0);
    expect(pick.marginMin).toBeGreaterThanOrEqual(5);
    // 別の方法(出発を順に試す)で集めた、余裕5分以上の便の、いちばん少ない乗換
    const all = await searchRoutes('大宮', '土浦', hm(5), DEFAULT_ROUTE_OPTIONS, 40);
    const ok = all.filter((r) => r.arrSec <= hm(9) - 5 * 60 && r.risk <= 0.05);
    expect(pick.transfers).toBe(Math.min(...ok.map((r) => r.transfers)));
  });

  it('結果に、混雑の項目を持たせない', async () => {
    const p = await plan({ from: '大宮', to: '土浦' });
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/crowd/i);
    expect(text).not.toMatch(/座れる|ゆったり|混/);
  });
});

describe('到着時刻からの逆算: 条件のゆるめ方', () => {
  it('ぎりぎりしか間に合わないときは、条件をゆるめて、余裕0分の便を返す', async () => {
    // 明日の始発で、いちばん早く着く時刻を、締め切りにする
    const dayStart = serviceDayStartMs(hm(4)) + 86400_000;
    const first = (await searchRoutesInWindow({ from: '東京', to: '日立', fromSec: hm(4), untilArrSec: hm(12), serviceDayStartMs: dayStart, withDelays: false, maxCandidates: 1 }))[0];
    const sec = Math.ceil(first.arrSec / 60) * 60; // 到着は、秒まで持つので、分に切り上げる
    const arrive = `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
    const p = await plan({ from: '東京', to: '日立', day: 'tomorrow', arriveBy: arrive });
    expect(p.options.length).toBeGreaterThanOrEqual(1);
    expect(p.relaxed).toBe(2);
    expect(p.options[p.pickIndex].marginMin).toBeLessThan(3);
  });

  it('始発より前の締め切りは、空を返す', async () => {
    const p = await plan({ from: '東京', to: '日立', day: 'tomorrow', arriveBy: '04:30' });
    expect(p.options).toEqual([]);
    expect(p.pickIndex).toBe(-1);
  });
});

describe('到着時刻からの逆算: 日の扱い', () => {
  it('今日の締め切りが、いまより前なら、空', async () => {
    const p = await plan({ now: new Date(2026, 10, 2, 10, 0), arriveBy: '09:00' });
    expect(p.options).toEqual([]);
  });

  it('今日の未明を過ぎてから、今日の未明の時刻を選んでも、空(もう走った便を返さない)', async () => {
    // 朝6時に「今日の 00:30 まで」: 00:30 は、もう過ぎている(前日のダイヤの終電ぎわには、列車がある)
    const p = await plan({ now: new Date(2026, 10, 2, 6, 0), day: 'today', arriveBy: '00:30' });
    expect(p.options).toEqual([]);
    expect(p.pickIndex).toBe(-1);
    // 午前 1 時に「今日の 00:30 まで」も、過ぎている(同じダイヤの日)。午前 1 時に「今日の 03:00 まで」は、まだ先
    const past = await plan({ now: new Date(2026, 10, 2, 1, 0), day: 'today', arriveBy: '00:30' });
    expect(past.options).toEqual([]);
    const future = await plan({ now: new Date(2026, 10, 2, 1, 0), day: 'today', arriveBy: '03:00' });
    expect(future.deadlineSec).toBe(hm(27));
  });

  it('今日は、いまより前に出る便を出さない', async () => {
    const now = new Date(2026, 10, 2, 8, 30);
    const p = await plan({ now });
    const nowSec = hm(8, 30);
    p.options.forEach((o) => expect(o.depSec).toBeGreaterThanOrEqual(nowSec));
  });

  it('明日は、遅れ・運転見合わせを見ず、時刻表どおり', async () => {
    const d: LineDisruption = {
      lineId: 'kanzaki', lineName: '神埼線', code: 'Y', statusType: 'suspended', targetDirection: 'both', maxDelayMinutes: 5,
      durationUntil: '', section: '全線', reason: 'x', customMessage: '', useCustomMessage: false, linkToSystem: true, updatedAt: '',
    };
    const before = await plan({ day: 'tomorrow', from: '大宮', to: '横浜' });
    disruptionManager.setLineDisruption(d);
    const after = await plan({ day: 'tomorrow', from: '大宮', to: '横浜' });
    expect(before.usedDelays).toBe(false);
    expect(after.usedDelays).toBe(false);
    expect(after.options.map((o) => [o.depSec, o.arrSec])).toEqual(before.options.map((o) => [o.depSec, o.arrSec]));
    after.options.forEach((o) => o.route.legs.forEach((l) => expect(l.delayMin).toBe(0)));
    // 乗換の余裕も、時刻表どおり(前の列車の到着〜次の列車の発車)
    const withTransfer = await plan({ day: 'tomorrow', from: '大宮', to: '土浦' });
    expect(withTransfer.options.some((o) => o.route.connections.some((c) => !c.through))).toBe(true);
    withTransfer.options.forEach((o) =>
      o.route.connections.forEach((c, k) => {
        if (c.through) return;
        const prev = o.route.legs[k];
        const next = o.route.legs[k + 1];
        expect(c.gapMin).toBeCloseTo((next.schedDepSec - prev.schedArrSec) / 60, 1);
      })
    );
    // 今日は、運転見合わせを見る(神埼線の列車に乗らない)
    const today = await plan({ from: '大宮', to: '横浜' });
    expect(today.usedDelays).toBe(true);
    today.options.forEach((o) => o.route.legs.forEach((l) => expect(l.lineCode).not.toBe('Y')));
    disruptionManager.clearAllDisruptions();
  });

  it('0〜4時の締め切りは、前日のダイヤの続きで、24時以降として扱う', async () => {
    const p = await plan({ now: new Date(2026, 10, 2, 22, 0), day: 'tomorrow', arriveBy: '01:00' });
    expect(p.deadlineSec).toBe(hm(25));
    p.options.forEach((o) => expect(o.arrSec).toBeLessThanOrEqual(hm(25)));
  });
});

describe('到着時刻からの逆算: 入力が変なとき', () => {
  it('時刻の書き方が変、駅が無い、同じ駅は、例外を投げず、空を返す', async () => {
    for (const over of [{ arriveBy: 'abc' }, { arriveBy: '25:00' }, { arriveBy: '9時' }, { from: 'どこにもない駅' }, { to: '東京' }]) {
      const p = await plan(over);
      expect(p.options).toEqual([]);
      expect(p.pickIndex).toBe(-1);
    }
  });
});

describe('searchRoutes の動きは変えていない', () => {
  it('同じ日・同じ出発から探した、いちばん早い便が、期間を指定した探し方の最初と同じ', async () => {
    for (const [a, b] of [['東京', '横浜'], ['大宮', '土浦'], ['松戸', '日立']]) {
      const [first] = await searchRoutes(a, b, hm(7), DEFAULT_ROUTE_OPTIONS, 1);
      const [win] = await searchRoutesInWindow({ from: a, to: b, fromSec: hm(7), untilArrSec: hm(30), serviceDayStartMs: serviceDayStartMs(hm(7)), withDelays: true });
      expect(win).toEqual(first);
    }
  });

  it('遅れを見ない探し方は、運転見合わせの影響を受けない', async () => {
    const d: LineDisruption = {
      lineId: 'tsuchiura', lineName: '土浦線', code: 'TC', statusType: 'suspended', targetDirection: 'both', maxDelayMinutes: 5,
      durationUntil: '', section: '全線', reason: 'x', customMessage: '', useCustomMessage: false, linkToSystem: true, updatedAt: '',
    };
    disruptionManager.setLineDisruption(d);
    const base = { from: '土浦', to: '日立', fromSec: hm(7), untilArrSec: hm(12), serviceDayStartMs: serviceDayStartMs(hm(7)) };
    const withDelay = await searchRoutesInWindow({ ...base, withDelays: true });
    const without = await searchRoutesInWindow({ ...base, withDelays: false });
    expect(withDelay).toEqual([]);
    expect(without.length).toBeGreaterThan(0);
    disruptionManager.clearAllDisruptions();
  });
});

describe('公開前に見えない', () => {
  it('arrivalPlan を使う画面のファイルは、必ず isLaunched() も使っている', () => {
    const root = path.resolve(__dirname, '..', 'src');
    const files: string[] = [];
    const walk = (dir: string) =>
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
      });
    walk(root);
    const users = files.filter((f) => !f.endsWith('arrivalPlan.ts') && fs.readFileSync(f, 'utf-8').includes('arrivalPlan'));
    users.forEach((f) => expect(fs.readFileSync(f, 'utf-8'), f).toContain('isLaunched'));
  });
});
