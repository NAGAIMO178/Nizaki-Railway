import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { REGISTERABLE_LINES } from './MyStationRegisterCard';
import { RouteSearch } from './RouteSearch';
import { CrowdForecast } from './CrowdForecast';
import { isLaunched } from '../utils/launch';
import {
  loadTimetableLines,
  loadStationTimetable,
  formatDiaTime,
  TimetableLine,
  StationTimetable,
  TimetableDeparture,
} from '../utils/diaTimetable';

const DAY = 86400;

// 路線コード(Y/NI/SC/TC)ごとの路線カラー。駅の一覧にある色と同じにする
const lineColor = (code: string): string => REGISTERABLE_LINES.find((l) => l.code === code)?.color ?? '#8B5CF6';

const stationCode = (lineCode: string, idx: number): string => `${lineCode}${String(idx + 1).padStart(2, '0')}`;

// 0時から4時までは、前日のダイヤの続き(24時台・25時台)として扱う
const nowAsServiceSec = (now: Date): number => {
  const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return sec < 4 * 3600 ? sec + DAY : sec;
};

const StationBadge: React.FC<{ lineCode: string; idx: number }> = ({ lineCode, idx }) => (
  <span
    className="shrink-0 w-11 text-center text-[10px] font-black text-white rounded-md py-1 leading-none"
    style={{ backgroundColor: lineColor(lineCode) }}
  >
    {stationCode(lineCode, idx)}
  </span>
);

// 別のタブへ移って戻ったときに、時刻表と経路検索のどちらを見ていたかを、アプリを開いているあいだは覚えておく
let lastMode: 'timetable' | 'route' | 'crowd' = 'timetable';

// 公開日の案内から、経路検索の画面を開くために、開く前に切り替えを決めておく
export const presetTimetableMode = (m: 'timetable' | 'route' | 'crowd') => {
  lastMode = m;
};

export const TimetableTab: React.FC = () => {
  const [lines, setLines] = useState<TimetableLine[] | null>(null);
  const [linesError, setLinesError] = useState(false);
  const [linesRetry, setLinesRetry] = useState(0);
  const [lineCode, setLineCode] = useState('Y');
  const [stationIdx, setStationIdx] = useState<number | null>(null);

  const [timetable, setTimetable] = useState<StationTimetable | null>(null);
  const [ttError, setTtError] = useState(false);
  const [ttRetry, setTtRetry] = useState(0);
  const [dirIdx, setDirIdx] = useState(0);
  const [nowSec, setNowSec] = useState(() => nowAsServiceSec(new Date()));
  // 経路検索は、公開日まで隠す(公開前に確かめるときは、URLの末尾に ?preview=1)
  const showRoute = isLaunched();
  const [mode, setModeState] = useState<'timetable' | 'route' | 'crowd'>(lastMode);
  const setMode = (m: 'timetable' | 'route' | 'crowd') => {
    lastMode = m;
    setModeState(m);
  };

  useEffect(() => {
    let alive = true;
    setLinesError(false);
    loadTimetableLines()
      .then((l) => {
        if (alive) setLines(l);
      })
      .catch(() => {
        if (alive) setLinesError(true);
      });
    return () => {
      alive = false;
    };
  }, [linesRetry]);

  useEffect(() => {
    if (stationIdx === null) return;
    let alive = true;
    setTimetable(null);
    setTtError(false);
    loadStationTimetable(lineCode, stationIdx)
      .then((t) => {
        if (!alive) return;
        setTimetable(t);
        // 発車がある方向を、最初に開く
        setDirIdx(t.directions[0].departures.length > 0 ? 0 : 1);
      })
      .catch(() => {
        if (alive) setTtError(true);
      });
    return () => {
      alive = false;
    };
  }, [lineCode, stationIdx, ttRetry]);

  useEffect(() => {
    const timer = setInterval(() => setNowSec(nowAsServiceSec(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);

  const direction = timetable?.directions[dirIdx];

  // 時(24は翌日の0時台)ごとにまとめる
  const rows = useMemo(() => {
    const byHour = new Map<number, TimetableDeparture[]>();
    direction?.departures.forEach((d) => {
      const h = Math.floor(d.sec / 3600);
      byHour.set(h, [...(byHour.get(h) || []), d]);
    });
    return Array.from(byHour.entries()).sort((a, b) => a[0] - b[0]);
  }, [direction]);

  // これから最初に発車する列車(時刻表で目立たせる)
  const nextSec = direction?.departures.find((d) => d.sec >= nowSec)?.sec;

  const nextRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    nextRef.current?.scrollIntoView({ block: 'center' });
  }, [timetable, dirIdx]);

  const currentLine = lines?.find((l) => l.code === lineCode);

  const modeToggle = showRoute ? (
    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="tablist" aria-label="時刻表・経路検索・混雑">
      {([
        ['timetable', '時刻表'],
        ['route', '経路検索'],
        ['crowd', '混雑'],
      ] as const).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          onClick={() => setMode(id)}
          className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mode === id ? 'bg-white text-[#5B21B6] shadow-xs' : 'text-[#6B6380] hover:text-[#221C35]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  // 駅の時刻表
  if (stationIdx !== null) {
    return (
      <div className="max-w-md mx-auto px-4 py-4 pb-28 space-y-3 animate-fadeIn">
        <button
          type="button"
          onClick={() => setStationIdx(null)}
          className="flex items-center gap-1 text-xs font-bold text-[#5B21B6] cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{currentLine?.name ?? '駅'}の駅一覧</span>
        </button>

        <div className="bg-white border border-[#E6E2EE] rounded-2xl p-3.5 flex items-center gap-3 shadow-xs">
          <StationBadge lineCode={lineCode} idx={stationIdx} />
          <div className="min-w-0">
            <div className="text-base font-black text-[#221C35] truncate">{currentLine?.stations[stationIdx]}</div>
            <div className="text-[11px] text-[#857D99]">{currentLine?.name} 時刻表</div>
          </div>
        </div>

        {ttError && (
          <div className="bg-white border border-[#E6E2EE] rounded-2xl p-4 text-center space-y-2">
            <p className="text-xs text-[#6B6380]">時刻表を読み込めませんでした。</p>
            <button
              type="button"
              onClick={() => setTtRetry((n) => n + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#5B21B6] text-white text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>もう一度読み込む</span>
            </button>
          </div>
        )}

        {!ttError && !timetable && <div className="text-center text-xs text-[#857D99] py-10">読み込み中…</div>}

        {timetable && (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="tablist" aria-label="方面">
              {timetable.directions.map((d, i) => (
                <button
                  key={d.code}
                  type="button"
                  role="tab"
                  aria-selected={dirIdx === i}
                  onClick={() => setDirIdx(i)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer truncate px-1 ${
                    dirIdx === i ? 'bg-white text-[#5B21B6] shadow-xs' : 'text-[#6B6380] hover:text-[#221C35]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {direction && direction.departures.length === 0 ? (
              <div className="bg-white border border-[#E6E2EE] rounded-2xl p-5 text-center text-xs text-[#6B6380]">
                この方向に発車する列車はありません。
                <br />
                （終着駅です。反対の方向をご覧ください）
              </div>
            ) : (
              <div className="bg-white border border-[#E6E2EE] rounded-2xl overflow-hidden shadow-xs">
                <div className="px-3 py-2 bg-[#EFE8FA] text-[10px] text-[#6B6380] font-bold flex justify-between gap-2">
                  <span>おもな行き先: {direction?.mainDest}行</span>
                  <span>全日共通のダイヤ</span>
                </div>
                {rows.map(([hour, deps]) => (
                  <div key={hour} className="flex items-start border-t border-[#EFEDF5]">
                    <div className="w-10 shrink-0 text-center py-2.5 text-sm font-black text-[#221C35] bg-[#F9F8FD] self-stretch border-r border-[#EFEDF5]">
                      {hour}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-3 py-2">
                      {deps.map((d, i) => {
                        const isNext = d.sec === nextSec;
                        const m = formatDiaTime(d.sec).slice(3);
                        return (
                          <div
                            key={`${d.sec}-${i}`}
                            ref={isNext ? nextRef : undefined}
                            className={`flex flex-col items-center leading-tight rounded-md px-1 ${
                              isNext ? 'bg-[#5B21B6] text-white' : 'text-[#221C35]'
                            }`}
                          >
                            <span className={`text-[9px] font-bold ${isNext ? 'text-white/90' : d.paid ? 'text-amber-600' : 'text-[#857D99]'}`}>
                              {d.typeAbbr}
                              {d.dest !== direction?.mainDest ? ` ${d.dest}` : ''}
                            </span>
                            <span className="text-sm font-mono font-black">{m}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[10px] text-[#857D99] leading-relaxed px-1">
              {timetable.types.map((t) => `${t.abbr}…${t.name}${t.paid ? '(有料)' : ''}`).join(' / ')}
              <br />
              24は、翌日の0時台です。表示は予定の時刻で、遅れは反映されません。
            </div>
          </>
        )}
      </div>
    );
  }

  // 経路検索
  if (showRoute && mode === 'route') {
    return (
      <div className="max-w-md mx-auto px-4 py-4 pb-28 space-y-3 animate-fadeIn">
        <h2 className="text-base font-black text-[#221C35]">経路検索</h2>
        {modeToggle}
        <RouteSearch />
      </div>
    );
  }

  // 混雑予報(公開後だけ)
  if (showRoute && mode === 'crowd') {
    return (
      <div className="max-w-md mx-auto px-4 py-4 pb-28 space-y-3 animate-fadeIn">
        <h2 className="text-base font-black text-[#221C35]">混雑予報</h2>
        {modeToggle}
        <CrowdForecast />
      </div>
    );
  }

  // 路線と駅の一覧
  return (
    <div className="max-w-md mx-auto px-4 py-4 pb-28 space-y-3 animate-fadeIn">
      <h2 className="text-base font-black text-[#221C35]">時刻表</h2>
      {modeToggle}

      {linesError && (
        <div className="bg-white border border-[#E6E2EE] rounded-2xl p-4 text-center space-y-2">
          <p className="text-xs text-[#6B6380]">駅の一覧を読み込めませんでした。</p>
          <button
            type="button"
            onClick={() => setLinesRetry((n) => n + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#5B21B6] text-white text-xs font-bold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>もう一度読み込む</span>
          </button>
        </div>
      )}

      {!linesError && !lines && <div className="text-center text-xs text-[#857D99] py-10">読み込み中…</div>}

      {lines && (
        <>
          <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="路線">
            {lines.map((l) => (
              <button
                key={l.code}
                type="button"
                role="tab"
                aria-selected={lineCode === l.code}
                onClick={() => setLineCode(l.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  lineCode === l.code
                    ? 'bg-white border-[#5B21B6] text-[#221C35] shadow-xs'
                    : 'bg-[#EFEDF5] border-transparent text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: lineColor(l.code) }} />
                <span className="truncate">{l.name}</span>
              </button>
            ))}
          </div>

          <div className="bg-white border border-[#E6E2EE] rounded-2xl overflow-hidden shadow-xs">
            {currentLine?.stations.map((name, idx) => (
              <button
                key={`${name}-${idx}`}
                type="button"
                onClick={() => setStationIdx(idx)}
                className="w-full flex items-center gap-3 px-3.5 py-3 border-b border-[#EFEDF5] last:border-b-0 hover:bg-[#F4F3F8] active:bg-[#EFE8FA] transition-colors cursor-pointer text-left"
              >
                <StationBadge lineCode={lineCode} idx={idx} />
                <span className="flex-1 text-sm font-bold text-[#221C35] truncate">{name}</span>
                <ChevronRight className="w-4 h-4 text-[#B4ADC4] shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
