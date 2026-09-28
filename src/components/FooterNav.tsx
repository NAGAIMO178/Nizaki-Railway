import React from 'react';
import { Home, MapPin, Ticket, UtensilsCrossed, Flag, Settings, Sparkles } from 'lucide-react';
import { TabType } from '../types';

interface FooterNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  hasActiveOrder?: boolean;
}

export const FooterNav: React.FC<FooterNavProps> = ({
  activeTab,
  onChangeTab,
  hasActiveOrder,
}) => {
  const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    {
      id: 'home',
      label: 'ホーム',
      icon: <Home className="w-5 h-5" />,
    },
    {
      id: 'location',
      label: '列車位置',
      icon: <MapPin className="w-5 h-5" />,
    },
    {
      id: 'reservation',
      label: '予約',
      icon: <Ticket className="w-5 h-5" />,
    },
    {
      id: 'equip',
      label: 'デリバリー',
      icon: <UtensilsCrossed className="w-5 h-5" />,
      badge: hasActiveOrder,
    },
    {
      id: 'events',
      label: 'イベント',
      icon: <Flag className="w-5 h-5" />,
    },
    {
      id: 'settings',
      label: '設定',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <nav className="bg-white/95 backdrop-blur-md text-[#221C35] border-t border-[#E6E2EE] fixed bottom-0 left-0 right-0 z-40 px-2 py-1.5 shadow-md">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'text-[#5B21B6] font-bold'
                  : 'text-[#857D99] hover:text-[#221C35]'
              }`}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#5B21B6]" />
                )}
              </div>

              <span className="text-[10px] mt-0.5 tracking-tight font-medium">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
