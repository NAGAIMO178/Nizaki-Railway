// 「戻る」で、開いているモーダル・シートの、いちばん上を閉じる(履歴の動きを、作りものの履歴で再現して調べる)
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Listener = () => void;
const g = globalThis as unknown as { window: Record<string, unknown> };

// ブラウザの履歴の作りもの: 先頭に1件(アプリを開いたページ)。back は、少しあとに戻る(本物と同じ)
const makeHistory = () => {
  const listeners = new Set<Listener>();
  const h = {
    entries: ['base'] as string[],
    idx: 0,
    pushed: 0,
    failPush: false,
    pushState(_state: unknown) {
      if (h.failPush) throw new Error('SecurityError');
      h.entries.length = h.idx + 1;
      h.entries.push('layer');
      h.idx++;
      h.pushed++;
    },
    back() {
      queueMicrotask(() => {
        if (h.idx > 0) {
          h.idx--;
          listeners.forEach((l) => l());
        }
      });
    },
    go(n: number) {
      queueMicrotask(() => {
        const to = Math.max(0, h.idx + n);
        if (to !== h.idx) {
          h.idx = to;
          listeners.forEach((l) => l());
        }
      });
    },
    // ユーザーが「戻る」を押した(すぐ戻る)
    userBack() {
      if (h.idx > 0) {
        h.idx--;
        listeners.forEach((l) => l());
      }
    },
  };
  return { h, listeners };
};

let H: ReturnType<typeof makeHistory>['h'];
let mod: typeof import('../src/utils/backClose');
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  const { h, listeners } = makeHistory();
  H = h;
  g.window.history = h;
  g.window.addEventListener = (type: string, l: Listener) => {
    if (type === 'popstate') listeners.add(l);
  };
  g.window.removeEventListener = (type: string, l: Listener) => {
    if (type === 'popstate') listeners.delete(l);
  };
  // 毎回、新しい状態(重なりの登録を、空にする)で読み込む
  const { vi } = await import('vitest');
  vi.resetModules();
  mod = await import('../src/utils/backClose');
});
afterEach(() => {
  delete g.window.history;
  delete g.window.addEventListener;
  delete g.window.removeEventListener;
});

describe('開いて、「戻る」で閉じる', () => {
  it('開くと、履歴に1件積む。「戻る」で、閉じる。履歴は、もとの1件に戻る', async () => {
    let closed = 0;
    mod.openLayer(() => closed++);
    await settle();
    expect(H.pushed).toBe(1);
    expect(H.idx).toBe(1);
    H.userBack();
    expect(closed).toBe(1);
    expect(mod.openLayerCount()).toBe(0);
    expect(mod.historyDepth()).toBe(0);
    expect(H.idx).toBe(0);
  });

  it('重なって開いているときは、あとに開いたものから閉じる', async () => {
    const order: string[] = [];
    mod.openLayer(() => order.push('下'));
    mod.openLayer(() => order.push('上'));
    await settle();
    expect(H.idx).toBe(2);
    H.userBack();
    expect(order).toEqual(['上']);
    H.userBack();
    expect(order).toEqual(['上', '下']);
    expect(H.idx).toBe(0);
  });

  it('何も開いていないときの「戻る」は、何も閉じない(これまでどおり)', async () => {
    let closed = 0;
    const l = mod.openLayer(() => closed++)!;
    await settle();
    H.userBack();
    expect(closed).toBe(1);
    mod.closeLayer(l); // 「戻る」で閉じたあと(部品の後始末)に呼ばれても、何も起きない
    await settle();
    expect(H.idx).toBe(0);
    H.userBack();
    expect(closed).toBe(1);
    expect(mod.openLayerCount()).toBe(0);
  });
});

describe('×ボタンなど、「戻る」以外で閉じたとき', () => {
  it('積んだ履歴を取り除く(あとの「戻る」が、空振りしない)。閉じる関数は、呼ばない', async () => {
    let closed = 0;
    const l = mod.openLayer(() => closed++)!;
    await settle();
    expect(H.idx).toBe(1);
    mod.closeLayer(l);
    await settle();
    await settle();
    expect(closed).toBe(0);
    expect(H.idx).toBe(0); // 履歴が、もとに戻った
    expect(mod.historyDepth()).toBe(0);
    expect(mod.openLayerCount()).toBe(0);
    expect(H.entries.slice(0, H.idx + 1)).toEqual(['base']);
  });

  it('×で閉じて、すぐ別のものを開いても(シートの切り替え)、履歴は1件だけ。「戻る」で、あとのものが閉じる', async () => {
    let closedB = 0;
    const a = mod.openLayer(() => undefined)!;
    await settle();
    mod.closeLayer(a); // いまのシートを閉じて
    mod.openLayer(() => closedB++); // すぐ、次のシートを開く
    await settle();
    await settle();
    expect(H.idx).toBe(1);
    expect(mod.historyDepth()).toBe(1);
    H.userBack();
    expect(closedB).toBe(1);
    expect(H.idx).toBe(0);
  });

  it('いくつか重なっていて、全部を×(まとめて)閉じても、履歴が、もとに戻る', async () => {
    const a = mod.openLayer(() => undefined)!;
    const b = mod.openLayer(() => undefined)!;
    await settle();
    expect(H.idx).toBe(2);
    mod.closeLayer(b);
    mod.closeLayer(a);
    await settle();
    await settle();
    expect(H.idx).toBe(0);
    expect(mod.openLayerCount()).toBe(0);
    expect(mod.historyDepth()).toBe(0);
  });

  it('開発時の二重実行(開く → すぐ閉じる → すぐ開く)でも、履歴は1件で、「戻る」で閉じる', async () => {
    let closed = 0;
    const first = mod.openLayer(() => undefined)!;
    mod.closeLayer(first);
    mod.openLayer(() => closed++);
    await settle();
    await settle();
    expect(H.idx).toBe(1);
    expect(mod.historyDepth()).toBe(1);
    H.userBack();
    expect(closed).toBe(1);
    expect(H.idx).toBe(0);
    expect(mod.openLayerCount()).toBe(0);
  });

  it('下のものを×で閉じて、上のものが残るとき: 上のものは「戻る」で閉じる。履歴は、合う', async () => {
    let closedTop = 0;
    const bottom = mod.openLayer(() => undefined)!;
    mod.openLayer(() => closedTop++);
    await settle();
    expect(H.idx).toBe(2);
    mod.closeLayer(bottom);
    await settle();
    await settle();
    expect(H.idx).toBe(1);
    H.userBack();
    expect(closedTop).toBe(1);
    expect(H.idx).toBe(0);
  });
});

describe('履歴に積めない環境', () => {
  it('pushState が失敗しても、例外にならない(×で、これまでどおり閉じられる)', async () => {
    H.failPush = true;
    const l = mod.openLayer(() => undefined);
    await settle();
    expect(H.idx).toBe(0);
    expect(() => mod.closeLayer(l!)).not.toThrow();
    await settle();
    expect(mod.openLayerCount()).toBe(0);
  });
});

describe('モーダル・シートへの組み込み', () => {
  const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', f), 'utf-8');
  it('開閉のあるモーダル・シートが、useBackClose を使っている', () => {
    for (const f of [
      'LoginModal', 'MyPageModal', 'NPointModal', 'RouteMapModal', 'QRCodeModal', 'TicketQRModal', 'EDeliveryModal', 'SeatSelectionModal',
      'MenuDrawer', 'PrivacyPolicyModal', 'RouteFilterSheet', 'StationPickerSheet', 'ArrivalTimeSheet', 'AdminConsoleModal',
      'CompletionModal', 'ImagePreview', 'EventTarePage', 'ReservationTab', 'TrainLocationTab',
    ]) {
      expect(src(`${f}.tsx`), f).toContain('useBackClose(');
    }
  });

  it('フックは、早く返す(if (!isOpen) return null)より前に呼ぶ(フックの順番が変わらない)', () => {
    for (const f of ['LoginModal', 'NPointModal', 'RouteMapModal', 'QRCodeModal', 'TicketQRModal', 'EDeliveryModal', 'SeatSelectionModal', 'MenuDrawer', 'PrivacyPolicyModal', 'RouteFilterSheet', 'StationPickerSheet', 'ArrivalTimeSheet', 'AdminConsoleModal', 'MyPageModal']) {
      const code = src(`${f}.tsx`);
      const hook = code.indexOf('useBackClose(isOpen');
      const early = code.search(/if \(!isOpen[^)]*\) return null;/);
      expect(hook, f).toBeGreaterThan(0);
      expect(hook, f).toBeLessThan(early);
    }
  });

  it('タブの切り替えは、履歴に積まない(pushState は、backClose.ts だけ)', () => {
    const files = fs.readdirSync(path.resolve(__dirname, '..', 'src', 'components')).map((f) => path.resolve(__dirname, '..', 'src', 'components', f));
    for (const f of files) expect(fs.readFileSync(f, 'utf-8'), f).not.toContain('pushState');
    expect(fs.readFileSync(path.resolve(__dirname, '..', 'src', 'App.tsx'), 'utf-8')).not.toContain('pushState');
  });
});
