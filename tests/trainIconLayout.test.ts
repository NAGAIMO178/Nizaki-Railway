import { describe, expect, it } from 'vitest';
import { BUNDLE_MIN_TRAINS, isBundle, trainIconCenter } from '../src/utils/trainIconLayout';
import { BUNDLE_MAX_BACK, BUNDLE_STEP, bundleBackLayers, bundleHeight, PIN_WIDTH, pinHeight } from '../src/components/TrainPin';

describe('列車位置の列車の並べ方', () => {
  it('1本・2本は、いまのまま(1本は -62、2本は 左 -98 / 右 -56。最優等が左)', () => {
    expect(trainIconCenter(1, 0)).toBe(-62);
    expect([0, 1].map((i) => trainIconCenter(2, i))).toEqual([-98, -56]);
  });

  it('札(幅38px)は、線路・駅の丸(-36px)を跨がず、画面の左端(-112px)で切れない', () => {
    for (const total of [1, 2]) {
      for (let i = 0; i < total; i++) {
        const c = trainIconCenter(total, i);
        expect(c + PIN_WIDTH / 2).toBeLessThanOrEqual(-36);
        expect(c).toBeGreaterThanOrEqual(-112);
      }
    }
  });

  it('3本以上だけ、束ねる(小さくして並べない)。束ねた札は、1本のときと同じ位置', () => {
    expect(BUNDLE_MIN_TRAINS).toBe(3);
    expect([1, 2, 3, 4, 6].map(isBundle)).toEqual([false, false, true, true, true]);
    for (const total of [3, 4, 6, 9]) expect(trainIconCenter(total, 0)).toBe(-62);
  });

  it('後ろにずらす札の枚数は、本数−1。最大5枚', () => {
    expect([1, 2, 3, 4, 6, 7, 20].map(bundleBackLayers)).toEqual([0, 1, 2, 3, 5, 5, 5]);
    expect(BUNDLE_MAX_BACK).toBe(5);
  });

  it('束ねた札が左へはみ出しても、画面の左端で切れない(最大の枚数でも)', () => {
    const left = trainIconCenter(9, 0) - PIN_WIDTH / 2 - BUNDLE_STEP * BUNDLE_MAX_BACK;
    expect(left).toBeGreaterThanOrEqual(-138); // 札の左端が、画面の左端(行の左から -138px。375px 幅)より右
  });

  it('束ねた札の高さは、先頭の札の高さ + ずらしで下へはみ出すぶん(両側)。札が切れず、重ならない高さの計算に使う', () => {
    const head = { delayed: false, passing: false };
    expect(bundleHeight(head, 3)).toBe(pinHeight(head) + 2 * BUNDLE_STEP * 2);
    expect(bundleHeight(head, 6)).toBe(pinHeight(head) + 2 * BUNDLE_STEP * 5);
    expect(bundleHeight({ delayed: true, passing: true }, 4)).toBeGreaterThan(bundleHeight(head, 4));
  });
});
