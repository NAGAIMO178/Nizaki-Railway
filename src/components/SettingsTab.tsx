import React, { useState, useEffect } from 'react';
import {
  User,
  CreditCard,
  Award,
  Utensils,
  Bell,
  Check,
  CheckCircle2,
  QrCode,
  Heart,
  Smartphone,
  Sliders,
  Send,
  ShieldCheck,
  AlertCircle,
  Train,
  ShoppingBag,
  Clock,
  Terminal,
  KeyRound,
  Wrench,
  Bug,
  ShieldAlert,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { MyStationRegisterCard, RegisterableStation } from './MyStationRegisterCard';
import { AdminConsoleModal } from './AdminConsoleModal';
import {
  isNotificationSupported,
  getNotificationPermissionState,
  requestNotificationPermission,
  sendLocalPushNotification,
  isIOSBrowser,
  isStandaloneMode,
} from '../utils/pushNotification';

import { ActiveOrder, UserProfile } from '../types';

interface SettingsTabProps {
  nPointBalance: number;
  registeredStations: RegisterableStation[];
  onUpdateRegisteredStations: (stations: RegisterableStation[]) => void;
  onOpenNPointModal: () => void;
  activeOrder?: ActiveOrder | null;
  isLoggedIn?: boolean;
  currentUser?: UserProfile | null;
  onLoginClick?: () => void;
  onLogout?: () => void;
  onOpenMyPage?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  nPointBalance,
  registeredStations,
  onUpdateRegisteredStations,
  onOpenNPointModal,
  activeOrder,
  isLoggedIn = false,
  currentUser = null,
  onLoginClick,
  onLogout,
  onOpenMyPage,
}) => {
  // 1. Payment
  const [smartPayMethod, setSmartPayMethod] = useState<'card' | 'ic' | 'qr'>('card');
  const [isSmartPayEnabled, setIsSmartPayEnabled] = useState(true);

  // 2. Meal Preference for E-DELIVERY
  const [allergies, setAllergies] = useState<{ [key: string]: boolean }>({
    wasabi: true,
    glass: true,
    soba: false,
    egg: false,
  });

  // 3. Push Notification Permission State
  const [notifyService, setNotifyService] = useState(true);
  const [permissionState, setPermissionState] = useState<string>('default');
  const [lastSentTime, setLastSentTime] = useState<string | null>(null);

  // 4. Admin Console Modal State
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  useEffect(() => {
    setPermissionState(getNotificationPermissionState());
  }, []);

  const handleTogglePush = async (enable: boolean) => {
    setNotifyService(enable);

    if (enable) {
      const result = await requestNotificationPermission();
      setPermissionState(result);

      if (result === 'granted') {
        sendLocalPushNotification({
          title: '神埼線アプリ Web Push通知',
          body: '実端末へのプッシュ通知連携が有効化されました！運行遅延や車内注文の通知が届きます。',
          tag: 'kanzaki-welcome',
        }).catch((err) => {
          console.warn('Push notification error:', err);
        });
        setLastSentTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    }
  };

  const handleRequestPermissionManually = async () => {
    const result = await requestNotificationPermission();
    setPermissionState(result);
    if (result === 'granted') {
      setNotifyService(true);
      sendLocalPushNotification({
        title: '神埼線アプリ 通知許可完了',
        body: '端末への通知送信テストに成功しました！',
        tag: 'kanzaki-permission',
      }).catch((err) => {
        console.warn('Push notification error:', err);
      });
      setLastSentTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  };

  const handleSendTestNotification = (type: 'delay' | 'delivery' | 'express') => {
    let title = '';
    let body = '';
    let tag = '';

    const targetStationName = registeredStations[0]?.name || '松戸';
    const targetLineName = registeredStations[0]?.lineName?.replace(/^[0-9]\.\s*/, '') || '土浦線';

    if (type === 'delay') {
      title = `【${targetLineName}・${targetStationName}駅】遅延情報 (約10分)`;
      body = `${targetStationName}駅構内での急病人救護のため、現在${targetLineName}（下り方面）に約10分の遅延が生じています。`;
      tag = 'kanzaki-delay-alert';
    } else if (type === 'delivery') {
      if (activeOrder) {
        const itemNames = activeOrder.items && activeOrder.items.length > 0
          ? activeOrder.items.map(i => i.item.name).join('・')
          : 'お弁当・ドリンク';
        title = `【車内デリバリー】ご予約席（${activeOrder.carNo}号車 ${activeOrder.seatNo}）へお届け`;
        body = `『${activeOrder.trainName}』のお届け準備が完了しました。${activeOrder.boardingStation || '乗車駅'}発車後にアテンダントが「${itemNames}」をお届けします。`;
      } else {
        title = `【車内デリバリー】${targetStationName}駅 到着前お届け完了`;
        body = `ご指定の座席（特急めぐり8号 5号車7C）へ『特製神埼すき焼き弁当』のお届けが完了いたしました。`;
      }
      tag = 'kanzaki-delivery-alert';
    } else {
      if (activeOrder) {
        title = `【発車予告】${activeOrder.trainName}`;
        body = `発車10分前です。ご予約の${activeOrder.trainName} (${activeOrder.departureTime || '14:43'} ${activeOrder.boardingStation || '松戸駅'}発) の発車時刻が近づいています。${activeOrder.carNo}号車 ${activeOrder.seatNo}へお越しください。`;
      } else {
        title = `【特急めぐり8号】まもなく${targetStationName}駅を発車`;
        body = `発車10分前です。${targetStationName}駅 1番線ホームへお越しください。`;
      }
      tag = 'kanzaki-express-alert';
    }

    sendLocalPushNotification({ title, body, tag }).catch((err) => {
      console.warn('Test push notification error:', err);
    });
    setLastSentTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  // Save Toast feedback
  const [showSavedToast, setShowSavedToast] = useState(false);

  const handleSaveAll = () => {
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2500);
  };

  const toggleAllergy = (key: string) => {
    setAllergies((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4 text-[#221C35] max-w-xl mx-auto p-4 pb-28 animate-fadeIn">
      {/* Save Notification Toast */}
      {showSavedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#10B981] text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>設定を保存しました</span>
        </div>
      )}

      {/* Compact Header Banner */}
      <div className="bg-gradient-to-r from-[#221C35] via-[#3B1966] to-[#5B21B6] text-white rounded-2xl p-4 shadow-md border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-28 h-28 bg-[#FBBF24]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-white leading-snug">
              アプリ設定
            </h2>
            <p className="text-xs text-[#E9D5FF] mt-0.5">
              マイ駅・決済・デリバリー好みを一括管理
            </p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
            <Sliders className="w-4 h-4 text-[#FBBF24]" />
          </div>
        </div>
      </div>

      {/* SECTION 1: マイ駅設定 (最重要) */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-5 h-5 rounded-md bg-[#EFE8FA] flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-[#5B21B6]" />
          </div>
          <h3 className="text-xs font-black text-[#221C35]">
            1. マイ駅設定
          </h3>
        </div>

        <div className="bg-white rounded-2xl border border-[#E6E2EE] shadow-xs p-1">
          <MyStationRegisterCard
            registeredStations={registeredStations}
            onUpdateRegisteredStations={(updated) => {
              onUpdateRegisteredStations(updated);
            }}
          />
        </div>
      </section>

      {/* SECTION 2: 会員情報 & 決済 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-5 h-5 rounded-md bg-[#EFE8FA] flex items-center justify-center shrink-0">
            <CreditCard className="w-3.5 h-3.5 text-[#5B21B6]" />
          </div>
          <h3 className="text-xs font-black text-[#221C35]">
            2. 会員ステータス & 決済
          </h3>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E6E2EE] shadow-xs space-y-3.5">
          {/* 神埼ID ログインステータス */}
          {isLoggedIn && currentUser ? (
            <div className="bg-[#F8F7FC] rounded-xl p-3 border border-[#EDE9FE] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 shadow-2xs ring-2 ring-[#708BD6]/40">
                  <UserAvatar className="w-full h-full" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-[#221C35] truncate">{currentUser.name} 様</span>
                    <span className="text-[10px] bg-[#5B21B6] text-white font-bold px-1.5 py-0.2 rounded font-mono">
                      {currentUser.rank}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#6B6380] font-mono truncate">
                    ID: {currentUser.memberId} ・ {currentUser.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onOpenMyPage && (
                  <button
                    type="button"
                    onClick={onOpenMyPage}
                    className="px-2.5 py-1.5 rounded-lg bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="マイページ（利用履歴・各種設定）"
                  >
                    <span>マイページ</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2 py-1.5 rounded-lg border border-[#E5E2EE] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-[#857D99] text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  title="ログアウト"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span className="hidden sm:inline">ログアウト</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-200/80 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-amber-900 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-amber-700" />
                  <span>神埼ID 未ログイン（ゲスト）</span>
                </div>
                <div className="text-[10px] text-amber-800">
                  特急券予約・車内デリバリー・イベントの利用に必須
                </div>
              </div>
              <button
                type="button"
                onClick={onLoginClick}
                className="px-3 py-1.5 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0"
              >
                ログイン
              </button>
            </div>
          )}

          {/* 会員証 & ポイント - ログインしている時のみ表示 */}
          {isLoggedIn && (
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F0EEF6]">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[#5B21B6] shrink-0" />
                <div>
                  <span className="text-xs font-bold text-[#221C35]">N-POINT 会員</span>
                  <span className="ml-1.5 text-xs font-mono font-bold text-[#5B21B6]">
                    ({nPointBalance.toLocaleString()} pt)
                  </span>
                  <span className="ml-2 text-[10px] bg-[#EFE8FA] text-[#5B21B6] font-bold px-2 py-0.5 rounded-full border border-[#DDD6FE]">
                    {currentUser?.rank || 'ゴールド'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenNPointModal}
                className="px-3 py-1.5 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>デジタル会員証</span>
              </button>
            </div>
          )}

          {/* Smart Pay 設定 */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-[#221C35]">ワンタップ決済 (Smart Pay)</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isSmartPayEnabled}
                  onChange={(e) => setIsSmartPayEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#5B21B6]"></div>
              </label>
            </div>

            {isSmartPayEnabled && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSmartPayMethod('card')}
                  className={`p-2 rounded-xl border text-xs font-bold text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                    smartPayMethod === 'card'
                      ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                      : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#6B6380]'
                  }`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span>カード</span>
                </button>

                <button
                  onClick={() => setSmartPayMethod('ic')}
                  className={`p-2 rounded-xl border text-xs font-bold text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                    smartPayMethod === 'ic'
                      ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                      : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#6B6380]'
                  }`}
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>交通系IC</span>
                </button>

                <button
                  onClick={() => setSmartPayMethod('qr')}
                  className={`p-2 rounded-xl border text-xs font-bold text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                    smartPayMethod === 'qr'
                      ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                      : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#6B6380]'
                  }`}
                >
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>PayPay</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3: E-DELIVERY 事前好み登録 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-5 h-5 rounded-md bg-[#EFE8FA] flex items-center justify-center shrink-0">
            <Utensils className="w-3.5 h-3.5 text-[#5B21B6]" />
          </div>
          <h3 className="text-xs font-black text-[#221C35]">
            3. E-DELIVERY 注文時の自動こだわり設定
          </h3>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E6E2EE] shadow-xs space-y-3">
          <div className="text-xs font-bold text-[#221C35] flex items-center gap-2">
            <Heart className="w-4 h-4 text-[#EC4899] shrink-0" />
            <span>車内デリバリー自動リクエスト</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => toggleAllergy('wasabi')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                allergies.wasabi
                  ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                  : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#6B6380]'
              }`}
            >
              <span>わさび抜き希望</span>
              {allergies.wasabi && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>

            <button
              onClick={() => toggleAllergy('glass')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                allergies.glass
                  ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                  : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#6B6380]'
              }`}
            >
              <span>冷え冷えグラス同梱</span>
              {allergies.glass && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>

            <button
              onClick={() => toggleAllergy('soba')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                allergies.soba
                  ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                  : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#6B6380]'
              }`}
            >
              <span>そばアレルギーあり</span>
              {allergies.soba && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>

            <button
              onClick={() => toggleAllergy('egg')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                allergies.egg
                  ? 'bg-[#EFE8FA] border-[#5B21B6] text-[#5B21B6]'
                  : 'bg-[#F4F3F8] border-[#E6E2EE] text-[#6B6380]'
              }`}
            >
              <span>卵アレルギーあり</span>
              {allergies.egg && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 4: Web Push API / Service Worker 運行情報・お知らせ通知 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-[#EFE8FA] flex items-center justify-center shrink-0">
              <Bell className="w-3.5 h-3.5 text-[#5B21B6]" />
            </div>
            <h3 className="text-xs font-black text-[#221C35]">
              4. Web Push API / 実端末通知設定
            </h3>
          </div>

          {/* Browser Notification Status Badge */}
          {permissionState === 'granted' ? (
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>通知許可済み (Service Worker有効)</span>
            </span>
          ) : permissionState === 'denied' ? (
            <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-600" />
              <span>ブラウザでブロック中</span>
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
              未許可 (タップして許可)
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E6E2EE] shadow-xs space-y-3.5">
          {/* Push Switch Row */}
          <div className="flex items-center justify-between gap-3 border-b border-[#F0EEF6] pb-3">
            <div>
              <div className="text-xs font-bold text-[#221C35]">
                運行遅延・お知らせリアルタイム通知
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={notifyService && permissionState === 'granted'}
                onChange={(e) => handleTogglePush(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#5B21B6]"></div>
            </label>
          </div>

          {/* iOS Safari Guidance Box */}
          {isIOSBrowser() && !isStandaloneMode() && (
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-3 text-xs text-[#92400E] space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#D97706]" />
                <span>iPhone Safariをご利用の場合</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                iOSの仕様上、通知の受取にはSafari共有ボタン（↑）から「ホーム画面に追加」を行ってアプリを起動してください。
              </p>
            </div>
          )}

          {/* Request Permission Button if not granted */}
          {permissionState !== 'granted' && (
            <div className="bg-[#FAF8FE] border border-[#DDD6FE] rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="text-xs text-[#4C1D95] font-medium">
                通知の受信許可が必要です
              </div>
              <button
                onClick={handleRequestPermissionManually}
                className="px-3 py-1.5 bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs rounded-lg shrink-0 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-[#FBBF24]" />
                <span>端末の通知を許可する</span>
              </button>
            </div>
          )}

          {/* Real Device Test Push Buttons */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#221C35] flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-[#5B21B6]" />
                <span>通知テスト送信</span>
              </span>
              {lastSentTime && (
                <span className="text-[10px] font-mono text-emerald-600 font-bold">
                  送信完了: {lastSentTime}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => handleSendTestNotification('delay')}
                className="p-2.5 rounded-xl border border-[#E6E2EE] hover:border-[#5B21B6] bg-[#F4F3F8] hover:bg-[#EFE8FA] text-[#221C35] hover:text-[#5B21B6] transition-all text-xs font-bold flex flex-col items-center text-center gap-1 cursor-pointer"
              >
                <Train className="w-4 h-4 text-rose-500" />
                <span>遅延速報テスト</span>
              </button>

              <button
                onClick={() => handleSendTestNotification('delivery')}
                className="p-2.5 rounded-xl border border-[#E6E2EE] hover:border-[#5B21B6] bg-[#F4F3F8] hover:bg-[#EFE8FA] text-[#221C35] hover:text-[#5B21B6] transition-all text-xs font-bold flex flex-col items-center text-center gap-1 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                <span>お届け完了テスト</span>
              </button>

              <button
                onClick={() => handleSendTestNotification('express')}
                className="p-2.5 rounded-xl border border-[#E6E2EE] hover:border-[#5B21B6] bg-[#F4F3F8] hover:bg-[#EFE8FA] text-[#221C35] hover:text-[#5B21B6] transition-all text-xs font-bold flex flex-col items-center text-center gap-1 cursor-pointer"
              >
                <Clock className="w-4 h-4 text-amber-500" />
                <span>特急発車リマインド</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 設定完了ボタン */}
      <div className="pt-2">
        <button
          onClick={handleSaveAll}
          className="w-full py-3 px-4 bg-gradient-to-r from-[#5B21B6] to-[#4C1D95] hover:from-[#4C1D95] hover:to-[#3B1966] text-[#FBBF24] font-bold text-xs shadow-md hover:shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4 text-[#FBBF24]" />
          <span>設定を完了する（保存）</span>
        </button>
      </div>

      {/* 管理者用設定・システム診断を開くボタン (落ち着いたデザイン) */}
      <div className="pt-2">
        <button
          onClick={() => setIsAdminModalOpen(true)}
          className="w-full py-2.5 px-3 bg-[#F6F5FA] hover:bg-[#EFE8FA] border border-[#E3DFED] hover:border-[#CBD5E1] text-[#475569] hover:text-[#1E293B] font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
        >
          <KeyRound className="w-3.5 h-3.5 text-[#64748B]" />
          <span>管理者用設定・システム診断（パスコード保護）</span>
        </button>
      </div>

      {/* App Version Info (Clickable for Admin Mode) */}
      <div className="text-center pt-2 space-y-0.5">
        <button
          onClick={() => setIsAdminModalOpen(true)}
          className="text-[10px] font-medium text-[#6B6380] hover:text-[#5B21B6] transition-colors cursor-pointer"
          title="管理者コンソールを開く"
        >
          神埼鉄道 NIZAKI App v3.32.1
        </button>
        <p className="text-[9px] text-[#857D99]">© Nizaki Electric Railway Co., Ltd.</p>
      </div>

      {/* 管理者用システムコンソールモーダル */}
      <AdminConsoleModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
      />
    </div>
  );
};
