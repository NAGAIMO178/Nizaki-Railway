// 直通(列車位置の、乗換駅の「神埼線 ›」の札)の決まり
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeLiveTrains, type LineData } from '../src/utils/diaTimetable';
import { THROUGH_LINKS, throughLineAt, trainThrough } from '../src/utils/throughLine';
import { bandFontSize, PIN_WIDTH, pinHeight } from '../src/components/TrainPin';

const readJson = (file: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', file), 'utf-8'));
const master = readJson('master.json');
const lineData = (code: string): LineData => ({ code, master: master[code], trains: readJson(`${code}_trains.json`) });

describe('直通先の路線', () => {
  it('大宮は 埼千環状線⇄神埼線、松戸は 埼千環状線⇄土浦線', () => {
    expect(throughLineAt('saichi_loop', '大宮')).toBe('kanzaki');
    expect(throughLineAt('kanzaki', '大宮')).toBe('saichi_loop');
    expect(throughLineAt('saichi_loop', '松戸')).toBe('tsuchiura');
    expect(throughLineAt('tsuchiura', '松戸')).toBe('saichi_loop');
  });

  it('つなぎ目でない駅・つながらない路線は、なし', () => {
    expect(throughLineAt('saichi_loop', '柏')).toBeUndefined();
    expect(throughLineAt('kanzaki_kosoku', '大宮')).toBeUndefined();
    expect(throughLineAt('tsuchiura', '大宮')).toBeUndefined();
    expect(THROUGH_LINKS).toHaveLength(2);
  });

  it('行先が、この路線の終点と同じなら直通ではない。先なら直通', () => {
    expect(trainThrough('saichi_loop', '大宮', '大宮')).toBeUndefined();
    expect(trainThrough('saichi_loop', '大宮', '横浜')).toEqual({ stationName: '大宮', lineId: 'kanzaki' });
    expect(trainThrough('kanzaki', '大宮', '東京')).toEqual({ stationName: '大宮', lineId: 'saichi_loop' });
    // つなぎ目でない駅で終わる列車は、直通の札なし
    expect(trainThrough('saichi_loop', '柏', '松戸')).toBeUndefined();
  });
});

describe('実際のダイヤでの直通の列車', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 9, h, m, 0).getTime();

  it('埼千環状線の 63K 急行(横浜行き)は、大宮で終わり、神埼線へ直通', () => {
    const sc = computeLiveTrains(lineData('SC'), 'saichi_loop', 1, at(12, 57));
    const t = sc.find((x) => x.runNo === '63K');
    expect(t).toBeDefined();
    expect(t!.destination).toBe('横浜');
    expect(t!.endStationName).toBe('大宮');
    expect(trainThrough('saichi_loop', t!.endStationName, t!.destination)).toEqual({ stationName: '大宮', lineId: 'kanzaki' });
  });

  it('大宮止まりの列車(24K)は、直通の札なし', () => {
    const sc = computeLiveTrains(lineData('SC'), 'saichi_loop', 1, at(13, 3));
    const t = sc.find((x) => x.runNo === '24K');
    expect(t).toBeDefined();
    expect(t!.destination).toBe('大宮');
    expect(trainThrough('saichi_loop', t!.endStationName, t!.destination)).toBeUndefined();
  });
});

describe('列車の札', () => {
  it('札の幅は38px。帯の字は、4文字まで9px。長い種別は、幅に収まるまで小さくする', () => {
    expect(PIN_WIDTH).toBe(38);
    expect(bandFontSize('急行')).toBe(9);
    expect(bandFontSize('特別快速')).toBe(9);
    expect(bandFontSize('特別快速') * 4).toBeLessThanOrEqual(PIN_WIDTH);
    expect(bandFontSize('特急(Nライナー)') * '特急(Nライナー)'.length).toBeLessThanOrEqual(PIN_WIDTH);
  });

  it('札の高さ: 遅れ・通過の札や混雑があるぶん、高くなる(重ならない高さを取るため)', () => {
    const plain = pinHeight({ delayed: false, passing: false, hasCrowd: false });
    expect(pinHeight({ delayed: true, passing: false, hasCrowd: false })).toBeGreaterThan(plain);
    expect(pinHeight({ delayed: false, passing: true, hasCrowd: false })).toBeGreaterThan(plain);
    expect(pinHeight({ delayed: false, passing: false, hasCrowd: true })).toBeGreaterThan(plain);
  });
});
