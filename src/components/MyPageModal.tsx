import React, { useState } from 'react';
import {
  X,
  LogOut,
  Train,
  ShoppingBag,
  Sparkles,
  Coins,
  ShieldCheck,
  Bell,
  ChevronRight,
  QrCode,
  Calendar,
  Clock,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Award,
  Trash2,
  Lock,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import { UserProfile, ActiveOrder, PointHistoryItem, AccountActivityItem } from '../types';
import { deleteAccount } from '../utils/accountApi';

interface MyPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  balance: number;
  pointHistory: PointHistoryItem[];
  activeOrder: ActiveOrder | null;
  onLogout: () => void;
  onOpenNPointModal: () => void;
  onOpenQRCodeModal: () => void;
}

export const MyPageModal: React.FC<MyPageModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  balance,
  pointHistory,
  activeOrder,
  onLogout,
  onOpenNPointModal,
  onOpenQRCodeModal,
}) => {
  const [activeHistoryTab, setActiveHistoryTab] = useState<'all' | 'ticket' | 'delivery' | 'event' | 'point'>('all');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('確認のため、パスワードを入力してください。');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteAccount(currentUser.email, deletePassword);
      if (result.status === 'success') {
        onLogout();
        setShowDeleteConfirm(false);
        setDeletePassword('');
        onClose();
      } else {
        setDeleteError(result.message || 'パスワードが正しくありません。');
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '削除中にエラーが発生しました。');
    } finally {
      setIsDeleting(false);
    }
  };

  // 動的なアカウント利用履歴データの生成
  const activities: AccountActivityItem[] = [
    // 1. アクティブな特急券予約
    ...(activeOrder
      ? [
          {
            id: `act_ticket_${activeOrder.orderId}`,
            category: 'ticket' as const,
            title: `${activeOrder.trainName} ${activeOrder.carNo}号車 ${activeOrder.seatNo}席`,
            subtitle: `${activeOrder.boardingStation || '松戸駅'} (${activeOrder.departureTime || '09:00'}) → ${activeOrder.destinationStation || '日立駅'} (${activeOrder.arrivalTime || '09:48'})`,
            date: '本日乗車予定',
            status: '予約確定・乗車前',
            statusColor: 'emerald',
            amount: `¥${activeOrder.totalPrice.toLocaleString()}`,
            pointsEarned: Math.floor(activeOrder.totalPrice * 0.03),
            details: {
              座席種別: activeOrder.seatType === 'megu' ? 'めぐりシート' : '普通席',
              予約番号: activeOrder.orderId,
            },
          },
        ]
      : []),
    // 2. 直近の車内デリバリー
    ...(activeOrder && activeOrder.items && activeOrder.items.length > 0
      ? [
          {
            id: `act_del_${activeOrder.orderId}`,
            category: 'delivery' as const,
            title: `車内デリバリー注文 (${activeOrder.items.length}商品)`,
            subtitle: `${activeOrder.items.map((i) => i.item.name).join('、')} (${activeOrder.deliveryStation}発車後にお届け)`,
            date: '本日デリバリー予定',
            status: activeOrder.status === 'delivering' ? '配達中' : '準備中',
            statusColor: 'purple',
            amount: `¥${activeOrder.items.reduce((sum, i) => sum + i.item.price * i.quantity, 0).toLocaleString()}`,
            pointsEarned: 50,
          },
        ]
      : []),
    // 3. N-POINT獲得・登録ボーナス
    ...pointHistory.map((p) => ({
      id: `act_pt_${p.id}`,
      category: 'point' as const,
      title: p.title,
      subtitle: `N-POINT 獲得・付与`,
      date: p.date,
      status: '付与済',
      statusColor: 'amber',
      amount: `+${p.points} pt`,
    })),
  ];

  const filteredActivities = activities.filter((act) => {
    if (activeHistoryTab === 'all') return true;
    return act.category === activeHistoryTab;
  });

  const getRankBadgeStyle = (rank: string) => {
    switch (rank) {
      case 'プレミアム':
        return 'bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-xs';
      case 'ゴールド':
        return 'bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] text-white shadow-xs';
      default:
        return 'bg-slate-200 text-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div
        className="w-full max-w-lg bg-[#F8F7FB] rounded-3xl shadow-2xl border border-white/60 overflow-hidden flex flex-col max-h-[90vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="bg-white px-5 py-4 border-b border-[#E8E4F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <UserAvatar className="w-7 h-7 shrink-0" />
            <div>
              <h2 className="text-base font-extrabold text-[#221C35] tracking-tight">
                神埼ID マイページ
              </h2>
              <p className="text-[11px] text-[#6B6380]">
                会員情報・アカウント利用履歴・各種設定
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center cursor-pointer"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 1. Profile Hero Card */}
          <div className="bg-gradient-to-br from-[#2D1B69] via-[#3B207D] to-[#1E1145] text-white p-5 rounded-2xl shadow-md relative overflow-hidden">
            {/* Background Accent Gradients */}
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* User Avatar with Ring */}
              <div className="relative shrink-0">
                <div className="w-18 h-18 rounded-full ring-4 ring-white/20 p-0.5 bg-white/10 shadow-lg flex items-center justify-center overflow-hidden">
                  <UserAvatar className="w-full h-full" size={72} />
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 ring-2 ring-[#2D1B69] rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-3 h-3 text-white" />
                </div>
              </div>

              {/* User Details */}
              <div className="flex-1 text-center sm:text-left min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="text-lg font-black tracking-tight truncate max-w-[200px]">
                    {currentUser.name}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${getRankBadgeStyle(
                      currentUser.rank
                    )}`}
                  >
                    {currentUser.rank}会員
                  </span>
                </div>

                <div className="text-xs text-purple-200/90 font-mono mt-1 truncate">
                  {currentUser.email}
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-[11px] text-purple-300/80 font-mono mt-2">
                  <div>会員番号: <span className="text-white font-bold">{currentUser.memberId}</span></div>
                  <div>入会日: <span className="text-white">{currentUser.joinDate || '2026.04.01'}</span></div>
                </div>
              </div>
            </div>

            {/* Rank Benefits Callout */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>ゴールド会員特典: N-POINT付与率 3.0倍 / 先行予約権</span>
              </div>
              <span className="text-[10px] text-purple-300 font-mono hidden sm:inline">有効期限: 2027.12</span>
            </div>
          </div>

          {/* 2. Quick Metrics Row (4 Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* N-POINT */}
            <button
              type="button"
              onClick={onOpenNPointModal}
              className="bg-white p-3 rounded-xl border border-[#E6E2EE] hover:border-[#5B21B6] transition-all text-left shadow-2xs cursor-pointer group"
            >
              <div className="flex items-center justify-between text-[#857B98] text-[10px] font-bold">
                <span>N-POINT</span>
                <Coins className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="text-lg font-extrabold text-[#221C35] font-mono mt-1 group-hover:text-[#5B21B6] transition-colors">
                {balance.toLocaleString()}
                <span className="text-xs font-normal text-slate-500 ml-0.5">pt</span>
              </div>
              <div className="text-[10px] text-[#5B21B6] font-bold mt-1 flex items-center gap-0.5">
                <span>会員証表示</span>
                <ChevronRight className="w-2.5 h-2.5" />
              </div>
            </button>

            {/* Express Rides */}
            <div className="bg-white p-3 rounded-xl border border-[#E6E2EE] text-left shadow-2xs">
              <div className="flex items-center justify-between text-[#857B98] text-[10px] font-bold">
                <span>特急利用</span>
                <Train className="w-3.5 h-3.5 text-[#5B21B6]" />
              </div>
              <div className="text-lg font-extrabold text-[#221C35] font-mono mt-1">
                3<span className="text-xs font-normal text-slate-500 ml-0.5">回</span>
              </div>
              <div className="text-[10px] text-emerald-600 font-bold mt-1">
                {activeOrder ? '乗車予定あり' : '直近利用: 09/18'}
              </div>
            </div>

            {/* Deliveries */}
            <div className="bg-white p-3 rounded-xl border border-[#E6E2EE] text-left shadow-2xs">
              <div className="flex items-center justify-between text-[#857B98] text-[10px] font-bold">
                <span>デリバリー</span>
                <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <div className="text-lg font-extrabold text-[#221C35] font-mono mt-1">
                2<span className="text-xs font-normal text-slate-500 ml-0.5">件</span>
              </div>
              <div className="text-[10px] text-purple-600 font-bold mt-1">
                累計 ¥3,600
              </div>
            </div>

            {/* Events / Stamps */}
            <div className="bg-white p-3 rounded-xl border border-[#E6E2EE] text-left shadow-2xs">
              <div className="flex items-center justify-between text-[#857B98] text-[10px] font-bold">
                <span>スタンプ達成</span>
                <Award className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="text-lg font-extrabold text-[#221C35] font-mono mt-1">
                2<span className="text-xs font-normal text-slate-500 ml-0.5">駅</span>
              </div>
              <div className="text-[10px] text-indigo-600 font-bold mt-1">
                イベント参加中
              </div>
            </div>
          </div>

          {/* Active Order Quick Banner if available */}
          {activeOrder && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Ticket className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-emerald-950 truncate">
                      {activeOrder.trainName} ({activeOrder.carNo}号車 {activeOrder.seatNo})
                    </span>
                    <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.2 rounded">
                      本日有効
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-800 font-medium">
                    {activeOrder.boardingStation} → {activeOrder.destinationStation} ({activeOrder.departureTime}発)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenQRCodeModal}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR特急券</span>
              </button>
            </div>
          )}

          {/* 3. Account Activity & History Section (アカウント利用履歴) */}
          <div className="bg-white rounded-2xl border border-[#E6E2EE] p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#221C35] flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#5B21B6]" />
                  <span>アカウント利用履歴</span>
                </h3>
                <p className="text-[11px] text-[#716986]">
                  特急予約、車内デリバリー、イベント参加、ポイント履歴
                </p>
              </div>

              {/* Tab Filter Chips */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {[
                  { key: 'all', label: 'すべて' },
                  { key: 'ticket', label: '特急券' },
                  { key: 'delivery', label: 'デリバリー' },
                  { key: 'event', label: 'イベント' },
                  { key: 'point', label: 'ポイント' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveHistoryTab(t.key as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      activeHistoryTab === t.key
                        ? 'bg-[#5B21B6] text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-[#6B6380]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Activities List */}
            <div className="space-y-2.5 pt-1">
              {filteredActivities.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  該当する履歴はありません
                </div>
              ) : (
                filteredActivities.map((act) => {
                  const getIcon = () => {
                    switch (act.category) {
                      case 'ticket':
                        return <Train className="w-4 h-4 text-[#5B21B6]" />;
                      case 'delivery':
                        return <ShoppingBag className="w-4 h-4 text-purple-600" />;
                      case 'event':
                        return <Award className="w-4 h-4 text-indigo-600" />;
                      case 'point':
                        return <Coins className="w-4 h-4 text-amber-500" />;
                    }
                  };

                  const getBadgeColor = () => {
                    switch (act.statusColor) {
                      case 'emerald':
                        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                      case 'purple':
                        return 'bg-purple-100 text-purple-800 border-purple-200';
                      case 'indigo':
                        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
                      case 'amber':
                        return 'bg-amber-100 text-amber-800 border-amber-200';
                      default:
                        return 'bg-slate-100 text-slate-700 border-slate-200';
                    }
                  };

                  return (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl bg-[#FBFBFE] hover:bg-[#F3EFFC] border border-[#EAE6F2] transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-white border border-[#E0DAEB] flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                          {getIcon()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[#221C35] truncate max-w-[200px] sm:max-w-xs">
                              {act.title}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getBadgeColor()}`}
                            >
                              {act.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#716986] truncate mt-0.5">
                            {act.subtitle}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            {act.date}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {act.amount && (
                          <div className="text-xs font-black text-[#221C35] font-mono">
                            {act.amount}
                          </div>
                        )}
                        {act.pointsEarned && (
                          <div className="text-[10px] text-amber-600 font-bold mt-0.5">
                            +{act.pointsEarned} pt獲得
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 4. Account Settings & Security Details */}
          <div className="bg-white rounded-2xl border border-[#E6E2EE] p-4 shadow-2xs space-y-3">
            <h3 className="text-sm font-extrabold text-[#221C35] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>アカウント設定・連携サービス</span>
            </h3>

            <div className="space-y-2 text-xs">
              {/* Notifications */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F9F8FC] border border-[#ECE8F4]">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-amber-600" />
                  <div>
                    <div className="font-bold text-[#221C35]">運行情報・デリバリーお届け通知</div>
                    <div className="text-[10px] text-[#716986]">発車5分前案内・車内座席お届け通知</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    notificationsEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {notificationsEnabled ? '受信中' : '停止中'}
                </button>
              </div>

              {/* Password Manager */}
              <div className="p-2.5 rounded-xl bg-[#F9F8FC] border border-[#ECE8F4] flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#221C35] flex items-center gap-1.5">
                    <span>パスワードマネージャー</span>
                  </div>
                  <div className="text-[10px] text-[#716986] mt-0.5">
                    ログイン画面はブラウザのパスワード自動入力に対応しています
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Logout Section (マイページ内で選択可能) */}
          <div className="pt-2">
            {!showLogoutConfirm ? (
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full py-3.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-700 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <LogOut className="w-4 h-4 text-rose-600" />
                <span>神埼IDからログアウト</span>
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-950">
                      ログアウトの確認
                    </h4>
                    <p className="text-[11px] text-rose-800 mt-1 leading-relaxed">
                      ログアウトしても、保有しているN-POINT（{balance.toLocaleString()}pt）や予約履歴はメールアドレス（{currentUser.email}）に安全に保持されます。次回ログイン時にいつでも再開可能です。
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogout();
                      setShowLogoutConfirm(false);
                      onClose();
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>ログアウトする</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 6. Delete Account Section */}
          <div className="pt-2">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(true);
                  setDeleteError(null);
                  setDeletePassword('');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-transparent hover:bg-rose-50 border border-transparent hover:border-rose-200 text-rose-400 hover:text-rose-600 font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>神埼IDを削除する</span>
              </button>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 space-y-3 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-950">
                      アカウント削除の確認
                    </h4>
                    <p className="text-[11px] text-rose-800 mt-1 leading-relaxed">
                      この操作は取り消せません。会員情報、保有N-POINT（{balance.toLocaleString()}pt）、予約履歴がすべて削除されます。続行するには、確認のためパスワードを入力してください。
                    </p>
                  </div>
                </div>

                {deleteError && (
                  <div className="p-2 rounded-lg bg-rose-100 border border-rose-300 text-rose-700 text-[11px] font-medium">
                    {deleteError}
                  </div>
                )}

                <div className="relative">
                  <Lock className="w-4 h-4 text-rose-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="パスワードを入力"
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-rose-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-xs text-[#221C35] outline-none bg-white"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeletePassword('');
                      setDeleteError(null);
                    }}
                    disabled={isDeleting}
                    className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeleting ? '削除中...' : '完全に削除する'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-white px-5 py-3 border-t border-[#E8E4F0] flex items-center justify-between text-xs text-[#8A829D] shrink-0">
          <span className="font-mono text-[10px]">NIZAKI ID SERVICE ver 3.32</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
