import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadTimetableLines, TimetableLine } from '../utils/diaTimetable';
import {
  CROWD_LEVELS,
  CrowdDay,
  CrowdSlots,
  SLOT_COUNT,
  crowdInfo,
  currentSlot,
  dayTypeOf,
  loadCrowdSlots,
  slotLabel,
} from '../utils/crowd';

// 混雑予報の一覧(公開後だけ。時刻表タブの「混雑」)。駅(縦)× 30分の時間帯(横)の、混雑レベルの色分け。
// 仮想の住民による、模擬の混雑(実在の混雑ではない)。
const CELL_W = 26;
const NAME_W = 92;

// 方向コード(ダイヤのデータの dirs): 環状線は 外回り=O・内回り=I、それ以外は D・U
const dirCodes = (line: TimetableLine): [string, string] => (line.loop ? ['O', 'I'] : ['D', 'U']);

export const CrowdForecast: React.FC = () => {
  const [lines, setLines] = useState<TimetableLine[] | null>(null);
  const [lineCode, setLineCode] = useState('Y');
  const [dirIdx, setDirIdx] = useState(0);
  const [day, setDay] = useState<CrowdDay>(() => dayTypeOf(Date.now()));
  const [slots, setSlots] = useState<CrowdSlots | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState<{ station: string; slot: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadTimetableLines()
      .then((l) => alive && setLines(l))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [retry]);

  useEffect(() => {
    let alive = true;
    setSlots(null);
    setError(false);
    loadCrowdSlots(day)
      .then((s) => alive && setSlots(s))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [day, retry]);

  const line = lines?.find((l) => l.code === lineCode);
  const nowSlot = currentSlot(new Date());

  // 表の行(駅)。下り(D・外回り)は路線の並び順、上り(U・内回り)は逆順
  const rows = useMemo(() => {
    if (!line) return [];
    const order = dirIdx === 0 ? line.stations : [...line.stations].reverse();
    const code = dirCodes(line)[dirIdx];
    return order.map((name) => ({ name, cells: slots?.[line.code]?.[code]?.[name] ?? '' }));
  }, [line, dirIdx, slots]);

  // 開いたとき・切り替えたとき、いまの時間帯が見えるように横へ動かす(いまが範囲外なら、朝の7時ごろ)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !slots) return;
    const slot = nowSlot ?? 4;
    el.scrollLeft = Math.max(0, (slot - 2) * CELL_W);
  }, [slots, lineCode, dirIdx, day]);

  useEffect(() => setPicked(null), [lineCode, dirIdx, day]);

  const dirLabel = (i: number): string => {
    if (!line) return '';
    if (line.loop) return i === 0 ? '外回り' : '内回り';
    return `${line.stations[i === 0 ? line.stations.length - 1 : 0]}方面`;
  };

  const info = picked ? crowdInfo(Number(rows.find((r) => r.name === picked.station)?.cells[picked.slot] ?? 0)) : undefined;

  return (
    <div className="space-y-3">
      {/* 路線 */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
        {lines?.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => {
              setLineCode(l.code);
              setDirIdx(0);
            }}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              l.code === lineCode ? 'bg-[#5B21B6] text-white border-[#5B21B6]' : 'bg-white text-[#6B6380] border-[#E6E2EE] hover:text-[#221C35]'
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      {/* 方面・平日/土休日 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="radiogroup" aria-label="方面">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={dirIdx === i}
              onClick={() => setDirIdx(i)}
              className={`py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                dirIdx === i ? 'bg-white text-[#5B21B6] shadow-xs' : 'text-[#6B6380] hover:text-[#221C35]'
              }`}
            >
              {dirLabel(i)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="radiogroup" aria-label="平日と土休日">
          {([['wd', '平日'], ['we', '土休日']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={day === id}
              onClick={() => setDay(id)}
              className={`py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                day === id ? 'bg-white text-[#5B21B6] shadow-xs' : 'text-[#6B6380] hover:text-[#221C35]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {CROWD_LEVELS.map((l) => (
          <span key={l.level} className="inline-flex items-center gap-1 text-[10px] text-[#6B6380]">
            <span className="inline-block w-3 h-3 rounded-sm border border-black/10" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl bg-white border border-[#E6E2EE] p-4 text-center text-xs text-[#6B6380] space-y-2">
          <div>混雑の情報を読み込めませんでした。</div>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="px-3 py-1.5 rounded-lg bg-[#5B21B6] text-white font-bold cursor-pointer">
            もう一度読み込む
          </button>
        </div>
      ) : !slots || !line ? (
        <div className="rounded-xl bg-white border border-[#E6E2EE] p-6 text-center text-xs text-[#857D99]">読み込み中…</div>
      ) : (
        <div className="rounded-xl bg-white border border-[#E6E2EE] overflow-hidden">
          <div ref={scrollRef} className="overflow-x-auto" style={{ overscrollBehaviorX: 'contain' }}>
            <div style={{ width: NAME_W + CELL_W * SLOT_COUNT }}>
              {/* 時刻の見出し(1時間ごと) */}
              <div className="flex sticky top-0 z-10 bg-white border-b border-[#E6E2EE]">
                <div className="sticky left-0 z-20 bg-white border-r border-[#E6E2EE] shrink-0" style={{ width: NAME_W }} />
                {Array.from({ length: SLOT_COUNT }).map((_, s) => (
                  <div
                    key={s}
                    className={`shrink-0 text-[9px] leading-6 text-[#857D99] ${s % 2 === 0 ? 'font-bold' : ''} ${nowSlot === s ? 'text-[#5B21B6]' : ''}`}
                    style={{ width: CELL_W }}
                  >
                    {s % 2 === 0 ? slotLabel(s).slice(0, 2) : ''}
                  </div>
                ))}
              </div>
              {rows.map((row) => (
                <div key={row.name} className="flex border-b border-[#F0EEF6] last:border-b-0">
                  <div
                    className="sticky left-0 z-10 bg-white border-r border-[#E6E2EE] shrink-0 px-2 text-[11px] font-bold text-[#221C35] leading-[26px] truncate"
                    style={{ width: NAME_W }}
                  >
                    {row.name}
                  </div>
                  {Array.from({ length: SLOT_COUNT }).map((_, s) => {
                    const lv = Number(row.cells[s] ?? 0);
                    const li = lv >= 1 ? crowdInfo(lv) : undefined;
                    const isPicked = picked?.station === row.name && picked.slot === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!li}
                        onClick={() => li && setPicked({ station: row.name, slot: s })}
                        aria-label={li ? `${row.name} ${slotLabel(s)} ${li.label}` : undefined}
                        className="shrink-0 h-[26px] border-0 p-0"
                        style={{
                          width: CELL_W,
                          background: li ? li.color : 'transparent',
                          boxShadow: isPicked ? 'inset 0 0 0 2px #221C35' : nowSlot === s ? 'inset 0 0 0 1px rgba(91,33,182,0.55)' : undefined,
                          cursor: li ? 'pointer' : 'default',
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {picked && info && (
        <div className="rounded-xl bg-white border border-[#E6E2EE] p-3 flex items-center gap-3">
          <span className="inline-block w-6 h-6 rounded-md border border-black/10 shrink-0" style={{ background: info.color }} />
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#221C35]">
              {picked.station}・{slotLabel(picked.slot)}〜{slotLabel(picked.slot + 1)}
            </div>
            <div className="text-[11px] text-[#6B6380]">
              {info.label}(乗車率の目安 {info.range})
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[#857D99] leading-relaxed px-1">
        ※仮想の住民が、実際のダイヤの上で動いた様子から作った、模擬の混雑です(実在の混雑ではありません)。駅を出る列車の、30分ごとの平均です。
      </p>
    </div>
  );
};
