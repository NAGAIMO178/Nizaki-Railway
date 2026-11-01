// 下のタブをもう一度タップしたとき・ヘッダーの「神埼線アプリ」のタップ(画面は動かさず、部品が返す要素の onClick を呼ぶ)
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FooterNav } from '../src/components/FooterNav';
import { Header } from '../src/components/Header';

type El = React.ReactElement<{ children?: React.ReactNode; onClick?: () => void }>;
const walk = (node: React.ReactNode, out: El[] = []): El[] => {
  React.Children.forEach(node, (c) => {
    if (React.isValidElement(c)) {
      out.push(c as El);
      walk((c.props as { children?: React.ReactNode }).children, out);
    }
  });
  return out;
};
const textOf = (node: React.ReactNode): string => {
  let t = '';
  React.Children.forEach(node, (c) => {
    if (typeof c === 'string') t += c;
    else if (React.isValidElement(c)) t += textOf((c.props as { children?: React.ReactNode }).children);
  });
  return t;
};
const footerButton = (tree: React.ReactNode, label: string) => walk(tree).find((e) => e.type === 'button' && textOf(e.props.children).includes(label))!;

describe('下のタブをもう一度タップ', () => {
  const render = (activeTab: 'home' | 'location' | 'timetable' | 'reservation' | 'events') => {
    const onChangeTab = vi.fn();
    const onReselect = vi.fn();
    const tree = FooterNav({ activeTab, onChangeTab, onReselect });
    return { tree, onChangeTab, onReselect };
  };

  it('いま開いているタブをタップしたら onReselect(そのタブ)。タブは切り替えない', () => {
    for (const [tab, label] of [['reservation', '予約'], ['location', '列車位置'], ['timetable', '時刻表']] as const) {
      const { tree, onChangeTab, onReselect } = render(tab);
      footerButton(tree, label).props.onClick!();
      expect(onReselect, tab).toHaveBeenCalledWith(tab);
      expect(onChangeTab, tab).not.toHaveBeenCalled();
    }
  });

  it('ほかのタブをタップしたら、これまでどおり、そのタブへ切り替える(onReselect は呼ばない)', () => {
    const { tree, onChangeTab, onReselect } = render('home');
    footerButton(tree, '予約').props.onClick!();
    footerButton(tree, '時刻表').props.onClick!();
    expect(onChangeTab.mock.calls).toEqual([['reservation'], ['timetable']]);
    expect(onReselect).not.toHaveBeenCalled();
  });

  it('onReselect が渡されなくても、開いているタブのタップで、壊れない', () => {
    const onChangeTab = vi.fn();
    const tree = FooterNav({ activeTab: 'location', onChangeTab });
    expect(() => footerButton(tree, '列車位置').props.onClick!()).not.toThrow();
  });
});

describe('ヘッダーの「神埼線アプリ」', () => {
  it('文字をタップしたら、onGoHome', () => {
    const onGoHome = vi.fn();
    const tree = Header({ onGoHome });
    const h1 = walk(tree).find((e) => e.type === 'h1')!;
    const btn = walk(h1.props.children).find((e) => e.type === 'button')!;
    expect(textOf(btn.props.children).trim()).toBe('神埼線アプリ');
    btn.props.onClick!();
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });
});
