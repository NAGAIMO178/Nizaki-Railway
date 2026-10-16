// 運行支障(遅延・運休)と運行予測の決まりを調べる。
// 区間の読み取り・遅れ分数の割り当て・自動解除・サーバーとの同期を、保存先とサーバー呼び出しを作りものにして動かす。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn() }));

import { callGas } from '../src/utils/accountApi';
import {
  disruptionManager,
  COMMON_REASON_CATEGORIES,
  COMMON_REASONS,
  COMMON_SECTIONS,
  FORECAST_PRESETS,
  generateDisruptionText,
  getAffectedStationRange,
  getDurationPresetsForReason,
  getExpiryOptions,
  getStationsForLine,
  isTrainInAffectedRange,
  isWeatherRelatedReason,
  type LineDisruption,
  type OperationForecast,
} from '../src/utils/disruptionManager';

const mockGas = vi.mocked(callGas);

const makeDisruption = (over: Partial<LineDisruption> = {}): LineDisruption => ({
  lineId: 'kanzaki',
  lineName: '神埼線',
  code: 'Y',
  statusType: 'delay',
  targetDirection: 'both',
  maxDelayMinutes: 10,
  durationUntil: '',
  section: '全線',
  reason: '車両点検のため',
  customMessage: '',
  useCustomMessage: false,
  linkToSystem: true,
  updatedAt: '',
  ...over,
});

const makeForecast = (over: Partial<Omit<OperationForecast, 'id' | 'createdAt'>> = {}) => ({
  lineId: 'kanzaki',
  lineName: '神埼線',
  category: 'gale' as const,
  categoryLabel: '強風',
  expectedPeriod: '本日夕方以降',
  section: '全線',
  headline: '強風の影響により遅れの可能性',
  description: '',
  severity: 'caution' as const,
  expiresAt: '',
  expiresAtTimestamp: Date.now() + 3600_000,
  isActive: true,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  mockGas.mockReset();
  mockGas.mockResolvedValue({ status: 'success' } as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('影響区間の読み取り', () => {
  it('全線・上り線のみ・駅名なしは「全線」(null)になる', () => {
    expect(getAffectedStationRange('kanzaki', '全線')).toBeNull();
    expect(getAffectedStationRange('kanzaki', '')).toBeNull();
    expect(getAffectedStationRange('kanzaki', '上り線のみ')).toBeNull();
    expect(getAffectedStationRange('kanzaki', '下り線のみ')).toBeNull();
    expect(getAffectedStationRange('kanzaki', '知らない駅〜謎の駅')).toBeNull();
  });

  it('2駅の間は、並びの添字の小さい方から大きい方になる(書いた順は関係ない)', () => {
    const stations = getStationsForLine('kanzaki');
    const a = stations.indexOf('大宮');
    const b = stations.indexOf('調布');
    expect(getAffectedStationRange('kanzaki', '大宮〜調布間')).toEqual([a, b]);
    expect(getAffectedStationRange('kanzaki', '調布〜大宮間')).toEqual([a, b]);
  });

  it('駅が1つだけなら、その駅だけ', () => {
    const i = getStationsForLine('kanzaki').indexOf('北千住');
    expect(getAffectedStationRange('kanzaki', '北千住駅構内')).toEqual([i, i]);
  });

  it('「大宮」と「大宮公園」のように名前が重なっても、長い方を先に拾う', () => {
    const stations = getStationsForLine('saichi');
    const park = stations.indexOf('大宮公園');
    const omiya = stations.indexOf('大宮');
    expect(getAffectedStationRange('saichi', '大宮公園〜大宮間')).toEqual([park, omiya]);
    // 「大宮公園」だけの文言を、大宮と取り違えない
    expect(getAffectedStationRange('saichi', '大宮公園付近')).toEqual([park, park]);
  });

  it('読み仮名つきの駅名でも、読み取れる', () => {
    const i = getStationsForLine('tsuchiura').indexOf('大甕（おおみか）');
    expect(getAffectedStationRange('tsuchiura', '大甕付近')).toEqual([i, i]);
  });

  it('路線の別名 saichi_loop は、埼千環状線として扱う', () => {
    expect(getStationsForLine('saichi_loop')).toEqual(getStationsForLine('saichi'));
  });
});

describe('列車が影響区間にいるか', () => {
  const lineId = 'kanzaki';
  const idx = (name: string) => getStationsForLine(lineId).indexOf(name);
  const range: [number, number] = [idx('北千住'), idx('大宮')];

  it('区間が無ければ、どこにいても対象', () => {
    expect(isTrainInAffectedRange(lineId, null, '横浜', false)).toBe(true);
  });

  it('停車中は、両端の駅も含めて対象', () => {
    expect(isTrainInAffectedRange(lineId, range, '北千住', false)).toBe(true);
    expect(isTrainInAffectedRange(lineId, range, '大宮', false)).toBe(true);
    expect(isTrainInAffectedRange(lineId, range, '東京', false)).toBe(false);
    expect(isTrainInAffectedRange(lineId, range, '朝霞台', false)).toBe(false);
  });

  it('駅間は、次の駅まで区間に収まるときだけ対象', () => {
    // 大宮の次の駅は区間の外なので、大宮から先に出た列車は対象外
    expect(isTrainInAffectedRange(lineId, range, '大宮', true)).toBe(false);
    expect(isTrainInAffectedRange(lineId, range, '蓮田', true)).toBe(true);
  });

  it('路線にない駅名は、対象外', () => {
    expect(isTrainInAffectedRange(lineId, range, '存在しない駅', false)).toBe(false);
  });
});

describe('遅れ・運休の割り当て', () => {
  it('支障が無い・平常・システム連動オフなら、遅れなし', () => {
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T1')).toEqual({ delayMinutes: 0, isSuspended: false });
    disruptionManager.setLineDisruption(makeDisruption({ statusType: 'normal' }));
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T1')).toEqual({ delayMinutes: 0, isSuspended: false });
    disruptionManager.setLineDisruption(makeDisruption({ linkToSystem: false }));
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T1')).toEqual({ delayMinutes: 0, isSuspended: false });
  });

  it('遅延は、列車ごとに 1〜最大分 の範囲で、同じ列車なら毎回同じ', () => {
    disruptionManager.setLineDisruption(makeDisruption({ maxDelayMinutes: 7 }));
    const seen = new Set<number>();
    for (let n = 0; n < 200; n++) {
      const r = disruptionManager.getEffectiveDelayForTrain('kanzaki', `train-${n}`);
      expect(r.isSuspended).toBe(false);
      expect(r.delayMinutes).toBeGreaterThanOrEqual(1);
      expect(r.delayMinutes).toBeLessThanOrEqual(7);
      expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', `train-${n}`)).toEqual(r);
      seen.add(r.delayMinutes);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('最大分が 0 でも、遅延なら 1 分になる', () => {
    disruptionManager.setLineDisruption(makeDisruption({ maxDelayMinutes: 0 }));
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T1')).toEqual({ delayMinutes: 1, isSuspended: false });
  });

  it('数のシードは、符号と小数を無視して決まる', () => {
    disruptionManager.setLineDisruption(makeDisruption({ maxDelayMinutes: 10 }));
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 13).delayMinutes).toBe(4);
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', -13.9).delayMinutes).toBe(4);
  });

  it('運転見合わせは、全部の列車が運休', () => {
    disruptionManager.setLineDisruption(makeDisruption({ statusType: 'suspended' }));
    for (let n = 0; n < 20; n++) {
      expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', n)).toEqual({ delayMinutes: 0, isSuspended: true });
    }
  });

  it('一部運休は、3本に1本ほどが運休で、残りは 1〜5 分(最大分を超えない)の遅れ', () => {
    disruptionManager.setLineDisruption(makeDisruption({ statusType: 'partially_suspended', maxDelayMinutes: 3 }));
    let suspended = 0;
    for (let n = 0; n < 300; n++) {
      const r = disruptionManager.getEffectiveDelayForTrain('kanzaki', n);
      if (r.isSuspended) {
        suspended++;
        expect(r.delayMinutes).toBe(0);
        expect(n % 3).toBe(0);
      } else {
        expect(r.delayMinutes).toBeGreaterThanOrEqual(1);
        expect(r.delayMinutes).toBeLessThanOrEqual(3);
      }
    }
    expect(suspended).toBe(100);
  });

  it('上り線のみの支障は、下り列車に影響しない(方向が分からないときは影響する)', () => {
    disruptionManager.setLineDisruption(makeDisruption({ statusType: 'suspended', targetDirection: 'up' }));
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 'up').isSuspended).toBe(true);
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 2).isSuspended).toBe(true);
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 'down').isSuspended).toBe(false);
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 1).isSuspended).toBe(false);
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T').isSuspended).toBe(true);
  });

  it('下り線のみの支障は、上り列車に影響しない', () => {
    disruptionManager.setLineDisruption(makeDisruption({ statusType: 'suspended', targetDirection: 'down' }));
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 1).isSuspended).toBe(true);
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 2).isSuspended).toBe(false);
  });

  it('区間の外にいる列車は、平常運転', () => {
    disruptionManager.setLineDisruption(makeDisruption({ statusType: 'suspended', section: '北千住〜大宮間' }));
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 'both', { stationName: '足立' }).isSuspended).toBe(true);
    expect(disruptionManager.getEffectiveDelayForTrain('kanzaki', 'T', 'both', { stationName: '横浜' }).isSuspended).toBe(false);
  });

  it('埼千環状線は、saichi と saichi_loop のどちらで引いても同じ', () => {
    disruptionManager.setLineDisruption(makeDisruption({ lineId: 'saichi', statusType: 'suspended' }));
    expect(disruptionManager.getEffectiveDelayForTrain('saichi_loop', 'T').isSuspended).toBe(true);
    disruptionManager.clearLineDisruption('saichi_loop');
    expect(disruptionManager.getLineDisruption('saichi')).toBeNull();
  });
});

describe('自動解除', () => {
  it('解除時刻を過ぎた支障は、読むときに無かったことになる', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:00:00+09:00'));
    const now = Date.now();
    disruptionManager.setLineDisruption(makeDisruption({ lineId: 'kanzaki', expiresAtTimestamp: now + 60_000 }));
    disruptionManager.setLineDisruption(makeDisruption({ lineId: 'tsuchiura', expiresAtTimestamp: undefined }));
    expect(Object.keys(disruptionManager.getAllDisruptions()).sort()).toEqual(['kanzaki', 'tsuchiura']);

    vi.setSystemTime(now + 60_000);
    expect(Object.keys(disruptionManager.getAllDisruptions())).toEqual(['tsuchiura']);
  });

  it('お掃除は、期限切れがあったときだけ true を返し、保存データから消す', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:00:00+09:00'));
    const now = Date.now();
    disruptionManager.setLineDisruption(makeDisruption({ expiresAtTimestamp: now + 1000 }));
    expect(disruptionManager.checkAndCleanupExpiredDisruptions()).toBe(false);
    vi.setSystemTime(now + 2000);
    expect(disruptionManager.checkAndCleanupExpiredDisruptions()).toBe(true);
    expect(JSON.parse(localStorage.getItem('nizaki_admin_disruptions')!)).toEqual({});
    expect(disruptionManager.checkAndCleanupExpiredDisruptions()).toBe(false);
  });

  it('壊れた保存データでも、落ちずに空として扱う', () => {
    localStorage.setItem('nizaki_admin_disruptions', '{こわれた');
    localStorage.setItem('nizaki_admin_operation_forecasts', '{こわれた');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(disruptionManager.getAllDisruptions()).toEqual({});
    expect(disruptionManager.getOperationForecasts()).toEqual([]);
    expect(disruptionManager.checkAndCleanupExpiredDisruptions()).toBe(false);
    expect(disruptionManager.checkAndCleanupExpiredForecasts()).toBe(false);
  });
});

describe('運行予測', () => {
  it('同じ路線・同じ種類の予告は上書きされ、別の種類は並ぶ', () => {
    disruptionManager.saveOperationForecast(makeForecast({ headline: '古い' }));
    disruptionManager.saveOperationForecast(makeForecast({ headline: '新しい' }));
    disruptionManager.saveOperationForecast(makeForecast({ category: 'snow' }));
    disruptionManager.saveOperationForecast(makeForecast({ lineId: 'saichi' }));
    const list = disruptionManager.getOperationForecasts();
    expect(list).toHaveLength(3);
    expect(list.filter((f) => f.lineId === 'kanzaki' && f.category === 'gale').map((f) => f.headline)).toEqual(['新しい']);
  });

  it('期限切れと無効なものは出さず、保存データからも消す', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:00:00+09:00'));
    const now = Date.now();
    disruptionManager.saveOperationForecast(makeForecast({ category: 'gale', expiresAtTimestamp: now + 1000 }));
    disruptionManager.saveOperationForecast(makeForecast({ category: 'snow', expiresAtTimestamp: now + 99_000 }));
    disruptionManager.saveOperationForecast(makeForecast({ category: 'thunder' }));
    // isActive は保存のときに true になるので、保存データを直接書き換えて「無効」にする
    const raw = JSON.parse(localStorage.getItem('nizaki_admin_operation_forecasts')!) as OperationForecast[];
    raw.find((f) => f.category === 'thunder')!.isActive = false;
    localStorage.setItem('nizaki_admin_operation_forecasts', JSON.stringify(raw));

    vi.setSystemTime(now + 2000);
    expect(disruptionManager.getOperationForecasts().map((f) => f.category)).toEqual(['snow']);
    expect(JSON.parse(localStorage.getItem('nizaki_admin_operation_forecasts')!)).toHaveLength(1);
  });

  it('見出しと種類の名前から、絵文字を取り除く', () => {
    disruptionManager.saveOperationForecast(makeForecast({ categoryLabel: '⚡雷', headline: '🌀台風接近のおそれ' }));
    const [f] = disruptionManager.getOperationForecasts();
    expect(f.categoryLabel).toBe('雷');
    expect(f.headline).toBe('台風接近のおそれ');
  });

  it('個別の解除と一括解除ができる', () => {
    const a = disruptionManager.saveOperationForecast(makeForecast({ category: 'gale' }));
    disruptionManager.saveOperationForecast(makeForecast({ category: 'snow' }));
    disruptionManager.removeOperationForecast(a.id);
    expect(disruptionManager.getOperationForecasts().map((f) => f.category)).toEqual(['snow']);
    disruptionManager.clearAllOperationForecasts();
    expect(disruptionManager.getOperationForecasts()).toEqual([]);
  });
});

describe('運行状態のまとめ', () => {
  it('支障が無ければ、4路線すべて平常運転', () => {
    const s = disruptionManager.getStatusSummary();
    expect(s.hasDelay).toBe(false);
    expect(s.lines.map((l) => l.id)).toEqual(['kanzaki', 'kanzaki_kosoku', 'saichi', 'tsuchiura']);
    expect(s.lines.every((l) => l.statusType === 'normal' && l.status === '平常運転')).toBe(true);
  });

  it('遅延・見合わせ・一部運休が、それぞれの言い方で出る', () => {
    disruptionManager.setLineDisruption(makeDisruption({ lineId: 'kanzaki', statusType: 'delay', maxDelayMinutes: 12 }));
    disruptionManager.setLineDisruption(makeDisruption({ lineId: 'tsuchiura', lineName: '土浦線', statusType: 'suspended', targetDirection: 'up' }));
    disruptionManager.setLineDisruption(makeDisruption({ lineId: 'kanzaki_kosoku', statusType: 'partially_suspended' }));
    const s = disruptionManager.getStatusSummary();
    const by = Object.fromEntries(s.lines.map((l) => [l.id, l]));
    expect(s.hasDelay).toBe(true);
    expect(by.kanzaki.status).toBe('遅延 (最大約12分)');
    expect(by.kanzaki.delayMinutes).toBe(12);
    expect(by.tsuchiura.status).toBe('運転見合わせ (上り線)');
    expect(by.kanzaki_kosoku.status).toBe('一部運休');
    expect(by.saichi.status).toBe('平常運転');
    expect(s.summary).toContain('神埼線(遅延)');
    expect(s.summary).toContain('土浦線(見合わせ (上り線))');
  });

  it('最大分が 0 の遅延は「一部遅延」', () => {
    disruptionManager.setLineDisruption(makeDisruption({ maxDelayMinutes: 0 }));
    expect(disruptionManager.getStatusSummary().lines[0].status).toBe('一部遅延');
  });

  it('自由入力の文言を使う設定なら、それをそのまま出す', () => {
    disruptionManager.setLineDisruption(makeDisruption({ useCustomMessage: true, customMessage: '  臨時のお知らせ  ' }));
    expect(disruptionManager.getStatusSummary().lines[0].message).toBe('臨時のお知らせ');
  });

  it('saichi_loop で保存された支障も、埼千環状線の行に出る', () => {
    disruptionManager.setLineDisruption(makeDisruption({ lineId: 'saichi_loop', statusType: 'suspended' }));
    expect(disruptionManager.getStatusSummary().lines.find((l) => l.id === 'saichi')!.statusType).toBe('suspended');
  });
});

describe('サーバーとの同期', () => {
  it('設定・解除のたびに、サーバーへ支障と予報をまとめて送る', () => {
    disruptionManager.setLineDisruption(makeDisruption());
    expect(mockGas).toHaveBeenCalledTimes(1);
    const [action, payload] = mockGas.mock.calls[0];
    expect(action).toBe('setDisruptions');
    expect(Object.keys((payload as { disruptions: object }).disruptions)).toEqual(['kanzaki']);
    expect((payload as { forecasts: unknown[] }).forecasts).toEqual([]);

    disruptionManager.clearLineDisruption('kanzaki');
    expect((mockGas.mock.calls[1][1] as { disruptions: object }).disruptions).toEqual({});
  });

  it('サーバーの内容で上書きし、変わったときだけ通知する', async () => {
    const listener = vi.fn();
    const off = disruptionManager.subscribe(listener);
    mockGas.mockResolvedValue({
      status: 'success',
      disruptions: { kanzaki: makeDisruption({ statusType: 'suspended' }) },
      forecasts: [],
    } as never);
    await disruptionManager.syncFromServer();
    expect(disruptionManager.getLineDisruption('kanzaki')?.statusType).toBe('suspended');
    expect(listener).toHaveBeenCalledTimes(1);
    await disruptionManager.syncFromServer();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('通信に失敗したり、失敗の応答だったりしたら、手元の表示をそのまま残す', async () => {
    disruptionManager.setLineDisruption(makeDisruption());
    mockGas.mockRejectedValueOnce(new Error('offline'));
    await disruptionManager.syncFromServer();
    mockGas.mockResolvedValueOnce({ status: 'error' } as never);
    await disruptionManager.syncFromServer();
    expect(disruptionManager.getLineDisruption('kanzaki')).not.toBeNull();
  });

  it('登録を外したリスナーには、通知しない', () => {
    const listener = vi.fn();
    const off = disruptionManager.subscribe(listener);
    off();
    disruptionManager.setLineDisruption(makeDisruption());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('お知らせ文の自動作成', () => {
  it('見合わせは、復旧の言い方によって文末が変わる', () => {
    const f = (until: string) => generateDisruptionText('神埼線', 'suspended', 0, '全線', '強風のため', until);
    expect(f('現時点で復旧のめどは立っていません')).toContain('めどは立っておりません');
    expect(f('安全確認完了次第')).toContain('順次運転再開を予定');
    expect(f('18:30頃まで')).toContain('18:30頃までの運転再開を見込んで');
    expect(f('')).toContain('天候回復および線路安全確認');
  });

  it('遅延は、最大分があれば「最大約N分」、無ければ「一部」', () => {
    expect(generateDisruptionText('神埼線', 'delay', 15, '全線', '', '')).toContain('最大約15分の遅れ');
    expect(generateDisruptionText('神埼線', 'delay', 0, '全線', '', '')).toContain('一部の遅れ');
  });

  it('理由・区間が空なら、決まった言葉で補う', () => {
    const t = generateDisruptionText('神埼線', 'delay', 5, '  ', '  ', '');
    expect(t).toContain('全線での安全確認のため');
  });

  it('方向の指定が文に出る', () => {
    expect(generateDisruptionText('神埼線', 'suspended', 0, '全線', 'x', '', 'up')).toContain('上り線で運転を見合わせ');
    expect(generateDisruptionText('神埼線', 'partially_suspended', 0, '全線', 'x', '', 'down')).toContain('下り線で一部列車');
  });

  it('平常は、決まった一文', () => {
    expect(generateDisruptionText('神埼線', 'normal', 0, '', '', '')).toBe('現在、全線でほぼ平常通り運転しております。');
  });
});

describe('理由と期限の補助', () => {
  it('天候に関わる理由を見分ける', () => {
    expect(isWeatherRelatedReason('強風のため')).toBe(true);
    expect(isWeatherRelatedReason('大雨の影響')).toBe(true);
    expect(isWeatherRelatedReason('車両点検のため')).toBe(false);
  });

  it('理由に合う復旧見込みの候補を返す(未知の理由は、天候かそれ以外かで分ける)', () => {
    expect(getDurationPresetsForReason('突風でふくらんだ雲のため')).toContain('天候回復次第');
    expect(getDurationPresetsForReason('よく分からない理由')).toContain('点検完了次第');
  });

  it('期限の候補は、8つで、基準の時刻より先になる', () => {
    const base = new Date('2026-11-02T22:30:00+09:00');
    const opts = getExpiryOptions(base);
    expect(opts).toHaveLength(8);
    for (const o of opts) {
      expect(o.date.getTime()).toBeGreaterThan(base.getTime());
      expect(o.hoursFromNow).toBeGreaterThanOrEqual(1);
    }
    expect(opts[0].date.getTime() - base.getTime()).toBe(3600_000);
  });
});

describe('選択肢と定型文のデータ', () => {
  it('理由は、種類ごとの一覧をまとめた一覧と合い、復旧見込みの候補を持つ', () => {
    expect(COMMON_REASONS).toEqual(COMMON_REASON_CATEGORIES.flatMap((c) => c.reasons));
    expect(COMMON_REASONS.length).toBeGreaterThan(0);
    for (const c of COMMON_REASON_CATEGORIES) {
      expect(c.reasons.length).toBeGreaterThan(0);
      expect(c.durationPresets.length).toBeGreaterThan(0);
      expect(getDurationPresetsForReason(c.reasons[0])).toBe(c.durationPresets);
    }
  });

  it('区間の候補は、先頭が「全線」で、4路線ぶんそろっている', () => {
    for (const id of ['kanzaki', 'kanzaki_kosoku', 'saichi', 'tsuchiura']) {
      expect(COMMON_SECTIONS[id][0]).toBe('全線');
    }
  });

  it('予報の定型は、種類が重ならず、見出しと説明に路線名が入る', () => {
    const cats = FORECAST_PRESETS.map((p) => p.category);
    expect(new Set(cats).size).toBe(cats.length);
    for (const p of FORECAST_PRESETS) {
      expect(p.defaultHoursAhead).toBeGreaterThan(0);
      expect(p.generateHeadline('神埼線')).toContain('神埼線');
      expect(p.generateDescription('神埼線', '本日夕方', '全線')).toContain('神埼線');
    }
  });
});
