// 高宮線(TK)の公開前の準備: 路線の色(オレンジ)と、マイ駅・遅れ設定・遅れの見張り・運行状況の路線の一覧。
// 見せないあいだ(既定)は、既存4路線のまま。スイッチを入れた状態(作りもの)では、高宮線が加わる。
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { TK_LINE_COLOR, TK_STATION_NAMES } from '../src/utils/tkLine';

const hex2lab = (h: string): [number, number, number] => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const X = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047;
  const Y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  const Z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a: string, b: string): number => Math.hypot(...hex2lab(a).map((v, i) => v - hex2lab(b)[i]) as [number, number, number]);

describe('路線の色(オレンジ)', () => {
  it('オレンジ(orange-600)。既存の路線色(神埼線・高速線・環状線・土浦線)と、はっきり違う', () => {
    expect(TK_LINE_COLOR).toBe('#EA580C');
    for (const c of ['#8B5CF6', '#3B82F6', '#EC4899', '#10B981', '#3CB371']) expect(dE(TK_LINE_COLOR, c), c).toBeGreaterThan(60);
  });

  it('種別の色(特別快速=黄・急行=赤・区間快速=緑・快速=青・特急=紫・各停=灰)とも、紛らわしくない(黄・赤との差が最小。orange-500 だと黄に近すぎる)', () => {
    for (const c of ['#F59E0B', '#E11D48', '#059669', '#0284C7', '#6D28D9', '#64748B']) expect(dE(TK_LINE_COLOR, c), c).toBeGreaterThan(30);
    expect(dE('#F97316', '#F59E0B')).toBeLessThan(dE(TK_LINE_COLOR, '#F59E0B'));
  });

  it('高宮線の駅は13(大宮〜高根沢)で、ダイヤの路線一覧と同じ並び', () => {
    const m = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'dia-2', 'master-tk.json'), 'utf-8'));
    expect(TK_STATION_NAMES).toEqual(m.TK.stations.map((s: [string, number]) => s[0]));
  });
});

describe('見せないとき(既定): 一覧は、既存4路線のまま', () => {
  // 「見せない」状態に固定する(公開の日時や時計に、左右されないように)
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../src/utils/tkLine', async () => {
      const actual = await vi.importActual<typeof import('../src/utils/tkLine')>('../src/utils/tkLine');
      return { ...actual, isTkLaunched: () => false, withTk: <T,>(b: T[]) => b };
    });
  });
  afterEach(() => {
    vi.doUnmock('../src/utils/tkLine');
    vi.resetModules();
  });
  it('マイ駅の登録・遅れの通知の設定・管理画面の路線・運行状況の路線に、高宮線がない', async () => {
    const { REGISTERABLE_LINES } = await import('../src/components/MyStationRegisterCard');
    const { DELAY_NOTIFY_LINES } = await import('../src/utils/delayNotifySettings');
    const { DEFAULT_LINE_INFOS } = await import('../src/utils/disruptionManager');
    const { MOCK_LINES } = await import('../src/data/mockData');
    expect(REGISTERABLE_LINES.map((l) => l.code)).toEqual(['Y', 'NI', 'SC', 'TC']);
    expect(DELAY_NOTIFY_LINES.map((l) => l.id)).toEqual(['kanzaki', 'kanzaki_kosoku', 'saichi_loop', 'tsuchiura']);
    expect(DEFAULT_LINE_INFOS.map((l) => l.code)).toEqual(['Y', 'NI', 'SC', 'TC']);
    expect(MOCK_LINES.map((l) => l.code)).toEqual(['Y', 'NI', 'SC', 'TC']);
  });

  it('遅れの見張りの路線も、4路線(ソースの見張り)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', 'useDelayWatcher.ts'), 'utf-8');
    expect(src).toContain('withTk(');
    expect(src).toMatch(/\{ id: 'takamiya', code: 'TK', name: '高宮線' \}/);
  });
});

describe('見せるとき(スイッチを入れた状態の作りもの): 高宮線が加わる', () => {
  afterEach(() => {
    vi.doUnmock('../src/utils/tkLine');
    vi.resetModules();
  });
  const visible = () => {
    vi.resetModules();
    vi.doMock('../src/utils/tkLine', async () => {
      const actual = await vi.importActual<typeof import('../src/utils/tkLine')>('../src/utils/tkLine');
      return { ...actual, isTkLaunched: () => true, withTk: <T,>(b: T[], t: T) => [...b, t] };
    });
  };

  it('マイ駅の登録: 高宮線(13駅・TK01〜TK13・オレンジ)。駅の名前は、ダイヤと同じ', async () => {
    visible();
    const { REGISTERABLE_LINES } = await import('../src/components/MyStationRegisterCard');
    const tk = REGISTERABLE_LINES[REGISTERABLE_LINES.length - 1];
    expect(tk.id).toBe('takamiya');
    expect(tk.code).toBe('TK');
    expect(tk.color).toBe(TK_LINE_COLOR);
    expect(tk.stations.map((s) => s.name)).toEqual(TK_STATION_NAMES);
    expect(tk.stations.map((s) => s.code)).toEqual(Array.from({ length: 13 }, (_, i) => `TK${String(i + 1).padStart(2, '0')}`));
  });

  it('遅れの通知の設定・管理画面の路線・運行状況: 高宮線(路線ID takamiya・コード TK・オレンジ)', async () => {
    visible();
    const { DELAY_NOTIFY_LINES } = await import('../src/utils/delayNotifySettings');
    const { DEFAULT_LINE_INFOS, getStationsForLine, getAffectedStationRange, COMMON_SECTIONS } = await import('../src/utils/disruptionManager');
    const { MOCK_LINES } = await import('../src/data/mockData');
    expect(DELAY_NOTIFY_LINES[DELAY_NOTIFY_LINES.length - 1]).toEqual({ id: 'takamiya', name: '高宮線', color: TK_LINE_COLOR });
    expect(DEFAULT_LINE_INFOS[DEFAULT_LINE_INFOS.length - 1]).toEqual({ id: 'takamiya', name: '高宮線', code: 'TK', color: TK_LINE_COLOR });
    expect(MOCK_LINES[MOCK_LINES.length - 1]).toMatchObject({ id: 'takamiya', code: 'TK', color: TK_LINE_COLOR });
    expect(getStationsForLine('takamiya')).toEqual(TK_STATION_NAMES);
    expect(COMMON_SECTIONS.takamiya[0]).toBe('全線');
    // 影響区間: 大宮〜宇都宮 → 駅の並びの 0〜10 番
    expect(getAffectedStationRange('takamiya', '大宮 〜 宇都宮 間')).toEqual([0, 10]);
  });
});
