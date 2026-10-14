import React, { useEffect, useState } from 'react';
import { ArrowUpDown, Search, RefreshCw } from 'lucide-react';
import { REGISTERABLE_LINES } from './MyStationRegisterCard';
import { formatDiaTime } from '../utils/diaTimetable';
import { loadRouteStations, searchRoutes, RouteResult } from '../utils/routeSearch';

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

const timeLabel = (sec: number): string => formatDiaTime(sec);

export const RouteSearch: React.FC = () => {
  const [stations, setStations] = useState<string[] | null>(null);
  const [stationsError, setStationsError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [from, setFrom] = useState('東京');
  const [to, setTo] = useState('大宮');
  const [timeText, setTimeText] = useState(nowText);
  const [results, setResults] = useState<RouteResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setStationsError(false);
    loadRouteStations()
      .then((s) => {
        if (alive) setStations(s);
      })
      .catch(() => {
        if (alive) setStationsError(true);
      });
    return () => {
      alive = false;
    };
  }, [retry]);

  const handleSearch = async () => {
    setMessage(null);
    setSearchError(false);
    if (from === to) {
      setResults(null);
      setMessage('出発駅と到着駅が同じです。');
      return;
    }
    const sec = toServiceSec(timeText);
    if (sec === null) {
      setMessage('出発の時刻を入れてください。');
      return;
    }
    setSearching(true);
    try {
      setResults(await searchRoutes(from, to, sec));
    } catch {
      setResults(null);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setResults(null);
    setMessage(null);
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

  const selectClass =
    'flex-1 min-w-0 bg-transparent text-sm font-bold text-[#221C35] outline-none py-2 cursor-pointer';

  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#E6E2EE] rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 divide-y divide-[#EFEDF5]">
            <label className="flex items-center gap-2">
              <span className="shrink-0 w-10 text-center text-[10px] font-black text-white bg-[#3B82F6] rounded py-1">出発</span>
              <select className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="出発駅">
                {stations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="shrink-0 w-10 text-center text-[10px] font-black text-white bg-[#EC4899] rounded py-1">到着</span>
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

        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="w-full py-3 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Search className="w-4 h-4" />
          <span>{searching ? '探しています…' : '検索'}</span>
        </button>
      </div>

      {message && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{message}</div>}
      {searchError && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          時刻表を読み込めませんでした。もう一度、検索してください。
        </div>
      )}

      {results && results.length === 0 && (
        <div className="bg-white border border-[#E6E2EE] rounded-2xl p-5 text-center text-xs text-[#6B6380]">
          この時刻以降に、乗れる列車が見つかりませんでした。
          <br />
          （出発の時刻を早めてお試しください）
        </div>
      )}

      {results &&
        results.map((r, i) => (
          <div key={`${r.depSec}-${r.arrSec}`} className="bg-white border border-[#E6E2EE] rounded-2xl shadow-xs overflow-hidden">
            <div className="px-3.5 pt-3 pb-2 flex items-end justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold text-[#857D99]">候補 {i + 1}</div>
                <div className="text-2xl font-black text-[#221C35] font-mono leading-tight">
                  {timeLabel(r.depSec)} <span className="text-[#B4ADC4]">→</span> {timeLabel(r.arrSec)}
                  {r.arrSec >= DAY && <span className="ml-1 text-[10px] font-bold text-[#857D99]">翌</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-black text-[#5B21B6]">{r.minutes}分</div>
                <div className="text-[10px] text-[#857D99]">乗換 {r.transfers}回</div>
              </div>
            </div>

            <div className="px-3.5 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B6380]">
              <span>
                運賃 <span className="font-bold text-[#221C35]">¥{r.fare.toLocaleString()}</span>
              </span>
              <span>営業キロ {r.km.toFixed(1)}km</span>
              {r.hasPaid && <span className="font-bold text-amber-600">特急券が別に必要</span>}
            </div>

            <div className="border-t border-[#EFEDF5] px-3.5 py-2.5 space-y-0">
              {r.legs.map((leg, k) => (
                <React.Fragment key={`${leg.trainNo}-${k}`}>
                  {k > 0 && (
                    <div className="text-[10px] text-[#857D99] py-1.5 pl-3 border-l-2 border-dotted border-[#D8D3E6] ml-1">
                      {leg.from}で乗換（{Math.round((leg.depSec - r.legs[k - 1].arrSec) / 60)}分）
                    </div>
                  )}
                  <div className="flex gap-2.5">
                    <div className="w-1.5 rounded-full shrink-0" style={{ backgroundColor: lineColor(leg.lineCode) }} />
                    <div className="min-w-0 flex-1 py-0.5">
                      <div className="text-[11px] font-bold text-[#221C35]">
                        {leg.lineName}
                        <span className={`ml-1.5 ${leg.paid ? 'text-amber-600' : 'text-[#857D99]'}`}>
                          {leg.typeAbbr} {leg.destLabel}
                        </span>
                      </div>
                      <div className="text-xs text-[#221C35] mt-0.5">
                        <span className="font-bold">{leg.from}</span> <span className="font-mono">{timeLabel(leg.depSec)}</span>
                        <span className="text-[#B4ADC4] mx-1">→</span>
                        <span className="font-bold">{leg.to}</span> <span className="font-mono">{timeLabel(leg.arrSec)}</span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}

      {results && results.length > 0 && (
        <div className="text-[10px] text-[#857D99] leading-relaxed px-1">
          乗換は、4分以上で乗り継げる列車を探しています。運賃は、全区間の営業キロを合わせて計算した普通運賃です。表示は予定の時刻で、遅れは反映されません。
        </div>
      )}
    </div>
  );
};
