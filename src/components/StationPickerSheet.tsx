import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader, LocateFixed, Search } from 'lucide-react';
import { REGISTERABLE_LINES } from './MyStationRegisterCard';
import { loadTimetableLines } from '../utils/diaTimetable';
import type { TimetableLine } from '../utils/diaTimetable';
import { buildPickerData, filterPickerStations, loadRecentStations, searchNearestForPicker, showPickerExtras } from '../utils/stationPicker';
import type { PickerStation } from '../utils/stationPicker';
import { useDragToDismiss } from '../utils/useDragToDismiss';

import { useBackClose } from '../utils/backClose';
interface StationPickerSheetProps {
  isOpen: boolean;
  title: string; // 例: 出発駅
  value: string; // いま選んでいる駅(空もある)
  stations: string[]; // 経路検索で選べる駅
  exclude?: string[]; // 選べなくする駅(経由駅で、出発・到着・ほかの経由駅)
  nearest?: string; // 最寄り駅(位置情報が許可されて、分かったとき)
  onLocate?: () => Promise<string | null>; // 「最寄り駅を探す」を押したとき、最寄り駅を探す(渡されたときだけ、その行を出す。見つからなければ null)
  onSelect: (name: string) => void;
  onClose: () => void;
}

const lineColor = (code: string): string => REGISTERABLE_LINES.find((l) => l.code === code)?.color ?? '#8B5CF6';

export const StationPickerSheet: React.FC<StationPickerSheetProps> = ({ isOpen, title, value, stations, exclude = [], nearest, onLocate, onSelect, onClose }) => {
  const drag = useDragToDismiss(onClose);
  const [lines, setLines] = useState<TimetableLine[] | null>(null);
  const [query, setQuery] = useState('');
  const [lineCode, setLineCode] = useState<string>('all');
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 「最寄り駅を探す」: 探している最中か・探した結果の知らせ。閉じたり開き直したりしたら、前の探しの結果は使わない
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);
  const findRun = useRef(0);

  useEffect(() => {
    findRun.current++;
    setFinding(false);
    setFindNote(null);
  }, [isOpen]);

  // 開くたびに、入力と路線を戻す
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setLineCode('all');
    setRecent(loadRecentStations());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || lines) return;
    let alive = true;
    loadTimetableLines()
      .then((l) => alive && setLines(l))
      .catch(() => alive && setLines([])); // 読めなくても、駅の一覧は出す(路線の絞り込みなし)
    return () => {
      alive = false;
    };
  }, [isOpen, lines]);

  // シートを開いているあいだは、うしろの画面をスクロールさせない
  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const prevBody = document.body.style.overflow;
    const prevHtml = html.style.overflow;
    document.body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const data = useMemo(() => buildPickerData(lines ?? [], stations), [lines, stations]);
  const blocked = useMemo(() => new Set(exclude.filter((n) => n !== value)), [exclude, value]);
  const base = lineCode === 'all' ? data.all : data.byLine[lineCode] ?? [];
  const shown = filterPickerStations(base, query).filter((s) => !blocked.has(s.name));
  const byName = useMemo(() => new Map(data.all.map((s) => [s.name, s])), [data]);
  const pick = (name: string) => onSelect(name);

  const findNearest = async () => {
    if (!onLocate || finding) return;
    const run = ++findRun.current;
    setFinding(true);
    setFindNote(null);
    const r = await searchNearestForPicker(onLocate, blocked);
    if (run !== findRun.current) return; // 探しているあいだに、閉じた・開き直した
    setFinding(false);
    if (r.kind === 'found') pick(r.name);
    else setFindNote(r.kind === 'taken' ? '最寄り駅は、ほかの欄で選んでいます' : '見つかりませんでした');
  };

  useBackClose(isOpen, onClose);
  if (!isOpen) return null;

  const Row: React.FC<{ s: PickerStation; showCode: boolean }> = ({ s, showCode }) => {
    const code = showCode ? s.lines.find((l) => l.code === lineCode)?.stationCode : undefined;
    return (
      <button
        type="button"
        onClick={() => pick(s.name)}
        className="w-full flex items-center gap-2.5 px-4 py-3 border-t border-[#F3F1F8] text-left cursor-pointer hover:bg-[#F9F8FD] active:bg-[#EFE8FA]"
      >
        {code && <span className="shrink-0 w-11 text-center text-[10px] font-black text-white rounded-md py-1 leading-none" style={{ backgroundColor: lineColor(lineCode) }}>{code}</span>}
        <span className={`flex-1 min-w-0 text-[15px] font-bold truncate ${s.name === value ? 'text-[#5B21B6]' : 'text-[#221C35]'}`}>{s.name}</span>
        {!code && (
          <span className="flex items-center gap-1 shrink-0">
            {s.lines.map((l) => (
              <span key={l.code} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lineColor(l.code) }} />
            ))}
          </span>
        )}
        {s.name === value && <Check className="w-4 h-4 text-[#5B21B6] shrink-0" />}
      </button>
    );
  };

  const sectionTitle = (t: string) => <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-[#857D99]">{t}</div>;
  const nearestStation = nearest && !blocked.has(nearest) ? byName.get(nearest) : undefined;
  const recents = recent.map((n) => byName.get(n)).filter((s): s is PickerStation => !!s && !blocked.has(s.name));
  const showExtras = showPickerExtras(lineCode, query);
  const showLocate = showExtras && !!onLocate && !nearest; // 最寄り駅がまだ分かっていないときだけ、探す行を出す

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 animate-fadeIn" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" onClick={onClose} className="flex-1 cursor-default" aria-label={`${title}を選ぶのを閉じる`} />
      <div style={drag.style} className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl h-[85vh] flex flex-col">
        <div {...drag.handleProps} className="shrink-0 px-4 pt-3 pb-1 cursor-grab active:cursor-grabbing select-none">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-[#D1C9E3]" />
        </div>
        <div className="shrink-0 mx-4 my-1.5 flex items-center gap-2 rounded-xl bg-[#F4F3F8] px-3">
          <Search className="w-4 h-4 text-[#857D99] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="駅名"
            aria-label={`${title}を探す`}
            className="flex-1 min-w-0 bg-transparent py-2.5 text-[15px] font-bold text-[#221C35] outline-none placeholder:text-[#B4ADC4] placeholder:font-semibold"
          />
        </div>
        {lines && lines.length > 0 && (
          <div className="shrink-0 flex gap-1.5 overflow-x-auto px-4 pt-1 pb-2 scrollbar-none" role="tablist" aria-label="路線">
            {[{ code: 'all', name: 'すべて' }, ...lines.map((l) => ({ code: l.code, name: l.name }))].map((l) => (
              <button
                key={l.code}
                type="button"
                role="tab"
                aria-selected={lineCode === l.code}
                onClick={() => setLineCode(l.code)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${lineCode === l.code ? 'bg-[#5B21B6] text-white' : 'bg-[#EFEDF5] text-[#6B6380]'}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
        <div ref={drag.contentRef} className="flex-1 overflow-y-auto overscroll-contain pb-6">
          {showLocate && (
            <div className="px-4 pt-2 pb-1">
              <button
                type="button"
                onClick={findNearest}
                disabled={finding}
                aria-busy={finding}
                className="w-full flex items-center gap-2.5 rounded-xl bg-[#F4F0FB] px-3 py-3 text-left text-[15px] font-bold text-[#5B21B6] cursor-pointer active:bg-[#EFE8FA] disabled:cursor-default disabled:opacity-70"
              >
                {finding ? <Loader className="w-4 h-4 shrink-0 animate-spin" /> : <LocateFixed className="w-4 h-4 shrink-0" />}
                <span className="flex-1 min-w-0 truncate">{finding ? '探しています…' : '最寄り駅を探す'}</span>
              </button>
              {findNote && (
                <div role="status" className="px-1 pt-1.5 text-xs font-bold text-[#857D99]">
                  {findNote}
                </div>
              )}
            </div>
          )}
          {showExtras && nearestStation && (
            <>
              {sectionTitle('最寄り駅')}
              <Row s={nearestStation} showCode={false} />
            </>
          )}
          {showExtras && recents.length > 0 && (
            <>
              {sectionTitle('履歴')}
              {recents.map((s) => (
                <Row key={`r-${s.name}`} s={s} showCode={false} />
              ))}
            </>
          )}
          {showExtras && (showLocate || nearestStation || recents.length > 0) && sectionTitle('すべての駅')}
          {shown.map((s) => (
            <Row key={s.name} s={s} showCode={lineCode !== 'all'} />
          ))}
          {shown.length === 0 && <div className="py-10 text-center text-xs text-[#857D99]">該当する駅がありません</div>}
        </div>
      </div>
    </div>
  );
};
