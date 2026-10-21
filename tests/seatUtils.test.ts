import { describe, expect, it } from 'vitest';
import type { EquipItem } from '../src/types';
import {
  canOrderItem,
  canUseDelivery,
  generateOccupiedSeats,
  getItemRestrictionLabel,
  getSeatClassLabel,
  getSeatClassRibbon,
  getSeatClassRibbonName,
} from '../src/utils/seatUtils';

const item = (onlySeatTypes?: EquipItem['onlySeatTypes']) => ({ onlySeatTypes }) as EquipItem;

describe('座席の種類のきまり', () => {
  it('表示名', () => {
    expect(getSeatClassLabel('megu')).toBe('めぐシート');
    expect(getSeatClassLabel('green')).toBe('あやみ+');
    expect(getSeatClassLabel('premium')).toBe('プレミアム席');
    expect(getSeatClassLabel('reserved')).toBe('普通指定席');
    expect(getSeatClassLabel('standard')).toBe('自由席');
    expect(getSeatClassLabel(undefined)).toBe('普通席');
  });

  it('車内デリバリーは、めぐシートだけ', () => {
    expect(canUseDelivery('megu')).toBe(true);
    (['green', 'premium', 'reserved', 'standard', undefined] as const).forEach((t) =>
      expect(canUseDelivery(t), String(t)).toBe(false),
    );
  });

  it('注文の制限: 制限がなければ誰でも、あれば対象の席だけ', () => {
    expect(canOrderItem(item(undefined), 'standard')).toBe(true);
    expect(canOrderItem(item([]), undefined)).toBe(true);
    expect(canOrderItem(item(['megu']), 'megu')).toBe(true);
    expect(canOrderItem(item(['megu']), 'green')).toBe(false);
    expect(canOrderItem(item(['megu']), undefined)).toBe(false);
    expect(getItemRestrictionLabel(item(['megu', 'premium']))).toBe('めぐシート・プレミアム席限定');
  });

  it('予約カードの帯: めぐシートだけ「（プレミアム）」が付く', () => {
    expect(getSeatClassRibbon('megu')).toBe('めぐシート（プレミアム） 予約確定');
    expect(getSeatClassRibbon('green')).toBe('あやみ+ 予約確定');
    // 公開後の札は、席種の名前だけ(公開前の「予約確定」つきの帯は、そのまま)
    expect(getSeatClassRibbonName('megu')).toBe('めぐシート（プレミアム）');
    expect(getSeatClassRibbonName('green')).toBe('あやみ+');
  });
});

describe('埋まっている席の自動生成', () => {
  it('同じ日・列車・号車なら、いつも同じ席が埋まる', () => {
    expect(generateOccupiedSeats('2026-11-01', 'M3', 2, false)).toEqual(generateOccupiedSeats('2026-11-01', 'M3', 2, false));
  });

  it('席の番号は、通常車は10列×ABCD、特別車は8列×ABCの中だけ', () => {
    const normal = generateOccupiedSeats('2026-11-01', 'M3', 1, false);
    const special = generateOccupiedSeats('2026-11-01', 'M3', 1, true);
    expect(normal.every((s) => /^(?:[1-9]|10)[A-D]$/.test(s))).toBe(true);
    expect(special.every((s) => /^[1-8][A-C]$/.test(s))).toBe(true);
    expect(new Set(normal).size).toBe(normal.length);
  });
});
