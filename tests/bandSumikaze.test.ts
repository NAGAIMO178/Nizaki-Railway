// 高宮線(非表示)の「特急すみかぜ」の帯: 「すみかぜ」(4文字は 8.5px)。色は、有料特急の紫のまま。ほかの帯は、変えていない
import { describe, expect, it } from 'vitest';
import { bandFontSize, PIN_WIDTH } from '../src/components/TrainPin';
import { bandLabelOf, typeStyleOf } from '../src/utils/trainTypeStyle';

describe('特急すみかぜの帯', () => {
  it('「特急すみかぜ」→「すみかぜ」。色は、有料特急の紫(水色にしない)。詳細シートのバッジの色も、同じ紫の濃い地', () => {
    expect(bandLabelOf('特急すみかぜ')).toBe('すみかぜ');
    const st = typeStyleOf('特急すみかぜ');
    expect(st.hex).toBe('#6D28D9');
    expect(st.hex).toBe(typeStyleOf('特急あやみ').hex);
    expect(st.solid).toBe('bg-purple-700');
    expect(st.soft).toBe(typeStyleOf('特急あやみ').soft);
  });

  it('4文字(すみかぜ)は 8.5px で、幅38pxに、左右 2px ずつの余白。3文字以下は 9px のまま', () => {
    expect(bandFontSize('すみかぜ')).toBe(8.5);
    expect((PIN_WIDTH - bandFontSize('すみかぜ') * 4) / 2).toBe(2);
    for (const l of ['各', '急', '快', '区快', '特快', '通快', 'N', 'あやみ', 'めぐり', '特']) expect(bandFontSize(l), l).toBe(9);
  });

  it('既存の帯の字は、変わっていない', () => {
    const want: Record<string, string> = {
      各停: '各', 普通: '各', 急行: '急', 快速: '快', 区間快速: '区快', 特別快速: '特快', 通勤特快: '通快',
      特急あやみ: 'あやみ', 特急めぐり: 'めぐり', '特急(Nライナー)': 'N', 特急: '特',
    };
    for (const [t, l] of Object.entries(want)) expect(bandLabelOf(t), t).toBe(l);
    expect(typeStyleOf('特急めぐり').hex).toBe('#7C3AED');
  });
});
