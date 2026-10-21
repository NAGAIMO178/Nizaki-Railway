// 遅れの知らせの決まり(同じ内容は1本にまとめる・遅れ分数が変われば知らせ直す・路線のクールダウン・起動直後のまとめ)を調べる。
import { describe, expect, it } from 'vitest';
import {
  CONTENT_WINDOW_MS,
  LINE_COOLDOWN_MS,
  markNotified,
  NotifiedState,
  NotifyCandidate,
  planNotification,
} from '../src/utils/delayNotifyPlan';

const DAY = '2026-11-2';
const cand = (id: string, over: Partial<NotifyCandidate> & { delay?: number } = {}): NotifyCandidate => {
  const delay = over.delay ?? 4;
  const lineId = over.lineId ?? 'saichi_loop';
  return {
    key: `${DAY}|${id}|${delay}`,
    contentKey: `${lineId}|各停|柏|${delay}`,
    lineId,
    lineName: lineId === 'saichi_loop' ? '埼千環状線' : '神埼線',
    text: `埼千環状線 各停（柏行）で約 ${delay} 分の遅れが発生しています。`,
    ...over,
  };
};
const empty = (): NotifiedState => ({ keys: new Set(), contents: new Map() });
const NOW = 1_000_000_000_000;

describe('遅れの知らせの決まり', () => {
  it('同じ文面の列車が3本あっても、知らせは1本で、3本とも知らせたことにする', () => {
    const state = empty();
    const candidates = [cand('A'), cand('B'), cand('C')];
    const plan = planNotification({ candidates, state, lastByLine: {}, nowMs: NOW, firstScan: false });
    expect(plan.kind).toBe('single');
    if (plan.kind !== 'single') return;
    expect(plan.group).toHaveLength(3);
    markNotified(state, plan.group, NOW);
    // 次の確認では、何も知らせない(クールダウンが過ぎていても)
    const again = planNotification({ candidates, state, lastByLine: {}, nowMs: NOW + LINE_COOLDOWN_MS + 1, firstScan: false });
    expect(again.kind).toBe('none');
  });

  it('同じ列車を2回渡しても、1本', () => {
    const plan = planNotification({ candidates: [cand('A'), cand('A')], state: empty(), lastByLine: {}, nowMs: NOW, firstScan: false });
    expect(plan.kind === 'single' && plan.group.length).toBe(1);
  });

  it('同じ内容は、一定の時間がたてば、また知らせる', () => {
    const state = empty();
    markNotified(state, [cand('A')], NOW);
    const later = NOW + CONTENT_WINDOW_MS;
    const plan = planNotification({ candidates: [cand('B')], state, lastByLine: {}, nowMs: later, firstScan: false });
    expect(plan.kind).toBe('single');
    const soon = planNotification({ candidates: [cand('B')], state, lastByLine: {}, nowMs: NOW + CONTENT_WINDOW_MS - 1, firstScan: false });
    expect(soon.kind).toBe('none');
  });

  it('遅れの分数が変わったら、同じ列車でも、知らせ直す', () => {
    const state = empty();
    markNotified(state, [cand('A', { delay: 4 })], NOW);
    const plan = planNotification({ candidates: [cand('A', { delay: 7 })], state, lastByLine: {}, nowMs: NOW + LINE_COOLDOWN_MS, firstScan: false });
    expect(plan.kind === 'single' && plan.train.text).toContain('7 分');
  });

  it('文面が違う列車は、別々に知らせる(路線のクールダウンをはさむ)', () => {
    const state = empty();
    const a = cand('A', { delay: 4 });
    const b = cand('B', { delay: 5 });
    const first = planNotification({ candidates: [a, b], state, lastByLine: {}, nowMs: NOW, firstScan: false });
    expect(first.kind === 'single' && first.train.key).toBe(a.key);
    markNotified(state, first.kind === 'single' ? first.group : [], NOW);
    const during = planNotification({ candidates: [a, b], state, lastByLine: { saichi_loop: NOW }, nowMs: NOW + 1000, firstScan: false });
    expect(during.kind).toBe('none');
    const after = planNotification({ candidates: [a, b], state, lastByLine: { saichi_loop: NOW }, nowMs: NOW + LINE_COOLDOWN_MS, firstScan: false });
    expect(after.kind === 'single' && after.train.key).toBe(b.key);
  });

  it('クールダウン中の路線は飛ばして、ほかの路線を先に知らせる', () => {
    const plan = planNotification({
      candidates: [cand('A'), cand('K', { lineId: 'kanzaki' })],
      state: empty(),
      lastByLine: { saichi_loop: NOW },
      nowMs: NOW + 1000,
      firstScan: false,
    });
    expect(plan.kind === 'single' && plan.train.lineId).toBe('kanzaki');
  });

  it('起動直後に、遅れている列車が2本以上なら、まとめて1回。1本なら、ふつうに1本', () => {
    const many = planNotification({ candidates: [cand('A'), cand('B', { delay: 5 })], state: empty(), lastByLine: {}, nowMs: NOW, firstScan: true });
    expect(many.kind === 'summary' && many.trains.length).toBe(2);
    const one = planNotification({ candidates: [cand('A')], state: empty(), lastByLine: {}, nowMs: NOW, firstScan: true });
    expect(one.kind).toBe('single');
    // 起動直後でなければ、まとめない
    const notFirst = planNotification({ candidates: [cand('A'), cand('B', { delay: 5 })], state: empty(), lastByLine: {}, nowMs: NOW, firstScan: false });
    expect(notFirst.kind).toBe('single');
  });

  it('知らせ済みの列車は、起動直後でも、含めない', () => {
    const state = empty();
    markNotified(state, [cand('A')], NOW);
    const plan = planNotification({ candidates: [cand('A'), cand('B', { delay: 5 })], state, lastByLine: {}, nowMs: NOW, firstScan: true });
    expect(plan.kind === 'single' && plan.train.key).toBe(cand('B', { delay: 5 }).key);
  });

  it('列車の記録だけある(内容の記録が無い古い保存)の列車も、知らせ済みとして扱う', () => {
    const state = empty();
    state.keys.add(cand('A').key);
    const plan = planNotification({ candidates: [cand('A')], state, lastByLine: {}, nowMs: NOW, firstScan: false });
    expect(plan.kind).toBe('none');
  });

  it('遅れている列車が無ければ、何もしない', () => {
    expect(planNotification({ candidates: [], state: empty(), lastByLine: {}, nowMs: NOW, firstScan: true }).kind).toBe('none');
  });
});
