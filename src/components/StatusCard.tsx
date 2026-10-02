import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, RefreshCw, AlertCircle, Clock, Info, ShieldAlert } from 'lucide-react';
import { TrainLine } from '../types';
import { disruptionManager, DisruptionSummaryResponse, OperationForecast } from '../utils/disruptionManager';

interface StatusCardProps {
  lines: TrainLine[];
  onOpenRouteMap?: () => void;
}

export const StatusCard: React.FC<StatusCardProps> = ({ lines }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusData, setStatusData] = useState<DisruptionSummaryResponse>(() => disruptionManager.getStatusSummary());

  const timeNow = () => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  // ローカルに保存済みの最新状態を画面へ反映するだけ(通信しない)
  const refreshFromLocal = () => {
    setStatusData(disruptionManager.getStatusSummary());
    setLastUpdated(timeNow());
  };

  // GASバックエンド(アプリ・LINE共有の情報源)から取り込み直して反映(手動更新・初回用)
  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      refreshFromLocal();
      await disruptionManager.syncFromServer();
      refreshFromLocal();
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // 変更通知では通信せず表示の更新だけ行う(通信すると通知が再び飛び、無限に繰り返すため)。
    // サーバーとの定期同期は disruptionManager 側が20秒ごとに行う。
    const unsubscribe = disruptionManager.subscribe(refreshFromLocal);
    const interval = setInterval(refreshFromLocal, 20000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetchStatus();
  };

  const hasDelay = statusData?.hasDelay ?? false;
  const activeForecasts = statusData?.forecasts || [];
  const hasForecasts = activeForecasts.length > 0;

  // 残り時間のフォーマット関数
  const formatRemainingTime = (expiresAtTimestamp?: number) => {
    if (!expiresAtTimestamp) return '';
    const diffMs = expiresAtTimestamp - Date.now();
    if (diffMs <= 0) return '期限到達（自動終了中）';
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hours > 0) {
      return `あと${hours}時間${remainMins > 0 ? `${remainMins}分` : ''}で自動解除`;
    }
    return `あと${remainMins}分で自動解除`;
  };

  const formatExpiryTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}まで有効`;
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-2">
      {/* 1. 運行予測・事前警報バナー（設定されている場合） */}
      {hasForecasts && (
        <div className="space-y-1.5 animate-fadeIn">
          {activeForecasts.map((forecast) => {
            const isWarning = forecast.severity === 'warning' || forecast.severity === 'critical';
            return (
              <div
                key={forecast.id}
                className={`border rounded-xl p-2.5 transition-all shadow-xs ${
                  isWarning
                    ? 'bg-amber-500/10 border-amber-400/60 text-amber-950 dark:text-amber-100'
                    : 'bg-indigo-500/10 border-indigo-300/80 text-indigo-950 dark:text-indigo-100'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    {isWarning ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Header Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-2xs ${
                          isWarning
                            ? 'bg-amber-500 text-white'
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        <ShieldAlert className="w-3 h-3 shrink-0" />
                        <span>{forecast.categoryLabel || '運行予測・注意情報'}</span>
                      </span>

                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white shadow-2xs">
                        ※架空設定（フィクション）
                      </span>

                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700">
                        対象: {forecast.lineName}（{forecast.section}）
                      </span>

                      <span className="text-[10px] text-[#6B6380] flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatExpiryTime(forecast.expiresAt)}</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200/70 text-slate-600 font-mono">
                          {formatRemainingTime(forecast.expiresAtTimestamp)}
                        </span>
                      </span>
                    </div>

                    {/* Headline */}
                    <div className="text-xs font-bold text-slate-900 leading-tight">
                      {forecast.headline}
                    </div>

                    {/* Expected Period */}
                    <div className="text-[11px] font-medium text-amber-900/90 flex items-center gap-1">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-200/60 font-semibold text-amber-950">
                        影響見込み時間帯
                      </span>
                      <span>{forecast.expectedPeriod}</span>
                    </div>

                    {/* Full Description */}
                    <p className="text-[11px] text-slate-700 leading-relaxed pt-0.5">
                      {forecast.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. 通常の運行状態カード（リアルタイム遅延・運休・平常運行） */}
      <div className={`border rounded-xl p-3 text-[#221C35] transition-all shadow-xs ${
        hasDelay ? 'bg-amber-50 border-amber-200' : 'bg-[#EFE8FA] border-[#E2D8F3]'
      }`}>
        {/* Smart 1-Line Horizontal Status Bar */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="cursor-pointer flex items-center justify-between gap-2 select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
              hasDelay ? 'bg-amber-100' : 'bg-emerald-100'
            }`}>
              {hasDelay ? (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <div className="flex items-center gap-2 truncate text-xs font-bold text-[#221C35]">
              <span>{hasDelay ? '一部路線で運行支障あり' : '全線平常運転'}</span>
              <span className="text-[11px] font-normal text-[#6B6380] hidden sm:inline truncate">
                {statusData ? statusData.summary : `（${lines.map((l) => l.name.replace(/^\d+\.\s*/, '').replace(/\s*\([A-Z0-9]+\)/i, '').trim()).join('・')}）`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {lastUpdated && (
              <span className="text-[10px] text-[#6B6380] font-mono hidden xs:inline">
                {lastUpdated} 更新
              </span>
            )}
            <button
              onClick={handleRefresh}
              className={`p-1 rounded-md hover:bg-white/50 text-[#6B6380] transition-all cursor-pointer ${
                isRefreshing ? 'animate-spin text-[#5B21B6]' : ''
              }`}
              title="最新情報に更新"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <div className="p-1 rounded-md text-[#6B6380] hover:bg-white/50">
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </div>
        </div>

        {/* Expandable Line Details */}
        {isExpanded && (
          <div className="mt-2.5 pt-2.5 border-t border-[#DFD5F0] space-y-2 text-xs animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {(statusData?.lines || []).map((line) => {
                const originalLine = lines.find((l) => l.code === line.code);
                const isSuspended = line.status.includes('見合わせ') || line.status.includes('運休');
                const isLineDelay = line.delayMinutes > 0 || line.status.includes('遅延');

                return (
                  <div
                    key={line.id}
                    className={`flex flex-col gap-1 p-2 rounded-lg border text-xs transition-colors ${
                      isSuspended
                        ? 'bg-rose-50 border-rose-200'
                        : isLineDelay
                        ? 'bg-amber-100/70 border-amber-300'
                        : 'bg-white/80 border-[#E6E2EE]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: originalLine?.color || '#8B5CF6' }}
                        />
                        <span className="font-bold text-[#221C35]">{line.lineName}</span>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          isSuspended
                            ? 'bg-rose-100 text-rose-800'
                            : isLineDelay
                            ? 'bg-amber-200/80 text-amber-900'
                            : 'text-emerald-700'
                        }`}
                      >
                        {line.status}
                      </span>
                    </div>
                    {line.message && (
                      <div className="text-[10px] text-[#6B6380] leading-relaxed">
                        {line.message}
                      </div>
                    )}
                    {isLineDelay || isSuspended ? (
                      <div className="text-[9px] text-[#857D99] font-medium pt-0.5">
                        ※本運行支障・遅延情報は架空鉄道アプリ内のフィクションです。実在の路線・気象等とは関係ありません。
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


