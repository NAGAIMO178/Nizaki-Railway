// 名前のない×ボタンに「閉じる」の名前がある・更新のお知らせに「あとで」がある
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', f), 'utf-8');

describe('×ボタンの名前', () => {
  for (const f of ['TicketQRModal', 'NPointModal', 'RouteMapModal', 'QRCodeModal', 'EDeliveryModal', 'SeatSelectionModal']) {
    it(`${f}: 閉じる(×)のボタンに aria-label="閉じる"`, () => {
      const code = src(`${f}.tsx`);
      const m = /<button\s+onClick=\{onClose\}\s+aria-label="閉じる"[\s\S]{0,300}?<X\b/.exec(code);
      expect(m, f).toBeTruthy();
    });
  }
});

describe('更新のお知らせ', () => {
  it('「あとで」があり、押すと、その版では閉じる(新しい版では、また出る)', () => {
    const code = src('UpdatePrompt.tsx');
    expect(code).toContain('あとで');
    expect(code).toContain('dismissedRef.current = info.version');
    expect(code).toContain('isDismissed(dismissedRef.current, result.version)');
    expect(code).toContain('今すぐ更新'); // これまでのボタンは、そのまま
  });
});
