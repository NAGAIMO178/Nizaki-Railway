import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Search, RefreshCw, SlidersHorizontal, ChevronRight, ChevronDown, Plus, X } from 'lucide-react';
import { REGISTERABLE_LINES } from './MyStationRegisterCard';
import { RouteFilterSheet } from './RouteFilterSheet';
import { RouteDetail } from './RouteDetail';
import { ArrivalTimeSheet } from './ArrivalTimeSheet';
import { ArrivalResults } from './ArrivalResults';
import { formatDiaTime } from '../utils/diaTimetable';
import { crowdInfo } from '../utils/crowd';
import { loadRouteStations, searchRoutes, RouteResult } from '../utils/routeSearch';
import { planArrival, ArrivalPlan, ArrivalOption } from '../utils/arrivalPlan';
import { isLaunched } from '../utils/launch';
import { ArrivalTime, ArrivalDay, defaultArrival, arrivalClock, arrivalLabel } from '../utils/arrivalInput';
import {
  RouteOptions,
  loadRouteOptions,
  saveRouteOptions,
  countChangedOptions,
  loadLastQuery,
  saveLastQuery,
  MAX_VIAS,
} from '../utils/routeOptions';

const DAY = 86400;

const lineColor = (code: string): string => REGISTERABLE_LINES.find((l) => l.code === code)?.color ?? '#8B5CF6';

const nowText = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// "HH:MM" を、0時からの秒数にする。0〜4時は、前日のダイヤの続き(24時台以降)として扱う
const toServiceSec = (text: string): number | null => {
  const [h, m] = text.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const sec = h * 3600 + m * 60;
  return sec < 4 * 3600 ? sec + DAY : sec;
};

const dayLabelOf = (d: Date = new Date()): string => `${d.getMonth() + 1}月${d.getDate()}日(${'日月火水木金土'[d.getDay()]})`;

const timeLabel = (sec: number): string => formatDiaTime(sec);

// 出発・到着・経由の駅の組み合わせが、探せる形か。だめなら、その理由
const checkStations = (fromV: string, toV: string, chosen: string[]): string | null => {
  if (fromV === toV) return '出発駅と到着駅が同じです。';
  if (chosen.some((v) => v === fromV || v === toV)) return '経由駅に、出発駅・到着駅と同じ駅は指定できません。';
  if (new Set(chosen).size !== chosen.length) return '同じ駅を、経由駅に2回は指定できません。';
  return null;
};

// 時刻表タブから別のタブへ移って戻ったときに、前回の検索を続きから見られるよう、アプリを開いているあいだは覚えておく
interface Session {
  from: string;
  to: string;
  vias: string[];
  timeText: string;
  options: RouteOptions;
  results: RouteResult[];
  searchedAt: string;
  dayLabel: string;
}
let lastSession: Session | null = null;

export const RouteSearch: React.FC = () => {
  const [stations, setStations] = useState<string[] | null>(null);
  const [stationsError, setStationsError] = useState(false);
  const [retry, setRetry] = useState(0);

  const restored = lastSession;
  const [from, setFrom] = useState(() => restored?.from ?? loadLastQuery()?.from ?? '東京');
  const [to, setTo] = useState(() => restored?.to ?? loadLastQuery()?.to ?? '大宮');
  // 経由駅(通ってほしい駅)。空の行は、まだ駅を選んでいないもの
  const [vias, setVias] = useState<string[]>(() => restored?.vias ?? loadLastQuery()?.vias ?? []);
  const [timeText, setTimeText] = useState(() => restored?.timeText ?? nowText());
  const [options, setOptions] = useState<RouteOptions>(() => loadRouteOptions());
  const [results, setResults] = useState<RouteResult[] | null>(restored?.results ?? null);
  const [searchedAt, setSearchedAt] = useState(restored?.searchedAt ?? '');
  const [dayLabel, setDayLabel] = useState(restored?.dayLabel ?? '');
  const [usedRealtime, setUsedRealtime] = useState(restored?.options.realtime ?? true);
  const [resultKey, setResultKey] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  // 到着の時刻から逆算する探し方
  const [basisChoice, setBasis] = useState<'dep' | 'arr'>('dep');
  // 到着から逆算する探し方は、公開後だけ(公開前は、いつも「出発」)
  const basis = isLaunched() ? basisChoice : 'dep';
  const [arrival, setArrival] = useState<ArrivalTime>(() => defaultArrival(new Date()));
  const [arrivalSheetOpen, setArrivalSheetOpen] = useState(false);
  const [plan, setPlan] = useState<ArrivalPlan | null>(null);
  const [planArrivalText, setPlanArrivalText] = useState('');
  const [planDay, setPlanDay] = useState<ArrivalDay>('today');
  const [planKey, setPlanKey] = useState(0);
  const [arrDetail, setArrDetail] = useState<ArrivalOption | null>(null);
  const optionsChanged = useRef(false);

  useEffect(() => {
    let alive = true;
    setStationsError(false);
    loadRouteStations()
      .then((s) => {
        if (!alive) return;
        setStations(s);
        // 駅の名前が変わっていたときは、覚えていた駅を使わない
        setFrom((v) => (s.includes(v) ? v : '東京'));
        setTo((v) => (s.includes(v) ? v : '大宮'));
        setVias((vs) => vs.filter((v) => v === '' || s.includes(v)));
      })
      .catch(() => {
        if (alive) setStationsError(true);
      });
    return () => {
      alive = false;
    };
  }, [retry]);

  const runSearch = async (fromV: string, toV: string, timeV: string, optsV: RouteOptions, viasV: string[]) => {
    setMessage(null);
    setSearchError(false);
    const chosen = viasV.filter((v) => v !== '');
    const problem = checkStations(fromV, toV, chosen);
    if (problem) {
      setResults(null);
      setMessage(problem);
      return;
    }
    const sec = toServiceSec(timeV);
    if (sec === null) {
      setMessage('出発の時刻を入れてください。');
      return;
    }
    setSearching(true);
    try {
      const found = await searchRoutes(fromV, toV, sec, optsV, 3, chosen);
      const at = nowText();
      const day = dayLabelOf();
      setResults(found);
      setSearchedAt(at);
      setDayLabel(day);
      setUsedRealtime(optsV.realtime);
      setResultKey((n) => n + 1); // 結果が前回と同じでも、検索したことが見えるように、表示をやり直す
      setDetailIdx(null);
      saveLastQuery(fromV, toV, chosen);
      lastSession = { from: fromV, to: toV, vias: chosen, timeText: timeV, options: optsV, results: found, searchedAt: at, dayLabel: day };
    } catch {
      setResults(null);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const runArrival = async (fromV: string, toV: string, arrV: ArrivalTime, optsV: RouteOptions, viasV: string[]) => {
    setMessage(null);
    setSearchError(false);
    const chosen = viasV.filter((v) => v !== '');
    const problem = checkStations(fromV, toV, chosen);
    if (problem) {
      setPlan(null);
      setMessage(problem);
      return;
    }
    setSearching(true);
    try {
      const found = await planArrival({ from: fromV, to: toV, day: arrV.day, arriveBy: arrivalClock(arrV), vias: chosen, options: optsV });
      setPlan(found);
      setPlanArrivalText(arrivalClock(arrV));
      setPlanDay(arrV.day);
      setSearchedAt(nowText());
      setUsedRealtime(found.usedDelays);
      setPlanKey((n) => n + 1);
      setArrDetail(null);
      saveLastQuery(fromV, toV, chosen);
    } catch {
      setPlan(null);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = () => (basis === 'arr' ? runArrival(from, to, arrival, options, vias) : runSearch(from, to, timeText, options, vias));

  const handleOptionsChange = (next: RouteOptions) => {
    setOptions(next);
    saveRouteOptions(next);
    optionsChanged.current = true;
  };

  const closeSheet = () => {
    setSheetOpen(false);
    // 条件を変えたときは、結果が出ていれば、そのまま探し直す
    if (optionsChanged.current) {
      optionsChanged.current = false;
      if (basis === 'arr') {
        if (plan !== null) runArrival(from, to, arrival, options, vias);
      } else if (results !== null) runSearch(from, to, timeText, options, vias);
    }
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setResults(null);
    setPlan(null);
    setMessage(null);
    setDetailIdx(null);
    setArrDetail(null);
  };

  if (stationsError) {
    return (
      <div className="bg-white border border-[#E6E2EE] rounded-2xl p-4 text-center space-y-2">
        <p className="text-xs text-[#6B6380]">駅の一覧を読み込めませんでした。</p>
        <button
          type="button"
          onClick={() => setRetry((n) => n + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#5B21B6] text-white text-xs font-bold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>もう一度読み込む</span>
        </button>
      </div>
    );
  }

  if (!stations) return <div className="text-center text-xs text-[#857D99] py-10">読み込み中…</div>;

  // 到着から逆算した結果の詳細
  if (basis === 'arr' && arrDetail) {
    const day = new Date();
    if (planDay === 'tomorrow') day.setDate(day.getDate() + 1);
    return (
      <RouteDetail
        result={arrDetail.route}
        from={from}
        to={to}
        vias={vias.filter((v) => v !== '')}
        dayLabel={dayLabelOf(day)}
        searchedAt={searchedAt}
        realtime={usedRealtime}
        onBack={() => setArrDetail(null)}
      />
    );
  }

  // 詳細
  if (basis === 'dep' && results && detailIdx !== null && results[detailIdx]) {
    return (
      <RouteDetail
        result={results[detailIdx]}
        from={lastSession?.from ?? from}
        to={lastSession?.to ?? to}
        vias={lastSession?.vias ?? []}
        dayLabel={dayLabel}
        searchedAt={searchedAt}
        realtime={usedRealtime}
        onBack={() => setDetailIdx(null)}
      />
    );
  }

  const selectClass = 'flex-1 min-w-0 bg-transparent text-sm font-bold text-[#221C35] outline-none py-2 cursor-pointer';
  const changed = countChangedOptions(options);

  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#E6E2EE] rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 divide-y divide-[#EFEDF5]">
            <label className="flex items-center gap-2">
              <span className="shrink-0 w-10 text-center text-[11px] font-black text-white bg-[#3B82F6] rounded py-1">出発</span>
              <select className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="出発駅">
                {stations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="shrink-0 w-10 text-center text-[11px] font-black text-white bg-[#EC4899] rounded py-1">到着</span>
              <select className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} aria-label="到着駅">
                {stations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={swap}
            className="shrink-0 p-2 rounded-full bg-[#F4F3F8] text-[#5B21B6] hover:bg-[#EFE8FA] cursor-pointer"
            aria-label="出発駅と到着駅を入れ替える"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>

        {/* 経由駅(通ってほしい駅)。降りる駅としては扱わず、通る(停まる・通過する)だけでよい */}
        {vias.length > 0 && (
          <div className="space-y-1.5">
            {vias.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="shrink-0 w-10 text-center text-[11px] font-black text-[#6B6380] bg-[#E6E2EE] rounded py-1">経由</span>
                <select
                  className="flex-1 min-w-0 border border-[#E6E2EE] rounded-lg px-2 py-1.5 bg-transparent text-sm font-bold text-[#221C35] cursor-pointer"
                  value={v}
                  onChange={(e) => setVias((vs) => vs.map((x, k) => (k === i ? e.target.value : x)))}
                  aria-label={`経由駅${i + 1}`}
                >
                  <option value="">駅を選んでください</option>
                  {stations
                    .filter((s) => s === v || (s !== from && s !== to && !vias.includes(s)))
                    .map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => setVias((vs) => vs.filter((_, k) => k !== i))}
                  className="shrink-0 p-1.5 rounded-full text-[#6B6380] hover:bg-[#F4F3F8] cursor-pointer"
                  aria-label={`経由駅${i + 1}を外す`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {vias.length < MAX_VIAS && (
          <button
            type="button"
            onClick={() => setVias((vs) => [...vs, ''])}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#5B21B6] hover:text-[#4C1D95] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>経由駅を追加（あと{MAX_VIAS - vias.length}つ）</span>
          </button>
        )}

        {isLaunched() && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="radiogroup" aria-label="時刻の基準">
            {([
              ['dep', '出発'],
              ['arr', '到着'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={basis === id}
                onClick={() => {
                  setBasis(id);
                  setMessage(null);
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  basis === id ? 'bg-white text-[#5B21B6] shadow-xs' : 'text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {basis === 'dep' ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#6B6380] shrink-0">出発の時刻</span>
            <input
              type="time"
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              className="flex-1 min-w-0 border border-[#E6E2EE] rounded-lg px-2 py-1.5 text-sm font-bold text-[#221C35]"
              aria-label="出発の時刻"
            />
            <button
              type="button"
              onClick={() => setTimeText(nowText())}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[#F4F3F8] text-[11px] font-bold text-[#5B21B6] hover:bg-[#EFE8FA] cursor-pointer"
            >
              いま
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setArrivalSheetOpen(true)}
            className="w-full border border-[#E6E2EE] rounded-xl px-3 py-2.5 flex items-center justify-between cursor-pointer bg-white"
            aria-label="到着の日時を選ぶ"
          >
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-black text-[#5B21B6] bg-[#EDE9FE] rounded px-1.5 py-0.5">到着</span>
              <span className="font-mono text-base font-black text-[#221C35]">{arrivalLabel(arrival)}</span>
            </span>
            <ChevronDown className="w-4 h-4 text-[#857D99]" />
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="flex-1 py-3 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span>{searching ? '探しています…' : '検索'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="relative shrink-0 py-3 px-3.5 rounded-xl bg-[#F4F3F8] hover:bg-[#EFE8FA] text-[#5B21B6] font-bold text-sm flex items-center gap-1.5 cursor-pointer"
            aria-label="絞り込み"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>絞り込み</span>
            {changed > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#5B21B6] text-white text-[10px] font-black flex items-center justify-center">
                {changed}
              </span>
            )}
          </button>
        </div>
      </div>

      {message && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{message}</div>}
      {searchError && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          時刻表を読み込めませんでした。もう一度、検索してください。
        </div>
      )}

      {basis === 'dep' && results && (
        <div key={resultKey} className="space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-[#6B6380]">
            <span className="truncate">
              <span className="font-bold text-[#221C35]">
                {lastSession?.from} → {lastSession?.to}
              </span>
              　{lastSession?.timeText}以降に出発
              {lastSession && lastSession.vias.length > 0 && <span className="ml-1.5 text-[#5B21B6] font-bold">経由: {lastSession.vias.join('・')}</span>}
            </span>
            <span className="shrink-0 text-right">
              {usedRealtime && <span className="font-bold text-emerald-700 mr-1.5">リアルタイム</span>}
              検索 {searchedAt}
            </span>
          </div>

          {results.length === 0 && (
            <div className="bg-white border border-[#E6E2EE] rounded-2xl p-5 text-center text-xs text-[#6B6380]">
              この条件で、乗れる列車が見つかりませんでした。
              <br />
              （{lastSession && lastSession.vias.length > 0 ? '経由駅を減らすか、' : ''}出発の時刻を早めるか、絞り込みを変えてお試しください）
            </div>
          )}

          {results.map((r, i) => {
            const first = r.legs[0];
            // 乗換の警告: 遅れで間に合わない乗換があれば、それを。無ければ、余裕が少ない乗換を
            const failConn = r.connections.find((c) => c.level === 'fail');
            const tightConn = failConn ? undefined : r.connections.find((c) => c.level === 'tight');
            return (
              <button
                type="button"
                key={`${r.depSec}-${r.arrSec}`}
                onClick={() => setDetailIdx(i)}
                className="w-full text-left bg-white border border-[#E6E2EE] rounded-2xl shadow-xs overflow-hidden hover:border-[#C4B5FD] active:bg-[#F9F8FD] transition-colors cursor-pointer"
              >
                <div className="px-3.5 pt-3 pb-2 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-[#857D99]">
                      候補 {i + 1}
                      {r.delayed && <span className="ml-1.5 text-rose-700">遅れあり</span>}
                    </div>
                    <div className={`text-2xl font-black font-mono leading-tight ${r.delayed ? 'text-rose-600' : 'text-[#221C35]'}`}>
                      {timeLabel(r.depSec)} <span className="text-[#B4ADC4]">→</span> {timeLabel(r.arrSec)}
                      {r.arrSec >= DAY && <span className="ml-1 text-[11px] font-bold text-[#857D99]">翌</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-[#5B21B6]">{r.minutes}分</div>
                    <div className="text-[11px] text-[#857D99]">乗換 {r.transfers}回</div>
                  </div>
                </div>

                <div className="px-3.5 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B6380]">
                  <span>
                    運賃 <span className="font-bold text-[#221C35]">¥{r.fare.toLocaleString()}</span>
                  </span>
                  <span>営業キロ {r.km.toFixed(1)}km</span>
                  {r.hasPaid && <span className="font-bold text-amber-600">特急券が別に必要</span>}
                  {failConn && <span className="font-bold text-rose-600">遅れで{failConn.station}の乗換に間に合いません</span>}
                  {tightConn && (
                    <span className="font-bold text-amber-600">
                      {tightConn.station}の乗換は余裕が少なめ(待ち{Math.round(tightConn.gapMin)}分)
                    </span>
                  )}
                  {options.sortBy === 'safe' && !failConn && !tightConn && r.risk < 0.01 && (
                    <span className="font-bold text-emerald-700">遅れに強い</span>
                  )}
                </div>

                <div className="border-t border-[#EFEDF5] px-3.5 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    {r.legs.map((leg, k) => (
                      <div key={`${leg.trainNo}-${k}`} className="flex items-center gap-2 text-[11px] text-[#221C35]">
                        <span className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: lineColor(leg.lineCode) }} />
                        {leg.through && <span className="shrink-0 text-[11px] font-bold text-[#5B21B6] bg-[#EFE8FA] px-1 py-px rounded">直通</span>}
                        <span className="font-bold truncate">{leg.lineName}</span>
                        <span className={`shrink-0 ${leg.paid ? 'text-amber-600 font-bold' : 'text-[#857D99]'}`}>{leg.typeAbbr}</span>
                        {leg.crowd && crowdInfo(leg.crowd) && (
                          <span
                            className="shrink-0 text-[11px] font-black px-1 py-px rounded border border-black/10 whitespace-nowrap"
                            style={{ background: crowdInfo(leg.crowd)!.color, color: crowdInfo(leg.crowd)!.text }}
                          >
                            {crowdInfo(leg.crowd)!.short}
                          </span>
                        )}
                        <span className="text-[#857D99] truncate">
                          {leg.from} {timeLabel(leg.depSec)} → {leg.to} {timeLabel(leg.arrSec)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#B4ADC4] shrink-0" />
                </div>
                <span className="sr-only">{first.from}から詳細を見る</span>
              </button>
            );
          })}

          {results.length > 0 && (
            <div className="text-[11px] text-[#857D99] leading-relaxed px-1">
              {results.some((x) => x.crowd) && '色つきの言葉は、混雑の目安です(模擬)。乗っている区間で、いちばん混むところを出しています。'}
              タップすると、詳細(停車駅・運賃の内訳)が見られます。乗換は{options.relaxedTransfer ? '8' : '4'}分以上で乗り継げる列車を探しています。運賃は、全区間の営業キロを合わせて計算した普通運賃です。
              {usedRealtime ? '遅れは、検索した時点のものです。' : '表示は予定の時刻で、遅れは反映されていません。'}
            </div>
          )}
        </div>
      )}

      {basis === 'arr' && plan && (
        <ArrivalResults key={planKey} plan={plan} deadlineText={planArrivalText} lineColor={lineColor} onOpen={setArrDetail} />
      )}

      <ArrivalTimeSheet
        isOpen={arrivalSheetOpen}
        value={arrival}
        onApply={(v) => {
          setArrival(v);
          setArrivalSheetOpen(false);
        }}
        onClose={() => setArrivalSheetOpen(false)}
      />

      <RouteFilterSheet isOpen={sheetOpen} options={options} onChange={handleOptionsChange} onClose={closeSheet} />
    </div>
  );
};
