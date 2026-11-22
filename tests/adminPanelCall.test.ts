// 管理者パネルの「call」の既定値は、外に置いた1つの関数にする。
// 引数の既定値に、その場で関数を書くと、描きなおすたびに別の関数になり、
// 「useCallback(…, [call]) → useEffect」が、毎回、一覧を読み込み直す(保存で再描画 → また読み込み、が止まらない)。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = path.resolve(__dirname, '..', 'src', 'components');
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf-8');

describe('管理者パネル: call の既定値', () => {
  it('src/components の、どのファイルにも、「call = (…) =>」のような、その場で書いた既定値が、無い', () => {
    const bad = fs.readdirSync(dir).filter((f) => /\.(tsx|jsx|ts)$/.test(f) && /\bcall\s*=\s*(async\s*)?\(/.test(read(f)));
    expect(bad).toEqual([]);
  });

  it.each([
    ['AdminNoticeEditor.tsx', 'AdminNoticeEditor'],
    ['AdminFeedbackPanel.tsx', 'AdminFeedbackPanel'],
    ['AdminSurveyPanel.tsx', 'AdminSurveyPanel'],
  ])('%s は、外に置いた defaultCall を使う', (file, name) => {
    const src = read(file);
    expect(src).toMatch(/^const defaultCall: \w+ = /m);
    expect(src).toContain(`export const ${name}: React.FC<{ call?: `);
    expect(src).toContain('({ call = defaultCall }) => {');
    // defaultCall は、コンポーネントより前(モジュールの直下)に、1回だけ書く
    expect(src.match(/const defaultCall\b/g)).toHaveLength(1);
    expect(src.indexOf('const defaultCall')).toBeLessThan(src.indexOf(`export const ${name}`));
  });
});
