import React, { useState } from 'react';
import {
  Ticket,
  Calendar,
  Users,
  ChevronRight,
  Sparkles,
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
} from 'lucide-react';
import { ActiveOrder, EquipItem } from '../types';
import { MOCK_EQUIP_ITEMS } from '../data/mockData';
import { SeatSelectionModal } from './SeatSelectionModal';

interface ReservationTabProps {
  activeOrder: ActiveOrder | null;
  onOpenEDeliveryModal: () => void;
  onConfirmOrder: (order: ActiveOrder) => void;
  onCancelOrder: () => void;
  isLoggedIn?: boolean;
  onRequireLogin?: (reason: string, onLoggedIn?: () => void) => void;
}

export const ReservationTab: React.FC<ReservationTabProps> = ({
  activeOrder,
  onOpenEDeliveryModal,
  onConfirmOrder,
  onCancelOrder,
  isLoggedIn = false,
  onRequireLogin,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  // Express Train Selection in E-Quick Service
  const [expressType, setExpressType] = useState<'ayami' | 'nliner' | 'meguri'>('ayami');

  // Station lists per express train
  const AYAMI_STATIONS = ['東京駅', '北千住駅', '松戸駅', '柏駅', '春日部駅', '大宮駅', '池袋駅', '新宿駅'];
  const NLINER_STATIONS = ['東京駅', '大宮駅', '調布駅', '溝の口駅', '新横浜駅', '横浜駅'];
  const MEGURI_STATIONS = ['松戸駅', '柏駅', '土浦駅', 'ひたちなか海浜公園駅', '日立駅'];

  // 各列車ごとの起点駅からの営業キロ（km）マップ
  const AYAMI_KM: Record<string, number> = {
    '東京駅': 0.0,
    '北千住駅': 10.5,
    '松戸駅': 17.8,
    '柏駅': 29.2,
    '春日部駅': 48.1,
    '大宮駅': 65.3,
    '池袋駅': 82.4,
    '新宿駅': 87.2,
  };

  const NLINER_KM: Record<string, number> = {
    '東京駅': 0.0,
    '大宮駅': 30.5,
    '調布駅': 52.1,
    '溝の口駅': 62.8,
    '新横浜駅': 78.4,
    '横浜駅': 85.0,
  };

  const MEGURI_KM: Record<string, number> = {
    '松戸駅': 0.0,
    '柏駅': 11.5,
    '土浦駅': 52.5,
    'ひたちなか海浜公園駅': 111.0,
    '日立駅': 138.0,
  };

  const currentStationList =
    expressType === 'ayami'
      ? AYAMI_STATIONS
      : expressType === 'nliner'
      ? NLINER_STATIONS
      : MEGURI_STATIONS;

  // Form State for new booking when not reserved
  const [boardingStation, setBoardingStation] = useState('東京駅');
  const [destinationStation, setDestinationStation] = useState('大宮駅');
  const [selectedTrainNo, setSelectedTrainNo] = useState<number>(101); // Default train
  const [seatType, setSeatType] = useState<'standard' | 'reserved' | 'green' | 'premium' | 'megu'>('reserved');

  // Coupon Code State
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; label: string; type?: 'ayami300' | 'fare10' | 'freePass' } | null>(null);
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

    // 既に同一端末で使用済みかチェック
    const usedList = getUsedCoupons();
    if (usedList.includes(compactCode)) {
      setCouponMessage({
        type: 'error',
        text: 'このクーポンコードは既に使用済みのためご利用いただけません。',
      });
      return;
    }

    if (compactCode === 'AYAMI300') {
      setAppliedCoupon({ code: 'AYAMI 300', label: '特急あやみ 普通指定席 300円引き', type: 'ayami300' });
      setCouponMessage({
        type: 'success',
        text: 'クーポンを適用しました。',
      });
      setCouponInput('');
    } else if (compactCode === 'KZ-STEP-10' || compactCode === 'KZSTEP10' || compactCode === 'KZ-STEP-500' || compactCode === 'KZSTEP500') {
      setAppliedCoupon({ code: 'KZ-STEP-10', label: '【中級制覇特典】乗車運賃 10%OFF', type: 'fare10' });
      setCouponMessage({
        type: 'success',
        text: '中級制覇クーポン（乗車運賃10%OFF）を適用しました！',
      });
      setCouponInput('');
    } else if (compactCode === 'KZ-DEEP-FREE' || compactCode === 'KZDEEPFREE' || compactCode === 'KZ-DEEP-1000' || compactCode === 'KZDEEP1000') {
      setAppliedCoupon({ code: 'KZ-DEEP-FREE', label: '【上級制覇特典】1日フリー乗車券（乗車運賃 ¥0 無料）', type: 'freePass' });
      setCouponMessage({
        type: 'success',
        text: '上級制覇クーポン（乗車運賃 ¥0 タダ）を適用しました！',
      });
      setCouponInput('');
    } else {
      setCouponMessage({
        type: 'error',
        text: '無効なクーポンコードです。',
      });
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponMessage(null);
  };

  // 乗車駅・降車駅の位置関係から上り/下りを自動判定
  const bIndex = currentStationList.indexOf(boardingStation);
  const dIndex = currentStationList.indexOf(destinationStation);
  const currentDirection: 'down' | 'up' = bIndex <= dIndex ? 'down' : 'up';

  // Train Switcher Effect
  const handleExpressTypeChange = (type: 'ayami' | 'nliner' | 'meguri') => {
    setExpressType(type);
    if (type === 'ayami') {
      setBoardingStation('東京駅');
      setDestinationStation('大宮駅');
      setSeatType('reserved');
      setSelectedTrainNo(101);
    } else if (type === 'nliner') {
      setBoardingStation('東京駅');
      setDestinationStation('横浜駅');
      setSeatType('reserved'); // Nライナーは普通指定席のみ
      setSelectedTrainNo(1);
    } else {
      setBoardingStation('松戸駅');
      setDestinationStation('日立駅');
      setSeatType('megu');
      setSelectedTrainNo(3);
    }
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

  // 特急あやみ (毎時15分発) 101号〜
  const ayamiSchedules = Array.from({ length: 14 }, (_, i) => {
    const hour = 8 + i; // 8:15 〜 21:15
    const hourStr = String(hour).padStart(2, '0');
    return {
      no: 101 + i * 2,
      time: `${hourStr}:15`,
      dest: '環状一回り（東京・大宮・新宿方面）',
      trainName: `特急あやみ ${101 + i * 2}号`,
      dir: 'down' as const,
    };
  });

  // 特急Nライナー (毎時30分 / 00分発) 1号〜
  const nlinerSchedules = [
    // 下り (東京 → 大宮 → 新横浜 → 横浜)
    { no: 1, time: '07:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 1号' },
    { no: 3, time: '08:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 3号' },
    { no: 5, time: '09:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 5号' },
    { no: 7, time: '10:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 7号' },
    { no: 9, time: '11:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 9号' },
    { no: 11, time: '12:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 11号' },
    { no: 13, time: '13:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 13号' },
    { no: 15, time: '14:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 15号' },
    { no: 17, time: '15:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 17号' },
    { no: 19, time: '16:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 19号' },
    { no: 21, time: '17:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 21号' },
    { no: 23, time: '18:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 23号' },
    { no: 25, time: '19:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 25号' },
    { no: 27, time: '20:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 27号' },
    { no: 29, time: '21:30', dir: 'down' as const, dest: '横浜行き', trainName: '特急Nライナー 29号' },
    // 上り (横浜 → 新横浜 → 大宮 → 東京)
    { no: 2, time: '08:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 2号' },
    { no: 4, time: '09:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 4号' },
    { no: 6, time: '10:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 6号' },
    { no: 8, time: '11:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 8号' },
    { no: 10, time: '12:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 10号' },
    { no: 12, time: '13:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 12号' },
    { no: 14, time: '14:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 14号' },
    { no: 16, time: '15:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 16号' },
    { no: 18, time: '16:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 18号' },
    { no: 20, time: '17:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 20号' },
    { no: 22, time: '18:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 22号' },
    { no: 24, time: '19:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 24号' },
    { no: 26, time: '20:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 26号' },
    { no: 28, time: '21:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 28号' },
    { no: 30, time: '22:00', dir: 'up' as const, dest: '東京行き', trainName: '特急Nライナー 30号' },
  ];

  // 特急めぐり (毎時13分 / 43分)
  const MEGUI_DOWN_MINUTE = 13;
  const MEGUI_UP_MINUTE = 43;
  const meguriSchedules = [
    { no: 1, hour: 7, time: '07:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 1号' },
    { no: 2, hour: 8, time: '08:43', dir: 'up' as const, dest: '松戸行き', minute: MEGUI_UP_MINUTE, trainName: '特急めぐり 2号' },
    { no: 3, hour: 9, time: '09:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 3号' },
    { no: 4, hour: 10, time: '10:43', dir: 'up' as const, dest: '松戸行き', minute: MEGUI_UP_MINUTE, trainName: '特急めぐり 4号' },
    { no: 5, hour: 11, time: '11:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 5号' },
    { no: 6, hour: 12, time: '12:43', dir: 'up' as const, dest: '松戸行き', minute: MEGUI_UP_MINUTE, trainName: '特急めぐり 6号' },
    { no: 7, hour: 13, time: '13:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 7号' },
    { no: 8, hour: 14, time: '14:43', dir: 'up' as const, dest: '松戸行き', minute: MEGUI_UP_MINUTE, trainName: '特急めぐり 8号' },
    { no: 9, hour: 15, time: '15:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 9号' },
    { no: 10, hour: 16, time: '16:43', dir: 'up' as const, dest: '松戸行き', minute: MEGUI_UP_MINUTE, trainName: '特急めぐり 10号' },
    { no: 11, hour: 17, time: '17:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 11号' },
    { no: 12, hour: 18, time: '18:43', dir: 'up' as const, dest: '松戸行き', minute: MEGUI_UP_MINUTE, trainName: '特急めぐり 12号' },
    { no: 13, hour: 19, time: '19:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 13号' },
    { no: 14, hour: 20, time: '20:43', dir: 'up' as const, dest: '松戸行き', minute: MEGUI_UP_MINUTE, trainName: '特急めぐり 14号' },
    { no: 15, hour: 21, time: '21:13', dir: 'down' as const, dest: '日立行き', minute: MEGUI_DOWN_MINUTE, trainName: '特急めぐり 15号' },
  ];

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

  const availableTrains =
    expressType === 'ayami'
      ? ayamiSchedules
      : expressType === 'nliner'
      ? nlinerSchedules.filter((t) => t.dir === currentDirection)
      : meguriSchedules.filter((t) => t.dir === currentDirection);

  // 過去になっていない（予約可能）列車の中で最も早いものを初期選択
  React.useEffect(() => {
    const activeValidTrain = availableTrains.find((t) => !isTrainEnded(t.time));
    if (activeValidTrain) {
      setSelectedTrainNo(activeValidTrain.no);
    } else if (availableTrains.length > 0) {
      setSelectedTrainNo(availableTrains[0].no);
    }
  }, [expressType, currentDirection, currentMinutesFromMidnight]);

  const currentTrainInfo = availableTrains.find((t) => t.no === selectedTrainNo) || availableTrains[0];
  const isCurrentTrainEnded = currentTrainInfo ? isTrainEnded(currentTrainInfo.time) : true;
  const isAllTrainsEnded = availableTrains.every((t) => isTrainEnded(t.time));

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

  // 駅間の所要時間（分）計算ヘルパー
  const calculateTravelMinutes = (startSt: string, endSt: string) => {
    const sIdx = currentStationList.indexOf(startSt);
    const eIdx = currentStationList.indexOf(endSt);
    if (sIdx === -1 || eIdx === -1) return 30;
    const diff = Math.abs(eIdx - sIdx);
    return Math.max(15, diff * 15);
  };

  // 出発時刻(HH:MM)と所要分から到着時刻(HH:MM)を計算
  const calculateArrivalTime = (startTimeStr: string, minutesToAdd: number) => {
    const [h, m] = startTimeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '09:36';
    const totalM = h * 60 + m + minutesToAdd;
    const endH = Math.floor(totalM / 60) % 24;
    const endM = totalM % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  // 距離(km)計算ヘルパー
  const calculateDistance = (start: string, end: string) => {
    const kmMap =
      expressType === 'ayami'
        ? AYAMI_KM
        : expressType === 'nliner'
        ? NLINER_KM
        : MEGURI_KM;
    const startKm = kmMap[start] ?? 0;
    const endKm = kmMap[end] ?? 0;
    return Math.abs(endKm - startKm);
  };

  // 営業キロ区分に基づく普通運賃計算
  const calculateFare = (dist: number) => {
    if (dist <= 0) return 0;
    if (dist <= 3) return 150;
    if (dist <= 5) return 180;
    if (dist <= 10) return 230;
    if (dist <= 30) return 390;
    if (dist <= 50) return 660;
    if (dist <= 100) return 1000;
    if (dist <= 200) return 1980;
    return 3300;
  };

  // 座席料金・普通運賃計算ヘルパー
  const calculateTicketPrice = () => {
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
      } else if (compactCode.includes('STEP') || appliedCoupon.type === 'fare10') {
        // 中級: 乗車運賃 10% 割引
        fareDiscount = Math.ceil(initialFare * 0.1);
      } else if (compactCode.includes('FREE') || appliedCoupon.type === 'freePass') {
        // 上級: 1日フリー乗車券（乗車運賃 ¥0 タダ）
        fareDiscount = initialFare;
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
      total: fare + expressFee,
    };
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
            seatNo: '自由席',
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
        seatNo: '自由席',
        isSpecialCar: false,
        specialCarFee: 0,
      });
    } else {
      setIsSeatSelectionModalOpen(true);
    }
  };

  // Confirm Seat Selection Handler
  const handleConfirmSeatSelection = ({
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
    if (isCurrentTrainEnded || isAllTrainsEnded) {
      return;
    }

    const items: { item: EquipItem; quantity: number }[] = [];
    const prices = calculateTicketPrice();
    const travelMins = calculateTravelMinutes(boardingStation, destinationStation);
    const arrivalTime = calculateArrivalTime(currentTrainInfo.time, travelMins);

    const trainName =
      expressType === 'ayami'
        ? `特急あやみ ${currentTrainInfo.no}号`
        : expressType === 'nliner'
        ? `特急Nライナー ${currentTrainInfo.no}号`
        : `特急めぐり ${currentTrainInfo.no}号`;

    const finalTotalPrice = prices.fare + prices.expressFee + (isSpecialCar ? specialCarFee : 0);

    const newOrder: ActiveOrder = {
      orderId: `EQ-${Math.floor(10000 + Math.random() * 90000)}`,
      trainName,
      carNo,
      seatNo,
      seatType: isSpecialCar ? 'megu' : seatType === 'megu' ? 'megu' : 'standard',
      boardingStation,
      destinationStation,
      departureTime: currentTrainInfo.time,
      arrivalTime,
      items,
      totalPrice: finalTotalPrice,
      status: 'confirmed',
      estimatedDeliveryTime: `${boardingStation.replace('駅', '')}駅発車後 5分頃`,
      deliveryStation: boardingStation,
    };

    // クーポンが適用されていた場合、端末で使用済みとして記録
    if (appliedCoupon) {
      recordCouponUsage(appliedCoupon.code);
      setAppliedCoupon(null);
    }

    onConfirmOrder(newOrder);
    setShowBookingSuccessModal(true);
  };

  return (
    <div className="space-y-4 text-[#221C35] max-w-md mx-auto p-4 pb-20 animate-fadeIn">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[#221C35] flex items-center gap-2">
          <Ticket className="w-5 h-5 text-[#5B21B6]" />
          <span>特急券・座席指定予約</span>
        </h2>
        {activeOrder && (
          <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>予約済み</span>
          </span>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          1. 予約済みの場合の表示 (出発時刻 & デリバリー予定の弁当表示欄)
         ───────────────────────────────────────────────────────────── */}
      {activeOrder ? (
        <div className="space-y-3.5">
          {/* Main Reserved Train & Departure Info Card */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#5B21B6]/30 space-y-4 relative overflow-hidden">
            {/* Background Accent Decorative Ribbon */}
            <div className="absolute top-0 right-0 bg-gradient-to-l from-[#5B21B6] to-[#7C3AED] text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl shadow-xs">
              {activeOrder.carNo === 5 || activeOrder.seatType === 'megu' ? 'めぐシート（プレミアム）予約確定' : '普通席 予約確定'}
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
              </div>
              <h3 className="text-base font-black text-[#5B21B6] flex items-center gap-1.5 mt-0.5">
                <Armchair className="w-5 h-5 text-[#5B21B6]" />
                <span>{activeOrder.trainName}</span>
              </h3>
            </div>

            {/* Departure & Arrival Time Board */}
            <div className="bg-[#F6F4FA] p-3.5 rounded-xl border border-[#E0D7F3] space-y-2">
              <div className="text-[11px] text-[#6B6380] font-bold flex items-center justify-between">
                <span>ご乗車区間・時刻</span>
                <span className="text-[#5B21B6] bg-white px-2 py-0.5 rounded border border-[#DDD6FE] text-[10px]">
                  全席指定・車内Wi-Fi完備
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                {/* Boarding Station & Departure Time */}
                <div className="text-left">
                  <div className="text-xs text-[#6B6380]">乗車駅</div>
                  <div className="text-base font-black text-[#221C35]">{activeOrder.boardingStation || activeOrder.deliveryStation || '松戸駅'}</div>
                  <div className="text-xs font-black text-[#5B21B6] flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#5B21B6]" />
                    <span>出発時刻 {activeOrder.departureTime || '09:00'}</span>
                  </div>
                </div>

                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] text-[#857D99] font-bold">
                    {calculateTravelMinutes(
                      activeOrder.boardingStation || '松戸駅',
                      activeOrder.destinationStation || '日立駅'
                    )}分
                  </span>
                  <ArrowRight className="w-5 h-5 text-[#5B21B6]" />
                </div>

                {/* Destination Station */}
                <div className="text-right">
                  <div className="text-xs text-[#6B6380]">降車駅</div>
                  <div className="text-base font-black text-[#221C35]">{activeOrder.destinationStation || '日立駅'}</div>
                  <div className="text-xs font-bold text-[#6B6380] mt-0.5">
                    到着 {activeOrder.arrivalTime || '09:48'}
                  </div>
                </div>
              </div>

              {/* Car & Seat Number */}
              <div className="pt-2 border-t border-[#E6E2EE] flex items-center justify-between text-xs">
                <span className="text-[#6B6380] font-medium">ご着席位置</span>
                <span className="font-extrabold text-[#221C35] bg-white px-2.5 py-1 rounded-lg border border-[#D1C9E3]">
                  {activeOrder.carNo}号車 ({activeOrder.carNo === 5 || activeOrder.seatType === 'megu' ? 'めぐしーと' : '普通席'}) {activeOrder.seatNo}（窓側）
                </span>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                2. デリバリー予定のお弁当・商品表示欄
               ───────────────────────────────────────────────────────────── */}
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
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#F9F8FD] border border-dashed border-[#D1C9E3] text-center space-y-2">
                  <p className="text-xs text-[#6B6380]">
                    現在、車内デリバリーのお弁当・ドリンクは選択されていません。
                  </p>
                  <button
                    onClick={onOpenEDeliveryModal}
                    className="text-xs font-bold text-[#5B21B6] bg-[#EFE8FA] hover:bg-[#E0D5F5] border border-[#DDD6FE] px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>お弁当・ドリンクを追加注文する</span>
                  </button>
                </div>
              )}
            </div>

            {/* Action buttons inside Reserved Card */}
            <div className="pt-2 border-t border-[#E6E2EE] flex items-center gap-2">
              <button
                onClick={onOpenEDeliveryModal}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#5B21B6] hover:bg-[#4C1D95] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>お弁当・商品を追加変更</span>
              </button>

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
                {expressType !== 'ayami' && (
                  <span className="text-[10px] font-bold text-[#5B21B6] bg-[#EFE8FA] px-2 py-0.5 rounded border border-[#DDD6FE]">
                    {currentDirection === 'down' ? '下り列車' : '上り列車'}
                  </span>
                )}
              </div>
              <select
                value={selectedTrainNo}
                onChange={(e) => setSelectedTrainNo(Number(e.target.value))}
                className="w-full bg-[#F4F3F8] border border-[#E6E2EE] rounded-xl px-3 py-2 text-xs font-bold text-[#221C35] cursor-pointer focus:outline-none"
              >
                {availableTrains.map((tr) => {
                  const ended = isTrainEnded(tr.time);
                  return (
                    <option key={tr.no} value={tr.no} disabled={ended}>
                      {tr.trainName} ({tr.time}発 {tr.dest}) {ended ? '【予約終了】' : ''}
                    </option>
                  );
                })}
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
                      placeholder="クーポンコードを入力（例: KZ-STEP-10 / KZ-DEEP-FREE）"
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
              return (
                <div className="pt-2 border-t border-[#E6E2EE] space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#6B6380]">
                    <div className="flex items-center gap-1">
                      <span>乗車運賃 ({priceInfo.dist}km)</span>
                      {priceInfo.fareDiscount > 0 && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                          クーポン割引 -¥{priceInfo.fareDiscount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-[#221C35]">
                        {priceInfo.fare === 0 && priceInfo.initialFare > 0 ? (
                          <span className="text-emerald-600 font-black">¥0 (フリーパス無料)</span>
                        ) : (
                          `¥${priceInfo.fare.toLocaleString()}`
                        )}
                      </span>
                      {priceInfo.fareDiscount > 0 && priceInfo.fare > 0 && (
                        <span className="text-[10px] text-gray-400 line-through ml-1.5 font-mono">
                          ¥{priceInfo.initialFare.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#6B6380]">
                    <div className="flex items-center gap-1">
                      <span>特急料金</span>
                      {priceInfo.expressDiscount > 0 && (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                          クーポン割引 -¥{priceInfo.expressDiscount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-[#221C35]">
                        ¥{priceInfo.expressFee.toLocaleString()}
                      </span>
                      {priceInfo.expressDiscount > 0 && (
                        <span className="text-[10px] text-gray-400 line-through ml-1.5 font-mono">
                          ¥{priceInfo.baseExpressFee.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-[#E6E2EE] flex items-center justify-between">
                    <span className="text-xs text-[#221C35] font-extrabold">お支払い合計</span>
                    <span className="text-xl font-black text-[#5B21B6] font-mono">
                      ¥{priceInfo.total.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Warning if train is ended */}
            {isCurrentTrainEnded && (
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
              disabled={isCurrentTrainEnded}
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
        onClose={() => setIsSeatSelectionModalOpen(false)}
        expressType={expressType}
        trainName={
          expressType === 'ayami'
            ? `特急あやみ ${currentTrainInfo?.no || 101}号`
            : expressType === 'nliner'
            ? `特急Nライナー ${currentTrainInfo?.no || 1}号`
            : `特急めぐり ${currentTrainInfo?.no || 1}号`
        }
        departureTime={currentTrainInfo?.time || '09:15'}
        boardingStation={boardingStation}
        destinationStation={destinationStation}
        initialSeatType={seatType}
        basePrice={calculateTicketPrice().total}
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
                  <span className="font-bold">¥{activeOrder.totalPrice.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-rose-200/80 text-rose-900 font-bold text-[11px]">
                  <span>お客様への返金額:</span>
                  <span className="text-rose-700 text-xs font-black">¥0（返金不可）</span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-rose-200/80 font-bold text-rose-950">
                  <span className="flex items-center gap-1">
                    <span>追加徴収違約金 (1.5倍 + 手数料500円):</span>
                  </span>
                  <span className="font-black text-rose-600 text-sm">
                    +¥{(Math.round(activeOrder.totalPrice * 1.5) + 500).toLocaleString()}
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
                  {(Math.round(activeOrder.totalPrice * 1.5) + 500).toLocaleString()} 請求)
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
          4. 特急券・めぐしーと予約完了モーダル
         ───────────────────────────────────────────────────────────── */}
      {showBookingSuccessModal && activeOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-emerald-200 text-center animate-scaleUp relative">
            <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                予約コード: {activeOrder.orderId}
              </span>
              <h3 className="text-lg font-black text-[#221C35] pt-1">
                予約しました！
              </h3>
              <p className="text-xs text-[#6B6380] font-medium">
                特急券・めぐシートの予約が正常に完了いたしました。
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 text-center text-[11px] font-bold flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>特急予約により N-POINT を獲得しました！</span>
            </div>

            <div className="bg-[#F9F8FD] border border-[#E0D7F3] rounded-2xl p-3.5 space-y-2 text-left text-xs">
              <div className="flex justify-between items-center border-b border-[#E6E2EE] pb-2">
                <span className="text-[#6B6380]">ご乗車列車:</span>
                <span className="font-bold text-[#5B21B6]">{activeOrder.trainName} ({activeOrder.departureTime || '09:00'}発)</span>
              </div>
              <div className="flex justify-between items-center border-b border-[#E6E2EE] pb-2">
                <span className="text-[#6B6380]">ご乗車区間:</span>
                <span className="font-bold text-[#221C35]">{activeOrder.boardingStation || '松戸駅'} → {activeOrder.destinationStation || '日立駅'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B6380]">ご着席位置:</span>
                <span className="font-extrabold text-[#221C35]">{activeOrder.carNo}号車 ({activeOrder.carNo === 5 || activeOrder.seatType === 'megu' ? 'めぐしーと' : '普通席'}) {activeOrder.seatNo}（窓側）</span>
              </div>
              {activeOrder.items && activeOrder.items.length > 0 && (
                <div className="flex justify-between items-center border-t border-[#E6E2EE] pt-2">
                  <span className="text-[#6B6380]">車内デリバリー:</span>
                  <span className="font-bold text-emerald-700">{activeOrder.items[0].item.name}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowBookingSuccessModal(false)}
              className="w-full bg-[#5B21B6] hover:bg-[#4C1D95] text-white font-bold text-xs py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              予約内容を確認する
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
