// マイページの入会日: どんな形で届いても、日本時間の日付の「2026年10月3日」にする。読めないものは「—」
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatJoinDate } from '../src/utils/joinDate';

describe('日本時間の日付にする(UTC のまま日付を切らない)', () => {
  it('UTC の 10/2 15:00 は、日本時間の 10/3 0:00 → 10月3日(報告された例)', () => {
    expect(formatJoinDate('2026-10-02T15:00:00.000Z')).toBe('2026年10月3日');
  });

  it('UTC 15:00 の境目: 14:59:59.999 までは前の日、15:00:00.000 からは次の日', () => {
    expect(formatJoinDate('2026-10-02T14:59:59.999Z')).toBe('2026年10月2日');
    expect(formatJoinDate('2026-10-02T15:00:00.000Z')).toBe('2026年10月3日');
    expect(formatJoinDate('2026-10-02T00:00:00.000Z')).toBe('2026年10月2日'); // UTC 0:00 = 日本時間 9:00
  });

  it('月末・年またぎ・うるう日', () => {
    expect(formatJoinDate('2026-10-31T15:00:00.000Z')).toBe('2026年11月1日');
    expect(formatJoinDate('2026-10-31T14:59:59.000Z')).toBe('2026年10月31日');
    expect(formatJoinDate('2026-12-31T15:00:00.000Z')).toBe('2027年1月1日');
    expect(formatJoinDate('2026-12-31T14:59:59.000Z')).toBe('2026年12月31日');
    expect(formatJoinDate('2028-02-28T15:00:00.000Z')).toBe('2028年2月29日'); // うるう年
    expect(formatJoinDate('2027-02-28T15:00:00.000Z')).toBe('2027年3月1日');
  });

  it('時区つきの別の書き方(+09:00・-05:00)も、時刻として読んで、日本時間にする', () => {
    expect(formatJoinDate('2026-10-03T00:00:00+09:00')).toBe('2026年10月3日');
    expect(formatJoinDate('2026-10-02T23:59:59+09:00')).toBe('2026年10月2日');
    expect(formatJoinDate('2026-10-02T10:00:00-05:00')).toBe('2026年10月3日'); // UTC 15:00
    expect(formatJoinDate('2026-10-02T10:00:00+0000')).toBe('2026年10月2日');
  });

  it('Date・ミリ秒の時刻も、同じ', () => {
    expect(formatJoinDate(new Date('2026-10-02T15:00:00.000Z'))).toBe('2026年10月3日');
    expect(formatJoinDate(Date.parse('2026-10-02T14:59:59.999Z'))).toBe('2026年10月2日');
  });
});

describe('日付だけの形・シートの文字は、その日付のまま(日本時間の日付として)', () => {
  it('登録時の 2026-10-03・デモ会員の 2024-04-01', () => {
    expect(formatJoinDate('2026-10-03')).toBe('2026年10月3日');
    expect(formatJoinDate('2024-04-01')).toBe('2024年4月1日');
    expect(formatJoinDate('2026-12-31')).toBe('2026年12月31日');
  });

  it('2026/10/03・2026/1/5・2026.10.03・時刻つき(時区なし = シートの日本時間)', () => {
    expect(formatJoinDate('2026/10/03')).toBe('2026年10月3日');
    expect(formatJoinDate('2026/1/5')).toBe('2026年1月5日');
    expect(formatJoinDate('2026.10.03')).toBe('2026年10月3日');
    expect(formatJoinDate('2026/10/03 00:00:00')).toBe('2026年10月3日');
    expect(formatJoinDate('2026-10-03T23:59:59')).toBe('2026年10月3日');
    expect(formatJoinDate('  2026-10-03  ')).toBe('2026年10月3日');
  });

  it('すでに日本語の表記は、そのまま(ゼロ埋めは外す)', () => {
    expect(formatJoinDate('2026年10月3日')).toBe('2026年10月3日');
    expect(formatJoinDate('2026年10月03日')).toBe('2026年10月3日');
  });
});

describe('読めないもの・空は「—」(元の文字は、出さない)', () => {
  it.each([undefined, null, '', '   ', 'abc', 'あした', '2026-13-45', '2026-02-30', '2027-02-29', '2026-00-10', '2026-10-00', '0000-00-00', '2026-10-03T25:00:00Z', '2026-10-03T10:61:00Z', '2026/10', '20261003', '2026-10-02T15:00:00.000Z extra', 123, 0, -1, NaN, {}, [], true, new Date('invalid')])(
    '%s',
    (v) => {
      expect(formatJoinDate(v)).toBe('—');
    }
  );
});

describe('画面とのつなぎ', () => {
  it('マイページの入会日は、formatJoinDate を通す(元データを、そのまま出さない)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'MyPageModal.tsx'), 'utf-8');
    expect(src).toContain('{formatJoinDate(currentUser.joinDate)}');
    expect(src).not.toContain('{currentUser.joinDate');
  });
});
