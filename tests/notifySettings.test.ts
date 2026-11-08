// 通知のスイッチ(設定・マイページ): 保存される・初期はオン・見張りが、オフのとき端末の通知を出さない
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { isPushEnabled, parsePushEnabled, setPushEnabled } from '../src/utils/notifySettings';

const g = globalThis as unknown as { window: Record<string, unknown>; CustomEvent: unknown };
const src = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', 'src', ...p), 'utf-8');

beforeEach(() => {
  g.window.dispatchEvent = () => true;
  g.CustomEvent = class {
    constructor(public type: string, public init?: unknown) {}
  };
  localStorage.clear();
});

describe('通知のスイッチの保存', () => {
  it('初めはオン。切ると保存され、入れ直すと、またオン', () => {
    expect(isPushEnabled()).toBe(true);
    setPushEnabled(false);
    expect(isPushEnabled()).toBe(false);
    expect(localStorage.getItem('nizaki_push_enabled')).toBe('0');
    setPushEnabled(true);
    expect(isPushEnabled()).toBe(true);
  });

  it('読めない・古い値は、オン(通知を止めない)', () => {
    expect(parsePushEnabled(null)).toBe(true);
    expect(parsePushEnabled('1')).toBe(true);
    expect(parsePushEnabled('なにか')).toBe(true);
    expect(parsePushEnabled('0')).toBe(false);
  });
});

describe('スイッチが、見張りに効く', () => {
  it('遅れの見張り・予約の見張り・列車位置の遅れ通知は、端末の通知の前に、設定を見る', () => {
    expect(src('utils', 'useDelayWatcher.ts')).toMatch(/isPushEnabled\(\) && getNotificationPermissionState\(\) === 'granted'/);
    expect(src('utils', 'useReservationWatcher.ts')).toMatch(/isPushEnabled\(\) && getNotificationPermissionState\(\) === 'granted'/);
    expect(src('components', 'TrainLocationTab.tsx')).toMatch(/if \(isPushEnabled\(\)\) \{\s*sendLocalPushNotification/);
  });

  it('設定とマイページのスイッチは、同じ設定を使い(state だけではない)、設定側のチェックボックスにラベルがある', () => {
    expect(src('components', 'SettingsTab.tsx')).toContain('usePushEnabled()');
    expect(src('components', 'SettingsTab.tsx')).toContain('aria-label="運行遅延・お知らせリアルタイム通知"');
    expect(src('components', 'MyPageModal.tsx')).toContain('usePushEnabled()');
    expect(src('components', 'MyPageModal.tsx')).not.toContain('useState(true);\n  const [showDeleteConfirm');
  });
});
