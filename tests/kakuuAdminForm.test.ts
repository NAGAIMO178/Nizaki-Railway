// 保存ずみの文字に「架空」の印が入っていても、管理者コンソールのフォーム・プレビュー・保存し直しに、印が出ない・増えない。
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/accountApi', () => ({ callGas: vi.fn(async () => ({ status: 'success' })) }));

import { disruptionManager, FORECAST_PRESETS, formValuesOf, generateDisruptionText, type LineDisruption } from '../src/utils/disruptionManager';

// 画面で見つかった、印の入った保存ずみの値
const SAVED: LineDisruption = {
  lineId: 'takamiya', lineName: '高宮線', code: 'TK', statusType: 'delay', targetDirection: 'both', maxDelayMinutes: 120,
  durationUntil: '10:15頃まで（※架空設定）', section: '全線', reason: '【架空・設定】変電所設備点検のため',
  customMessage: '【※架空・シミュレーション】09:07現在、高宮線は、【架空・設定】変電所設備点検のための影響により、上下線で最大約120分の遅れが発生しております。（10:15頃まで（※架空設定）の平常運行再開を見込んでおります）',
  useCustomMessage: false, linkToSystem: true, updatedAt: '09:07',
};
const MARK = /架空|シミュレーション/;

beforeEach(() => localStorage.clear());

describe('フォームに読み込む値', () => {
  it('見込み・理由・独自の文言から、印が取り除かれ、文の本体は残る', () => {
    const f = formValuesOf(SAVED);
    expect(f.durationUntil).toBe('10:15頃まで');
    expect(f.reason).toBe('変電所設備点検のため');
    expect(f.customMessage).not.toMatch(MARK);
    expect(f.customMessage.startsWith('09:07現在、高宮線は、変電所設備点検のための影響により、')).toBe(true);
  });
  it('空のときは、理由だけ、いつもの初期値', () => {
    expect(formValuesOf({})).toEqual({ durationUntil: '', reason: '車両点検のため', customMessage: '' });
    expect(formValuesOf({ reason: '【架空・設定】' }).reason).toBe('車両点検のため');
  });
  it('管理者コンソールは、既存の運行乱れを、この関数を通して読み込む', () => {
    const src = readFileSync('src/components/AdminConsoleModal.tsx', 'utf8');
    expect(src).toContain('const form = formValuesOf(existing);');
    expect(src).toContain('setDurationUntil(form.durationUntil);');
    expect(src).toContain('setReason(form.reason);');
    expect(src).toContain('setCustomMessage(form.customMessage);');
    expect(src).not.toMatch(/setDurationUntil\(existing\./);
    expect(src).not.toMatch(/setCustomMessage\(existing\./);
  });
});

describe('プレビュー(文の作成)', () => {
  it('印の入った文字を渡されても、どの種類の文にも、印が出ない', () => {
    for (const type of ['suspended', 'partially_suspended', 'delay'] as const) {
      const text = generateDisruptionText('高宮線', type, 120, '全線', SAVED.reason, SAVED.durationUntil);
      expect(text, type).not.toMatch(MARK);
      expect(text).toContain('変電所設備点検のための影響により');
    }
  });
  it('フォームの値(取り除いたあと)で作っても、同じ文', () => {
    const f = formValuesOf(SAVED);
    expect(generateDisruptionText('高宮線', 'delay', 120, '全線', f.reason, f.durationUntil)).toBe(
      generateDisruptionText('高宮線', 'delay', 120, '全線', SAVED.reason, SAVED.durationUntil)
    );
  });
});

describe('運行乱れの保存し直し', () => {
  it('フォームの値から保存すると、保存ずみの文字から印が消え、増えない', () => {
    disruptionManager.setLineDisruption(SAVED);
    const loaded = disruptionManager.getLineDisruption('takamiya')!;
    expect(loaded.durationUntil).toMatch(MARK); // 保存ずみの中身は、読み込むだけでは書き換わらない
    const f = formValuesOf(loaded);
    const text = generateDisruptionText('高宮線', loaded.statusType, loaded.maxDelayMinutes, loaded.section, f.reason, f.durationUntil, loaded.targetDirection);
    disruptionManager.setLineDisruption({ ...loaded, durationUntil: f.durationUntil, reason: f.reason, customMessage: f.customMessage.trim() || text });
    const resaved = disruptionManager.getLineDisruption('takamiya')!;
    expect(`${resaved.durationUntil}${resaved.reason}${resaved.customMessage}`).not.toMatch(MARK);
    // もう一度読み込んでも、同じ
    expect(formValuesOf(resaved)).toEqual({ durationUntil: resaved.durationUntil, reason: resaved.reason, customMessage: resaved.customMessage });
  });
});

describe('運行予測の定型', () => {
  it('見出しのバッジに、「架空」の印が無い(本文の注意書きは、カードごとに1つ残る)', () => {
    expect(FORECAST_PRESETS).toHaveLength(8);
    for (const p of FORECAST_PRESETS) {
      expect(p.badgeLabel, p.category).not.toMatch(/架空/);
      expect(p.generateDescription('高宮線', '本日', '全線')).toContain('※本情報は架空鉄道アプリ内のシミュレーション（フィクション）です。');
    }
    expect(FORECAST_PRESETS[0].badgeLabel).toBe('台風接近警戒');
  });
});
