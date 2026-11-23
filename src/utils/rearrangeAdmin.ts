// 運転整理(ダイヤ整理案)の、管理者の端末側の入口。
// 運行乱れを保存したとき(トグルが ON で、対象が高宮線のとき)、既存の運行乱れの入力から出来事を作り、エンジンを1回だけ動かして、
// 結果を短い形にして GAS に保存する。利用者の端末は、これを読むだけ(rearrangeOverlay.ts)。
import { callGas } from './accountApi';
import { adminDelaySeed, serviceDayStartOf } from './serviceDay';
import { disruptionManager, getAdminToken, getAffectedStationRange, LINE_STATIONS, whenDisruptionsPushed, type LineDisruption } from './disruptionManager';
import { safeStorage } from './safeStorage';
import { buildData, fixedDia, toCompact, type CompactResult, type RearrangeData, type RearrangeEvent } from './rearrange';
import { loadDiaFile, loadLineData } from './diaTimetable';
import { TK_CODE } from './tkLine';

export const REARRANGE_LINE_ID = 'takamiya';
const WIRING_FILE = '配線.json';
const WIRING_NAME = '高宮線';

type Raw = Record<string, unknown>;
export type EffectiveDelay = typeof disruptionManager.getEffectiveDelayForTrain;

/**
 * 既存の運行乱れの入力(遅れ・区間運休)から、エンジンの出来事を作る。
 *  - 遅れ: 路線全体の入力なので、列車ごとに、既存の getEffectiveDelayForTrain が出す遅れを、delay の出来事にする。
 *    駅は、その列車が、影響区間に入る最初の停車駅(区間の指定が無ければ、始発駅)。方向・区間の決まりは、既存のまま。
 *  - 運転見合わせ: 上下線ともで、区間が2駅以上なら suspend(開始=保存した時刻、終了=自動解除の時刻。無ければ、その日のダイヤの最後)。
 *    片方の方向だけ・1駅だけのときは、エンジンの suspend に当てはまらないので、その区間・時間帯に走る列車を、cancel にする。
 *  - 一部運休(3本に1本を乱数で止める別の仕組み)・平常・システムへの連動なし は、出来事なし。
 * 時刻は引数で受け取る(nowMs=いま、startMs=この運行乱れを保存した時刻。同じ入力からは、同じ出来事になる)。
 */
export const buildRearrangeEvents = (
  d: LineDisruption,
  data: RearrangeData,
  nowMs: number,
  effective: EffectiveDelay = disruptionManager.getEffectiveDelayForTrain,
  startMs: number = nowMs
): RearrangeEvent[] => {
  if (d.lineId !== REARRANGE_LINE_ID || !d.linkToSystem) return [];
  if (d.statusType !== 'delay' && d.statusType !== 'suspended') return [];

  const dayStart = serviceDayStartOf(nowMs);
  const startSec = Math.max(0, Math.floor((startMs - dayStart) / 1000));
  const lastSec = data.trains.reduce((m, t) => Math.max(m, t.nodes[t.nodes.length - 1].sa), 0);
  const endSec = d.expiresAtTimestamp ? Math.floor((d.expiresAtTimestamp - dayStart) / 1000) : lastSec;
  if (endSec <= startSec) return [];

  // 影響区間: 駅の番号(master の並び)。指定が無ければ全線
  const names = LINE_STATIONS[REARRANGE_LINE_ID] ?? [];
  const range = getAffectedStationRange(REARRANGE_LINE_ID, d.section);
  const idx = (i: number) => data.stations.findIndex((s) => s.name === names[i]);
  const from = range ? idx(range[0]) : 0;
  const to = range ? idx(range[1]) : data.stations.length - 1;
  if (from < 0 || to < 0 || from > to) return [];
  const inRange = (st: number) => st >= from && st <= to;
  const wantDir = d.targetDirection === 'up' ? 'U' : d.targetDirection === 'down' ? 'D' : null;
  const trains = data.trains.filter((t) => !wantDir || t.dir === wantDir);

  if (d.statusType === 'suspended') {
    if (!wantDir && from < to) return [{ kind: 'suspend', from, to, startSec, endSec }];
    return trains
      .filter((t) => t.nodes.some((n) => inRange(n.st) && n.sd >= startSec && n.sd < endSec))
      .map((t) => ({ kind: 'cancel' as const, train: t.no }));
  }

  const events: RearrangeEvent[] = [];
  for (const t of trains) {
    const node = t.nodes.find((n) => n.stop && inRange(n.st));
    if (!node) continue;
    const e = effective(REARRANGE_LINE_ID, adminDelaySeed(dayStart, t.no), t.dir === 'D' ? 1 : 2, { stationName: data.stations[node.st].name });
    if (!e.isSuspended && e.delayMinutes > 0) events.push({ kind: 'delay', train: t.no, at: node.st, sec: e.delayMinutes * 60 });
  }
  return events;
};

/** 出来事から、保存する形を作る(エンジンを1回動かす)。出来事が無いときは null */
export const makeSavedRearrange = (data: RearrangeData, events: RearrangeEvent[]): CompactResult | null =>
  events.length === 0 ? null : toCompact(data, fixedDia(data, events));

// 運行乱れを保存し直したとき(ほかの路線の変更でも、サーバーは結果をいったん空にする)、結果を作り直す。
// そのとき、区間運休の開始が「作り直した時刻」にずれないよう、同じ運行乱れ(内容が同じ)の開始時刻は、端末に覚えておく
const START_KEY = 'nizaki_rearrange_start';
export const stableStartMs = (d: LineDisruption, nowMs: number): number => {
  const key = JSON.stringify([d.lineId, d.statusType, d.section, d.maxDelayMinutes, d.targetDirection ?? '', d.linkToSystem, d.updatedAt, d.expiresAtTimestamp ?? 0]);
  try {
    const saved = JSON.parse(safeStorage.getItem(START_KEY) || 'null');
    if (saved && saved.key === key && typeof saved.ms === 'number' && saved.ms <= nowMs) return saved.ms;
  } catch {
    // 読めなければ、いまを開始にする
  }
  try {
    safeStorage.setItem(START_KEY, JSON.stringify({ key, ms: nowMs }));
  } catch {
    // 覚えられなくても、続ける
  }
  return nowMs;
};

// ---------- 通信 ----------
// トグルを書く(管理者だけ)。成功したら、サーバーの値を返す。失敗は null
export const saveRearrangeFlag = async (enabled: boolean): Promise<boolean | null> => {
  try {
    const res = (await callGas('adminSetRearrangeFlag', { adminToken: getAdminToken(), enabled })) as unknown as Raw;
    return res.status === 'success' && typeof res.enabled === 'boolean' ? res.enabled : null;
  } catch {
    return null;
  }
};

/**
 * 運行乱れを保存したあとに: 対象が高宮線なら、エンジンを1回動かして、結果を GAS に保存する(出来事が無ければ、保存された結果を空にする)。
 * 順番: 運行乱れの保存(setDisruptions)が成功したあと。先に結果を送ると、サーバーが断る(no_disruption)か、いったん空になる。
 * トグルが ON かどうかは、呼ぶ側で確かめる。戻り値: 'saved' 保存した / 'cleared' 空にした / 'skipped' 対象外 / 'failed' 失敗
 */
export const runRearrangeFor = async (d: LineDisruption, nowMs: number = Date.now()): Promise<'saved' | 'cleared' | 'skipped' | 'failed'> => {
  if (d.lineId !== REARRANGE_LINE_ID) return 'skipped';
  try {
    if (!(await whenDisruptionsPushed())) return 'failed';
    const line = await loadLineData(TK_CODE);
    const wiring = (await loadDiaFile<Record<string, Record<string, { 配線: string; 折返し線: number }>>>(WIRING_FILE))[WIRING_NAME];
    const data = buildData(line.trains, line.master, wiring);
    const saved = makeSavedRearrange(data, buildRearrangeEvents(d, data, nowMs, undefined, stableStartMs(d, nowMs)));
    const res = (await callGas('adminSaveRearrangeResult', { adminToken: getAdminToken(), result: saved })) as unknown as Raw;
    if (res.status !== 'success') return 'failed';
    return saved ? 'saved' : 'cleared';
  } catch {
    return 'failed';
  }
};
