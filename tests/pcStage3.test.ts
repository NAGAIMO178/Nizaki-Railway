// PC 表示 段階3: 下から出るシートとモーダルを、PC の幅(pc: = PC 表示が出ていて、かつ 1024px 以上。日時まで隠す)だけ、中央の枠にする。
// スマホ(1024px 未満)・PC 表示が隠れているあいだのクラスは、1文字も変えない。
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useDragToDismiss } from '../src/utils/useDragToDismiss';

const root = path.resolve(__dirname, '..');
const readFile = (f: string) => fs.readFileSync(path.join(root, 'src', 'components', f), 'utf-8');
const phoneOnly = (s: string) => s.replace(/ (pc|motion-reduce):[^\s"'`}]+/g, '');
const tokens = (s: string) => [...new Set(s.match(/pc:[^\s"'`}]+/g) ?? [])].sort();

// ファイル → 足してよい pc: のクラス(ぴったり)
const EXPECTED: Record<string, string[]> = {
  // 下から出るシート → 中央の枠
  'StationPickerSheet.tsx': ['pc:absolute', 'pc:flex', 'pc:flex-none', 'pc:hidden', 'pc:inset-0', 'pc:items-center', 'pc:justify-center', 'pc:max-h-[85vh]', 'pc:max-w-[560px]', 'pc:mt-2', 'pc:p-4', 'pc:h-auto', 'pc:relative', 'pc:rounded-3xl'],
  'RouteFilterSheet.tsx': ['pc:absolute', 'pc:cursor-default', 'pc:flex-none', 'pc:hidden', 'pc:inset-0', 'pc:items-center', 'pc:justify-center', 'pc:max-w-[480px]', 'pc:p-4', 'pc:pt-5', 'pc:relative', 'pc:rounded-3xl'],
  'ArrivalTimeSheet.tsx': ['pc:absolute', 'pc:flex', 'pc:flex-none', 'pc:hidden', 'pc:inset-0', 'pc:items-center', 'pc:justify-center', 'pc:max-h-[85vh]', 'pc:max-w-[480px]', 'pc:overflow-y-auto', 'pc:p-4', 'pc:pt-4', 'pc:relative', 'pc:rounded-3xl'],
  // モーダル(もともと中央の枠): 幅と高さだけ
  'TicketQRModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[384px]'],
  'QRCodeModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[384px]', 'pc:overflow-y-auto'],
  'CompletionModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[384px]'],
  'TicketCheckPage.tsx': ['pc:max-w-[384px]'],
  'ReservationTab.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[384px]', 'pc:overflow-y-auto'],
  'LaunchWelcome.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[384px]', 'pc:overflow-y-auto'],
  'UpdatePrompt.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[384px]', 'pc:overflow-y-auto'],
  'ImagePreview.tsx': ['pc:max-w-[384px]'],
  'LoginModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[480px]'],
  'SeatSelectionModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[480px]'],
  'MyPageModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[640px]'],
  'NPointModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[640px]'],
  'EDeliveryModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[640px]'],
  'PrivacyPolicyModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[640px]'],
  'AdminConsoleModal.tsx': ['pc:max-h-[85vh]', 'pc:max-w-[640px]'],
  'RouteMapModal.tsx': ['pc:h-[85vh]', 'pc:max-w-[1000px]'],
  // 公開前の謎解きイベントと、白紙に戻す確認(近い幅)
  'MysteryTrainEvent.tsx': ['pc:max-w-[480px]', 'pc:max-w-[640px]'],
  'MysteryTrainApp.jsx': ['pc:max-w-[480px]', 'pc:max-w-[640px]'],
  'EventTarePage.tsx': ['pc:max-w-[384px]'],
};

describe('PC 用のクラスは、足してよい一覧と、ぴったり同じ', () => {
  for (const [file, expected] of Object.entries(EXPECTED)) {
    it(file, () => {
      expect(tokens(readFile(file))).toEqual([...expected].sort());
    });
  }
  it('pc: でない形(sm: md: lg: など)の、PC 用の指定は、足していない', () => {
    for (const f of ['StationPickerSheet.tsx', 'RouteFilterSheet.tsx', 'ArrivalTimeSheet.tsx']) {
      expect(readFile(f), f).not.toMatch(/\b(sm|md|lg|xl|2xl):/);
    }
  });
});

describe('枠の幅(PC)', () => {
  const widths: Array<[string, string]> = [
    ['TicketQRModal.tsx', '384'], ['QRCodeModal.tsx', '384'], ['CompletionModal.tsx', '384'], ['TicketCheckPage.tsx', '384'],
    ['ReservationTab.tsx', '384'], ['LaunchWelcome.tsx', '384'], ['UpdatePrompt.tsx', '384'], ['ImagePreview.tsx', '384'],
    ['LoginModal.tsx', '480'], ['SeatSelectionModal.tsx', '480'], ['RouteFilterSheet.tsx', '480'], ['ArrivalTimeSheet.tsx', '480'],
    ['StationPickerSheet.tsx', '560'],
    ['MyPageModal.tsx', '640'], ['NPointModal.tsx', '640'], ['EDeliveryModal.tsx', '640'], ['PrivacyPolicyModal.tsx', '640'], ['AdminConsoleModal.tsx', '640'],
    ['RouteMapModal.tsx', '1000'],
  ];
  for (const [file, w] of widths) {
    it(`${file} は ${w}px`, () => {
      expect(readFile(file)).toContain(`pc:max-w-[${w}px]`);
    });
  }
  it('ようこそ案内(下の中央)は 384px', () => {
    expect(readFile('LaunchWelcome.tsx')).toContain('border border-[#E6E2EE] bg-white p-4 shadow-2xl pc:max-w-[384px]"');
  });
  it('下から出るシートは、PC では、四隅とも丸い', () => {
    for (const f of ['StationPickerSheet.tsx', 'RouteFilterSheet.tsx', 'ArrivalTimeSheet.tsx']) {
      const s = readFile(f);
      expect(s, f).toContain('rounded-t-3xl'); // スマホ: 上だけ丸い(そのまま)
      expect(s, f).toContain('pc:rounded-3xl');
    }
  });
});

describe('PC 用のクラスを取り除くと、スマホのクラスは、これまでと同じ', () => {
  it('駅を選ぶ', () => {
    const s = phoneOnly(readFile('StationPickerSheet.tsx'));
    expect(s).toContain('className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn"');
    expect(s).toContain('className="flex-1 cursor-default" aria-label={`${title}を選ぶのを閉じる`}');
    expect(s).toContain('className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl h-[85vh] flex flex-col"');
    expect(s).toContain('className="shrink-0 px-4 pt-3 pb-1 cursor-grab active:cursor-grabbing select-none"');
    expect(s).toContain('className="shrink-0 mx-4 my-1.5 flex items-center gap-2 rounded-xl bg-[#F4F3F8] px-3"');
  });
  it('絞り込み', () => {
    const s = phoneOnly(readFile('RouteFilterSheet.tsx'));
    expect(s).toContain('className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn"');
    expect(s).toContain('className="flex-1 cursor-default" aria-label="絞り込みを閉じる"');
    expect(s).toContain('className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"');
    expect(s).toContain('className="shrink-0 px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"');
    expect(s).toContain('<div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#D1C9E3]" />');
  });
  it('到着の日時', () => {
    const s = phoneOnly(readFile('ArrivalTimeSheet.tsx'));
    expect(s).toContain('className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn"');
    expect(s).toContain('className="flex-1 cursor-default" aria-label="閉じる"');
    expect(s).toContain('className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl"');
    expect(s).toContain('className="shrink-0 px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"');
    expect(s).toContain('<div className="px-4 pb-6 space-y-3">');
  });
  it('モーダル: 枠のクラス', () => {
    expect(phoneOnly(readFile('LoginModal.tsx'))).toContain('"bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#E5E2EE] overflow-hidden flex flex-col max-h-[90vh]"');
    expect(phoneOnly(readFile('MyPageModal.tsx'))).toContain('"w-full max-w-lg bg-[#F8F7FB] rounded-3xl shadow-2xl border border-white/60 overflow-hidden flex flex-col max-h-[90vh] animate-scaleUp"');
    expect(phoneOnly(readFile('NPointModal.tsx'))).toContain('"bg-white text-[#221C35] w-full max-w-lg rounded-3xl border border-[#E6E2EE] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"');
    expect(phoneOnly(readFile('EDeliveryModal.tsx'))).toContain('w-full max-w-lg rounded-3xl border border-[#E6E2EE] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"');
    expect(phoneOnly(readFile('PrivacyPolicyModal.tsx'))).toContain('"bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E5E2EE] overflow-hidden flex flex-col max-h-[90vh]"');
    expect(phoneOnly(readFile('AdminConsoleModal.tsx'))).toContain('"bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl h-[620px] max-h-[92vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden relative"');
    expect(phoneOnly(readFile('RouteMapModal.tsx'))).toContain('w-full max-w-5xl rounded-3xl border border-[#E6E2EE] shadow-2xl overflow-hidden flex flex-col h-[92vh]"');
    expect(phoneOnly(readFile('SeatSelectionModal.tsx'))).toContain('rounded-xl max-w-sm w-full p-3.5 space-y-3 shadow-xl border border-gray-200 relative max-h-[90vh] flex flex-col text-gray-800 text-xs"');
    expect(phoneOnly(readFile('TicketQRModal.tsx'))).toContain('"bg-white rounded-3xl max-w-sm w-full max-h-[92dvh] overflow-y-auto p-5 space-y-4 shadow-2xl border border-[#E0D7F3] relative animate-scaleUp text-[#221C35]"');
    expect(phoneOnly(readFile('QRCodeModal.tsx'))).toContain('"bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#E0D7F3] relative animate-scaleUp text-[#221C35]"');
    expect(phoneOnly(readFile('CompletionModal.tsx'))).toContain('"w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-white rounded-3xl border border-[#E5E2EE] shadow-2xl p-6 text-center animate-scaleUp"');
    expect(phoneOnly(readFile('UpdatePrompt.tsx'))).toContain('"w-full max-w-lg rounded-2xl bg-[#131a27] p-6 text-white shadow-2xl"');
    expect(phoneOnly(readFile('LaunchWelcome.tsx'))).toContain('"w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"');
    expect(phoneOnly(readFile('TicketCheckPage.tsx'))).toContain('"w-full max-w-xs bg-white rounded-3xl');
    expect(phoneOnly(readFile('ImagePreview.tsx'))).toContain('className="max-w-full max-h-[75vh] rounded-xl bg-white"');
    expect(phoneOnly(readFile('ReservationTab.tsx'))).toContain('"bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#E5E2EE] relative animate-scaleUp"');
  });
});

describe('下へ引いて閉じる動き(useDragToDismiss)', () => {
  const capture = (enabled?: boolean) => {
    let out: ReturnType<typeof useDragToDismiss> | undefined;
    const C = () => {
      out = enabled === undefined ? useDragToDismiss(() => {}) : useDragToDismiss(() => {}, enabled);
      return null;
    };
    renderToStaticMarkup(React.createElement(C));
    return out!;
  };
  it('引数なし(スマホ・PC 表示が隠れているとき)は、これまでと同じ: つまみの動き・キー操作・引いた量の style がある', () => {
    const d = capture();
    expect(Object.keys(d.handleProps).sort()).toEqual(['data-sheet-handle', 'onKeyDown', 'onPointerCancel', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'style', 'tabIndex']);
    expect((d.style as { transform?: string }).transform).toBe('translateY(0px)');
  });
  it('enabled=false(PC 表示)のときは、つまみの動きも、引いた量の style も、付かない', () => {
    const d = capture(false);
    expect(d.handleProps).toEqual({});
    expect(d.style).toEqual({});
  });
  it('3つのシートは、PC 表示のときだけ、動きを切る', () => {
    for (const f of ['StationPickerSheet.tsx', 'RouteFilterSheet.tsx', 'ArrivalTimeSheet.tsx']) {
      const s = readFile(f);
      expect(s, f).toContain('const drag = useDragToDismiss(onClose, !pcLayout);');
      expect(s, f).toContain("import { usePcLayout } from '../utils/usePcLayout';");
    }
  });
  it('列車位置の2つのシートは、これまでどおり(引数なし)', () => {
    const s = readFile('TrainLocationTab.tsx');
    expect(s).toContain('useDragToDismiss(() => setSelectedStation(null))');
    expect(s).toContain('useDragToDismiss(clearTrainSelection)');
  });
});

describe('PC 用の閉じるボタン(スマホでは出ない)', () => {
  it('駅を選ぶ・到着の日時: hidden pc:flex の行に、閉じるボタン', () => {
    for (const f of ['StationPickerSheet.tsx', 'ArrivalTimeSheet.tsx']) {
      const s = readFile(f);
      expect(s, f).toContain('className="hidden pc:flex');
      expect(s, f).toContain('aria-label="閉じる"');
    }
  });
});
