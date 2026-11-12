// ログアウト・退会のとき、会員のデータを端末から消す。端末の設定は消さない。サーバーのデータは触らない
import { beforeEach, describe, expect, it } from 'vitest';
import { collectLocalData, DEVICE_COUPON_KEY, DEVICE_OWNER_KEY, MYSTERY_KEYS, readLocalMystery, writeDeviceOwner, writeLocalMystery } from '../src/utils/cloudAccount';
import { progressKey } from '../src/utils/eventTare';
import { clearMemberDataFromDevice } from '../src/utils/memberData';

const A = { email: 'aya@example.test', memberId: 'NZ-10001' };
const B = { email: 'ben@example.test', memberId: 'NZ-10002' };
const prefix = (email: string) => `kanzaki_npoint_${email.replace(/[^a-z0-9_.-]/g, '_')}`;

// 端末の設定など(消さない)
const SETTINGS: Record<string, string> = {
  nizaki_push_enabled: '1',
  nizaki_delay_notify_mode: 'mine',
  nizaki_delay_notify_lines: '["saichi"]',
  nizaki_delay_notified: '{"x":1}',
  nizaki_reservation_notified: '{"orderId":"EQ-1","keys":[]}',
  kanzaki_my_stations: '[{"id":"s1"}]',
  nizaki_route_options: '{}',
  nizaki_route_query: '{}',
  nizaki_route_recent_stations: '["東京"]',
  nizaki_v2_tour_seen: '1',
  nizaki_device_id: 'dev-0001',
  nizaki_no_count: '1',
  nizaki_system_logs: '[]',
  nizaki_admin_token: 'admin-token-test',
  nizaki_preview: '1',
  kanzaki_current_selected_event: 'tare',
};

// 会員 m の、端末に残るデータを一式つくる(値は、テスト用の架空のもの)
const seedMember = (m: { email: string; memberId: string }) => {
  const p = prefix(m.email);
  localStorage.setItem(`nizaki_cloud_cache_${m.memberId}`, JSON.stringify({ balance: 999, history: [{ title: 'テスト' }], orders: [{ orderId: 'EQ-1' }], rides: [] }));
  localStorage.setItem(`${p}_balance`, '777');
  localStorage.setItem(`${p}_history`, '[{"title":"テスト"}]');
  localStorage.setItem(`${p}_order_history`, '[{"orderId":"EQ-1"}]');
  localStorage.setItem(`${p}_event_rewards`, '["神埼奇譚 第1幕解明報奨"]');
  localStorage.setItem(`${p}_redeemed_codes`, '["GIVE300"]');
  localStorage.setItem(`${p}_used_delivery_coupons`, '["DISH20"]');
  localStorage.setItem(`${p}_active_order`, '{"orderId":"EQ-2"}');
  localStorage.setItem(progressKey(m.email), '{"joined":true,"cleared":false,"joinedAt":1,"resetAt":0}');
};

const seedDevice = (ownerId: string | null) => {
  localStorage.setItem('nizaki_ticket', '{"orderId":"EQ-2","token":"tok"}');
  localStorage.setItem(MYSTERY_KEYS.stage, '3');
  localStorage.setItem(MYSTERY_KEYS.stamps, '[{"stageNumber":1}]');
  localStorage.setItem(MYSTERY_KEYS.cleared, 'true');
  localStorage.setItem(DEVICE_COUPON_KEY, '["AYAMI300"]');
  if (ownerId) localStorage.setItem(DEVICE_OWNER_KEY, ownerId);
};

const has = (k: string) => localStorage.getItem(k) !== null;
const keys = () => Object.keys(Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => [localStorage.key(i), 1])));

beforeEach(() => {
  localStorage.clear();
  Object.entries(SETTINGS).forEach(([k, v]) => localStorage.setItem(k, v));
});

describe('ログアウト(サーバーに同期ずみ)', () => {
  const out = () => clearMemberDataFromDevice({ ...A, synced: true, accountDeleted: false });

  it('クラウド同期の控え・QRの控え・会員を写した保存先・端末内のポイントなどを、消す', () => {
    seedMember(A);
    seedDevice(A.memberId);
    out();
    ['nizaki_cloud_cache_NZ-10001', 'nizaki_ticket', MYSTERY_KEYS.stage, MYSTERY_KEYS.stamps, MYSTERY_KEYS.cleared, DEVICE_COUPON_KEY, DEVICE_OWNER_KEY].forEach((k) => expect(has(k), k).toBe(false));
    ['_balance', '_history', '_order_history', '_event_rewards', '_redeemed_codes', '_used_delivery_coupons'].forEach((s) => expect(has(prefix(A.email) + s), s).toBe(false));
  });

  it('端末の設定は、残す(通知・マイ駅・経路検索・最近見た駅・お知らせ・端末の識別番号・ログなど)', () => {
    seedMember(A);
    seedDevice(A.memberId);
    out();
    Object.entries(SETTINGS).forEach(([k, v]) => expect(localStorage.getItem(k), k).toBe(v));
  });

  it('ログアウトでは、いまの予約の控えと、イベントの進みは、残す(戻す道が無い・サーバーの印で戻る)', () => {
    seedMember(A);
    out();
    expect(has(`${prefix(A.email)}_active_order`)).toBe(true);
    expect(has(progressKey(A.email))).toBe(true);
  });

  it('ほかの会員の控えも、この端末に残っていれば、消す(共用の端末)。ほかの会員の端末内のポイントなどは、消さない', () => {
    seedMember(A);
    seedMember(B);
    out();
    expect(has('nizaki_cloud_cache_NZ-10002')).toBe(false);
    expect(has(`${prefix(B.email)}_balance`)).toBe(true);
  });

  it('持ち主の印が無い保存先(ログインしていない人のデータ)は、消さない', () => {
    seedDevice(null);
    out();
    expect(localStorage.getItem(MYSTERY_KEYS.stage)).toBe('3');
    expect(localStorage.getItem(DEVICE_COUPON_KEY)).toBe('["AYAMI300"]');
    expect(has('nizaki_ticket')).toBe(false); // QRの控えは、会員のもの
  });

  it('保存してあるものが何も無くても、例外にならない。2回呼んでも同じ', () => {
    expect(out()).toEqual([]);
    seedMember(A);
    out();
    expect(out()).toEqual([]);
  });
});

describe('ログアウト(同期の前・公開前。サーバーに同期ずみでない)', () => {
  it('端末内のポイントなどは、消さない(引き継ぐ前に失わない)。控えと会員を写した保存先は、消す', () => {
    seedMember(A);
    seedDevice(A.memberId);
    clearMemberDataFromDevice({ ...A, synced: false, accountDeleted: false });
    ['_balance', '_history', '_order_history', '_event_rewards', '_redeemed_codes', '_used_delivery_coupons'].forEach((s) => expect(has(prefix(A.email) + s), s).toBe(true));
    expect(has('nizaki_cloud_cache_NZ-10001')).toBe(false);
    expect(has(DEVICE_OWNER_KEY)).toBe(false);
  });
});

describe('退会', () => {
  it('端末内のポイントなど・いまの予約の控え・イベントの進みも、消す。ほかの会員と、端末の設定は、残す', () => {
    seedMember(A);
    seedMember(B);
    seedDevice(A.memberId);
    clearMemberDataFromDevice({ ...A, synced: false, accountDeleted: true });
    const p = prefix(A.email);
    ['_balance', '_history', '_order_history', '_event_rewards', '_redeemed_codes', '_used_delivery_coupons', '_active_order'].forEach((s) => expect(has(p + s), s).toBe(false));
    expect(has(progressKey(A.email))).toBe(false);
    expect(has(`${prefix(B.email)}_active_order`)).toBe(true);
    expect(has(progressKey(B.email))).toBe(true);
    Object.entries(SETTINGS).forEach(([k, v]) => expect(localStorage.getItem(k), k).toBe(v));
  });
});

describe('別の会員のログイン・もう一度のログイン', () => {
  it('同じ端末で、別の会員が入ったとき、前の会員のミステリー・クーポンの控えが、見えない・送られない', () => {
    seedMember(A);
    seedDevice(A.memberId);
    clearMemberDataFromDevice({ ...A, synced: true, accountDeleted: false });
    expect(readLocalMystery()).toBeNull();
    const data = collectLocalData(B.email, B.memberId);
    expect(data.mystery).toBeNull();
    expect(data.usedCoupons).toEqual([]);
    expect(data.balance).toBeUndefined();
    expect(data.redeemedCodes).toEqual([]);
  });

  it('もう一度ログインすると、サーバーの内容が、端末に戻る(消したのは、端末の控えだけ)', () => {
    seedDevice(A.memberId);
    clearMemberDataFromDevice({ ...A, synced: true, accountDeleted: false });
    expect(readLocalMystery()).toBeNull();
    // 同期(サーバーの内容を、端末に写す)
    writeLocalMystery({ stage: 3, stamps: [{ stageNumber: 1, stationId: 's', stationName: '東京', stampedAt: 'x' }], cleared: true });
    writeDeviceOwner(A.memberId);
    expect(readLocalMystery()).toMatchObject({ stage: 3, cleared: true });
    expect(localStorage.getItem(DEVICE_OWNER_KEY)).toBe(A.memberId);
  });

  it('消す処理は、サーバーに通信しない', () => {
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as typeof fetch;
    try {
      seedMember(A);
      clearMemberDataFromDevice({ ...A, synced: true, accountDeleted: true });
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toBe(0);
  });

  it('消したあと、会員に紐づくキーは、残っていない(控え・ミステリー・クーポン・持ち主)', () => {
    seedMember(A);
    seedDevice(A.memberId);
    clearMemberDataFromDevice({ ...A, synced: true, accountDeleted: true });
    const left = keys().filter((k) => /cloud_cache|npoint_|nizaki_ticket|mystery_|used_coupons|device_owner|nizaki_event_/.test(k));
    expect(left).toEqual([]);
  });
});
