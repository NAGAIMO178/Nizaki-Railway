import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, QrCode, Download } from 'lucide-react';
import { ActiveOrder } from '../types';
import { getSeatClassLabel } from '../utils/seatUtils';
import { makeQrMatrix, qrSvgPath, QR_QUIET } from '../utils/qrImage';
import { TICKET_STATE_LABEL, TicketState, fetchAndCacheTicket, readCachedTicketToken } from '../utils/ticketApi';
import { renderTicketPng, saveImage } from '../utils/ticketCard';
import { buildTicketUrl } from '../utils/ticketToken';

interface TicketQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOrder?: ActiveOrder | null;
  sessionToken?: string;
}

// 公開後の QR乗車券: 本物の QR(読み取ると、検札の画面が開く)と、画像での保存
export const TicketQRModal: React.FC<TicketQRModalProps> = ({ isOpen, onClose, activeOrder, sessionToken }) => {
  const orderId = activeOrder?.orderId;
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<TicketState | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  // 端末に残したトークンがあれば、すぐ QR を出す。サーバーには、いまの状態を聞く
  useEffect(() => {
    if (!isOpen || !orderId) return;
    const cached = readCachedTicketToken(orderId);
    setToken(cached);
    setState(null);
    setFailed(false);
    if (!sessionToken) {
      if (!cached) setFailed(true);
      return;
    }
    let alive = true;
    fetchAndCacheTicket(sessionToken, orderId)
      .then((r) => {
        if (!alive) return;
        setToken(r.token ?? cached);
        setState(r.state);
      })
      .catch(() => {
        if (alive && !cached) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [isOpen, orderId, sessionToken, reload]);

  const matrix = useMemo(() => (token ? makeQrMatrix(buildTicketUrl(token)) : null), [token]);

  const seatText = activeOrder ? `${activeOrder.carNo}号車 ${getSeatClassLabel(activeOrder.seatType)} ${activeOrder.seatNo}` : '';

  const handleSave = useCallback(async () => {
    if (!activeOrder || !token || saving) return;
    setSaving(true);
    try {
      const blob = await renderTicketPng({
        token,
        orderId: activeOrder.orderId,
        trainName: activeOrder.trainName,
        departureTime: activeOrder.departureTime,
        boardingStation: activeOrder.boardingStation,
        destinationStation: activeOrder.destinationStation,
        seatText,
        reservedDate: activeOrder.reservedDate,
      });
      await saveImage(blob, `nizaki-ticket-${activeOrder.orderId}.png`);
    } finally {
      setSaving(false);
    }
  }, [activeOrder, token, saving, seatText]);

  if (!isOpen) return null;

  const dimmed = state !== null && state !== 'valid';
  const box = matrix ? matrix.length + QR_QUIET * 2 : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#E0D7F3] relative animate-scaleUp text-[#221C35]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-[#6B6380] hover:bg-[#F4F3F8] transition-all cursor-pointer border border-transparent hover:border-[#E6E2EE]"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 pt-1">
          <div className="w-10 h-10 rounded-2xl bg-[#EFE8FA] border border-[#DDD6FE] flex items-center justify-center text-[#5B21B6] shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <h3 className="text-base font-black text-[#221C35] leading-tight">QR乗車券</h3>
        </div>

        <div className="bg-[#F9F8FD] border border-[#E0D7F3] rounded-2xl p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between border-b border-[#E6E2EE] pb-2">
            <span className="text-[#6B6380] font-medium">乗車券種別</span>
            <span className="font-extrabold text-[#5B21B6] bg-[#EFE8FA] px-2.5 py-0.5 rounded-md border border-[#DDD6FE] text-[10px]">
              {activeOrder ? '特急券・乗車券 一体型' : '有効な特急券はありません'}
            </span>
          </div>

          {activeOrder ? (
            <div className="space-y-1.5 pt-0.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6B6380]">対象列車:</span>
                <span className="font-bold text-[#221C35]">{activeOrder.trainName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6B6380]">ご乗車区間:</span>
                <span className="font-bold text-[#221C35]">
                  {activeOrder.boardingStation || '—'} → {activeOrder.destinationStation || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6B6380]">着席指定:</span>
                <span className="font-extrabold text-[#5B21B6]">{seatText}</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[#6B6380] leading-relaxed pt-0.5">「予約」タブで特急券を予約すると、ここに予約内容が表示されます。</p>
          )}
        </div>

        {activeOrder && (
          <div className="bg-[#221C35] rounded-2xl p-5 text-white text-center space-y-3 shadow-inner">
            <div className="relative bg-white rounded-2xl inline-block shadow-lg border-2 border-[#8B5CF6] overflow-hidden">
              {matrix ? (
                <svg viewBox={`0 0 ${box} ${box}`} className={`w-44 h-44 block transition-opacity ${dimmed ? 'opacity-15' : ''}`} shapeRendering="crispEdges" role="img" aria-label="QR乗車券">
                  <rect width={box} height={box} fill="#FFFFFF" />
                  <path transform={`translate(${QR_QUIET} ${QR_QUIET})`} d={qrSvgPath(matrix)} fill="#221C35" />
                </svg>
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-xs font-bold text-[#857D99]">
                  {failed ? (
                    <button
                      type="button"
                      onClick={() => setReload((n) => n + 1)}
                      className="bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer"
                    >
                      もう一度
                    </button>
                  ) : (
                    '準備しています…'
                  )}
                </div>
              )}
              {dimmed && state && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black text-[#221C35] bg-white/90 border border-[#E6E2EE] rounded-xl px-4 py-1.5">{TICKET_STATE_LABEL[state]}</span>
                </div>
              )}
            </div>
            <div className="text-[11px] font-mono font-bold text-[#DDD6FE] tracking-wider">{activeOrder.orderId}</div>
          </div>
        )}

        {activeOrder && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!token || saving}
            className="w-full bg-[#EFE8FA] hover:bg-[#E0D5F5] disabled:opacity-50 text-[#5B21B6] font-bold text-xs py-3 rounded-xl border border-[#DDD6FE] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{saving ? '作っています…' : '画像で保存'}</span>
          </button>
        )}

        <p className="text-[11px] text-center text-[#857D99] leading-relaxed">※本アプリは架空の鉄道を題材にしたフィクションです。</p>

        <button
          onClick={onClose}
          className="w-full bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs py-3 rounded-xl shadow-xs transition-all cursor-pointer"
        >
          閉じる
        </button>
      </div>
    </div>
  );
};
