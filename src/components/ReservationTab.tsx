import React, { useState } from 'react';
import {
  Ticket,
  Calendar,
  Users,
  ChevronRight,
  Armchair,
  CheckCircle2,
  UtensilsCrossed,
  Clock,
  MapPin,
  AlertCircle,
  Plus,
  Trash2,
  ArrowRight,
  AlertTriangle,
  X,
  CreditCard,
  ShieldAlert,
  Tag,
  Check,
  Lock,
  QrCode,
} from 'lucide-react';
import { ActiveOrder, EquipItem } from '../types';
import { getSeatClassLabel, getSeatClassRibbon, canUseDelivery, MAX_SEATS, freeSeatNo, hasSeatList, seatCountOf, seatLabel, formatSeats } from '../utils/seatUtils';
import { DeliverySeatList, SeatList } from './SeatList';
import { MOCK_EQUIP_ITEMS } from '../data/mockData';
import { SeatSelectionModal } from './SeatSelectionModal';
import { NPointPayRow } from './NPointPayRow';
import { getLocalDateString } from '../utils/orderExpiry';
import {
  EXPRESS_TYPES,
  ExpressTrip,
  findExpressTrips,
  getExpressStations,
  getTripDistanceKm,
  loadExpressData,
  getCachedExpressData,
} from '../utils/diaTimetable';
import { isLaunched } from '../utils/launch';
import { TicketSummary, ticketBadgeLabel } from '../utils/ticketApi';
import { calculateFare } from '../utils/fare';
import { CompletionModal } from './CompletionModal';

// 列車位置の特急の詳細から、予約画面を、その列車を選んだ状態で開くための指定(公開後だけ。key が変わるたびに適用する)
export interface ReservationPreset {
  key: number;
  expressType: 'ayami' | 'nliner' | 'meguri';
  boarding?: string; // 駅名(「駅」なし)
  destination?: string;
  trainCode: string;
}

interface ReservationTabProps {
  preset?: ReservationPreset | null;
  activeOrder: ActiveOrder | null;
  onOpenDeliveryCatalog: () => void;
  onConfirmOrder: (order: ActiveOrder) => void;
  onCancelOrder: () => void;
  isLoggedIn?: boolean;
  onRequireLogin?: (reason: string, onLoggedIn?: () => void) => void;
  // クーポンを使ったとき(公開後、クラウドが基準の会員が、使用済みをサーバーへ送るため)
  onCouponUsed?: (code: string) => void;
  // N-POINT で払う(1pt=1円。公開後で、クラウドが基準の会員だけ。渡されなければ、使う欄を出さない)
  pointBalance?: number;
  onSpendPoints?: (orderId: string, points: number, title: string) => Promise<{ ok: boolean; message: string }>;
  // QR乗車券を開く(公開後で、ログイン証のある会員だけ。渡されなければ、ボタンを出さない)
  onOpenQRCode?: () => void;
  // QR乗車券の状態(公開後。全席が利用済み、または一部だけ利用済みのときに、予約カードに札を出す)
  ticketSummary?: TicketSummary | null;
}

export const ReservationTab: React.FC<ReservationTabProps> = ({
  preset,
  activeOrder,
  onOpenDeliveryCatalog,
  onConfirmOrder,
  onCancelOrder,
  isLoggedIn = false,
  onRequireLogin,
  onCouponUsed,
  pointBalance,
  onSpendPoints,
  onOpenQRCode,
  ticketSummary,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  // N-POINT で払うか / ポイントを引いているあいだ / うまくいかなかったときの理由
  const [usePoints, setUsePoints] = useState(false);
  const [pointsAmount, setPointsAmount] = useState(0); // 使うポイント(1pt=1円)
  const [spending, setSpending] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);
  const canUsePoints = !!onSpendPoints && (pointBalance ?? 0) > 0;
  // Express Train Selection in E-Quick Service
  const [expressType, setExpressType] = useState<'ayami' | 'nliner' | 'meguri'>('ayami');

  // 駅の一覧・時刻・営業キロは、全駅ダイヤ(小分けJSON)から取る
  const expressConfig = EXPRESS_TYPES[expressType];
  const [diaTick, setDiaTick] = useState(0);
  const [diaError, setDiaError] = useState(false);
  const [diaRetry, setDiaRetry] = useState(0);
  // 直通の特急(公開後の特急めぐり)は、2つの路線をつないだデータ(東京〜日立)
  const lineData = getCachedExpressData(expressType);

  React.useEffect(() => {
    if (getCachedExpressData(expressType)) {
      setDiaError(false);
      return;
    }
    let alive = true;
    setDiaError(false);
    loadExpressData(expressType)
      .then(() => {
        if (alive) setDiaTick((t) => t + 1);
      })
      .catch(() => {
        if (alive) setDiaError(true);
      });
    return () => {
      alive = false;
    };
  }, [expressType, diaRetry]);

  const stripEki = (name: string) => name.replace(/駅$/, '');

  // Form State for new booking when not reserved
  const [boardingStation, setBoardingStation] = useState('東京駅');
  const [destinationStation, setDestinationStation] = useState('大宮駅');
  const [selectedTrainCode, setSelectedTrainCode] = useState<string>('');

  // 特急の詳細から開かれたとき: 特急の種類・乗る駅・降りる駅・列車を、その列車に合わせる
  React.useEffect(() => {
    if (!preset) return;
    setExpressType(preset.expressType);
    setSeatType(preset.expressType === 'meguri' ? 'megu' : 'reserved');
    if (preset.boarding && preset.destination) {
      setBoardingStation(`${preset.boarding}駅`);
      setDestinationStation(`${preset.destination}駅`);
    }
    setSelectedTrainCode(preset.trainCode);
  }, [preset?.key]);

  // 駅の選択肢(ダイヤの読み込み前は、いまの選択だけ)
  const currentStationList: string[] = lineData
    ? getExpressStations(lineData, expressConfig.typeName).map((n) => `${n}駅`)
    : [boardingStation, destinationStation];
  const [seatType, setSeatType] = useState<'standard' | 'reserved' | 'green' | 'premium' | 'megu'>('reserved');
  // 席の数(=人数。公開後だけ複数)。指定席は座席選択で選んだ席の数、自由席は人数のボタンで決める。運賃・特急料金・クーポン割引は、この人数ぶん
  const [seatCount, setSeatCount] = useState(1);
  const maxSeats = isLaunched() ? MAX_SEATS : 1;
  React.useEffect(() => setSeatCount(1), [seatType]);

  // Coupon Code State
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string; type?: 'ayami300' } | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 端末（localStorage）の使用済みクーポンリスト取得
  const getUsedCoupons = (): string[] => {
    try {
      const stored = localStorage.getItem('kanzaki_used_coupons');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  // 端末（localStorage）に使用済みクーポンを追加記録
  const recordCouponUsage = (code: string) => {
    try {
      const compact = code.replace(/\s+/g, '').toUpperCase();
      const current = getUsedCoupons();
      if (!current.includes(compact)) {
        current.push(compact);
        localStorage.setItem('kanzaki_used_coupons', JSON.stringify(current));
        onCouponUsed?.(compact);
      }
    } catch (e) {
      console.error('Failed to save used coupon:', e);
    }
  };

  const handleApplyCoupon = () => {
    const raw = couponInput.trim();
    if (!raw) return;

    // 全角スペース半角化・スペース詰めの正規化コード判定
    const normalized = raw.replace(/　/g, ' ').replace(/\s+/g, ' ').toUpperCase();
    const compactCode = normalized.replace(/\s+/g, '');

    // 別名コードも含め、まずクーポン本体(正規コード)を特定する
    let coupon: { code: string; label: string; type: 'ayami300'; successText: string } | null = null;
    if (compactCode === 'AYAMI300') {
      coupon = { code: 'AYAMI 300', label: '特急あやみ 普通指定席 300円引き', type: 'ayami300', successText: 'クーポンを適用しました。' };
    }

    if (!coupon) {
      setCouponMessage({ type: 'error', text: '無効なクーポンコードです。' });
      return;
    }

    // 使用済み判定は正規コードで行う(別名コードでの再利用を防ぐ)
    const usedList = getUsedCoupons();
    if (usedList.includes(coupon.code.replace(/\s+/g, '').toUpperCase())) {
      setCouponMessage({
        type: 'error',
        text: 'このクーポンコードは既に使用済みのためご利用いただけません。',
      });
      return;
    }

    setAppliedCoupon({ code: coupon.code, label: coupon.label, type: coupon.type });
    setCouponMessage({ type: 'success', text: coupon.successText });
    setCouponInput('');
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponMessage(null);
  };

  // 乗車駅・降車駅から、乗れる特急を求める
  const bIndex = currentStationList.indexOf(boardingStation);
  const trips: ExpressTrip[] = lineData
    ? findExpressTrips(lineData, expressConfig.typeName, stripEki(boardingStation), stripEki(destinationStation))
    : [];

  // Train Switcher Effect
  const handleExpressTypeChange = (type: 'ayami' | 'nliner' | 'meguri') => {
    setExpressType(type);
    if (type === 'ayami') {
      setBoardingStation('東京駅');
      setDestinationStation('大宮駅');
      setSeatType('reserved');
    } else if (type === 'nliner') {
      setBoardingStation('東京駅');
      setDestinationStation('横浜駅');
      setSeatType('reserved'); // Nライナーは普通指定席のみ
    } else {
      setBoardingStation(isLaunched() ? '東京駅' : '松戸駅'); // 公開後は、東京〜日立で通しの特急めぐり
      setDestinationStation('日立駅');
      setSeatType('megu');
    }
    setSelectedTrainCode('');
  };

  // 乗車駅変更時の自動補正
  const handleBoardingStationChange = (newBoarding: string) => {
    setBoardingStation(newBoarding);
    const bIdx = currentStationList.indexOf(newBoarding);
    if (bIdx !== -1) {
      const nextAvailable = currentStationList.filter((s, idx) => idx !== bIdx);
      if (nextAvailable.length > 0 && (!destinationStation || destinationStation === newBoarding)) {
        setDestinationStation(nextAvailable[0]);
      }
    }
  };

  // 降車駅の選択肢を取得
  const destinationOptions = currentStationList.filter((s, idx) => idx !== bIndex);

  // 現在時刻(HH:mm)に基づく運休・終了判定
  const [nowDate, setNowDate] = React.useState<Date>(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const currentMinutesFromMidnight = nowDate.getHours() * 60 + nowDate.getMinutes();

  // 列車が発車5分前または過去（予約不可）かどうかの判定
  const isTrainEnded = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    const trainMin = h * 60 + m;
    // 発車5分前（発車時刻 - 5分）を過ぎた場合は予約不可
    return currentMinutesFromMidnight >= trainMin - 5;
  };

  const availableTrains = trips;

  // 過去になっていない（予約可能）列車の中で最も早いものを初期選択
  React.useEffect(() => {
    // 選択中の列車がまだ予約可能なら、ユーザーの選択を維持する
    const selected = availableTrains.find((t) => t.code === selectedTrainCode);
    if (selected && !isTrainEnded(selected.depTime)) return;

    const activeValidTrain = availableTrains.find((t) => !isTrainEnded(t.depTime));
    if (activeValidTrain) {
      setSelectedTrainCode(activeValidTrain.code);
    } else if (availableTrains.length > 0) {
      setSelectedTrainCode(availableTrains[0].code);
    } else {
      setSelectedTrainCode('');
    }
  }, [expressType, boardingStation, destinationStation, diaTick, currentMinutesFromMidnight]);

  const currentTrainInfo: ExpressTrip | undefined =
    availableTrains.find((t) => t.code === selectedTrainCode) || availableTrains[0];
  const isCurrentTrainEnded = currentTrainInfo ? isTrainEnded(currentTrainInfo.depTime) : true;
  const isAllTrainsEnded = availableTrains.every((t) => isTrainEnded(t.depTime));

  // Seat Selection Modal State
  const [isSeatSelectionModalOpen, setIsSeatSelectionModalOpen] = useState(false);

  // Success Notification Modal State
  const [showBookingSuccessModal, setShowBookingSuccessModal] = useState(false);

  // Safety Confirmation Modal State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [showCancelSuccessNotice, setShowCancelSuccessNotice] = useState(false);

  // Execute Cancellation Action
  const handleExecuteCancellation = () => {
    setIsCancelModalOpen(false);
    onCancelOrder();
    setShowCancelSuccessNotice(true);
    setTimeout(() => setShowCancelSuccessNotice(false), 6000);
  };

  // 出発・到着時刻(HH:mm)から乗車時間(分)を求める(日またぎにも対応)
  const minutesBetween = (dep?: string, arr?: string): number | null => {
    if (!dep || !arr) return null;
    const [h1, m1] = dep.split(':').map(Number);
    const [h2, m2] = arr.split(':').map(Number);
    if ([h1, m1, h2, m2].some(Number.isNaN)) return null;
    const diff = h2 * 60 + m2 - (h1 * 60 + m1);
    return diff >= 0 ? diff : diff + 24 * 60;
  };

  // 乗車区間の営業キロ(ダイヤの駅間距離から)
  const calculateDistance = (start: string, end: string) =>
    lineData ? getTripDistanceKm(lineData, stripEki(start), stripEki(end)) : 0;

  // 座席料金・普通運賃計算ヘルパー
  const calculateTicketPrice = (count: number = seatCount) => {
    const dist = calculateDistance(boardingStation, destinationStation);
    const baseFare = calculateFare(dist);

    // 乗車運賃（※IC割引は廃止）
    let initialFare = dist > 0 ? baseFare : 0;
    let fareDiscount = 0;

    let baseExpressFee = 1150;
    if (expressType === 'ayami') {
      if (seatType === 'standard') baseExpressFee = 750; // 自由席
      else if (seatType === 'reserved') baseExpressFee = 1150; // 普通車指定席
      else if (seatType === 'green') baseExpressFee = 2200; // あやみ+
    } else if (expressType === 'nliner') {
      baseExpressFee = 1250; // 普通指定席のみ
    } else {
      if (seatType === 'megu') baseExpressFee = 2050; // めぐシート
      else baseExpressFee = 1250; // 普通指定席
    }

    // クーポン割引判定
    let expressDiscount = 0;
    if (appliedCoupon) {
      const compactCode = appliedCoupon.code.replace(/\s+/g, '').toUpperCase();
      if (compactCode === 'AYAMI300' || appliedCoupon.type === 'ayami300') {
        if (expressType === 'ayami' && seatType === 'reserved') {
          expressDiscount = 300;
        }
      }
    }

    const fare = Math.max(0, initialFare - fareDiscount);
    const expressFee = Math.max(0, baseExpressFee - expressDiscount);

    return {
      dist: Math.round(dist * 10) / 10,
      baseFare,
      initialFare,
      fareDiscount,
      fare,
      baseExpressFee,
      expressDiscount,
      expressFee,
      count,
      total: (fare + expressFee) * count, // 運賃・特急料金・クーポン割引は、人数ぶん
    };
  };

  // 席の数(人数)を変える。N-POINTを上限まで使う設定のときは、新しい合計に合わせる
  const changeSeatCount = (n: number) => {
    if (usePoints && canUsePoints && pointsAmount >= Math.min(pointBalance ?? 0, calculateTicketPrice(seatCount).total)) {
      setPointsAmount(Math.min(pointBalance ?? 0, calculateTicketPrice(n).total));
    }
    setSeatCount(n);
  };

  // Open Seat Selection Modal or Direct Booking for Unreserved Seat
  const handleBookingClick = () => {
    if (isCurrentTrainEnded || isAllTrainsEnded) {
      return;
    }
    if (!isLoggedIn && onRequireLogin) {
      onRequireLogin('特急券の予約・座席指定を確定するには、神埼IDログインが必要です。', () => {
        if (seatType === 'standard') {
          handleConfirmSeatSelection({
            carNo: 6,
            seatNo: freeSeatNo(seatCount),
            isSpecialCar: false,
            specialCarFee: 0,
          });
        } else {
          setIsSeatSelectionModalOpen(true);
        }
      });
      return;
    }
    // 自由席は座席選択モーダルを開かずにそのまま予約（6号車 自由席）
    if (seatType === 'standard') {
      handleConfirmSeatSelection({
        carNo: 6,
        seatNo: freeSeatNo(seatCount),
        isSpecialCar: false,
        specialCarFee: 0,
      });
    } else {
      setIsSeatSelectionModalOpen(true);
    }
  };

  // Confirm Seat Selection Handler
  const handleConfirmSeatSelection = async ({
    carNo,
    seatNo,
    isSpecialCar,
    specialCarFee,
  }: {
    carNo: number;
    seatNo: string;
    isSpecialCar: boolean;
    specialCarFee: number;
  }) => {
    if (isCurrentTrainEnded || isAllTrainsEnded || !currentTrainInfo || spending) {
      return;
    }

    const items: { item: EquipItem; quantity: number }[] = [];
    const prices = calculateTicketPrice(Math.min(seatCountOf(seatNo), maxSeats));
    const arrivalTime = currentTrainInfo.arrTime;
    const trainName = currentTrainInfo.trainName;

    const finalTotalPrice = prices.total + (isSpecialCar ? specialCarFee : 0);
    const orderId = `EQ-${Math.floor(10000 + Math.random() * 90000)}`;

    // N-POINT で払うときは、予約を確定する前に、サーバーでポイントを引く(引けなければ、予約しない)
    const pointsUsed = usePoints && canUsePoints && onSpendPoints ? Math.min(pointsAmount, pointBalance ?? 0, finalTotalPrice) : 0;
    if (pointsUsed > 0 && onSpendPoints) {
      setSpending(true);
      setSpendError(null);
      const r = await onSpendPoints(orderId, pointsUsed, `${trainName} 特急券・座席のお支払い`);
      setSpending(false);
      if (!r.ok) {
        setSpendError(r.message || 'N-POINTを使えませんでした。もう一度お試しください。');
        return;
      }
    }

    const newOrder: ActiveOrder = {
      orderId,
      trainName,
      carNo,
      seatNo,
      seatType,
      boardingStation,
      destinationStation,
      departureTime: currentTrainInfo.depTime,
      arrivalTime,
      reservedDate: getLocalDateString(),
      items,
      totalPrice: finalTotalPrice - pointsUsed,
      ...(pointsUsed > 0 ? { pointsUsed } : {}),
      status: 'confirmed',
      estimatedDeliveryTime: `${boardingStation.replace('駅', '')}駅発車後 5分頃`,
      deliveryStation: boardingStation,
    };

    // クーポンが実際に割引として使われた場合のみ、端末で使用済みとして記録(割引がなければ消費しない)
    if (appliedCoupon) {
      if (prices.fareDiscount > 0 || prices.expressDiscount > 0) {
        recordCouponUsage(appliedCoupon.code);
      }
      setAppliedCoupon(null);
    }

    setUsePoints(false);
    setSeatCount(1);
    onConfirmOrder(newOrder);
    setShowBookingSuccessModal(true);
  };

  return (
    <div className="space-y-4 text-[#221C35] max-w-md mx-auto p-4 pb-20 animate-fadeIn">
      {/* Title Header */}
      {/* 公開後は、上の切り替えに「特急券・座席」とあるので、見出しは出さない(「予約済み」の札だけ残す) */}
      {(!isLaunched() || activeOrder) && (
        <div className="flex items-center justify-between">
          {!isLaunched() ? (
            <h2 className="text-base font-bold text-[#221C35] flex items-center gap-2">
              <Ticket className="w-5 h-5 text-[#5B21B6]" />
              <span>特急券・座席指定予約</span>
            </h2>
          ) : (
            <span />
          )}
          {activeOrder && (
            <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>予約済み</span>
            </span>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. 予約済みの場合の表示 (出発時刻 & デリバリー予定の弁当表示欄)
         ───────────────────────────────────────────────────────────── */}
      {activeOrder ? (
        <div className="space-y-3.5">
          {/* Main Reserved Train & Departure Info Card */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#5B21B6]/30 space-y-4 relative overflow-hidden">
            {/* Background Accent Decorative Ribbon */}
            <div className="absolute top-0 right-0 bg-gradient-to-l from-[#5B21B6] to-[#7C3AED] text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl shadow-xs">
              {getSeatClassRibbon(activeOrder.seatType)}
            </div>

            <div className="pt-1">
              <div className="text-[10px] text-[#6B6380] font-bold flex items-center gap-1.5">
                <span>予約コード:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(activeOrder.orderId);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="font-mono font-black text-[#5B21B6] bg-[#EFE8FA] hover:bg-[#E0D5F5] px-2 py-0.5 rounded border border-[#DDD6FE] cursor-pointer transition-all inline-flex items-center gap-1"
                  title="タップでコピーしてLINEに送信"
                >
                  <span>{activeOrder.orderId}</span>
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="text-[9px] text-[#6B6380] font-normal">コピー</span>}
                </button>
                {onOpenQRCode && (
                  <button
                    type="button"
                    onClick={onOpenQRCode}
                    className="ml-auto font-black text-[#5B21B6] bg-[#EFE8FA] hover:bg-[#E0D5F5] px-2 py-0.5 rounded border border-[#DDD6FE] cursor-pointer transition-all inline-flex items-center gap-1"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>QR乗車券</span>
                  </button>
                )}
              </div>
              <h3 className="text-base font-black text-[#5B21B6] flex items-center gap-1.5 mt-0.5">
                <Armchair className="w-5 h-5 text-[#5B21B6]" />
                <span>{activeOrder.trainName}</span>
                {ticketBadgeLabel(ticketSummary) && (
                  <span className="text-[10px] font-extrabold text-[#6B6380] bg-[#F4F3F8] border border-[#E6E2EE] px-2 py-0.5 rounded-md">
                    {ticketBadgeLabel(ticketSummary)}
                  </span>
                )}
              </h3>
            </div>

            {/* Departure & Arrival Time Board */}
            <div className="bg-[#F6F4FA] p-3.5 rounded-xl border border-[#E0D7F3] space-y-2">
              <div className="text-[11px] text-[#6B6380] font-bold flex items-center justify-between">
                <span>ご乗車区間・時刻</span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                {/* Boarding Station & Departure Time */}
                <div className="text-left">
                  <div className="text-xs text-[#6B6380]">乗車駅</div>
                  <div className="text-base font-black text-[#221C35]">{activeOrder.boardingStation || activeOrder.deliveryStation || '—'}</div>
                  <div className="text-xs font-black text-[#5B21B6] flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#5B21B6]" />
                    <span>出発時刻 {activeOrder.departureTime || '—'}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] text-[#857D99] font-bold">
                    {minutesBetween(activeOrder.departureTime, activeOrder.arrivalTime) ?? '—'}分
                  </span>
                  <ArrowRight className="w-5 h-5 text-[#5B21B6]" />
                </div>

                {/* Destination Station */}
                <div className="text-right">
                  <div className="text-xs text-[#6B6380]">降車駅</div>
                  <div className="text-base font-black text-[#221C35]">{activeOrder.destinationStation || '—'}</div>
                  <div className="text-xs font-bold text-[#6B6380] mt-0.5">
                    到着 {activeOrder.arrivalTime || '—'}
                  </div>
                </div>
              </div>

              {/* Car & Seat Number */}
              <div className="pt-2 border-t border-[#E6E2EE] flex items-start justify-between gap-3 text-xs">
                <span className="text-[#6B6380] font-medium py-1">ご着席位置</span>
                {hasSeatList(activeOrder.seatNo) ? (
                  <div className="min-w-0 flex flex-col items-end gap-1">
                    <span className="font-extrabold text-[#221C35]">
                      {activeOrder.carNo}号車 ({getSeatClassLabel(activeOrder.seatType)})
                    </span>
                    <SeatList seatNo={activeOrder.seatNo} className="justify-end" />
                  </div>
                ) : (
                  <span className="font-extrabold text-[#221C35] bg-white px-2.5 py-1 rounded-lg border border-[#D1C9E3] min-w-0 break-words">
                    {activeOrder.carNo}号車 ({getSeatClassLabel(activeOrder.seatType)}) {formatSeats(activeOrder.seatNo)}
                    {seatCountOf(activeOrder.seatNo) === 1 && '（窓側）'}
                  </span>
                )}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                2. デリバリー予定のお弁当・商品表示欄
               ───────────────────────────────────────────────────────────── */}
            {canUseDelivery(activeOrder.seatType) ? (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-[#221C35] flex items-center gap-1.5">
                  <UtensilsCrossed className="w-4 h-4 text-[#5B21B6]" />
                  <span>デリバリー予定のお弁当・商品</span>
                </h4>
                <span className="text-[10px] text-[#5B21B6] font-bold bg-[#EFE8FA] px-2 py-0.5 rounded border border-[#5B21B6]/20">
                  {activeOrder.estimatedDeliveryTime}お届け
                </span>
              </div>

              {activeOrder.items && activeOrder.items.length > 0 ? (
                <div className="space-y-2">
                  {activeOrder.items.map(({ item, quantity }) => (
                    <div
                      key={item.id}
                      className="bg-[#F9F8FD] p-2.5 rounded-xl border border-[#E6E2EE] flex items-center justify-between gap-2.5"
                    >
                      <img
                        src={item.image}
                        width={640}
                        height={349}
                        loading="lazy"
                        decoding="async"
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 object-cover rounded-lg shrink-0 border border-[#E6E2EE]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[#221C35] text-xs leading-snug line-clamp-1">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[#6B6380] mt-0.5 flex items-center gap-2">
                          <span>数量: <strong className="text-[#221C35]">{quantity}個</strong></span>
                          <span>¥{(item.price * quantity).toLocaleString()}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg shrink-0">
                        準備中
                      </span>
                    </div>
                  ))}
                  <DeliverySeatList order={activeOrder} className="bg-[#F9F8FD] p-2.5 rounded-xl border border-[#E6E2EE]" />
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#F9F8FD] border border-dashed border-[#D1C9E3] text-center space-y-2">
                  <p className="text-xs text-[#6B6380]">
                    現在、車内デリバリーのお弁当・ドリンクは選択されていません。
                  </p>
                  <button
                    onClick={onOpenDeliveryCatalog}
                    className="text-xs font-bold text-[#5B21B6] bg-[#EFE8FA] hover:bg-[#E0D5F5] border border-[#DDD6FE] px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>お弁当・ドリンクを追加注文する</span>
                  </button>
                </div>
              )}
            </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#F9F8FD] border border-dashed border-[#D1C9E3] text-center text-[11px] text-[#6B6380]">
                車内デリバリーは、めぐシートのお客様専用です
              </div>
            )}

            {/* Action buttons inside Reserved Card */}
            <div className="pt-2 border-t border-[#E6E2EE] flex items-center gap-2">
              {canUseDelivery(activeOrder.seatType) && (
              <button
                onClick={onOpenDeliveryCatalog}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>お弁当・商品を追加変更</span>
              </button>
              )}

              <button
                onClick={() => setIsCancelModalOpen(true)}
                className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                title="予約をキャンセル"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>キャンセル</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 未予約フォーム */
        <div className="space-y-4">
          {/* Success Banner Notice after Cancellation */}
          {showCancelSuccessNotice && (
            <div className="bg-amber-50 border border-amber-300 text-amber-950 p-3.5 rounded-2xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="text-xs font-medium">
                <span className="font-bold text-amber-950 block">予約のキャンセル処理が完了しました</span>
                <span>自己都合キャンセルのため返金はありません。規定により違約金（料金の1.5倍＋各種手数料）が請求されます。</span>
              </div>
            </div>
          )}

          {/* Ticketless Booking Card - Minimal Clean */}
          <div className="bg-white rounded-2xl p-4 shadow-2xs border border-[#E6E2EE] space-y-3.5">
            {/* Train Type Selection */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F4F3F8] rounded-xl">
              <button
                type="button"
                onClick={() => handleExpressTypeChange('ayami')}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  expressType === 'ayami'
                    ? 'bg-[#5B21B6] text-white shadow-2xs'
                    : 'text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                特急あやみ
              </button>

              <button
                type="button"
                onClick={() => handleExpressTypeChange('nliner')}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  expressType === 'nliner'
                    ? 'bg-[#5B21B6] text-white shadow-2xs'
                    : 'text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                Nライナー
              </button>

              <button
                type="button"
                onClick={() => handleExpressTypeChange('meguri')}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  expressType === 'meguri'
                    ? 'bg-[#5B21B6] text-white shadow-2xs'
                    : 'text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                特急めぐり
              </button>
            </div>

            {/* Boarding & Destination Selectors */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#F4F3F8] border border-[#E6E2EE]">
                <div className="text-[10px] text-[#6B6380] font-medium">乗車駅</div>
                <select
                  value={boardingStation}
                  onChange={(e) => handleBoardingStationChange(e.target.value)}
                  className="font-bold text-[#221C35] bg-transparent w-full mt-0.5 focus:outline-none cursor-pointer text-xs"
                >
                  {currentStationList.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-2.5 rounded-xl bg-[#F4F3F8] border border-[#E6E2EE]">
                <div className="text-[10px] text-[#6B6380] font-medium">降車駅</div>
                <select
                  value={destinationStation}
                  onChange={(e) => setDestinationStation(e.target.value)}
                  className="font-bold text-[#221C35] bg-transparent w-full mt-0.5 focus:outline-none cursor-pointer text-xs"
                >
                  {destinationOptions.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Departure Train Selection */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-[#6B6380] font-medium mb-1">
                <span>乗車列車</span>
                {currentTrainInfo && (
                  <span className="text-[10px] font-bold text-[#5B21B6] bg-[#EFE8FA] px-2 py-0.5 rounded border border-[#DDD6FE]">
                    {currentTrainInfo.directionLabel}列車
                  </span>
                )}
              </div>
              <select
                value={currentTrainInfo && !isCurrentTrainEnded ? currentTrainInfo.code : ''}
                onChange={(e) => setSelectedTrainCode(e.target.value)}
                className="w-full bg-[#F4F3F8] border border-[#E6E2EE] rounded-xl px-3 py-2 text-xs font-bold text-[#221C35] cursor-pointer focus:outline-none"
              >
                {availableTrains.every((tr) => isTrainEnded(tr.depTime)) && (
                  <option value="">
                    {diaError
                      ? '時刻表を読み込めませんでした'
                      : !lineData
                      ? '時刻表を読み込み中…'
                      : availableTrains.length === 0
                      ? '該当する列車がありません'
                      : '本日の予約受付は終了しました'}
                  </option>
                )}
                {/* 発車5分前を過ぎた列車は一覧に出さない(特急の本数が多いため) */}
                {availableTrains
                  .filter((tr) => !isTrainEnded(tr.depTime))
                  .map((tr) => (
                    <option key={tr.code} value={tr.code}>
                      {tr.trainName} ({tr.depTime}発 → {tr.arrTime}着)
                    </option>
                  ))}
              </select>
            </div>

            {/* Seat Type Selection */}
            <div>
              <div className="text-[10px] text-[#6B6380] font-medium mb-1">座席種別</div>

              {expressType === 'ayami' && (
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSeatType('standard')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      seatType === 'standard'
                        ? 'bg-[#F4F3F8] border-[#5B21B6] font-bold text-[#5B21B6]'
                        : 'bg-white border-[#E6E2EE] text-[#221C35]'
                    }`}
                  >
                    <div>自由席</div>
                    <div className="text-xs font-mono mt-0.5">¥750</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeatType('reserved')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      seatType === 'reserved'
                        ? 'bg-[#F4F3F8] border-[#5B21B6] font-bold text-[#5B21B6]'
                        : 'bg-white border-[#E6E2EE] text-[#221C35]'
                    }`}
                  >
                    <div>普通指定席</div>
                    <div className="text-xs font-mono mt-0.5">¥1,150</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeatType('green')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      seatType === 'green'
                        ? 'bg-[#F4F3F8] border-[#5B21B6] font-bold text-[#5B21B6]'
                        : 'bg-white border-[#E6E2EE] text-[#221C35]'
                    }`}
                  >
                    <div>あやみ+</div>
                    <div className="text-xs font-mono mt-0.5">¥2,200</div>
                  </button>
                </div>
              )}

              {expressType === 'nliner' && (
                <div className="text-xs">
                  <div className="p-2.5 rounded-xl border border-[#5B21B6] bg-[#F4F3F8] text-center font-bold text-[#5B21B6]">
                    <div>普通指定席 (固定)</div>
                    <div className="text-xs font-mono mt-0.5">¥1,250</div>
                  </div>
                </div>
              )}

              {expressType === 'meguri' && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSeatType('reserved')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      seatType === 'reserved'
                        ? 'bg-[#F4F3F8] border-[#5B21B6] font-bold text-[#5B21B6]'
                        : 'bg-white border-[#E6E2EE] text-[#221C35]'
                    }`}
                  >
                    <div>普通指定席</div>
                    <div className="text-xs font-mono mt-0.5">¥1,250</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeatType('megu')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      seatType === 'megu'
                        ? 'bg-[#F4F3F8] border-[#5B21B6] font-bold text-[#5B21B6]'
                        : 'bg-white border-[#E6E2EE] text-[#221C35]'
                    }`}
                  >
                    <div>めぐシート</div>
                    <div className="text-xs font-mono mt-0.5">¥2,050</div>
                  </button>
                </div>
              )}
            </div>

            {/* 自由席の人数(公開後。指定席は、座席選択で選んだ席の数が人数になる) */}
            {isLaunched() && seatType === 'standard' && (
              <div className="flex items-center justify-between rounded-xl bg-[#F4F3F8] border border-[#E6E2EE] px-3 py-2">
                <span className="text-xs font-bold text-[#221C35]">人数</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="人数を減らす"
                    disabled={seatCount <= 1}
                    onClick={() => changeSeatCount(seatCount - 1)}
                    className="w-8 h-8 rounded-lg bg-white border border-[#D1C9E3] text-[#5B21B6] font-black disabled:opacity-40 cursor-pointer"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-black font-mono text-[#221C35]">{seatCount}</span>
                  <button
                    type="button"
                    aria-label="人数を増やす"
                    disabled={seatCount >= MAX_SEATS}
                    onClick={() => changeSeatCount(seatCount + 1)}
                    className="w-8 h-8 rounded-lg bg-white border border-[#D1C9E3] text-[#5B21B6] font-black disabled:opacity-40 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* クーポンコード入力セクション（UIを阻害しないコンパクトなデザイン） */}
            <div className="pt-2 border-t border-[#E6E2EE] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#6B6380] font-medium flex items-center gap-1">
                  <Tag className="w-3 h-3 text-[#5B21B6]" />
                  <span>クーポンコード</span>
                </span>
                {appliedCoupon && (
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    適用中
                  </span>
                )}
              </div>

              {appliedCoupon ? (
                <div className="bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-emerald-900 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{appliedCoupon.code}</span>
                    </div>
                    <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                      {appliedCoupon.label}
                      {appliedCoupon.code.includes('AYAMI') && (
                        expressType === 'ayami' && seatType === 'reserved' ? (
                          <span className="font-bold ml-1 text-emerald-800">(特急料金 1,150円 → 850円)</span>
                        ) : (
                          <span className="font-bold ml-1 text-amber-700 block mt-0.5">
                            ※「特急あやみ 普通指定席」選択時に300円引き適用
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-all cursor-pointer text-xs font-bold shrink-0"
                    title="クーポン解除"
                  >
                    解除
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value);
                        if (couponMessage) setCouponMessage(null);
                      }}
                      placeholder="クーポンコードを入力"
                      className="flex-1 bg-[#F4F3F8] border border-[#E6E2EE] rounded-xl px-3 py-1.5 text-xs font-mono font-medium text-[#221C35] focus:outline-none focus:border-[#5B21B6] placeholder:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      className="bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs"
                    >
                      適用
                    </button>
                  </div>
                  {couponMessage && (
                    <div
                      className={`text-[10px] font-bold px-1 ${
                        couponMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {couponMessage.text}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Price Breakdown & Total Price */}
            {(() => {
              const priceInfo = calculateTicketPrice();
              const pointsMax = Math.min(pointBalance ?? 0, priceInfo.total);
              const pointsToUse = usePoints && canUsePoints ? Math.min(pointsAmount, pointsMax) : 0;
              return (
                <div className="pt-2 border-t border-[#E6E2EE] space-y-1">
                  {canUsePoints && (
                    <NPointPayRow
                      balance={pointBalance ?? 0}
                      max={pointsMax}
                      on={usePoints}
                      amount={pointsAmount}
                      onToggle={(on) => {
                        setUsePoints(on);
                        if (on) setPointsAmount(pointsMax);
                        setSpendError(null);
                      }}
                      onAmountChange={(n) => {
                        setPointsAmount(n);
                        setSpendError(null);
                      }}
                    />
                  )}
                  <div className="flex items-center justify-between text-[11px] text-[#6B6380]">
                    <div className="flex items-center gap-1">
                      <span>乗車運賃 ({priceInfo.dist}km){priceInfo.count > 1 && ` ×${priceInfo.count}`}</span>
                      {priceInfo.fareDiscount > 0 && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                          クーポン割引 -¥{(priceInfo.fareDiscount * priceInfo.count).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-[#221C35]">
                        {priceInfo.fare === 0 && priceInfo.initialFare > 0 ? (
                          <span className="text-emerald-600 font-black">¥0 (フリーパス無料)</span>
                        ) : (
                          `¥${(priceInfo.fare * priceInfo.count).toLocaleString()}`
                        )}
                      </span>
                      {priceInfo.fareDiscount > 0 && priceInfo.fare > 0 && (
                        <span className="text-[10px] text-gray-400 line-through ml-1.5 font-mono">
                          ¥{(priceInfo.initialFare * priceInfo.count).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#6B6380]">
                    <div className="flex items-center gap-1">
                      <span>特急料金{priceInfo.count > 1 && ` ×${priceInfo.count}`}</span>
                      {priceInfo.expressDiscount > 0 && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                          クーポン割引 -¥{(priceInfo.expressDiscount * priceInfo.count).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-[#221C35]">
                        ¥{(priceInfo.expressFee * priceInfo.count).toLocaleString()}
                      </span>
                      {priceInfo.expressDiscount > 0 && (
                        <span className="text-[10px] text-gray-400 line-through ml-1.5 font-mono">
                          ¥{(priceInfo.baseExpressFee * priceInfo.count).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {pointsToUse > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-[#6B6380]">
                      <span>N-POINT利用</span>
                      <span className="font-mono font-bold text-emerald-600">-¥{pointsToUse.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="pt-1.5 border-t border-[#E6E2EE] flex items-center justify-between">
                    <span className="text-xs text-[#221C35] font-extrabold">お支払い合計</span>
                    <span className="text-xl font-black text-[#5B21B6] font-mono">
                      ¥{(priceInfo.total - pointsToUse).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Warning if train is ended */}
            {diaError && (
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs text-center font-bold flex items-center justify-center gap-2">
                <span>時刻表を読み込めませんでした</span>
                <button
                  type="button"
                  onClick={() => setDiaRetry((n) => n + 1)}
                  className="px-2 py-0.5 rounded bg-[#5B21B6] text-white cursor-pointer"
                >
                  再読み込み
                </button>
              </div>
            )}
            {!diaError && lineData && availableTrains.length === 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs text-center font-bold">
                この区間を走る特急は、ありません
              </div>
            )}
            {spendError && (
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs text-center font-bold" role="alert">
                {spendError}
              </div>
            )}
            {isCurrentTrainEnded && availableTrains.length > 0 && (
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs text-center font-bold">
                発車5分前を過ぎたため予約できません
              </div>
            )}

            {!isLoggedIn && (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>特急券の予約・購入には神埼IDログインが必要です</span>
                </div>
                <button
                  type="button"
                  onClick={() => onRequireLogin?.('特急券の予約・座席指定を確定するには、神埼IDログインが必要です。')}
                  className="text-[#5B21B6] font-bold hover:underline cursor-pointer shrink-0 text-[11px]"
                >
                  ログイン
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleBookingClick}
              disabled={isCurrentTrainEnded || spending}
              className={`w-full font-bold text-xs py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
                isCurrentTrainEnded
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-900 hover:bg-black text-white cursor-pointer shadow-xs'
              }`}
            >
              {seatType === 'standard' ? (
                <Ticket className="w-4 h-4 shrink-0" />
              ) : (
                <Armchair className="w-4 h-4 shrink-0" />
              )}
              <span>
                {isCurrentTrainEnded
                  ? '予約できません'
                  : seatType === 'standard'
                  ? '自由席特急券を予約する'
                  : '座席を選択して特急券を予約する'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Seat Selection Modal */}
      <SeatSelectionModal
        isOpen={isSeatSelectionModalOpen}
        onClose={() => {
          setIsSeatSelectionModalOpen(false);
          changeSeatCount(1);
        }}
        expressType={expressType}
        trainName={currentTrainInfo?.trainName ?? ''}
        departureTime={currentTrainInfo?.depTime ?? ''}
        boardingStation={boardingStation}
        destinationStation={destinationStation}
        initialSeatType={seatType}
        basePrice={calculateTicketPrice().total}
        pointsUsed={usePoints && canUsePoints ? Math.min(pointsAmount, pointBalance ?? 0, calculateTicketPrice().total) : 0}
        maxSeats={maxSeats}
        onSeatCountChange={changeSeatCount}
        onConfirmSeat={handleConfirmSeatSelection}
      />

      {/* ─────────────────────────────────────────────────────────────
          3. 安全対策・キャンセル確認ダイアログ (Modal)
         ───────────────────────────────────────────────────────────── */}
      {isCancelModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-rose-200 relative animate-scaleUp">
            {/* Close Cross Button */}
            <button
              onClick={() => setIsCancelModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-[#6B6380] hover:bg-[#F4F3F8] transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Icon & Warning Title */}
            <div className="flex flex-col items-center text-center pt-2 space-y-1.5">
              <div className="w-12 h-12 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-[#221C35]">
                特急予約・デリバリーのキャンセル
              </h3>
              <p className="text-xs text-[#6B6380] px-2 font-medium">
                本当に特急予約および車内デリバリーをキャンセルしますか？
              </p>
            </div>

            {/* Refund & Fee Calculation Card */}
            <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="text-[11px] font-bold text-rose-900 border-b border-rose-200 pb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>自己都合キャンセル違約金・手数料請求</span>
              </div>

              <div className="space-y-1.5 text-[#221C35]">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-[#6B6380]">ご予約列車・商品小計:</span>
                  <span className="font-bold">¥{(activeOrder.totalPrice + (activeOrder.pointsUsed ?? 0)).toLocaleString()}</span>
                </div>
                {(activeOrder.pointsUsed ?? 0) > 0 && (
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-[#6B6380]">うち N-POINT利用 (戻りません):</span>
                    <span className="font-bold">{(activeOrder.pointsUsed ?? 0).toLocaleString()}pt</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-1 border-t border-rose-200/80 text-rose-900 font-bold text-[11px]">
                  <span>お客様への返金額:</span>
                  <span className="text-rose-700 text-xs font-black">¥0（返金不可）</span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-rose-200/80 font-bold text-rose-950">
                  <span className="flex items-center gap-1">
                    <span>追加徴収違約金 (1.5倍 + 手数料500円):</span>
                  </span>
                  <span className="font-black text-rose-600 text-sm">
                    +¥{(Math.round((activeOrder.totalPrice + (activeOrder.pointsUsed ?? 0)) * 1.5) + 500).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Safety Notice Note */}
            <div className="text-[10px] text-[#857D99] leading-tight space-y-1 bg-[#F9F8FD] p-2.5 rounded-xl border border-[#E6E2EE]">
              <p>・自己都合によるキャンセルのため、購入金額の払い戻しは一切行われません。</p>
              <p>・直前割増キャンセルペナルティとして『元料金の1.5倍＋事務手数料500円』を登録カードより自動引き落としいたします。</p>
            </div>

            {/* Modal Buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleExecuteCancellation}
                className="w-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                <span>
                  違約金を了解してキャンセル (計 ¥
                  {(Math.round((activeOrder.totalPrice + (activeOrder.pointsUsed ?? 0)) * 1.5) + 500).toLocaleString()} 請求)
                </span>
              </button>

              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="w-full bg-[#F4F3F8] hover:bg-[#E6E2EE] text-[#221C35] font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer"
              >
                予約を維持する (戻る)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. 特急券の予約完了
         ───────────────────────────────────────────────────────────── */}
      {showBookingSuccessModal && activeOrder && (
        <CompletionModal
          title="予約しました"
          orderId={activeOrder.orderId}
          buttonLabel="予約内容を確認する"
          onClose={() => setShowBookingSuccessModal(false)}
          secondary={
            onOpenQRCode
              ? {
                  label: 'QR乗車券を表示',
                  onClick: () => {
                    setShowBookingSuccessModal(false);
                    onOpenQRCode();
                  },
                }
              : undefined
          }
          rows={[
            { label: '列車', value: `${activeOrder.trainName} ${activeOrder.departureTime || '—'}発` },
            { label: '区間', value: `${activeOrder.boardingStation || '—'} → ${activeOrder.destinationStation || '—'}` },
            {
              label: '座席',
              value: hasSeatList(activeOrder.seatNo) ? (
                <>
                  <span className="block">
                    {activeOrder.carNo}号車 {getSeatClassLabel(activeOrder.seatType)}
                  </span>
                  <SeatList seatNo={activeOrder.seatNo} className="justify-end mt-1" />
                </>
              ) : (
                seatLabel(activeOrder)
              ),
            },
            ...(activeOrder.items && activeOrder.items.length > 0
              ? [{ label: '車内デリバリー', value: activeOrder.items.map((ci) => ci.item.name).join('、') }]
              : []),
            ...((activeOrder.pointsUsed ?? 0) > 0 && (activeOrder.totalPrice ?? 1) <= 0
              ? [{ label: 'N-POINT', value: `−${(activeOrder.pointsUsed ?? 0).toLocaleString()}pt` }]
              : (activeOrder.earnedPoints ?? 0) > 0
                ? [{ label: 'N-POINT', value: `+${(activeOrder.earnedPoints ?? 0).toLocaleString()}pt` }]
                : []),
          ]}
        />
      )}
    </div>
  );
};
