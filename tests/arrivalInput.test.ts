import { describe, it, expect } from 'vitest';
import { shiftArrival, defaultArrival, arrivalFromDate, arrivalClock, arrivalLabel } from '../src/utils/arrivalInput';

describe('到着時刻の入力', () => {
  it('5分前・5分後で、時をまたぐ', () => {
    expect(shiftArrival({ day: 'today', hour: 9, minute: 2 }, -5)).toEqual({ day: 'today', hour: 8, minute: 57 });
    expect(shiftArrival({ day: 'today', hour: 8, minute: 58 }, 5)).toEqual({ day: 'today', hour: 9, minute: 3 });
  });

  it('日をまたぐと、今日と明日が切り替わる', () => {
    expect(shiftArrival({ day: 'today', hour: 23, minute: 58 }, 5)).toEqual({ day: 'tomorrow', hour: 0, minute: 3 });
    expect(shiftArrival({ day: 'tomorrow', hour: 0, minute: 2 }, -5)).toEqual({ day: 'today', hour: 23, minute: 57 });
  });

  it('ちょうど0:00は、明日の0時', () => {
    expect(shiftArrival({ day: 'today', hour: 23, minute: 55 }, 5)).toEqual({ day: 'tomorrow', hour: 0, minute: 0 });
  });

  it('今日の0:00より前、明日の23:59より後には、進まない', () => {
    expect(shiftArrival({ day: 'today', hour: 0, minute: 2 }, -5)).toEqual({ day: 'today', hour: 0, minute: 0 });
    expect(shiftArrival({ day: 'tomorrow', hour: 23, minute: 58 }, 5)).toEqual({ day: 'tomorrow', hour: 23, minute: 59 });
  });

  it('はじめの値は、いまの1時間後。夜遅くなら明日', () => {
    expect(defaultArrival(new Date(2026, 9, 16, 17, 34))).toEqual({ day: 'today', hour: 18, minute: 34 });
    expect(defaultArrival(new Date(2026, 9, 16, 23, 30))).toEqual({ day: 'tomorrow', hour: 0, minute: 30 });
  });

  it('いまの時刻は、今日として返る', () => {
    expect(arrivalFromDate(new Date(2026, 9, 16, 7, 5))).toEqual({ day: 'today', hour: 7, minute: 5 });
  });

  it('表示の文字', () => {
    expect(arrivalClock({ day: 'today', hour: 9, minute: 0 })).toBe('09:00');
    expect(arrivalLabel({ day: 'tomorrow', hour: 9, minute: 0 })).toBe('明日 09:00');
    expect(arrivalLabel({ day: 'today', hour: 18, minute: 5 })).toBe('今日 18:05');
  });
});
