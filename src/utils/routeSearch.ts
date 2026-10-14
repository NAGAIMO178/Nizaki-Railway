// 経路検索: 全駅ダイヤから、出発駅から到着駅までの乗り方(乗換あり)を、早く着く順に探す。
// 乗り換えは、同じ駅名で乗り継ぐ(別路線でも、同じ路線の別の列車でもよい)。最大5本の列車まで。
import { loadLineData, LineData, normalizeStationName, tripDistance, resolveTrainDelay } from './diaTimetable';
import { calculateFare } from './fare';
import { RouteOptions, DEFAULT_ROUTE_OPTIONS } from './routeOptions';

const LINE_CODES = ['Y', 'NI', 'SC', 'TC'];
// 乗換に必要な最短の時間(秒)。模擬の値で、駅による違いは付けていない
export const TRANSFER_SEC = 4 * 60;
export const RELAXED_TRANSFER_SEC = 8 * 60;
const MAX_LEGS = 5;
// 経由駅を指定したときは、回り道をすることがあるので、乗る列車の本数の上限を増やす
const MAX_LEGS_WITH_VIAS = 7;
// 乗換を1回増やすなら、これだけ(秒)早く着かないと選ばない(わずかな差のために、乗換を増やさないため)
const TRANSFER_PENALTY_SEC = 8 * 60;
// 駅で待ってもよい最大の時間。これより先の列車は、その駅からの乗車候補にしない
const BOARD_WINDOW_SEC = 90 * 60;
// 始発前など、時間の範囲に列車が無いときでも、最低これだけの本数は乗車候補にする
const MIN_BOARDINGS = 6;
// 遅れを加味するとき、時刻表より前に出る列車でも、遅れて間に合うことがあるので、この時間だけさかのぼって調べる
const DELAY_LOOKBACK_SEC = 60 * 60;
const DAY = 86400;

interface Dep {
  dep: number;
  trainIdx: number;
  pos: number; // その列車の停車駅の並び(3つずつ)の中で、この駅の位置
}

interface Net {
  lines: Record<string, LineData>;
  // 駅名 → その駅がある路線と駅番号
  stationLines: Map<string, { line: string; idx: number }[]>;
  // "路線|駅番号" → その駅を発車する列車(発車の早い順)
  deps: Map<string, Dep[]>;
  stationNames: string[];
  // 停車駅と次の停車駅のあいだにある(通過する)駅の番号の、計算ずみの値
  between: Map<string, number[]>;
}

let netPromise: Promise<Net> | null = null;

const buildNet = async (): Promise<Net> => {
  const loaded = await Promise.all(LINE_CODES.map((code) => loadLineData(code)));
  const lines: Record<string, LineData> = {};
  const stationLines = new Map<string, { line: string; idx: number }[]>();
  const deps = new Map<string, Dep[]>();
  const stationNames: string[] = [];

  loaded.forEach((data) => {
    lines[data.code] = data;
    data.master.stations.forEach(([name], idx) => {
      const key = normalizeStationName(name);
      if (!stationLines.has(key)) {
        stationLines.set(key, []);
        stationNames.push(key);
      }
      stationLines.get(key)!.push({ line: data.code, idx });
    });
    data.trains.forEach((train, trainIdx) => {
      const stops = train[5];
      for (let k = 0; k < stops.length; k += 3) {
        const d = stops[k + 2];
        if (d === -1) continue; // 終着の駅では乗れない
        const key = `${data.code}|${stops[k]}`;
        if (!deps.has(key)) deps.set(key, []);
        deps.get(key)!.push({ dep: train[4] + d, trainIdx, pos: k });
      }
    });
  });
  deps.forEach((list) => list.sort((a, b) => a.dep - b.dep));
  return { lines, stationLines, deps, stationNames, between: new Map() };
};

const getNet = (): Promise<Net> => {
  if (!netPromise) {
    netPromise = buildNet();
    netPromise.catch(() => {
      netPromise = null; // 失敗したときは、次回やり直す
    });
  }
  return netPromise;
};

// 駅の選択肢(路線の並び順で、はじめに出てきた順。重複なし)
export const loadRouteStations = async (): Promise<string[]> => (await getNet()).stationNames;

export interface RouteStop {
  name: string;
  arrSec: number; // 遅れを加味した到着(0時からの秒数)
  schedArrSec: number; // 時刻表どおりの到着
}

export interface RouteLeg {
  lineCode: string;
  lineName: string;
  trainNo: string;
  typeAbbr: string;
  typeName: string;
  paid: boolean;
  // 行き先の表示(環状線は、行き先でなく「外回り・内回り」)
  destLabel: string;
  from: string;
  to: string;
  depSec: number; // 遅れを加味した発車
  arrSec: number;
  schedDepSec: number; // 時刻表どおりの発車
  schedArrSec: number;
  delayMin: number; // 遅れ(分)。0なら時刻表どおり
  km: number;
  // 乗ってから降りるまでに停まる駅(最後が降りる駅)
  stops: RouteStop[];
  // この列車で通った、経由駅(停車したか、通過したか)
  passedVias: { name: string; stopped: boolean }[];
}

export interface RouteResult {
  legs: RouteLeg[];
  depSec: number;
  arrSec: number;
  minutes: number;
  transfers: number;
  km: number;
  fare: number;
  hasPaid: boolean;
  delayed: boolean;
}

interface Pred {
  prev: Rec;
  line: string;
  trainIdx: number;
  boardPos: number;
  alightPos: number;
  boardStation: string;
  delaySec: number;
}
interface Rec {
  arr: number;
  station: string;
  // 通った経由駅の記録(経由駅の番号ごとのビット)
  mask: number;
  pred?: Pred;
}

interface Ctx {
  transferSec: number;
  maxLegs: number;
  allowPaid: boolean;
  realtime: boolean;
  dayStartMs: number;
  delayCache: Map<string, { min: number; suspended: boolean }>;
  // 経由駅(駅名の一覧)と、「路線|駅番号」ごとの、その駅のビット
  vias: string[];
  viaBits: Map<string, number>;
}

// 列車が、駅番号 s1 の次に、駅番号 s2 に停まるとき、そのあいだで通過する駅の番号(走る向きの順)
const passedBetween = (net: Net, line: string, dirIdx: 0 | 1, s1: number, s2: number): number[] => {
  const key = `${line}|${dirIdx}|${s1}|${s2}`;
  const hit = net.between.get(key);
  if (hit) return hit;
  const master = net.lines[line].master;
  const n = master.stations.length;
  const step = dirIdx === 0 ? 1 : -1;
  const out: number[] = [];
  if (master.loop) {
    // 環状線は、最後の駅の次が最初の駅(東京)にもどる
    for (let i = (s1 + step + n) % n; i !== s2 && out.length < n; i = (i + step + n) % n) out.push(i);
  } else {
    for (let i = s1 + step; i !== s2 && i >= 0 && i < n; i += step) out.push(i);
  }
  net.between.set(key, out);
  return out;
};

const lowerBound = (list: Dep[], sec: number): number => {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].dep < sec) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// その列車が、その駅を出るときの遅れ(運行指令があれば優先。無ければ自動の遅れ)
const delayFor = (ctx: Ctx, net: Net, line: string, trainIdx: number, station: string, schedDep: number) => {
  if (!ctx.realtime) return { min: 0, suspended: false };
  const key = `${line}|${trainIdx}|${station}`;
  const hit = ctx.delayCache.get(key);
  if (hit) return hit;
  const data = net.lines[line];
  const train = data.trains[trainIdx];
  const dirIdx = (data.master.dirs.indexOf(train[2]) === 1 ? 1 : 0) as 0 | 1;
  const r = resolveTrainDelay(line, train[0], ctx.dayStartMs, dirIdx, station, ctx.dayStartMs + schedDep * 1000, train[4]);
  const value = { min: r.delayMinutes, suspended: r.isSuspended };
  ctx.delayCache.set(key, value);
  return value;
};

// 1回ぶんの探索: readySec(0時からの秒数。24時以降は86400以上)以降に出発駅を出る、いちばん早く着く乗り方
// 経由駅があるときは、「どの駅に・どの経由駅を通った状態で」着けるかを区別して探し、すべての経由駅を通って到着駅に着くものだけを答えにする
const searchOnce = (net: Net, ctx: Ctx, from: string, to: string, readySec: number): RouteResult | null => {
  const fullMask = (1 << ctx.vias.length) - 1;
  const keyOf = (station: string, mask: number) => `${station}#${mask}`;
  const startRec: Rec = { arr: readySec, station: from, mask: 0 };
  const best = new Map<string, Rec>([[keyOf(from, 0), startRec]]);
  let marked = new Map<string, Rec>([[keyOf(from, 0), startRec]]);
  // 本数(乗った列車の数)ごとの、到着駅に着く最良の乗り方
  let goal: Rec | undefined;
  let goalScore = Infinity;

  for (let round = 1; round <= ctx.maxLegs && marked.size > 0; round++) {
    const improved = new Map<string, Rec>();
    marked.forEach((rec) => {
      const station = rec.station;
      const ready = rec.arr + (round > 1 ? ctx.transferSec : 0);
      (net.stationLines.get(station) || []).forEach(({ line, idx }) => {
        const list = net.deps.get(`${line}|${idx}`) || [];
        const data = net.lines[line];
        const start = lowerBound(list, ready - (ctx.realtime ? DELAY_LOOKBACK_SEC : 0));
        let taken = 0;
        for (let i = start; i < list.length; i++) {
          const { trainIdx, pos, dep } = list[i];
          if (taken >= MIN_BOARDINGS && dep > ready + BOARD_WINDOW_SEC) break;
          const train = data.trains[trainIdx];
          if (!ctx.allowPaid && data.master.types[train[1]][2] === 1) continue;
          const delay = delayFor(ctx, net, line, trainIdx, station, dep);
          if (delay.suspended) continue;
          const delaySec = delay.min * 60;
          if (dep + delaySec < ready) continue;
          taken++;

          const stops = train[5];
          const dirIdx = (data.master.dirs.indexOf(train[2]) === 1 ? 1 : 0) as 0 | 1;
          let mask = rec.mask;
          for (let j = pos + 3; j < stops.length; j += 3) {
            if (ctx.vias.length > 0) {
              // 通過する駅と、停まる駅で、経由駅を通ったかを調べる
              for (const passed of passedBetween(net, line, dirIdx, stops[j - 3], stops[j])) mask |= ctx.viaBits.get(`${line}|${passed}`) ?? 0;
              mask |= ctx.viaBits.get(`${line}|${stops[j]}`) ?? 0;
            }
            const name = normalizeStationName(data.master.stations[stops[j]][0]);
            const arr = train[4] + (stops[j + 1] !== -1 ? stops[j + 1] : stops[j + 2]) + delaySec;
            const key = keyOf(name, mask);
            const known = Math.min(best.get(key)?.arr ?? Infinity, improved.get(key)?.arr ?? Infinity);
            if (arr < known) {
              improved.set(key, {
                arr,
                station: name,
                mask,
                pred: { prev: rec, line, trainIdx, boardPos: pos, alightPos: j, boardStation: station, delaySec },
              });
            }
          }
        }
      });
    });
    improved.forEach((rec, key) => best.set(key, rec));
    marked = improved;

    const reached = improved.get(keyOf(to, fullMask));
    if (reached) {
      const score = reached.arr + (round - 1) * TRANSFER_PENALTY_SEC;
      if (score < goalScore) {
        goal = reached;
        goalScore = score;
      }
    }
  }

  if (!goal || !goal.pred) return null;

  // 到着から、たどって、乗った列車を順に並べる
  const preds: Pred[] = [];
  for (let r: Rec | undefined = goal; r && r.pred; r = r.pred.prev) preds.unshift(r.pred);
  const legs: RouteLeg[] = preds.map((p) => {
    const data = net.lines[p.line];
    const train = data.trains[p.trainIdx];
    const stops = train[5];
    const master = data.master;
    const type = master.types[train[1]];
    const dirIdx = (master.dirs.indexOf(train[2]) === 1 ? 1 : 0) as 0 | 1;
    const arrAt = (k: number) => train[4] + (stops[k + 1] !== -1 ? stops[k + 1] : stops[k + 2]);
    const legStops: RouteStop[] = [];
    const passedVias: { name: string; stopped: boolean }[] = [];
    const noteVia = (stationIdx: number, stopped: boolean) => {
      if (ctx.viaBits.has(`${p.line}|${stationIdx}`)) {
        const name = normalizeStationName(master.stations[stationIdx][0]);
        if (!passedVias.some((v) => v.name === name)) passedVias.push({ name, stopped });
      }
    };
    for (let k = p.boardPos + 3; k <= p.alightPos; k += 3) {
      if (ctx.vias.length > 0) passedBetween(net, p.line, dirIdx, stops[k - 3], stops[k]).forEach((i) => noteVia(i, false));
      noteVia(stops[k], true);
      legStops.push({
        name: normalizeStationName(master.stations[stops[k]][0]),
        arrSec: arrAt(k) + p.delaySec,
        schedArrSec: arrAt(k),
      });
    }
    const schedDep = train[4] + stops[p.boardPos + 2];
    return {
      lineCode: p.line,
      lineName: master.name,
      trainNo: train[0],
      typeAbbr: type[1],
      typeName: type[0],
      paid: type[2] === 1,
      destLabel: master.loop
        ? dirIdx === 0 ? '外回り' : '内回り'
        : `${normalizeStationName(master.stations[stops[stops.length - 3]][0])}行`,
      from: p.boardStation,
      to: legStops[legStops.length - 1].name,
      depSec: schedDep + p.delaySec,
      arrSec: legStops[legStops.length - 1].arrSec,
      schedDepSec: schedDep,
      schedArrSec: legStops[legStops.length - 1].schedArrSec,
      delayMin: Math.round(p.delaySec / 60),
      km: tripDistance(master, stops[p.boardPos], stops[p.alightPos], dirIdx),
      stops: legStops,
      passedVias,
    };
  });

  const km = Math.round(legs.reduce((sum, l) => sum + l.km, 0) * 10) / 10;
  return {
    legs,
    depSec: legs[0].depSec,
    arrSec: legs[legs.length - 1].arrSec,
    minutes: Math.round((legs[legs.length - 1].arrSec - legs[0].depSec) / 60),
    transfers: legs.length - 1,
    km,
    fare: calculateFare(km),
    hasPaid: legs.some((l) => l.paid),
    delayed: legs.some((l) => l.delayMin > 0),
  };
};

// 出発の時刻が属する「ダイヤの日」の始まり(0〜4時は、前日のダイヤの続きなので、前日の0時)
export const serviceDayStartMs = (readySec: number, now: Date = new Date()): number => {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d.getTime() - (readySec >= DAY ? DAY * 1000 : 0);
};

// 出発の時刻(0時からの秒数。0〜4時は、前日のダイヤの続きとして、24時台以降で渡す)以降の、早く着く順に最大 count 件
export const searchRoutes = async (
  from: string,
  to: string,
  readySec: number,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
  count = 3,
  viaStations: string[] = []
): Promise<RouteResult[]> => {
  const net = await getNet();
  const a = normalizeStationName(from);
  const b = normalizeStationName(to);
  if (!net.stationLines.has(a) || !net.stationLines.has(b) || a === b) return [];

  // 経由駅: 駅の一覧にある駅だけ。出発駅・到着駅と同じ駅、重複は、指定されなかったものとして扱う
  const vias: string[] = [];
  viaStations.forEach((v) => {
    const name = normalizeStationName(v);
    if (net.stationLines.has(name) && name !== a && name !== b && !vias.includes(name)) vias.push(name);
  });
  const viaBits = new Map<string, number>();
  vias.forEach((name, i) => (net.stationLines.get(name) || []).forEach(({ line, idx }) => viaBits.set(`${line}|${idx}`, 1 << i)));

  const ctx: Ctx = {
    transferSec: options.relaxedTransfer ? RELAXED_TRANSFER_SEC : TRANSFER_SEC,
    maxLegs: Math.min(vias.length > 0 ? MAX_LEGS_WITH_VIAS : MAX_LEGS, options.maxTransfers + 1),
    allowPaid: options.allowPaid,
    realtime: options.realtime,
    dayStartMs: serviceDayStartMs(readySec),
    delayCache: new Map(),
    vias,
    viaBits,
  };

  const results: RouteResult[] = [];
  let ready = readySec;
  for (let i = 0; i < count && ready < 2 * DAY; i++) {
    const r = searchOnce(net, ctx, a, b, ready);
    if (!r) break;
    if (!results.some((x) => x.depSec === r.depSec && x.arrSec === r.arrSec)) results.push(r);
    ready = r.depSec + 60;
  }
  return results;
};
