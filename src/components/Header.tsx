import React from 'react';
import { QrCode } from 'lucide-react';
import { TabType, UserProfile } from '../types';
import { UserAvatar } from './UserAvatar';

interface HeaderProps {
  nPointBalance?: number;
  onOpenNPointModal?: () => void;
  onOpenQRCodeModal?: () => void;
  onOpenRouteMapModal?: () => void;
  onOpenNotificationModal?: () => void;
  onOpenMyPage?: () => void;
  activeTab?: TabType;
  onChangeTab?: (tab: TabType) => void;
  currentStationName?: string;
  currentPlatform?: 1 | 2;
  isLoggedIn?: boolean;
  currentUser?: UserProfile | null;
  onOpenLoginModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  nPointBalance = 0,
  onOpenNPointModal,
  onOpenQRCodeModal,
  onOpenMyPage,
  isLoggedIn = false,
  currentUser = null,
  onOpenLoginModal,
}) => {
  return (
    <header className="bg-white border-b border-[#E6E2EE] text-[#221C35] sticky top-0 z-40 shadow-xs transition-all">
      <div className="max-w-4xl mx-auto px-4 py-2.5">
        {/* Main Header Bar */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: App Logo & Header Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Custom Brand Logo Icon */}
            <div className="w-8 h-8 shrink-0 relative">
              <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full rounded-xl shadow-xs"
              >
                {/* Background */}
                <rect width="100" height="100" rx="22" fill="#521EB7" />
                
                {/* Slanted Bold White N */}
                <path
                  d="M 34 22 H 45.5 L 60.5 59.5 L 68 22 H 78.5 L 66 78 H 54.5 L 39.5 40.5 L 32 78 H 21.5 Z"
                  fill="white"
                />
                
                {/* Dynamic Purple Swoosh Arc */}
                <path
                  d="M 20 70 C 24 61 37 51 55 44 C 73 37 85 37 91 38 C 76 43 54 50 34 63 C 25 69 20 70 20 70 Z"
                  fill="#9772EC"
                  fillOpacity="0.95"
                />

                {/* 4-point Sparkle Star */}
                <path
                  d="M 88 83 C 88 85.5 89.5 87 92 87 C 89.5 87 88 88.5 88 91 C 88 88.5 86.5 87 84 87 C 86.5 87 88 85.5 88 91 Z"
                  fill="#C4B5FD"
                />
              </svg>
            </div>

            {/* Title: 神埼線アプリ */}
            <h1 className="text-base sm:text-lg font-black text-[#221C35] tracking-tight truncate">
              神埼線アプリ
            </h1>
          </div>

          {/* Right: Round User Avatar Icon & QR Code */}
          <div className="flex items-center gap-2 shrink-0">
            {isLoggedIn && currentUser ? (
              <button
                type="button"
                onClick={onOpenMyPage}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full ring-2 ring-[#708BD6]/50 hover:ring-[#5B21B6] transition-all cursor-pointer relative shrink-0 shadow-2xs hover:scale-105 active:scale-95 flex items-center justify-center p-0 overflow-hidden"
                title={`${currentUser.name} さんのマイページ（利用履歴・アカウント設定）`}
              >
                <UserAvatar className="w-full h-full" />
                <span className="sr-only">マイページ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLoginModal}
                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-[#221C35] hover:bg-[#3B1F68] text-white transition-all cursor-pointer shadow-xs flex items-center gap-1.5 text-xs font-bold"
                title="神埼IDログイン"
              >
                <div className="w-4 h-4 rounded-full overflow-hidden shrink-0">
                  <UserAvatar className="w-full h-full" />
                </div>
                <span>ログイン</span>
              </button>
            )}

            {/* QR Code Icon Button triggers N-POINT Modal - ログイン時のみ表示 */}
            {isLoggedIn && (
              <button
                type="button"
                onClick={onOpenNPointModal}
                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 transition-all cursor-pointer border border-gray-200 flex items-center justify-center gap-1.5 h-8 sm:h-9 w-8 sm:w-9"
                title="N-POINTを表示"
              >
                <QrCode className="w-4 h-4 text-[#5B21B6]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};


