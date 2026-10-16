// 経路検索: 全駅ダイヤから、出発駅から到着駅までの乗り方(乗換あり)を、早く着く順に探す。
// 乗り換えは、同じ駅名で乗り継ぐ(別路線でも、同じ路線の別の列車でもよい)。最大5本の列車まで。
import { loadLineData, LineData, normalizeStationName, tripDistance, resolveTrainDelay, trainDestName } from './diaTimetable';
import { calculateFare } from './fare';
import { RouteOptions, DEFAULT_ROUTE_OPTIONS } from './routeOptions';
import { bumpForDelay, crowdDelayRate, dayTypeOf, loadAllCrowdTrains, trainMaxLevel, trainSegmentLevel } from './crowd';
import { isLaunched } from './launch';

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
// 「空いている順」: 探す候補の数と、いちばん早く着く便から、どれだけ遅れて着く候補まで入れるか(秒)
const CROWD_CANDIDATES = 8;
const CROWD_WINDOW_SEC = 45 * 60;
// 乗換の「厳しさ」: 乗り継ぎの時間が、乗換に必要な最短(TRANSFER_SEC)から、これだけ(分)以内だと「厳しい」。それより短ければ「間に合わない」
const TIGHT_EXTRA_MIN = 1;
// 自動の遅れは1〜5分。前の列車が、さらにこれだけ遅れると、余裕が足りない乗換は、失敗する
const MAX_EXTRA_DELAY_MIN = 5;
// 混雑のデータが無いときの、列車が遅れる確率(模擬)
const DEFAULT_DELAY_RATE = 0.03;
// 「遅れに強い順」: 探す候補の数(探し方ごと)と、いちばん早く着く便から、どれだけ遅れて着く候補まで入れるか(秒)
const SAFE_CANDIDATES = 6;
const SAFE_WINDOW_SEC = 40 * 60;

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
  // 直通: "路線|列車の添字"(前の部分) → 乗ったまま続く、次の路線の部分。同じ列車番号が、2つの路線にあるもの
  through: Map<string, { line: string; trainIdx: number }>;
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

  // 直通: 同じ列車番号が、2つの路線にある列車。前の部分の終着と、次の部分の始発が、同じ駅でつながるものだけ
  const byCode = new Map<string, { line: string; trainIdx: number; start: number }[]>();
  loaded.forEach((data) =>
    data.trains.forEach((train, trainIdx) => {
      if (!byCode.has(train[0])) byCode.set(train[0], []);
      byCode.get(train[0])!.push({ line: data.code, trainIdx, start: train[4] });
    })
  );
  const through = new Map<string, { line: string; trainIdx: number }>();
  byCode.forEach((parts) => {
    if (parts.length !== 2 || parts[0].line === parts[1].line) return;
    const [a, b] = [...parts].sort((x, y) => x.start - y.start);
    const sa = lines[a.line].trains[a.trainIdx][5];
    const sb = lines[b.line].trains[b.trainIdx][5];
    const lastName = normalizeStationName(lines[a.line].master.stations[sa[sa.length - 3]][0]);
    const firstName = normalizeStationName(lines[b.line].master.stations[sb[0]][0]);
    if (lastName === firstName) through.set(`${a.line}|${a.trainIdx}`, { line: b.line, trainIdx: b.trainIdx });
  });
  return { lines, stationLines, deps, stationNames, between: new Map(), through };
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
  // 前の区間から、同じ列車に乗ったまま続く(直通)。乗換に数えない
  through?: boolean;
  km: number;
  // 乗ってから降りるまでに停まる駅(最後が降りる駅)
  stops: RouteStop[];
  // この列車で通った、経由駅(停車したか、通過したか)
  passedVias: { name: string; stopped: boolean }[];
  // 乗っている区間の混雑(1〜6。いちばん混む区間。遅れて3分以上なら1つ上げる)と、区間の平均。混雑予報のデータが無いときは、なし
  crowd?: number;
  crowdAvg?: number;
}

// 乗換(前の列車を降りて、次の列車に乗る)の余裕
export interface Connection {
  station: string;
  gapMin: number; // 前の列車の到着から、次の列車の発車までの時間(分。遅れを加味)
  level: 'ok' | 'tight' | 'fail'; // 余裕あり / 厳しい / 遅れで間に合わない
  prevDelayMin: number; // 前の列車の遅れ(分)
  risk: number; // 乗換に失敗する確率の目安(0〜1)
  through?: boolean; // 直通(乗ったまま)。降りないので、失敗しない
}

export interface RouteResult {
  legs: RouteLeg[];
  connections: Connection[];
  // 乗換に1つでも失敗する確率の目安(0〜1。低いほど遅れに強い)
  risk: number;
  depSec: number;
  arrSec: number;
  minutes: number;
  transfers: number;
  km: number;
  fare: number;
  hasPaid: boolean;
  delayed: boolean;
  // いちばん混む列車の混雑と、「乗っている時間で重みをつけた」混雑の平均(並べ替えに使う)。データが無いときは、なし
  crowd?: number;
  crowdScore?: number;
}

interface Pred {
  prev: Rec;
  line: string;
  trainIdx: number;
  boardPos: number;
  alightPos: number;
  boardStation: string;
  delaySec: number;
  // 直通の列車で、続きの部分(次の路線)まで乗るとき: 続きの路線・列車と、降りる位置。このとき alightPos は、前の部分の終着
  cont?: { line: string; trainIdx: number; alightPos: number };
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
  // 遅れ・運転見合わせを、いっさい見ない(「明日」の探索。運行指令は「いま」の状態で、明日のものではないため)
  noDelay: boolean;
  dayStartMs: number;
  crowd: boolean; // 混雑のデータを使う(公開後で、読み込めたとき)
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

// その列車が、その駅を出るときの遅れ(運行指令があれば優先。無ければ自動の遅れ)。リアルタイム検索でなくても、遅れを調べる
const rawDelay = (ctx: Ctx, net: Net, line: string, trainIdx: number, station: string, schedDep: number) => {
  if (ctx.noDelay) return { min: 0, suspended: false };
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

// 探すときに使う遅れ(リアルタイム検索のときだけ)
const delayFor = (ctx: Ctx, net: Net, line: string, trainIdx: number, station: string, schedDep: number) =>
  ctx.realtime ? rawDelay(ctx, net, line, trainIdx, station, schedDep) : { min: 0, suspended: false };

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

          // 直通の列車なら、終着で降りずに、次の路線の部分にも、乗ったまま行ける(乗換に数えない。遅れは、同じ列車なので、同じ)
          const cont = net.through.get(`${line}|${trainIdx}`);
          if (cont) {
            const cData = net.lines[cont.line];
            const cTrain = cData.trains[cont.trainIdx];
            if (ctx.allowPaid || cData.master.types[cTrain[1]][2] !== 1) {
              const cStops = cTrain[5];
              const cDir = (cData.master.dirs.indexOf(cTrain[2]) === 1 ? 1 : 0) as 0 | 1;
              for (let j = 3; j < cStops.length; j += 3) {
                if (ctx.vias.length > 0) {
                  for (const passed of passedBetween(net, cont.line, cDir, cStops[j - 3], cStops[j])) mask |= ctx.viaBits.get(`${cont.line}|${passed}`) ?? 0;
                  mask |= ctx.viaBits.get(`${cont.line}|${cStops[j]}`) ?? 0;
                }
                const name = normalizeStationName(cData.master.stations[cStops[j]][0]);
                const arr = cTrain[4] + (cStops[j + 1] !== -1 ? cStops[j + 1] : cStops[j + 2]) + delaySec;
                const key = keyOf(name, mask);
                const known = Math.min(best.get(key)?.arr ?? Infinity, improved.get(key)?.arr ?? Infinity);
                if (arr < known) {
                  improved.set(key, {
                    arr,
                    station: name,
                    mask,
                    pred: {
                      prev: rec,
                      line,
                      trainIdx,
                      boardPos: pos,
                      alightPos: stops.length - 3,
                      boardStation: station,
                      delaySec,
                      cont: { line: cont.line, trainIdx: cont.trainIdx, alightPos: j },
                    },
                  });
                }
              }
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
  // 直通の列車に乗ったまま続くときは、路線ごとに、2つの区間に分けて表す(2つ目は、乗換でなく「直通」)
  type LegPred = Pred & { through?: boolean };
  const legPreds: LegPred[] = preds.flatMap((p): LegPred[] => {
    if (!p.cont) return [p];
    const aData = net.lines[p.line];
    const handover = normalizeStationName(aData.master.stations[aData.trains[p.trainIdx][5][p.alightPos]][0]);
    return [
      { ...p, cont: undefined },
      {
        prev: p.prev,
        line: p.cont.line,
        trainIdx: p.cont.trainIdx,
        boardPos: 0,
        alightPos: p.cont.alightPos,
        boardStation: handover,
        delaySec: p.delaySec,
        through: true,
      },
    ];
  });
  const legs: RouteLeg[] = legPreds.map((p) => {
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
    const destName = normalizeStationName(trainDestName(master, train));
    const schedDep = train[4] + stops[p.boardPos + 2];
    // 乗っている区間の混雑: 乗る駅から、降りる駅の1つ前の駅までの、駅を出たあとの区間
    let crowd: number | undefined;
    let crowdAvg: number | undefined;
    if (ctx.crowd) {
      const day = dayTypeOf(ctx.dayStartMs);
      const delayMin = Math.round(p.delaySec / 60);
      const levels: number[] = [];
      for (let k = p.boardPos / 3; k < p.alightPos / 3; k++) {
        const lv = trainSegmentLevel(day, p.line, train[0], k);
        if (lv !== undefined) levels.push(bumpForDelay(lv, delayMin));
      }
      if (levels.length > 0) {
        crowd = Math.max(...levels);
        crowdAvg = levels.reduce((a, b) => a + b, 0) / levels.length;
      }
    }
    return {
      lineCode: p.line,
      lineName: master.name,
      trainNo: train[0],
      typeAbbr: type[1],
      typeName: type[0],
      paid: type[2] === 1,
      // 行先は、列車全体の行先(直通の列車は、この路線の最後の駅の先)。環状線で、この路線の中で終わる列車は、「外回り・内回り」
      destLabel: master.loop && destName === normalizeStationName(master.stations[stops[stops.length - 3]][0])
        ? dirIdx === 0 ? '外回り' : '内回り'
        : `${destName}行`,
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
      crowd,
      crowdAvg,
      through: p.through,
    };
  });

  // 乗換の余裕と、失敗する確率の目安。リアルタイム検索でなくても、遅れを加味した時刻で調べる
  const day = dayTypeOf(ctx.dayStartMs);
  const minGapMin = TRANSFER_SEC / 60;
  const connections: Connection[] = [];
  for (let k = 1; k < legs.length; k++) {
    const prev = legs[k - 1];
    const next = legs[k];
    // 直通は、降りずに乗ったままなので、乗換ではない(失敗しない)
    if (next.through) {
      connections.push({
        station: next.from,
        gapMin: Math.round(((next.depSec - prev.arrSec) / 60) * 10) / 10,
        level: 'ok',
        prevDelayMin: prev.delayMin,
        risk: 0,
        through: true,
      });
      continue;
    }
    const pp = legPreds[k - 1];
    const pn = legPreds[k];
    const dPrev = rawDelay(ctx, net, pp.line, pp.trainIdx, pp.boardStation, prev.schedDepSec).min;
    const dNext = rawDelay(ctx, net, pn.line, pn.trainIdx, pn.boardStation, next.schedDepSec).min;
    const gapMin = (next.schedDepSec + dNext * 60 - (prev.schedArrSec + dPrev * 60)) / 60;
    const level: Connection['level'] = gapMin < minGapMin ? 'fail' : gapMin < minGapMin + TIGHT_EXTRA_MIN ? 'tight' : 'ok';
    // 前の列車が、さらに遅れて、余裕を使い切る確率: 遅れる確率(混んだ列車ほど高い) × 余裕を超える遅れの割合
    const lv = ctx.crowd ? trainMaxLevel(day, pp.line, prev.trainNo) : undefined;
    const rate = lv !== undefined ? crowdDelayRate(lv) : DEFAULT_DELAY_RATE;
    const short = Math.min(1, Math.max(0, (MAX_EXTRA_DELAY_MIN - (gapMin - minGapMin)) / MAX_EXTRA_DELAY_MIN));
    connections.push({
      station: next.from,
      gapMin: Math.round(gapMin * 10) / 10,
      level,
      prevDelayMin: dPrev,
      risk: level === 'fail' ? 1 : rate * short,
    });
  }
  const risk = 1 - connections.reduce((p, c) => p * (1 - c.risk), 1);

  const km = Math.round(legs.reduce((sum, l) => sum + l.km, 0) * 10) / 10;
  // 混雑の点数: 乗っている時間で重みをつけた、混雑レベルの平均(低いほど空いている)
  const crowdLegs = legs.filter((l) => l.crowdAvg !== undefined);
  const crowdScore =
    crowdLegs.length > 0
      ? crowdLegs.reduce((s, l) => s + l.crowdAvg! * (l.arrSec - l.depSec), 0) / crowdLegs.reduce((s, l) => s + (l.arrSec - l.depSec), 0)
      : undefined;
  return {
    legs,
    connections,
    risk,
    depSec: legs[0].depSec,
    arrSec: legs[legs.length - 1].arrSec,
    minutes: Math.round((legs[legs.length - 1].arrSec - legs[0].depSec) / 60),
    transfers: legs.filter((l) => !l.through).length - 1,
    km,
    fare: calculateFare(km),
    hasPaid: legs.some((l) => l.paid),
    delayed: legs.some((l) => l.delayMin > 0),
    crowd: crowdLegs.length > 0 ? Math.max(...crowdLegs.map((l) => l.crowd!)) : undefined,
    crowdScore,
  };
};

// 出発の時刻が属する「ダイヤの日」の始まり(0〜4時は、前日のダイヤの続きなので、前日の0時)
export const serviceDayStartMs = (readySec: number, now: Date = new Date()): number => {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d.getTime() - (readySec >= DAY ? DAY * 1000 : 0);
};

// 探索の準備: 駅名の確認・経由駅の整理・混雑データの読み込み・探索の設定。探せない入力(駅が無い・同じ駅)は null
// dayOverride: ダイヤの日の始まり(ms)と、遅れを見ないか、を呼び出し側が決めるとき(省略すると、いまの日・遅れを見る)
const prepare = async (
  from: string,
  to: string,
  readySec: number,
  options: RouteOptions,
  viaStations: string[],
  dayOverride?: { dayStartMs: number; noDelay: boolean }
): Promise<{ net: Net; a: string; b: string; ctx: Ctx } | null> => {
  const net = await getNet();
  const a = normalizeStationName(from);
  const b = normalizeStationName(to);
  if (!net.stationLines.has(a) || !net.stationLines.has(b) || a === b) return null;

  // 経由駅: 駅の一覧にある駅だけ。出発駅・到着駅と同じ駅、重複は、指定されなかったものとして扱う
  const vias: string[] = [];
  viaStations.forEach((v) => {
    const name = normalizeStationName(v);
    if (net.stationLines.has(name) && name !== a && name !== b && !vias.includes(name)) vias.push(name);
  });
  const viaBits = new Map<string, number>();
  vias.forEach((name, i) => (net.stationLines.get(name) || []).forEach(({ line, idx }) => viaBits.set(`${line}|${idx}`, 1 << i)));

  // 混雑予報のデータ(公開後だけ)。読み込めなければ、混雑なしで探す
  let crowd = false;
  if (isLaunched()) {
    try {
      await loadAllCrowdTrains();
      crowd = true;
    } catch {
      crowd = false;
    }
  }

  const noDelay = dayOverride?.noDelay ?? false;
  const ctx: Ctx = {
    transferSec: options.relaxedTransfer ? RELAXED_TRANSFER_SEC : TRANSFER_SEC,
    maxLegs: Math.min(vias.length > 0 ? MAX_LEGS_WITH_VIAS : MAX_LEGS, options.maxTransfers + 1),
    allowPaid: options.allowPaid,
    realtime: options.realtime && !noDelay,
    noDelay,
    dayStartMs: dayOverride?.dayStartMs ?? serviceDayStartMs(readySec),
    crowd,
    delayCache: new Map(),
    vias,
    viaBits,
  };
  return { net, a, b, ctx };
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
  const prepared = await prepare(from, to, readySec, options, viaStations);
  if (!prepared) return [];
  const { net, a, b, ctx } = prepared;

  // 出発の時刻から、早く着く順に、n 件ぶん探す(同じ出発・到着は、1件にまとめる)
  const collect = (c: Ctx, n: number): RouteResult[] => {
    const out: RouteResult[] = [];
    let ready = readySec;
    for (let i = 0; i < n && ready < 2 * DAY; i++) {
      const r = searchOnce(net, c, a, b, ready);
      if (!r) break;
      if (!out.some((x) => x.depSec === r.depSec && x.arrSec === r.arrSec)) out.push(r);
      ready = r.depSec + 60;
    }
    return out;
  };

  // 遅れに強い順のときは、探し方を変えて(標準の乗換・ゆったりの乗換・乗換なし)候補を集め、
  // いちばん早く着く便から SAFE_WINDOW_SEC 以内のものを、乗換に失敗する確率の低い順(同じなら、早く着く順)に選ぶ
  if (options.sortBy === 'safe') {
    const variants: Ctx[] = [ctx];
    if (ctx.transferSec < RELAXED_TRANSFER_SEC) variants.push({ ...ctx, transferSec: RELAXED_TRANSFER_SEC });
    if (ctx.maxLegs > 1) variants.push({ ...ctx, maxLegs: 1 });
    const pool: RouteResult[] = [];
    variants.forEach((c) => {
      collect(c, SAFE_CANDIDATES).forEach((r) => {
        if (!pool.some((x) => x.depSec === r.depSec && x.arrSec === r.arrSec)) pool.push(r);
      });
    });
    if (pool.length === 0) return [];
    const earliest = Math.min(...pool.map((r) => r.arrSec));
    return pool
      .filter((r) => r.arrSec <= earliest + SAFE_WINDOW_SEC)
      .sort((x, y) => Math.round(x.risk * 1000) - Math.round(y.risk * 1000) || x.arrSec - y.arrSec)
      .slice(0, count);
  }

  // 空いている順のときは、早く着く便を多めに探して、そのなかから、混雑の低い順に選ぶ
  const byCrowd = ctx.crowd && options.sortBy === 'crowd';
  const results = collect(ctx, byCrowd ? CROWD_CANDIDATES : count);
  if (!byCrowd || results.length === 0) return results.slice(0, count);
  // いちばん早く着く便から、CROWD_WINDOW_SEC 以内に着くものだけを、混雑の点数の低い順(同じなら、早く着く順)に並べる
  const earliest = Math.min(...results.map((r) => r.arrSec));
  return results
    .filter((r) => r.arrSec <= earliest + CROWD_WINDOW_SEC)
    .sort((x, y) => (x.crowdScore ?? 99) - (y.crowdScore ?? 99) || x.arrSec - y.arrSec)
    .slice(0, count);
};

// 到着の締め切りに間に合う乗り方を、出発の早い順に、すべて集める(到着時刻からの逆算に使う)
//  - fromSec 以降の出発を、1分ずつ進めて探し、到着が untilArrSec を超えたら、止める(最大 maxCandidates 件)
//  - serviceDayStartMs: 使うダイヤの日の始まり(ms)。withDelays が false のときは、遅れ・運転見合わせを、いっさい見ない(時刻表どおり)
export const searchRoutesInWindow = async (p: {
  from: string;
  to: string;
  fromSec: number;
  untilArrSec: number;
  serviceDayStartMs: number;
  withDelays: boolean;
  options?: RouteOptions;
  viaStations?: string[];
  maxCandidates?: number;
}): Promise<RouteResult[]> => {
  const prepared = await prepare(p.from, p.to, p.fromSec, p.options ?? DEFAULT_ROUTE_OPTIONS, p.viaStations ?? [], {
    dayStartMs: p.serviceDayStartMs,
    noDelay: !p.withDelays,
  });
  if (!prepared) return [];
  const { net, a, b, ctx } = prepared;
  const out: RouteResult[] = [];
  let ready = p.fromSec;
  for (let i = 0; i < (p.maxCandidates ?? 60) && ready < 2 * DAY; i++) {
    const r = searchOnce(net, ctx, a, b, ready);
    if (!r || r.arrSec > p.untilArrSec) break;
    if (!out.some((x) => x.depSec === r.depSec && x.arrSec === r.arrSec)) out.push(r);
    ready = r.depSec + 60;
  }
  return out;
};
