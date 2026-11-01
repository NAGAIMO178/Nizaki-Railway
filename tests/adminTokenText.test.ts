// 管理者トークンの画面に、値の置き場所(GAS のスクリプトプロパティ・ADMIN_TOKEN)を出さない
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('管理者トークンの画面', () => {
  it('「GAS のスクリプトプロパティ」「ADMIN_TOKEN」の説明が、画面の文に無い', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'AdminConsoleModal.tsx'), 'utf-8');
    expect(src).not.toContain('スクリプトプロパティ');
    expect(src).not.toContain('と同じ文字列');
    // 入力欄・保存の説明は、残っている
    expect(src).toContain('管理トークンを入力');
    expect(src).toContain('この端末にだけ保存され');
  });
});
