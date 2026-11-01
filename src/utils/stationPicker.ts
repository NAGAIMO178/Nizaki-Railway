// 経路検索の駅を選ぶシート用の、駅の一覧と絞り込み。
//  - 「すべて」は、駅の名前ごとに1つ(直通や乗換で、複数の路線に出る駅も、重複させない)。出る路線を、駅ごとに持つ。
//  - 路線を選んだときは、その路線の並び(駅番号つき)。
import { normalizeStationName } from './diaTimetable';
import type { TimetableLine } from './diaTimetable';

export interface PickerStationLine {
  code: string; // Y / NI / SC / TC
  stationCode: string; // 例: Y03
}

export interface PickerStation {
  name: string;
  lines: PickerStationLine[];
}

export interface PickerData {
  all: PickerStation[];
  byLine: Record<string, PickerStation[]>;
}

const pad = (n: number) => String(n).padStart(2, '0');

// lines: 路線ごとの駅の並び。routeStations: 経路検索で選べる駅の名前(この中にある駅だけ出す)
export const buildPickerData = (lines: TimetableLine[], routeStations: string[]): PickerData => {
  const allowed = new Set(routeStations);
  const all = new Map<string, PickerStation>();
  const byLine: Record<string, PickerStation[]> = {};
  for (const line of lines) {
    const inLine = new Map<string, PickerStation>();
    line.stations.forEach((raw, idx) => {
      const name = normalizeStationName(raw);
      if (!allowed.has(name) || inLine.has(name)) return; // 環状線の最後の東京など、同じ路線の重複は1つ
      const ref: PickerStationLine = { code: line.code, stationCode: `${line.code}${pad(idx + 1)}` };
      inLine.set(name, { name, lines: [ref] });
      const prev = all.get(name);
      if (prev) prev.lines.push(ref);
      else all.set(name, { name, lines: [ref] });
    });
    byLine[line.code] = [...inLine.values()];
  }
  // 一覧に出なかった駅(路線のデータに無い)も、選べるように、最後に足す
  for (const name of routeStations) if (!all.has(name)) all.set(name, { name, lines: [] });
  return { all: [...all.values()], byLine };
};

const toKatakana = (s: string): string => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const norm = (s: string): string => toKatakana(s.normalize('NFKC').trim().toLowerCase());

// 駅名・駅番号(y03 など)に、入力した文字が含まれる駅。前から合う駅を、先に出す。空の入力は、そのまま
export const filterPickerStations = (list: PickerStation[], query: string): PickerStation[] => {
  const q = norm(query);
  if (!q) return list;
  const hit = (s: PickerStation): number => {
    const n = norm(s.name);
    if (n.startsWith(q)) return 0;
    if (n.includes(q)) return 1;
    if (s.lines.some((l) => l.stationCode.toLowerCase().startsWith(q))) return 2;
    return -1;
  };
  return list
    .map((s, i) => ({ s, i, h: hit(s) }))
    .filter((x) => x.h >= 0)
    .sort((a, b) => a.h - b.h || a.i - b.i)
    .map((x) => x.s);
};

// 最近選んだ駅(この端末。名前だけ。新しい順に、最大5つ)
const RECENT_KEY = 'nizaki_route_recent_stations';
export const RECENT_MAX = 5;

export const addRecent = (recent: string[], name: string): string[] => [name, ...recent.filter((n) => n !== name)].slice(0, RECENT_MAX);

export const loadRecentStations = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || 'null');
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX);
  } catch {
    // 読めなければ、なし
  }
  return [];
};

export const saveRecentStation = (name: string): void => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(addRecent(loadRecentStations(), name)));
  } catch {
    // 保存できなくても、使える
  }
};
