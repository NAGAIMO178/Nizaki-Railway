// 「架空」「模擬」の断り書きを、減らした決まりを調べる(架空鉄道がモチーフのアプリ。すべて架空という説明は、プライバシーポリシーとご利用にあたってにある)。
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const read = (name: string) => readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8');

describe('消した断り書き', () => {
  const gone: [string, string[]][] = [
    ['TicketQRModal', ['架空の鉄道を題材にしたフィクション']],
    ['TicketCheckPage', ['架空の鉄道を題材にしたフィクション']],
    ['QRCodeModal', ['架空の鉄道を題材にしたフィクション', '架空鉄道アプリの表示イメージです', '実際の改札や検札では使えません']],
    ['StatusCard', ['※架空設定（フィクション）']],
    ['MyStationCard', ['模擬ダイヤに基づく表示です']],
    ['TrainDetailV2', ['※模擬の混雑です']],
    ['RouteFilterSheet', ['(模擬の混雑です)']],
    ['TrainLocationTab', ['(模擬)']],
  ];
  for (const [file, texts] of gone) {
    it(`${file} に、無い`, () => {
      const s = read(file);
      for (const t of texts) expect(s).not.toContain(t);
    });
  }
});

describe('残す断り書き', () => {
  it('運行支障カードの下の注意書きは、1つ', () => {
    expect(read('StatusCard').match(/※本運行支障・遅延情報は架空鉄道アプリ内のフィクションです。/g)).toHaveLength(1);
  });
  it('「ご利用にあたって」(神埼鉄道は架空の鉄道です)が、ある', () => {
    expect(read('RouteDetail')).toContain('神埼鉄道は架空の鉄道です');
  });
  it('「模擬ダイヤに基づく表示です」は、列車位置の1か所だけ', () => {
    expect(read('TrainLocationTab').match(/模擬ダイヤに基づく表示です/g)).toHaveLength(1);
    const hits = readdirSync(new URL('../src', import.meta.url), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(tsx?|jsx?)$/.test(f))
      .filter((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').includes('模擬ダイヤに基づく表示です'));
    expect(hits).toEqual(['components/TrainLocationTab.tsx']);
  });
  it('プライバシーポリシーに、すべて架空の設定と書いてある', () => {
    expect(read('PrivacyPolicyModal')).toContain('すべて架空の設定');
  });
});
