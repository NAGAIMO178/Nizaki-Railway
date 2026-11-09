// 下に引っ張って再読み込み: 判定の決まり
import { describe, expect, it } from 'vitest';
import { ancestorBlocksPull, canStartPull, isPullIntent, pullDistance, pullProgress, PULL_START_PX, PULL_TRIGGER_PX, shouldReload, type AncestorInfo } from '../src/utils/pullRefresh';

const plain: AncestorInfo = { tag: 'DIV', overflowY: 'visible', scrollHeight: 100, clientHeight: 100, touchAction: 'auto', editable: false, noPull: false };
const ok = { scrollTop: 0, layers: 0, blocked: false, touches: 1 };

describe('引きを始めてよいとき', () => {
  it('ページのいちばん上で、モーダル・シートがなく、指1本、内側の場所の外から', () => {
    expect(canStartPull(ok)).toBe(true);
    expect(canStartPull({ ...ok, scrollTop: -20 })).toBe(true); // iOS のゴムで、少し下がっているとき
  });

  it('スクロール位置が0でない・モーダルやシートが開いている・内側の場所・指が2本以上は、始めない', () => {
    expect(canStartPull({ ...ok, scrollTop: 1 })).toBe(false);
    expect(canStartPull({ ...ok, layers: 1 })).toBe(false);
    expect(canStartPull({ ...ok, blocked: true })).toBe(false);
    expect(canStartPull({ ...ok, touches: 2 })).toBe(false);
  });
});

describe('始めさせない場所', () => {
  it('ふつうの場所は、引ける', () => {
    expect(ancestorBlocksPull(plain)).toBe(false);
    // スクロールできる設定でも、中身が枠に収まっていれば、スクロールしないので、引ける
    expect(ancestorBlocksPull({ ...plain, overflowY: 'auto', scrollHeight: 100, clientHeight: 100 })).toBe(false);
  });

  it('内側にスクロールする場所(中身が枠より長い)は、始めない', () => {
    expect(ancestorBlocksPull({ ...plain, overflowY: 'auto', scrollHeight: 400, clientHeight: 100 })).toBe(true);
    expect(ancestorBlocksPull({ ...plain, overflowY: 'scroll', scrollHeight: 400, clientHeight: 100 })).toBe(true);
  });

  it('文字の入力欄・指で動かす場所(touch-action)・data-no-pull は、始めない', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(ancestorBlocksPull({ ...plain, tag })).toBe(true);
    expect(ancestorBlocksPull({ ...plain, editable: true })).toBe(true);
    expect(ancestorBlocksPull({ ...plain, touchAction: 'none' })).toBe(true);
    expect(ancestorBlocksPull({ ...plain, noPull: true })).toBe(true);
  });
});

describe('引き始めの見分け', () => {
  it('下にほぼまっすぐ動いたら、引き。少しだけ・横・上は、引きではない', () => {
    expect(isPullIntent(0, PULL_START_PX)).toBe(true);
    expect(isPullIntent(5, 30)).toBe(true);
    expect(isPullIntent(0, PULL_START_PX - 1)).toBe(false);
    expect(isPullIntent(40, 30)).toBe(false);
    expect(isPullIntent(0, -30)).toBe(false);
  });
});

describe('距離と、再読み込みの決まり', () => {
  it('引く距離は、下だけ数える', () => {
    expect(pullDistance(100, 250)).toBe(150);
    expect(pullDistance(100, 60)).toBe(0);
  });

  it('目印の進みは0〜1。引く距離の目安は、80〜100px', () => {
    expect(PULL_TRIGGER_PX).toBeGreaterThanOrEqual(80);
    expect(PULL_TRIGGER_PX).toBeLessThanOrEqual(100);
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PULL_TRIGGER_PX / 2)).toBeCloseTo(0.5);
    expect(pullProgress(PULL_TRIGGER_PX * 3)).toBe(1);
  });

  it('離したとき、距離が足りていて、まだいちばん上で、モーダルがなければ、再読み込み', () => {
    expect(shouldReload(PULL_TRIGGER_PX, 0, 0)).toBe(true);
    expect(shouldReload(PULL_TRIGGER_PX - 1, 0, 0)).toBe(false);
    expect(shouldReload(PULL_TRIGGER_PX + 50, 5, 0)).toBe(false);
    expect(shouldReload(PULL_TRIGGER_PX + 50, 0, 1)).toBe(false);
  });
});
