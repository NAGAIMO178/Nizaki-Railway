import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  AlertCircle,
  CheckCircle2,
  Copy,
  Trash2,
  RefreshCw,
  Database,
  Terminal,
  Lock,
  KeyRound,
  Check,
  Bug,
  Layers,
  Search,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Radio,
  FileCheck,
  Zap,
  Clock3,
  MapPin,
  ArrowLeftRight,
  Sliders,
  ChevronDown,
  CloudRain,
  Wind,
  Snowflake,
  Clock,
  Calendar,
  Sparkles,
  Info,
} from 'lucide-react';
import { systemLogger, SystemLogEntry, SystemMetrics, AuditResult } from '../utils/systemLogger';
import {
  disruptionManager,
  LineDisruption,
  DisruptionStatusType,
  DisruptionDirection,
  DEFAULT_LINE_INFOS,
  COMMON_REASONS,
  COMMON_REASON_CATEGORIES,
  COMMON_SECTIONS,
  generateDisruptionText,
  getStationsForLine,
  isWeatherRelatedReason,
  getDurationPresetsForReason,
  OperationForecast,
  ForecastCategory,
  ForecastSeverity,
  FORECAST_PRESETS,
  getExpiryOptions,
} from '../utils/disruptionManager';

interface AdminConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshAppState?: () => void;
}

const DEFAULT_PIN = '1925'; // 神埼鉄道 創業年 (初期値)
const PIN_STORAGE_KEY = 'nizaki_admin_pin';
const EMERGENCY_ALERT_KEY = 'nizaki_emergency_alert_manual';

export const AdminConsoleModal: React.FC<AdminConsoleModalProps> = ({
  isOpen,
  onClose,
  onRefreshAppState,
}) => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [currentPin, setCurrentPin] = useState(DEFAULT_PIN);
  const [newPinInput, setNewPinInput] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  // Tabs: 'disruption' | 'forecast' | 'diagnostics' | 'errors' | 'storage' | 'settings'
  const [activeTab, setActiveTab] = useState<'disruption' | 'forecast' | 'diagnostics' | 'errors' | 'storage' | 'settings'>('disruption');

  // Disruption Dispatcher State
  const [selectedLineId, setSelectedLineId] = useState<string>('kanzaki');
  const [disruptionStatusType, setDisruptionStatusType] = useState<DisruptionStatusType>('delay');
  const [targetDirection, setTargetDirection] = useState<DisruptionDirection>('both');
  const [maxDelayMinutes, setMaxDelayMinutes] = useState<number>(15);
  const [durationUntil, setDurationUntil] = useState<string>('18:30頃まで');
  const [section, setSection] = useState<string>('全線');
  const [sectionMode, setSectionMode] = useState<'all' | 'station_pair' | 'direction_up' | 'direction_down' | 'custom'>('all');
  const [fromStation, setFromStation] = useState<string>('東京');
  const [toStation, setToStation] = useState<string>('大宮');
  const [reason, setReason] = useState<string>('車両点検のため');
  const [useCustomMessage, setUseCustomMessage] = useState<boolean>(false);
  const [customMessage, setCustomMessage] = useState<string>('');
  const [linkToSystem, setLinkToSystem] = useState<boolean>(true);
  const [activeDisruptionsMap, setActiveDisruptionsMap] = useState<Record<string, LineDisruption>>(() =>
    disruptionManager.getAllDisruptions()
  );

  // Operation Forecast (運転予告・運行予測) State
  const [forecastLineId, setForecastLineId] = useState<string>('all');
  const [forecastCategory, setForecastCategory] = useState<ForecastCategory>('typhoon');
  const [forecastSeverity, setForecastSeverity] = useState<ForecastSeverity>('warning');
  const [forecastPeriod, setForecastPeriod] = useState<string>('本日夕方以降（16時頃〜終電）');
  const [forecastSection, setForecastSection] = useState<string>('全線');
  const [forecastHeadline, setForecastHeadline] = useState<string>('');
  const [forecastDescription, setForecastDescription] = useState<string>('');
  const [selectedExpiryHours, setSelectedExpiryHours] = useState<number>(6); // デフォルト6時間後
  const [customExpiryDateInput, setCustomExpiryDateInput] = useState<string>('');
  const [activeForecastsList, setActiveForecastsList] = useState<OperationForecast[]>(() =>
    disruptionManager.getOperationForecasts()
  );

  // System & Diagnostics State
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Emergency Tools State
  const [emergencyAlertText, setEmergencyAlertText] = useState('');
  const [emergencyAlertActive, setEmergencyAlertActive] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  // Storage Inspector State
  const [selectedStorageKey, setSelectedStorageKey] = useState<string | null>(null);
  const [storageDataView, setStorageDataView] = useState<string | null>(null);
  const [showClearStorageConfirm, setShowClearStorageConfirm] = useState(false);

  // Load line-specific disruption config
  const loadLineConfig = (lineId: string) => {
    setSelectedLineId(lineId);
    const stations = getStationsForLine(lineId);
    const defaultFrom = stations[0] || '東京';
    const defaultTo = stations[Math.min(stations.length - 1, 11)] || stations[stations.length - 1] || '大宮';

    const existing = disruptionManager.getLineDisruption(lineId);
    if (existing) {
      setDisruptionStatusType(existing.statusType);
      setTargetDirection(existing.targetDirection || 'both');
      setMaxDelayMinutes(existing.maxDelayMinutes || 15);
      setDurationUntil(existing.durationUntil || '');
      const existingSec = existing.section || '全線';
      setSection(existingSec);
      setReason(existing.reason || '車両点検のため');
      setUseCustomMessage(existing.useCustomMessage || false);
      setCustomMessage(existing.customMessage || '');
      setLinkToSystem(existing.linkToSystem ?? true);

      // Determine sectionMode & stations
      if (existingSec === '全線') {
        setSectionMode('all');
        setFromStation(defaultFrom);
        setToStation(defaultTo);
      } else if (existingSec === '上り線のみ') {
        setSectionMode('direction_up');
        setTargetDirection('up');
        setFromStation(defaultFrom);
        setToStation(defaultTo);
      } else if (existingSec === '下り線のみ') {
        setSectionMode('direction_down');
        setTargetDirection('down');
        setFromStation(defaultFrom);
        setToStation(defaultTo);
      } else if (existingSec.includes('〜')) {
        setSectionMode('station_pair');
        const parts = existingSec.replace('間', '').split('〜').map((s) => s.trim());
        if (parts.length === 2 && stations.includes(parts[0]) && stations.includes(parts[1])) {
          setFromStation(parts[0]);
          setToStation(parts[1]);
        } else {
          setFromStation(defaultFrom);
          setToStation(defaultTo);
        }
      } else {
        setSectionMode('custom');
        setFromStation(defaultFrom);
        setToStation(defaultTo);
      }
    } else {
      setDisruptionStatusType('delay');
      setTargetDirection('both');
      setMaxDelayMinutes(15);
      setDurationUntil('18:30頃まで');
      setSection('全線');
      setSectionMode('all');
      setFromStation(defaultFrom);
      setToStation(defaultTo);
      setReason('車両点検のため');
      setUseCustomMessage(false);
      setCustomMessage('');
      setLinkToSystem(true);
    }
  };

  // Handle station selection change
  const handleFromStationChange = (newFrom: string) => {
    setFromStation(newFrom);
    if (sectionMode === 'station_pair') {
      setSection(`${newFrom} 〜 ${toStation} 間`);
    }
  };

  const handleToStationChange = (newTo: string) => {
    setToStation(newTo);
    if (sectionMode === 'station_pair') {
      setSection(`${fromStation} 〜 ${newTo} 間`);
    }
  };

  const handleSwapStations = () => {
    const nextFrom = toStation;
    const nextTo = fromStation;
    setFromStation(nextFrom);
    setToStation(nextTo);
    if (sectionMode === 'station_pair') {
      setSection(`${nextFrom} 〜 ${nextTo} 間`);
    }
  };

  const handleSectionModeChange = (mode: 'all' | 'station_pair' | 'direction_up' | 'direction_down' | 'custom') => {
    setSectionMode(mode);
    if (mode === 'all') {
      setSection('全線');
    } else if (mode === 'station_pair') {
      setSection(`${fromStation} 〜 ${toStation} 間`);
    } else if (mode === 'direction_up') {
      setSection('上り線のみ');
      setTargetDirection('up');
    } else if (mode === 'direction_down') {
      setSection('下り線のみ');
      setTargetDirection('down');
    }
  };

  // Handle reason change with smart duration adaptation
  const handleReasonSelect = (newReason: string) => {
    setReason(newReason);
    const isWeather = isWeatherRelatedReason(newReason);
    const cat = COMMON_REASON_CATEGORIES.find((c) => c.reasons.includes(newReason));

    // 大雨・強風・台風・大雪などの気象災害時は、時刻見込み（例: 18:30頃まで）は非現実的なため「天候回復次第」や「めど未定」に自動適応
    if (isWeather) {
      if (durationUntil.includes('頃') || durationUntil.includes('分後') || !durationUntil) {
        setDurationUntil(cat?.defaultDuration || '天候回復次第');
      }
    } else if (cat) {
      if (durationUntil === '天候回復次第' || durationUntil.includes('気象情報') || durationUntil.includes('風雨が収まり')) {
        setDurationUntil(cat.defaultDuration);
      }
    }
  };

  // Operation Forecast (運転予告・運行予測) プリセット自動適用
  const applyForecastPreset = (
    cat: ForecastCategory,
    lineId: string = forecastLineId,
    period: string = forecastPeriod,
    sec: string = forecastSection
  ) => {
    setForecastCategory(cat);
    const preset = FORECAST_PRESETS.find((p) => p.category === cat) || FORECAST_PRESETS[0];
    const targetLineName =
      lineId === 'all'
        ? '神埼鉄道グループ全線'
        : DEFAULT_LINE_INFOS.find((l) => l.id === lineId)?.name || '神埼線';

    setForecastSeverity(preset.defaultSeverity);
    setForecastPeriod(period || preset.defaultPeriod);
    setSelectedExpiryHours(preset.defaultHoursAhead);
    setForecastHeadline(preset.generateHeadline(targetLineName));
    setForecastDescription(preset.generateDescription(targetLineName, period || preset.defaultPeriod, sec || '全線'));
  };

  // 運転予告・運行予測の発令処理
  const handleIssueForecast = () => {
    const targetLine = DEFAULT_LINE_INFOS.find((l) => l.id === forecastLineId);
    const lineName = forecastLineId === 'all' ? '神埼鉄道グループ全線' : (targetLine?.name || '神埼線');
    const preset = FORECAST_PRESETS.find((p) => p.category === forecastCategory) || FORECAST_PRESETS[0];

    // 有効期限の算出
    let expiresAtDate: Date;
    if (customExpiryDateInput) {
      expiresAtDate = new Date(customExpiryDateInput);
      if (isNaN(expiresAtDate.getTime()) || expiresAtDate.getTime() <= Date.now()) {
        alert('有効な未来の日時を指定してください。');
        return;
      }
    } else {
      expiresAtDate = new Date(Date.now() + selectedExpiryHours * 60 * 60 * 1000);
    }

    const saved = disruptionManager.saveOperationForecast({
      lineId: forecastLineId,
      lineName,
      code: targetLine?.code,
      category: forecastCategory,
      categoryLabel: preset.badgeLabel,
      expectedPeriod: forecastPeriod.trim() || preset.defaultPeriod,
      section: forecastSection.trim() || '全線',
      headline: forecastHeadline.trim() || preset.generateHeadline(lineName),
      description: forecastDescription.trim() || preset.generateDescription(lineName, forecastPeriod, forecastSection),
      severity: forecastSeverity,
      expiresAt: expiresAtDate.toISOString(),
      expiresAtTimestamp: expiresAtDate.getTime(),
      isActive: true,
    });

    setActiveForecastsList(disruptionManager.getOperationForecasts());
    systemLogger.warn(
      `[運行予測発令] ${lineName} に「${preset.name}」（有効期限: ${expiresAtDate.toLocaleString('ja-JP')}）を発令しました`,
      'DisruptionDispatcher'
    );
    setActionNotice(`【運行予測発令】${lineName} に「${preset.name}」を発令しました（期限時に自動解除）`);
    setTimeout(() => setActionNotice(null), 4000);
    if (onRefreshAppState) onRefreshAppState();
  };

  // 運転予告の手動解除
  const handleDeleteForecast = (id: string) => {
    disruptionManager.removeOperationForecast(id);
    setActiveForecastsList(disruptionManager.getOperationForecasts());
    systemLogger.info(`[運行予測解除] 予告警報 (ID: ${id}) を手動解除しました`, 'DisruptionDispatcher');
    setActionNotice('【運行予測解除】選択した運行予告・警報を解除しました');
    setTimeout(() => setActionNotice(null), 3000);
    if (onRefreshAppState) onRefreshAppState();
  };

  // 全ての運転予告を一括解除
  const handleClearAllForecasts = () => {
    disruptionManager.clearAllOperationForecasts();
    setActiveForecastsList([]);
    systemLogger.info('[運行予測一括解除] すべての運行予告・警報を解除しました', 'DisruptionDispatcher');
    setActionNotice('【全予告解除】すべての運行予測・警報を解除しました');
    setTimeout(() => setActionNotice(null), 3000);
    if (onRefreshAppState) onRefreshAppState();
  };

  // Dispatch disruption
  const handleDispatchDisruption = () => {
    const lineDef = DEFAULT_LINE_INFOS.find((l) => l.id === selectedLineId) || DEFAULT_LINE_INFOS[0];
    const generatedText = generateDisruptionText(
      lineDef.name,
      disruptionStatusType,
      maxDelayMinutes,
      section,
      reason,
      durationUntil,
      targetDirection
    );

    const disruptionData: LineDisruption = {
      lineId: selectedLineId,
      lineName: lineDef.name,
      code: lineDef.code,
      statusType: disruptionStatusType,
      targetDirection,
      maxDelayMinutes: Number(maxDelayMinutes) || 0,
      durationUntil: durationUntil.trim(),
      section: section.trim() || '全線',
      reason: reason.trim() || '安全確認のため',
      customMessage: customMessage.trim() || generatedText,
      useCustomMessage,
      linkToSystem,
      updatedAt: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    };

    disruptionManager.setLineDisruption(disruptionData);
    setActiveDisruptionsMap(disruptionManager.getAllDisruptions());
    const dirLabel = targetDirection === 'up' ? ' [上り線のみ]' : targetDirection === 'down' ? ' [下り線のみ]' : ' [上下線]';
    systemLogger.info(
      `[運行指令発令] ${lineDef.name} (${lineDef.code})${dirLabel}: ${
        disruptionStatusType === 'delay' ? `遅延(最大約${maxDelayMinutes}分)` : disruptionStatusType
      } / 連動=${linkToSystem}`,
      'DisruptionDispatcher'
    );
    setActionNotice(`【運行指令発令】${lineDef.name}${dirLabel} の運行情報・遅延を更新・反映しました`);
    setTimeout(() => setActionNotice(null), 3500);
    if (onRefreshAppState) onRefreshAppState();
  };

  // Clear single line disruption
  const handleClearLineDisruption = (lineIdToClear?: string) => {
    const targetLineId = lineIdToClear || selectedLineId;
    const lineDef = DEFAULT_LINE_INFOS.find((l) => l.id === targetLineId) || DEFAULT_LINE_INFOS[0];
    disruptionManager.clearLineDisruption(targetLineId);
    setActiveDisruptionsMap(disruptionManager.getAllDisruptions());
    if (targetLineId === selectedLineId) {
      setDisruptionStatusType('normal');
      setUseCustomMessage(false);
      setCustomMessage('');
    }
    systemLogger.info(`[運行指令] ${lineDef.name} を平常運転に復帰しました`, 'DisruptionDispatcher');
    setActionNotice(`【平常復帰】${lineDef.name} を平常運転に設定しました`);
    setTimeout(() => setActionNotice(null), 3000);
    if (onRefreshAppState) onRefreshAppState();
  };

  // Clear all disruptions
  const handleClearAllDisruptions = () => {
    disruptionManager.clearAllDisruptions();
    setActiveDisruptionsMap({});
    setDisruptionStatusType('normal');
    setUseCustomMessage(false);
    setCustomMessage('');
    systemLogger.info('[運行指令] 全線の運行支障を一括解除し平常運転に復帰しました', 'DisruptionDispatcher');
    setActionNotice('【全線平常復帰】すべての路線の遅延・運休を解除しました');
    setTimeout(() => setActionNotice(null), 3500);
    if (onRefreshAppState) onRefreshAppState();
  };

  // Handle modal close with auth reset
  const handleClose = () => {
    setIsAuthenticated(false);
    setPinInput('');
    setPinError(false);
    setShowClearStorageConfirm(false);
    onClose();
  };

  // Reset auth and load custom PIN & emergency alert state whenever modal opens/closes
  useEffect(() => {
    setIsAuthenticated(false);
    setPinInput('');
    setPinError(false);
    setShowClearStorageConfirm(false);
    setSelectedStorageKey(null);
    setStorageDataView(null);

    try {
      const savedPin = localStorage.getItem(PIN_STORAGE_KEY);
      if (savedPin && savedPin.length === 4) {
        setCurrentPin(savedPin);
      } else {
        setCurrentPin(DEFAULT_PIN);
      }

      const savedAlert = localStorage.getItem(EMERGENCY_ALERT_KEY);
      if (savedAlert) {
        setEmergencyAlertText(savedAlert);
        setEmergencyAlertActive(true);
      }
    } catch {
      // Ignore
    }
  }, [isOpen]);

  // Subscribe to logs and fetch metrics
  useEffect(() => {
    if (!isOpen) return;

    setMetrics(systemLogger.getMetrics());
    const unsubscribe = systemLogger.subscribe((updatedLogs) => {
      setLogs(updatedLogs);
    });

    const interval = setInterval(() => {
      setMetrics(systemLogger.getMetrics());
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle PIN Keypad input
  const handleKeypadPress = (val: string) => {
    if (pinInput.length < 4) {
      const nextPin = pinInput + val;
      setPinInput(nextPin);
      setPinError(false);

      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleKeypadBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setPinError(false);
  };

  const handleKeypadClear = () => {
    setPinInput('');
    setPinError(false);
  };

  // Strictly verify against current active PIN only
  const verifyPin = (inputToTest: string) => {
    if (inputToTest === currentPin) {
      setIsAuthenticated(true);
      setPinInput('');
      setPinError(false);
      systemLogger.info('管理者コンソールへのアクセスが認証されました', 'AdminAuth');
    } else {
      setPinError(true);
      setTimeout(() => {
        setPinInput('');
      }, 500);
      systemLogger.warn(`パスコード不一致の入力試行: [${inputToTest}]`, 'AdminAuth');
    }
  };

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.length === 4 && /^\d{4}$/.test(newPinInput)) {
      setCurrentPin(newPinInput);
      try {
        localStorage.setItem(PIN_STORAGE_KEY, newPinInput);
      } catch {
        // Ignore
      }
      setPinChangeSuccess(true);
      setNewPinInput('');
      setTimeout(() => setPinChangeSuccess(false), 2500);
      systemLogger.info('管理者パスコードが更新されました（旧PINは無効化されました）', 'AdminAuth');
    }
  };

  const handleResetPin = () => {
    setCurrentPin(DEFAULT_PIN);
    try {
      localStorage.removeItem(PIN_STORAGE_KEY);
    } catch {
      // Ignore
    }
    setPinChangeSuccess(true);
    setTimeout(() => setPinChangeSuccess(false), 2500);
    systemLogger.info('管理者パスコードが初期値にリセットされました', 'AdminAuth');
  };

  // Emergency Actions
  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const result = systemLogger.runIntegrityAudit();
      setAuditResult(result);
      setIsAuditing(false);
      setActionNotice('全4路線およびシステム整合性監査が正常に完了しました');
      setTimeout(() => setActionNotice(null), 3000);
    }, 400);
  };

  const handleEmergencyResync = () => {
    if (
      confirm(
        '緊急データ再同期を実行しますか？\n（ユーザー情報・ポイントを保持したまま、運行データおよび一時キャッシュを再構築します）'
      )
    ) {
      const ok = systemLogger.emergencyCacheResync();
      if (ok) {
        setMetrics(systemLogger.getMetrics());
        setActionNotice('一時キャッシュのパージと運行データの再同期が完了しました');
        if (onRefreshAppState) onRefreshAppState();
        setTimeout(() => setActionNotice(null), 3500);
      }
    }
  };

  const handleSetEmergencyAlert = () => {
    if (!emergencyAlertText.trim()) return;
    try {
      localStorage.setItem(EMERGENCY_ALERT_KEY, emergencyAlertText.trim());
      setEmergencyAlertActive(true);
      systemLogger.warn(`緊急運行速報が発令されました: [${emergencyAlertText.trim()}]`, 'EmergencyAlert');
      setActionNotice('緊急運行速報を発令しました');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (e: any) {
      systemLogger.error(`速報発令エラー: ${e.message}`, 'EmergencyAlert');
    }
  };

  const handleClearEmergencyAlert = () => {
    try {
      localStorage.removeItem(EMERGENCY_ALERT_KEY);
      setEmergencyAlertActive(false);
      setEmergencyAlertText('');
      systemLogger.info('緊急運行速報が解除されました', 'EmergencyAlert');
      setActionNotice('緊急運行速報を解除しました');
      setTimeout(() => setActionNotice(null), 3000);
    } catch {
      // Ignore
    }
  };

  const handleClearLogs = () => {
    if (confirm('システムログをすべて消去しますか？')) {
      systemLogger.clearLogs();
    }
  };

  const handleCopyLogs = () => {
    const text = JSON.stringify(logs, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  };

  // Storage Inspect
  const handleInspectKey = (key: string) => {
    setSelectedStorageKey(key);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setStorageDataView('(空データ)');
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        setStorageDataView(JSON.stringify(parsed, null, 2));
      } catch {
        setStorageDataView(raw);
      }
    } catch {
      setStorageDataView('(読み込みエラー)');
    }
  };

  const handleDeleteStorageKey = (key: string) => {
    if (confirm(`LocalStorageキー [${key}] を削除しますか？`)) {
      try {
        localStorage.removeItem(key);
        setMetrics(systemLogger.getMetrics());
        setSelectedStorageKey(null);
        setStorageDataView(null);
        systemLogger.info(`ストレージキー [${key}] を削除しました`, 'StorageInspector');
      } catch (e: any) {
        systemLogger.error(`ストレージ削除失敗: ${e.message}`, 'StorageInspector');
      }
    }
  };

  // Execute full storage clear after explicit confirmation
  const executeClearAllStorage = () => {
    try {
      localStorage.clear();
      setMetrics(systemLogger.getMetrics());
      setSelectedStorageKey(null);
      setStorageDataView(null);
      systemLogger.warn('管理者によりLocalStorage全初期化が実行されました', 'StorageInspector');
      if (onRefreshAppState) onRefreshAppState();
      setActionNotice('LocalStorageの全データを初期化しました');
      setTimeout(() => setActionNotice(null), 3500);
    } catch (e: any) {
      systemLogger.error(`ストレージ初期化エラー: ${e.message}`, 'StorageInspector');
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter !== 'all' && log.level !== logFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.source.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const errorCount = logs.filter((l) => l.level === 'error' || l.level === 'critical').length;
  const currentLineDef = DEFAULT_LINE_INFOS.find((l) => l.id === selectedLineId) || DEFAULT_LINE_INFOS[0];
  const currentStations = getStationsForLine(selectedLineId);
  const activeDisruptionCount = Object.keys(activeDisruptionsMap).length;

  return (
    <div
      id="admin-console-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs transition-opacity"
    >
      <div
        id="admin-console-modal-card"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl h-[620px] max-h-[92vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden relative"
      >
        {/* Header - Universal Design Compliant High-Contrast Calm Bar */}
        <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-slate-200">
              {isAuthenticated ? <Terminal className="w-4 h-4 text-indigo-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs sm:text-sm text-slate-50 tracking-tight">
                  神埼鉄道 管理者指令コンソール
                </span>
                <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-[10px] font-mono font-bold rounded">
                  v3.12.3
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {isAuthenticated ? '運行指令・駅間影響設定・システム診断' : 'アクセスには4桁の認証パスコードが必要です'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isAuthenticated && (
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setPinInput('');
                  setPinError(false);
                }}
                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title="セッションをロック"
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span>ロック</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Notice Banner */}
        {actionNotice && (
          <div className="px-3.5 py-2 bg-indigo-950 border-b border-indigo-700/60 text-indigo-200 text-xs flex items-center gap-2 shrink-0 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-medium">{actionNotice}</span>
          </div>
        )}

        {/* Modal Body */}
        {!isAuthenticated ? (
          /* ========================================================
             1. Passcode Authentication Screen (UD & High Contrast)
             ======================================================== */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3.5 min-h-0 select-none">
            <div className="w-13 h-13 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 shadow-md">
              <KeyRound className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100">管理者パスコードを入力</h3>
              <p className="text-[11px] text-slate-400">
                運行指令・遅延設定およびシステム診断ツールを開きます
              </p>
            </div>

            {/* PIN Indicator Dots */}
            <div className="flex items-center justify-center gap-3 py-1">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    pinInput.length > index
                      ? 'bg-amber-400 scale-115 shadow-sm shadow-amber-400/50'
                      : 'bg-slate-700 border border-slate-600'
                  }`}
                />
              ))}
            </div>

            {/* Fixed Height Slot: Prevents layout jumping */}
            <div className="h-5 flex items-center justify-center">
              <p
                className={`text-[11px] text-rose-400 font-semibold flex items-center gap-1 transition-opacity duration-150 ${
                  pinError ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>パスコードが正しくありません</span>
              </p>
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 w-60 max-w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === 'C') handleKeypadClear();
                    else if (k === '⌫') handleKeypadBackspace();
                    else handleKeypadPress(k);
                  }}
                  className={`h-11 rounded-xl font-mono text-sm font-semibold transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
                    k === 'C' || k === '⌫'
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-100 text-xs font-sans'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 hover:border-slate-500 shadow-sm'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ========================================================
             2. Authenticated Admin Dashboard (5 Clean UD Tabs)
             ======================================================== */
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            {/* Clean Tab Navigation Bar */}
            <div className="px-3 bg-slate-800/90 border-b border-slate-700 flex gap-1 overflow-x-auto shrink-0 scrollbar-none">
              <button
                onClick={() => setActiveTab('disruption')}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border-b-2 ${
                  activeTab === 'disruption'
                    ? 'text-amber-400 border-amber-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span>運行指令</span>
                {activeDisruptionCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-mono font-bold">
                    {activeDisruptionCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('forecast');
                  if (!forecastHeadline) {
                    applyForecastPreset(forecastCategory, forecastLineId, forecastPeriod, forecastSection);
                  }
                }}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border-b-2 ${
                  activeTab === 'forecast'
                    ? 'text-sky-400 border-sky-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                <span>運行予測 (予告)</span>
                {activeForecastsList.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded text-[10px] font-mono font-bold">
                    {activeForecastsList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('diagnostics')}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border-b-2 ${
                  activeTab === 'diagnostics'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>システム診断</span>
              </button>

              <button
                onClick={() => setActiveTab('errors')}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border-b-2 ${
                  activeTab === 'errors'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <Bug className="w-3.5 h-3.5" />
                <span>エラーログ</span>
                {errorCount > 0 ? (
                  <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] font-mono font-bold">
                    {errorCount}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-mono">
                    0
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('storage')}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border-b-2 ${
                  activeTab === 'storage'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>ストレージ</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border-b-2 ${
                  activeTab === 'settings'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>PIN設定</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-3.5 overflow-y-auto flex-1 space-y-3 text-xs">
              {/* ========================================================
                  TAB 0: 運行指令・遅延設定 (Universal Design & Flexible Dropdown Sections)
                  ======================================================== */}
              {activeTab === 'disruption' && (() => {
                const generatedPreview = generateDisruptionText(
                  currentLineDef.name,
                  disruptionStatusType,
                  maxDelayMinutes,
                  section,
                  reason,
                  durationUntil,
                  targetDirection
                );

                return (
                  <div className="space-y-3">
                    {/* Disruption Status Summary Banner */}
                    <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            activeDisruptionCount > 0
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          <Radio className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                            <span>運行指令マネージャー</span>
                            {activeDisruptionCount > 0 ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                {activeDisruptionCount}路線で支障発令中
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                                全線 平常運転
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">
                            路線・運行区分・遅延分数・影響区間（駅プルダウン式）を即時連動
                          </p>
                        </div>
                      </div>

                      {activeDisruptionCount > 0 && (
                        <button
                          onClick={handleClearAllDisruptions}
                          className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                          title="すべての路線の運行支障を一括で解除します"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>全線平常復帰</span>
                        </button>
                      )}
                    </div>

                    {/* Step 1: Target Line & Status Type */}
                    <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-100 font-bold text-xs flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 text-[10px] flex items-center justify-center font-bold">
                            1
                          </span>
                          <span>対象路線と運行区分を選択</span>
                        </label>
                        {activeDisruptionsMap[selectedLineId] && (
                          <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>発令中</span>
                          </span>
                        )}
                      </div>

                      {/* Line Selector Buttons */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {DEFAULT_LINE_INFOS.map((line) => {
                          const isSelected = selectedLineId === line.id;
                          const hasDisruption = !!activeDisruptionsMap[line.id];
                          return (
                            <button
                              key={line.id}
                              onClick={() => loadLineConfig(line.id)}
                              className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-slate-750 border-amber-400 text-white ring-1 ring-amber-400/50 shadow-sm'
                                  : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-750'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className="w-5 h-5 rounded text-[10px] font-mono font-black text-white flex items-center justify-center shadow-xs"
                                  style={{ backgroundColor: line.color }}
                                >
                                  {line.code}
                                </span>
                                {hasDisruption && (
                                  <span className="w-2 h-2 rounded-full bg-amber-400" title="運行支障あり" />
                                )}
                              </div>
                              <div className="mt-1.5">
                                <span className="font-bold text-[11px] block truncate">{line.name}</span>
                                <span className="text-[9px] text-slate-400 block truncate">
                                  {hasDisruption ? '運行支障あり' : '平常運転'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Status Type 4-Way Segmented Buttons (Color Universal Design) */}
                      <div className="pt-2 border-t border-slate-700">
                        <span className="text-[10px] text-slate-400 block mb-1.5 font-medium">運行状況（ステータス）:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {[
                            {
                              type: 'delay',
                              symbol: '▲',
                              label: '列車遅延',
                              desc: '遅延発生',
                              activeStyle: 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold',
                            },
                            {
                              type: 'suspended',
                              symbol: '✕',
                              label: '運転見合わせ',
                              desc: '全線運転停止',
                              activeStyle: 'border-rose-400 bg-rose-500/20 text-rose-200 font-bold',
                            },
                            {
                              type: 'partially_suspended',
                              symbol: '◓',
                              label: '一部区間運休',
                              desc: '特定区間運休',
                              activeStyle: 'border-orange-400 bg-orange-500/20 text-orange-200 font-bold',
                            },
                            {
                              type: 'normal',
                              symbol: '●',
                              label: '平常運転',
                              desc: '定時運行',
                              activeStyle: 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold',
                            },
                          ].map((item) => (
                            <button
                              key={item.type}
                              onClick={() => setDisruptionStatusType(item.type as DisruptionStatusType)}
                              className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                                disruptionStatusType === item.type
                                  ? item.activeStyle
                                  : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                              }`}
                            >
                              <div className="text-[11px] font-bold flex items-center gap-1">
                                <span className="text-xs">{item.symbol}</span>
                                <span>{item.label}</span>
                              </div>
                              <div className="text-[9px] opacity-80">{item.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Delay Scale, Section (Express Ticket Style Dropdown), Reason & Duration */}
                    {disruptionStatusType !== 'normal' && (
                      <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-3">
                        <label className="text-slate-100 font-bold text-xs flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 text-[10px] flex items-center justify-center font-bold">
                            2
                          </span>
                          <span>遅延規模・影響区間（プルダウン）・発生理由</span>
                        </label>

                        {/* Max Delay Minutes (When delay or partially suspended) */}
                        {(disruptionStatusType === 'delay' || disruptionStatusType === 'partially_suspended') && (
                          <div className="space-y-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/80">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-200 font-semibold flex items-center gap-1.5">
                                <Clock3 className="w-3.5 h-3.5 text-amber-400" />
                                <span>最大遅延時間:</span>
                                <strong className="text-amber-400 font-mono text-sm ml-0.5">
                                  最大 約{maxDelayMinutes}分遅れ
                                </strong>
                              </span>
                              <span className="text-[10px] text-slate-400">
                                (各列車に 1〜{maxDelayMinutes}分の遅れを自動乱数配分)
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min={1}
                                max={120}
                                step={1}
                                value={maxDelayMinutes}
                                onChange={(e) => setMaxDelayMinutes(Number(e.target.value))}
                                className="flex-1 accent-amber-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg"
                              />
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number"
                                  min={1}
                                  max={180}
                                  value={maxDelayMinutes}
                                  onChange={(e) => setMaxDelayMinutes(Math.max(1, Number(e.target.value) || 1))}
                                  className="w-14 px-2 py-1 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono text-center text-xs focus:outline-none focus:border-amber-400"
                                />
                                <span className="text-[11px] text-slate-400">分</span>
                              </div>
                            </div>

                            {/* Delay Preset Chips */}
                            <div className="flex flex-wrap gap-1 items-center pt-0.5">
                              <span className="text-[10px] text-slate-400 mr-1 font-medium">クイック選択:</span>
                              {[5, 10, 15, 20, 30, 45, 60].map((mins) => (
                                <button
                                  key={mins}
                                  onClick={() => setMaxDelayMinutes(mins)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                                    maxDelayMinutes === mins
                                      ? 'bg-amber-400 text-slate-950 font-bold'
                                      : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                                  }`}
                                >
                                  {mins}分
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ========================================================
                            TARGET DIRECTION SELECTION (上下線 / 上り線のみ / 下り線のみ)
                            ======================================================== */}
                        <div className="space-y-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-200 font-semibold flex items-center gap-1.5">
                              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                              <span>対象方向（上下線 / 上り / 下り個別設定）</span>
                            </span>
                            <span className="text-[10px] font-bold text-amber-300">
                              {targetDirection === 'both' ? '上下線ともに適用' : targetDirection === 'up' ? '上り線のみ遅延' : '下り線のみ遅延'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { dir: 'both' as DisruptionDirection, label: '上下線 (両方向)', desc: '上下全列車に適用' },
                              { dir: 'up' as DisruptionDirection, label: '上り線 のみ', desc: '上り列車のみ遅延' },
                              { dir: 'down' as DisruptionDirection, label: '下り線 のみ', desc: '下り列車のみ遅延' },
                            ].map((item) => (
                              <button
                                key={item.dir}
                                type="button"
                                onClick={() => {
                                  setTargetDirection(item.dir);
                                  if (item.dir === 'up') {
                                    setSectionMode('direction_up');
                                    setSection('上り線のみ');
                                  } else if (item.dir === 'down') {
                                    setSectionMode('direction_down');
                                    setSection('下り線のみ');
                                  } else if (section === '上り線のみ' || section === '下り線のみ') {
                                    setSectionMode('all');
                                    setSection('全線');
                                  }
                                }}
                                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                                  targetDirection === item.dir
                                    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-100 font-bold shadow-xs'
                                    : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                                }`}
                              >
                                <div className="text-[11px] font-bold">{item.label}</div>
                                <div className="text-[9px] opacity-75">{item.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* ========================================================
                            FLEXIBLE IMPACT SECTION SETTING (Express Ticket Dropdown Style)
                            ======================================================== */}
                        <div className="space-y-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-200 font-semibold flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-amber-400" />
                              <span>影響区間設定 (駅プルダウン選択 & 柔軟指定)</span>
                            </span>
                            <span className="text-[10px] text-indigo-300 font-mono">
                              {currentLineDef.name} ({currentStations.length}駅)
                            </span>
                          </div>

                          {/* Section Mode Pills */}
                          <div className="flex flex-wrap gap-1">
                            {[
                              { mode: 'all', label: '全線' },
                              { mode: 'station_pair', label: '駅間指定 (プルダウン)' },
                              { mode: 'direction_up', label: '上り線のみ' },
                              { mode: 'direction_down', label: '下り線のみ' },
                              { mode: 'custom', label: '自由入力' },
                            ].map((m) => (
                              <button
                                key={m.mode}
                                onClick={() =>
                                  handleSectionModeChange(
                                    m.mode as 'all' | 'station_pair' | 'direction_up' | 'direction_down' | 'custom'
                                  )
                                }
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                                  sectionMode === m.mode
                                    ? 'bg-indigo-600 text-white border-indigo-400 font-bold shadow-xs'
                                    : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>

                          {/* Express Ticket Style Dual Dropdowns */}
                          {sectionMode === 'station_pair' && (
                            <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-700 space-y-2">
                              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                                <span>乗車駅選択と同様のプルダウンで起点・終点を柔軟指定:</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* From Station Dropdown */}
                                <div className="flex-1 space-y-1">
                                  <label className="text-[10px] text-slate-400 font-medium block">
                                    起点駅 (From)
                                  </label>
                                  <div className="relative">
                                    <select
                                      value={fromStation}
                                      onChange={(e) => handleFromStationChange(e.target.value)}
                                      className="w-full pl-2.5 pr-6 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-xs font-medium focus:outline-none focus:border-amber-400 cursor-pointer appearance-none"
                                    >
                                      {currentStations.map((stn, idx) => (
                                        <option key={stn} value={stn}>
                                          {idx + 1}. {stn}駅
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                                  </div>
                                </div>

                                {/* Swap Button */}
                                <div className="pt-4 shrink-0">
                                  <button
                                    type="button"
                                    onClick={handleSwapStations}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-md text-xs transition-colors cursor-pointer flex items-center justify-center"
                                    title="起点駅と終点駅を入れ替え"
                                  >
                                    <ArrowLeftRight className="w-4 h-4 text-amber-400" />
                                  </button>
                                </div>

                                {/* To Station Dropdown */}
                                <div className="flex-1 space-y-1">
                                  <label className="text-[10px] text-slate-400 font-medium block">
                                    終点駅 (To)
                                  </label>
                                  <div className="relative">
                                    <select
                                      value={toStation}
                                      onChange={(e) => handleToStationChange(e.target.value)}
                                      className="w-full pl-2.5 pr-6 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-100 text-xs font-medium focus:outline-none focus:border-amber-400 cursor-pointer appearance-none"
                                    >
                                      {currentStations.map((stn, idx) => (
                                        <option key={stn} value={stn}>
                                          {idx + 1}. {stn}駅
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Computed Section Output / Direct Editable Input */}
                          <div className="space-y-1 pt-1">
                            <span className="text-[10px] text-slate-400 font-medium block">
                              反映される影響区間テキスト:
                            </span>
                            <input
                              type="text"
                              value={section}
                              onChange={(e) => {
                                setSection(e.target.value);
                                if (sectionMode !== 'custom' && sectionMode !== 'station_pair') {
                                  setSectionMode('custom');
                                }
                              }}
                              placeholder="例: 全線、大宮 〜 横浜 間、上り線のみ"
                              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs font-medium focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          {/* Quick Common Section Presets for current line */}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            <span className="text-[10px] text-slate-400 mr-1 font-medium">主要区間:</span>
                            {(COMMON_SECTIONS[selectedLineId] || ['全線']).map((sec) => (
                              <button
                                key={sec}
                                onClick={() => {
                                  setSection(sec);
                                  if (sec === '全線') setSectionMode('all');
                                  else if (sec.includes('〜')) setSectionMode('station_pair');
                                  else setSectionMode('custom');
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                                  section === sec
                                    ? 'bg-slate-700 text-amber-300 border border-amber-400/50 font-bold'
                                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                                }`}
                              >
                                {sec}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Reason Selection (Categorized & Smart-Aware) */}
                        <div className="space-y-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-200 font-semibold flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                              <span>発生理由</span>
                            </span>
                            {isWeatherRelatedReason(reason) && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-bold flex items-center gap-1">
                                <span>気象・自然要因（天候回復待ち・目処未定推奨）</span>
                              </span>
                            )}
                          </div>

                          <input
                            type="text"
                            value={reason}
                            onChange={(e) => handleReasonSelect(e.target.value)}
                            placeholder="例: 大雨のため、強風のため、車両点検のため"
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs font-medium focus:outline-none focus:border-amber-400"
                          />

                          {/* Categorized Reason Buttons */}
                          <div className="space-y-1.5 pt-0.5">
                            {COMMON_REASON_CATEGORIES.map((catGroup) => (
                              <div key={catGroup.category} className="space-y-0.5">
                                <span className="text-[9px] text-slate-400 font-medium block">
                                  {catGroup.category}:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {catGroup.reasons.map((r) => (
                                    <button
                                      key={r}
                                      type="button"
                                      onClick={() => handleReasonSelect(r)}
                                      className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                                        reason === r
                                          ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                                          : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750 border border-slate-700'
                                      }`}
                                    >
                                      {r}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Duration / Until (Weather & Context Aware) */}
                        <div className="space-y-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/80">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-200 font-semibold flex items-center gap-1.5">
                              <Clock3 className="w-3.5 h-3.5 text-amber-400" />
                              <span>復旧・運転再開見込み</span>
                            </span>
                            {isWeatherRelatedReason(reason) ? (
                              <span className="text-[10px] text-amber-300 font-medium">
                                ※大雨・強風等では定刻予測ではなく「天候回復次第」等を推奨
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                (点検終了や現場検証完了の目安)
                              </span>
                            )}
                          </div>

                          <input
                            type="text"
                            value={durationUntil}
                            onChange={(e) => setDurationUntil(e.target.value)}
                            placeholder={
                              isWeatherRelatedReason(reason)
                                ? '例: 天候回復次第、現時点で復旧のめどは立っていません'
                                : '例: 18:30頃まで、点検完了次第'
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs font-medium focus:outline-none focus:border-amber-400"
                          />

                          {/* Dynamic Smart Presets based on selected Reason */}
                          <div className="space-y-1 pt-0.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] text-slate-400 font-medium">
                                推奨プリセット ({reason.replace('のため', '')}):
                              </span>
                              <button
                                type="button"
                                onClick={() => setDurationUntil('')}
                                className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer ${
                                  !durationUntil
                                    ? 'bg-slate-700 text-amber-300 font-bold'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                設定なし（記載なし）
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {getDurationPresetsForReason(reason).map((dur) => (
                                <button
                                  key={dur}
                                  type="button"
                                  onClick={() => setDurationUntil(dur)}
                                  className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                                    durationUntil === dur
                                      ? 'bg-indigo-600 text-white font-bold border border-indigo-400 shadow-xs'
                                      : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750 border border-slate-700'
                                  }`}
                                >
                                  {dur}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Official Announcement Preview & Dispatch Action */}
                    <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-100 font-bold text-xs flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 text-[10px] flex items-center justify-center font-bold">
                            3
                          </span>
                          <span>公式アナウンス・システム連動と発令</span>
                        </label>

                        {disruptionStatusType !== 'normal' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!useCustomMessage) {
                                setCustomMessage(generatedPreview);
                              }
                              setUseCustomMessage(!useCustomMessage);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer border ${
                              useCustomMessage
                                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-400'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
                            }`}
                          >
                            {useCustomMessage ? '自由入力中' : '自動生成モード (切替)'}
                          </button>
                        )}
                      </div>

                      {disruptionStatusType !== 'normal' && (
                        <>
                          {useCustomMessage ? (
                            <div className="space-y-1">
                              <textarea
                                rows={2}
                                value={customMessage}
                                onChange={(e) => setCustomMessage(e.target.value)}
                                placeholder="独自の遅延・運休アナウンス文言を入力してください"
                                className="w-full p-2 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs focus:outline-none focus:border-amber-400 resize-none font-sans leading-relaxed"
                              />
                            </div>
                          ) : (
                            <div className="p-2 bg-slate-950 rounded-md border border-slate-700/80 space-y-1">
                              <span className="text-[10px] text-slate-400 block font-mono">
                                公式アナウンス自動プレビュー:
                              </span>
                              <p className="text-slate-200 text-xs leading-relaxed font-sans select-all">
                                {generatedPreview}
                              </p>
                            </div>
                          )}

                          {/* System Linkage Toggle */}
                          <div className="p-2 bg-slate-950/60 rounded-md border border-slate-700 flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-200">
                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                                <span>走行位置・発車案内への遅延連動</span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {linkToSystem
                                  ? 'ホーム画面・走行位置・発車標のすべてに遅延・運休を即時連動します'
                                  : '運行情報カードへの文言掲示のみ行い、ダイヤへの遅延加算は行いません'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setLinkToSystem(!linkToSystem)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                                linkToSystem ? 'bg-amber-400' : 'bg-slate-700'
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-slate-950 transition-transform ${
                                  linkToSystem ? 'translate-x-4.5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </>
                      )}

                      {/* Dispatch & Clear Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        {disruptionStatusType === 'normal' ? (
                          <button
                            onClick={() => handleClearLineDisruption()}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                          >
                            <Check className="w-4 h-4" />
                            <span>{currentLineDef.name} を平常運転に設定・反映</span>
                          </button>
                        ) : (
                          <button
                            onClick={handleDispatchDisruption}
                            className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                          >
                            <Zap className="w-4 h-4 fill-slate-950" />
                            <span>【運行指令発令】{currentLineDef.name} に反映する</span>
                          </button>
                        )}

                        {activeDisruptionsMap[selectedLineId] && disruptionStatusType !== 'normal' && (
                          <button
                            onClick={() => handleClearLineDisruption()}
                            className="py-2.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-medium text-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>この路線の支障を解除</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Active Disruptions Summary List */}
                    <div className="pt-2 border-t border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-200">
                          現在発令中の運行支障一覧
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-bold">
                          {activeDisruptionCount}件 発令中
                        </span>
                      </div>

                      {activeDisruptionCount === 0 ? (
                        <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 text-center text-slate-400 text-xs">
                          現在発令中の遅延・運休指令はありません（全線平常運行中）
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {(Object.values(activeDisruptionsMap) as LineDisruption[]).map((dis: LineDisruption) => (
                            <div
                              key={dis.lineId}
                              className="p-2.5 bg-slate-800/90 rounded-lg border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-100 text-xs">
                                    {dis.lineName}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      dis.statusType === 'suspended'
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                        : dis.statusType === 'partially_suspended'
                                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    }`}
                                  >
                                    {dis.statusType === 'suspended'
                                      ? '運転見合わせ'
                                      : dis.statusType === 'partially_suspended'
                                      ? '一部運休'
                                      : `遅延(最大${dis.maxDelayMinutes}分)`}
                                  </span>
                                  {dis.linkToSystem && (
                                    <span className="px-1 py-0.2 bg-indigo-500/20 text-indigo-300 text-[9px] rounded font-mono font-bold">
                                      システム連動中
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    更新: {dis.updatedAt}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                                  {dis.customMessage || dis.reason}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => loadLineConfig(dis.lineId)}
                                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-medium transition-colors cursor-pointer"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => handleClearLineDisruption(dis.lineId)}
                                  className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded text-[10px] font-medium transition-colors cursor-pointer"
                                >
                                  解除
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ========================================================
                  TAB 0.5: 運行予測・運転予告 (Weather Forecast, Gale/Snow/Typhoon Alerts with Auto-Expiration)
                  ======================================================== */}
              {activeTab === 'forecast' && (() => {
                const expiryOptions = getExpiryOptions();

                return (
                  <div className="space-y-3 animate-fadeIn">
                    {/* Header Banner */}
                    <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            activeForecastsList.length > 0
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                              : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          }`}
                        >
                          <CloudRain className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                            <span>運行予測・事前警報（運転予告）</span>
                            {activeForecastsList.length > 0 ? (
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                                {activeForecastsList.length}件 予告発令中
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px]">
                                発令なし
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">
                            悪天候・台風・強風等の影響予告を事前アナウンス（※アプリ内シミュレーション・フィクション表示）
                          </p>
                        </div>
                      </div>

                      {activeForecastsList.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllForecasts}
                          className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>全予告を一括解除</span>
                        </button>
                      )}
                    </div>

                    {/* Step 1: Target Line, Section, and Expected Period */}
                    <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2.5">
                      <label className="text-slate-100 font-bold text-xs flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 text-[10px] flex items-center justify-center font-bold">
                          1
                        </span>
                        <span>対象路線・区間・影響見込み時間帯</span>
                      </label>

                      {/* Line Selector */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setForecastLineId('all');
                            applyForecastPreset(forecastCategory, 'all', forecastPeriod, forecastSection);
                          }}
                          className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                            forecastLineId === 'all'
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-xs'
                              : 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-200" />
                            <span className="font-bold text-xs">全線一括</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">グループ全線</div>
                        </button>

                        {DEFAULT_LINE_INFOS.map((def) => {
                          const isSelected = forecastLineId === def.id;
                          return (
                            <button
                              key={def.id}
                              type="button"
                              onClick={() => {
                                setForecastLineId(def.id);
                                applyForecastPreset(forecastCategory, def.id, forecastPeriod, forecastSection);
                              }}
                              className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-750 border-amber-400 text-slate-100 shadow-xs ring-1 ring-amber-400/40'
                                  : 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-slate-500'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: def.color }} />
                                <span className="font-bold text-xs">{def.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{def.code}</div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Section and Expected Period */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-300 font-medium">対象区間:</span>
                          <input
                            type="text"
                            value={forecastSection}
                            onChange={(e) => {
                              setForecastSection(e.target.value);
                              applyForecastPreset(forecastCategory, forecastLineId, forecastPeriod, e.target.value);
                            }}
                            placeholder="例: 全線、北千住〜大宮間"
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs font-medium focus:outline-none focus:border-sky-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-300 font-medium">影響見込み時間帯:</span>
                          <input
                            type="text"
                            value={forecastPeriod}
                            onChange={(e) => {
                              setForecastPeriod(e.target.value);
                              applyForecastPreset(forecastCategory, forecastLineId, e.target.value, forecastSection);
                            }}
                            placeholder="例: 本日夕方以降（16時頃〜終電）"
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs font-medium focus:outline-none focus:border-sky-400"
                          />
                        </div>
                      </div>

                      {/* Period Quick Presets */}
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[9px] text-slate-400">時間帯クイック指定:</span>
                        {[
                          '本日午後から夜にかけて',
                          '本日夕方以降（16時〜終電）',
                          '今夜遅くから明朝にかけて',
                          '明日未明から早朝',
                          '明日午前中',
                          '明日終日',
                        ].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setForecastPeriod(p);
                              applyForecastPreset(forecastCategory, forecastLineId, p, forecastSection);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                              forecastPeriod === p
                                ? 'bg-sky-600 text-white font-bold'
                                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step 2: Forecast Category & Severity */}
                    <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2.5">
                      <label className="text-slate-100 font-bold text-xs flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 text-[10px] flex items-center justify-center font-bold">
                          2
                        </span>
                        <span>気象・事象カテゴリ & 警戒レベル選択</span>
                      </label>

                      {/* Category Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {FORECAST_PRESETS.map((preset) => {
                          const isSelected = forecastCategory === preset.category;
                          return (
                            <button
                              key={preset.category}
                              type="button"
                              onClick={() => {
                                applyForecastPreset(preset.category, forecastLineId, forecastPeriod, forecastSection);
                              }}
                              className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                                isSelected
                                  ? 'bg-sky-500/25 border-sky-400 text-white shadow-xs font-bold ring-1 ring-sky-400/40'
                                  : 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-slate-500'
                              }`}
                            >
                              <div className="text-xs flex items-center gap-1">
                                <span>{preset.icon}</span>
                                <span>{preset.name}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Severity Selector */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-300 font-medium shrink-0">警戒レベル:</span>
                        <div className="grid grid-cols-3 gap-1.5 flex-1">
                          {[
                            { level: 'caution' as ForecastSeverity, label: '注意 (Caution)', color: 'bg-blue-500/20 border-blue-400 text-blue-200' },
                            { level: 'warning' as ForecastSeverity, label: '警戒 (Warning)', color: 'bg-amber-500/20 border-amber-400 text-amber-200' },
                            { level: 'critical' as ForecastSeverity, label: '重大 (Critical)', color: 'bg-rose-500/20 border-rose-400 text-rose-200' },
                          ].map((item) => (
                            <button
                              key={item.level}
                              type="button"
                              onClick={() => setForecastSeverity(item.level)}
                              className={`py-1.5 px-2 rounded-lg border text-center text-xs transition-colors cursor-pointer ${
                                forecastSeverity === item.level
                                  ? `${item.color} font-bold shadow-xs`
                                  : 'bg-slate-900/70 border-slate-700 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Expiration Time Setting (Auto-Expiration) */}
                    <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-100 font-bold text-xs flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 text-[10px] flex items-center justify-center font-bold">
                            3
                          </span>
                          <span>有効期限・自動停止時間の設定（実時間連動）</span>
                        </label>
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3" />
                          <span>期限到達でシステムが自動停止</span>
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        設定した時間（日時）になると、アプリ上の警報バナー・予報表示が自動的に解除・非表示になります。
                      </p>

                      {/* Quick Expiry Presets from Real Time */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] text-slate-300 font-medium">
                          実際の時間の中から選択（ワンタップ）:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {expiryOptions.map((opt, idx) => {
                            const isSelected = !customExpiryDateInput && selectedExpiryHours === opt.hoursFromNow;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setSelectedExpiryHours(opt.hoursFromNow);
                                  setCustomExpiryDateInput('');
                                }}
                                className={`p-2 rounded-lg border text-left text-[11px] transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200 font-bold shadow-xs'
                                    : 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                <div>{opt.label}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Custom Datetime Local Picker */}
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-300 font-medium">
                            または任意の日時を指定（カレンダーピッカー）:
                          </span>
                          {customExpiryDateInput && (
                            <button
                              type="button"
                              onClick={() => setCustomExpiryDateInput('')}
                              className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                            >
                              クリアしてプリセットに戻す
                            </button>
                          )}
                        </div>
                        <input
                          type="datetime-local"
                          value={customExpiryDateInput}
                          onChange={(e) => setCustomExpiryDateInput(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs font-mono focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>

                    {/* Step 4: Official Announcement Text & Preview */}
                    <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-100 font-bold text-xs flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 text-[10px] flex items-center justify-center font-bold">
                            4
                          </span>
                          <span>公式アナウンス見出し & 案内文</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => applyForecastPreset(forecastCategory, forecastLineId, forecastPeriod, forecastSection)}
                          className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>文面を自動再生成</span>
                        </button>
                      </div>

                      {/* Headline */}
                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-300 font-medium">告知見出し:</span>
                        <input
                          type="text"
                          value={forecastHeadline}
                          onChange={(e) => setForecastHeadline(e.target.value)}
                          placeholder="告知見出し"
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs font-bold focus:outline-none focus:border-sky-400"
                        />
                      </div>

                      {/* Description */}
                      <div className="space-y-1">
                        <span className="text-[11px] text-slate-300 font-medium">詳細案内文（鉄道公式形式）:</span>
                        <textarea
                          rows={3}
                          value={forecastDescription}
                          onChange={(e) => setForecastDescription(e.target.value)}
                          placeholder="詳細案内文"
                          className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-xs leading-relaxed focus:outline-none focus:border-sky-400 resize-none font-sans"
                        />
                      </div>

                      {/* Dispatch Button */}
                      <button
                        type="button"
                        onClick={handleIssueForecast}
                        className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md mt-1"
                      >
                        <Zap className="w-4 h-4 fill-slate-950" />
                        <span>【運行予測発令】アプリへ事前予告・警報を反映する</span>
                      </button>
                    </div>

                    {/* Active Forecasts List */}
                    <div className="pt-2 border-t border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-200">
                          現在発令中の運行予測・警報一覧
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-bold">
                          {activeForecastsList.length}件 発令中
                        </span>
                      </div>

                      {activeForecastsList.length === 0 ? (
                        <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700 text-center text-slate-400 text-xs">
                          現在発令中の運行予測・運転予告はありません
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {activeForecastsList.map((fc) => {
                            const isWarning = fc.severity === 'warning' || fc.severity === 'critical';
                            const remainMs = fc.expiresAtTimestamp ? fc.expiresAtTimestamp - Date.now() : 0;
                            const remainHours = Math.floor(remainMs / 3600000);
                            const remainMins = Math.floor((remainMs % 3600000) / 60000);

                            return (
                              <div
                                key={fc.id}
                                className={`p-2.5 bg-slate-800/90 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                  isWarning ? 'border-amber-500/50' : 'border-sky-500/50'
                                }`}
                              >
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        isWarning
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                      }`}
                                    >
                                      {fc.categoryLabel}
                                    </span>
                                    <span className="font-bold text-slate-200 text-xs">
                                      {fc.lineName}（{fc.section}）
                                    </span>
                                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      <span>
                                        {remainHours > 0 ? `あと${remainHours}時間${remainMins}分で自動解除` : `あと${remainMins}分で自動解除`}
                                      </span>
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-bold text-slate-100">
                                    {fc.headline}
                                  </div>
                                  <p className="text-[10px] text-slate-300 line-clamp-2 leading-relaxed">
                                    {fc.description}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteForecast(fc.id)}
                                    className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded text-[10px] font-medium transition-colors cursor-pointer"
                                  >
                                    手動解除
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ========================================================
                  TAB 1: システム診断 (Diagnostics & Integrity & Emergency Tools)
                  ======================================================== */}
              {activeTab === 'diagnostics' && (
                <div className="space-y-3">
                  {/* Status Banner */}
                  <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                          <span>運行管理システム正常稼働</span>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        </div>
                        <p className="text-[10px] text-slate-400">
                          全4路線・発車標・停車駅・時刻表 同期完了
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setMetrics(systemLogger.getMetrics())}
                      className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>更新</span>
                    </button>
                  </div>

                  {/* Environment Grid */}
                  {metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 space-y-0.5">
                        <span className="text-[10px] text-slate-400 block">バージョン</span>
                        <span className="font-mono text-slate-200 text-xs font-bold">
                          {metrics.appVersion}
                        </span>
                      </div>

                      <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 space-y-0.5">
                        <span className="text-[10px] text-slate-400 block">動作環境</span>
                        <span className="font-mono text-slate-200 text-xs">{metrics.environment}</span>
                      </div>

                      <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 space-y-0.5">
                        <span className="text-[10px] text-slate-400 block">端末</span>
                        <span className="text-slate-200 text-xs flex items-center gap-1">
                          <span>{metrics.deviceType}</span>
                          {metrics.isStandalone && (
                            <span className="px-1 py-0.1 bg-indigo-500/20 text-indigo-300 text-[9px] rounded font-bold">
                              PWA
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 space-y-0.5">
                        <span className="text-[10px] text-slate-400 block">画面解像度</span>
                        <span className="font-mono text-slate-200 text-xs">
                          {metrics.screenWidth}×{metrics.screenHeight} ({metrics.pixelRatio}x)
                        </span>
                      </div>

                      <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 space-y-0.5">
                        <span className="text-[10px] text-slate-400 block">接続状態</span>
                        <span
                          className={`text-xs font-semibold ${
                            metrics.onlineStatus ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {metrics.onlineStatus ? 'Online' : 'Offline'}
                        </span>
                      </div>

                      <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 space-y-0.5">
                        <span className="text-[10px] text-slate-400 block">通知権限</span>
                        <span
                          className={`text-xs font-mono font-semibold ${
                            metrics.notificationPermission === 'granted'
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {metrics.notificationPermission}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Integrity Audit Card */}
                  <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span>全系統 整合性監査 (Integrity Audit)</span>
                      </div>
                      <button
                        onClick={handleRunAudit}
                        disabled={isAuditing}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                      >
                        <RefreshCw className={`w-3 h-3 ${isAuditing ? 'animate-spin' : ''}`} />
                        <span>{isAuditing ? '監査中...' : '監査を実行'}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      全4路線の駅マスタ、停車駅パターン、大甕駅の停車フラグ、ストレージ整合性を一括自動監査します。
                    </p>

                    {auditResult && (
                      <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-lg space-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">監査判定:</span>
                          <span
                            className={`font-bold font-mono ${
                              auditResult.status === 'passed' ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {auditResult.status === 'passed' ? '正常 (PASSED)' : '警告あり'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">チェック駅数 / 路線:</span>
                          <span className="text-slate-200 font-mono">
                            {auditResult.totalStationsChecked}駅 / {auditResult.linesChecked}路線
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cache & Emergency Resync */}
                  <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2">
                    <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>一時キャッシュパージ & 運行データ再同期</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      会員情報やポイント残高を保持したまま、運行データおよび時刻表キャッシュを安全に再構築します。
                    </p>
                    <button
                      onClick={handleEmergencyResync}
                      className="w-full py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>運行データ再同期を実行</span>
                    </button>
                  </div>

                  {/* Emergency Broadcast Override */}
                  <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2">
                    <div className="font-bold text-slate-100 text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-rose-400" />
                        <span>緊急運行速報 手動発令 / 解除</span>
                      </span>
                      {emergencyAlertActive && (
                        <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold">
                          発令中
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="例: 強風のため全線で運転を見合わせております"
                        value={emergencyAlertText}
                        onChange={(e) => setEmergencyAlertText(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-rose-400"
                      />

                      <div className="flex gap-2">
                        <button
                          onClick={handleSetEmergencyAlert}
                          disabled={!emergencyAlertText.trim()}
                          className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>速報を発令</span>
                        </button>

                        {emergencyAlertActive && (
                          <button
                            onClick={handleClearEmergencyAlert}
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                          >
                            解除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================
                  TAB 2: エラーログ (Error Logs & Event Stream)
                  ======================================================== */}
              {activeTab === 'errors' && (
                <div className="space-y-2.5">
                  {/* Controls Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 bg-slate-800 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-1">
                      {(['all', 'error', 'warn', 'info'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setLogFilter(lvl)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                            logFilter === lvl
                              ? 'bg-slate-100 text-slate-900 shadow-xs'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {lvl === 'all'
                            ? `すべて (${logs.length})`
                            : lvl === 'error'
                            ? `エラー (${errorCount})`
                            : lvl === 'warn'
                            ? `警告`
                            : '情報'}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopyLogs}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedText ? 'コピー完了' : 'コピー'}</span>
                      </button>
                      <button
                        onClick={handleClearLogs}
                        className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>消去</span>
                      </button>
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="ログ内を検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  {/* Log Entries List */}
                  <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
                    {filteredLogs.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs">該当するログはありません</div>
                    ) : (
                      filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`p-2 rounded-lg border text-xs font-mono space-y-0.5 ${
                            log.level === 'error' || log.level === 'critical'
                              ? 'bg-rose-950/30 border-rose-800/40 text-rose-200'
                              : log.level === 'warn'
                              ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                              : 'bg-slate-900/80 border-slate-700/80 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-bold text-slate-300">[{log.source}]</span>
                            <span>{new Date(log.timestamp).toLocaleTimeString('ja-JP')}</span>
                          </div>
                          <p className="font-sans leading-relaxed text-[11px] text-slate-100">{log.message}</p>
                          {log.details && (
                            <pre className="text-[9px] text-slate-400 overflow-x-auto bg-black/40 p-1 rounded">
                              {log.details}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ========================================================
                  TAB 3: ストレージ管理 (Storage Inspector & Safe Reset)
                  ======================================================== */}
              {activeTab === 'storage' && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-100">LocalStorage データ管理</div>
                      <p className="text-[10px] text-slate-400">
                        端末に保存された運行情報・会員データ・設定キーの一覧と検査
                      </p>
                    </div>
                    <button
                      onClick={() => setShowClearStorageConfirm(true)}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>全初期化</span>
                    </button>
                  </div>

                  {/* 2-Column Storage Viewer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[300px]">
                    {/* Keys List */}
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 space-y-1 max-h-[320px] overflow-y-auto">
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">保存キー一覧:</span>
                      {Object.keys(localStorage).map((k) => (
                        <button
                          key={k}
                          onClick={() => handleInspectKey(k)}
                          className={`w-full text-left p-1.5 rounded text-[11px] font-mono truncate transition-colors cursor-pointer ${
                            selectedStorageKey === k
                              ? 'bg-indigo-600 text-white font-bold'
                              : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750'
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>

                    {/* Data Viewer */}
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 flex flex-col justify-between max-h-[320px] overflow-hidden">
                      <div className="space-y-1 overflow-y-auto flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold">
                            キー内容: {selectedStorageKey || '(未選択)'}
                          </span>
                          {selectedStorageKey && (
                            <button
                              onClick={() => handleDeleteStorageKey(selectedStorageKey)}
                              className="text-rose-400 hover:text-rose-300 text-[10px] font-medium"
                            >
                              削除
                            </button>
                          )}
                        </div>
                        <pre className="text-[10px] text-slate-300 font-mono bg-black/40 p-2 rounded whitespace-pre-wrap overflow-x-auto">
                          {storageDataView || '左のキーを選択すると内容を表示します'}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================
                  TAB 4: 管理者設定 (PIN & Security)
                  ======================================================== */}
              {activeTab === 'settings' && (
                <div className="space-y-3">
                  <div className="p-3.5 bg-slate-800 rounded-xl border border-slate-700 space-y-3">
                    <div className="font-bold text-slate-100 text-xs flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      <span>管理者パスコード変更</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      4桁の数字で新しい管理者パスコードを設定できます。変更後は旧パスコードや初期パスコードでは解錠できなくなります。
                    </p>

                    <form onSubmit={handleChangePin} className="space-y-2 pt-1">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="新PIN (4桁)"
                          value={newPinInput}
                          onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                          className="w-32 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono text-center text-xs tracking-widest focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="submit"
                          disabled={newPinInput.length !== 4}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          変更する
                        </button>
                      </div>

                      {pinChangeSuccess && (
                        <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>パスコードを正常に更新しました</span>
                        </p>
                      )}
                    </form>

                    <div className="pt-2.5 border-t border-slate-700 flex justify-between items-center">
                      <span className="text-[11px] text-slate-400">初期パスコード（1925）に戻す</span>
                      <button
                        onClick={handleResetPin}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        初期値にリセット
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Storage Clear Confirmation Modal */}
        {showClearStorageConfirm && (
          <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-rose-500/50 rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-2xl text-slate-100">
              <div className="flex items-center gap-2.5 text-rose-400">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-400" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-100">本当に全データを初期化しますか？</h4>
                  <span className="text-[10px] text-rose-300 font-mono font-bold">警告: 復元不可</span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-2.5 rounded-lg border border-slate-700">
                この操作を実行すると、<strong>N-POINT残高、会員ランク、乗車履歴、保存したお気に入り、カスタム設定</strong>を含むLocalStorage上のすべての端末データが完全に削除され、アプリが初期状態に戻ります。
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowClearStorageConfirm(false)}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    setShowClearStorageConfirm(false);
                    executeClearAllStorage();
                  }}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>完全に削除する</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
