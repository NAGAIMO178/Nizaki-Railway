// 番線(公開後のダイヤの、列車の行の10番目の要素)の読み方と、予約の発車リマインドの文を調べる。
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ActiveOrder } from '../src/types';
import { EXPRESS_TYPES, expressSourceLines, findExpressTrips, getCachedLineData, loadExpressData, loadLineData, TrainRow } from '../src/utils/diaTimetable';
import { departurePlatform, platformAtStop, platformLabel } from '../src/utils/platform';
import { remindText, resolveOrder } from '../src/utils/useReservationWatcher';

const raw = (code: string): TrainRow[] =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', `${code}_trains.json`), 'utf-8'));

beforeAll(async () => {
  await Promise.all(['Y', 'NI', 'SC', 'TC'].map((c) => loadLineData(c)));
});

describe('番線を読む', () => {
  it('10番目の要素から、k番目の停車駅の番線を読む。無い・空は undefined', () => {
    const row = ['1', 0, 'D', 'op', 0, [0, -1, 0, 1, 60, 90], '01K', '終点', '始発', ['2', '3']] as TrainRow;
    expect(platformAtStop(row, 0)).toBe('2');
    expect(platformAtStop(row, 1)).toBe('3');
    expect(platformAtStop(row, 2)).toBeUndefined();
    const old = ['1', 0, 'D', 'op', 0, [0, -1, 0]] as TrainRow; // 公開前のダイヤ(番線なし)
    expect(platformAtStop(old, 0)).toBeUndefined();
    const blank = ['1', 0, 'D', 'op', 0, [0, -1, 0], '01K', 'a', 'b', ['']] as TrainRow;
    expect(platformAtStop(blank, 0)).toBeUndefined();
  });

  it('列車の番号と駅から、発車の番線を読む(ダイヤのファイルの値と一致する)', () => {
    for (const code of ['Y', 'NI', 'SC', 'TC']) {
      const data = getCachedLineData(code)!;
      const rows = raw(code);
      let checked = 0;
      rows.filter((_, i) => i % 7 === 0).forEach((t) => {
        for (let k = 0; k * 3 < t[5].length; k++) {
          if (t[5][k * 3 + 2] === -1) continue; // 発のない停車駅(終着)は、対象外
          const station = data.master.stations[t[5][k * 3]][0];
          const expected = t[9]![k];
          // 環状線の東京のように、同じ駅に2度停まる列車は、最初の発車の番線を返す
          const first = (() => {
            for (let j = 0; j * 3 < t[5].length; j++) if (t[5][j * 3] === t[5][k * 3] && t[5][j * 3 + 2] !== -1) return t[9]![j];
          })();
          expect(departurePlatform(data, t[0], station), `${code} ${t[0]} ${station}`).toBe(first);
          if (first === expected) checked++;
        }
      });
      expect(checked).toBeGreaterThan(50);
    }
  });

  it('終着駅(着だけ)・通らない駅・知らない列車や駅は、undefined', () => {
    const data = getCachedLineData('Y')!;
    const t = raw('Y')[0];
    const last = data.master.stations[t[5][t[5].length - 3]][0];
    expect(t[5][t[5].length - 1]).toBe(-1);
    expect(departurePlatform(data, t[0], last)).toBeUndefined();
    expect(departurePlatform(data, t[0], 'どこにもない駅')).toBeUndefined();
    expect(departurePlatform(data, 'ない列車', '東京')).toBeUndefined();
    expect(departurePlatform(undefined, t[0], '東京')).toBeUndefined();
  });

  it('番線の言い方', () => {
    expect(platformLabel('2')).toBe('2番線');
    expect(platformLabel(undefined)).toBe('');
  });
});

describe('直通の特急(めぐり)', () => {
  it('つないだ2つの路線のコードを返す。ほかの特急は、その路線だけ', () => {
    expect(expressSourceLines('meguri')).toEqual(['SC', 'TC']);
    expect(expressSourceLines('nliner')).toEqual([EXPRESS_TYPES.nliner.lineCode]);
    expect(expressSourceLines('ayami')).toEqual([EXPRESS_TYPES.ayami.lineCode]);
  });

  it('乗り換えの駅(松戸)から発車する側の路線の番線を読める', () => {
    const sc = getCachedLineData('SC')!;
    const tc = getCachedLineData('TC')!;
    const typeIdx = tc.master.types.findIndex((t) => t[0] === EXPRESS_TYPES.meguri.typeName);
    const scNos = new Set(sc.trains.map((t) => t[0]));
    const through = tc.trains.find((t) => t[1] === typeIdx && scNos.has(t[0]))!;
    expect(through).toBeTruthy();
    // 松戸は、前の路線(埼千環状線)では着だけ、後の路線(土浦線)では発だけ
    expect(departurePlatform(sc, through[0], '松戸')).toBeUndefined();
    const p = departurePlatform(tc, through[0], '松戸');
    expect(p).toBe(through[9]![0]);
    expect(p).toBeTruthy();
    const found = expressSourceLines('meguri').map((c) => departurePlatform(getCachedLineData(c), through[0], '松戸')).find((x) => x);
    expect(found).toBe(p);
  });
});

describe('発車のリマインドの文', () => {
  const base = { trainName: '特急Nライナー 3号', boarding: '東京', carNo: 3, seatNo: '5A' };
  it('番線が分かるときは、座席の前に、番線を入れる', () => {
    const text = remindText({ ...base, platform: '2' }, 10);
    expect(text).toBe('ご予約の特急Nライナー 3号は、あと約10分で東京駅を発車します(2番線・3号車 5A)。');
  });
  it('番線が無いときは、今までと同じ文', () => {
    expect(remindText(base, 10)).toBe('ご予約の特急Nライナー 3号は、あと約10分で東京駅を発車します(3号車 5A)。');
    expect(remindText({ ...base, platform: undefined }, 30)).not.toContain('番線');
  });
});

describe('予約から、乗る駅の番線を引く', () => {
  const orderOf = async (key: keyof typeof EXPRESS_TYPES, from: string, to: string): Promise<ActiveOrder> => {
    const data = await loadExpressData(key);
    const trip = findExpressTrips(data, EXPRESS_TYPES[key].typeName, from, to)[0];
    expect(trip, `${key} ${from}→${to}`).toBeTruthy();
    return {
      orderId: 'o1', trainName: trip.trainName, boardingStation: `${from}駅`, destinationStation: `${to}駅`,
      reservedDate: '2026-11-02', carNo: 3, seatNo: '5A',
    } as unknown as ActiveOrder;
  };

  it('Nライナー・あやみ: 乗る駅の番線が入る', async () => {
    for (const [key, from, to] of [['nliner', '東京', '大宮'], ['ayami', '東京', '池袋']] as const) {
      const r = await resolveOrder(await orderOf(key, from, to));
      expect(r, `${key}`).toBeTruthy();
      expect(r!.platform).toMatch(/^\d$/);
      const line = getCachedLineData(EXPRESS_TYPES[key].lineCode)!;
      expect(r!.platform).toBe(departurePlatform(line, r!.code, from));
    }
  });

  it('直通のめぐり: 東京から乗っても、松戸から乗っても、番線が入る', async () => {
    for (const from of ['東京', '松戸']) {
      const r = await resolveOrder(await orderOf('meguri', from, '日立'));
      expect(r, from).toBeTruthy();
      expect(r!.platform, from).toMatch(/^\d$/);
    }
  });

  it('番線の無い(公開前の形の)ダイヤでは、番線なし', async () => {
    const line = getCachedLineData('Y')!;
    const saved = line.trains.map((t) => t[9]);
    line.trains.forEach((t) => (t[9] = undefined));
    try {
      const r = await resolveOrder(await orderOf('nliner', '東京', '大宮'));
      expect(r!.platform).toBeUndefined();
    } finally {
      line.trains.forEach((t, i) => (t[9] = saved[i]));
    }
  });
});
