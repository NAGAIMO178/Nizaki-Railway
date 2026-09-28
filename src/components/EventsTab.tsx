import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Train, Award, Gem, 
  ArrowRight, ArrowLeft, RotateCcw, CheckCircle2, 
  Layers, Info, Image as ImageIcon, Calendar, MapPin,
  ChevronRight, Clock, Star
} from 'lucide-react';
import { MysteryTrainApp } from './MysteryTrainApp';
import { MysteryTrainEvent } from './MysteryTrainEvent';
import { DigitalStampRallyBanner } from './DigitalStampRallyBanner';

interface EventsTabProps {
  onAddNPoints?: (points: number, title?: string, type?: 'stamp' | 'coupon') => void;
  isLoggedIn?: boolean;
  onRequireLogin?: (reason: string, onLoggedIn?: () => void) => void;
}

export const EventsTab: React.FC<EventsTabProps> = ({
  onAddNPoints,
  isLoggedIn = false,
  onRequireLogin,
}) => {
  // 選択中のイベントID ('portal': 一覧選択画面, 'mashin': 斬丸と三つの雅石, 'kaitan': 消えた試運転列車)
  const [selectedEventId, setSelectedEventId] = useState<'portal' | 'mashin' | 'kaitan'>(() => {
    try {
      const saved = localStorage.getItem('kanzaki_current_selected_event');
      if (saved === 'mashin' || saved === 'kaitan') {
        return saved;
      }
    } catch {}
    return 'portal';
  });

  // ポスター画像URL（任意指定可能・デフォルトは公式ポスターバナー枠）
  const [customPosterUrl, setCustomPosterUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('kanzaki_custom_event_poster') || '';
    } catch {
      return '';
    }
  });

  // 各イベントの進行状況を取得
  const [mashinProgress, setMashinProgress] = useState<{
    phase: string;
    stonesCount: number;
    isCleared: boolean;
  }>({ phase: 'intro', stonesCount: 0, isCleared: false });

  const [kaitanProgress, setKaitanProgress] = useState<{
    stage: number;
  }>({ stage: 1 });

  // 進行状況の読み込み
  const reloadProgress = () => {
    try {
      const mSaved = localStorage.getItem('kanzaki_mystery_mashin_2026_v1');
      if (mSaved) {
        const parsed = JSON.parse(mSaved);
        setMashinProgress({
          phase: parsed.phase || 'intro',
          stonesCount: (parsed.collectedStoneIds || []).length,
          isCleared: !!parsed.isAllCleared,
        });
      } else {
        setMashinProgress({ phase: 'intro', stonesCount: 0, isCleared: false });
      }

      const kSaved = localStorage.getItem('kanzaki_mystery_stage');
      if (kSaved) {
        setKaitanProgress({ stage: parseInt(kSaved, 10) || 1 });
      } else {
        setKaitanProgress({ stage: 1 });
      }
    } catch {}
  };

  useEffect(() => {
    reloadProgress();
  }, [selectedEventId]);

  // 選択イベントの保存
  const handleSelectEvent = (id: 'portal' | 'mashin' | 'kaitan') => {
    if (id !== 'portal' && !isLoggedIn && onRequireLogin) {
      onRequireLogin('イベント（謎解き・デジタルスタンプラリー）の探索を開始するには、神埼IDログインが必要です。', () => {
        setSelectedEventId(id);
        try {
          localStorage.setItem('kanzaki_current_selected_event', id);
        } catch {}
      });
      return;
    }
    setSelectedEventId(id);
    try {
      localStorage.setItem('kanzaki_current_selected_event', id);
    } catch {}
  };

  // 斬丸イベントの個別リセット（ポータルからのクイック白紙化）
  const handleResetMashin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('『斬丸と三つの雅石』の捜査記録と獲得した雅石を白紙に戻しますか？')) {
      try {
        localStorage.removeItem('kanzaki_mystery_mashin_2026_v1');
      } catch {}
      reloadProgress();
    }
  };

  // 試運転列車イベントの個別リセット
  const handleResetKaitan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('『消えた試運転列車の謎』の探索進捗を白紙に戻しますか？')) {
      try {
        localStorage.removeItem('kanzaki_mystery_stage');
        localStorage.removeItem('kanzaki_mystery_stamps');
      } catch {}
      reloadProgress();
    }
  };

  // =========================================================================
  // VIEW A: 通常画面（参加可能イベント一覧） - 他のタブと統一された神埼鉄道アプリ公式トンマナ
  // =========================================================================
  if (selectedEventId === 'portal') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-5 pb-24 space-y-5 animate-fadeIn text-[#221C35]">
        {/* 1. 画面タイトルヘッダー（他タブと統一されたアイデンティティ） */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#5B21B6] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#221C35] tracking-tight">
                イベント＆特務企画
              </h2>
              <p className="text-xs text-[#6B6380]">
                神埼鉄道 全線72駅を巡る公式体験型謎解き・参加型イベント
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-[#5B21B6] bg-[#EDE9FE] px-2.5 py-1 rounded-full border border-[#DDD8EB]">
            2026年度 特集
          </span>
        </div>

        {/* 2. 公式イベントポスター枠（ヘッダーバナー画像） */}
        <DigitalStampRallyBanner customImageUrl={customPosterUrl} />

        {/* 3. 参加可能イベント一覧（選択してください） */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#5B21B6]" />
              <h3 className="text-sm font-bold text-[#221C35]">
                参加可能イベント（タップして開始）
              </h3>
            </div>
            <span className="text-xs text-[#6B6380]">2件の特命事件</span>
          </div>

          {/* イベントカード1: 斬丸と三つの雅石（メイン特命） */}
          <div 
            onClick={() => handleSelectEvent('mashin')}
            className="group bg-white rounded-2xl border border-[#E5E2EE] hover:border-[#5B21B6]/60 p-4 sm:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
          >
            {/* 上部アクセントバー */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-[#5B21B6] to-red-600" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-[#EDE9FE] text-[#5B21B6] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-[#DDD8EB]">
                    最新・特命和風謎解き
                  </span>
                  <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">
                    二段階構成
                  </span>
                  {mashinProgress.isCleared ? (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>完全制覇（S級探偵認定証獲得済み）</span>
                    </span>
                  ) : mashinProgress.stonesCount > 0 ? (
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Gem className="w-3 h-3 text-amber-600" />
                      <span>進行中: 雅石 {mashinProgress.stonesCount}/3個 獲得</span>
                    </span>
                  ) : (
                    <span className="bg-[#F4F3F8] text-[#6B6380] text-[10px] px-2 py-0.5 rounded-full">
                      未開始
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="text-base sm:text-lg font-extrabold text-[#221C35] group-hover:text-[#5B21B6] transition-colors">
                    神埼鉄道ミステリートレイン 〜斬丸と三つの雅石〜
                  </h4>
                  <p className="text-xs text-[#6B6380] mt-1 leading-relaxed">
                    黒電話の着信から始まる本格和風ミステリー。怪盗に奪われた3つの雅石を集め、路線図に隠された幾何学三角形から怪盗の真のアジトを暴き出せ！
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#857D99] pt-1">
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    難易度: ★★★★☆
                  </span>
                  <span>・</span>
                  <span>特典: S級探偵認定証 ＆ LINE限定コード</span>
                </div>
              </div>

              {/* 右側アクションボタン */}
              <div className="flex sm:flex-col items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectEvent('mashin');
                  }}
                  className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer group-hover:shadow-sm"
                >
                  <span>{mashinProgress.stonesCount > 0 && !mashinProgress.isCleared ? '捜査を再開する' : '捜査を開始する'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {(mashinProgress.stonesCount > 0 || mashinProgress.isCleared) && (
                  <button
                    type="button"
                    onClick={handleResetMashin}
                    className="h-11 sm:h-8 px-3 rounded-lg bg-white hover:bg-rose-50 border border-[#E5E2EE] hover:border-rose-200 text-[#857D99] hover:text-rose-600 text-[11px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="このイベントの記録を白紙に戻す"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>白紙に戻す</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* イベントカード2: 消えた試運転列車の謎（全線七十二駅探索） */}
          <div 
            onClick={() => handleSelectEvent('kaitan')}
            className="group bg-white rounded-2xl border border-[#E5E2EE] hover:border-[#5B21B6]/60 p-4 sm:p-5 shadow-xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-[#F4F3F8] text-[#4A4063] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#E5E2EE]">
                    七十二駅探索版
                  </span>
                  <span className="bg-purple-50 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200">
                    大正浪漫奇譚
                  </span>
                  {kaitanProgress.stage > 1 ? (
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <span>第 {kaitanProgress.stage} 幕 到達</span>
                    </span>
                  ) : (
                    <span className="bg-[#F4F3F8] text-[#6B6380] text-[10px] px-2 py-0.5 rounded-full">
                      第 1 幕
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="text-base sm:text-lg font-extrabold text-[#221C35] group-hover:text-[#5B21B6] transition-colors">
                    神埼鉄路奇譚 〜消えた試運転列車の謎〜
                  </h4>
                  <p className="text-xs text-[#6B6380] mt-1 leading-relaxed">
                    深夜のダイヤに突如現れた幽霊試運転列車。全線72駅に隠された停車標識の手がかりを追い、怪異の正体へ迫る本格捜査録。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#857D99] pt-1">
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    難易度: ★★★☆☆
                  </span>
                  <span>・</span>
                  <span>全3幕構成</span>
                  <span>・</span>
                  <span>電子スタンプ押印 ＆ 特典クーポン付き</span>
                </div>
              </div>

              {/* 右側アクションボタン */}
              <div className="flex sm:flex-col items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectEvent('kaitan');
                  }}
                  className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-[#221C35] hover:bg-[#5B21B6] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <span>{kaitanProgress.stage > 1 ? '探索を再開する' : '探索を開始する'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {kaitanProgress.stage > 1 && (
                  <button
                    type="button"
                    onClick={handleResetKaitan}
                    className="h-11 sm:h-8 px-3 rounded-lg bg-white hover:bg-rose-50 border border-[#E5E2EE] hover:border-rose-200 text-[#857D99] hover:text-rose-600 text-[11px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="このイベントの記録を白紙に戻す"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>白紙に戻す</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW B: 『斬丸と三つの雅石』操作中 - 和風ミステリーの世界観
  // =========================================================================
  if (selectedEventId === 'mashin') {
    return (
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 -my-6 px-4 sm:px-6 lg:px-8 py-6 min-h-[calc(100vh-140px)] overflow-hidden bg-[#0C0A10]">
        {/* 幽玄な和×ミステリー背景（墨色・夜行鉄路・金泥の粒子） */}
        <div 
          className="absolute inset-0 pointer-events-none transition-opacity duration-700"
          style={{
            background: `
              radial-gradient(ellipse 70% 40% at 50% -10%, rgba(217, 119, 6, 0.12), transparent 70%),
              radial-gradient(circle 500px at 90% 20%, rgba(185, 28, 28, 0.08), transparent 60%),
              radial-gradient(circle 500px at 10% 85%, rgba(124, 58, 237, 0.08), transparent 60%),
              linear-gradient(180deg, #0C0A10 0%, #120F18 50%, #0C0A10 100%)
            `,
          }}
        />

        {/* 和紙の簀の目・金箔散らしテクスチャ */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20 mix-blend-screen"
          style={{
            backgroundImage: `
              radial-gradient(#D4AF37 0.85px, transparent 0.85px),
              radial-gradient(#EF4444 0.6px, transparent 0.6px)
            `,
            backgroundSize: '40px 40px, 56px 56px',
            backgroundPosition: '0 0, 20px 20px',
          }}
        />

        <div className="relative z-10 animate-fadeIn">
          <MysteryTrainApp 
            onAddNPoints={onAddNPoints}
            onExit={() => handleSelectEvent('portal')}
            posterImageUrl={customPosterUrl || undefined}
          />
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW C: 『消えた試運転列車の謎』操作中 - 大正浪漫ミステリー世界観
  // =========================================================================
  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 -my-6 px-4 sm:px-6 lg:px-8 py-6 min-h-[calc(100vh-140px)] overflow-hidden bg-[#0C0A10]">
      <div className="relative z-10 max-w-4xl mx-auto animate-fadeIn space-y-4">
        {/* 上部戻るバー */}
        <div className="flex items-center justify-between bg-stone-900/90 border border-stone-700 px-4 py-2.5 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => handleSelectEvent('portal')}
            className="text-amber-300 hover:text-amber-100 font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← イベント選択一覧へ戻る</span>
          </button>
          <button
            type="button"
            onClick={handleResetKaitan}
            className="text-stone-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>白紙に戻す</span>
          </button>
        </div>

        <MysteryTrainEvent 
          onAddNPoints={onAddNPoints}
          onBack={() => handleSelectEvent('portal')}
        />
      </div>
    </div>
  );
};
