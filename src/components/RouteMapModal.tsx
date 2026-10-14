import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Map, Layers, RefreshCw } from 'lucide-react';
import { loadMasterSummary } from '../utils/diaTimetable';
import { buildNetworkMap, buildTsuchiuraRows, NetworkMap, TcRow } from '../utils/routeMapLayout';
import { NetworkMapSvg, TsuchiuraList } from './RouteMapSvg';

interface RouteMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMapTab?: 'kanzaki_network' | 'tsuchiura_line';
}

export const RouteMapModal: React.FC<RouteMapModalProps> = ({
  isOpen,
  onClose,
  initialMapTab = 'kanzaki_network',
}) => {
  const [activeMap, setActiveMap] = useState<'kanzaki_network' | 'tsuchiura_line'>(initialMapTab);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  // 路線図は、ダイヤのデータ(駅の並び)から描く。開いたときに、読み込む
  const [network, setNetwork] = useState<NetworkMap | null>(null);
  const [tcRows, setTcRows] = useState<TcRow[] | null>(null);
  const [lineNames, setLineNames] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isOpen || network) return;
    let alive = true;
    setLoadError(false);
    loadMasterSummary()
      .then((m) => {
        if (!alive) return;
        setNetwork(buildNetworkMap(m));
        setTcRows(buildTsuchiuraRows(m));
        setLineNames(Object.fromEntries(Object.entries(m).map(([code, v]) => [code, v.name])));
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [isOpen, network, retry]);

  if (!isOpen) return null;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.5, 4.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.5, 1));
  const handleResetZoom = () => setZoomLevel(1);

  const currentTitle = activeMap === 'kanzaki_network'
    ? '神埼・神埼高速・埼千環状 路線図'
    : '土浦線 路線図 (松戸〜日立)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white text-[#221C35] w-full max-w-5xl rounded-3xl border border-[#E6E2EE] shadow-2xl overflow-hidden flex flex-col h-[92vh]">
        {/* Modal Header */}
        <div className="bg-[#F9F8FD] px-4 py-3 border-b border-[#E6E2EE] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#5B21B6] text-white flex items-center justify-center shadow-xs">
              <Map className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-[#5B21B6] font-extrabold uppercase tracking-wider">神埼鉄道 路線図</div>
              <h3 className="text-base font-black text-[#221C35]">{currentTitle}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls(土浦線は縦の一覧なので、拡大は、神埼・高速・環状の路線図だけ) */}
            {activeMap === 'kanzaki_network' && (
            <div className="flex items-center gap-1 bg-white border border-[#E6E2EE] rounded-xl p-1 shadow-2xs">
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg hover:bg-[#F4F3F8] text-[#6B6380] hover:text-[#221C35] transition-colors cursor-pointer"
                title="縮小"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-bold px-2 text-[#5B21B6]">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg hover:bg-[#F4F3F8] text-[#6B6380] hover:text-[#221C35] transition-colors cursor-pointer"
                title="拡大"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1.5 rounded-lg hover:bg-[#F4F3F8] text-[#6B6380] hover:text-[#221C35] transition-colors cursor-pointer"
                title="リセット"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            )}


            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#EFE8FA] text-[#6B6380] hover:text-[#221C35] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Map Switcher Tabs */}
        <div className="bg-[#F4F3F8] p-2 border-b border-[#E6E2EE] flex items-center gap-2 shrink-0 overflow-x-auto">
          <button
            onClick={() => {
              setActiveMap('kanzaki_network');
              setZoomLevel(1);
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
              activeMap === 'kanzaki_network'
                ? 'bg-[#5B21B6] text-white shadow-md'
                : 'bg-white text-[#6B6380] hover:text-[#221C35] border border-[#E6E2EE]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>神埼・神埼高速・埼千環状 路線図</span>
          </button>

          <button
            onClick={() => {
              setActiveMap('tsuchiura_line');
              setZoomLevel(1);
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
              activeMap === 'tsuchiura_line'
                ? 'bg-[#10B981] text-white shadow-md'
                : 'bg-white text-[#6B6380] hover:text-[#221C35] border border-[#E6E2EE]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>土浦線 路線図 (松戸〜日立)</span>
          </button>
        </div>

        {/* 路線図の表示(ズームで拡大すると、横に動かせる) */}
        <div className="flex-1 bg-slate-100 relative overflow-auto min-h-0">
          {loadError ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-xs text-[#6B6380]">路線図を読み込めませんでした。</p>
              <button
                type="button"
                onClick={() => setRetry((n) => n + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#5B21B6] text-white text-xs font-bold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>もう一度読み込む</span>
              </button>
            </div>
          ) : !network || !tcRows ? (
            <div className="p-10 text-center text-xs text-[#857D99]">読み込み中…</div>
          ) : activeMap === 'kanzaki_network' ? (
            <div style={{ width: `${zoomLevel * 100}%` }} className="bg-white">
              <NetworkMapSvg map={network} names={lineNames} />
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <TsuchiuraList rows={tcRows} lineName={lineNames.TC || '土浦線'} />
            </div>
          )}
        </div>

        {/* Modal Footer / Guidance */}
        <div className="bg-[#F9F8FD] px-4 py-3 border-t border-[#E6E2EE] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 text-[#221C35] font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5B21B6] inline-block" />
            <span>神埼鉄道グループ 路線図</span>
          </div>

          <div className="text-[11px] text-[#6B6380]">
            駅の並びは、時刻表・経路検索と同じデータです。
            {activeMap === 'kanzaki_network' && 'スマホでは、拡大ボタンで大きくしてご覧ください'}
          </div>
        </div>
      </div>
    </div>
  );
};
