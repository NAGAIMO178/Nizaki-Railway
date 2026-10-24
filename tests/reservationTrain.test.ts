// 予約画面で選ばれている列車と、発車5分前の判定(実際の特急めぐりのダイヤ。東京→日立)
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { EXPRESS_TYPES, findExpressTrips, getCachedExpressData, loadExpressData } from '../src/utils/diaTimetable';
import type { ExpressTrip } from '../src/utils/diaTimetable';
import { pickCurrentTrip, trainEnded } from '../src/utils/reservationTrain';

let trips: ExpressTrip[];
const at = (h: number, m: number) => h * 60 + m;
// 欄に見える列車(予約できる列車の先頭)
const firstShown = (nowMin: number) => trips.find((t) => !trainEnded(t.depTime, nowMin));
const byTime = (hhmm: string) => trips.find((t) => t.depTime === hhmm)!;

beforeAll(async () => {
  await loadExpressData('meguri');
  trips = findExpressTrips(getCachedExpressData('meguri')!, EXPRESS_TYPES.meguri.typeName, '東京', '日立');
});

describe('発車5分前の判定', () => {
  it('発車の5分前ちょうどから、予約できない。その1分前までは、予約できる', () => {
    expect(trainEnded('22:35', at(22, 29))).toBe(false);
    expect(trainEnded('22:35', at(22, 30))).toBe(true);
    expect(trainEnded('07:35', at(7, 29))).toBe(false);
    expect(trainEnded('07:35', at(7, 30))).toBe(true);
  });
});

describe('イベントの「特急めぐりを予約する」から飛んだとき(列車は指定しない = 空)', () => {
  it('22:28 に、22:35発(71号)が選ばれ、予約できる(赤い表示は出ない)', () => {
    const cur = pickCurrentTrip(trips, '', at(22, 28))!;
    expect(cur.depTime).toBe('22:35');
    expect(cur.trainName).toBe('特急めぐり 71号');
    expect(trainEnded(cur.depTime, at(22, 28))).toBe(false);
    // 前の動き: 空のとき、一日の最初の列車(05:05発)を見て、「予約できません」になっていた
    const before = trips.find((t) => t.code === '') || trips[0];
    expect(before.depTime).toBe('05:05');
    expect(trainEnded(before.depTime, at(22, 28))).toBe(true);
  });

  it('境目: 07:29 は 07:35発、07:30 になると、次の列車', () => {
    expect(pickCurrentTrip(trips, '', at(7, 29))!.depTime).toBe('07:35');
    const i = trips.findIndex((t) => t.depTime === '07:35');
    expect(pickCurrentTrip(trips, '', at(7, 30))).toBe(trips[i + 1]);
  });
});

describe('列車の指定があるとき', () => {
  it('指定の列車が予約できるなら、それ(経路検索の「予約画面へ」など)', () => {
    const t = byTime('22:35');
    expect(pickCurrentTrip(trips, t.code, at(22, 28))).toBe(t);
    expect(pickCurrentTrip(trips, byTime('23:05').code, at(22, 28))!.depTime).toBe('23:05');
  });

  it('指定の列車が、もう過ぎている・5分前を過ぎているときは、予約できる最初の列車', () => {
    expect(pickCurrentTrip(trips, byTime('05:05').code, at(22, 28))!.depTime).toBe('22:35');
    expect(pickCurrentTrip(trips, byTime('22:35').code, at(22, 30))!.depTime).toBe('23:05');
  });

  it('指定の列車が、一覧に無いときは、予約できる最初の列車', () => {
    expect(pickCurrentTrip(trips, '存在しない', at(22, 28))!.depTime).toBe('22:35');
  });
});

describe('予約タブを直接開いたとき・時間がたったとき(今までどおり)', () => {
  it('直接開いて、選ばれている列車が、予約できる最初の列車のときは、そのまま', () => {
    const first = firstShown(at(22, 28))!;
    expect(pickCurrentTrip(trips, first.code, at(22, 28))).toBe(first);
  });

  it('予約できる列車が1本も無い(本日の受付終了)ときは、選ばれた列車(無ければ先頭)で、予約できない', () => {
    const late = at(23, 31);
    expect(trips.every((t) => trainEnded(t.depTime, late))).toBe(true);
    expect(pickCurrentTrip(trips, '', late)).toBe(trips[0]);
    const sel = byTime('22:35');
    expect(pickCurrentTrip(trips, sel.code, late)).toBe(sel);
    expect(pickCurrentTrip([], '', late)).toBeUndefined();
  });

  it('いつでも、欄に見える列車(予約できる最初の列車)と、判定に使う列車が同じ。選ばれた列車が予約できるなら、それ', () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      for (const sel of ['', '存在しない', trips[0].code, byTime('12:05').code, trips[trips.length - 1].code]) {
        const cur = pickCurrentTrip(trips, sel, m);
        const shown = firstShown(m);
        if (shown) {
          expect(trainEnded(cur!.depTime, m), `${m}分 ${sel}`).toBe(false);
          const selected = trips.find((t) => t.code === sel);
          expect(cur, `${m}分 ${sel}`).toBe(selected && !trainEnded(selected.depTime, m) ? selected : shown);
        } else {
          expect(trainEnded(cur!.depTime, m)).toBe(true);
        }
      }
    }
  });
});
