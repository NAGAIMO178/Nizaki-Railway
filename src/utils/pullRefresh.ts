// 「下に引っ張って再読み込み」の、判定(画面の外に出した、純粋な関数)。
//  - ページのいちばん上(スクロール0)で、開いているモーダル・シートがなく、引きが、内側にスクロールする場所や、指で動かす場所の外から始まったときだけ、引ける。
//  - 引く距離に余裕を持たせる(90px)。予約の入力途中などを、うっかり消さないため。
//  - 引いているあいだの、ページのゴムの動き(iOS)は、こちらで止めない(判定だけ。preventDefault はしない)。

export const PULL_TRIGGER_PX = 90; // これだけ引いて離すと、再読み込み
export const PULL_START_PX = 12; // これだけ下に動いたら、「引き始め」と見る(ふつうのタップ・スクロールと区別する)

// 引きを、始めてよいか
export interface PullStartContext {
  scrollTop: number; // ページのスクロール位置
  layers: number; // 開いているモーダル・シートの数(backClose.ts の openLayerCount)
  blocked: boolean; // 内側にスクロールする場所・指で動かす場所・文字の入力欄の中から始まった
  touches: number; // 指の本数
}
export const canStartPull = (c: PullStartContext): boolean => c.touches === 1 && c.scrollTop <= 0 && c.layers === 0 && !c.blocked;

// 触った場所の、まわり(祖先の1つ)の様子。引きを始めさせない場所かを決める
export interface AncestorInfo {
  tag: string; // 大文字(INPUT など)
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
  touchAction: string;
  editable: boolean; // contenteditable
  noPull: boolean; // data-no-pull がついている
}
export const ancestorBlocksPull = (a: AncestorInfo): boolean => {
  if (a.noPull || a.editable) return true;
  if (a.tag === 'INPUT' || a.tag === 'TEXTAREA' || a.tag === 'SELECT') return true;
  // 内側にスクロールする場所(中身が、枠より長いもの)
  if ((a.overflowY === 'auto' || a.overflowY === 'scroll' || a.overflowY === 'overlay') && a.scrollHeight > a.clientHeight + 1) return true;
  // 指で動かす場所(地図の移動・拡大など)は、touch-action で、ふつうのスクロールを切っている
  if (a.touchAction === 'none' || a.touchAction === 'pinch-zoom' || a.touchAction === 'pan-x') return true;
  return false;
};

// 下に、ほぼまっすぐ動いているか(横の動きが大きいときは、引きではない)
export const isPullIntent = (dx: number, dy: number): boolean => dy >= PULL_START_PX && dy > Math.abs(dx) * 1.5;

// 引いている距離(下だけ。上に戻したら0)
export const pullDistance = (startY: number, y: number): number => Math.max(0, y - startY);

// 目印の進み具合(0〜1)。1で、離すと再読み込み
export const pullProgress = (distance: number): number => Math.min(1, Math.max(0, distance / PULL_TRIGGER_PX));

// 指を離したとき、再読み込みするか(離す直前にも、条件を確かめる)
export const shouldReload = (distance: number, scrollTop: number, layers: number): boolean =>
  distance >= PULL_TRIGGER_PX && scrollTop <= 0 && layers === 0;
