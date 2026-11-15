// PC 表示 段階2: 時刻表(駅の時刻表)を、PC の幅(lg: = 1024px 以上)だけ、左右2列(案2)にする。列車位置を、左(路線のタブ+図)・右(詳細)にする。
// スマホ(1024px 未満)のクラスは、1文字も変えない。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, 'src', 'components', `${f}.tsx`), 'utf-8');
// PC 用のクラス(lg: で始まるもの)を取り除いた、スマホだけのソース
const phoneOnly = (s: string) => s.replace(/ (lg|motion-reduce):[^\s"'`}]+/g, '');
const lgTokens = (s: string) => [...new Set(s.match(/lg:[^\s"'`}]+/g) ?? [])].sort();

describe('PC 用のクラスは、lg: つきだけ(足してよいクラスの一覧と、ぴったり同じ)', () => {
  it('時刻表', () => {
    expect(lgTokens(read('TimetableTab'))).toEqual(
      ['lg:col-span-2', 'lg:col-start-1', 'lg:col-start-2', 'lg:gap-x-3.5', 'lg:gap-y-3', 'lg:grid', 'lg:grid-cols-2', 'lg:hidden', 'lg:justify-end', 'lg:justify-self-start', 'lg:max-w-[960px]', 'lg:row-span-2', 'lg:row-start-1', 'lg:row-start-2', 'lg:self-end', 'lg:space-y-0'].sort()
    );
  });
  it('列車位置・列車の詳細', () => {
    expect(lgTokens(read('TrainLocationTab'))).toEqual(
      ['lg:animate-none', 'lg:border', 'lg:duration-300', 'lg:ease-out', 'lg:flex', 'lg:hidden', 'lg:items-start', 'lg:max-h-[calc(100vh-11rem)]', 'lg:max-h-[calc(100vh-13rem)]', 'lg:max-w-[960px]', 'lg:max-w-none', 'lg:mx-0', 'lg:opacity-0', 'lg:opacity-100', 'lg:overflow-x-clip', 'lg:pointer-events-none', 'lg:pt-4', 'lg:rounded-2xl', 'lg:shrink-0', 'lg:space-y-3', 'lg:static', 'lg:sticky', 'lg:top-16', 'lg:transition-all', 'lg:transition-transform', 'lg:translate-x-0', 'lg:translate-x-[264px]', 'lg:translate-x-full', 'lg:w-[432px]', 'lg:w-[480px]', 'lg:ml-6'].sort()
    );
    expect(lgTokens(read('TrainDetailV2'))).toEqual(['lg:hidden', 'lg:max-h-[calc(100vh-13rem)]']);
  });
  it('lg: でない形(sm: md: xl: など)の、PC 用の指定は、足していない', () => {
    for (const f of ['TimetableTab', 'TrainLocationTab', 'TrainDetailV2', 'TimetableLegend']) {
      expect(read(f), f).not.toMatch(/\b(sm|md|xl|2xl):(col-|grid|hidden|static|sticky|max-h-\[calc)/);
    }
  });
});

describe('PC 用のクラスを取り除くと、スマホのクラスは、これまでと同じ', () => {
  it('時刻表: 駅の時刻表の枠・戻る・駅の枠・方面・表の帯・1時間の行・凡例', () => {
    const s = phoneOnly(read('TimetableTab'));
    expect(s.split('className="max-w-md mx-auto px-4 py-4 pb-28 space-y-3 animate-fadeIn"').length - 1).toBe(3);
    expect(s).toContain('className="flex items-center gap-1 text-xs font-bold text-[#5B21B6] cursor-pointer"\n        >\n          <ChevronLeft');
    expect(s).toContain('<div className="bg-white border border-[#E6E2EE] rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">\n          <StationBadge');
    expect(s).toContain('<div className="text-[11px] text-[#857D99]">{currentLine?.name} 時刻表</div>');
    expect(s).toContain('<div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="tablist" aria-label="方面">');
    expect(s).toContain('<div className="px-3 py-2 bg-[#EFE8FA] text-[10px] text-[#6B6380] font-bold flex justify-between gap-2">');
    expect(s).toContain('<div key={hour} className="flex items-start border-t border-[#EFEDF5]">');
    expect(s).toContain('<div className="bg-white border border-[#E6E2EE] rounded-2xl overflow-hidden shadow-xs">');
    expect(read('TimetableTab')).toContain('<TimetableLegend rows={legendRows} className="lg:col-span-2" />');
  });
  it('凡例: className を渡さなければ、これまでと同じ文字列', () => {
    expect(read('TimetableLegend')).toContain("space-y-1.5 text-xs text-[#221C35]${className ? ` ${className}` : ''}`}>");
  });
  it('列車位置: 根・下から出る3つのシート・つまみ・重なった列車の一覧', () => {
    const s = phoneOnly(read('TrainLocationTab'));
    expect(s).toContain('pb-24 max-w-md mx-auto relative font-sans"');
    expect(s).toContain('<div className="sticky top-0 z-30 bg-white border-b border-[#E6E2EE] shadow-2xs">');
    expect(s).toContain('className="fixed bottom-14 left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-[#E6E2EE] rounded-t-2xl shadow-xl p-3 space-y-2 animate-slideUp max-h-[45vh] overflow-y-auto overscroll-contain"');
    expect(s.split('className="fixed bottom-14 left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-[#E6E2EE] rounded-t-2xl shadow-lg p-4 space-y-3 animate-slideUp"').length - 1).toBe(2);
    expect(s).toContain('className="w-full py-3 -my-1 flex items-center justify-center cursor-grab active:cursor-grabbing group rounded-t-xl select-none"');
    expect(s.split('className="w-full py-3 -mt-3 flex items-center justify-center cursor-grab active:cursor-grabbing group rounded-t-xl select-none"').length - 1).toBe(2);
    expect(s).toContain('className="max-h-[62vh] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-5"');
  });
  it('列車の詳細: 見出しの帯・「いまの混雑」・「※模擬の混雑です」・外枠', () => {
    const s = phoneOnly(read('TrainDetailV2'));
    expect(s).toContain("'max-h-[62vh] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-3'");
    expect(s).toContain('<div className={`rounded-xl bg-[#5B21B6] text-white px-3.5 py-2 text-sm font-black flex items-center gap-2 shadow-xs${train.paid && train.expressBand ? \'\' : \'\'}`}>');
    expect(s).toContain('whitespace-nowrap shadow-2xs">いまの混雑</span>');
    expect(s).toContain('<div className="text-[10px] font-bold text-[#857D99] mt-0.5">※模擬の混雑です</div>');
  });
});

describe('右の列を、スクロールしても見える位置に留める(sticky)ために、本体の枠を、PC の幅だけ、はみ出し表示に', () => {
  it('main の枠: スマホのクラスはそのまま。PC の幅だけ overflow-y-visible を足す(左のヘッダーは、これまでどおり、動かない=lg:static)', () => {
    const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf-8');
    expect(app).toContain('<main className="flex-1 w-full bg-[#F4F3F8] text-[#221C35] overflow-y-auto lg:overflow-y-visible">');
    expect(read('TrainLocationTab')).toContain('shadow-2xs lg:static">');
  });
});

describe('PC のときだけ消すもの(整理)', () => {
  it('時刻表: 「高宮線 時刻表」(駅の枠の小さな字)と、表の帯の「おもな行き先」', () => {
    const s = read('TimetableTab');
    expect(s).toContain('<div className="text-[11px] text-[#857D99] lg:hidden">{currentLine?.name} 時刻表</div>');
    expect(s).toContain('<span className="lg:hidden">おもな行き先: {direction?.mainDest}行</span>');
    expect(s).toContain('<span>全日共通のダイヤ</span>');
  });
  it('列車の詳細: 路線名の紫の帯(有料の特急の列車名の帯は残す)・「いまの混雑」・「※模擬の混雑です」', () => {
    const s = read('TrainDetailV2');
    expect(s).toContain("shadow-xs${train.paid && train.expressBand ? '' : ' lg:hidden'}`}");
    expect(s).toContain('shadow-2xs lg:hidden">いまの混雑</span>');
    expect(s).toContain('mt-0.5 lg:hidden">※模擬の混雑です</div>');
  });
});

describe('時刻表: 時間帯の分け目と、表の中身', () => {
  const s = read('TimetableTab');
  it('PC の左は 15 時台まで(hour < 16)、右は 16 時台から(hour >= 16)。スマホは、これまでの1列(全部)', () => {
    expect(s).toContain('rows.filter(([hour]) => hour < 16).map(([hour, deps]) => hourRow(hour, deps))');
    expect(s).toContain('rows.filter(([hour]) => hour >= 16).map(([hour, deps]) => hourRow(hour, deps))');
    expect(s).toContain('<div className="lg:hidden">{rows.map(([hour, deps]) => hourRow(hour, deps))}</div>');
    expect(s).toContain('<div className="hidden lg:grid lg:grid-cols-2">');
  });
  it('1時間の行は、スマホ・PC で同じ部品(同じ見た目)', () => {
    expect(s.split('hourRow(hour, deps)').length - 1).toBe(3);
    expect(s.split('const hourRow = ').length - 1).toBe(1);
  });
  it('「次の列車」へのスクロールは、画面に出ているほうの列へ', () => {
    expect(s).toContain('nextEls.current.find((el) => el.offsetParent !== null)?.scrollIntoView({ block: \'center\' });');
  });
});

describe('列車位置(PC の幅): 未選択=図が中央 / 選択=図が左・右に詳細 / 閉じる=中央へ戻る', () => {
  const s = read('TrainLocationTab');
  it('根は、PC の幅だけ横並び(はみ出しは切る)。左の列は幅 432px 固定(選ぶ前後で変えない)で、選んでいないときは中央(右へ 264px ずらす)、選んだときは左(ずらさない)。0.3秒でなめらかに', () => {
    expect(s).toContain('relative font-sans lg:flex lg:items-start lg:overflow-x-clip"');
    expect(s).toContain("lg:w-[432px] lg:shrink-0 lg:transition-transform lg:duration-300 lg:ease-out motion-reduce:transition-none ${detailOpen ? 'lg:translate-x-0' : 'lg:translate-x-[264px]'}");
  });
  it('図(432px)と詳細(480px)の間に、24px のすき間(432+24+480=936px で、本体の 960px に収まる)', () => {
    expect(s).toContain('lg:w-[432px] lg:shrink-0');
    expect(s).toContain('lg:w-[480px] lg:ml-6 lg:shrink-0');
    expect((960 - 432) / 2).toBe(264);
    expect(432 + 24 + 480).toBeLessThanOrEqual(960);
  });
  it('右の列は、選んだときだけ見える(選んでいないときは、透明で、押せず、右の外へ)。同じ動き(0.3秒)で出入りする', () => {
    expect(s).toContain("lg:w-[480px] lg:ml-6 lg:shrink-0 lg:sticky lg:top-16 lg:pt-4 lg:space-y-3 lg:transition-all lg:duration-300 lg:ease-out motion-reduce:transition-none ${detailOpen ? 'lg:translate-x-0 lg:opacity-100' : 'lg:translate-x-full lg:opacity-0 lg:pointer-events-none'}");
  });
  it('「動きを減らす」設定のとき: CSS の動きを止め(motion-reduce)、閉じるときに、詳細を残さず、すぐ消す', () => {
    expect(s.split('motion-reduce:transition-none').length - 1).toBe(2);
    expect(s).toContain("matchesQuery('(prefers-reduced-motion: reduce)')");
    expect(s).toContain('setLeaving(!detailOpen && isPc && !matchesQuery(');
  });
  it('閉じるとき(PC のみ): 0.3秒だけ、最後の詳細を残して、右へ消えるのを見せる。別の列車・駅を選んだときは、中身が差し替わるだけ(開いたまま=図は動かない)', () => {
    expect(s).toContain('const keep = leaving && !detailOpen ? lastDetail.current : null;');
    expect(s).toContain('setTimeout(() => setLeaving(false), 300)');
    for (const n of ['shownTrain', 'shownGroup', 'shownStation']) expect(s).toContain(`const ${n} = `);
  });
  it('右の列の3つのシートは、残している中身(shown…)で描く。スマホでは、選んだものと同じ(残さない)', () => {
    const right = s.slice(s.indexOf('lg:w-[480px] lg:ml-6 lg:shrink-0 lg:sticky'));
    expect(right).not.toMatch(/\bselected(Train|Group|Station)\b/);
    expect(s).toContain('const isPc = useMediaQuery(\'(min-width: 1024px)\');');
  });
  it('下から出る3つのシートは、PC では、右の列に置く(fixed をやめ、下から出る動きもやめる)。つまみは出さず、代わりに、既存の「閉じる」(X)を PC のときだけ出す', () => {
    expect(s.split('lg:animate-none lg:static lg:max-w-none lg:mx-0 lg:border lg:rounded-2xl').length - 1).toBe(3);
    expect(s.split('select-none lg:hidden"').length - 1).toBe(3);
    expect(s.split('<div className="hidden lg:flex justify-end -mb-2">').length - 1).toBe(3);
    expect(s).toContain('onClick={() => setSelectedStation(null)}\n              className="p-1.5 rounded-lg text-[#6B6380] hover:bg-[#F4F3F8] cursor-pointer"');
    expect(s.split('onClick={clearTrainSelection}\n              className="p-1.5 rounded-lg text-[#6B6380] hover:bg-[#F4F3F8] cursor-pointer"').length - 1).toBe(2);
  });
  it('スマホのクラスは変わらない: 左右の列の入れ物のクラスは、すべて lg: か motion-reduce: つき(スマホでは何も効かない=これまでと同じ)', () => {
    for (const marker of ['<div className={`lg:w-[432px] lg:shrink-0 lg:transition-transform', '<div className={`lg:w-[480px] lg:ml-6 lg:shrink-0 lg:sticky']) {
      const i = s.indexOf(marker);
      expect(i, marker).toBeGreaterThan(-1);
      const tpl = s.slice(i + '<div className={`'.length, s.indexOf('`}>', i));
      const tokens = tpl.replace(/\$\{[^}]*\}/g, '').split(/\s+/).filter(Boolean);
      for (const t of tokens) expect(t, marker).toMatch(/^(lg|motion-reduce):/);
      for (const t of [...tpl.matchAll(/'([^']*)'/g)].flatMap((m) => m[1].split(/\s+/))) expect(t, marker).toMatch(/^lg:/);
    }
  });
});
