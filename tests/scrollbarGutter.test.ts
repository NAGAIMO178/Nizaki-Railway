// PCの幅で、タブによって縦スクロールバーが出る・出ないで、ヘッダーの位置が動かないよう、バーの場所をいつも空ける
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('スクロールバーの場所', () => {
  it('html に scrollbar-gutter: stable がある', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'index.css'), 'utf-8');
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
  });
});
