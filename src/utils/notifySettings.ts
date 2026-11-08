// 端末の通知(プッシュ通知)を送るかの設定。設定の「運行遅延・お知らせ リアルタイム通知」のスイッチと、
// マイページの「運行情報・デリバリーお届け通知」のスイッチは、同じ設定を見る(初期設定は、オン)。この端末に保存する。
//  - オフのとき: 遅れの見張り・予約の見張り・列車位置の遅れ通知は、端末の通知を出さない(アプリの画面の中の帯は、これまでどおり)。
//  - 通知のテストと、許可を求める操作は、この設定に関係なく、動く。
import { useEffect, useState } from 'react';
import { safeStorage } from './safeStorage';

const KEY = 'nizaki_push_enabled';
const EVENT = 'nizaki-push-enabled';

export const parsePushEnabled = (v: string | null): boolean => v !== '0';

export const isPushEnabled = (): boolean => parsePushEnabled(safeStorage.getItem(KEY));

export const setPushEnabled = (on: boolean): void => {
  safeStorage.setItem(KEY, on ? '1' : '0');
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: on }));
};

// 設定の画面・マイページ・見張りが、同じ値を見るための部品
export const usePushEnabled = (): [boolean, (on: boolean) => void] => {
  const [on, setOn] = useState<boolean>(isPushEnabled);
  useEffect(() => {
    const onChange = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return [on, setPushEnabled];
};
