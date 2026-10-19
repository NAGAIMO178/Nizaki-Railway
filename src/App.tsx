import React, { lazy, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { PhoneContainer } from './components/PhoneContainer';
import { Header } from './components/Header';
import { StatusCard } from './components/StatusCard';
import { MyStationCard } from './components/MyStationCard';
import { MyStationRegisterCard, RegisterableStation, REGISTERABLE_LINES } from './components/MyStationRegisterCard';
import { FooterNav } from './components/FooterNav';
import type { ReservationPreset } from './components/ReservationTab';
import { MenuDrawer } from './components/MenuDrawer';
import { LazyOnOpen } from './components/LazyOnOpen';
import { LazyBoundary } from './components/LazyBoundary';
import { LaunchWelcome, LAUNCH_BONUS_ID, WelcomeStep } from './components/LaunchWelcome';
import { MOCK_LINES, MOCK_EQUIP_ITEMS } from './data/mockData';
import { POINT_CODES, normalizePointCode } from './data/pointCodes';
import { getLocalDateString, isOrderExpired } from './utils/orderExpiry';
import { callGas } from './utils/accountApi';
import { isLaunched } from './utils/launch';
import { calcDeliveryAddPoints, calcReservationPoints } from './utils/points';
import LaunchCountdown from './components/LaunchCountdown';
import { useCloudAccount } from './utils/useCloudAccount';
import { rewardIdFromTitle } from './utils/cloudAccount';
import { useDelayNotifyMode } from './utils/delayNotifySettings';
import { useDelayWatcher } from './utils/useDelayWatcher';
import { useReservationWatcher } from './utils/useReservationWatcher';
import { computeMileage, Mileage } from './utils/mileage';
import { TabType, ActiveOrder, EquipItem, PointHistoryItem, UserProfile, OrderHistoryItem } from './types';

// 起動に要らない画面は、開くときに読み込む(最初のホームを早く出すため)
const lazyNamed = <T extends React.ComponentType<any>>(load: () => Promise<Record<string, any>>, name: string) =>
  lazy(() => load().then((m) => ({ default: m[name] as T })));
const loadTrainLocationTab = () => import('./components/TrainLocationTab');
const loadTimetableTab = () => import('./components/TimetableTab');
const loadReservationTab = () => import('./components/ReservationTab');
const loadEquipTab = () => import('./components/EquipTab');
const loadEventsTab = () => import('./components/EventsTab');
const loadSettingsTab = () => import('./components/SettingsTab');
const TrainLocationTab = lazyNamed<typeof import('./components/TrainLocationTab').TrainLocationTab>(loadTrainLocationTab, 'TrainLocationTab');
const TimetableTab = lazyNamed<typeof import('./components/TimetableTab').TimetableTab>(loadTimetableTab, 'TimetableTab');
const ReservationTab = lazyNamed<typeof import('./components/ReservationTab').ReservationTab>(loadReservationTab, 'ReservationTab');
const EquipTab = lazyNamed<typeof import('./components/EquipTab').EquipTab>(loadEquipTab, 'EquipTab');
const EventsTab = lazyNamed<typeof import('./components/EventsTab').EventsTab>(loadEventsTab, 'EventsTab');
const SettingsTab = lazyNamed<typeof import('./components/SettingsTab').SettingsTab>(loadSettingsTab, 'SettingsTab');
const EDeliveryModal = lazyNamed<typeof import('./components/EDeliveryModal').EDeliveryModal>(() => import('./components/EDeliveryModal'), 'EDeliveryModal');
const NPointModal = lazyNamed<typeof import('./components/NPointModal').NPointModal>(() => import('./components/NPointModal'), 'NPointModal');
const RouteMapModal = lazyNamed<typeof import('./components/RouteMapModal').RouteMapModal>(() => import('./components/RouteMapModal'), 'RouteMapModal');
const QRCodeModal = lazyNamed<typeof import('./components/QRCodeModal').QRCodeModal>(() => import('./components/QRCodeModal'), 'QRCodeModal');
const LoginModal = lazyNamed<typeof import('./components/LoginModal').LoginModal>(() => import('./components/LoginModal'), 'LoginModal');
const MyPageModal = lazyNamed<typeof import('./components/MyPageModal').MyPageModal>(() => import('./components/MyPageModal'), 'MyPageModal');

// 画面を読み込んでいるあいだの表示(イベントの読み込み中と同じ書き方)
const TabFallback = () => <div className="text-center text-xs text-[#857D99] py-10">読み込み中…</div>;

// Helper to sanitize email for storage key
const getPointStoragePrefix = (email?: string | null) => {
  if (!email) return null;
  const sanitized = email.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
  return `kanzaki_npoint_${sanitized}`;
};

const MY_STATIONS_STORAGE_KEY = 'kanzaki_my_stations';

const normEmail = (email?: string | null) => (email || '').trim().toLowerCase();

// 予約はアカウントごとにこの端末へ保存する(ログアウトや、別のアカウントでのログインで混ざらないように)
const LEGACY_ORDER_KEY = 'kanzaki_active_order';
const orderStorageKey = (email?: string | null) => {
  const prefix = getPointStoragePrefix(email);
  return prefix ? `${prefix}_active_order` : null;
};

// そのアカウントの保存済み予約を読む。到着時刻を過ぎていたものは消して expired で返す
const readStoredOrder = (email?: string | null): { order: ActiveOrder | null; expired: ActiveOrder | null } => {
  const none = { order: null, expired: null };
  const key = orderStorageKey(email);
  if (!key) return none;
  try {
    let raw = localStorage.getItem(key);
    if (raw === null) {
      // 以前の版は全アカウント共通の1か所に保存していた。最初にログインしたアカウントの予約として引き継ぐ
      const legacy = localStorage.getItem(LEGACY_ORDER_KEY);
      if (legacy !== null) {
        localStorage.removeItem(LEGACY_ORDER_KEY);
        raw = legacy;
      }
    }
    if (raw === null) return none;
    const parsed = JSON.parse(raw);
    // 開発時の初期モックデータ（EQ-84920）が自動保存されていた場合は破棄して未予約状態にする
    if (!parsed || parsed.orderId === 'EQ-84920') {
      localStorage.removeItem(key);
      return none;
    }
    // 日付なしの旧データは「今日の予約」とみなす
    const order: ActiveOrder = { ...parsed, reservedDate: parsed.reservedDate || getLocalDateString(), ownerEmail: normEmail(email) };
    if (isOrderExpired(order)) {
      localStorage.removeItem(key);
      return { order: null, expired: order };
    }
    return { order, expired: null };
  } catch (e) {
    console.warn('Failed to parse saved active order:', e);
    return none;
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');

  // ホームを出したあと、手が空いたときに、ほかの画面を先に読み込んでおく(開いたときにすぐ出る)
  React.useEffect(() => {
    const prefetch = () => {
      [loadReservationTab, loadEquipTab, loadTrainLocationTab, loadTimetableTab, loadEventsTab, loadSettingsTab].forEach((load) => {
        load().catch(() => {});
      });
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetch, 2000);
    return () => window.clearTimeout(id);
  }, []);
  // 予約タブの中の切り替え(特急券・座席 / デリバリー)と、ヘッダーのメニュー
  const [reservationView, setReservationView] = useState<'ticket' | 'delivery'>('ticket');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
  // ログイン直後に実行される予約確定など、古い画面の関数から呼ばれても、最新のログイン状態で動かすための参照
  const currentUserRef = React.useRef(currentUser);
  currentUserRef.current = currentUser;

  // NIZAKI 2.0(公開後): ログイン証のある会員の、ポイント・履歴・クーポン・ミステリーは、クラウドが基準になる。
  // 公開前は、cloudOn も demoOn も false なので、これまでどおり端末の保存先を使う。
  const cloud = useCloudAccount(currentUser);
  const cloudOn = cloud.active;
  const cloudOnRef = React.useRef(cloudOn);
  cloudOnRef.current = cloudOn;
  // 公開後のデモ会員(ログイン証なし): ポイントは貯められるが、保存しない(画面を開いているあいだだけ)
  const demoOn = isLaunched() && currentUser !== null && !currentUser.sessionToken;
  const demoOnRef = React.useRef(demoOn);
  demoOnRef.current = demoOn;
  const memStoreRef = React.useRef(new Map<string, string>());
  const storeGet = (key: string): string | null =>
    demoOnRef.current ? (memStoreRef.current.get(key) ?? null) : localStorage.getItem(key);
  const storeSet = (key: string, value: string) => {
    if (demoOnRef.current) memStoreRef.current.set(key, value);
    else localStorage.setItem(key, value);
  };
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // N-POINT is strictly bound to currentUser's email address
  const [nPointBalance, setNPointBalance] = useState<number>(0);
  const [pointHistory, setPointHistory] = useState<PointHistoryItem[]>([]);
  // 終了した予約(乗車済み・キャンセル)の記録。アカウントごとにこの端末内へ保存する
  const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);

  // Load user-specific points and history whenever currentUser email changes
  React.useEffect(() => {
    if (!currentUser || !currentUser.email || cloudOn) {
      // クラウドが基準の会員は、端末の保存先を使わない(表示は、クラウドの内容)
      setNPointBalance(0);
      setPointHistory([]);
      setOrderHistory([]);
      return;
    }
    if (demoOn) memStoreRef.current.clear(); // デモ会員は、開くたびに最初から

    const prefix = getPointStoragePrefix(currentUser.email);
    if (!prefix) return;

    try {
      const savedOrders = JSON.parse(storeGet(`${prefix}_order_history`) || '[]');
      setOrderHistory(Array.isArray(savedOrders) ? savedOrders : []);
    } catch {
      setOrderHistory([]);
    }

    try {
      const savedBalance = storeGet(`${prefix}_balance`);
      const savedHistory = storeGet(`${prefix}_history`);

      if (savedBalance !== null) {
        setNPointBalance(parseInt(savedBalance, 10));
      } else {
        // 新規アカウント向け初期ウェルカムボーナス (500pt)
        const initialPoints = 500;
        setNPointBalance(initialPoints);
        storeSet(`${prefix}_balance`, initialPoints.toString());
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
        storeSet(`${prefix}_history`, JSON.stringify(welcomeHistory));
      }
    } catch (e) {
      console.warn('Failed to load points for user:', e);
    }
  }, [currentUser?.email, cloudOn]);

  // 終わった予約(乗車済み・キャンセル)を履歴に残す。この端末内に、アカウントごとに最大30件
  const archiveOrder = (order: ActiveOrder, result: 'completed' | 'cancelled') => {
    if (cloudOnRef.current) return; // クラウドが基準の会員の履歴は、サーバーの予約台帳から作る
    const prefix = getPointStoragePrefix(currentUser?.email);
    if (!prefix) return;
    const items = order.items || [];
    const itemsTotal = items.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);
    const entry: OrderHistoryItem = {
      orderId: order.orderId,
      trainName: order.trainName,
      carNo: order.carNo,
      seatNo: order.seatNo,
      seatType: order.seatType,
      boardingStation: order.boardingStation,
      destinationStation: order.destinationStation,
      departureTime: order.departureTime,
      arrivalTime: order.arrivalTime,
      reservedDate: order.reservedDate,
      ticketPrice: Math.max(0, order.totalPrice + (order.itemDiscount || 0) - itemsTotal),
      items: items.map((ci) => ({ name: ci.item.name, quantity: ci.quantity, price: ci.item.price })),
      itemDiscount: order.itemDiscount || 0,
      result,
    };
    const key = `${prefix}_order_history`;
    let saved: OrderHistoryItem[] = [];
    try {
      const parsed = JSON.parse(storeGet(key) || '[]');
      if (Array.isArray(parsed)) saved = parsed;
    } catch {}
    const next = [entry, ...saved.filter((h) => h.orderId !== entry.orderId)].slice(0, 30);
    try {
      storeSet(key, JSON.stringify(next));
    } catch {}
    setOrderHistory(next);
  };
  // タイマー内から常に最新のログイン状態で呼べるようにする
  const archiveOrderRef = React.useRef(archiveOrder);
  archiveOrderRef.current = archiveOrder;
  // 起動時にすでに終了していた予約(アプリを閉じている間に到着時刻を過ぎたもの)
  const expiredOnLoadRef = React.useRef<ActiveOrder | null>(null);

  const addPoints = (points: number, title?: string, type: 'reservation' | 'stamp' | 'coupon' | 'equip' = 'reservation') => {
    const user = currentUserRef.current;
    if (!user || !user.email) return;
    if (cloudOnRef.current) return; // クラウドが基準の会員のポイントは、サーバーが付ける
    const prefix = getPointStoragePrefix(user.email);

    setNPointBalance((prev) => {
      const newBal = Math.max(0, prev + points);
      if (prefix) {
        try {
          storeSet(`${prefix}_balance`, newBal.toString());
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
          storeSet(`${prefix}_history`, JSON.stringify(newHist));
        } catch {}
      }
      return newHist;
    });
  };

  // 謎解きイベントの報酬(幕クリアなど)は、アカウントごとに1回だけ付与する(この端末内で記録)
  // ログインしていない場合は、従来どおりポイントは付与されない
  const addEventRewardOnce = (points: number, title?: string, type: 'reservation' | 'stamp' | 'coupon' | 'equip' = 'stamp') => {
    if (!currentUser || !currentUser.email) return;
    if (cloudOnRef.current) {
      // クラウドが基準の会員: ミステリーの進行を送り、報酬は、サーバーが1回だけ付ける
      cloud.pushMystery();
      const rewardId = rewardIdFromTitle(title);
      if (rewardId) void cloud.earnEvent(rewardId);
      return;
    }
    const prefix = getPointStoragePrefix(currentUser.email);
    if (!prefix) return;
    const rewardKey = title || `event_${points}`;
    const storageKey = `${prefix}_event_rewards`;
    let granted: string[] = [];
    try {
      const parsed = JSON.parse(storeGet(storageKey) || '[]');
      if (Array.isArray(parsed)) granted = parsed;
    } catch {}
    if (granted.includes(rewardKey)) return;
    addPoints(points, title, type);
    try {
      storeSet(storageKey, JSON.stringify([...granted, rewardKey]));
    } catch {}
  };

  const redeemPointCode = (rawCode: string): { ok: boolean; message: string } | Promise<{ ok: boolean; message: string }> => {
    if (!currentUser || !currentUser.email) {
      return { ok: false, message: 'コードのご利用には神埼IDログインが必要です。' };
    }
    if (cloudOnRef.current) return cloud.redeemCode(rawCode); // クラウドが基準の会員: サーバーが判定する
    const code = normalizePointCode(rawCode);
    if (!code) return { ok: false, message: 'コードを入力してください。' };

    const entry = POINT_CODES[code];
    if (!entry) return { ok: false, message: '無効なコードです。' };

    const prefix = getPointStoragePrefix(currentUser.email);
    if (!prefix) return { ok: false, message: '無効なコードです。' };

    const storageKey = `${prefix}_redeemed_codes`;
    let redeemed: string[] = [];
    try {
      const parsed = JSON.parse(storeGet(storageKey) || '[]');
      if (Array.isArray(parsed)) redeemed = parsed;
    } catch {}

    if (redeemed.includes(code)) {
      return { ok: false, message: 'このコードは既に使用済みです。' };
    }

    addPoints(entry.points, entry.title, 'coupon');
    try {
      storeSet(storageKey, JSON.stringify([...redeemed, code]));
    } catch {}
    return { ok: true, message: `${entry.points.toLocaleString()} pt を付与しました。` };
  };

  // デリバリークーポンの使用済み管理(この端末でアカウントごとに1回限り。端末のデータを消すと戻る)
  const getUsedDeliveryCouponsKey = (): string | null => {
    const prefix = getPointStoragePrefix(currentUser?.email);
    return prefix ? `${prefix}_used_delivery_coupons` : null;
  };

  const readUsedDeliveryCoupons = (): string[] => {
    if (cloudOnRef.current) return cloud.account?.usedCoupons ?? []; // クラウドが基準の会員
    const key = getUsedDeliveryCouponsKey();
    if (!key) return [];
    try {
      const parsed = JSON.parse(storeGet(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const isDeliveryCouponUsed = (code: string): boolean => readUsedDeliveryCoupons().includes(code);

  const markDeliveryCouponUsed = (code: string) => {
    if (cloudOnRef.current) {
      cloud.markCouponUsed(code);
      return;
    }
    const key = getUsedDeliveryCouponsKey();
    if (!key) return;
    const used = readUsedDeliveryCoupons();
    if (used.includes(code)) return;
    try {
      storeSet(key, JSON.stringify([...used, code]));
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
    setSelectedCart({});
    try {
      localStorage.removeItem('kanzaki_current_user');
    } catch (e) {
      console.warn('Failed to remove user from storage:', e);
    }
  };

  const orderEmailRef = React.useRef<string | null>(currentUser?.email ?? null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(() => {
    const stored = readStoredOrder(currentUser?.email);
    expiredOnLoadRef.current = stored.expired;
    return stored.order;
  });

  // 起動時にすでに終了していた予約を、ログイン中のアカウントの履歴に残す
  React.useEffect(() => {
    const expired = expiredOnLoadRef.current;
    if (expired && currentUser?.email) {
      expiredOnLoadRef.current = null;
      archiveOrderRef.current(expired, 'completed');
    }
  }, [currentUser?.email]);

  // 到着時刻を過ぎた予約は自動で終了し、新しい予約ができるようにする
  React.useEffect(() => {
    if (!activeOrder) return;
    // ログインし直した直後など、別のアカウントの予約が一瞬残っているときは触らない
    if (normEmail(activeOrder.ownerEmail) !== normEmail(currentUser?.email)) return;
    const expireIfNeeded = () => {
      if (isOrderExpired(activeOrder)) {
        archiveOrderRef.current(activeOrder, 'completed');
        setActiveOrder(null);
        try {
          const key = orderStorageKey(activeOrder.ownerEmail);
          if (key) localStorage.removeItem(key);
        } catch {}
      }
    };
    expireIfNeeded();
    const timer = setInterval(expireIfNeeded, 30000);
    return () => clearInterval(timer);
  }, [activeOrder, currentUser?.email]);

  // Registered My Stations state (Max 3, Default: Tokyo)
  const [registeredStations, setRegisteredStations] = useState<RegisterableStation[]>(() => {
    try {
      const saved = localStorage.getItem(MY_STATIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // 駅の名前・並びが変わっても壊れないよう、現在の駅一覧と照合して作り直す(無くなった駅は外す)
          // 同じ駅を路線違いで重ねて登録していた場合は、最初の1つにまとめる
          const normalized: RegisterableStation[] = [];
          parsed.forEach((st) => {
            if (!st || typeof st.name !== 'string' || typeof st.lineName !== 'string') return;
            if (normalized.some((n) => n.name === st.name)) return;
            const line = REGISTERABLE_LINES.find((l) => l.name === st.lineName);
            const found = line?.stations.find((s) => s.name === st.name);
            if (line && found) {
              normalized.push({ id: `${line.id}_${found.id}`, name: found.name, code: found.code, lineName: line.name });
            }
          });
          if (normalized.length > 0) return normalized.slice(0, 3);
        }
      }
    } catch {}
    return [{ id: 'kanzaki_Y01', name: '東京', code: 'Y01', lineName: '1. 神埼線' }];
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(MY_STATIONS_STORAGE_KEY, JSON.stringify(registeredStations));
    } catch {}
  }, [registeredStations]);

  // NIZAKI 2.0(公開後): どのタブを見ていても、全路線の列車の遅れを見張って、知らせる(設定で、マイ駅だけ・オフにも変えられる)
  const [delayMode] = useDelayNotifyMode();
  const delayWatch = useDelayWatcher({
    enabled: isLaunched() && delayMode !== 'off',
    mode: delayMode,
    myStationNames: registeredStations.map((s) => s.name),
  });

  // NIZAKI 2.0(公開後): ご予約の特急の、発車のリマインド・列車の遅れ・デリバリーのお届けを知らせる(アプリを開いているあいだ)
  const reservationWatch = useReservationWatcher({
    enabled: isLaunched() && isLoggedIn,
    order: activeOrder,
    onStatusChange: (orderId, status) =>
      setActiveOrder((prev) => (prev && prev.orderId === orderId && prev.status !== status ? { ...prev, status } : prev)),
  });

  // Modals state
  const [isEDeliveryModalOpen, setIsEDeliveryModalOpen] = useState(false);
  const [isNPointModalOpen, setIsNPointModalOpen] = useState(false);
  const [isRouteMapModalOpen, setIsRouteMapModalOpen] = useState(false);
  const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
  const [isMyPageOpen, setIsMyPageOpen] = useState(false);
  const [reservationPreset, setReservationPreset] = useState<ReservationPreset | null>(null); // 特急の詳細から、予約画面を開くときの指定
  const [welcomeReplayKey, setWelcomeReplayKey] = useState(0); // NIZAKI 2.0 のご案内を、メニューからもう一度見る

  // 公開日の案内が、説明している場所を、実際に開く(マイレージ・ポイントは、クラウドの会員だけ。ほかは、ホームのまま)
  const handleWelcomeStep = (step: WelcomeStep) => {
    const member = cloudOnRef.current;
    setIsMenuOpen(false);
    setIsMyPageOpen(step === 'mileage' && member);
    setIsNPointModalOpen(step === 'save' && member);
    if (step === 'route') {
      // 読み込めなかったときも、時刻表を開く(失敗の表示が出る)
      loadTimetableTab().then((m) => m.presetTimetableMode('route')).catch(() => {}).finally(() => setActiveTab('timetable'));
    } else if (step === 'delay') {
      setActiveTab('settings');
      window.setTimeout(() => document.getElementById('delay-setting')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
    } else {
      setActiveTab('home');
    }
  };
  const [selectedCart, setSelectedCart] = useState<{ [key: string]: number }>({});

  // 予約状態が更新されたらローカルストレージに保存し、ログイン済みの会員ならGAS(予約台帳)にも記録する
  // (LINEの「予約確認」はこの台帳を見る。デモ会員など、ログイン証が無い場合は端末内のみ)
  const sessionToken = currentUser?.sessionToken;
  React.useEffect(() => {
    if (activeOrder) {
      try {
        const key = orderStorageKey(activeOrder.ownerEmail);
        if (key) localStorage.setItem(key, JSON.stringify(activeOrder));
      } catch (e) {
        console.warn('localStorage save failed:', e);
      }

      // いまログインしているアカウントの予約だけを台帳へ送る
      // (クラウドが基準の会員は、最初の同期が済むまで待つ。先に送ると、端末のポイントの引き継ぎより先に、ウェルカムボーナスになってしまう)
      if (sessionToken && normEmail(activeOrder.ownerEmail) === normEmail(currentUser?.email) && !(cloudOn && !cloud.ready)) {
        const awardOnServer = cloudOn && !cloud.error; // サーバーがポイントを付ける(同期できなかったときは、付けずに予約だけ送る)
        // 画像などを含めず、台帳に必要な項目だけを送る
        const { orderId, trainName, carNo, seatNo, seatType, boardingStation, destinationStation, departureTime, arrivalTime, reservedDate, totalPrice } = activeOrder;
        const base = { orderId, trainName, carNo, seatNo, seatType, boardingStation, destinationStation, departureTime, arrivalTime, reservedDate, totalPrice };
        const payload = awardOnServer
          ? {
              sessionToken,
              order: {
                ...base,
                items: (activeOrder.items || []).map((ci) => ({ id: ci.item.id, name: ci.item.name, quantity: ci.quantity, price: ci.item.price })),
                itemDiscount: activeOrder.itemDiscount || 0,
                pointsUsed: activeOrder.pointsUsed || 0,
              },
              awardPoints: true,
            }
          : { sessionToken, order: base };
        callGas('createReservation', payload)
          .then(() => {
            if (awardOnServer) void cloud.refresh(); // 付いたポイントを、画面に反映する
          })
          .catch((err) => console.warn('Failed to sync reservation:', err));
      }
    }
  }, [activeOrder, sessionToken, currentUser?.email, cloudOn, cloud.ready, cloud.error]);

  // ログアウト・別のアカウントでのログインのときは、そのアカウントの予約に切り替える
  React.useEffect(() => {
    const email = currentUser?.email ?? null;
    if (orderEmailRef.current === email) return;
    orderEmailRef.current = email;
    const stored = readStoredOrder(email);
    setActiveOrder(stored.order);
    setSelectedCart({});
    if (stored.expired) archiveOrderRef.current(stored.expired, 'completed');
  }, [currentUser?.email]);

  const handleConfirmOrder = (order: ActiveOrder) => {
    // 特急券・注文金額に応じた N-POINT 還元 (合計金額の3% 還元、最低50pt)
    const owner = normEmail(currentUserRef.current?.email) || undefined;
    // (N-POINTで払った分は、含まない。ぜんぶポイントで払ったときは、付けない)
    const paidAllByPoints = (order.pointsUsed ?? 0) > 0 && order.totalPrice <= 0;
    // (公開後: デリバリーを足したときは、増えた金額の3%だけ。最低50ptは、新しい予約だけ)
    const isDeliveryAdd = isLaunched() && activeOrder !== null;
    const earnedPoints =
      owner && !paidAllByPoints
        ? isDeliveryAdd
          ? calcDeliveryAddPoints(order.totalPrice)
          : calcReservationPoints(order.totalPrice || 2000)
        : 0;

    setActiveOrder((prevOrder) => {
      if (!prevOrder) {
        return { ...order, ownerEmail: owner, earnedPoints };
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

      // 基本運賃・特急料金(これまでのクーポン割引は、合計に引いてあるので足し戻して求める)
      const prevDiscount = prevOrder.itemDiscount || 0;
      const baseTicketFee = prevOrder.totalPrice + prevDiscount - (prevOrder.items || []).reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0);
      const itemDiscount = prevDiscount + (order.itemDiscount || 0);

      const nextOrder: ActiveOrder = {
        ...prevOrder,
        orderId: prevOrder.orderId,
        items: mergedItems,
        itemDiscount,
        // (今回のデリバリーで使った N-POINT は、合計から引き、これまでの分に足す)
        totalPrice: Math.max(0, baseTicketFee + mergedItemTotalPrice - itemDiscount - (order.pointsUsed ?? 0)),
        pointsUsed: (prevOrder.pointsUsed ?? 0) + (order.pointsUsed ?? 0),
        earnedPoints: (prevOrder.earnedPoints || 0) + earnedPoints,
      };

      return nextOrder;
    });

    const trainTitle = order.trainName ? `${order.trainName} 乗車・デリバリー利用` : '特急列車予約・車内デリバリー利用';
    addPoints(earnedPoints, trainTitle, 'reservation');
    setSelectedCart({}); // 購入確定後にカートを空にする
  };

  const handleCancelOrder = () => {
    const cancelId = activeOrder?.orderId;
    if (activeOrder) {
      archiveOrder(activeOrder, 'cancelled');
      // この予約でもらったポイントは、取り消す(予約と取消を繰り返してポイントが増えないように)
      const earned = activeOrder.earnedPoints || 0;
      if (earned > 0) {
        addPoints(-earned, `予約取消によるポイント取消（${activeOrder.trainName}）`, 'reservation');
      }
    }
    const ownerKey = orderStorageKey(activeOrder?.ownerEmail || currentUser?.email);
    setActiveOrder(null);
    try {
      if (ownerKey) localStorage.removeItem(ownerKey);
    } catch (e) {}

    if (cancelId && sessionToken) {
      const onCloud = cloudOnRef.current;
      callGas('cancelReservation', { sessionToken, orderId: cancelId, ...(onCloud ? { awardPoints: true } : {}) })
        .then(() => {
          if (onCloud) void cloud.refresh(); // 差し引かれたポイントを、画面に反映する
        })
        .catch((err) => console.warn('Cancel sync failed:', err));
    }
  };

  // マイレージ(公開後のクラウドの会員だけ): 乗車済みの予約から、累計の営業キロ・ランクを求める
  const [mileage, setMileage] = React.useState<Mileage | null>(null);
  const ridesForMileage = cloud.account?.rides;
  React.useEffect(() => {
    if (!cloudOn || !ridesForMileage) {
      setMileage(null);
      return;
    }
    let alive = true;
    computeMileage(ridesForMileage)
      .then((m) => {
        if (alive) setMileage(m);
      })
      .catch(() => {
        if (alive) setMileage(null);
      });
    return () => {
      alive = false;
    };
  }, [cloudOn, ridesForMileage]);
  // ランクは、マイレージで決まる(公開前や、デモ会員は、これまでの表示のまま)
  const shownUser: UserProfile | null =
    currentUser && cloudOn && mileage ? { ...currentUser, rank: mileage.rank as UserProfile['rank'] } : currentUser;

  // 画面に出す、ポイント・履歴(クラウドが基準の会員は、クラウドの内容)
  const shownBalance = cloudOn ? (cloud.account?.balance ?? 0) : nPointBalance;
  const shownPointHistory = cloudOn ? (cloud.account?.history ?? []) : pointHistory;
  const shownOrderHistory = cloudOn ? (cloud.account?.orders ?? []) : orderHistory;

  return (
    <PhoneContainer>
      {/* 1. Header */}
      <Header
        nPointBalance={shownBalance}
        onOpenNPointModal={() => setIsNPointModalOpen(true)}
        onOpenRouteMapModal={() => setIsRouteMapModalOpen(true)}
        onOpenQRCodeModal={() => setIsQRCodeModalOpen(true)}
        onOpenMyPage={() => setIsMyPageOpen(true)}
        onOpenMenu={() => setIsMenuOpen(true)}
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

      {/* 公開までのカウントダウン(公開前の、ホームだけ) */}
      {activeTab === 'home' && !isLaunched() && <LaunchCountdown />}

      {/* 遅れの知らせ(公開後。どのタブでも出る) */}
      {delayWatch.notice && (
        <div
          key={delayWatch.notice.key}
          className="bg-amber-500 text-white text-xs font-bold px-3 py-2 flex items-center justify-between gap-2 shadow-sm animate-fadeIn"
          role="status"
        >
          <span className="min-w-0">{delayWatch.notice.text}</span>
          <button
            type="button"
            onClick={delayWatch.dismiss}
            className="shrink-0 px-1.5 py-0.5 hover:bg-amber-600 rounded text-white cursor-pointer"
            aria-label="遅れの知らせを閉じる"
          >
            ×
          </button>
        </div>
      )}
      {reservationWatch.notice && (
        <div
          key={reservationWatch.notice.key}
          className="bg-[#5B21B6] text-white text-xs font-bold px-3 py-2 flex items-center justify-between gap-2 shadow-sm animate-fadeIn"
          role="status"
        >
          <span className="min-w-0">{reservationWatch.notice.text}</span>
          <button
            type="button"
            onClick={reservationWatch.dismiss}
            className="shrink-0 px-1.5 py-0.5 hover:bg-[#4C1D95] rounded text-white cursor-pointer"
            aria-label="予約の知らせを閉じる"
          >
            ×
          </button>
        </div>
      )}

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
                  setReservationView('delivery');
                  setActiveTab('reservation');
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
            <LazyBoundary fallback={<TabFallback />}>
              <TrainLocationTab
                onOpenReservation={(preset) => {
                  setReservationPreset(preset);
                  setReservationView('ticket');
                  setActiveTab('reservation');
                }}
              />
            </LazyBoundary>
          </div>
        )}

        {/* Tab 3: 時刻表 */}
        {activeTab === 'timetable' && (
          <LazyBoundary fallback={<TabFallback />}>
            <TimetableTab />
          </LazyBoundary>
        )}

        {/* Tab 4: 予約(特急券・座席 / デリバリー) */}
        {activeTab === 'reservation' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-28 md:pb-12">
            <div className="max-w-md mx-auto px-4">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E2EE]" role="tablist" aria-label="予約の種類">
                {([
                  ['ticket', '特急券・座席'],
                  ['delivery', 'デリバリー'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={reservationView === id}
                    onClick={() => setReservationView(id)}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      reservationView === id ? 'bg-white text-[#5B21B6] shadow-xs' : 'text-[#6B6380] hover:text-[#221C35]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <LazyBoundary fallback={<TabFallback />}>
              {reservationView === 'ticket' ? (
                <ReservationTab
                  preset={reservationPreset}
                  activeOrder={activeOrder}
                  onOpenDeliveryCatalog={() => setReservationView('delivery')}
                  onConfirmOrder={handleConfirmOrder}
                  onCancelOrder={handleCancelOrder}
                  isLoggedIn={isLoggedIn}
                  onRequireLogin={handleRequireLogin}
                  onCouponUsed={cloudOn ? cloud.markCouponUsed : undefined}
                  pointBalance={cloudOn && cloud.ready && !cloud.error ? shownBalance : undefined}
                  onSpendPoints={cloudOn && cloud.ready && !cloud.error ? cloud.spendPoints : undefined}
                />
              ) : (
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
              )}
            </LazyBoundary>
          </div>
        )}

        {/* イベント */}
        {activeTab === 'events' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12">
            <LazyBoundary fallback={<TabFallback />}>
              {cloudOn && !cloud.ready ? (
                <div className="text-center text-xs text-[#857D99] py-10">読み込み中…</div>
              ) : (
                <EventsTab
                  onAddNPoints={(points, title, type) => addEventRewardOnce(points, title, type || 'stamp')}
                  isLoggedIn={isLoggedIn}
                  onRequireLogin={handleRequireLogin}
                  cloudMode={cloudOn}
                />
              )}
            </LazyBoundary>
          </div>
        )}

        {/* 設定(下のタブには出さず、ヘッダーのメニューから開く) */}
        {activeTab === 'settings' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12">
            <LazyBoundary fallback={<TabFallback />}>
              <SettingsTab
                nPointBalance={shownBalance}
                registeredStations={registeredStations}
                onUpdateRegisteredStations={setRegisteredStations}
                onOpenNPointModal={() => setIsNPointModalOpen(true)}
                activeOrder={activeOrder}
                isLoggedIn={isLoggedIn}
                currentUser={shownUser}
                onLoginClick={() => {
                  setLoginReason('神埼IDでログインまたは新規会員登録を行います。');
                  setPendingAction(null);
                  setIsLoginModalOpen(true);
                }}
                onLogout={handleLogout}
                onOpenMyPage={() => setIsMyPageOpen(true)}
              />
            </LazyBoundary>
          </div>
        )}
      </main>

      {/* 5. フッターナビゲーション（タブバー: ホーム, 列車位置, 時刻表, 予約, イベント） */}
      <FooterNav
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        hasActiveOrder={!!activeOrder}
      />

      {/* NIZAKI 2.0 公開後だけ: 初めての案内と、公開記念ポイントの受け取り */}
      <LaunchWelcome
        cloudOn={cloudOn}
        ready={cloud.ready}
        error={cloud.error}
        claimedEvents={cloud.account?.claimedEvents}
        isLoggedIn={isLoggedIn}
        onClaim={() => cloud.earnEvent(LAUNCH_BONUS_ID)}
        onStep={handleWelcomeStep}
        onLogin={() => {
          setLoginReason('神埼IDでログインまたは新規会員登録を行います。');
          setPendingAction(null);
          setIsLoginModalOpen(true);
        }}
        loginOpen={isLoginModalOpen}
        replayKey={welcomeReplayKey}
      />

      <MenuDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        isLoggedIn={isLoggedIn}
        currentUser={currentUser}
        onOpenSettings={() => setActiveTab('settings')}
        onOpenMyPage={() => setIsMyPageOpen(true)}
        onOpenNPoint={() => setIsNPointModalOpen(true)}
        onOpenRouteMap={() => setIsRouteMapModalOpen(true)}
        onOpenLogin={() => {
          setLoginReason('神埼IDでログインまたは新規会員登録を行います。');
          setPendingAction(null);
          setIsLoginModalOpen(true);
        }}
        onOpenGuide={isLaunched() ? () => setWelcomeReplayKey((k) => k + 1) : undefined}
      />

      {/* Interactive Modals */}
      <LazyOnOpen open={isEDeliveryModalOpen}>
        <EDeliveryModal
          isOpen={isEDeliveryModalOpen}
          onClose={() => setIsEDeliveryModalOpen(false)}
          onFinish={() => setReservationView('ticket')}
          equipItems={MOCK_EQUIP_ITEMS}
          onConfirmOrder={handleConfirmOrder}
          initialCart={selectedCart}
          onCartChange={setSelectedCart}
          activeOrder={activeOrder}
          isLoggedIn={isLoggedIn}
          onRequireLogin={handleRequireLogin}
          isCouponUsed={isDeliveryCouponUsed}
          onCouponUsed={markDeliveryCouponUsed}
          pointBalance={cloudOn && cloud.ready && !cloud.error ? shownBalance : undefined}
          onSpendPoints={cloudOn && cloud.ready && !cloud.error ? cloud.spendPoints : undefined}
        />
      </LazyOnOpen>

      <LazyOnOpen open={isLoginModalOpen}>
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => {
            setIsLoginModalOpen(false);
            setPendingAction(null);
          }}
          onLogin={handleLogin}
          reason={loginReason}
        />
      </LazyOnOpen>

      <LazyOnOpen open={isMyPageOpen}>
        <MyPageModal
          isOpen={isMyPageOpen}
          onClose={() => setIsMyPageOpen(false)}
          currentUser={shownUser}
          balance={shownBalance}
          pointHistory={shownPointHistory}
          activeOrder={activeOrder}
          orderHistory={shownOrderHistory}
          hideDeleteAccount={demoOn}
          cloudMode={cloudOn}
          mileage={mileage}
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
      </LazyOnOpen>

      <LazyOnOpen open={isNPointModalOpen}>
        <NPointModal
          isOpen={isNPointModalOpen}
          onClose={() => setIsNPointModalOpen(false)}
          balance={shownBalance}
          pointHistory={shownPointHistory}
          currentUser={shownUser}
          onRedeemCode={redeemPointCode}
        />
      </LazyOnOpen>

      <LazyOnOpen open={isRouteMapModalOpen}>
        <RouteMapModal
          isOpen={isRouteMapModalOpen}
          onClose={() => setIsRouteMapModalOpen(false)}
        />
      </LazyOnOpen>

      <LazyOnOpen open={isQRCodeModalOpen}>
        <QRCodeModal
          isOpen={isQRCodeModalOpen}
          onClose={() => setIsQRCodeModalOpen(false)}
          activeOrder={activeOrder}
        />
      </LazyOnOpen>
    </PhoneContainer>
  );
}
