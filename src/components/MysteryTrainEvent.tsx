import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Train,
  Search,
  Check,
  Award,
  BookOpen,
  Send,
  Compass,
  Lightbulb,
  Lock,
  Flame,
  RotateCcw,
  Radio,
  Map,
  ArrowRight,
  X,
  Copy,
  Sparkles,
  Scroll,
} from 'lucide-react';
import {
  KANZAKI_ALL_STATIONS_72,
  MYSTERY_STAGES,
  MYSTERY_CLEAR_COUPON_CODE,
  Station72,
  MysteryStage,
} from '../data/mysteryTrainData';
import { LINE_OA_ADD_FRIEND_URL } from '../utils/accountApi';

interface MysteryTrainEventProps {
  onBack?: () => void;
  onAddNPoints?: (points: number, title?: string, type?: 'stamp' | 'coupon') => void;
}

interface SavedStampData {
  stageNumber: number;
  stationId: string;
  stationName: string;
  stampedAt: string;
}

export const MysteryTrainEvent: React.FC<MysteryTrainEventProps> = ({
  onAddNPoints,
}) => {
  // プレイヤーが到達済みの最高ステージ (1, 2, 3)
  const [maxUnlockedStage, setMaxUnlockedStage] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('kanzaki_mystery_stage');
      if (saved) {
        const num = parseInt(saved, 10);
        if (num >= 1 && num <= 3) return num;
      }
    } catch (e) {}
    return 1;
  });

  // 現在閲覧中の幕 (1, 2, 3)
  const [viewingStageNum, setViewingStageNum] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('kanzaki_mystery_stage');
      if (saved) {
        const num = parseInt(saved, 10);
        if (num >= 1 && num <= 3) return num;
      }
    } catch (e) {}
    return 1;
  });

  // 取得済みの朱肉印（スタンプ）
  const [stamps, setStamps] = useState<SavedStampData[]>(() => {
    try {
      const saved = localStorage.getItem('kanzaki_mystery_stamps');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  // 全幕完全解明
  const [isAllCleared, setIsAllCleared] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kanzaki_mystery_cleared') === 'true';
    } catch (e) {}
    return false;
  });

  // 閲覧モード: 'investigation' (電文捜査帳) | 'stampbook' (特装朱印鑑) | 'routemap' (全線絵図)
  const [activeMode, setActiveMode] = useState<'investigation' | 'stampbook' | 'routemap'>('investigation');

  // 特定した停車場（駅）ID
  const [selectedStationId, setSelectedStationId] = useState<string>('');

  // 駅選択後に電文を再読するための巻物展開フラグ
  const [isRiddleReopen, setIsRiddleReopen] = useState<boolean>(false);

  // 行灯（ヒント）点灯フラグ
  const [showHint, setShowHint] = useState<boolean>(false);

  // インライン即時検索用
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // 路線別クイック木札フィルター
  const [lineFilter, setLineFilter] = useState<'all' | 'kanzaki' | 'express' | 'saisen' | 'tsuchiura'>('all');

  // 全72停車場総覧モーダル
  const [isStationModalOpen, setIsStationModalOpen] = useState<boolean>(false);
  const [modalSearchKeyword, setModalSearchKeyword] = useState<string>('');
  const [modalLineFilter, setModalLineFilter] = useState<'all' | 'kanzaki' | 'express' | 'saisen' | 'tsuchiura'>('all');

  // 判取（正誤判定）ダイアログ
  const [judgementResult, setJudgementResult] = useState<{
    status: 'correct' | 'incorrect';
    title: string;
    message: string;
    detail?: string;
  } | null>(null);

  // 初期化確認モーダル
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);

  // 謄写（コピー）完了ステート
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedRiddle, setCopiedRiddle] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // トースト表示
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // LocalStorage 自動同期
  useEffect(() => {
    try {
      localStorage.setItem('kanzaki_mystery_stage', maxUnlockedStage.toString());
      localStorage.setItem('kanzaki_mystery_stamps', JSON.stringify(stamps));
      localStorage.setItem('kanzaki_mystery_cleared', isAllCleared ? 'true' : 'false');
    } catch (e) {}
  }, [maxUnlockedStage, stamps, isAllCleared]);

  // クリック外検知
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 現在表示中の事件データ
  const currentStage: MysteryStage = MYSTERY_STAGES[viewingStageNum - 1] || MYSTERY_STAGES[0];
  const isCurrentStageCleared = stamps.some((s) => s.stageNumber === viewingStageNum);

  // 選択中の停車場オブジェクト
  const selectedStation = useMemo(() => {
    return KANZAKI_ALL_STATIONS_72.find((s) => s.id === selectedStationId) || null;
  }, [selectedStationId]);

  // 高速検索候補 (最大8件)
  const quickFilteredStations = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return [];
    return KANZAKI_ALL_STATIONS_72.filter((s) => {
      return (
        s.name.toLowerCase().includes(q) ||
        s.kana.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
      );
    }).slice(0, 8);
  }, [searchKeyword]);

  // 路線別木札リスト
  const lineStations = useMemo(() => {
    if (lineFilter === 'all') {
      const hubIds = ['tokyo', 'kitasenju', 'oomiya', 'kashiwa', 'abiko', 'matsudo', 'yokohama', 'shinjuku', 'ikebukuro', 'tsuchiura'];
      return KANZAKI_ALL_STATIONS_72.filter((s) => hubIds.includes(s.id));
    }
    return KANZAKI_ALL_STATIONS_72.filter((s) => {
      if (lineFilter === 'kanzaki') return s.primaryLine === 'kanzaki';
      if (lineFilter === 'express') return s.primaryLine === 'express';
      if (lineFilter === 'saisen') return s.primaryLine === 'saisen';
      if (lineFilter === 'tsuchiura') return s.primaryLine === 'tsuchiura';
      return false;
    });
  }, [lineFilter]);

  // 72停車場総覧モーダル内の絞り込み
  const modalStations = useMemo(() => {
    const q = modalSearchKeyword.trim().toLowerCase();
    return KANZAKI_ALL_STATIONS_72.filter((s) => {
      if (modalLineFilter !== 'all') {
        if (s.primaryLine !== modalLineFilter && !s.lines.some((l) => {
          if (modalLineFilter === 'kanzaki') return l.includes('神埼線');
          if (modalLineFilter === 'express') return l.includes('神埼高速');
          if (modalLineFilter === 'saisen') return l.includes('埼千環状');
          if (modalLineFilter === 'tsuchiura') return l.includes('土浦');
          return false;
        })) {
          return false;
        }
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.kana.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
      );
    });
  }, [modalSearchKeyword, modalLineFilter]);

  // 停車場選定
  const handleSelectStation = (station: Station72) => {
    setSelectedStationId(station.id);
    setSearchKeyword('');
    setIsSearchDropdownOpen(false);
    setIsStationModalOpen(false);
    setIsRiddleReopen(false);
    showToast(`停車場【${station.name} (${station.code})】を選定せり`);
  };

  // 停車場選定解除
  const handleClearStation = () => {
    setSelectedStationId('');
    setSearchKeyword('');
    setIsRiddleReopen(false);
  };

  // 出動・謎解明の儀
  const handleDispatch = () => {
    if (!selectedStation) {
      showToast('捜査対象となる停車場を選定してください。');
      return;
    }

    if (isCurrentStageCleared) {
      showToast(`第${viewingStageNum}幕は既に解明済みです（正解：${currentStage.correctStationName}）。`);
      return;
    }

    const isCorrect = selectedStation.id === currentStage.correctStationId;

    if (isCorrect) {
      const nowStr = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const newStamp: SavedStampData = {
        stageNumber: viewingStageNum,
        stationId: selectedStation.id,
        stationName: selectedStation.name,
        stampedAt: nowStr,
      };

      const updatedStamps = [...stamps.filter((s) => s.stageNumber !== viewingStageNum), newStamp];
      setStamps(updatedStamps);

      // N-POINT 謹呈 (+150 pt)
      if (onAddNPoints) {
        onAddNPoints(150, `神埼奇譚 第${viewingStageNum}幕解明報奨`, 'stamp');
      }

      if (viewingStageNum === 3) {
        setIsAllCleared(true);
        setMaxUnlockedStage(3);
        setJudgementResult({
          status: 'correct',
          title: '【全幕解明】クモハ9000番台を発見！',
          message: '全三幕にわたる暗号電文の完全解読に成功。試運転列車の保護を完了した。',
          detail: currentStage.correctExplanation,
        });
      } else {
        const nextStage = viewingStageNum + 1;
        if (nextStage > maxUnlockedStage) {
          setMaxUnlockedStage(nextStage);
        }
        setJudgementResult({
          status: 'correct',
          title: `【第${viewingStageNum}幕 解明】解明スタンプを獲得！`,
          message: `${selectedStation.name}駅にて試運転列車の通過痕跡を確認。報奨150ptを付与した。`,
          detail: currentStage.correctExplanation,
        });
      }
    } else {
      setJudgementResult({
        status: 'incorrect',
        title: '【空振り】列車の痕跡なし',
        message: `${selectedStation.name}駅周辺を捜査したが、クモハ9000番台の痕跡は見当たらなかった。`,
        detail: '電文の言葉の並び、路線の接続、土地の由来を今一度再確認せよ。',
      });
    }
  };

  // 判取ダイアログの確認
  const handleAcknowledgeResult = () => {
    const wasCorrect = judgementResult?.status === 'correct';
    setJudgementResult(null);

    if (wasCorrect) {
      if (isAllCleared || viewingStageNum === 3) {
        setSelectedStationId('');
        setActiveMode('stampbook');
      } else {
        const nextNum = viewingStageNum + 1;
        setViewingStageNum(nextNum);
        setSelectedStationId('');
        setShowHint(false);
      }
    }
  };

  // 特典コード（クーポン）コピー
  const handleCopyCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(MYSTERY_CLEAR_COUPON_CODE).then(() => {
        setCopiedCode(true);
        showToast(`特典コード「${MYSTERY_CLEAR_COUPON_CODE}」をコピーしました`);
        setTimeout(() => setCopiedCode(false), 3000);
      }).catch(() => {
        setCopiedCode(true);
      });
    } else {
      setCopiedCode(true);
    }
  };

  // 電文コピー
  const handleCopyRiddle = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${currentStage.riddleTitle}\n${currentStage.riddleText}`).then(() => {
        setCopiedRiddle(true);
        showToast('暗号電文をコピーしました');
        setTimeout(() => setCopiedRiddle(false), 2500);
      });
    }
  };

  // 捜査記録初期化の実行
  const executeResetGame = () => {
    setMaxUnlockedStage(1);
    setViewingStageNum(1);
    setStamps([]);
    setIsAllCleared(false);
    setSelectedStationId('');
    setSearchKeyword('');
    setShowHint(false);
    setJudgementResult(null);
    try {
      localStorage.removeItem('kanzaki_mystery_stage');
      localStorage.removeItem('kanzaki_mystery_stamps');
      localStorage.removeItem('kanzaki_mystery_cleared');
    } catch (e) {}
    showToast('捜査記録を白紙に戻しました');
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-16 animate-fadeIn font-sans text-stone-200">
      {/* トースト表示 */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1A1423] text-amber-100 px-5 py-2.5 rounded-lg shadow-2xl border border-amber-600/60 flex items-center gap-2 text-xs font-sans font-bold animate-fadeIn">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 白紙に戻す（初期化）確認モーダル */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl border border-amber-600/60 bg-[#1A1423] p-5 text-stone-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <RotateCcw className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-sm text-amber-100">捜査記録の初期化</h3>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              これまでの捜査記録を白紙に戻し、第1幕からやり直しますか？<br />
              <span className="text-[11px] text-amber-400/80">※獲得済みのN-POINTは保持されます。</span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3.5 py-1.5 rounded bg-black/40 hover:bg-black/60 border border-stone-700 text-xs text-stone-300 font-bold transition-all cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  executeResetGame();
                  setIsResetConfirmOpen(false);
                }}
                className="px-3.5 py-1.5 rounded bg-[#991B1B] hover:bg-[#B91C1C] text-amber-100 text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                白紙に戻す
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          壱之部：特務事件録 題字板 ＆ 幕セレクター
         ========================================================================= */}
      <div 
        className="rounded-xl p-4 sm:p-5 text-stone-200 shadow-2xl border border-amber-700/40 relative overflow-hidden"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, #20192B 0%, #110D18 100%)',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6), 0 10px 25px rgba(0,0,0,0.4)',
        }}
      >
        {/* 背景の微細な和風雲紋 */}
        <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-amber-600/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-3.5">
          {/* 事件録ヘッダー */}
          <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-sm bg-[#991B1B] text-amber-100 flex items-center justify-center font-bold text-xs shadow-xs border border-amber-400/40 font-serif">
                ㊙︎
              </div>
              <div>
                <span className="text-[10px] tracking-widest text-amber-400/80 uppercase block font-sans">
                  NIZAKI RAILWAY SPECIAL CASE #9000
                </span>
                <h1 className="text-sm sm:text-base font-bold text-amber-100 tracking-wider">
                  神埼鉄道 特命指令事件
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(true)}
              className="text-[11px] text-stone-400 hover:text-amber-300 flex items-center gap-1 py-1 px-2.5 rounded bg-black/40 border border-stone-700 hover:border-amber-500/50 transition-colors cursor-pointer active:scale-[0.98]"
              title="捜査記録を白紙に戻す"
            >
              <RotateCcw className="w-3 h-3" />
              <span>白紙に戻す</span>
            </button>
          </div>

          {/* 三幕のセレクター */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((step) => {
              const isCleared = stamps.some((s) => s.stageNumber === step);
              const isUnlocked = step <= maxUnlockedStage;
              const isViewing = viewingStageNum === step;

              return (
                <button
                  key={step}
                  type="button"
                  disabled={!isUnlocked}
                  onClick={() => {
                    setViewingStageNum(step);
                    setActiveMode('investigation');
                    setSelectedStationId('');
                    setIsRiddleReopen(false);
                  }}
                  className={`p-2.5 sm:p-3 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer relative border text-center ${
                    isViewing
                      ? 'bg-gradient-to-b from-[#422216] to-[#2B140B] text-amber-200 border-amber-500 shadow-md shadow-amber-950/40'
                      : isCleared
                      ? 'bg-[#15241C] hover:bg-[#1A3125] border-emerald-600/40 text-emerald-200'
                      : isUnlocked
                      ? 'bg-[#1C1726] hover:bg-[#251E33] border-amber-900/30 text-stone-300'
                      : 'bg-black/30 border-stone-800/60 text-stone-600 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    {isCleared ? (
                      <span className="w-4 h-4 rounded-full bg-[#991B1B] text-amber-200 text-[9px] flex items-center justify-center font-serif shadow-xs">
                        解
                      </span>
                    ) : !isUnlocked ? (
                      <Lock className="w-3 h-3 text-stone-600" />
                    ) : (
                      <Flame className="w-3 h-3 text-amber-400 animate-pulse" />
                    )}
                    <span className="tracking-wider">
                      第{step}幕
                    </span>
                  </div>

                  <span className="text-[10px] mt-1 tracking-widest opacity-80">
                    {isCleared
                      ? '【解明済】'
                      : isViewing
                      ? '捜査中'
                      : isUnlocked
                      ? '捜査可能'
                      : '未解明'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* =========================================================================
          弐之部：モード切替タブ
         ========================================================================= */}
      <div className="bg-[#15121D] p-1 rounded-xl border border-amber-900/30 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setActiveMode('investigation')}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
            activeMode === 'investigation'
              ? 'bg-[#2E1A11] text-amber-200 border border-amber-600/40 shadow-xs'
              : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
          }`}
        >
          <Scroll className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>暗号捜査</span>
          {!isAllCleared && !isCurrentStageCleared && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0 animate-ping" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('stampbook')}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
            activeMode === 'stampbook'
              ? 'bg-[#2E1A11] text-amber-200 border border-amber-600/40 shadow-xs'
              : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>解明スタンプ帳</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">
            {stamps.length}/3
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('routemap')}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
            activeMode === 'routemap'
              ? 'bg-[#2E1A11] text-amber-200 border border-amber-600/40 shadow-xs'
              : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
          }`}
        >
          <Map className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>全線路線図</span>
        </button>
      </div>

      {/* =========================================================================
          参之部：暗号捜査
         ========================================================================= */}
      {activeMode === 'investigation' && (
        <div className="space-y-4 animate-fadeIn">
          {/* 全幕完全制覇（大団円） */}
          {isAllCleared && (
            <div 
              className="rounded-xl p-5 sm:p-6 text-stone-200 border-2 border-amber-500/80 shadow-2xl space-y-4 relative overflow-hidden"
              style={{
                background: 'radial-gradient(ellipse at 50% 20%, #2A1A0F 0%, #150F0B 100%)',
              }}
            >
              <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
                <span className="bg-[#991B1B] text-amber-100 px-2.5 py-0.5 rounded text-[11px] font-bold tracking-widest flex items-center gap-1 border border-amber-400/40">
                  <Award className="w-3.5 h-3.5 text-amber-300" />
                  <span>全三幕 解明完了</span>
                </span>
                <span className="text-xs text-amber-400 tracking-widest font-sans font-bold">
                  神埼鉄道 運転指令室
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg sm:text-xl font-bold text-amber-100 tracking-wide">
                  我孫子駅特別留置線にて「クモハ9000番台」を発見・保護完了！
                </h3>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed font-sans">
                  全三幕にわたる暗号電文をすべて解読した。特務完遂の証として、公式LINE専用の特典クーポンコードを進呈する。
                </p>
              </div>

              {/* 特典コード */}
              <div className="bg-black/60 border border-amber-500/40 rounded-lg p-3 text-center space-y-1">
                <span className="text-[10px] text-amber-400/90 tracking-widest block font-sans font-bold">
                  【 LINE公式アカウント専用 特典引換コード 】
                </span>
                <div className="font-mono text-xl sm:text-2xl font-black text-amber-300 select-all py-1.5 px-4 rounded bg-black/80 border border-amber-500/50 inline-block tracking-widest">
                  {MYSTERY_CLEAR_COUPON_CODE}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="h-11 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] text-slate-950 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-slate-950" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? '特典コードをコピーしました' : '特典コードをコピー'}</span>
                </button>

                <a
                  href={LINE_OA_ADD_FRIEND_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-11 bg-[#06C755] hover:bg-[#05b34c] active:scale-[0.98] text-white px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>LINE公式にて引き換える</span>
                </a>
              </div>
            </div>
          )}

          {/* ===================================================================
              【神埼鉄道 特命指令 指図書】
             =================================================================== */}
          {!selectedStation ? (
            /* 駅未選択時：暗号指図書 ＋ 駅選定デッキ */
            <div className="space-y-4">
              <div 
                className="rounded-xl border border-amber-700/50 text-stone-200 p-5 sm:p-6 shadow-2xl relative overflow-hidden space-y-4"
                style={{
                  background: 'linear-gradient(180deg, #181320 0%, #120E1A 100%)',
                  boxShadow: 'inset 0 0 50px rgba(0,0,0,0.5)',
                }}
              >
                {/* 四隅の飾り金具 */}
                <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-amber-500/40 pointer-events-none" />
                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-amber-500/40 pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-amber-500/40 pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-amber-500/40 pointer-events-none" />

                {/* 指図書ヘッダー */}
                <div className="flex items-start justify-between gap-3 border-b border-amber-600/30 pb-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] tracking-widest text-amber-400/90 font-sans font-bold">
                      <span>神埼鉄道 運転指令</span>
                      <span>・</span>
                      <span>第{currentStage.stageNumber}号 特命指令</span>
                    </div>
                    <h2 className="text-base sm:text-xl font-bold text-amber-100 tracking-wide">
                      {currentStage.stageTitle}
                    </h2>
                  </div>

                  {/* ステータス印 */}
                  <div className="shrink-0 text-right">
                    {isCurrentStageCleared ? (
                      <div className="w-14 h-14 rounded-sm border-2 border-[#991B1B] bg-[#991B1B]/10 text-[#EF4444] p-1 flex flex-col items-center justify-center rotate-[-6deg] shadow-sm select-none font-serif">
                        <span className="text-[9px] font-bold tracking-widest border-b border-[#991B1B] pb-0.5">神埼</span>
                        <span className="text-xs font-black tracking-tight mt-0.5">解明済</span>
                      </div>
                    ) : (
                      <div className="border border-amber-500/40 bg-amber-950/40 text-amber-300 px-2.5 py-1.5 rounded text-right">
                        <div className="text-[9px] tracking-widest text-amber-400 font-bold">解明報奨</div>
                        <div className="text-xs font-mono font-bold text-amber-200">+150 pt</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 状況報告（物語前文） */}
                <div className="text-xs sm:text-sm text-stone-300 leading-relaxed border-l-2 border-amber-600/60 pl-3 py-1 font-sans">
                  <span className="text-[10px] text-amber-400 font-bold tracking-widest block mb-0.5">
                    【指令室 状況報告】
                  </span>
                  {currentStage.story}
                </div>

                {/* 極秘暗号電文（大事な場面：serifで格調高く表示） */}
                <div 
                  className="rounded-lg p-4 sm:p-5 space-y-3 relative border border-amber-500/40 shadow-inner"
                  style={{
                    background: 'radial-gradient(circle at 50% 50%, #0E0A14 0%, #060408 100%)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-amber-400 font-bold tracking-widest flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                      <span>【極秘暗号電文】第{currentStage.stageNumber}号</span>
                    </span>

                    <button
                      type="button"
                      onClick={handleCopyRiddle}
                      className="text-[10px] text-amber-200 hover:text-white bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30 px-2.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 active:scale-[0.98]"
                      title="暗号電文をコピー"
                    >
                      {copiedRiddle ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedRiddle ? 'コピー完了' : '電文をコピー'}</span>
                    </button>
                  </div>

                  {/* 大事な暗号電文は格調あるserifで強調 */}
                  <p className="font-serif text-sm sm:text-base font-medium leading-loose text-amber-100 tracking-wider">
                    {currentStage.riddleText}
                  </p>

                  <div className="text-right text-[10px] text-stone-400 tracking-widest font-sans font-bold">
                    ※全72駅から該当する駅を特定せよ
                  </div>
                </div>

                {/* ヒント確認ボタン */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowHint(!showHint)}
                    className={`text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] font-bold ${
                      showHint
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'bg-black/40 hover:bg-black/60 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showHint ? 'ヒントを閉じる（▲）' : '指令本部ヒントを確認（▼）'}</span>
                  </button>

                  {showHint && (
                    <div className="mt-2.5 bg-amber-950/30 border border-amber-500/40 rounded-lg p-3.5 text-xs text-amber-100 leading-relaxed animate-fadeIn font-sans">
                      <span className="font-bold text-amber-300 block mb-0.5">💡 指令本部ヒント：</span>
                      <p className="tracking-wide text-amber-50">{currentStage.hint}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 駅選定デッキ */}
              <div 
                className="rounded-xl border border-amber-800/40 p-5 text-stone-200 space-y-4 shadow-xl"
                style={{
                  background: 'linear-gradient(180deg, #1A1524 0%, #140F1D 100%)',
                }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-600/20 pb-2.5">
                  <span className="text-xs sm:text-sm font-bold text-amber-200 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-amber-400" />
                    <span>暗号が指し示す駅を特定せよ</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveMode('routemap')}
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-sans"
                  >
                    <span>全線路線図を確認 →</span>
                  </button>
                </div>

                {/* 即時検索バー */}
                <div ref={searchContainerRef} className="relative">
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-amber-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="駅名または駅コードを入力（例: 東京、大宮、柏、Y01）"
                      value={searchKeyword}
                      onChange={(e) => {
                        setSearchKeyword(e.target.value);
                        setIsSearchDropdownOpen(true);
                      }}
                      onFocus={() => {
                        if (searchKeyword.trim()) setIsSearchDropdownOpen(true);
                      }}
                      className="w-full bg-black/50 border border-amber-700/50 focus:border-amber-400 focus:bg-black/70 focus:ring-1 focus:ring-amber-400 pl-10 pr-28 py-2.5 rounded-lg text-xs sm:text-sm font-bold text-amber-100 placeholder:text-stone-500 outline-hidden transition-all font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setIsStationModalOpen(true)}
                      className="absolute right-1.5 px-3 py-1.5 rounded bg-amber-900/40 hover:bg-amber-600 text-amber-200 hover:text-slate-950 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-[0.98] border border-amber-600/30"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>全72駅一覧</span>
                    </button>
                  </div>

                  {/* 即時候補ドロップダウン */}
                  {isSearchDropdownOpen && quickFilteredStations.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#171320] border border-amber-600/50 rounded-lg shadow-2xl overflow-hidden z-30 divide-y divide-amber-900/30 animate-fadeIn max-h-60 overflow-y-auto">
                      <div className="p-2 bg-black/60 text-[10px] font-bold text-amber-400 flex items-center justify-between tracking-wider font-sans">
                        <span>検索結果（タップで選択）:</span>
                        <span>{quickFilteredStations.length}件</span>
                      </div>
                      {quickFilteredStations.map((st) => (
                        <div
                          key={st.id}
                          onClick={() => handleSelectStation(st)}
                          className="p-2.5 hover:bg-amber-950/40 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#991B1B] text-amber-100 border border-amber-400/40">
                              {st.code}
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs sm:text-sm font-bold text-stone-100 truncate block">
                                {st.name}駅
                              </span>
                              <span className="text-[10px] text-stone-400 truncate block font-sans">
                                {st.kana} （{st.lines.join('・')}）
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-amber-400 shrink-0">
                            選択 ↵
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 路線別ピル */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[11px] text-stone-400">
                      主要駅・路線から選ぶ：
                    </span>
                    <div className="flex items-center gap-1 font-sans">
                      {[
                        { key: 'all', label: '主要駅' },
                        { key: 'kanzaki', label: '神埼線' },
                        { key: 'express', label: '高速線' },
                        { key: 'saisen', label: '環状線' },
                        { key: 'tsuchiura', label: '土浦線' },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setLineFilter(tab.key as any)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            lineFilter === tab.key
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-black/30 text-stone-400 hover:text-stone-200 border border-stone-800'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {lineStations.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleSelectStation(st)}
                        className="px-2.5 py-1 rounded bg-black/40 hover:bg-amber-950/60 border border-amber-700/40 hover:border-amber-400 text-xs font-bold text-stone-200 hover:text-amber-200 transition-all cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
                      >
                        <span className="text-[9px] font-mono text-amber-300 bg-amber-950/60 px-1 py-0.2 rounded border border-amber-500/30">
                          {st.code}
                        </span>
                        <span>{st.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-black/30 rounded border border-stone-800 text-center text-stone-400 text-xs font-sans">
                  駅を選択すると、確認・出動画面へ進みます
                </div>
              </div>
            </div>
          ) : (
            /* 駅選択完了時：【出動確認画面】 */
            <div className="space-y-4 animate-scaleUp">
              {/* 電文の再確認バー */}
              <div className="bg-[#1A1424] rounded-lg border border-amber-600/40 p-3 text-stone-200 flex items-center justify-between gap-3 shadow-md font-sans">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="bg-[#991B1B] text-amber-100 text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0">
                    第{currentStage.stageNumber}号
                  </span>
                  <span className="text-xs text-amber-200/90 truncate tracking-wide">
                    {currentStage.stageTitle}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRiddleReopen(!isRiddleReopen)}
                  className="text-xs font-bold text-amber-400 hover:text-amber-200 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <span>{isRiddleReopen ? '電文を閉じる ▲' : '電文を再確認 ▼'}</span>
                </button>
              </div>

              {isRiddleReopen && (
                <div className="bg-black/70 text-amber-100 rounded-lg p-4 text-xs sm:text-sm leading-relaxed border border-amber-500/40 animate-fadeIn font-serif">
                  {currentStage.riddleText}
                </div>
              )}

              {/* 出動確認デッキ */}
              <div 
                className="rounded-xl border-2 border-amber-500 p-5 sm:p-6 text-stone-100 shadow-2xl space-y-5"
                style={{
                  background: 'radial-gradient(ellipse at 50% 0%, #2A1C12 0%, #140C08 100%)',
                  boxShadow: '0 15px 35px rgba(0,0,0,0.6), inset 0 0 40px rgba(217, 119, 6, 0.1)',
                }}
              >
                <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
                  <span className="text-amber-400 text-xs sm:text-sm font-bold tracking-widest flex items-center gap-1.5 font-sans">
                    <Train className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>【特定した駅】出動準備完了</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleClearStation}
                    className="text-xs text-stone-400 hover:text-amber-300 bg-black/40 hover:bg-black/60 px-3 py-1 rounded border border-stone-700 transition-all cursor-pointer flex items-center gap-1 active:scale-[0.98]"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>駅を選び直す</span>
                  </button>
                </div>

                {/* 駅名表示パネル */}
                <div className="bg-black/60 border border-amber-500/40 rounded-lg p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#991B1B] text-amber-100 text-xs font-mono font-bold px-2 py-0.5 rounded border border-amber-400/40">
                        {selectedStation.code}
                      </span>
                      <span className="text-xs text-amber-300/80 font-sans">
                        {selectedStation.kana}
                      </span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-amber-100 tracking-wider truncate">
                      {selectedStation.name}駅
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 font-sans">
                      {selectedStation.lines.map((l) => (
                        <span
                          key={l}
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-200 border border-amber-500/30"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="w-14 h-14 rounded-full bg-amber-500/10 border-2 border-amber-400/50 flex items-center justify-center shrink-0 shadow-inner">
                    <Compass className="w-7 h-7 text-amber-300" />
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-stone-300 text-center leading-relaxed font-sans">
                  暗号が指し示す目的地は【{selectedStation.name}駅】で間違いなきや。<br />
                  直ちに捜査班を出動させ、試運転列車を捜索せよ。
                </p>

                {/* 出動・解明せよ ボタン */}
                <button
                  type="button"
                  onClick={handleDispatch}
                  className="w-full h-14 sm:h-16 rounded-lg font-bold text-base sm:text-lg bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-xl active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 tracking-wider border border-amber-300 font-sans"
                >
                  <Train className="w-5 h-5 text-slate-950" />
                  <span>【{selectedStation.name}駅】へ出動・解明せよ →</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODE 2: 解明スタンプ帳
         ========================================================================= */}
      {activeMode === 'stampbook' && (
        <div 
          className="rounded-xl border border-amber-800/50 p-5 sm:p-6 shadow-2xl space-y-5 relative overflow-hidden animate-fadeIn"
          style={{
            backgroundColor: '#FAF6EE',
            backgroundImage: `
              radial-gradient(ellipse at 80% 20%, rgba(217, 119, 6, 0.08) 0%, transparent 50%),
              radial-gradient(circle at 10% 90%, rgba(180, 83, 9, 0.05) 0%, transparent 60%),
              linear-gradient(135deg, #FBF9F4 0%, #F5EFEB 100%)
            `,
            boxShadow: 'inset 0 0 30px rgba(180, 83, 9, 0.1)',
          }}
        >
          <div className="flex items-center justify-between border-b border-[#E3DAC9] pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#991B1B] text-amber-200 flex items-center justify-center shadow-md border border-amber-400/40">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-[#2E2421] tracking-wider">
                    神埼鉄道 解明スタンプ帳
                  </h2>
                  <span className="text-[10px] font-bold text-amber-900 bg-amber-200/80 border border-amber-400 px-1.5 py-0.2 rounded font-sans">
                    公式記録
                  </span>
                </div>
                <p className="text-[11px] text-[#7A6E67] font-sans">
                  暗号を解明した駅ごとに、公式の解明印が捺印されます
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveMode('investigation')}
              className="px-3 py-1.5 rounded bg-white hover:bg-stone-100 border border-[#D8CFC0] text-xs font-bold text-[#5A4D45] flex items-center gap-1 shadow-2xs cursor-pointer active:scale-[0.98]"
            >
              <span>暗号捜査に戻る</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3つのスタンプ枠 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-sans">
            {MYSTERY_STAGES.map((stage) => {
              const stampRecord = stamps.find((s) => s.stageNumber === stage.stageNumber);
              const isUnlocked = stampRecord !== undefined;

              return (
                <div
                  key={stage.stageNumber}
                  onClick={() => {
                    setViewingStageNum(stage.stageNumber);
                    setActiveMode('investigation');
                  }}
                  className={`min-h-[190px] rounded-lg border p-3.5 flex flex-col justify-between transition-all duration-300 cursor-pointer group ${
                    isUnlocked
                      ? 'bg-[#FFFDF9] border-[#D1C6B4] shadow-md hover:scale-[1.02]'
                      : 'bg-[#F3EEE6]/80 border-dashed border-[#D5CBC0] opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-widest text-[#82746B]">
                      第{stage.stageNumber}幕
                    </span>
                    {isUnlocked ? (
                      <span className="text-[9px] font-bold text-[#991B1B] bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                        解明完了
                      </span>
                    ) : (
                      <span className="text-[9px] text-[#A89D96]">
                        未解明
                      </span>
                    )}
                  </div>

                  {/* 解明スタンプ印影（印影はserifで雰囲気演出） */}
                  <div className="my-auto flex flex-col items-center justify-center py-2">
                    {isUnlocked ? (
                      <div className="w-20 h-20 rounded-full border-[3px] border-[#991B1B] flex flex-col items-center justify-center text-[#991B1B] p-1.5 rotate-[-4deg] shadow-sm select-none bg-rose-50/40 font-serif">
                        <div className="text-[8px] font-bold tracking-widest border-b border-[#991B1B] pb-0.5">
                          神埼鉄道
                        </div>
                        <div className="text-xs font-black tracking-tight my-0.5 text-center leading-tight">
                          {stampRecord.stationName}
                        </div>
                        <div className="text-[7px] font-mono font-bold">
                          {stampRecord.stampedAt}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-3 text-[#A89F99] space-y-1">
                        <div className="w-8 h-8 rounded-full bg-[#EAE3D8] flex items-center justify-center mx-auto text-[#8F847C]">
                          <Lock className="w-4 h-4 opacity-70" />
                        </div>
                        <span className="text-[10px] font-bold text-[#7E736C] block">未解明</span>
                      </div>
                    )}
                  </div>

                  <div className="text-center border-t border-[#EAE3D8] pt-1.5">
                    <span className="text-[10px] font-bold text-[#554942] truncate block group-hover:text-[#991B1B] transition-colors">
                      {isUnlocked ? `【${stampRecord?.stationName}駅】解明済` : `第${stage.stageNumber}幕を解く →`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px] text-[#7A6E67] font-sans">
              全3幕をすべて解明してスタンプを揃えると、公式LINE特典コードを獲得できます。
            </p>
            <button
              type="button"
              onClick={() => setActiveMode('investigation')}
              className="h-9 px-4 rounded bg-[#181320] hover:bg-[#2A2038] text-amber-200 text-xs font-bold shadow-md flex items-center gap-1 cursor-pointer active:scale-[0.98]"
            >
              <span>暗号捜査に戻る</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODE 3: 全線路線図
         ========================================================================= */}
      {activeMode === 'routemap' && (
        <div 
          className="rounded-xl border border-amber-800/40 p-5 sm:p-6 shadow-2xl space-y-5 text-stone-200 animate-fadeIn"
          style={{
            background: 'linear-gradient(180deg, #181320 0%, #120E18 100%)',
          }}
        >
          <div className="flex items-center justify-between border-b border-amber-600/30 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#991B1B] text-amber-100 flex items-center justify-center shadow-xs border border-amber-400/40">
                <Map className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-amber-100 tracking-wider">
                  神埼鉄道 全線路線図
                </h2>
                <p className="text-[11px] text-stone-400 font-sans">
                  全72駅 路線ネットワーク
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveMode('investigation')}
              className="px-3.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1 shadow-md cursor-pointer active:scale-[0.98]"
            >
              <span>暗号捜査に戻る</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 画像添付待機フレーム */}
          <div className="min-h-[360px] sm:min-h-[440px] rounded-lg border-2 border-dashed border-amber-600/40 bg-black/50 p-6 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden font-sans">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Compass className="w-8 h-8" />
            </div>

            <div className="space-y-1 max-w-md">
              <h3 className="text-base font-bold text-amber-200">
                【全線路線図 掲載エリア】
              </h3>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                公式路線図の画像を準備中です。後ほど詳細な全線マップが掲載されます。
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActiveMode('investigation')}
                className="h-10 px-5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
              >
                <span>暗号捜査に戻る</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          全72駅一覧モーダル
         ========================================================================= */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn font-sans">
          <div 
            className="w-full max-w-2xl max-h-[85vh] rounded-xl border-2 border-amber-600/60 shadow-2xl flex flex-col overflow-hidden text-stone-200"
            style={{
              background: 'linear-gradient(180deg, #1C1626 0%, #120E1A 100%)',
            }}
          >
            {/* モーダルヘッダー */}
            <div className="p-4 border-b border-amber-600/30 flex items-center justify-between gap-3 bg-black/40">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm sm:text-base font-bold text-amber-100 tracking-wider">
                  神埼鉄道 全線七十二駅一覧
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStationModalOpen(false)}
                className="p-1 rounded text-stone-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* モーダル内検索・絞り込み */}
            <div className="p-3 bg-black/20 border-b border-amber-900/30 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-amber-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="駅名・かな・駅コードで探す..."
                  value={modalSearchKeyword}
                  onChange={(e) => setModalSearchKeyword(e.target.value)}
                  className="w-full bg-black/50 border border-amber-700/40 rounded py-2 pl-9 pr-3 text-xs text-amber-100 placeholder:text-stone-500 outline-hidden focus:border-amber-400 font-sans"
                />
              </div>

              <div className="flex items-center gap-1 font-sans">
                {[
                  { key: 'all', label: '全路線' },
                  { key: 'kanzaki', label: '神埼線' },
                  { key: 'express', label: '高速線' },
                  { key: 'saisen', label: '環状線' },
                  { key: 'tsuchiura', label: '土浦線' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setModalLineFilter(tab.key as any)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                      modalLineFilter === tab.key
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-black/30 text-stone-400 hover:text-stone-200 border border-stone-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 駅グリッド */}
            <div className="p-4 overflow-y-auto max-h-[50vh] grid grid-cols-2 sm:grid-cols-3 gap-2">
              {modalStations.map((st) => (
                <div
                  key={st.id}
                  onClick={() => handleSelectStation(st)}
                  className="p-2.5 rounded bg-black/40 hover:bg-amber-950/50 border border-amber-900/30 hover:border-amber-500/80 cursor-pointer flex flex-col justify-between gap-1 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-mono text-amber-300 bg-amber-950/80 px-1 py-0.2 rounded border border-amber-500/30">
                      {st.code}
                    </span>
                    <span className="text-[9px] text-stone-400 truncate font-sans">
                      {st.kana}
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-amber-100 truncate">
                    {st.name}駅
                  </div>
                </div>
              ))}
            </div>

            {/* モーダルフッター */}
            <div className="p-3 border-t border-amber-900/40 bg-black/40 text-right">
              <button
                type="button"
                onClick={() => setIsStationModalOpen(false)}
                className="px-4 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-200 cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          判定結果ダイアログ
         ========================================================================= */}
      {judgementResult && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn font-sans">
          <div 
            className="w-full max-w-md rounded-xl border-2 p-5 sm:p-6 text-stone-100 shadow-2xl space-y-4 animate-scaleUp relative overflow-hidden"
            style={{
              background: judgementResult.status === 'correct'
                ? 'radial-gradient(ellipse at 50% 10%, #291B12 0%, #120A07 100%)'
                : 'radial-gradient(ellipse at 50% 10%, #20141A 0%, #0E080C 100%)',
              borderColor: judgementResult.status === 'correct' ? '#F59E0B' : '#991B1B',
            }}
          >
            {/* 印影 */}
            <div className="flex items-center justify-center font-serif">
              {judgementResult.status === 'correct' ? (
                <div className="w-16 h-16 rounded-full border-2 border-[#991B1B] bg-[#991B1B]/20 flex items-center justify-center text-[#EF4444] rotate-[-5deg] shadow-lg">
                  <span className="text-xl font-bold tracking-widest">解明</span>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full border-2 border-stone-600 bg-stone-900/60 flex items-center justify-center text-stone-400 rotate-[-5deg] shadow-lg">
                  <span className="text-xl font-bold tracking-widest">空振</span>
                </div>
              )}
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base sm:text-lg font-bold text-amber-100 tracking-wider">
                {judgementResult.title}
              </h3>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed font-sans">
                {judgementResult.message}
              </p>
            </div>

            {judgementResult.detail && (
              <div className="p-3 rounded bg-black/50 border border-amber-900/30 text-xs text-amber-200/90 leading-relaxed font-sans">
                {judgementResult.detail}
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={handleAcknowledgeResult}
                className="w-full h-11 rounded font-bold text-xs sm:text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md cursor-pointer transition-all active:scale-[0.98]"
              >
                {judgementResult.status === 'correct' ? '次の事件へ進む →' : '暗号を再確認する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MysteryTrainEvent;
