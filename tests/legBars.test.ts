import { describe, it, expect } from 'vitest';
import { legBarJoins } from '../src/utils/legBars';

describe('候補カードの棒のつなぎ方', () => {
  it('単線の経路は、つながない', () => {
    expect(legBarJoins([{}])).toEqual([{ prev: false, next: false }]);
  });

  it('直通(乗換 0回)の2区間は、上下の棒をつなぐ', () => {
    expect(legBarJoins([{}, { through: true }])).toEqual([
      { prev: false, next: true },
      { prev: true, next: false },
    ]);
  });

  it('乗換のある2区間は、つながない', () => {
    expect(legBarJoins([{}, { through: false }])).toEqual([
      { prev: false, next: false },
      { prev: false, next: false },
    ]);
  });

  it('3区間(直通 + 乗換)は、直通の隣り合う区間だけつなぐ', () => {
    expect(legBarJoins([{}, { through: true }, {}])).toEqual([
      { prev: false, next: true },
      { prev: true, next: false },
      { prev: false, next: false },
    ]);
    expect(legBarJoins([{}, {}, { through: true }])).toEqual([
      { prev: false, next: false },
      { prev: false, next: true },
      { prev: true, next: false },
    ]);
  });

  it('3区間とも直通なら、3本が1本につながる', () => {
    expect(legBarJoins([{}, { through: true }, { through: true }]).map((j) => [j.prev, j.next])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ]);
  });
});
