import { describe, it, expect } from 'vitest';
import { routeCardMark, ROUTE_CARD_MARK_TEXT } from '../src/utils/routeCardMark';

describe('候補カードの赤い印', () => {
  it('遅れで乗換に間に合わないときは「乗換が困難」(遅れがあっても、この1つだけ)', () => {
    expect(routeCardMark({ delayed: true, connections: [{ level: 'ok' }, { level: 'fail' }] })).toBe('hard');
    expect(routeCardMark({ delayed: false, connections: [{ level: 'fail' }] })).toBe('hard');
  });

  it('遅れがあるだけなら「遅れあり」', () => {
    expect(routeCardMark({ delayed: true, connections: [{ level: 'ok' }] })).toBe('delayed');
  });

  it('余裕が少ない乗換は、印にしない。何も無ければ、印なし', () => {
    expect(routeCardMark({ delayed: false, connections: [{ level: 'tight' }] })).toBeNull();
    expect(routeCardMark({ delayed: false, connections: [] })).toBeNull();
  });

  it('言葉', () => {
    expect(ROUTE_CARD_MARK_TEXT.hard).toBe('このルートは乗換が困難です');
    expect(ROUTE_CARD_MARK_TEXT.delayed).toBe('遅れあり');
  });
});
