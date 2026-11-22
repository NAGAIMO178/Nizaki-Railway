// 運行支障の文の中の「架空」の印を、外した決まりを調べる。
// 断り書きは、カードの下に1つだけ。文の中の印は載せず、保存ずみの文に入っている印は、画面に出すときに取り除く(保存は、そのまま)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn() }));

import { callGas } from '../src/utils/accountApi';
import {
  COMMON_REASON_CATEGORIES,
  disruptionManager,
  generateDisruptionText,
  getDurationPresetsForReason,
  stripKakuuMarks,
  type LineDisruption,
} from '../src/utils/disruptionManager';

const makeDisruption = (over: Partial<LineDisruption> = {}): LineDisruption => ({
  lineId: 'kanzaki',
  lineName: '神埼線',
  code: 'Y',
  statusType: 'suspended',
  targetDirection: 'both',
  maxDelayMinutes: 0,
  durationUntil: '',
  section: '全線',
  reason: '車両点検のため',
  customMessage: '',
  useCustomMessage: false,
  linkToSystem: true,
  updatedAt: '',
  ...over,
});

const mockGas = vi.mocked(callGas);

beforeEach(() => {
  localStorage.clear();
  mockGas.mockReset();
  mockGas.mockResolvedValue({ status: 'success' } as never);
});

// 画面で見つかった、4回入りの文(保存ずみの形)
const SAVED_FOUR =
  '【※架空・シミュレーション】07:17現在、高宮線は、【架空・設定】分岐器（ポイント）不転換のための影響により、上下線で一部列車の運転を取り止めております。（10:15頃まで（※架空設定）まで継続見込み）';

describe('文の中に、印を載せない', () => {
  const marks = /架空|シミュレーション|フィクション/;
  const cases: [string, 'suspended' | 'partially_suspended' | 'delay'][] = [
    ['運転見合わせ', 'suspended'],
    ['一部運休', 'partially_suspended'],
    ['遅延', 'delay'],
  ];
  for (const [name, type] of cases) {
    it(`${name}の文に、「架空」の印が無い`, () => {
      const t = generateDisruptionText('神埼線', type, 10, '全線', '大雨のため', '天候回復次第');
      expect(t).not.toMatch(marks);
      expect(t).toMatch(/^\d{1,2}:\d{2}現在、神埼線は、/);
    });
  }

  it('理由と見込みの候補にも、印が入っていない', () => {
    for (const cat of COMMON_REASON_CATEGORIES) {
      for (const text of [...cat.reasons, cat.defaultDuration, ...cat.durationPresets]) {
        expect(text).not.toMatch(/架空/);
      }
      for (const reason of cat.reasons) {
        for (const d of getDurationPresetsForReason(reason)) expect(d).not.toMatch(/架空/);
      }
    }
  });

  it('候補の本文は、そのまま残っている', () => {
    const weather = COMMON_REASON_CATEGORIES[0];
    expect(weather.reasons).toContain('大雨のため');
    expect(weather.defaultDuration).toBe('天候回復次第');
    expect(weather.durationPresets).toContain('現時点で復旧・再開のめどは立っていません');
  });
});

describe('印の取り除き(画面に出すとき)', () => {
  it('4回入りの文から、4つの印だけが消える', () => {
    expect(stripKakuuMarks(SAVED_FOUR)).toBe(
      '07:17現在、高宮線は、分岐器（ポイント）不転換のための影響により、上下線で一部列車の運転を取り止めております。（10:15頃までまで継続見込み）'
    );
  });

  it('印の無い文は、そのまま', () => {
    const t = '07:17現在、神埼線は、全線での車両点検のための影響により、上下線で運転を見合わせております。（点検完了次第、順次運転再開を予定しております）';
    expect(stripKakuuMarks(t)).toBe(t);
  });

  it('文の本体を壊さない(似た言葉・ほかの括弧・断り書きは残る)', () => {
    const keep = [
      '架空鉄道アプリ内のフィクションです',
      '※本運行支障・遅延情報は架空鉄道アプリ内のフィクションです。',
      '（天候回復次第）',
      '（※ご注意ください）',
      '【運行支障情報】神埼線が発生しております。',
      '【設定】車両点検のため',
    ];
    for (const t of keep) expect(stripKakuuMarks(t)).toBe(t);
  });

  it('半角の括弧の印も取り除く', () => {
    expect(stripKakuuMarks('18:30頃まで(※架空設定)')).toBe('18:30頃まで');
    expect(stripKakuuMarks('天候回復次第(※架空)')).toBe('天候回復次第');
  });

  it('何回呼んでも、同じ結果', () => {
    const once = stripKakuuMarks(SAVED_FOUR);
    expect(stripKakuuMarks(once)).toBe(once);
  });
});

describe('保存ずみの文を、画面に出す', () => {
  it('文・理由・見込みから印が消え、保存された中身は、書き換わらない', () => {
    disruptionManager.setLineDisruption(
      makeDisruption({
        statusType: 'partially_suspended',
        reason: '【架空・設定】分岐器（ポイント）不転換のため',
        durationUntil: '10:15頃まで（※架空設定）',
        customMessage: SAVED_FOUR,
        useCustomMessage: true,
      })
    );
    const line = disruptionManager.getStatusSummary().lines.find((l) => l.id === 'kanzaki')!;
    expect(line.message).not.toMatch(/架空/);
    expect(line.message.startsWith('07:17現在、高宮線は、分岐器')).toBe(true);
    expect(line.reason).toBe('分岐器（ポイント）不転換のため');
    expect(line.durationUntil).toBe('10:15頃まで');
    // 保存された中身は、そのまま
    const stored = disruptionManager.getLineDisruption('kanzaki')!;
    expect(stored.customMessage).toBe(SAVED_FOUR);
    expect(stored.reason).toBe('【架空・設定】分岐器（ポイント）不転換のため');
    expect(stored.durationUntil).toBe('10:15頃まで（※架空設定）');
  });

  it('自動で作った文(理由・見込みに印入り)でも、印が出ない', () => {
    disruptionManager.setLineDisruption(
      makeDisruption({ reason: '【架空・設定】大雨のため', durationUntil: '天候回復次第（※架空）' })
    );
    const line = disruptionManager.getStatusSummary().lines.find((l) => l.id === 'kanzaki')!;
    expect(line.message).not.toMatch(/架空/);
    expect(line.message).toContain('大雨のための影響により');
    expect(line.message).toContain('天候回復次第、順次運転再開を予定しております');
  });
});

describe('画面の注意書きと、運休の注記', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('カードの下の注意書きは、1つだけ残っている', () => {
    const card = read('src/components/StatusCard.tsx');
    expect(card.match(/※本運行支障・遅延情報は架空鉄道アプリ内のフィクションです。/g)).toHaveLength(1);
  });

  it('管理者の見込み書き換えは、印に頼らない', () => {
    const admin = read('src/components/AdminConsoleModal.tsx');
    expect(admin).not.toContain('rewriteDuration');
    expect(admin).not.toMatch(/\/※架空\/\.test/);
  });

  it('列車位置の「運休となった列車は表示していません。」は、無い', () => {
    const tab = read('src/components/TrainLocationTab.tsx');
    expect(tab).not.toContain('運休となった列車は表示していません');
    expect(tab).not.toContain('hidesTrains');
  });
});
