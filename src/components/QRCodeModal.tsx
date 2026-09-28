import React, { useState, useEffect } from 'react';
import { X, QrCode, ShieldCheck, RefreshCw, Smartphone, CheckCircle, Sparkles } from 'lucide-react';
import { ActiveOrder } from '../types';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOrder?: ActiveOrder | null;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  activeOrder,
}) => {
  const [token, setToken] = useState('8392-1049');
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Regenerate security token every 30s
          const rand1 = Math.floor(1000 + Math.random() * 9000);
          const rand2 = Math.floor(1000 + Math.random() * 9000);
          setToken(`${rand1}-${rand2}`);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#E0D7F3] relative animate-scaleUp text-[#221C35]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-[#6B6380] hover:bg-[#F4F3F8] transition-all cursor-pointer border border-transparent hover:border-[#E6E2EE]"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 pt-1">
          <div className="w-10 h-10 rounded-2xl bg-[#EFE8FA] border border-[#DDD6FE] flex items-center justify-center text-[#5B21B6] shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#221C35] leading-tight">
              QRデジタル乗車券
            </h3>
            <p className="text-[11px] text-[#6B6380] font-medium">
              神埼線 全線ICタッチレス対応
            </p>
          </div>
        </div>

        {/* Active Ticket / Standard Pass Info */}
        <div className="bg-[#F9F8FD] border border-[#E0D7F3] rounded-2xl p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between border-b border-[#E6E2EE] pb-2">
            <span className="text-[#6B6380] font-medium">乗車券種別</span>
            <span className="font-extrabold text-[#5B21B6] bg-[#EFE8FA] px-2.5 py-0.5 rounded-md border border-[#DDD6FE] text-[10px]">
              {activeOrder ? '特急券・乗車券 一体型' : '普通定期券・IC乗車券'}
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
                  {activeOrder.boardingStation || '松戸駅'} → {activeOrder.destinationStation || '日立駅'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#6B6380]">着席指定:</span>
                <span className="font-extrabold text-[#5B21B6]">
                  {activeOrder.carNo}号車 {activeOrder.seatNo}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1 pt-0.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[#6B6380]">区間:</span>
                <span className="font-bold text-[#221C35]">神埼線 全線（東京〜日立）</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B6380]">ステータス:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1 text-[11px]">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>改札入場可能</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Big Animated QR Display Area */}
        <div className="bg-[#221C35] rounded-2xl p-5 text-white text-center space-y-3 relative overflow-hidden shadow-inner">
          <div className="absolute top-2 right-3 text-[10px] text-[#A78BFA] font-mono flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin text-[#A78BFA]" />
            <span>更新まで {timeLeft}s</span>
          </div>

          {/* Simulated High-Res Stylized QR Code SVG */}
          <div className="bg-white p-3 rounded-2xl inline-block shadow-lg border-2 border-[#8B5CF6]">
            <svg
              viewBox="0 0 100 100"
              className="w-40 h-40 text-[#221C35]"
              fill="currentColor"
            >
              {/* Position Detection Patterns */}
              {/* Top-Left */}
              <rect x="5" y="5" width="28" height="28" rx="4" fill="#221C35" />
              <rect x="9" y="9" width="20" height="20" rx="2" fill="white" />
              <rect x="13" y="13" width="12" height="12" rx="1" fill="#5B21B6" />

              {/* Top-Right */}
              <rect x="67" y="5" width="28" height="28" rx="4" fill="#221C35" />
              <rect x="71" y="9" width="20" height="20" rx="2" fill="white" />
              <rect x="75" y="13" width="12" height="12" rx="1" fill="#5B21B6" />

              {/* Bottom-Left */}
              <rect x="5" y="67" width="28" height="28" rx="4" fill="#221C35" />
              <rect x="9" y="71" width="20" height="20" rx="2" fill="white" />
              <rect x="13" y="75" width="12" height="12" rx="1" fill="#5B21B6" />

              {/* Random QR Data Grid Pixels */}
              <rect x="38" y="8" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="48" y="8" width="6" height="6" rx="1" fill="#5B21B6" />
              <rect x="58" y="8" width="6" height="6" rx="1" fill="#221C35" />

              <rect x="38" y="18" width="6" height="6" rx="1" fill="#5B21B6" />
              <rect x="48" y="18" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="58" y="18" width="6" height="6" rx="1" fill="#5B21B6" />

              <rect x="8" y="38" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="18" y="38" width="6" height="6" rx="1" fill="#5B21B6" />
              <rect x="28" y="38" width="6" height="6" rx="1" fill="#221C35" />

              <rect x="38" y="38" width="8" height="8" rx="2" fill="#8B5CF6" />
              <rect x="50" y="38" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="60" y="38" width="8" height="8" rx="2" fill="#5B21B6" />
              <rect x="72" y="38" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="82" y="38" width="6" height="6" rx="1" fill="#5B21B6" />

              <rect x="38" y="50" width="6" height="6" rx="1" fill="#5B21B6" />
              <rect x="48" y="50" width="8" height="8" rx="2" fill="#221C35" />
              <rect x="60" y="50" width="6" height="6" rx="1" fill="#8B5CF6" />
              <rect x="72" y="50" width="8" height="8" rx="2" fill="#5B21B6" />

              <rect x="38" y="62" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="48" y="62" width="6" height="6" rx="1" fill="#5B21B6" />
              <rect x="58" y="62" width="8" height="8" rx="2" fill="#221C35" />
              <rect x="70" y="62" width="6" height="6" rx="1" fill="#8B5CF6" />
              <rect x="80" y="62" width="8" height="8" rx="2" fill="#5B21B6" />

              <rect x="38" y="74" width="8" height="8" rx="2" fill="#5B21B6" />
              <rect x="50" y="74" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="60" y="74" width="6" height="6" rx="1" fill="#8B5CF6" />
              <rect x="70" y="74" width="8" height="8" rx="2" fill="#221C35" />
              <rect x="82" y="74" width="6" height="6" rx="1" fill="#5B21B6" />

              <rect x="38" y="86" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="48" y="86" width="8" height="8" rx="2" fill="#8B5CF6" />
              <rect x="60" y="86" width="6" height="6" rx="1" fill="#5B21B6" />
              <rect x="72" y="86" width="6" height="6" rx="1" fill="#221C35" />
              <rect x="82" y="86" width="8" height="8" rx="2" fill="#5B21B6" />
            </svg>
          </div>

          <div className="font-mono text-sm tracking-widest font-black text-[#DDD6FE]">
            {token}
          </div>
        </div>

        {/* Security & Instructions */}
        <div className="flex items-center justify-between text-[11px] text-[#6B6380] bg-[#F4F3F8] p-2.5 rounded-xl">
          <span className="flex items-center gap-1 text-[#5B21B6] font-bold">
            <ShieldCheck className="w-4 h-4 text-[#5B21B6]" />
            <span>ワンタイム不正防止認証</span>
          </span>
          <span className="text-[10px] text-gray-500 font-mono">30秒毎自動更新</span>
        </div>

        <p className="text-[11px] text-center text-[#857D99] leading-tight">
          改札機または特急車内検札にてリーダーにQRコードをかざしてください。
        </p>

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
