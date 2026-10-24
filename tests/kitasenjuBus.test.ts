// 北千住の乗り換えに、神埼バスが入る(ほかの駅は変わらない)
import { describe, expect, it } from 'vitest';
import { LINES_DATA } from '../src/components/TrainLocationTab';
import { OTHER_LINES_DATABASE } from '../src/components/LocationStationDetailCard';

const stationsOf = (name: string) => LINES_DATA.flatMap((l) => l.stations).filter((s) => s.name === name);

describe('北千住の乗り換え: 神埼バス', () => {
  it('神埼線・埼千環状線の、北千住の2つの駅に、バスの印がある(前の印は、そのまま)', () => {
    const k = stationsOf('北千住');
    expect(k.map((s) => s.id)).toEqual(['Y03', 'SC03']);
    expect(k[0].transfers).toEqual(['SC', 'JR', '地下鉄', '東武', 'TX', 'バス']);
    expect(k[1].transfers).toEqual(['Y', 'JR', '地下鉄', '東武', 'TX', 'バス']);
  });

  it('乗換の一覧に、「神埼バス」の行がある。ほかのバスの行と同じ部品で、細かい説明は無い', () => {
    const list = OTHER_LINES_DATABASE['北千住'];
    const bus = list.find((l) => l.name === '神埼バス')!;
    expect(bus).toBeTruthy();
    const adachi = OTHER_LINES_DATABASE['足立'][0];
    expect(bus.badge).toBe(adachi.badge);
    expect(bus.bgClass).toBe(adachi.bgClass);
    expect(bus.textClass).toBe(adachi.textClass);
    expect(bus.gateNotice).toBeUndefined();
    // 前の行は、そのまま
    expect(list.map((l) => l.badge)).toEqual(['JR', '地下鉄', '東武', 'TX', 'バス']);
  });

  it('足立など、ほかの駅は変わらない', () => {
    expect(stationsOf('足立')[0].transfers).toEqual(['バス']);
    expect(stationsOf('南千住')[0].transfers).toEqual(['JR', '地下鉄', 'TX']);
    expect(stationsOf('東京').find((s) => s.id === 'Y01')!.transfers).toEqual(['NI', 'SC', 'JR', '新幹線', '地下鉄']);
    expect(OTHER_LINES_DATABASE['足立']).toHaveLength(1);
    expect(OTHER_LINES_DATABASE['足立'][0].name).toContain('都営バス');
    const withKanzakiBus = Object.entries(OTHER_LINES_DATABASE).filter(([, v]) => v.some((l) => l.name === '神埼バス')).map(([k]) => k);
    expect(withKanzakiBus).toEqual(['北千住']);
  });
});
