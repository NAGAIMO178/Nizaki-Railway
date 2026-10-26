// 会員証・N-POINT の入口のアイコンは、バーコード(Barcode)。本物の QR(QR乗車券・QR特急券)だけが QrCode
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', f), 'utf-8');
const iconBefore = (code: string, label: string): string | undefined => {
  const i = code.indexOf(label);
  const head = code.slice(Math.max(0, i - 400), i);
  return [...head.matchAll(/<(Barcode|QrCode)\b/g)].pop()?.[1];
};

describe('会員証・N-POINT のアイコン', () => {
  it('メニューの N-POINT の行・設定の「デジタル会員証」・ヘッダーは、バーコード', () => {
    const menu = src('MenuDrawer.tsx');
    expect(menu).toMatch(/<Row icon=\{<Barcode [^>]*\/>\} label="N-POINT"/);
    expect(menu).not.toContain('QrCode');
    expect(iconBefore(src('SettingsTab.tsx'), '<span>デジタル会員証</span>')).toBe('Barcode');
    expect(src('Header.tsx')).toContain('<Barcode');
    expect(src('Header.tsx')).not.toContain('QrCode');
  });

  it('QR乗車券・QR特急券は、本物の QR なので、QrCode のまま', () => {
    expect(iconBefore(src('MyPageModal.tsx'), '<span>QR特急券</span>')).toBe('QrCode');
    expect(iconBefore(src('ReservationTab.tsx'), '<span>QR乗車券</span>')).toBe('QrCode');
    expect(src('TicketQRModal.tsx')).toContain('<QrCode');
    expect(src('QRCodeModal.tsx')).toContain('<QrCode');
  });
});
