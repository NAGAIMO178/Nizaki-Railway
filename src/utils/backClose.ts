// 「戻る」(Android の戻るボタン・ブラウザの戻る)で、開いているモーダル・シートの、いちばん上を閉じる。
//  - 開いているものの数だけ、履歴に件を積む(URL は変えない)。「戻る」で、1件が取り除かれ、いちばん上のものが閉じる。
//  - ×ボタンなど、「戻る」以外で閉じたときは、積んだ履歴を、こちらから戻して取り除く(あとの「戻る」が、空振りしない)。
//  - 開いているものが無いときは、何もしない(これまでどおり、アプリを離れる)。タブの切り替えは、履歴に積まない。
//  - 重なって開いているときは、あとに開いたものから閉じる。
//  - 履歴の出し入れは、開閉のあと、少し待ってから、まとめて行う(閉じてすぐ別のものを開く切り替えや、開発時の二重実行でも、履歴が崩れない)。
import { useEffect, useRef } from 'react';

export interface Layer {
  close: () => void;
}

const stack: Layer[] = []; // 開いているもの(あとに開いたものが、後ろ)
let depth = 0; // こちらが履歴に積んでいる件数
let pendingBack = 0; // こちらが戻している最中の件数(その popstate は、「戻る」ボタンではない)
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

const hasHistory = (): boolean => typeof window !== 'undefined' && !!window.history && typeof window.history.pushState === 'function';

// 履歴の件数を、開いているものの数に合わせる
const sync = () => {
  timer = undefined;
  if (!hasHistory() || pendingBack > 0) return;
  while (depth < stack.length) {
    try {
      window.history.pushState({ nizakiLayer: true }, '');
      depth++;
    } catch {
      return; // 履歴に積めない環境では、これまでどおり(×で閉じる)
    }
  }
  if (depth > stack.length) {
    const n = depth - stack.length;
    pendingBack = n;
    try {
      window.history.go(-n);
    } catch {
      pendingBack = 0;
    }
  }
};

const schedule = () => {
  if (timer !== undefined) return;
  timer = setTimeout(sync, 0);
};

const onPop = () => {
  if (pendingBack > 0) {
    // こちらが戻した分(×などで閉じたもの)
    depth = Math.max(0, depth - pendingBack);
    pendingBack = 0;
    schedule(); // 戻している最中に、開閉があったかもしれない
    return;
  }
  // 「戻る」ボタン: 積んだ1件が取り除かれたので、いちばん上のものを閉じる
  if (depth > 0) depth--;
  const top = stack.pop();
  if (top) top.close();
};

// 開いたとき: 閉じ方を登録する(履歴は、少し待って積む)
export const openLayer = (close: () => void): Layer | null => {
  if (!hasHistory()) return null;
  if (!listening) {
    window.addEventListener('popstate', onPop);
    listening = true;
  }
  const layer: Layer = { close };
  stack.push(layer);
  schedule();
  return layer;
};

// 「戻る」以外で閉じたとき: 登録を外す(積んだ履歴は、少し待って、取り除く)。「戻る」で閉じたもの(すでに外れている)は、何もしない
export const closeLayer = (layer: Layer): void => {
  const i = stack.indexOf(layer);
  if (i < 0) return;
  stack.splice(i, 1);
  schedule();
};

// いま、「戻る」で閉じられるものが、いくつ開いているか(テスト用)
export const openLayerCount = (): number => stack.length;
// いま、こちらが積んでいる履歴の件数(テスト用)
export const historyDepth = (): number => depth;

// モーダル・シートが、開いているあいだだけ、「戻る」で閉じられるようにする
export const useBackClose = (isOpen: boolean, onClose: () => void): void => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const layer = openLayer(() => closeRef.current());
    return () => {
      if (layer) closeLayer(layer);
    };
  }, [isOpen]);
};
