// 画面に出す種別の名前(displayType)。ダイヤの種別名が「(松戸-土浦)」などで分かれても、色・並びの判定に使う名前は変わらない。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayType } from '../src/utils/diaTimetable';

const typeNames = (dir: string): string[] => {
  const master = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', dir, 'master.json'), 'utf-8')) as Record<string, { types: [string, string, number][] }>;
  return Object.values(master).flatMap((m) => m.types.map((t) => t[0]));
};

// 括弧を外すだけの前の決まり(公開前のダイヤの動きを変えていないことの確認用)
const before = (n: string): string => (n.startsWith('各停') ? '各停' : n.replace(/\((越谷経由|柏経由|東京直通)\)$/, ''));

describe('画面の種別の名前', () => {
  it('公開前のダイヤの種別は、前と同じ名前になる', () => {
    typeNames('dia').forEach((n) => expect(displayType(n), n).toBe(before(n)));
  });

  it('公開後のダイヤの種別は、どれも、色の判定に使う名前(括弧なし)になる', () => {
    const names = new Set(typeNames('dia-2').map(displayType));
    expect([...names].sort()).toEqual(['各停', '急行', '快速', '普通', '特急あやみ', '特急(Nライナー)', '特急めぐり', '特別快速', '区間快速', '通勤特快'].sort());
  });

  it('快速・区間快速は、松戸-土浦 / 土浦-日立 に分かれても、同じ名前', () => {
    expect(displayType('快速(松戸-土浦)')).toBe('快速');
    expect(displayType('快速(土浦-日立)')).toBe('快速');
    expect(displayType('区間快速(松戸-土浦)')).toBe('区間快速');
    expect(displayType('区間快速(土浦-日立)')).toBe('区間快速');
  });
});
