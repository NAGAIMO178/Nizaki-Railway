import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bumpForDelay, crowdDelayRate, CROWD_LEVELS, CROWD_MAX_LEVEL, dayTypeOf } from '../src/utils/crowd';

describe('混雑の計算', () => {
  it('土曜・日曜は「土休日」、ほかは「平日」', () => {
    expect(dayTypeOf(new Date(2026, 10, 2, 12).getTime())).toBe('wd'); // 月
    expect(dayTypeOf(new Date(2026, 10, 6, 12).getTime())).toBe('wd'); // 金
    expect(dayTypeOf(new Date(2026, 10, 7, 12).getTime())).toBe('we'); // 土
    expect(dayTypeOf(new Date(2026, 10, 8, 12).getTime())).toBe('we'); // 日
  });

  it('3分以上遅れた列車は、混雑を1つ上げる。上限を超えない', () => {
    expect(bumpForDelay(3, undefined)).toBe(3);
    expect(bumpForDelay(3, 0)).toBe(3);
    expect(bumpForDelay(3, 2)).toBe(3);
    expect(bumpForDelay(3, 3)).toBe(4);
    expect(bumpForDelay(CROWD_MAX_LEVEL, 10)).toBe(CROWD_MAX_LEVEL);
  });

  it('混んだ列車ほど、遅れやすい。レベルの範囲の外は、端に合わせる', () => {
    let prev = 0;
    for (let lv = 1; lv <= CROWD_MAX_LEVEL; lv++) {
      const r = crowdDelayRate(lv);
      expect(r).toBeGreaterThan(prev);
      expect(r).toBeLessThan(1);
      prev = r;
    }
    expect(crowdDelayRate(0)).toBe(crowdDelayRate(1));
    expect(crowdDelayRate(99)).toBe(crowdDelayRate(CROWD_MAX_LEVEL));
  });
});

describe('混雑の段階の区切り', () => {
  it('乗車率の目安は 〜50 / 〜100 / 〜120 / 〜150 / 150%超。言葉(label・short)は、そのまま', () => {
    expect(CROWD_LEVELS.map((l) => l.range)).toEqual(['〜50%', '〜100%', '〜120%', '〜150%', '150%超']);
    expect(CROWD_LEVELS.map((l) => l.short)).toEqual(['座れる', 'ゆったり', 'やや混', '混雑', '大混雑']);
    expect(CROWD_LEVELS.map((l) => l.label)).toEqual(['座席に座れる程度です', 'ゆったり立てる程度です', '少し混み合っています', '肩がふれあう程度です', 'かなり混み合っています']);
  });

  it('混雑を作る tools/crowd-sim/sim.py の LEVELS(しきい値)と、同じ区切り', () => {
    const sim = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'crowd-sim', 'sim.py'), 'utf-8');
    const m = /^LEVELS = \[([\d, ]+)\]/m.exec(sim);
    expect(m).not.toBeNull();
    const th = m![1].split(',').map((x) => Number(x.trim()));
    expect(th).toEqual([50, 100, 120, 150, 180]);
    // アプリの文言の数字(〜50〜100〜120〜150)と、sim の最初の4つが同じ
    const app = CROWD_LEVELS.slice(0, 4).map((l) => Number(/\d+/.exec(l.range)![0]));
    expect(app).toEqual(th.slice(0, 4));
  });

  it('混雑データ(平日・休日)の区間の数。段階は、1〜5(6は0件)。宇都宮線のキーも入っている', () => {
    const expected: Record<string, Record<string, number>> = {
      'train_wd.json': { '1': 17504, '2': 1091, '3': 55, '4': 28, '5': 3 },
      'train_we.json': { '1': 18072, '2': 579, '3': 24, '4': 6 },
    };
    for (const [file, want] of Object.entries(expected)) {
      const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'public', 'data', 'crowd-2', file), 'utf-8')) as Record<string, Record<string, string>>;
      expect(Object.keys(d)).toEqual(['NI', 'Y', 'SC', 'TC', 'UT']);
      const count: Record<string, number> = {};
      for (const line of Object.values(d)) for (const s of Object.values(line)) for (const ch of s) count[ch] = (count[ch] ?? 0) + 1;
      expect(count, file).toEqual(want);
    }
  });

  it('混雑を作る sim.py の既定の倍率が、いまの混雑データを作った値(何も指定しなくても、同じ結果になる)', () => {
    const sim = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'crowd-sim', 'sim.py'), 'utf-8');
    expect(/^DEMAND = float\(os\.environ\.get\("DEMAND", 0\.7\)\)/m.test(sim)).toBe(true);
    const m = /^LINE_DEMAND = (\{[^}]*\})/m.exec(sim);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual({ NI: 2.1, Y: 1.75, SC: 0.65, TC: 1.8, UT: 2.86 });
  });
});
