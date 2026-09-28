import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Map, Layers, ExternalLink } from 'lucide-react';

import kanzakiMapImg from '../assets/images/kanzaki_network_map_1786055034131.jpg';
import tsuchiuraMapImg from '../assets/images/tsuchiura_line_map_1786055045386.jpg';

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

  if (!isOpen) return null;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.75));
  const handleResetZoom = () => setZoomLevel(1);

  const currentImgSrc = activeMap === 'kanzaki_network' ? kanzakiMapImg : tsuchiuraMapImg;
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
              <div className="text-[10px] text-[#5B21B6] font-extrabold uppercase tracking-wider">神埼鉄道 公式路線図</div>
              <h3 className="text-base font-black text-[#221C35]">{currentTitle}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
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

            <a
              href={currentImgSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-xs font-bold text-[#5B21B6] bg-[#EFE8FA] hover:bg-[#E2D8F3] px-3 py-2 rounded-xl transition-colors"
              title="新しいタブで画像を開く"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>原寸表示</span>
            </a>

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

        {/* Image Display Viewport */}
        <div className="flex-1 bg-slate-900 relative overflow-auto p-4 flex items-center justify-center min-h-0 select-none">
          <div
            className="transition-transform duration-200 ease-out origin-center flex items-center justify-center max-w-full"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            <img
              src={currentImgSrc}
              alt={currentTitle}
              referrerPolicy="no-referrer"
              className="max-w-full h-auto rounded-xl shadow-2xl border border-slate-700/50 object-contain"
            />
          </div>
        </div>

        {/* Modal Footer / Guidance */}
        <div className="bg-[#F9F8FD] px-4 py-3 border-t border-[#E6E2EE] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 text-[#221C35] font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5B21B6] inline-block" />
            <span>神埼鉄道グループ 公式路線図画像</span>
          </div>

          <div className="text-[11px] text-[#6B6380]">
            ズームボタンまたは「原寸表示」で地理・路線情報を拡大確認できます
          </div>
        </div>
      </div>
    </div>
  );
};
