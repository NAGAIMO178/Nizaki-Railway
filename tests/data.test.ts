// 公開後のダイヤ(public/data/dia-2)と、混雑のデータ(public/data/crowd-2)の、つじつまが合っているかを調べる。
// ダイヤを差し替えたときに、列車番号の抜け・重なり、時刻の逆転、直通のつながり、混雑データの作り直し忘れに、すぐ気づくためのテスト。
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DATA = path.resolve(__dirname, '..', 'public', 'data');
const read = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf-8'));

interface MasterLine {
  name: string;
  loop: boolean;
  stations: [string, number][];
  types: [string, string, number][];
  dirs: [string, string];
}
type TrainRow = [string, number, string, string, number, number[], string];
type StationFile = Record<string, [number, number, number][]>;
// 運用: [列車番号, 発駅名, 発秒, 着駅名, 着秒]。路線をまたぐ編成は、駅名で持つ
type Unyo = Record<string, Record<string, [string, string, number, string, number][]>>;

const master = read<Record<string, MasterLine>>('dia-2/master.json');
const lines = Object.keys(master);
const trains: Record<string, TrainRow[]> = {};
lines.forEach((l) => (trains[l] = read<TrainRow[]>(`dia-2/${l}_trains.json`)));
const runNos = read<Record<string, Record<string, string>>>('dia-2/運行番号.json');
const unyo = read<Unyo>('dia-2/運用.json');

const stops = (t: TrainRow) => {
  const out: { st: number; arr: number; dep: number }[] = [];
  for (let k = 0; k < t[5].length; k += 3) out.push({ st: t[5][k], arr: t[5][k + 1], dep: t[5][k + 2] });
  return out;
};

// 同じ列車番号が、いくつの路線に入っているか(直通の列車は、通る路線それぞれに、その路線を走る部分だけ入る)
const portions = new Map<string, { line: string; row: TrainRow }[]>();
lines.forEach((l) =>
  trains[l].forEach((t) => {
    if (!portions.has(t[0])) portions.set(t[0], []);
    portions.get(t[0])!.push({ line: l, row: t });
  })
);
const through = [...portions.entries()].filter(([, v]) => v.length > 1);

describe('列車のデータ', () => {
  it('列車番号は、6桁の数字で、同じ路線の中では重ならない', () => {
    lines.forEach((l) => {
      const seen = new Set<string>();
      trains[l].forEach((t) => {
        expect(t[0], `${l} ${t[0]}`).toMatch(/^\d{6}$/);
        expect(seen.has(t[0]), `${l} の重複: ${t[0]}`).toBe(false);
        seen.add(t[0]);
      });
    });
    expect(portions.size).toBeGreaterThan(1000);
  });

  it('種別・方向・駅の番号が、路線の定義の範囲に入っている', () => {
    lines.forEach((l) => {
      const m = master[l];
      trains[l].forEach((t) => {
        expect(m.types[t[1]], `${t[0]} の種別`).toBeDefined();
        expect(m.dirs, `${t[0]} の方向`).toContain(t[2]);
        stops(t).forEach((s) => expect(m.stations[s.st], `${t[0]} の駅 ${s.st}`).toBeDefined());
      });
    });
  });

  it('時刻が、時間の順に並んでいる(着 ≦ 発 ≦ 次の着)。始発に着なし、終着に発なし', () => {
    lines.forEach((l) =>
      trains[l].forEach((t) => {
        const s = stops(t);
        expect(s.length, `${t[0]} の停車駅の数`).toBeGreaterThanOrEqual(2);
        expect(s[0].arr, `${t[0]} の始発の着`).toBe(-1);
        expect(s[s.length - 1].dep, `${t[0]} の終着の発`).toBe(-1);
        let prev = -Infinity;
        s.forEach((x, i) => {
          if (x.arr !== -1) {
            expect(x.arr, `${t[0]} ${i}番目の着`).toBeGreaterThanOrEqual(prev);
            prev = x.arr;
          }
          if (x.dep !== -1) {
            expect(x.dep, `${t[0]} ${i}番目の発`).toBeGreaterThanOrEqual(prev);
            prev = x.dep;
          }
        });
      })
    );
  });

  it('運行番号は、「2桁+K」で、運用番号の表と合っている(編成が所属する路線の表)', () => {
    lines.forEach((l) =>
      trains[l].forEach((t) => {
        expect(t[6], `${t[0]} の運行番号`).toMatch(/^\d{2}K$/);
        const owners = lines.filter((x) => runNos[x]?.[t[3]] !== undefined);
        expect(owners.length, `${t[0]} の運用番号 ${t[3]} が入っている表の数`).toBe(1);
        expect(runNos[owners[0]][t[3]], `${t[0]} の運行番号`).toBe(t[6]);
      })
    );
  });
});

describe('直通の列車(路線をまたぐ列車)', () => {
  it('直通がある', () => {
    expect(through.length).toBeGreaterThan(0);
  });

  it('同じ番号は、ちょうど2つの路線にあり、前の路線の終着と、次の路線の始発が、同じ駅でつながる', () => {
    through.forEach(([code, v]) => {
      expect(v.length, `${code} が入っている路線の数`).toBe(2);
      const [a, b] = [...v].sort((x, y) => x.row[4] - y.row[4]);
      expect(a.line, `${code} の路線`).not.toBe(b.line);
      const sa = stops(a.row);
      const sb = stops(b.row);
      const last = sa[sa.length - 1];
      const first = sb[0];
      expect(master[b.line].stations[first.st][0], `${code}: ${a.line} の終着と ${b.line} の始発の駅`).toBe(master[a.line].stations[last.st][0]);
      const dwell = b.row[4] + first.dep - (a.row[4] + last.arr);
      expect(dwell, `${code} の乗継の停車時間(秒)`).toBeGreaterThanOrEqual(0);
      expect(dwell, `${code} の乗継の停車時間(秒)`).toBeLessThanOrEqual(15 * 60);
    });
  });

  it('同じ番号の2つの部分は、同じ編成(運用番号・運行番号)で、同じ種別の名前', () => {
    through.forEach(([code, v]) => {
      const [x, y] = v;
      expect(y.row[3], `${code} の運用番号`).toBe(x.row[3]);
      expect(y.row[6], `${code} の運行番号`).toBe(x.row[6]);
      expect(master[y.line].types[y.row[1]][0], `${code} の種別`).toBe(master[x.line].types[x.row[1]][0]);
    });
  });
});

describe('駅ごとの発車のデータ', () => {
  it('どの発車も、その列車の、その駅の発車時刻と、種別・方向が合っている', () => {
    lines.forEach((l) => {
      master[l].stations.forEach((_, idx) => {
        const file = read<StationFile>(`dia-2/${l}_st${idx}.json`);
        Object.entries(file).forEach(([dir, list]) => {
          expect(master[l].dirs, `${l} 駅${idx} の方向`).toContain(dir);
          let prev = -Infinity;
          list.forEach(([dep, type, ti]) => {
            const t = trains[l][ti];
            expect(t, `${l} 駅${idx}: 列車の番号 ${ti}`).toBeDefined();
            expect(t[2], `${t[0]} の方向`).toBe(dir);
            expect(t[1], `${t[0]} の種別`).toBe(type);
            expect(dep, `${l} 駅${idx} の並び`).toBeGreaterThanOrEqual(prev);
            prev = dep;
            const hit = stops(t).some((s) => s.st === idx && s.dep !== -1 && t[4] + s.dep === dep);
            expect(hit, `${t[0]} は、駅${idx} を ${dep} 秒に出ない`).toBe(true);
          });
        });
      });
    });
  });
});

describe('運用(編成の1日)', () => {
  it('営業の列車は、全路線を通して、ちょうど1つの運用に入っていて、運用の中でつながっている', () => {
    const used = new Map<string, number>();
    lines.forEach((l) =>
      Object.entries(unyo[l]).forEach(([run, rows]) => {
        expect(runNos[l][run], `${l} ${run} の運行番号`).toBeDefined();
        rows.forEach((r, i) => {
          if (!r[0].startsWith('回')) used.set(r[0], (used.get(r[0]) ?? 0) + 1);
          expect(r[4], `${run} ${r[0]} の着が発より前`).toBeGreaterThanOrEqual(r[2]);
          if (i > 0) {
            const p = rows[i - 1];
            expect(r[1], `${run}: ${p[0]} の着駅と、${r[0]} の発駅が、違う`).toBe(p[3]);
            expect(r[2], `${run}: ${p[0]} の着より前に、${r[0]} が発車`).toBeGreaterThanOrEqual(p[4]);
          }
        });
      })
    );
    portions.forEach((_, code) => expect(used.get(code), `${code} が入っている運用の数`).toBe(1));
    used.forEach((_, code) => expect(portions.has(code), `運用の ${code} が、ダイヤに無い`).toBe(true));
  });
});

describe('混雑のデータ', () => {
  it('全部の列車に、平日と土休日の混雑がある(区間の数が、停車駅の数−1)', () => {
    (['wd', 'we'] as const).forEach((day) => {
      const crowd = read<Record<string, Record<string, string>>>(`crowd-2/train_${day}.json`);
      lines.forEach((l) =>
        trains[l].forEach((t) => {
          const s = crowd[l]?.[t[0]];
          expect(s, `${day} ${l} ${t[0]} の混雑`).toBeDefined();
          expect(s.length, `${day} ${t[0]} の区間の数`).toBe(t[5].length / 3 - 1);
          expect(s, `${day} ${t[0]} のレベル`).toMatch(/^[1-6]+$/);
        })
      );
    });
  });

  it('ダイヤに無い列車の混雑が、残っていない', () => {
    (['wd', 'we'] as const).forEach((day) => {
      const crowd = read<Record<string, Record<string, string>>>(`crowd-2/train_${day}.json`);
      lines.forEach((l) => {
        const codes = new Set(trains[l].map((t) => t[0]));
        Object.keys(crowd[l] ?? {}).forEach((code) => expect(codes.has(code), `${day} ${l} ${code}`).toBe(true));
      });
    });
  });
});
