import React, { useEffect } from 'react';
import { X, Settings, User, QrCode, Map, LogIn, ChevronRight, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  currentUser: UserProfile | null;
  onOpenSettings: () => void;
  onOpenMyPage: () => void;
  onOpenNPoint: () => void;
  onOpenRouteMap: () => void;
  onOpenLogin: () => void;
  onOpenGuide?: () => void; // NIZAKI 2.0 のご案内を、もう一度見る(公開後だけ渡される)
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  isOpen,
  onClose,
  isLoggedIn,
  currentUser,
  onOpenSettings,
  onOpenMyPage,
  onOpenNPoint,
  onOpenRouteMap,
  onOpenLogin,
  onOpenGuide,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 項目を押したら、メニューを閉じてから開く
  const go = (action: () => void) => () => {
    onClose();
    action();
  };

  const Row: React.FC<{ icon: React.ReactNode; label: string; note?: string; onClick: () => void }> = ({
    icon,
    label,
    note,
    onClick,
  }) => (
    <button
      type="button"
      onClick={go(onClick)}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-[#E6E2EE] hover:bg-[#F4F3F8] active:bg-[#EFE8FA] transition-colors cursor-pointer text-left"
    >
      <span className="text-[#5B21B6] shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[#221C35]">{label}</span>
        {note && <span className="block text-[10px] text-[#857D99] mt-0.5 truncate">{note}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-[#B4ADC4] shrink-0" />
    </button>
  );

  const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-4 py-1.5 bg-[#EFE8FA] text-[11px] font-bold text-[#6B6380]">{children}</div>
  );

  return (
    <div className="fixed inset-0 z-50 flex animate-fadeIn" role="dialog" aria-modal="true" aria-label="メニュー">
      <div className="w-72 max-w-[82%] h-full bg-white shadow-2xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6E2EE]">
          <span className="text-sm font-black text-[#221C35]">メニュー</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B6380] hover:bg-[#F4F3F8] cursor-pointer"
            aria-label="メニューを閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <SectionTitle>アカウント</SectionTitle>
        {isLoggedIn && currentUser ? (
          <>
            <Row icon={<User className="w-5 h-5" />} label="マイページ" note={`${currentUser.name} さん・利用履歴`} onClick={onOpenMyPage} />
            <Row icon={<QrCode className="w-5 h-5" />} label="N-POINT" note="残高・履歴・コード" onClick={onOpenNPoint} />
          </>
        ) : (
          <Row icon={<LogIn className="w-5 h-5" />} label="神埼IDでログイン" note="予約・ポイントのご利用に必要です" onClick={onOpenLogin} />
        )}

        <SectionTitle>案内</SectionTitle>
        <Row icon={<Map className="w-5 h-5" />} label="路線図" onClick={onOpenRouteMap} />
        {onOpenGuide && <Row icon={<Sparkles className="w-5 h-5" />} label="NIZAKI 2.0 のご案内" note="新しい機能を、もう一度見る" onClick={onOpenGuide} />}

        <SectionTitle>設定</SectionTitle>
        <Row icon={<Settings className="w-5 h-5" />} label="設定" note="通知・マイ駅・規約" onClick={onOpenSettings} />

        <div className="mt-auto px-4 py-4 text-[10px] text-[#857D99]">アプリバージョン v{__APP_VERSION__}</div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="flex-1 bg-slate-900/40 backdrop-blur-xs cursor-default"
        aria-label="メニューを閉じる"
      />
    </div>
  );
};
