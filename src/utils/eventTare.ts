// 公開記念イベント(NIZAKI 2.0。公開後だけ)の、中の計算。
//  - 対象の予約の判定(特急めぐり・東京発・土浦以遠・始発以外)
//  - 親父さん(プレイヤーの列車の n 本前の列車の乗客)の、いまの位置と、土浦に着くまでの時間
//  - 「土浦に着いた」の判定と、進行の段階
//  - 参加・クリアの印(端末の中)
// 位置も到着も、列車位置と同じ、遅れ込みの時刻で数える。画面は components、ごほうびの判定はサーバーが受け持つ。
// すべて isLaunched() の内側で働く(公開前は、何も起きない)。
import {
  EXPRESS_TYPES,
  findExpressTrips,
  getCachedExpressData,
  getCachedLineData,
  LineData,
  loadExpressData,
  normalizeStationName,
  resolveTrainDelay,
} from './diaTimetable';
import { isLaunched, LAUNCH_AT } from './launch';

export const EVENT_TARE = {
  id: 'tare-2026',
  startAt: '2026-11-01T00:00:00+09:00',
  prevN: 1, // 親父さんは、プレイヤーの列車の、何本前
  fatherStation: '土浦', // 親父さんが降りる(いる)駅
  fatherSeat: 'A席', // 演出だけ。台帳には入れない
  rewardPoints: 350,
  tagName: '味覚捜査班',
};

export type EventTarePhase = 'not_joined' | 'no_reservation' | 'before_departure' | 'riding' | 'arrived' | 'cleared';

export interface EventTareState {
  phase: EventTarePhase;
  orderId: string | null; // 対象にした予約
  minutesToFatherArrival: number | null; // 親父さんの列車が、土浦に着くまで(遅れ込み。切り上げの整数。着いたら 0 以下)
  minutesToPlayerArrival: number | null;
  fatherPosition: { atStation?: string; between?: [string, string] } | null; // 出発前・終着後は null
  delayMinutes: { player: number; father: number }; // 土浦での遅れ(分)
  playerTrain: { trainNo: string; departAt: Date; scheduledDepartAt: Date } | null; // departAt は遅れ込み
}

// ActiveOrder・OrderHistoryItem が、そのまま渡せる形
export interface EventOrder {
  orderId: string;
  trainName: string;
  boardingStation?: string;
  destinationStation?: string;
  reservedDate?: string; // YYYY-MM-DD(省略すると、いまの日)
  result?: 'completed' | 'cancelled'; // 終了した予約の記録(OrderHistoryItem)のとき。取り消した予約は、対象にならない
}

// 本物の公開(公開日をすぎた)か。リンクの指定(preview)で公開後の画面を見ているだけなら false
const isRealLaunch = (): boolean => LAUNCH_AT !== null && Date.now() >= Date.parse(LAUNCH_AT);

// 対象の予約の、降りる駅(土浦かそれより先)
export const EVENT_DESTINATIONS = ['土浦', 'ひたちなか海浜公園', '日立'];
const EVENT_ORIGIN = '東京';
const EVENT_TERMINAL = '日立';

const KEY = 'meguri' as const;
const stripEki = (name: string): string => normalizeStationName(name.replace(/駅$/, ''));

// ---------------------------------------------------------------------------
// ダイヤ
// ---------------------------------------------------------------------------

// めぐりの、東京〜日立の通しダイヤを読み込んでおく(判定の前に、1回)
export const loadEventData = async (): Promise<void> => {
  if (!isLaunched()) return;
  await loadExpressData(KEY);
};

interface Stop {
  name: string;
  arrMs: number; // 遅れ込み
  depMs: number;
  delayMin: number;
}

interface Resolved {
  order: EventOrder;
  player: { trainNo: string; stops: Stop[]; scheduledDepMs: number };
  father: { trainNo: string; stops: Stop[] };
}

// 駅ごとの遅れ(列車位置と同じ決め方: その駅の、もとの路線のダイヤの行と、日付・列車番号で決まる)
const delayAtStop = (data: LineData, trainNo: string, stationIdx: number, stationName: string, dayStartMs: number): number => {
  const lineCode = data.stationLines?.[stationIdx] ?? data.code;
  const line = getCachedLineData(lineCode);
  const row = line?.trains.find((t) => t[0] === trainNo);
  if (!line || !row) return 0;
  const dirIdx = (line.master.dirs.indexOf(row[2]) === 1 ? 1 : 0) as 0 | 1;
  const r = resolveTrainDelay(lineCode, trainNo, dayStartMs, dirIdx, stationName, dayStartMs + row[4] * 1000, row[4]);
  return r.isSuspended ? 0 : r.delayMinutes;
};

const timelineOf = (data: LineData, trainNo: string, dayStartMs: number): { stops: Stop[]; scheduledDepMs: number } | null => {
  const row = data.trains.find((t) => t[0] === trainNo);
  if (!row) return null;
  const stops: Stop[] = [];
  const flat = row[5];
  for (let k = 0; k * 3 < flat.length; k++) {
    const idx = flat[k * 3];
    const a = flat[k * 3 + 1];
    const d = flat[k * 3 + 2];
    const name = normalizeStationName(data.master.stations[idx][0]);
    const delayMin = delayAtStop(data, trainNo, idx, name, dayStartMs);
    const shift = delayMin * 60 * 1000;
    stops.push({
      name,
      arrMs: dayStartMs + (row[4] + (a !== -1 ? a : d)) * 1000 + shift,
      depMs: dayStartMs + (row[4] + (d !== -1 ? d : a)) * 1000 + shift,
      delayMin,
    });
  }
  if (stops.length === 0) return null;
  return { stops, scheduledDepMs: stops[0].depMs - stops[0].delayMin * 60 * 1000 };
};

const dayStartOf = (order: EventOrder, now: Date): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(order.reservedDate || '');
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// 予約から、対象の列車と、n本前の列車を引く。対象でなければ null
const resolve = (order: EventOrder, now: Date, prevN: number): Resolved | null => {
  if (!isLaunched()) return null;
  const data = getCachedExpressData(KEY);
  if (!data) return null;
  if (!order.trainName.startsWith(EXPRESS_TYPES[KEY].label)) return null;
  if (order.result === 'cancelled') return null; // 取り消した予約は、対象にならない
  if (!order.boardingStation || !order.destinationStation) return null;
  if (stripEki(order.boardingStation) !== EVENT_ORIGIN) return null;
  if (!EVENT_DESTINATIONS.includes(stripEki(order.destinationStation))) return null;

  // 東京発の、めぐりの全便(発車の早い順)
  const trips = findExpressTrips(data, EXPRESS_TYPES[KEY].typeName, EVENT_ORIGIN, EVENT_TERMINAL);
  const i = trips.findIndex((t) => t.trainName === order.trainName);
  if (i < 0 || i - prevN < 0) return null; // 始発など、n本前が無い便は、対象外

  const dayStartMs = dayStartOf(order, now);
  const player = timelineOf(data, trips[i].code, dayStartMs);
  const father = timelineOf(data, trips[i - prevN].code, dayStartMs);
  if (!player || !father) return null;
  // 乗車日時が、イベントの開始より前の予約(公開前にあった予約)は、対象にならない(サーバーの条件と同じ)。
  // リンクの指定(preview)で、公開前に画面を試しているときは、この条件を外す
  if (!(isLaunched() && !isRealLaunch()) && player.scheduledDepMs < Date.parse(EVENT_TARE.startAt)) return null;
  return {
    order,
    player: { trainNo: trips[i].code, ...player },
    father: { trainNo: trips[i - prevN].code, stops: father.stops },
  };
};

export const isEventEligibleOrder = (order: EventOrder): boolean => resolve(order, new Date(), EVENT_TARE.prevN) !== null;

// いまの位置(駅に停まっている・駅と駅のあいだ)。出発前・終着後は null
const positionAt = (stops: Stop[], nowMs: number): EventTareState['fatherPosition'] => {
  if (nowMs < stops[0].depMs) return null;
  for (let k = 0; k < stops.length; k++) {
    if (nowMs >= stops[k].arrMs && nowMs < stops[k].depMs) return { atStation: stops[k].name };
    if (k + 1 < stops.length && nowMs >= stops[k].depMs && nowMs < stops[k + 1].arrMs) {
      return { between: [stops[k].name, stops[k + 1].name] };
    }
  }
  return null;
};

const stopOf = (stops: Stop[], station: string): Stop | undefined => stops.find((s) => s.name === normalizeStationName(station));

const minutesUntil = (ms: number, nowMs: number): number => Math.ceil((ms - nowMs) / 60000) || 0;

const EMPTY_STATE = (phase: EventTarePhase): EventTareState => ({
  phase,
  orderId: null,
  minutesToFatherArrival: null,
  minutesToPlayerArrival: null,
  fatherPosition: null,
  delayMinutes: { player: 0, father: 0 },
  playerTrain: null,
});

export const getEventState = (
  joined: boolean,
  orders: EventOrder[],
  now: Date,
  opts: { cleared?: boolean; prevN?: number; joinedAt?: number } = {}
): EventTareState => {
  if (!isLaunched()) return EMPTY_STATE('not_joined');
  if (opts.cleared) return EMPTY_STATE('cleared');
  if (!joined) return EMPTY_STATE('not_joined');

  const prevN = opts.prevN ?? EVENT_TARE.prevN;
  const nowMs = now.getTime();
  const station = EVENT_TARE.fatherStation;
  const found = orders
    .map((o) => resolve(o, now, prevN))
    .filter((r): r is Resolved => r !== null)
    .map((r) => {
      const p = stopOf(r.player.stops, station);
      const f = stopOf(r.father.stops, station);
      return p && f ? { r, p, f, endMs: Math.max(p.arrMs, f.arrMs) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // 参加より前に、土浦に着いた(着く予定が過ぎた)予約は、対象にしない。参加のときに乗車中の予約は、まだ着いていないので、対象。
    // 参加の時刻(joinedAt)が渡されない・0のときは、この絞りをしない(今までどおり)
    .filter((x) => !opts.joinedAt || x.endMs > opts.joinedAt);
  if (found.length === 0) return EMPTY_STATE('no_reservation');

  // 複数あるときは、まだ終わっていないもののうち、いちばん早く終わるもの。みな終わっていれば、いちばん最近のもの
  const upcoming = found.filter((x) => x.endMs > nowMs).sort((a, b) => a.endMs - b.endMs);
  const pick = upcoming[0] ?? found.sort((a, b) => b.endMs - a.endMs)[0];

  const departMs = pick.r.player.stops[0].depMs;
  const phase: EventTarePhase = nowMs < departMs ? 'before_departure' : nowMs >= pick.endMs ? 'arrived' : 'riding';
  return {
    phase,
    orderId: pick.r.order.orderId,
    minutesToFatherArrival: minutesUntil(pick.f.arrMs, nowMs),
    minutesToPlayerArrival: minutesUntil(pick.p.arrMs, nowMs),
    fatherPosition: positionAt(pick.r.father.stops, nowMs),
    delayMinutes: { player: pick.p.delayMin, father: pick.f.delayMin },
    playerTrain: {
      trainNo: pick.r.player.trainNo,
      departAt: new Date(departMs),
      scheduledDepartAt: new Date(pick.r.player.scheduledDepMs),
    },
  };
};

// ---------------------------------------------------------------------------
// 参加・クリアの印(端末の中)
// ---------------------------------------------------------------------------

export interface EventStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

// 既定は、この端末の保存先。デモ会員は、画面を開いているあいだだけ覚える store(App の storeGet / storeSet)を渡す
export const localEventStore: EventStore = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 保存できなくても、この画面を開いているあいだは続けられる
    }
  },
};

const progressKey = (owner: string): string => `nizaki_event_${EVENT_TARE.id}:${(owner || '').trim().toLowerCase()}`;

export interface EventProgress {
  joined: boolean;
  cleared: boolean;
  joinedAt: number; // 参加した時刻(ms)。0は、時刻の記録が無い(古い印)
  resetAt: number; // 「最初からやり直す」を押した時刻(ms)。0は、押していない。これより前のサーバーの参加の時刻は、使わない
}

export const readEventProgress = (owner: string, store: EventStore = localEventStore): EventProgress => {
  try {
    const raw = JSON.parse(store.get(progressKey(owner)) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        joined: raw.joined === true || raw.cleared === true,
        cleared: raw.cleared === true,
        joinedAt: typeof raw.joinedAt === 'number' && raw.joinedAt > 0 ? raw.joinedAt : 0,
        resetAt: typeof raw.resetAt === 'number' && raw.resetAt > 0 ? raw.resetAt : 0,
      };
    }
  } catch {
    // 読めなければ、なし
  }
  return { joined: false, cleared: false, joinedAt: 0, resetAt: 0 };
};

const writeProgress = (owner: string, store: EventStore, p: EventProgress) => store.set(progressKey(owner), JSON.stringify(p));

// 参加の印をつける。参加の時刻は、はじめて参加したときだけ記録する(押し直しても、変えない。時刻の無い古い印も、そのまま)
export const markEventJoined = (owner: string, store: EventStore = localEventStore, nowMs: number = Date.now()): void => {
  if (!isLaunched()) return;
  const p = readEventProgress(owner, store);
  if (p.joined) return;
  writeProgress(owner, store, { ...p, joined: true, joinedAt: nowMs });
};

// 「最初からやり直す」: 参加の印・参加の時刻を消し、やり直した時刻(resetAt)を記録する(この会員の分だけ。端末の中だけ)。
// クリア済みは、ごほうびが1人1回で戻せないので、やり直せない(false)。予約は、取り消さない。
export const resetEventProgress = (owner: string, store: EventStore = localEventStore, nowMs: number = Date.now()): boolean => {
  if (!isLaunched()) return false;
  const p = readEventProgress(owner, store);
  if (p.cleared) return false;
  writeProgress(owner, store, { joined: false, cleared: false, joinedAt: 0, resetAt: nowMs });
  return true;
};

// サーバーが覚えている参加の時刻を、端末の印に入れる(参加済みにもなる)。
//  - earliest=false: サーバーの時刻にする(参加を押した直後。サーバーの時刻が正)
//  - earliest=true: 端末に時刻があれば、早いほうを使う(別の端末の同期。時刻の無い古い印(0)は、サーバーの時刻にする)
export const setEventJoinedAt = (owner: string, serverMs: number, store: EventStore = localEventStore, earliest = false): void => {
  if (!isLaunched()) return;
  if (!(typeof serverMs === 'number' && serverMs > 0)) return;
  const p = readEventProgress(owner, store);
  if (serverMs <= p.resetAt) return; // やり直す前の参加の時刻は、使わない(同期で、昔の参加に戻らない。参加し直したときは、端末の時刻のまま)
  const joinedAt = earliest && p.joinedAt > 0 ? Math.min(p.joinedAt, serverMs) : serverMs;
  if (p.joined && p.joinedAt === joinedAt) return;
  writeProgress(owner, store, { ...p, joined: true, joinedAt });
};

// サーバーの結果で上書きする(クリア済みなら true、まだなら false)。クリア済みは、参加済みでもある
export const setEventCleared = (owner: string, cleared: boolean, store: EventStore = localEventStore): void => {
  if (!isLaunched()) return;
  const p = readEventProgress(owner, store);
  writeProgress(owner, store, { ...p, joined: p.joined || cleared, cleared });
};
