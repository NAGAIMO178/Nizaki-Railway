import React, { useState } from 'react';
import { ShoppingBag, Calendar } from 'lucide-react';
import { PhoneContainer } from './components/PhoneContainer';
import { Header } from './components/Header';
import { StatusCard } from './components/StatusCard';
import { MyStationCard } from './components/MyStationCard';
import { MyStationRegisterCard, RegisterableStation } from './components/MyStationRegisterCard';
import { EDeliveryCard } from './components/EDeliveryCard';
import { FooterNav } from './components/FooterNav';
import { TrainLocationTab } from './components/TrainLocationTab';
import { ReservationTab } from './components/ReservationTab';
import { EquipTab } from './components/EquipTab';
import { EventsTab } from './components/EventsTab';
import { SettingsTab } from './components/SettingsTab';
import { EDeliveryModal } from './components/EDeliveryModal';
import { NPointModal } from './components/NPointModal';
import { RouteMapModal } from './components/RouteMapModal';
import { QRCodeModal } from './components/QRCodeModal';
import { LoginModal } from './components/LoginModal';
import { MyPageModal } from './components/MyPageModal';
import { MOCK_LINES, MOCK_STATIONS, MOCK_EQUIP_ITEMS, MOCK_LIVE_TRAINS } from './data/mockData';
import { POINT_CODES, normalizePointCode } from './data/pointCodes';
import { TabType, Station, ActiveOrder, DepartureInfo, EquipItem, PointHistoryItem, UserProfile } from './types';

// Helper to sanitize email for storage key
const getPointStoragePrefix = (email?: string | null) => {
  if (!email) return null;
  const sanitized = email.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `kanzaki_npoint_${sanitized}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [currentStation, setCurrentStation] = useState<Station>(MOCK_STATIONS[0]); // 松戸駅
  const [headerStationName, setHeaderStationName] = useState<string>('松戸');
  const [headerPlatform, setHeaderPlatform] = useState<1 | 2>(1);

  // Authentication state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('kanzaki_current_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved user:', e);
    }
    return null;
  });

  const isLoggedIn = currentUser !== null;
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // N-POINT is strictly bound to currentUser's email address
  const [nPointBalance, setNPointBalance] = useState<number>(0);
  const [pointHistory, setPointHistory] = useState<PointHistoryItem[]>([]);

  // Load user-specific points and history whenever currentUser email changes
  React.useEffect(() => {
    if (!currentUser || !currentUser.email) {
      setNPointBalance(0);
      setPointHistory([]);
      return;
    }

    const prefix = getPointStoragePrefix(currentUser.email);
    if (!prefix) return;

    try {
      const savedBalance = localStorage.getItem(`${prefix}_balance`);
      const savedHistory = localStorage.getItem(`${prefix}_history`);

      if (savedBalance !== null) {
        setNPointBalance(parseInt(savedBalance, 10));
      } else {
        // 新規アカウント向け初期ウェルカムボーナス (500pt)
        const initialPoints = 500;
        setNPointBalance(initialPoints);
        localStorage.setItem(`${prefix}_balance`, initialPoints.toString());
      }

      if (savedHistory !== null) {
        setPointHistory(JSON.parse(savedHistory));
      } else {
        const welcomeHistory: PointHistoryItem[] = [
          {
            id: `pt_init_${Date.now()}`,
            title: '神埼ID 新規登録ウェルカムボーナス',
            date: new Date().toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }),
            points: 500,
            type: 'coupon',
          },
        ];
        setPointHistory(welcomeHistory);
        localStorage.setItem(`${prefix}_history`, JSON.stringify(welcomeHistory));
      }
    } catch (e) {
      console.warn('Failed to load points for user:', e);
    }
  }, [currentUser?.email]);

  const addPoints = (points: number, title?: string, type: 'reservation' | 'stamp' | 'coupon' | 'equip' = 'reservation') => {
    if (!currentUser || !currentUser.email) return;
    const prefix = getPointStoragePrefix(currentUser.email);

    setNPointBalance((prev) => {
      const newBal = prev + points;
      if (prefix) {
        try {
          localStorage.setItem(`${prefix}_balance`, newBal.toString());
        } catch {}
      }
      return newBal;
    });

    const nowStr = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const newHistoryItem: PointHistoryItem = {
      id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: title || 'ポイント獲得',
      date: nowStr,
      points,
      type,
    };

    setPointHistory((prev) => {
      const newHist = [newHistoryItem, ...prev].slice(0, 30);
      if (prefix) {
        try {
          localStorage.setItem(`${prefix}_history`, JSON.stringify(newHist));
        } catch {}
      }
      return newHist;
    });
  };

  const redeemPointCode = (rawCode: string): { ok: boolean; message: string } => {
    if (!currentUser || !currentUser.email) {
      return { ok: false, message: 'コードのご利用には神埼IDログインが必要です。' };
    }
    const code = normalizePointCode(rawCode);
    if (!code) return { ok: false, message: 'コードを入力してください。' };

    const entry = POINT_CODES[code];
    if (!entry) return { ok: false, message: '無効なコードです。' };

    const prefix = getPointStoragePrefix(currentUser.email);
    if (!prefix) return { ok: false, message: '無効なコードです。' };

    const storageKey = `${prefix}_redeemed_codes`;
    let redeemed: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(parsed)) redeemed = parsed;
    } catch {}

    if (redeemed.includes(code)) {
      return { ok: false, message: 'このコードは既に使用済みです。' };
    }

    addPoints(entry.points, entry.title, 'coupon');
    try {
      localStorage.setItem(storageKey, JSON.stringify([...redeemed, code]));
    } catch {}
    return { ok: true, message: `${entry.points.toLocaleString()} pt を付与しました。` };
  };

  // デリバリークーポンの使用済み管理(アカウントごとに1回限り)
  const getUsedDeliveryCouponsKey = (): string | null => {
    const prefix = getPointStoragePrefix(currentUser?.email);
    return prefix ? `${prefix}_used_delivery_coupons` : null;
  };

  const readUsedDeliveryCoupons = (): string[] => {
    const key = getUsedDeliveryCouponsKey();
    if (!key) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const isDeliveryCouponUsed = (code: string): boolean => readUsedDeliveryCoupons().includes(code);

  const markDeliveryCouponUsed = (code: string) => {
    const key = getUsedDeliveryCouponsKey();
    if (!key) return;
    const used = readUsedDeliveryCoupons();
    if (used.includes(code)) return;
    try {
      localStorage.setItem(key, JSON.stringify([...used, code]));
    } catch {}
  };

  const handleRequireLogin = (reason: string, onLoggedIn?: () => void) => {
    setLoginReason(reason);
    if (onLoggedIn) {
      setPendingAction(() => onLoggedIn);
    } else {
      setPendingAction(null);
    }
    setIsLoginModalOpen(true);
  };

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('kanzaki_current_user', JSON.stringify(user));
    } catch (e) {
      console.warn('Failed to save user in storage:', e);
    }
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      setTimeout(() => {
        action();
      }, 100);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setNPointBalance(0);
    setPointHistory([]);
    try {
      localStorage.removeItem('kanzaki_current_user');
    } catch (e) {
      console.warn('Failed to remove user from storage:', e);
    }
  };

  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(() => {
    try {
      const saved = localStorage.getItem('kanzaki_active_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        // 開発時の初期モックデータ（EQ-84920）が自動保存されていた場合は破棄して未予約状態にする
        if (parsed?.orderId === 'EQ-84920') {
          localStorage.removeItem('kanzaki_active_order');
          return null;
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved active order:', e);
    }
    return null;
  });

  // Registered My Stations state (Max 3, Default: Tokyo)
  const [registeredStations, setRegisteredStations] = useState<RegisterableStation[]>([
    { id: 'kanzaki_Y01', name: '東京', code: 'Y01', lineName: '1. 神埼線' },
  ]);

  // Modals state
  const [isEDeliveryModalOpen, setIsEDeliveryModalOpen] = useState(false);
  const [isNPointModalOpen, setIsNPointModalOpen] = useState(false);
  const [isRouteMapModalOpen, setIsRouteMapModalOpen] = useState(false);
  const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [selectedCart, setSelectedCart] = useState<{ [key: string]: number }>({});

  // 予約状態が更新されたらローカルストレージとサーバー（/api/reservation）に同期
  React.useEffect(() => {
    if (activeOrder) {
      try {
        localStorage.setItem('kanzaki_active_order', JSON.stringify(activeOrder));
      } catch (e) {
        console.warn('localStorage save failed:', e);
      }

      fetch('/api/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: activeOrder }),
      }).catch((err) => console.error('Failed to sync reservation:', err));
    }
  }, [activeOrder]);

  const handleConfirmOrder = (order: ActiveOrder) => {
    let nextOrder: ActiveOrder = order;

    setActiveOrder((prevOrder) => {
      if (!prevOrder) {
        nextOrder = order;
        return order;
      }

      // 既存の購入済みアイテムと今回追加した注文アイテムを統合（マージ）
      const itemMap = new Map<string, { item: EquipItem; quantity: number }>();

      // 1. 既存アイテムをセット
      (prevOrder.items || []).forEach((ci) => {
        itemMap.set(ci.item.id, { item: ci.item, quantity: ci.quantity });
      });

      // 2. 新しいアイテムを加算
      (order.items || []).forEach((ci) => {
        const existing = itemMap.get(ci.item.id);
        if (existing) {
          itemMap.set(ci.item.id, { item: ci.item, quantity: existing.quantity + ci.quantity });
        } else {
          itemMap.set(ci.item.id, { item: ci.item, quantity: ci.quantity });
        }
      });

      const mergedItems = Array.from(itemMap.values());
      const mergedItemTotalPrice = mergedItems.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);

      // 基本運賃・特急料金
      const baseTicketFee = prevOrder.totalPrice - (prevOrder.items || []).reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);

      nextOrder = {
        ...prevOrder,
        orderId: order.orderId || prevOrder.orderId,
        items: mergedItems,
        totalPrice: baseTicketFee + mergedItemTotalPrice,
      };

      return nextOrder;
    });

    // サーバーへ即時送信
    fetch('/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: nextOrder }),
    }).catch((err) => console.error('Immediate sync failed:', err));

    // 特急券・注文金額に応じた N-POINT 還元 (合計金額の3% 還元、最低50pt)
    const earnedPoints = Math.max(50, Math.floor((order.totalPrice || 2000) * 0.03));
    const trainTitle = order.trainName ? `${order.trainName} 乗車・デリバリー利用` : '特急列車予約・車内デリバリー利用';
    addPoints(earnedPoints, trainTitle, 'reservation');
    setSelectedCart({}); // 購入確定後にカートを空にする
  };

  const handleCancelOrder = () => {
    const cancelId = activeOrder?.orderId;
    setActiveOrder(null);
    try {
      localStorage.removeItem('kanzaki_active_order');
    } catch (e) {}

    if (cancelId) {
      fetch('/api/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelOrderId: cancelId }),
      }).catch((err) => console.error('Cancel sync failed:', err));
    }
  };

  const handleBookMeguriSeat = (departure: DepartureInfo) => {
    setIsEDeliveryModalOpen(true);
  };

  return (
    <PhoneContainer>
      {/* 1. Header */}
      <Header
        nPointBalance={nPointBalance}
        onOpenNPointModal={() => setIsNPointModalOpen(true)}
        onOpenRouteMapModal={() => setIsRouteMapModalOpen(true)}
        onOpenQRCodeModal={() => setIsQRCodeModalOpen(true)}
        onOpenMyPage={() => setIsMyPageOpen(true)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        currentStationName={headerStationName}
        currentPlatform={headerPlatform}
        isLoggedIn={isLoggedIn}
        currentUser={currentUser}
        onOpenLoginModal={() => {
          setLoginReason('神埼IDでログインまたは新規会員登録を行います。');
          setPendingAction(null);
          setIsLoginModalOpen(true);
        }}
      />

      {/* Main Responsive View Container */}
      <main className="flex-1 w-full bg-[#F4F3F8] text-[#221C35] overflow-y-auto">
        {activeTab === 'home' && (
          <div className="max-w-md mx-auto px-4 py-4 pb-24 space-y-3.5 animate-fadeIn">
            {/* 1. Top Operation Status Area (運行情報) */}
            <StatusCard
              lines={MOCK_LINES}
              onOpenRouteMap={() => setActiveTab('location')}
            />

            {/* 2. Main Departure Info Card (発車案内カード) */}
            <MyStationCard
              registeredStations={registeredStations}
              onUpdateRegisteredStations={setRegisteredStations}
              onActiveStationChange={(name, plat) => {
                setHeaderStationName(name);
                setHeaderPlatform(plat);
              }}
            />

            {/* 3. Bottom Single Button: Brand Deep Purple Delivery Order Button */}
            <div className="pt-2">
              <button
                onClick={() => {
                  if (!isLoggedIn) {
                    handleRequireLogin('車内デリバリーのご利用には、神埼IDログインが必要です。', () => {
                      setIsEDeliveryModalOpen(true);
                    });
                    return;
                  }
                  setIsEDeliveryModalOpen(true);
                }}
                className="w-full py-3.5 px-6 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 text-white" />
                <span>デリバリー注文</span>
              </button>
            </div>

            {/* 4. マイ駅登録 (設置: デリバリー注文の下) */}
            <MyStationRegisterCard
              registeredStations={registeredStations}
              onUpdateRegisteredStations={setRegisteredStations}
            />
          </div>
        )}

        {/* Tab 2: 列車位置 */}
        {activeTab === 'location' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12">
            <TrainLocationTab />
          </div>
        )}

        {/* Tab 3: 予約 */}
        {activeTab === 'reservation' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12">
            <ReservationTab
              activeOrder={activeOrder}
              onOpenEDeliveryModal={() => setIsEDeliveryModalOpen(true)}
              onConfirmOrder={handleConfirmOrder}
              onCancelOrder={handleCancelOrder}
              isLoggedIn={isLoggedIn}
              onRequireLogin={handleRequireLogin}
            />
          </div>
        )}

        {/* Tab 4: エキップ (E-DELIVERY) */}
        {activeTab === 'equip' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12">
            <EquipTab
              items={MOCK_EQUIP_ITEMS}
              cart={selectedCart}
              onUpdateCart={setSelectedCart}
              activeOrder={activeOrder}
              isLoggedIn={isLoggedIn}
              onRequireLogin={handleRequireLogin}
              onOpenBookingModal={(initialCart) => {
                if (initialCart) setSelectedCart(initialCart);
                setIsEDeliveryModalOpen(true);
              }}
            />
          </div>
        )}

        {/* Tab 5: イベント */}
        {activeTab === 'events' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12">
            <EventsTab
              onAddNPoints={(points, title, type) => addPoints(points, title, type || 'stamp')}
              isLoggedIn={isLoggedIn}
              onRequireLogin={handleRequireLogin}
            />
          </div>
        )}

        {/* Tab 6: 設定 */}
        {activeTab === 'settings' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12">
            <SettingsTab
              nPointBalance={nPointBalance}
              registeredStations={registeredStations}
              onUpdateRegisteredStations={setRegisteredStations}
              onOpenNPointModal={() => setIsNPointModalOpen(true)}
              activeOrder={activeOrder}
              isLoggedIn={isLoggedIn}
              currentUser={currentUser}
              onLoginClick={() => {
                setLoginReason('神埼IDでログインまたは新規会員登録を行います。');
                setPendingAction(null);
                setIsLoginModalOpen(true);
              }}
              onLogout={handleLogout}
              onOpenMyPage={() => setIsMyPageOpen(true)}
            />
          </div>
        )}
      </main>

      {/* 5. フッターナビゲーション（タブバー: ホーム, 列車位置, 予約, エキップ, 設定） */}
      <FooterNav
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        hasActiveOrder={!!activeOrder}
      />

      {/* Interactive Modals */}
      <EDeliveryModal
        isOpen={isEDeliveryModalOpen}
        onClose={() => setIsEDeliveryModalOpen(false)}
        equipItems={MOCK_EQUIP_ITEMS}
        onConfirmOrder={handleConfirmOrder}
        initialCart={selectedCart}
        activeOrder={activeOrder}
        isLoggedIn={isLoggedIn}
        onRequireLogin={handleRequireLogin}
        isCouponUsed={isDeliveryCouponUsed}
        onCouponUsed={markDeliveryCouponUsed}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          setPendingAction(null);
        }}
        onLogin={handleLogin}
        reason={loginReason}
      />

      <MyPageModal
        isOpen={isMyPageOpen}
        onClose={() => setIsMyPageOpen(false)}
        currentUser={currentUser}
        balance={nPointBalance}
        pointHistory={pointHistory}
        activeOrder={activeOrder}
        onLogout={handleLogout}
        onOpenNPointModal={() => {
          setIsMyPageOpen(false);
          setIsNPointModalOpen(true);
        }}
        onOpenQRCodeModal={() => {
          setIsMyPageOpen(false);
          setIsQRCodeModalOpen(true);
        }}
      />

      <NPointModal
        isOpen={isNPointModalOpen}
        onClose={() => setIsNPointModalOpen(false)}
        balance={nPointBalance}
        pointHistory={pointHistory}
        currentUser={currentUser}
        onRedeemCode={redeemPointCode}
      />

      <RouteMapModal
        isOpen={isRouteMapModalOpen}
        onClose={() => setIsRouteMapModalOpen(false)}
      />

      <QRCodeModal
        isOpen={isQRCodeModalOpen}
        onClose={() => setIsQRCodeModalOpen(false)}
        activeOrder={activeOrder}
      />
    </PhoneContainer>
  );
}
