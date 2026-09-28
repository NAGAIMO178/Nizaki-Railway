import React, { useState } from 'react';
import { Star, Check, X, Plus, Info, ChevronDown, ChevronUp } from 'lucide-react';

export interface RegisterableStation {
  id: string;
  name: string;
  code?: string;
  lineName: string;
}

export interface LineStationsData {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string;
  stations: { id: string; name: string; code?: string }[];
}

export const REGISTERABLE_LINES: LineStationsData[] = [
  {
    id: 'kanzaki',
    name: '1. 神埼線',
    code: 'Y',
    color: '#8B5CF6',
    description: '東京から大宮を経由して横浜へ至る「C字型」の大動脈（全23駅）',
    stations: [
      { id: 'Y01', name: '東京', code: 'Y01' },
      { id: 'Y02', name: '浅草', code: 'Y02' },
      { id: 'Y03', name: '北千住', code: 'Y03' },
      { id: 'Y04', name: '足立', code: 'Y04' },
      { id: 'Y05', name: '草加', code: 'Y05' },
      { id: 'Y06', name: '越谷レイクタウン', code: 'Y06' },
      { id: 'Y07', name: '七光台', code: 'Y07' },
      { id: 'Y08', name: '北春日部', code: 'Y08' },
      { id: 'Y09', name: '地下鉄岩槻', code: 'Y09' },
      { id: 'Y10', name: '蓮田', code: 'Y10' },
      { id: 'Y11', name: '丸山', code: 'Y11' },
      { id: 'Y12', name: '大宮', code: 'Y12' },
      { id: 'Y13', name: '朝霞台', code: 'Y13' },
      { id: 'Y14', name: '新座', code: 'Y14' },
      { id: 'Y15', name: 'ひばりヶ丘', code: 'Y15' },
      { id: 'Y16', name: '田無', code: 'Y16' },
      { id: 'Y17', name: '武蔵境', code: 'Y17' },
      { id: 'Y18', name: '中三鷹', code: 'Y18' },
      { id: 'Y19', name: '調布', code: 'Y19' },
      { id: 'Y20', name: '生田', code: 'Y20' },
      { id: 'Y21', name: '溝の口', code: 'Y21' },
      { id: 'Y22', name: '新横浜', code: 'Y22' },
      { id: 'Y23', name: '横浜', code: 'Y23' },
    ],
  },
  {
    id: 'kanzaki_kosoku',
    name: '2. 神埼高速線',
    code: 'NI',
    color: '#3B82F6',
    description: '東京〜横浜間を最短距離で結ぶバイパス路線（全9駅）',
    stations: [
      { id: 'NI01', name: '東京', code: 'NI01' },
      { id: 'NI02', name: '新橋', code: 'NI02' },
      { id: 'NI03', name: '品川', code: 'NI03' },
      { id: 'NI04', name: '大井町', code: 'NI04' },
      { id: 'NI05', name: '平和島', code: 'NI05' },
      { id: 'NI06', name: '地下鉄蒲田', code: 'NI06' },
      { id: 'NI07', name: '川崎', code: 'NI07' },
      { id: 'NI08', name: '鶴見', code: 'NI08' },
      { id: 'NI09', name: '横浜', code: 'NI09' },
    ],
  },
  {
    id: 'saichi_loop',
    name: '3. 埼千環状線',
    code: 'SC',
    color: '#EC4899',
    description: '埼玉県と千葉県の主要都市を円状に結ぶ「メガサークル」路線（全20駅）',
    stations: [
      { id: 'SC01', name: '東京', code: 'SC01' },
      { id: 'SC02', name: '南千住', code: 'SC02' },
      { id: 'SC03', name: '北千住', code: 'SC03' },
      { id: 'SC04', name: '綾瀬', code: 'SC04' },
      { id: 'SC05', name: '松戸', code: 'SC05' },
      { id: 'SC06', name: '柏', code: 'SC06' },
      { id: 'SC07', name: '七光台', code: 'SC07' },
      { id: 'SC08', name: '春日部', code: 'SC08' },
      { id: 'SC09', name: '岩槻', code: 'SC09' },
      { id: 'SC10', name: '大宮公園', code: 'SC10' },
      { id: 'SC11', name: '大宮', code: 'SC11' },
      { id: 'SC12', name: 'さいたま新都心', code: 'SC12' },
      { id: 'SC13', name: '南浦和', code: 'SC13' },
      { id: 'SC14', name: '西青木', code: 'SC14' },
      { id: 'SC15', name: '川口', code: 'SC15' },
      { id: 'SC16', name: '志村坂上', code: 'SC16' },
      { id: 'SC17', name: '上板橋', code: 'SC17' },
      { id: 'SC18', name: '小竹向原', code: 'SC18' },
      { id: 'SC19', name: '池袋', code: 'SC19' },
      { id: 'SC20', name: '新宿', code: 'SC20' },
    ],
  },
  {
    id: 'tsuchiura',
    name: '4. 土浦線',
    code: 'TC',
    color: '#10B981',
    description: '松戸から茨城県の日立までを貫くグループ最長の路線（全22駅）',
    stations: [
      { id: 'TC01', name: '松戸', code: 'TC01' },
      { id: 'TC02', name: '新松戸', code: 'TC02' },
      { id: 'TC03', name: '松が丘', code: 'TC03' },
      { id: 'TC04', name: '柏', code: 'TC04' },
      { id: 'TC05', name: '守谷', code: 'TC05' },
      { id: 'TC06', name: '谷井田', code: 'TC06' },
      { id: 'TC07', name: '森の里', code: 'TC07' },
      { id: 'TC08', name: '荒川沖', code: 'TC08' },
      { id: 'TC09', name: '土浦', code: 'TC09' },
      { id: 'TC10', name: '高浜', code: 'TC10' },
      { id: 'TC11', name: '茨城空港', code: 'TC11' },
      { id: 'TC12', name: '鹿島旭', code: 'TC12' },
      { id: 'TC13', name: '大洗', code: 'TC13' },
      { id: 'TC14', name: '那珂湊', code: 'TC14' },
      { id: 'TC15', name: '平磯', code: 'TC15' },
      { id: 'TC16', name: 'ひたちなか海浜公園', code: 'TC16' },
      { id: 'TC17', name: '久慈川', code: 'TC17' },
      { id: 'TC18', name: '大甕（おおみか）', code: 'TC18' },
      { id: 'TC19', name: '東大沼', code: 'TC19' },
      { id: 'TC20', name: '多賀', code: 'TC20' },
      { id: 'TC21', name: '会瀬（おうせ）', code: 'TC21' },
      { id: 'TC22', name: '日立', code: 'TC22' },
    ],
  },
];

interface MyStationRegisterCardProps {
  registeredStations: RegisterableStation[];
  onUpdateRegisteredStations: (stations: RegisterableStation[]) => void;
}

export const MyStationRegisterCard: React.FC<MyStationRegisterCardProps> = ({
  registeredStations,
  onUpdateRegisteredStations,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeLineId, setActiveLineId] = useState<string>('kanzaki');
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const activeLine = REGISTERABLE_LINES.find((l) => l.id === activeLineId) || REGISTERABLE_LINES[0];

  const handleToggleStation = (st: { id: string; name: string; code?: string }) => {
    const isAlreadyRegistered = registeredStations.some(
      (item) => item.name === st.name && item.lineName === activeLine.name
    );

    if (isAlreadyRegistered) {
      const updated = registeredStations.filter(
        (item) => !(item.name === st.name && item.lineName === activeLine.name)
      );
      onUpdateRegisteredStations(updated);
      setWarningMessage(null);
    } else {
      if (registeredStations.length >= 3) {
        setWarningMessage('マイ駅は最大3駅まで登録可能です。');
        setTimeout(() => setWarningMessage(null), 3000);
        return;
      }
      const newStation: RegisterableStation = {
        id: `${activeLine.id}_${st.id}`,
        name: st.name,
        code: st.code,
        lineName: activeLine.name,
      };
      onUpdateRegisteredStations([...registeredStations, newStation]);
      setWarningMessage(null);
    }
  };

  const handleRemoveStation = (indexToRemove: number) => {
    const updated = registeredStations.filter((_, idx) => idx !== indexToRemove);
    onUpdateRegisteredStations(updated);
    setWarningMessage(null);
  };

  return (
    <div className="bg-white border border-[#E6E2EE] rounded-2xl text-[#221C35] shadow-xs overflow-hidden transition-all">
      {/* Accordion Pull-down Header Bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-2 bg-white hover:bg-[#F4F3F8] transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Star className="w-4 h-4 text-[#5B21B6] fill-[#5B21B6] shrink-0" />
          <span className="text-xs sm:text-sm font-bold text-[#221C35] whitespace-nowrap">マイ駅設定・変更</span>
          <span className="text-xs text-[#857D99] truncate hidden xs:inline">
            ({registeredStations.map((s) => s.name).join('・') || '未登録'})
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="text-[10px] sm:text-xs font-bold text-[#5B21B6] bg-[#EFE8FA] px-2 py-0.5 rounded whitespace-nowrap">
            {registeredStations.length} / 3駅 登録中
          </span>
          <div className="p-0.5 rounded-lg text-[#6B6380]">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Accordion Expanded Content */}
      {isOpen && (
        <div className="p-4 pt-0 border-t border-[#F0EEF6] space-y-4 animate-fadeIn">
          {/* Currently Registered Stations Chips */}
          <div className="space-y-1.5 pt-3">
            <div className="text-[11px] font-bold text-[#6B6380]">登録中のマイ駅（最大3駅）</div>
            {registeredStations.length === 0 ? (
              <div className="text-xs text-[#857D99] bg-[#F4F3F8] p-2.5 rounded-xl text-center border border-[#E6E2EE]">
                下の路線からタップしてマイ駅を登録してください
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {registeredStations.map((st, idx) => (
                  <div
                    key={`${st.id}_${idx}`}
                    className="flex items-center gap-1.5 bg-[#F4F3F8] border border-[#E6E2EE] text-[#221C35] text-xs font-bold px-3 py-1.5 rounded-xl"
                  >
                    <Star className="w-3 h-3 text-[#5B21B6] fill-[#5B21B6]" />
                    <span>{st.name}</span>
                    {st.code && <span className="text-[10px] text-[#857D99]">({st.code})</span>}
                    <button
                      onClick={() => handleRemoveStation(idx)}
                      className="ml-1 text-[#857D99] hover:text-[#221C35] cursor-pointer"
                      title="削除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warning Alert if > 3 */}
          {warningMessage && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center gap-2 animate-fadeIn">
              <Info className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{warningMessage}</span>
            </div>
          )}

          {/* Line Switcher Tabs */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-bold text-[#6B6380]">路線を選択</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {REGISTERABLE_LINES.map((line) => {
                const isActive = activeLineId === line.id;
                return (
                  <button
                    key={line.id}
                    onClick={() => setActiveLineId(line.id)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all text-center truncate cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#5B21B6] text-white shadow-xs'
                        : 'bg-[#F4F3F8] text-[#6B6380] border border-[#E6E2EE] hover:text-[#221C35]'
                    }`}
                  >
                    {line.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#857D99] leading-tight px-0.5">
              {activeLine.description}
            </p>
          </div>

          {/* Stations List for Active Line */}
          <div className="space-y-1 pt-1">
            <div className="text-[11px] font-bold text-[#6B6380] flex items-center justify-between">
              <span>{activeLine.name} の駅一覧</span>
              <span className="text-[10px] text-[#857D99]">タップで追加/解除</span>
            </div>
            <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
              {activeLine.stations.map((st) => {
                const isReg = registeredStations.some(
                  (item) => item.name === st.name && item.lineName === activeLine.name
                );
                return (
                  <button
                    key={st.id}
                    onClick={() => handleToggleStation(st)}
                    className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                      isReg
                        ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                        : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#221C35] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {st.code && (
                        <span className="text-[10px] text-[#857D99] font-mono shrink-0">
                          {st.code}
                        </span>
                      )}
                      <span className="truncate">{st.name}</span>
                    </div>
                    {isReg ? (
                      <Check className="w-3.5 h-3.5 text-[#5B21B6] shrink-0 ml-1" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-[#857D99] shrink-0 ml-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

