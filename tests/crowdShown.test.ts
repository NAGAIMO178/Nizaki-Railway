import { describe, it, expect } from 'vitest';
import { legShowsCrowd } from '../src/utils/crowdShown';

describe('混雑の表示(経路検索)', () => {
  it('全席指定の特急(めぐり・Nライナー)では、出さない', () => {
    expect(legShowsCrowd({ typeName: '特急めぐり', crowd: 1 })).toBe(false);
    expect(legShowsCrowd({ typeName: '特急(Nライナー)', crowd: 3 })).toBe(false);
  });

  it('特急あやみ(自由席あり)と、普通列車は、出す', () => {
    expect(legShowsCrowd({ typeName: '特急あやみ', crowd: 2 })).toBe(true);
    expect(legShowsCrowd({ typeName: '急行', crowd: 5 })).toBe(true);
    expect(legShowsCrowd({ typeName: '各停', crowd: 1 })).toBe(true);
  });

  it('混雑のデータが無いときは、出さない', () => {
    expect(legShowsCrowd({ typeName: '急行' })).toBe(false);
    expect(legShowsCrowd({ typeName: '急行', crowd: 0 })).toBe(false);
  });
});
