import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { destLabels, buildLegendRows } from '../src/utils/timetableLegend';

describe('行先の記号(頭文字)', () => {
  it('ふつうは、漢字の頭文字1つ', () => {
    const l = destLabels(['横浜', '大宮', '七光台', '東京', '茨城空港']);
    expect([...l.values()]).toEqual(['横', '大', '七', '東', '茨']);
  });

  it('同じ頭文字があるときだけ、見分けがつくまで文字を足す', () => {
    const l = destLabels(['松戸', '松が丘', '東京']);
    expect(l.get('松戸')).toBe('松戸');
    expect(l.get('松が丘')).toBe('松が');
    expect(l.get('東京')).toBe('東');
    const m = destLabels(['新宿', '新座']);
    expect(m.get('新宿')).toBe('新宿');
    expect(m.get('新座')).toBe('新座');
  });

  it('ほかの行先の頭に、名前がまるごと入っているときも、見分けがつく', () => {
    const l = destLabels(['大宮', '大宮公園']);
    expect(l.get('大宮')).toBe('大宮');
    expect(l.get('大宮公園')).toBe('大宮公');
    expect(new Set(l.values()).size).toBe(2);
  });

  it('同じ行先を何度渡しても、1つとして数える', () => {
    expect(destLabels(['大宮', '大宮', '東京']).get('大宮')).toBe('大');
  });
});

describe('凡例', () => {
  const deps = [
    { typeAbbr: '各', paid: false, dest: '横浜' },
    { typeAbbr: '急', paid: false, dest: '横浜' },
    { typeAbbr: '特', paid: true, dest: '大宮' },
    { typeAbbr: '各', paid: false, dest: '七光台' },
  ];
  const labels = destLabels(deps.map((d) => d.dest));
  const rows = buildLegendRows(deps, '横浜', labels);

  it('その方向に出る種別だけを、決まった順で出す(括弧つきの名前なし)', () => {
    expect(rows[0].items.map((i) => `${i.mark}=${i.text}`)).toEqual(['特=特急(有料)', '急=急行', '各=各停']);
    expect(rows[0].items[0].tone).toBe('paid');
    expect(rows[0].items.every((i) => !i.text.includes('(') || i.text.endsWith('(有料)'))).toBe(true);
  });

  it('出ない種別は、凡例にも出ない', () => {
    const only = buildLegendRows([{ typeAbbr: '各', paid: false, dest: '東京' }], '東京', destLabels(['東京']));
    expect(only[0].items.map((i) => i.mark)).toEqual(['各']);
  });

  it('行先は、標準の行先を「記号なし」にして、ほかの行先を頭文字で出す', () => {
    expect(rows[1].items.map((i) => `${i.mark}=${i.text}`)).toEqual(['記号なし=横浜行き', '七=七光台', '大=大宮']);
  });

  it('行(種別・行先・時刻)の順に返す。あとで行を足せる', () => {
    expect(rows.map((r) => r.key)).toEqual(['type', 'dest', 'time']);
  });
});

// 実際のダイヤ(いまの dia と、公開後の dia-2)で、どの路線・方向でも、頭文字1つで見分けがつく
describe('実際のダイヤの行先', () => {
  const root = path.resolve(__dirname, '..', 'public', 'data');
  ['dia', 'dia-2'].forEach((dia) => {
    it(`${dia}: 路線・方向ごとの行先は、頭文字1つで重ならない`, () => {
      const master = JSON.parse(fs.readFileSync(path.join(root, dia, 'master.json'), 'utf-8'));
      Object.entries<{ dirs: string[]; stations: [string, number][] }>(master).forEach(([code, cfg]) => {
        const trains: unknown[][] = JSON.parse(fs.readFileSync(path.join(root, dia, `${code}_trains.json`), 'utf-8'));
        cfg.dirs.forEach((dir) => {
          const dests = trains
            .filter((t) => t[2] === dir)
            .map((t) => (t[7] as string | undefined) ?? cfg.stations[(t[5] as number[])[(t[5] as number[]).length - 3]][0]);
          const labels = destLabels(dests);
          const list = [...labels.values()];
          expect(new Set(list).size, `${dia} ${code} ${dir}`).toBe(list.length);
          list.forEach((l) => expect(l.length, `${dia} ${code} ${dir} ${l}`).toBe(1));
        });
      });
    });
  });
});
