// 全駅ダイヤ(public/data/dia/ の小分けJSON)から、駅の発車案内を作る。
// データの仕様は public/data/dia/README.md を参照。
// 時刻は「0時0分0秒からの経過秒」で、86400以上は翌日(24時以降)。
import { disruptionManager } from './disruptionManager';
import type { DynamicDeparture } from '../components/MyStationCard';

type MasterLine = {
  name: string;
  loop: boolean;
  dirs: [string, string];
  stations: [string, number][];
  types: [string, string, number][];
};
type Master = Record<string, MasterLine>;
// [列車番号, 種別番号, 方向, 運用番号, 始発の発車秒, [駅番号, 着, 発, ...3つずつ(始発秒からの差。-1は無し)]]
type TrainRow = [string, number, string, string, number, number[]];
// {方向: [[発車秒, 種別番号, 列車の添字], ...]}
type StationFile = Record<string, [number, number, number][]>;

const BASE_URL = `${import.meta.env.BASE_URL}data/dia/`;

const LINE_IDS: Record<string, string> = {
  Y: 'kanzaki',
  NI: 'kanzaki_kosoku',
  SC: 'saichi',
  TC: 'tsuchiura',
};

const DAY = 86400;
// この時間(秒)より先の列車は表示せず、「運行終了」の案内にする(昼間の最大の間隔は約68分)
const WINDOW_SEC = 90 * 60;
// 発車後もこの秒数までは表示に残す
const GRACE_SEC = 30;

const normalizeName = (name: string): string => name.replace(/（.*?）/g, '').trim();

const fetchJson = async <T>(file: string): Promise<T> => {
  const res = await fetch(`${BASE_URL}${file}`);
  if (!res.ok) throw new Error(`ダイヤの読み込みに失敗しました (${file}: ${res.status})`);
  return res.json();
};

// 同じファイルは1度しか読まない(失敗したときは次回やり直す)
const promiseCache = new Map<string, Promise<unknown>>();
const loadOnce = <T>(file: string): Promise<T> => {
  let p = promiseCache.get(file) as Promise<T> | undefined;
  if (!p) {
    p = fetchJson<T>(file);
    promiseCache.set(file, p);
    p.catch(() => promiseCache.delete(file));
  }
  return p;
};

export interface BoardLine {
  code: string;
  master: MasterLine;
  trains: TrainRow[];
  file: StationFile;
  stationIdx: number;
}

export interface BoardData {
  stationName: string;
  lines: BoardLine[];
}

const boardCache = new Map<string, BoardData>();

export const getCachedBoardData = (stationName: string): BoardData | undefined =>
  boardCache.get(normalizeName(stationName));

// その駅に乗り入れる路線のデータを読み込む(駅のファイルと、その路線の列車データだけ)
export const loadBoardData = async (stationName: string): Promise<BoardData> => {
  const name = normalizeName(stationName);
  const cached = boardCache.get(name);
  if (cached) return cached;

  const master = await loadOnce<Master>('master.json');
  const lines: BoardLine[] = [];
  for (const [code, cfg] of Object.entries(master)) {
    const stationIdx = cfg.stations.findIndex((s) => s[0] === name);
    if (stationIdx < 0) continue;
    const [trains, file] = await Promise.all([
      loadOnce<TrainRow[]>(`${code}_trains.json`),
      loadOnce<StationFile>(`${code}_st${stationIdx}.json`),
    ]);
    lines.push({ code, master: cfg, trains, file, stationIdx });
  }

  const data: BoardData = { stationName: name, lines };
  boardCache.set(name, data);
  return data;
};

export type BoardStatus = 'ok' | 'ended' | 'terminal';

export interface BoardResult {
  status: BoardStatus;
  departures: DynamicDeparture[];
  // 運行終了のとき用: 次の初電・この方向の終電(0時からの秒数。86400以上は24時以降)
  firstSec?: number;
  lastSec?: number;
  // 次の初電までの秒数
  untilFirstSec?: number;
}

const displayType = (typeName: string): string => (typeName.startsWith('各停') ? '各停' : typeName);

// platform: 1=下り(各路線の1つ目の方向 / 環状線は外回り) 2=上り(内回り)
export const computeBoard = (data: BoardData, platform: 1 | 2, nowMs: number, limit = 3): BoardResult => {
  const dirIdx = platform === 1 ? 0 : 1;

  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);
  const base = dayStart.getTime();
  const s = (nowMs - base) / 1000;

  type Cand = { eff: number; line: BoardLine; dep: number; ty: number; ti: number; first: boolean; last: boolean };
  const cands: Cand[] = [];
  let hasAnyDeparture = false;
  let firstSec: number | undefined;
  let lastSec: number | undefined;

  for (const line of data.lines) {
    const list = line.file[line.master.dirs[dirIdx]] || [];
    if (list.length === 0) continue;
    hasAnyDeparture = true;
    firstSec = firstSec === undefined ? list[0][0] : Math.min(firstSec, list[0][0]);
    lastSec = lastSec === undefined ? list[list.length - 1][0] : Math.max(lastSec, list[list.length - 1][0]);

    list.forEach(([dep, ty, ti], i) => {
      // 24時以降の発車は、前日のダイヤの続き(0時台)としても扱う
      let eff: number | null = null;
      if (dep >= DAY && dep - DAY >= s - GRACE_SEC) eff = dep - DAY;
      else if (dep >= s - GRACE_SEC) eff = dep;
      if (eff === null) return;
      cands.push({ eff, line, dep, ty, ti, first: i === 0, last: i === list.length - 1 });
    });
  }

  if (!hasAnyDeparture) {
    return { status: 'terminal', departures: [] };
  }

  cands.sort((a, b) => a.eff - b.eff);
  const upcoming = cands.filter((c) => c.eff - s <= WINDOW_SEC).slice(0, limit);

  if (upcoming.length === 0) {
    const f = firstSec ?? 0;
    return {
      status: 'ended',
      departures: [],
      firstSec: f,
      lastSec,
      untilFirstSec: f > s ? f - s : f + DAY - s,
    };
  }

  const departures: DynamicDeparture[] = upcoming.map((c) => {
    const train = c.line.trains[c.ti];
    const stops = train[5];
    const originIdx = stops[0];
    const destIdx = stops[stops.length - 3];
    const depTs = base + c.eff * 1000;
    const eff = disruptionManager.getEffectiveDelayForTrain(LINE_IDS[c.line.code] || 'kanzaki', depTs, platform, {
      stationName: data.stationName,
    });
    const hh = String(Math.floor(c.eff / 3600) % 24).padStart(2, '0');
    const mm = String(Math.floor((c.eff % 3600) / 60)).padStart(2, '0');
    return {
      id: `dia-${c.line.code}-${train[0]}-${depTs}`,
      lineName: c.line.master.name,
      trainType: displayType(c.line.master.types[train[1]]?.[0] ?? '各停'),
      destination: c.line.master.stations[destIdx]?.[0] ?? '',
      departureTime: `${hh}:${mm}`,
      departureTimestamp: depTs,
      isFirstTrain: c.first,
      isLastTrain: c.last,
      isOrigin: originIdx === c.line.stationIdx,
      delayMinutes: eff.delayMinutes,
      isSuspended: eff.isSuspended,
    };
  });

  return { status: 'ok', departures };
};

// 0時からの秒数を "HH:MM" にする(24時以降は0時台に戻す)
export const formatDiaTime = (sec: number): string => {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
