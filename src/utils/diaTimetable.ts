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

// ---------------------------------------------------------------------------
// 遅れ
// 運行指令(管理者の設定)があればそれを優先し、無い列車には「日付+列車番号」で決まる遅れを、
// ごく一部の列車に付ける。同じ列車は同じ日なら、どの画面でも同じ遅れになる(模擬)。
// ---------------------------------------------------------------------------
const AUTO_DELAY_RATE = 0.02; // 全列車のうち、遅れる割合
const AUTO_DELAY_MAX_MIN = 5; // 遅れの最大(分)

const hash32 = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 最後に混ぜ直して、似た文字列でも値が偏らないようにする
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

const autoDelayMinutes = (lineCode: string, trainNo: string, serviceDayStartMs: number): number => {
  const d = new Date(serviceDayStartMs);
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}|${lineCode}|${trainNo}`;
  if (hash32(`a|${key}`) / 4294967296 >= AUTO_DELAY_RATE) return 0;
  return 1 + Math.floor((hash32(`b|${key}`) / 4294967296) * AUTO_DELAY_MAX_MIN);
};

export interface ResolvedDelay {
  delayMinutes: number;
  isSuspended: boolean;
  isAuto: boolean; // ダイヤ上の自動の遅れ(運行指令によるものではない)
}

const resolveDelay = (
  disruptionLineId: string,
  lineCode: string,
  trainNo: string,
  serviceDayStartMs: number,
  seedTimestamp: number,
  direction: 1 | 2,
  position: { stationName: string; isBetween?: boolean }
): ResolvedDelay => {
  const eff = disruptionManager.getEffectiveDelayForTrain(disruptionLineId, seedTimestamp, direction, position);
  if (eff.isSuspended) return { delayMinutes: 0, isSuspended: true, isAuto: false };
  if (eff.delayMinutes > 0) return { delayMinutes: eff.delayMinutes, isSuspended: false, isAuto: false };
  const auto = autoDelayMinutes(lineCode, trainNo, serviceDayStartMs);
  return { delayMinutes: auto, isSuspended: false, isAuto: auto > 0 };
};

const normalizeName = (name: string): string => name.replace(/（.*?）/g, '').trim();

// 駅名の読み(カッコ書き)を除いた形。画面側の駅名との照合に使う
export const normalizeStationName = normalizeName;

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

  type Cand = { eff: number; dayMs: number; line: BoardLine; dep: number; ty: number; ti: number; first: boolean; last: boolean };
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
      let dayMs = base;
      if (dep >= DAY && dep - DAY >= s - GRACE_SEC) {
        eff = dep - DAY;
        dayMs = base - DAY * 1000; // 前日のダイヤの続き
      } else if (dep >= s - GRACE_SEC) {
        eff = dep;
      }
      if (eff === null) return;
      cands.push({ eff, dayMs, line, dep, ty, ti, first: i === 0, last: i === list.length - 1 });
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
    const eff = resolveDelay(LINE_IDS[c.line.code] || 'kanzaki', c.line.code, train[0], c.dayMs, depTs, platform, {
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


// ---------------------------------------------------------------------------
// 列車位置(いまどの駅・どの駅間にいるか)
// ---------------------------------------------------------------------------

export interface LineData {
  code: string;
  master: MasterLine;
  trains: TrainRow[];
}

const lineCache = new Map<string, LineData>();

export const getCachedLineData = (code: string): LineData | undefined => lineCache.get(code);

// 1路線ぶんの全列車を読み込む(列車位置の表示用)
export const loadLineData = async (code: string): Promise<LineData> => {
  const cached = lineCache.get(code);
  if (cached) return cached;
  const master = await loadOnce<Master>('master.json');
  const cfg = master[code];
  if (!cfg) throw new Error(`路線が見つかりません (${code})`);
  const trains = await loadOnce<TrainRow[]>(`${code}_trains.json`);
  const data: LineData = { code, master: cfg, trains };
  lineCache.set(code, data);
  return data;
};

export interface DiaLiveTrain {
  id: string;
  direction: 1 | 2;
  trainType: string;
  destination: string;
  carCount: number;
  // 表示用の駅の並びで「この駅の行(isBetweenなら、この駅と次の駅の間)」に置く駅名
  stationName: string;
  isBetween: boolean;
  isStopStation: boolean;
  delayMinutes: number;
  isAutoDelay: boolean; // 運行指令ではなく、ダイヤ上の自動の遅れ
  timetable: { stationName: string; scheduledTime: string; estimatedTime: string }[];
}

// direction: 1=各路線の1つ目の方向(下り/外回り) 2=もう一方
// lineId: 運行指令(遅延・見合わせ)の路線ID。運転見合わせの列車は含めない
export const computeLiveTrains = (data: LineData, lineId: string, direction: 1 | 2, nowMs: number): DiaLiveTrain[] => {
  const { master } = data;
  const n = master.stations.length;
  const loop = master.loop;
  const dirCode = master.dirs[direction - 1];
  const km = master.stations.map((st) => st[1]);

  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);
  const base = dayStart.getTime();
  const s = (nowMs - base) / 1000;

  // 進行方向に沿った位置(pos)と、表示用の駅の番号(idx)の対応
  // 環状線は、最後に起点の東京へ戻るぶんを pos = n として持つ
  const lastPos = loop ? n : n - 1;
  const idxOfPos = (pos: number): number => {
    if (loop) return direction === 1 ? pos % n : (n - pos) % n;
    return direction === 1 ? pos : n - 1 - pos;
  };
  const posOfStop = (idx: number, isFirst: boolean): number => {
    if (loop) {
      if (idx === 0) return isFirst ? 0 : lastPos;
      return direction === 1 ? idx : n - idx;
    }
    return direction === 1 ? idx : n - 1 - idx;
  };
  // 起点側からの距離(km)。環状線の最後の東京までの距離は、最後の駅間の長さで見積もる
  const kmEnd = km[n - 1] + (km[n - 1] - km[n - 2]);
  const kmOfPos = (pos: number): number => {
    if (loop) {
      if (direction === 1) return pos < n ? km[pos] : kmEnd;
      return pos === 0 ? 0 : kmEnd - km[idxOfPos(pos)];
    }
    return direction === 1 ? km[pos] : km[n - 1] - km[idxOfPos(pos)];
  };

  const result: DiaLiveTrain[] = [];

  for (const t of data.trains) {
    if (t[2] !== dirCode) continue;
    const t0 = t[4];
    const arr = t[5];
    const lastArr = t0 + arr[arr.length - 2];

    // 24時以降も走る列車があるので、「今日の秒数」と「翌日の秒数(24時間足す)」の両方で調べる
    const nowSec = [s, s + DAY].find((x) => x >= t0 && x <= lastArr);
    if (nowSec === undefined) continue;

    const stops: { pos: number; A: number; D: number }[] = [];
    for (let i = 0; i < arr.length; i += 3) {
      const a = arr[i + 1];
      const d = arr[i + 2];
      stops.push({
        pos: posOfStop(arr[i], i === 0),
        A: t0 + (a === -1 ? d : a),
        D: t0 + (d === -1 ? a : d),
      });
    }

    let atStop = -1;
    let segment = -1;
    for (let k = 0; k < stops.length; k++) {
      if (nowSec >= stops[k].A && nowSec <= stops[k].D) {
        atStop = k;
        break;
      }
      if (k < stops.length - 1 && nowSec > stops[k].D && nowSec < stops[k + 1].A) {
        segment = k;
        break;
      }
    }
    if (atStop < 0 && segment < 0) continue;

    let stationName: string;
    let isBetween: boolean;
    let isStopStation: boolean;
    let futureFrom: number;

    if (atStop >= 0) {
      stationName = master.stations[idxOfPos(stops[atStop].pos)][0];
      isBetween = false;
      isStopStation = true;
      futureFrom = atStop;
    } else {
      // 停車駅の間: 通過する駅の時刻は、距離に比例して見積もる(ダイヤ作成時と同じ考え方)
      const from = stops[segment];
      const to = stops[segment + 1];
      const kmFrom = kmOfPos(from.pos);
      const kmTo = kmOfPos(to.pos);
      let passed = from.pos;
      for (let r = from.pos + 1; r < to.pos; r++) {
        const frac = kmTo === kmFrom ? 0 : (kmOfPos(r) - kmFrom) / (kmTo - kmFrom);
        if (from.D + frac * (to.A - from.D) <= nowSec) passed = r;
      }
      const i1 = idxOfPos(passed);
      const i2 = idxOfPos(passed + 1);
      // 環状線の新宿〜東京(最後の東京へ戻る区間)は、画面の駅の並びに駅間が無いので表示しない
      if (Math.abs(i1 - i2) !== 1) continue;
      stationName = master.stations[Math.min(i1, i2)][0];
      isBetween = true;
      isStopStation = stops.some((st) => st.pos === passed);
      futureFrom = segment + 1;
    }

    const serviceDayMs = nowSec === s ? base : base - DAY * 1000;
    const eff = resolveDelay(lineId, data.code, t[0], serviceDayMs, base + t0 * 1000, direction, {
      stationName,
      isBetween,
    });
    if (eff.isSuspended) continue;
    const delay = eff.delayMinutes;

    const timetable = stops.slice(futureFrom).map((st) => ({
      stationName: master.stations[idxOfPos(st.pos)][0],
      scheduledTime: formatDiaTime(st.A),
      estimatedTime: formatDiaTime(st.A + delay * 60),
    }));

    const typeName = master.types[t[1]]?.[0] ?? '各停';
    result.push({
      id: `dia-${data.code}-${t[0]}`,
      direction,
      trainType: displayType(typeName),
      destination: master.stations[idxOfPos(stops[stops.length - 1].pos)][0],
      carCount: typeName.includes('特急') || typeName === '特別快速' ? 10 : 8,
      stationName,
      isBetween,
      isStopStation,
      delayMinutes: delay,
      isAutoDelay: eff.isAuto,
      timetable,
    });
  }

  return result;
};
