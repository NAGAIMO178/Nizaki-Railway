// アプリの名前は「神埼線アプリ」に統一する(ホーム画面・タブの名前・設定の版の表示・LINE の通知文の見出し)
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf-8');

describe('アプリの名前: 神埼線アプリ', () => {
  it('manifest.json の name と short_name', () => {
    const m = JSON.parse(read('public/manifest.json'));
    expect(m.name).toBe('神埼線アプリ');
    expect(m.short_name).toBe('神埼線アプリ');
  });
  it('index.html の title と、ホーム画面に追加したときの名前', () => {
    const h = read('index.html');
    expect(h).toContain('<title>神埼線アプリ</title>');
    expect(h).toContain('<meta name="apple-mobile-web-app-title" content="神埼線アプリ" />');
  });
  it('設定の下の版の表示', () => {
    expect(read('src/components/SettingsTab.tsx')).toContain('神埼線アプリ v{__APP_VERSION__}');
  });
  it('GAS: LINE の通知文の見出し(ログインの認証コード・パスワード再設定の認証コード)と、アプリを案内する文', () => {
    const g = read('gas/Code.gs');
    expect(g.split("'🚆神埼線アプリ\\n\\n' +").length - 1).toBe(2);
    expect(g).toContain('神埼線アプリよりご予約をお願いいたします。');
    expect(g).toContain('神埼線アプリで、神埼IDにログインした状態でご予約ください。');
  });
  it('古い書き方が、残っていない(アプリ名としての「神埼鉄道 NIZAKI App」「神埼鉄道アプリ」「神埼アプリ」)', () => {
    for (const f of ['public/manifest.json', 'index.html', 'gas/Code.gs', 'src/components/SettingsTab.tsx', 'src/components/EventsTab.tsx', 'src/components/LaunchWelcome.tsx', 'src/utils/disruptionManager.ts', 'src/utils/systemLogger.ts']) {
      const s = read(f);
      expect(s, f).not.toMatch(/神埼鉄道 NIZAKI App|神埼鉄道アプリ|神埼アプリ|神埼鉄道グループ NIZAKI\\n/);
    }
  });
  it('変えないもの: NIZAKI 2.0・NIZAKI ID・会社の名前(神埼鉄道グループ)は、そのまま', () => {
    expect(read('src/components/LaunchWelcome.tsx')).toContain('NIZAKI 2.0 へようこそ');
    expect(read('src/components/LoginModal.tsx')).toContain('神埼鉄道 NIZAKI ID');
    expect(read('src/components/RouteMapModal.tsx')).toContain('神埼鉄道 路線図');
  });
});
