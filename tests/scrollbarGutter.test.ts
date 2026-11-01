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

describe('スクロールバーの場所の色', () => {
  it('PC(マウス)では、起動の画面が消えたあと、html の背景をアプリの背景色にする。スマホ(タッチ)・起動の画面のあいだは、紫のまま', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');
    expect(html).toMatch(/html, body \{[^}]*background-color: #5324AA/); // これまでの紫
    expect(html).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*html:not\(:has\(#initial-splash\)\) \{\s*background-color: #F4F3F8;/);
    expect(html).toContain('<div id="initial-splash" class="splash-screen">'); // 起動の画面は、そのまま
  });
});
