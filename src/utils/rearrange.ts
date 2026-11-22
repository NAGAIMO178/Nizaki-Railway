// 運転整理(遅れ・区間運休が出たときに、行き先の変更や駅での待機で、遅れを減らす案を出す計算)。
// 画面も通信も、持たない。ダイヤ(dia-2 の *_trains.json / master / 配線)と、出来事(遅れ・区間運休)から、整理案と、変更の記録(ログ)を作る。
// 最初は高宮線(TK)だけで確かめる。作りは、路線に依らない(別の路線のダイヤも、同じ形で入れられる)。
//
// 考え方
//  1. 全列車を、通過駅も含めた全駅の時刻に広げる(通過駅は、前後の停車駅から距離で割って出す)。
//  2. 時刻は、次の決まりを守りながら、遅れを伝えていく(遅れが増える方向だけに動かすので、必ず収まる)。
//     - 時刻表より早くは走らない。駅間の余裕(5%)と、停車時間のうち 30秒を超える分は、遅れを取り戻すのに使える。
//     - 同じ駅で、前の列車から 2分(時刻表の間隔がそれより短ければ、その間隔)あける。追い越しは、待避線のある駅だけ。
//     - 折り返しは、前の列車が着いてから、折返し時間(時刻表の間隔がそれより短ければ、その間隔)あとに出る。
//  3. 遅れの合計を点数にして、「待避」「折返し」「運休」の候補を1つずつ試し、点数の下がり方が大きい順に採る。
//  4. 区間運休は、止まる区間に入る列車を、手前の停車駅で打ち切り、その編成を、その駅から折り返させる(折返し運転)。
import type { TrainRow } from './diaTimetable';

// ---------- 型 ----------
export type Dir = 'D' | 'U';

export interface Node {
  st: number; // 駅番号(master の stations の添字)
  stop: boolean; // 停車するか(false = 通過。時刻は、距離で割った見積もり)
  sa: number; // 時刻表の着(秒)
  sd: number; // 時刻表の発(秒)。通過駅は、sa と同じ
}

export interface Train {
  no: string; // 列車番号
  type: number;
  typeName: string;
  paid: boolean;
  dir: Dir;
  set: string; // 運用番号(編成)
  opNo: string; // 運行番号
  nodes: Node[];
  origin: string; // 列車全体の始発・行先(直通は路線をまたぐ。この路線の分は nodes)
  dest: string;
}

export interface RearrangeData {
  stations: { name: string; km: number }[];
  trains: Train[];
  sidings: number[]; // 待避ができる駅(2面4線・2面6線)
  turnStations: number[]; // 折り返せる駅(頭端式・折返し線のある駅・緩急接続の2面4線②)
  turnSec: number; // 折り返しの最短時間(秒)
  typeSpeed: number[]; // 種別ごとの速さの目安(大きいほど速い)
}

export type Action =
  | { kind: 'pass'; slow: string; fast: string; at: number } // 駅 at で、遅い列車 slow が、速い列車 fast を待避させる
  | { kind: 'hold'; train: string; at: number; sec: number } // 駅 at で、列車を sec 秒、待機させる
  | { kind: 'turn'; train: string; at: number } // 列車を、駅 at で打ち切り(行き先の変更)、編成をそこから折り返させる
  | { kind: 'cancel'; train: string }; // 列車を、運休にする

export type RearrangeEvent =
  | { kind: 'delay'; train: string; at: number; sec: number } // 列車 train が、駅 at で sec 秒、遅れた
  | { kind: 'suspend'; from: number; to: number; startSec: number; endSec: number } // 駅 from〜to の間が、startSec〜endSec のあいだ、止まる(from < to)
  | { kind: 'cancel'; train: string }; // この列車は、運休(運行乱れの設定で、運休と決まった列車)

/** 出来事は、1件でも、何件でも渡せる(遅れ・区間運休・運休を、いっぺんに) */
export type EventInput = RearrangeEvent | RearrangeEvent[];
const asList = (e: EventInput): RearrangeEvent[] => (Array.isArray(e) ? e : [e]);

/** 変更の記録の1行。画面は、これを読んで描く(行き先の変更・運休・待避・待機・遅れ)。 */
export type ChangeRecord =
  | { kind: 'cancel'; train: string; reason: string }
  | { kind: 'truncateEnd'; train: string; stationFrom: string; stationTo: string; reason: string } // 行先が、stationFrom から stationTo に変わる
  | { kind: 'truncateStart'; train: string; stationFrom: string; stationTo: string; reason: string } // 始発が、stationFrom から stationTo に変わる
  | { kind: 'passWait'; slow: string; fast: string; station: string; reason: string }
  | { kind: 'hold'; train: string; station: string; sec: number; reason: string }
  | { kind: 'delay'; train: string; terminalDelaySec: number; maxDelaySec: number };

export interface Summary {
  totalDelayMin: number; // 終点での遅れの合計(分)
  maxDelayMin: number;
  delayedTrains: number; // 終点で 3分以上遅れる列車の数
  cancelledTrains: number;
  truncatedTrains: number;
  score: number;
}

export interface Proposal {
  id: string;
  title: string;
  actions: Action[];
  changes: ChangeRecord[];
  before: Summary;
  after: Summary;
  gain: number; // 点数の下がり方(大きいほどよい)
}

export interface RearrangeResult {
  events: RearrangeEvent[];
  base: Summary; // 何もしなかったときの見込み
  forced: Summary; // 区間運休では、止まる列車の打ち切りだけをしたときの見込み(遅れのときは base と同じ)
  proposals: Proposal[]; // おすすめの順。先頭から順に重ねて採ってよい形(それぞれ、前の案を採ったあとの点数)
  baseChanges: ChangeRecord[]; // 区間運休で、必ず起きる変更(打ち切り・運休)
  delays: ChangeRecord[]; // 最終の案を採ったあとの、遅れの見込み
}

// ---------- 決まりの数字 ----------
export const FOLLOW_SEC = 120; // 同じ駅での、前の列車との最短の間隔
export const SIDE_SEC = 60; // 待避線に入るのと、通過のあいだの、最短の間隔
export const MIN_DWELL_SEC = 30; // 停車時間の下限
export const RUN_MARGIN = 0.05; // 駅間の余裕(ダイヤを作るときの余裕と同じ)
const CANCEL_COST = 40; // 運休1本の重さ(遅れ何分ぶんか)
const TRUNCATE_COST = 20; // 行き先の変更(打ち切り)1本の重さ
const ACTION_COST = 1; // 待避・待機1回の重さ
const MIN_GAIN = 3; // 案にするための、点数の下がり方の下限

// ---------- データの読み込み ----------
type MasterLine = { stations: [string, number][]; types: [string, string, number][]; dirs?: [string, string] };
type WiringEntry = { 配線: string; 折返し線: number };

/** *_trains.json の行(TrainRow)から、列車を作る。stations は master の stations。 */
export const buildData = (
  rows: TrainRow[],
  master: MasterLine,
  wiring: Record<string, WiringEntry>,
  turnSec = 360
): RearrangeData => {
  const stations = master.stations.map(([name, km]) => ({ name, km }));
  const trains: Train[] = rows.map((r) => {
    const [no, type, dir, set, t0, flat, opNo, dest, origin] = r;
    const stops: { st: number; a: number | null; d: number | null }[] = [];
    for (let k = 0; k < flat.length; k += 3) {
      stops.push({ st: flat[k], a: flat[k + 1] >= 0 ? t0 + flat[k + 1] : null, d: flat[k + 2] >= 0 ? t0 + flat[k + 2] : null });
    }
    const nodes: Node[] = [];
    stops.forEach((s, i) => {
      const sa = s.a ?? (s.d as number);
      const sd = s.d ?? (s.a as number);
      nodes.push({ st: s.st, stop: true, sa, sd });
      const nx = stops[i + 1];
      if (!nx) return;
      // 次の停車駅までの通過駅は、距離で割って時刻を出す
      const step = nx.st > s.st ? 1 : -1;
      const km0 = stations[s.st].km;
      const total = Math.abs(stations[nx.st].km - km0);
      const arrNext = nx.a ?? (nx.d as number);
      for (let q = s.st + step; q !== nx.st; q += step) {
        const frac = total > 0 ? Math.abs(stations[q].km - km0) / total : 0;
        const t = Math.round(sd + (arrNext - sd) * frac);
        nodes.push({ st: q, stop: false, sa: t, sd: t });
      }
    });
    const typeInfo = master.types[type] ?? ['', '', 0];
    return {
      no, type, typeName: typeInfo[0], paid: typeInfo[2] === 1, dir: dir as Dir, set, opNo: opNo ?? '', nodes,
      origin: origin ?? stations[nodes[0].st].name, dest: dest ?? stations[nodes[nodes.length - 1].st].name,
    };
  });
  const sidings: number[] = [];
  const turnStations: number[] = [];
  stations.forEach((s, i) => {
    const w = wiring[s.name];
    if (!w) return;
    if (/2面4線|2面6線/.test(w.配線)) sidings.push(i);
    if (/頭端式/.test(w.配線) || w.折返し線 > 0 || /②/.test(w.配線)) turnStations.push(i);
  });
  // 種別の速さ: 全線を走る列車の、所要時間の逆数(キロ÷時間)
  const speedSum = new Map<number, { km: number; sec: number }>();
  for (const t of trains) {
    const a = t.nodes[0];
    const b = t.nodes[t.nodes.length - 1];
    const km = Math.abs(stations[b.st].km - stations[a.st].km);
    const sec = b.sa - a.sd;
    if (sec <= 0) continue;
    const cur = speedSum.get(t.type) ?? { km: 0, sec: 0 };
    speedSum.set(t.type, { km: cur.km + km, sec: cur.sec + sec });
  }
  const typeSpeed = master.types.map((_, i) => {
    const v = speedSum.get(i);
    return v ? (v.km / v.sec) * 3600 : 0;
  });
  return { stations, trains, sidings, turnStations, turnSec, typeSpeed };
};

// ---------- 編成のつながり ----------
type Chain = { set: string; nos: string[] }[]; // 運用番号ごとの、時刻順の列車番号

const chainsOf = (trains: Train[]): Chain => {
  const bySet = new Map<string, Train[]>();
  for (const t of trains) {
    if (!bySet.has(t.set)) bySet.set(t.set, []);
    bySet.get(t.set)!.push(t);
  }
  return [...bySet.entries()].map(([set, ts]) => ({ set, nos: ts.sort((a, b) => a.nodes[0].sd - b.nodes[0].sd).map((t) => t.no) }));
};

// ---------- 変更の適用(打ち切り・運休・折り返し) ----------
export interface Working {
  trains: Train[]; // 変更後の列車(運休は、含まない)
  removed: Set<string>;
  changes: ChangeRecord[];
}

const cutEnd = (t: Train, at: number): Train | null => {
  const idx = t.nodes.findIndex((n, i) => n.st === at && n.stop && i > 0);
  if (idx < 1) return null;
  const nodes = t.nodes.slice(0, idx + 1).map((n, i, a) => (i === a.length - 1 ? { ...n, sd: n.sa } : n));
  return { ...t, nodes };
};

const cutStart = (t: Train, at: number): Train | null => {
  const idx = t.nodes.findIndex((n, i) => n.st === at && n.stop && i < t.nodes.length - 1);
  if (idx < 0) return null;
  const nodes = t.nodes.slice(idx).map((n, i) => (i === 0 ? { ...n, sa: n.sd } : n));
  return { ...t, nodes };
};

/**
 * 運休・打ち切り・区間運休を、列車に当てる。編成ごとに、時刻順に見ていき、前の列車が終わる駅から、次の列車が始まるように切り直す
 * (始発の駅に、編成がいないときは、そこから走れるところだけ残す。走れなければ、運休)。
 * 元のダイヤで、前の列車の終点と次の列車の始発が違う編成(間に回送がある)は、つなぎ直さない。
 */
export const applyChanges = (data: RearrangeData, actions: Action[], event: EventInput = []): Working => {
  const events = asList(event);
  const name = (st: number) => data.stations[st].name;
  const byNo = new Map(data.trains.map((t) => [t.no, t]));
  const removed = new Set<string>();
  const changes: ChangeRecord[] = [];
  const turns = new Map<string, number>();
  const cancels = new Set<string>();
  const forced = new Set<string>(); // 運行乱れの設定で、運休と決まった列車
  for (const a of actions) {
    if (a.kind === 'turn') turns.set(a.train, a.at);
    if (a.kind === 'cancel') cancels.add(a.train);
  }
  for (const ev of events) if (ev.kind === 'cancel') forced.add(ev.train);
  const out = new Map<string, Train>();
  for (const { nos } of chainsOf(data.trains)) {
    let pos: number | null = null; // 編成がいま、いる駅
    let prevOrigTerm: number | null = null;
    for (const no of nos) {
      const orig = byNo.get(no)!;
      const origStart = orig.nodes[0].st;
      const origEnd = orig.nodes[orig.nodes.length - 1].st;
      let t: Train | null = orig;
      let reason = '';
      // 元のダイヤで、前の列車と続いている編成だけ、つなぎ直す
      if (pos !== null && prevOrigTerm === origStart && pos !== origStart) {
        const cut = cutStart(t, pos);
        if (cut) {
          changes.push({ kind: 'truncateStart', train: no, stationFrom: name(origStart), stationTo: name(pos), reason: '編成が、その駅から折り返すため' });
          t = cut;
        } else {
          t = null;
          reason = '編成が、始発駅にいないため';
        }
      }
      if (t && forced.has(no)) {
        t = null;
        reason = '運休(運行乱れの設定)';
      } else if (t && cancels.has(no)) {
        t = null;
        reason = '運休(整理案)';
      }
      if (t && turns.has(no)) {
        const cut = cutEnd(t, turns.get(no)!);
        if (cut) {
          changes.push({ kind: 'truncateEnd', train: no, stationFrom: orig.dest, stationTo: name(turns.get(no)!), reason: '行き先の変更(整理案)' });
          t = cut;
        }
      }
      for (const ev of events) {
        if (!t || ev.kind !== 'suspend') continue;
        const cut = cutForSuspension(t, ev);
        if (cut === null) {
          t = null;
          reason = '区間運休のため';
        } else if (cut !== t) {
          changes.push({ kind: 'truncateEnd', train: no, stationFrom: orig.dest, stationTo: name(cut.nodes[cut.nodes.length - 1].st), reason: '区間運休のため、手前の駅まで' });
          t = cut;
        }
      }
      prevOrigTerm = origEnd;
      if (!t) {
        removed.add(no);
        changes.push({ kind: 'cancel', train: no, reason });
      } else {
        out.set(no, t);
        pos = t.nodes[t.nodes.length - 1].st;
      }
    }
  }
  return { trains: data.trains.filter((t) => out.has(t.no)).map((t) => out.get(t.no)!), removed, changes };
};

/** 区間運休に入る前に、打ち切る。入らない列車は、そのまま返す。止まる区間に入る前に、停車駅がなければ null(運休)。 */
const cutForSuspension = (t: Train, ev: Extract<RearrangeEvent, { kind: 'suspend' }>): Train | null | Train => {
  // 区間 [from, to] の中の駅間を、時間帯のあいだに通る列車か
  const inClosure = (a: Node, b: Node) => {
    const lo = Math.min(a.st, b.st);
    const hi = Math.max(a.st, b.st);
    return lo >= ev.from && hi <= ev.to && hi > lo;
  };
  // 入る瞬間は、区間の境の駅の発
  for (let i = 0; i < t.nodes.length - 1; i++) {
    const a = t.nodes[i];
    const b = t.nodes[i + 1];
    if (!inClosure(a, b)) continue;
    if (a.sd < ev.startSec || a.sd >= ev.endSec) continue;
    // 手前で、最後に停まる駅まで戻って、そこで打ち切る
    for (let k = i; k >= 1; k--) if (t.nodes[k].stop) return cutEnd(t, t.nodes[k].st);
    return null;
  }
  return t;
};

// ---------- 時刻の計算 ----------
interface Sim {
  trains: Train[];
  A: number[][]; // 実際の着
  D: number[][]; // 実際の発
  iterations: number;
}

type Pred = { ti: number; j: number; gap: number } | null;

const simulate = (data: RearrangeData, work: Working, actions: Action[], event: EventInput = []): Sim => {
  const delays = asList(event).filter((e): e is Extract<RearrangeEvent, { kind: 'delay' }> => e.kind === 'delay');
  const trains = work.trains;
  const idx = new Map(trains.map((t, i) => [t.no, i]));
  const nodeAt = (ti: number, st: number) => trains[ti].nodes.findIndex((n) => n.st === st);
  // 駅・向きごとの、通る順(時刻表の発の順)
  type Ent = { ti: number; j: number; key: number; moved: boolean };
  const lists = new Map<string, Ent[]>();
  trains.forEach((t, ti) =>
    t.nodes.forEach((n, j) => {
      const k = `${t.dir}:${n.st}`;
      if (!lists.has(k)) lists.set(k, []);
      lists.get(k)!.push({ ti, j, key: n.sd, moved: false });
    })
  );
  // 待避の案: その駅から先で、速い列車が先になるようにする
  const passes = actions.filter((a): a is Extract<Action, { kind: 'pass' }> => a.kind === 'pass');
  for (const p of passes) {
    const si = idx.get(p.slow);
    const fi = idx.get(p.fast);
    if (si === undefined || fi === undefined) continue;
    const dirSign = trains[si].dir === 'D' ? 1 : -1;
    for (const [k, ents] of lists) {
      const st = Number(k.split(':')[1]);
      if (k.split(':')[0] !== trains[si].dir || (st - p.at) * dirSign < 0) continue;
      const s = ents.find((e) => e.ti === si);
      const f = ents.find((e) => e.ti === fi);
      if (s && f && s.key <= f.key) {
        s.key = f.key + 1;
        s.moved = true;
      }
    }
  }
  const pred: Pred[][] = trains.map((t) => t.nodes.map(() => null));
  const rank = new Map<string, Map<number, number>>();
  for (const [k, ents] of lists) {
    ents.sort((a, b) => a.key - b.key || a.ti - b.ti);
    const rm = new Map<number, number>();
    ents.forEach((e, i) => {
      rm.set(e.ti, i);
      if (i > 0) {
        const p = ents[i - 1];
        const gap = e.moved || p.moved ? SIDE_SEC : Math.max(0, Math.min(FOLLOW_SEC, e.key - p.key));
        pred[e.ti][e.j] = { ti: p.ti, j: p.j, gap };
      }
    });
    rank.set(k, rm);
  }
  // 時刻表の上で、追い越しをしている駅(前の駅では先だった列車が、後ろになる): 追い越される側が着いてから、追い越す側が通る
  const overtake: { fast: number; slow: number; st: number }[] = [];
  trains.forEach((t, ti) =>
    t.nodes.forEach((n, j) => {
      if (j === 0) return;
      const p = pred[ti][j];
      if (!p) return;
      const prevSt = t.nodes[j - 1].st;
      const rp = rank.get(`${t.dir}:${prevSt}`);
      if (!rp) return;
      const a = rp.get(ti);
      const b = rp.get(p.ti);
      if (a !== undefined && b !== undefined && a < b) overtake.push({ fast: p.ti, slow: ti, st: n.st });
    })
  );
  for (const p of passes) {
    const si = idx.get(p.slow);
    const fi = idx.get(p.fast);
    if (si !== undefined && fi !== undefined && nodeAt(si, p.at) >= 0 && nodeAt(fi, p.at) >= 0) overtake.push({ fast: fi, slow: si, st: p.at });
  }
  // 編成のつながり
  const prevInSet = new Map<number, number>();
  for (const { nos } of chainsOf(trains)) {
    for (let i = 1; i < nos.length; i++) {
      const a = idx.get(nos[i - 1]);
      const b = idx.get(nos[i]);
      if (a !== undefined && b !== undefined) prevInSet.set(b, a);
    }
  }
  const A = trains.map((t) => t.nodes.map((n) => n.sa));
  const D = trains.map((t) => t.nodes.map((n) => n.sd));
  const holds = actions.filter((a): a is Extract<Action, { kind: 'hold' }> => a.kind === 'hold');
  const order = trains.map((_, i) => i).sort((a, b) => trains[a].nodes[0].sd - trains[b].nodes[0].sd);
  let iterations = 0;
  for (let it = 0; it < 400; it++) {
    iterations = it + 1;
    let changed = false;
    for (const ti of order) {
      const t = trains[ti];
      const last = t.nodes.length - 1;
      for (let j = 0; j <= last; j++) {
        const n = t.nodes[j];
        let a = n.sa;
        if (j > 0) {
          const prev = t.nodes[j - 1];
          const run = n.sa - prev.sd;
          const rec = Math.min(Math.max(0, D[ti][j - 1] - prev.sd), Math.floor((run * RUN_MARGIN) / (1 + RUN_MARGIN)));
          a = Math.max(n.sa, D[ti][j - 1] + run - rec);
        } else {
          const ps = prevInSet.get(ti);
          if (ps !== undefined) {
            const pl = trains[ps].nodes.length - 1;
            const gap = Math.min(data.turnSec, Math.max(0, n.sd - trains[ps].nodes[pl].sa));
            a = Math.max(a, A[ps][pl] + gap);
          }
        }
        let d = j === last ? a : n.stop ? Math.max(n.sd, a + Math.min(MIN_DWELL_SEC, Math.max(0, n.sd - n.sa))) : Math.max(n.sd, a);
        if (j === 0) d = Math.max(d, a, n.sd);
        for (const ev of delays) {
          if (ev.train !== t.no || ev.at !== n.st) continue;
          d = Math.max(d, n.sd + ev.sec);
          if (j === last) a = Math.max(a, n.sa + ev.sec);
        }
        for (const h of holds) if (h.train === t.no && h.at === n.st) d = Math.max(d, a + h.sec);
        const p = pred[ti][j];
        if (p && j !== last) d = Math.max(d, D[p.ti][p.j] + p.gap);
        if (p && j === last) a = Math.max(a, D[p.ti][p.j] + p.gap - 0);
        for (const o of overtake) {
          if (o.st !== n.st) continue;
          if (o.fast === ti) {
            const sj = nodeAt(o.slow, n.st);
            if (sj >= 0) d = Math.max(d, A[o.slow][sj] + SIDE_SEC);
          }
        }
        if (j === last) d = a;
        if (a !== A[ti][j] || d !== D[ti][j]) {
          A[ti][j] = Math.max(a, A[ti][j]);
          D[ti][j] = Math.max(d, D[ti][j], A[ti][j]);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return { trains, A, D, iterations };
};

// ---------- 点数 ----------
const summarize = (sim: Sim, work: Working, actions: Action[]): Summary => {
  let total = 0;
  let max = 0;
  let delayed = 0;
  sim.trains.forEach((t, i) => {
    const last = t.nodes.length - 1;
    const d = Math.max(0, sim.A[i][last] - t.nodes[last].sa);
    const m = Math.ceil(d / 60);
    total += m;
    max = Math.max(max, m);
    if (d >= 180) delayed++;
  });
  const cancelled = work.changes.filter((c) => c.kind === 'cancel').length;
  const truncated = work.changes.filter((c) => c.kind === 'truncateEnd' || c.kind === 'truncateStart').length;
  const manual = actions.filter((a) => a.kind === 'pass' || a.kind === 'hold').length;
  return {
    totalDelayMin: total,
    maxDelayMin: max,
    delayedTrains: delayed,
    cancelledTrains: cancelled,
    truncatedTrains: truncated,
    score: total + cancelled * CANCEL_COST + truncated * TRUNCATE_COST + manual * ACTION_COST,
  };
};

const evaluate = (data: RearrangeData, actions: Action[], event: EventInput) => {
  const work = applyChanges(data, actions, event);
  const sim = simulate(data, work, actions, event);
  return { work, sim, sum: summarize(sim, work, actions) };
};

/** 実際の遅れの見込みを、記録の形で返す(3分以上遅れる列車だけ) */
const delayRecords = (sim: Sim): ChangeRecord[] => {
  const out: ChangeRecord[] = [];
  sim.trains.forEach((t, i) => {
    const last = t.nodes.length - 1;
    const term = Math.max(0, sim.A[i][last] - t.nodes[last].sa);
    let mx = 0;
    t.nodes.forEach((n, j) => {
      mx = Math.max(mx, sim.D[i][j] - n.sd, sim.A[i][j] - n.sa);
    });
    if (mx >= 180) out.push({ kind: 'delay', train: t.no, terminalDelaySec: term, maxDelaySec: mx });
  });
  return out;
};

// ---------- 案を出す ----------
const describe = (data: RearrangeData, a: Action): string => {
  const byNo = new Map(data.trains.map((t) => [t.no, t]));
  const nm = (no: string) => {
    const t = byNo.get(no);
    return t ? `${t.opNo || no}(${t.typeName}・${t.origin}発${t.dest}行き)` : no;
  };
  const st = (i: number) => data.stations[i].name;
  switch (a.kind) {
    case 'pass': return `${st(a.at)}で、${nm(a.slow)}が、${nm(a.fast)}を待避させる`;
    case 'hold': return `${st(a.at)}で、${nm(a.train)}を、${Math.round(a.sec / 60)}分待機させる`;
    case 'turn': return `${nm(a.train)}を、${st(a.at)}止まりにして、折り返させる`;
    case 'cancel': return `${nm(a.train)}を、運休にする`;
  }
};

const changeOf = (data: RearrangeData, a: Action): ChangeRecord | null => {
  const st = (i: number) => data.stations[i].name;
  if (a.kind === 'pass') return { kind: 'passWait', slow: a.slow, fast: a.fast, station: st(a.at), reason: '遅れた列車を待避線に入れ、後ろの速い列車を先に通すため' };
  if (a.kind === 'hold') return { kind: 'hold', train: a.train, station: st(a.at), sec: a.sec, reason: '間隔をあけるため' };
  return null;
};

/** 候補を作る: 遅れている列車の組み合わせから、待避・折返し・運休を挙げる */
const candidates = (data: RearrangeData, cur: ReturnType<typeof evaluate>, taken: Action[]): Action[] => {
  const { sim, work } = cur;
  const out: Action[] = [];
  const trains = sim.trains;
  const delayOf = (i: number) => Math.max(0, sim.A[i][trains[i].nodes.length - 1] - trains[i].nodes[trains[i].nodes.length - 1].sa);
  const hurt = trains.map((_, i) => i).filter((i) => delayOf(i) >= 180).sort((a, b) => delayOf(b) - delayOf(a)).slice(0, 12);
  const has = (a: Action) => taken.some((x) => JSON.stringify(x) === JSON.stringify(a));
  const chain = chainsOf(work.trains);
  const nextOf = new Map<string, string>();
  for (const c of chain) for (let i = 1; i < c.nos.length; i++) nextOf.set(c.nos[i - 1], c.nos[i]);
  // 待避: 遅れている列車(slow)の、すぐ後ろを走って、遅れが伝わってきた速い列車(fast)
  for (const fi of hurt) {
    const f = trains[fi];
    for (let si = 0; si < trains.length; si++) {
      const s = trains[si];
      if (si === fi || s.dir !== f.dir) continue;
      if (data.typeSpeed[f.type] <= data.typeSpeed[s.type]) continue; // 速い列車が、遅い列車を待避させる
      // 時間が重なる列車だけ
      const s0 = s.nodes[0].sd, s1 = s.nodes[s.nodes.length - 1].sa;
      const f0 = f.nodes[0].sd, f1 = f.nodes[f.nodes.length - 1].sa;
      if (s1 < f0 || f1 < s0) continue;
      // 遅い列車が、先を走っている(遅れで追いつかれる)ときだけ
      const sj = s.nodes.findIndex((n) => f.nodes.some((m) => m.st === n.st && m.sd > n.sd));
      if (sj < 0) continue;
      for (const at of data.sidings) {
        if (!s.nodes.some((n) => n.st === at) || !f.nodes.some((n) => n.st === at)) continue;
        const a: Action = { kind: 'pass', slow: s.no, fast: f.no, at };
        if (!has(a)) out.push(a);
      }
    }
  }
  // 折返し・運休: 遅れた列車
  for (const i of hurt) {
    const t = trains[i];
    for (const at of data.turnStations) {
      if (t.nodes.some((n, j) => n.st === at && n.stop && j > 0 && j < t.nodes.length - 1)) out.push({ kind: 'turn', train: t.no, at });
    }
    if (delayOf(i) >= 600) out.push({ kind: 'cancel', train: t.no });
  }
  return out;
};

const keyOf = (a: Action) => JSON.stringify(a);

/** 出来事から、整理案を出す(おすすめの順) */
export const rearrange = (data: RearrangeData, input: EventInput, opts: { maxProposals?: number } = {}): RearrangeResult => {
  const event = asList(input);
  const max = opts.maxProposals ?? 3;
  const baseEval = evaluate(data, [], event);
  const taken: Action[] = [];
  const proposals: Proposal[] = [];
  let cur = baseEval;
  for (let round = 0; round < max; round++) {
    let best: { a: Action; e: ReturnType<typeof evaluate>; gain: number } | null = null;
    const seen = new Set<string>();
    for (const a of candidates(data, cur, taken)) {
      const k = keyOf(a);
      if (seen.has(k)) continue;
      seen.add(k);
      const e = evaluate(data, [...taken, a], event);
      const gain = cur.sum.score - e.sum.score;
      if (!best || gain > best.gain) best = { a, e, gain };
    }
    if (!best || best.gain < MIN_GAIN) break;
    taken.push(best.a);
    const ch = changeOf(data, best.a);
    const changes = [...best.e.work.changes.filter((c) => !cur.work.changes.some((o) => JSON.stringify(o) === JSON.stringify(c))), ...(ch ? [ch] : [])];
    proposals.push({
      id: `p${round + 1}`,
      title: describe(data, best.a),
      actions: [...taken],
      changes,
      before: cur.sum,
      after: best.e.sum,
      gain: best.gain,
    });
    cur = best.e;
  }
  return {
    events: event,
    base: baseEval.sum,
    forced: baseEval.sum,
    proposals,
    baseChanges: baseEval.work.changes,
    delays: delayRecords(cur.sim),
  };
};

/** ログ1件(保存する形)。画面は、これだけを読んで、変更を描ける。 */
export interface RearrangeLog {
  id: string;
  line: string;
  at: string; // 作った日時(ISO)
  events: RearrangeEvent[];
  chosen: string[]; // 採った案の id
  actions: Action[];
  changes: ChangeRecord[]; // 区間運休で必ず起きる変更 + 採った案の変更 + 遅れの見込み
  before: Summary;
  after: Summary;
}

export const makeLog = (line: string, result: RearrangeResult, chosenCount: number, now = new Date()): RearrangeLog => {
  const chosen = result.proposals.slice(0, chosenCount);
  const last = chosen[chosenCount - 1];
  return {
    id: `${line}-${now.getTime()}`,
    line,
    at: now.toISOString(),
    events: result.events,
    chosen: chosen.map((p) => p.id),
    actions: last ? last.actions : [],
    changes: [...result.baseChanges, ...chosen.flatMap((p) => p.changes), ...result.delays],
    before: result.base,
    after: last ? last.after : result.base,
  };
};

// ---------- 直したあとのダイヤ(画面は、これを読む) ----------
export interface FixedNode {
  st: number;
  stop: boolean;
  arr: number; // 見込みの着(秒)
  dep: number; // 見込みの発(秒)
  schedArr: number; // 時刻表の着
  schedDep: number; // 時刻表の発
}

export interface FixedTrain {
  no: string;
  type: number;
  typeName: string;
  dir: Dir;
  set: string;
  opNo: string;
  origin: string; // 直したあとの始発(この路線の分)
  dest: string; // 直したあとの行先(この路線の分)
  changedOrigin: boolean;
  changedDest: boolean;
  nodes: FixedNode[];
}

export interface FixedDia {
  trains: FixedTrain[]; // 運休の列車は、含まない
  cancelled: string[]; // 運休の列車番号
  actions: Action[]; // 採った案(待避・待機・折返し・運休)
  changes: ChangeRecord[]; // 変更の記録(打ち切り・運休・待避・待機・遅れ)
  summary: Summary;
}

/**
 * ダイヤと出来事(遅れ・区間運休)から、整理案をすべて採ったあとのダイヤを返す。
 * 同じダイヤと同じ出来事からは、必ず同じ答えが出る(時刻や乱数は、使わない。出来事の時刻は、引数で受け取る)。
 */
export const fixedDia = (data: RearrangeData, event: EventInput): FixedDia => {
  const res = rearrange(data, event);
  const actions = res.proposals.length ? res.proposals[res.proposals.length - 1].actions : [];
  const e = evaluate(data, actions, event);
  const name = (st: number) => data.stations[st].name;
  const orig = new Map(data.trains.map((t) => [t.no, t]));
  const trains: FixedTrain[] = e.sim.trains.map((t, i) => {
    const o = orig.get(t.no)!;
    const first = t.nodes[0];
    const last = t.nodes[t.nodes.length - 1];
    return {
      no: t.no, type: t.type, typeName: t.typeName, dir: t.dir, set: t.set, opNo: t.opNo,
      origin: name(first.st), dest: name(last.st),
      changedOrigin: first.st !== o.nodes[0].st,
      changedDest: last.st !== o.nodes[o.nodes.length - 1].st,
      nodes: t.nodes.map((n, j) => ({ st: n.st, stop: n.stop, arr: e.sim.A[i][j], dep: e.sim.D[i][j], schedArr: n.sa, schedDep: n.sd })),
    };
  });
  const handChanges = res.proposals.flatMap((p) => p.changes.filter((c) => c.kind === 'passWait' || c.kind === 'hold'));
  return {
    trains,
    cancelled: [...e.work.removed],
    actions,
    changes: [...e.work.changes, ...handChanges, ...delayRecords(e.sim)],
    summary: e.sum,
  };
};

// ---------- 保存・配信用の、短い形 ----------
// 管理者の端末で、エンジンを1回動かし、その結果を、変わった列車の分だけに絞って保存する。利用者の端末は、これを読むだけ(エンジンは動かさない)。
export interface CompactResult {
  v: 1;
  cancelled: string[]; // 運休の列車番号
  trains: { no: string; o?: number; d?: number; x?: [number, number, number][] }[]; // 変わった列車だけ。o=新しい始発の駅番号 d=新しい行先の駅番号 x=[駅番号, 着の遅れ秒, 発の遅れ秒]
  pass: [string, string, number][]; // [待避する列車, 先に通す列車, 駅番号]
  hold: [string, number, number][]; // [列車, 駅番号, 待機の秒]
}

export const toCompact = (data: RearrangeData, fixed: FixedDia): CompactResult => {
  void data;
  const trains: CompactResult['trains'] = [];
  for (const t of fixed.trains) {
    const x: [number, number, number][] = [];
    for (const n of t.nodes) {
      const da = n.arr - n.schedArr;
      const dd = n.dep - n.schedDep;
      if (da !== 0 || dd !== 0) x.push([n.st, da, dd]);
    }
    const e: CompactResult['trains'][number] = { no: t.no };
    if (t.changedOrigin) e.o = t.nodes[0].st;
    if (t.changedDest) e.d = t.nodes[t.nodes.length - 1].st;
    if (x.length) e.x = x;
    if (e.o !== undefined || e.d !== undefined || e.x) trains.push(e);
  }
  const pass: CompactResult['pass'] = [];
  const hold: CompactResult['hold'] = [];
  for (const a of fixed.actions) {
    if (a.kind === 'pass') pass.push([a.slow, a.fast, a.at]);
    if (a.kind === 'hold') hold.push([a.train, a.at, a.sec]);
  }
  return { v: 1, cancelled: [...fixed.cancelled], trains, pass, hold };
};

/** 短い形から、直したあとのダイヤを組み立てる(エンジンは使わない。元のダイヤと、保存された結果だけで決まる) */
export const fromCompact = (data: RearrangeData, c: CompactResult): { trains: FixedTrain[]; cancelled: string[] } => {
  const cancelled = new Set(c.cancelled);
  const byNo = new Map(c.trains.map((t) => [t.no, t]));
  const name = (st: number) => data.stations[st].name;
  const trains: FixedTrain[] = [];
  for (const t of data.trains) {
    if (cancelled.has(t.no)) continue;
    const e = byNo.get(t.no);
    let nodes = t.nodes;
    let cutS = false;
    let cutE = false;
    if (e?.o !== undefined) {
      const i = nodes.findIndex((n, k) => n.st === e.o && n.stop && k < nodes.length - 1);
      if (i > 0) {
        nodes = nodes.slice(i);
        cutS = true;
      }
    }
    if (e?.d !== undefined) {
      const i = nodes.findIndex((n, k) => n.st === e.d && n.stop && k > 0);
      if (i > 0) {
        nodes = nodes.slice(0, i + 1);
        cutE = true;
      }
    }
    const shift = new Map((e?.x ?? []).map(([st, a, d]) => [st, [a, d] as [number, number]]));
    const out: FixedNode[] = nodes.map((n, k) => {
      const schedArr = cutS && k === 0 ? n.sd : n.sa;
      const schedDep = cutE && k === nodes.length - 1 ? n.sa : n.sd;
      const [da, dd] = shift.get(n.st) ?? [0, 0];
      return { st: n.st, stop: n.stop, arr: schedArr + da, dep: schedDep + dd, schedArr, schedDep };
    });
    trains.push({
      no: t.no, type: t.type, typeName: t.typeName, dir: t.dir, set: t.set, opNo: t.opNo,
      origin: name(out[0].st), dest: name(out[out.length - 1].st),
      changedOrigin: cutS, changedDest: cutE, nodes: out,
    });
  }
  return { trains, cancelled: [...c.cancelled] };
};
