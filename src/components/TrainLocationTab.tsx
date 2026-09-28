import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, Info, HelpCircle, AlertCircle, ArrowLeftRight, X, Clock, RotateCcw, CheckCircle2 } from 'lucide-react';
import { getTsuchiuraLiveTrains } from '../utils/tsuchiuraTimetable';
import { LocationStationDetailCard, LocationStationInfo } from './LocationStationDetailCard';
import { sendLocalPushNotification } from '../utils/pushNotification';
import { disruptionManager } from '../utils/disruptionManager';

export interface StationNode {
  id: string;
  code?: string;
  name: string;
  transfers?: string[];
}

export interface DisplayLine {
  id: string;
  name: string;
  code: string;
  color: string;
  direction1: string; // e.g. "大宮・横浜方面"
  direction2: string; // e.g. "東京方面"
  stations: StationNode[];
}

interface TrainLocationTabProps {}

export interface LiveTrainPos {
  id: string;
  lineId: string;
  direction: 1 | 2;
  trainType: string;
  destination: string;
  carCount: number;
  stationId: string; // どの駅（またはその手前）にいるか
  isBetween: boolean; // 駅間走行中かどうか
  isStopStation?: boolean; // 現在位置の駅に停車するかどうか（falseなら通過駅）
  delayMinutes: number; // 0=定時
  timetable: { stationName: string; scheduledTime: string; estimatedTime: string }[];
}

// 統一された種別スタイル取得関数
export const getTrainTypeBadgeStyle = (trainType: string): { bg: string; text: string; dot: string; arrowColor: string } => {
  if (trainType === '各停' || trainType === '普通') {
    return {
      bg: 'bg-slate-100 text-slate-700 border border-slate-200',
      text: 'text-slate-700',
      dot: 'bg-slate-500',
      arrowColor: '#64748B', // 各停の矢印を灰色に変更
    };
  }
  if (trainType === '快速' || trainType === '区間快速') {
    return {
      bg: 'bg-sky-50 text-sky-800 border border-sky-200',
      text: 'text-sky-800',
      dot: 'bg-sky-500',
      arrowColor: '#0284C7',
    };
  }
  if (trainType === '急行' || trainType === '通勤特快') {
    return {
      bg: 'bg-rose-50 text-rose-800 border border-rose-200',
      text: 'text-rose-800',
      dot: 'bg-red-600',
      arrowColor: '#E11D48',
    };
  }
  if (trainType === '特別快速') {
    return {
      bg: 'bg-amber-50 text-amber-900 border border-amber-300',
      text: 'text-amber-900',
      dot: 'bg-amber-500',
      arrowColor: '#F59E0B',
    };
  }
  if (trainType.includes('特急') || trainType.includes('めぐり') || trainType.includes('Nライナー') || trainType.includes('あやみ')) {
    if (trainType.includes('めぐり')) {
      return {
        bg: 'bg-purple-50 text-purple-900 border border-purple-300',
        text: 'text-purple-900',
        dot: 'bg-purple-600',
        arrowColor: '#7C3AED',
      };
    }
    return {
      bg: 'bg-purple-100 text-purple-950 border border-purple-300',
      text: 'text-purple-950',
      dot: 'bg-purple-700',
      arrowColor: '#6D28D9',
    };
  }
  return {
    bg: 'bg-slate-100 text-slate-700 border border-slate-200',
    text: 'text-slate-700',
    dot: 'bg-slate-500',
    arrowColor: '#64748B',
  };
};

// 4 Lines Data according to spec
const LINES_DATA: DisplayLine[] = [
  {
    id: 'kanzaki',
    name: '神埼線',
    code: 'Y',
    color: '#8B5CF6',
    direction1: '大宮・横浜方面',
    direction2: '東京方面',
    stations: [
      { id: 'Y01', code: 'Y01', name: '東京', transfers: ['NI', 'SC', 'JR', '新幹線', '地下鉄'] },
      { id: 'Y02', code: 'Y02', name: '浅草', transfers: ['地下鉄', '東武'] },
      { id: 'Y03', code: 'Y03', name: '北千住', transfers: ['SC', 'JR', '地下鉄', '東武', 'TX'] },
      { id: 'Y04', code: 'Y04', name: '足立', transfers: ['バス'] },
      { id: 'Y05', code: 'Y05', name: '草加', transfers: ['東武'] },
      { id: 'Y06', code: 'Y06', name: '越谷レイクタウン', transfers: ['JR'] },
      { id: 'Y07', code: 'Y07', name: '七光台', transfers: ['SC', '東武'] },
      { id: 'Y08', code: 'Y08', name: '北春日部', transfers: ['東武'] },
      { id: 'Y09', code: 'Y09', name: '地下鉄岩槻', transfers: ['地下鉄', '東武'] },
      { id: 'Y10', code: 'Y10', name: '蓮田', transfers: ['JR'] },
      { id: 'Y11', code: 'Y11', name: '丸山', transfers: ['ニューシャトル'] },
      { id: 'Y12', code: 'Y12', name: '大宮', transfers: ['SC', 'JR', '新幹線', '東武', 'ニューシャトル'] },
      { id: 'Y13', code: 'Y13', name: '朝霞台', transfers: ['東武', 'JR'] },
      { id: 'Y14', code: 'Y14', name: '新座', transfers: ['JR'] },
      { id: 'Y15', code: 'Y15', name: 'ひばりヶ丘', transfers: ['西武'] },
      { id: 'Y16', code: 'Y16', name: '田無', transfers: ['西武'] },
      { id: 'Y17', code: 'Y17', name: '武蔵境', transfers: ['JR', '西武'] },
      { id: 'Y18', code: 'Y18', name: '中三鷹', transfers: ['JR', 'バス'] },
      { id: 'Y19', code: 'Y19', name: '調布', transfers: ['京王'] },
      { id: 'Y20', code: 'Y20', name: '生田', transfers: ['小田急'] },
      { id: 'Y21', code: 'Y21', name: '溝の口', transfers: ['東急', 'JR'] },
      { id: 'Y22', code: 'Y22', name: '新横浜', transfers: ['新幹線', 'JR', '東急', '地下鉄'] },
      { id: 'Y23', code: 'Y23', name: '横浜', transfers: ['NI', 'JR', '東急', '京急', '相鉄', '地下鉄'] },
    ],
  },
  {
    id: 'kanzaki_kosoku',
    name: '神埼高速線',
    code: 'NI',
    color: '#3B82F6',
    direction1: '横浜方面',
    direction2: '東京方面',
    stations: [
      { id: 'NI01', code: 'NI01', name: '東京', transfers: ['Y', 'SC', 'JR', '新幹線', '地下鉄'] },
      { id: 'NI02', code: 'NI02', name: '新橋', transfers: ['JR', '地下鉄', 'ゆりかもめ'] },
      { id: 'NI03', code: 'NI03', name: '品川', transfers: ['JR', '新幹線', '京急'] },
      { id: 'NI04', code: 'NI04', name: '大井町', transfers: ['JR', '東急', 'りんかい線'] },
      { id: 'NI05', code: 'NI05', name: '平和島', transfers: ['京急'] },
      { id: 'NI06', code: 'NI06', name: '地下鉄蒲田', transfers: ['JR', '東急', 'バス'] },
      { id: 'NI07', code: 'NI07', name: '川崎', transfers: ['JR', '京急'] },
      { id: 'NI08', code: 'NI08', name: '鶴見', transfers: ['JR', '京急'] },
      { id: 'NI09', code: 'NI09', name: '横浜', transfers: ['Y', 'JR', '東急', '京急', '相鉄', '地下鉄'] },
    ],
  },
  {
    id: 'saichi_loop',
    name: '埼千環状線',
    code: 'SC',
    color: '#EC4899',
    direction1: '大宮・柏方面',
    direction2: '池袋・新宿方面',
    stations: [
      { id: 'SC01', code: 'SC01', name: '東京', transfers: ['Y', 'NI', 'JR', '新幹線', '地下鉄'] },
      { id: 'SC02', code: 'SC02', name: '南千住', transfers: ['JR', '地下鉄', 'TX'] },
      { id: 'SC03', code: 'SC03', name: '北千住', transfers: ['Y', 'JR', '地下鉄', '東武', 'TX'] },
      { id: 'SC04', code: 'SC04', name: '綾瀬', transfers: ['地下鉄', 'JR'] },
      { id: 'SC05', code: 'SC05', name: '松戸', transfers: ['TC', 'JR', '京成松戸線'] },
      { id: 'SC06', code: 'SC06', name: '柏', transfers: ['TC', 'JR', '東武'] },
      { id: 'SC07', code: 'SC07', name: '七光台', transfers: ['Y', '東武'] },
      { id: 'SC08', code: 'SC08', name: '春日部', transfers: ['東武'] },
      { id: 'SC09', code: 'SC09', name: '岩槻', transfers: ['東武'] },
      { id: 'SC10', code: 'SC10', name: '大宮公園', transfers: ['東武'] },
      { id: 'SC11', code: 'SC11', name: '大宮', transfers: ['Y', 'JR', '新幹線', '東武', 'ニューシャトル'] },
      { id: 'SC12', code: 'SC12', name: 'さいたま新都心', transfers: ['JR'] },
      { id: 'SC13', code: 'SC13', name: '南浦和', transfers: ['JR'] },
      { id: 'SC14', code: 'SC14', name: '西青木', transfers: ['バス'] },
      { id: 'SC15', code: 'SC15', name: '川口', transfers: ['JR'] },
      { id: 'SC16', code: 'SC16', name: '志村坂上', transfers: ['地下鉄'] },
      { id: 'SC17', code: 'SC17', name: '上板橋', transfers: ['東武'] },
      { id: 'SC18', code: 'SC18', name: '小竹向原', transfers: ['地下鉄', '西武'] },
      { id: 'SC19', code: 'SC19', name: '池袋', transfers: ['JR', '地下鉄', '東武', '西武'] },
      { id: 'SC20', code: 'SC20', name: '新宿', transfers: ['JR', '地下鉄', '京王', '小田急', '西武'] },
    ],
  },
  {
    id: 'tsuchiura',
    name: '土浦線',
    code: 'TC',
    color: '#10B981',
    direction1: '土浦・日立方面',
    direction2: '松戸・東京方面',
    stations: [
      { id: 'TC01', code: 'TC01', name: '松戸', transfers: ['SC', 'JR', '京成松戸線'] },
      { id: 'TC02', code: 'TC02', name: '新松戸', transfers: ['JR', '流鉄'] },
      { id: 'TC03', code: 'TC03', name: '松が丘', transfers: ['京成松戸線', 'バス'] },
      { id: 'TC04', code: 'TC04', name: '柏', transfers: ['SC', 'JR', '東武'] },
      { id: 'TC05', code: 'TC05', name: '守谷', transfers: ['TX', '常総線'] },
      { id: 'TC06', code: 'TC06', name: '谷井田', transfers: ['バス'] },
      { id: 'TC07', code: 'TC07', name: '森の里', transfers: ['バス'] },
      { id: 'TC08', code: 'TC08', name: '荒川沖', transfers: ['JR'] },
      { id: 'TC09', code: 'TC09', name: '土浦', transfers: ['JR', 'バス'] },
      { id: 'TC10', code: 'TC10', name: '高浜', transfers: ['JR'] },
      { id: 'TC11', code: 'TC11', name: '茨城空港', transfers: ['バス', '空港'] },
      { id: 'TC12', code: 'TC12', name: '鹿島旭', transfers: ['鹿島臨海'] },
      { id: 'TC13', code: 'TC13', name: '大洗', transfers: ['鹿島臨海', 'フェリー'] },
      { id: 'TC14', code: 'TC14', name: '那珂湊', transfers: ['湊線'] },
      { id: 'TC15', code: 'TC15', name: '平磯', transfers: ['湊線'] },
      { id: 'TC16', code: 'TC16', name: 'ひたちなか海浜公園', transfers: ['湊線', 'バス'] },
      { id: 'TC17', code: 'TC17', name: '久慈川', transfers: ['バス'] },
      { id: 'TC18', code: 'TC18', name: '大甕（おおみか）', transfers: ['JR', 'BRT'] },
      { id: 'TC19', code: 'TC19', name: '東大沼', transfers: ['BRT'] },
      { id: 'TC20', code: 'TC20', name: '多賀', transfers: ['JR'] },
      { id: 'TC21', code: 'TC21', name: '会瀬（おうせ）', transfers: ['バス'] },
      { id: 'TC22', code: 'TC22', name: '日立', transfers: ['JR', 'バス'] },
    ],
  },
];

// Mock Realtime Train Movements
const MOCK_TRAINS: LiveTrainPos[] = [
  // 神埼線 (Y)
  {
    id: 't_y1',
    lineId: 'kanzaki',
    direction: 1,
    trainType: '特急（Nライナー）',
    destination: '横浜',
    carCount: 10,
    stationId: 'Y22', // 新横浜
    isBetween: false,
    delayMinutes: 2, // 遅れ2分
    timetable: [
      { stationName: '新横浜', scheduledTime: '14:18', estimatedTime: '14:20' },
      { stationName: '横浜', scheduledTime: '14:26', estimatedTime: '14:28' },
    ],
  },
  {
    id: 't_y2',
    lineId: 'kanzaki',
    direction: 1,
    trainType: '各停',
    destination: '大宮',
    carCount: 8,
    stationId: 'Y09', // 地下鉄岩槻
    isBetween: true,
    delayMinutes: 0,
    timetable: [
      { stationName: '蓮田', scheduledTime: '14:15', estimatedTime: '14:15' },
      { stationName: '丸山', scheduledTime: '14:21', estimatedTime: '14:21' },
      { stationName: '大宮', scheduledTime: '14:28', estimatedTime: '14:28' },
    ],
  },
  {
    id: 't_y3',
    lineId: 'kanzaki',
    direction: 2,
    trainType: '急行',
    destination: '東京',
    carCount: 10,
    stationId: 'Y03', // 北千住
    isBetween: false,
    delayMinutes: 3,
    timetable: [
      { stationName: '北千住', scheduledTime: '14:05', estimatedTime: '14:08' },
      { stationName: '東京', scheduledTime: '14:18', estimatedTime: '14:21' },
    ],
  },
  // 土浦線 (TC)
  {
    id: 't_tc1',
    lineId: 'tsuchiura',
    direction: 1,
    trainType: '特別快速',
    destination: '茨城空港',
    carCount: 10,
    stationId: 'TC11',
    isBetween: false,
    delayMinutes: 5,
    timetable: [
      { stationName: '土浦', scheduledTime: '13:50', estimatedTime: '13:55' },
      { stationName: '高浜', scheduledTime: '13:56', estimatedTime: '14:01' },
      { stationName: '茨城空港', scheduledTime: '14:02', estimatedTime: '14:07' },
    ],
  },
  {
    id: 't_tc2',
    lineId: 'tsuchiura',
    direction: 1,
    trainType: '普通',
    destination: '土浦',
    carCount: 10,
    stationId: 'TC08',
    isBetween: true,
    delayMinutes: 0,
    timetable: [
      { stationName: '荒川沖', scheduledTime: '14:08', estimatedTime: '14:08' },
      { stationName: '土浦', scheduledTime: '14:15', estimatedTime: '14:15' },
    ],
  },
  // 神埼高速線 (NI)
  {
    id: 't_ni1',
    lineId: 'kanzaki_kosoku',
    direction: 1,
    trainType: '特急',
    destination: '横浜',
    carCount: 10,
    stationId: 'NI04', // 大井町
    isBetween: false,
    delayMinutes: 2,
    timetable: [
      { stationName: '大井町', scheduledTime: '14:12', estimatedTime: '14:14' },
      { stationName: '川崎', scheduledTime: '14:20', estimatedTime: '14:22' },
      { stationName: '横浜', scheduledTime: '14:28', estimatedTime: '14:30' },
    ],
  },
  // 埼千環状線 (SL)
  {
    id: 't_sl1',
    lineId: 'saichi_loop',
    direction: 1,
    trainType: '各停',
    destination: '大宮',
    carCount: 8,
    stationId: 'SL05', // 松戸
    isBetween: false,
    delayMinutes: 0,
    timetable: [
      { stationName: '松戸', scheduledTime: '14:14', estimatedTime: '14:14' },
      { stationName: '柏', scheduledTime: '14:22', estimatedTime: '14:22' },
      { stationName: '大宮', scheduledTime: '14:38', estimatedTime: '14:38' },
    ],
  },
];

export const TrainLocationTab: React.FC<TrainLocationTabProps> = () => {
  const [activeLineId, setActiveLineId] = useState<string>('kanzaki');
  const [direction, setDirection] = useState<1 | 2>(1); // 1=下り/方向1, 2=上り/方向2
  const [selectedTrain, setSelectedTrain] = useState<LiveTrainPos | null>(null);
  const [selectedStation, setSelectedStation] = useState<LocationStationInfo | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const detailCardRef = useRef<HTMLDivElement>(null);

  // 列車詳細プルダウン（アコーディオン）状態
  const [isAccordionOpen, setIsAccordionOpen] = useState<boolean>(true);

  // 列車走行位置の状態管理（リセット→設置工程用）
  const [liveTrains, setLiveTrains] = useState<LiveTrainPos[]>([]);
  const [isResetting, setIsResetting] = useState<boolean>(true);
  const [showResetNotice, setShowResetNotice] = useState<boolean>(false);

  // 遅延発生時の即座通知用状態・通知済み管理（同一列車の重複防止＆クールダウン機能付き）
  const [latestDelayNotice, setLatestDelayNotice] = useState<string | null>(null);
  const notifiedTrainIdsRef = useRef<Set<string>>(new Set());
  const lastNotificationTimeRef = useRef<number>(0);

  // 列車遅延が判定された際、同一列車につき1回のみ、かつクールダウン(5分)を挟んで即座に遅延通知を発信
  useEffect(() => {
    if (liveTrains.length === 0) return;

    const nowTime = Date.now();
    // 厳格なクールダウン: 1回通知を出したら最低1時間(3600,000ms)は一切の新規通知を抑制
    if (nowTime - lastNotificationTimeRef.current < 3600000) return;

    for (const train of liveTrains) {
      if (train.delayMinutes > 0) {
        // 同一列車ID (train.id) では全走行を通して1回のみ通知
        if (!notifiedTrainIdsRef.current.has(train.id)) {
          notifiedTrainIdsRef.current.add(train.id);
          lastNotificationTimeRef.current = nowTime;

          const lineNames: Record<string, string> = {
            kanzaki: '神埼線',
            kanzaki_kosoku: '神埼高速線',
            saichi_loop: '埼千環状線',
            tsuchiura: '土浦線',
          };
          const lineName = lineNames[train.lineId] || '神埼鉄道';
          const notificationMsg = `${lineName} ${train.trainType}（${train.destination}行）で約 ${train.delayMinutes} 分の遅延が発生しています。`;

          // 1. Web Push Notification 送信
          sendLocalPushNotification({
            title: `【列車遅延発生】${lineName}`,
            body: notificationMsg,
            tag: `delay-${train.id}`,
          }).catch((err) => {
            console.warn('Notification send ignored:', err);
          });

          // 2. アプリ内トースト通知バナー表示
          setLatestDelayNotice(`${lineName}：${train.trainType}（${train.destination}行）で約 ${train.delayMinutes}分遅れが発生中`);

          // 1回のタイマーサイクルで送信するのは1通のみ
          break;
        }
      }
    }
  }, [liveTrains]);

  // Real-time clock ticks every 2 seconds for ultra smooth performance
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 2000);

    const unsubscribe = disruptionManager.subscribe(() => {
      setNow(Date.now());
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const activeLine = LINES_DATA.find((l) => l.id === activeLineId) || LINES_DATA[0];

  // 常に起点を一番上に配置した固定の駅順で表示（方向切替で順序が反転しないよう統一）
  const displayStations = activeLine.stations;

  // 発車時刻・経過時間に基づいた動的リアルタイム列車計算
  const computeLiveTrains = (): LiveTrainPos[] => {
    if (activeLineId === 'tsuchiura') {
      const baseTrains = getTsuchiuraLiveTrains(now, direction, displayStations);
      const eff = disruptionManager.getEffectiveDelayForTrain('tsuchiura');
      if (eff.isSuspended) {
        return baseTrains.map((t) => ({ ...t, delayMinutes: 99 }));
      }
      if (eff.delayMinutes > 0) {
        return baseTrains.map((t) => {
          const trainEff = disruptionManager.getEffectiveDelayForTrain('tsuchiura', t.id);
          return { ...t, delayMinutes: trainEff.delayMinutes > 0 ? trainEff.delayMinutes : t.delayMinutes };
        });
      }
      return baseTrains;
    }

    const trains: LiveTrainPos[] = [];
    const STATION_INTERVAL_SEC = 90; // 1駅進むのに90秒 (30秒停車 + 60秒駅間走行)

    const totalStations = displayStations.length;
    if (totalStations === 0) return trains;

    // 深夜営業外の判定 (01:00〜04:30 は運休時間帯)
    const currentHour = new Date(now).getHours();
    const currentMin = new Date(now).getMinutes();
    const minFromMidnight = currentHour * 60 + currentMin;

    if (minFromMidnight >= 60 && minFromMidnight < 270) {
      return [];
    }

// 路線別の厳格な種別および途中折り返し・終着可能駅の設定
const LIVE_LINE_CONFIG: Record<string, {
  trainTypes: string[];
  terminatingStations: string[];
}> = {
  kanzaki: {
    trainTypes: ['各停', '急行', '特急（Nライナー）'],
    terminatingStations: ['北千住', '越谷レイクタウン', '大宮', '調布', '新横浜', '横浜', '東京'],
  },
  kanzaki_kosoku: {
    trainTypes: ['各停', '急行'],
    terminatingStations: ['東京', '横浜'],
  },
  saichi_loop: {
    trainTypes: ['各停', '急行', '特急「あやみ」'],
    terminatingStations: ['松戸', '柏', '春日部', '大宮', '池袋', '新宿', '東京'],
  },
  tsuchiura: {
    trainTypes: ['普通', '区間快速', '快速', '特別快速', '通勤特快', '特急めぐり'],
    terminatingStations: ['守谷', '土浦', '茨城空港', '鹿島旭', '日立', '松戸'],
  },
};

// 路線別の種別ごと停車駅マップ
const LIVE_LINE_STOP_STATIONS: Record<string, Record<string, string[]>> = {
  kanzaki: {
    '各停': [
      '東京', '浅草', '北千住', '足立', '草加', '越谷レイクタウン', '七光台', '北春日部',
      '地下鉄岩槻', '蓮田', '丸山', '大宮', '朝霞台', '新座', 'ひばりヶ丘', '田無',
      '武蔵境', '中三鷹', '調布', '生田', '溝の口', '新横浜', '横浜'
    ],
    '急行': [
      '東京', '北千住', '草加', '越谷レイクタウン', '大宮', '朝霞台',
      'ひばりヶ丘', '調布', '生田', '溝の口', '新横浜', '横浜'
    ],
    '特急（Nライナー）': [
      '東京', '北千住', '越谷レイクタウン', '大宮', 'ひばりヶ丘',
      '調布', '溝の口', '新横浜', '横浜'
    ],
    '特急Nライナー': [
      '東京', '北千住', '越谷レイクタウン', '大宮', 'ひばりヶ丘',
      '調布', '溝の口', '新横浜', '横浜'
    ],
  },
  kanzaki_kosoku: {
    '各停': ['東京', '新橋', '品川', '大井町', '平和島', '地下鉄蒲田', '川崎', '鶴見', '横浜'],
    '急行': ['東京', '新橋', '品川', '川崎', '横浜'],
  },
  saichi_loop: {
    '各停': [
      '東京', '南千住', '北千住', '綾瀬', '松戸', '柏', '七光台', '春日部', '岩槻',
      '大宮公園', '大宮', 'さいたま新都心', '南浦和', '西青木', '川口', '志村坂上',
      '上板橋', '小竹向原', '池袋', '新宿'
    ],
    '急行': ['東京', '北千住', '松戸', '柏', '春日部', '大宮', '川口', '池袋', '新宿'],
    '特急「あやみ」': ['東京', '北千住', '松戸', '柏', '春日部', '大宮', '池袋', '新宿'],
    '特急': ['東京', '北千住', '松戸', '柏', '春日部', '大宮', '池袋', '新宿'],
  },
  tsuchiura: {
    '普通': [
      '松戸', '新松戸', '松が丘', '柏', '守谷', '谷井田', '森の里', '荒川沖', '土浦',
      '高浜', '茨城空港', '鹿島旭', '大洗', '那珂湊', '平磯', 'ひたちなか海浜公園',
      '久慈川', '大甕（おおみか）', '東大沼', '多賀', '会瀬（おうせ）', '日立'
    ],
    '各停': [
      '松戸', '新松戸', '松が丘', '柏', '守谷', '谷井田', '森の里', '荒川沖', '土浦',
      '高浜', '茨城空港'
    ],
    '各停(近距離)': [
      '松戸', '新松戸', '松が丘', '柏', '守谷', '谷井田', '森の里', '荒川沖', '土浦',
      '高浜', '茨城空港'
    ],
    '各停(遠距離)': [
      '茨城空港', '鹿島旭', '大洗', '那珂湊', '平磯', 'ひたちなか海浜公園',
      '久慈川', '大甕（おおみか）', '東大沼', '多賀', '会瀬（おうせ）', '日立'
    ],
    '区間快速': [
      '松戸', '新松戸', '松が丘', '柏', '守谷', '谷井田', '森の里', '荒川沖', '土浦',
      '高浜', '茨城空港', '鹿島旭', '大洗', '那珂湊', '平磯', 'ひたちなか海浜公園',
      '久慈川', '大甕（おおみか）', '東大沼', '多賀', '会瀬（おうせ）', '日立'
    ],
    '快速': [
      '松戸', '新松戸', '柏', '守谷', '土浦', '高浜', '茨城空港', '鹿島旭',
      '大洗', '那珂湊', '平磯', 'ひたちなか海浜公園', '大甕（おおみか）', '多賀', '日立'
    ],
    '特別快速': ['松戸', '柏', '土浦', '高浜', '茨城空港'],
    '通勤特快': ['松戸', '柏', '土浦', '茨城空港'],
    '特急めぐり': ['松戸', '柏', '土浦', 'ひたちなか海浜公園', '日立'],
  },
};

    const config = LIVE_LINE_CONFIG[activeLineId] || LIVE_LINE_CONFIG.kanzaki;

    // 3.5分(210秒)間隔で始発駅から定期的に出発する固定スロット
    const TRAIN_FREQUENCY_SEC = 210;
    const intervalMs = TRAIN_FREQUENCY_SEC * 1000;
    const totalTripSec = (totalStations - 1) * STATION_INTERVAL_SEC;

    // 現在時刻を基準にスナップした固定のタイムスロット
    const currentSlot = Math.floor(now / intervalMs) * intervalMs;
    const numSlotsToLookBack = Math.ceil((totalTripSec * 1000) / intervalMs) + 2;

    for (let slotIndex = -numSlotsToLookBack; slotIndex <= 1; slotIndex++) {
      const trainStartTime = currentSlot + slotIndex * intervalMs;
      const elapsedSec = Math.floor((now - trainStartTime) / 1000);
      if (elapsedSec < 0) continue;

      const step = Math.floor(elapsedSec / STATION_INTERVAL_SEC);
      if (step >= totalStations) continue;

      // 下り (direction === 1): 上 (0) から下 (totalStations-1) へ進行
      // 上り (direction === 2): 下 (totalStations-1) から上 (0) へ進行
      const stationIndex = direction === 1 ? step : (totalStations - 1) - step;
      if (stationIndex < 0 || stationIndex >= totalStations) continue;

      const timeInCurrentSegment = elapsedSec % STATION_INTERVAL_SEC;

      const currentStation = displayStations[stationIndex];
      if (!currentStation) continue;

      const seed = Math.abs(Math.sin(trainStartTime / 100000)) * 10000;
      const trainType = config.trainTypes[Math.floor(seed) % config.trainTypes.length];
      
      // 管理者運行指令による実効遅延（1〜最大遅延分の乱数）または通常時の微小遅延
      const effectiveDelay = disruptionManager.getEffectiveDelayForTrain(activeLineId, trainStartTime, direction);
      let delayMinutes = 0;
      if (effectiveDelay.isSuspended) {
        delayMinutes = 99; // 運転見合わせフラグ
      } else if (effectiveDelay.delayMinutes > 0) {
        delayMinutes = effectiveDelay.delayMinutes;
      } else {
        // 全路線・上下線あわせても総合的に約1〜2%以下の極めて稀な発生確率 (1/300 ≒ 0.3%)
        delayMinutes = Math.floor(seed) % 300 === 0 ? Math.floor(seed % 3) + 1 : 0;
      }

      const lineStops = LIVE_LINE_STOP_STATIONS[activeLineId] || LIVE_LINE_STOP_STATIONS.kanzaki;
      const allowedStops = lineStops[trainType] || lineStops['各停'] || [];
      const isStopStation = allowedStops.includes(currentStation.name);

      // 通過駅（停車駅に含まれていない駅）の場合は絶対に「停車中(isBetween=false)」にならず、常に「通過中(isBetween=true)」とする
      const isBetween = !isStopStation || (timeInCurrentSegment >= 30);

      // 進行方向の前方にある折返し可能駅のみを行き先候補として抽出
      let forwardTerminatingStations = config.terminatingStations.filter((stName) => {
        const idxInDisplay = displayStations.findIndex((s) => s.name === stName);
        if (idxInDisplay === -1) return false;
        return direction === 1 ? idxInDisplay > stationIndex : idxInDisplay < stationIndex;
      });

      if (activeLineId === 'kanzaki') {
        if (trainType === '急行') {
          forwardTerminatingStations = forwardTerminatingStations.filter((stName) =>
            ['溝の口', '新横浜', '横浜', '生田', '調布', '朝霞台', '大宮', '草加', '北千住', '東京'].includes(stName)
          );
        } else if (trainType.includes('Nライナー')) {
          forwardTerminatingStations = forwardTerminatingStations.filter((stName) =>
            ['東京', '大宮', '横浜'].includes(stName)
          );
        }
      }

      let destination = '';
      if (forwardTerminatingStations.length > 0) {
        destination = forwardTerminatingStations[Math.floor(seed * 1.5) % forwardTerminatingStations.length];
      } else {
        if (direction === 1) {
          if (trainType.includes('Nライナー')) {
            destination = displayStations.some(s => s.name === '横浜') ? '横浜' : '大宮';
          } else {
            destination = displayStations[displayStations.length - 1].name;
          }
        } else {
          destination = displayStations[0].name;
        }
      }

      // 終点通り越し検証：万が一現在駅が行き先を越えている場合は除外・リセット対象
      const destIdx = displayStations.findIndex((s) => s.name === destination);
      if (destIdx !== -1) {
        if (direction === 1 && stationIndex > destIdx) continue;
        if (direction === 2 && stationIndex < destIdx) continue;
      }

      // 時刻表生成（進行方向に応じた今後の『停車駅のみ』を終点まで抽出）
      const stepDirection = direction === 1 ? 1 : -1;
      const timetable = [];
      let checkOffset = 0;

      while (checkOffset < totalStations) {
        const nextIdx = stationIndex + checkOffset * stepDirection;
        if (nextIdx >= 0 && nextIdx < totalStations) {
          const st = displayStations[nextIdx];
          if (allowedStops.includes(st.name)) {
            const arrivalTimestamp = trainStartTime + (step + checkOffset) * STATION_INTERVAL_SEC * 1000;
            const arrivalTime = new Date(arrivalTimestamp);
            const estTime = new Date(arrivalTimestamp + delayMinutes * 60 * 1000);
            const formatT = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            timetable.push({
              stationName: st.name,
              scheduledTime: formatT(arrivalTime),
              estimatedTime: formatT(estTime),
            });
          }
          // 行先駅に到達したら生成終了
          if (destIdx !== -1 && nextIdx === destIdx) {
            break;
          }
        } else {
          break;
        }
        checkOffset++;
      }

      trains.push({
        id: `live_${activeLineId}_${direction}_${trainStartTime}`,
        lineId: activeLineId,
        direction,
        trainType,
        destination,
        carCount: trainType.includes('特急') || trainType === '特別快速' ? 10 : 8,
        stationId: currentStation.id,
        isBetween,
        isStopStation,
        delayMinutes,
        timetable,
      });
    }

    return trains;
  };

  // 走行位置を完全リセット → 再設置する工程
  const performResetAndSet = (manual = false) => {
    setIsResetting(true);
    setSelectedTrain(null);
    setLiveTrains([]); // 1. 走行位置をリセット (クリア)

    if (manual) {
      setShowResetNotice(true);
      setTimeout(() => setShowResetNotice(false), 2000);
    }

    // 2. 確定現在位置を正しく設置
    setTimeout(() => {
      const calculated = computeLiveTrains();
      setLiveTrains(calculated);
      setIsResetting(false);
    }, 60);
  };

  // アプリ起動時 / 路線切り替え時 / 方向切り替え時に【リセット → 設置】を実行
  useEffect(() => {
    performResetAndSet();
  }, [activeLineId, direction]);

  // 1秒おきの時計更新時：リセット中でなければ設置状態を更新
  useEffect(() => {
    if (!isResetting) {
      setLiveTrains(computeLiveTrains());
    }
  }, [now]);

  const lineTrains = computeLiveTrains();

  // 優等度ランク計算（特急/めぐり/スカイ > 通勤特快/特別快速 > 快速/急行 > 準急/区間快速 > 各停/普通）
  const getTrainRank = (trainType: string): number => {
    if (trainType.includes('特急') || trainType.includes('めぐり') || trainType.includes('スカイ') || trainType.includes('ライナー')) return 10;
    if (trainType.includes('通勤特快') || trainType.includes('特別快速') || trainType.includes('特快') || trainType.includes('快特')) return 8;
    if (trainType.includes('通勤快速') || trainType.includes('快速') || trainType.includes('急行')) return 5;
    if (trainType.includes('準急') || trainType.includes('区間快速')) return 4;
    return 1; // 各駅停車・普通
  };

  // Train Icon on Left side of line (Matching attached images with Direction Arrow & Delay +X)
  // 被り時は優等種別が左側、下等種別が右側に避ける左右構成（画面外はみ出し防止マージン制御）
  const renderLeftTrainIcon = (
    train: LiveTrainPos,
    index: number = 0,
    total: number = 1
  ) => {
    const style = getTrainTypeBadgeStyle(train.trainType);
    const arrowColor = style.arrowColor;

    const isSelected = selectedTrain?.id === train.id;
    const isDown = train.direction === 1; // 1 = Traveling downwards, 2 = Traveling upwards

    // 複数列車が同じ駅・駅間に存在する場合の左右位置オフセット計算:
    // 【重要】全列車が線路（X = -24px）および駅ノード（-31px）を絶対に跨がず、
    // かつ複数編成が重なり合って隠れてしまわない（大事故・衝突防止）よう、各列車を整然と横並びに配置。
    // 線路のX座標: -24px / 駅ノード: -31px
    // 列車アイコン右端が -36px より左にあれば線路・ノードを跨がない。
    let centerPos = -62;
    if (total === 2) {
      // 2編成時: 優等種別(左) -86px, 下等種別(右) -56px (幅30px差)
      centerPos = index === 0 ? -86 : -56;
    } else if (total === 3) {
      // 3編成時: 最優等(左) -104px, 中間(中) -80px, 最下等(右) -56px (幅24px差)
      centerPos = index === 0 ? -104 : index === 1 ? -80 : -56;
    } else if (total > 3) {
      // 4編成以上時: 動的均等配置 (最右 -56px、左へ24px刻み)
      centerPos = -56 - (total - 1 - index) * 24;
    }

    return (
      <button
        key={train.id}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedTrain(isSelected ? null : train);
        }}
        style={{ left: `${centerPos}px` }}
        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex flex-col items-center cursor-pointer transition-all ${
          isSelected ? 'scale-115 ring-2 ring-[#5B21B6] rounded-xl p-0.5 bg-purple-50/80 shadow-md z-30' : 'hover:scale-105'
        }`}
        title={`${train.trainType} ${train.destination}行 (${train.delayMinutes > 0 ? `+${train.delayMinutes}分遅れ` : '定時'})`}
      >
        {/* 通過バッジ: 停車駅ではない駅に位置している場合（isStopStation === false）のみ表示 */}
        {train.isStopStation === false && (
          <span className="text-[9px] font-black text-purple-700 bg-purple-100 px-1 py-0.2 rounded border border-purple-300 leading-none mb-0.5 whitespace-nowrap shadow-2xs">
            通過
          </span>
        )}

        {/* Delay Minutes (+2, +5) if delayed (Top of train icon) */}
        {train.delayMinutes > 0 && (
          <span className="text-[11px] font-black text-amber-600 font-mono leading-none mb-0.5 bg-amber-50/90 px-1 py-0.2 rounded border border-amber-200 shadow-2xs">
            +{train.delayMinutes}
          </span>
        )}

        {/* Direction Arrow pointing UP if direction === 2 (上り) */}
        {!isDown && (
          <svg className="w-3.5 h-2.5 mb-0.5 drop-shadow-2xs" viewBox="0 0 10 8" fill={arrowColor}>
            <polygon points="5,0 10,8 0,8" />
          </svg>
        )}

        {/* Train Body Silhouette Icon (Dark Grey rounded train front) */}
        <div className="p-0.5">
          <svg className="w-5 h-6 text-[#475569]" viewBox="0 0 24 28" fill="currentColor">
            {/* Train Outer Shell */}
            <rect x="2" y="2" width="20" height="22" rx="7" fill="#475569" />
            {/* Front Glass */}
            <rect x="5" y="5" width="14" height="8" rx="2" fill="#E2E8F0" />
            {/* Headlights */}
            <circle cx="6.5" cy="18" r="1.5" fill="#FBBF24" />
            <circle cx="17.5" cy="18" r="1.5" fill="#FBBF24" />
            {/* Track Wheels */}
            <rect x="5" y="24" width="3" height="3" rx="0.5" fill="#1E293B" />
            <rect x="16" y="24" width="3" height="3" rx="0.5" fill="#1E293B" />
          </svg>
        </div>

        {/* Direction Arrow pointing DOWN if direction === 1 (下り) */}
        {isDown && (
          <svg className="w-3.5 h-2.5 mt-0.5 drop-shadow-2xs" viewBox="0 0 10 8" fill={arrowColor}>
            <polygon points="0,0 10,0 5,8" />
          </svg>
        )}
      </button>
    );
  };

  // Train Type Badge Renderer (Right side destination tag)
  const renderTrainBadge = (train: LiveTrainPos) => {
    const style = getTrainTypeBadgeStyle(train.trainType);
    const isSelected = selectedTrain?.id === train.id;
    const isPassing = train.isStopStation === false;

    return (
      <button
        key={train.id}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedTrain(isSelected ? null : train);
        }}
        className={`flex flex-col items-center group cursor-pointer transition-transform ${
          isSelected ? 'scale-105 z-20 ring-2 ring-[#5B21B6] rounded-lg' : 'hover:scale-102 z-10'
        }`}
      >
        {/* Top Destination Tag */}
        <div className="text-[10px] font-extrabold text-[#221C35] bg-white border border-[#E6E2EE] px-2 py-0.5 rounded-t-md shadow-2xs whitespace-nowrap z-10 leading-tight">
          {train.destination}
        </div>
        {/* Bottom Train Type Tag (If passing station, explicitly label as 通過 to avoid user confusion) */}
        <div
          className={`${
            isPassing ? 'bg-slate-700 text-white border border-slate-800' : style.bg
          } text-[10px] font-bold px-2.5 py-0.5 rounded-b-md shadow-xs flex items-center justify-center whitespace-nowrap leading-tight -mt-px`}
        >
          <span>{isPassing ? '通過' : train.trainType}</span>
        </div>
      </button>
    );
  };

  // 複数列車時の右側種別・行先バッジ群レンダラー（優等種別を上段、下等種別を下段に並べて表示）
  const renderTrainBadgesGroup = (trains: LiveTrainPos[]) => {
    if (trains.length === 0) return null;
    if (trains.length === 1) {
      return (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
          {renderTrainBadge(trains[0])}
        </div>
      );
    }

    // 同一駅・駅間に複数列車が存在する場合（退避待避・追越発生時など）
    // 優等種別を上位、普通種別を下位として整列
    const sortedTrains = [...trains].sort((a, b) => getTrainRank(b.trainType) - getTrainRank(a.trainType));

    return (
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex flex-col items-end gap-1">
        {sortedTrains.map((train) => (
          <div key={train.id} className="flex items-center gap-1">
            {renderTrainBadge(train)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F9F8FD] text-[#221C35] pb-24 max-w-md mx-auto relative font-sans">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#E6E2EE] shadow-2xs">
        <div className="p-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#221C35]">列車走行位置</h2>
          </div>
          <button
            onClick={() => performResetAndSet(true)}
            disabled={isResetting}
            className="flex items-center gap-1 text-xs font-bold text-[#5B21B6] bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-full transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="走行位置をリセットして再設置"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>位置リセット</span>
          </button>
        </div>

        {/* Reset Notice Banner */}
        {showResetNotice && (
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold px-3 py-1.5 text-center animate-fade-in flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>走行位置をリセットし、現在時刻に再設置しました</span>
          </div>
        )}

        {/* Instant Delay Alert Banner */}
        {latestDelayNotice && (
          <div className="bg-amber-500 text-white text-xs font-bold px-3 py-2 flex items-center justify-between gap-2 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-100 animate-pulse" />
              <span className="truncate">{latestDelayNotice}</span>
            </div>
            <button
              onClick={() => setLatestDelayNotice(null)}
              className="p-1 hover:bg-amber-600 rounded text-white shrink-0 cursor-pointer"
              title="閉じる"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 1. Line Switcher Tabs (4 Lines: 神埼線 / 神埼高速線 / 埼千環状線 / 土浦線) */}
        <div className="flex items-center gap-1 px-2 overflow-x-auto scrollbar-none border-t border-[#F0EEF6]">
          {LINES_DATA.map((line) => {
            const isActive = activeLineId === line.id;
            return (
              <button
                key={line.id}
                onClick={() => {
                  setActiveLineId(line.id);
                  setSelectedTrain(null);
                }}
                className={`px-3 py-2 text-xs font-bold transition-all relative whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  isActive ? 'text-[#5B21B6]' : 'text-[#6B6380] hover:text-[#221C35]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: line.color }}
                />
                <span>{line.name}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5B21B6] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* 2. Direction Switcher Segment Switch (パープルの丸みのあるスイッチ) */}
        <div className="p-3 bg-[#F4F3F8]">
          <div className="bg-[#E6E2EE]/60 p-1 rounded-xl flex items-center gap-1">
            <button
              onClick={() => {
                setDirection(1);
                setSelectedTrain(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                direction === 1
                  ? 'bg-[#5B21B6] text-white shadow-xs'
                  : 'text-[#6B6380] hover:text-[#221C35]'
              }`}
            >
              {activeLine.direction1}
            </button>
            <button
              onClick={() => {
                setDirection(2);
                setSelectedTrain(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                direction === 2
                  ? 'bg-[#5B21B6] text-white shadow-xs'
                  : 'text-[#6B6380] hover:text-[#221C35]'
              }`}
            >
              {activeLine.direction2}
            </button>
          </div>
        </div>
      </div>

      {/* Main Realtime Railway Map Schematic */}
      <div className="p-4 relative">
        <div className="relative border-l-2 border-[#D1C9E3] ml-32 pl-6 space-y-7 my-2">
          {displayStations.map((st, idx) => {
            // Find all trains at this station (sorted by express rank so express stays on left, local stays on right)
            const rawTrainsAtStation = liveTrains.filter(
              (t) => t.stationId === st.id && !t.isBetween
            );
            const trainsAtStation = [...rawTrainsAtStation].sort(
              (a, b) => getTrainRank(b.trainType) - getTrainRank(a.trainType)
            );

            // Find all trains between this station and next (sorted by express rank)
            const rawTrainsBetween = liveTrains.filter(
              (t) => t.stationId === st.id && t.isBetween
            );
            const trainsBetween = [...rawTrainsBetween].sort(
              (a, b) => getTrainRank(b.trainType) - getTrainRank(a.trainType)
            );

            const hasMultipleStation = trainsAtStation.length > 1;
            const hasMultipleBetween = trainsBetween.length > 1;

            return (
              <React.Fragment key={st.id}>
                {/* Station Node Row */}
                <div
                  className={`relative flex items-center justify-between pr-24 ${
                    hasMultipleStation ? 'min-h-[72px] py-2' : 'min-h-[48px]'
                  }`}
                >
                  {/* Circle Node on Vertical Line */}
                  <div className="absolute -left-[31px] w-3.5 h-3.5 rounded-full bg-white border-2 border-[#857D99] shadow-2xs z-10" />

                  {/* LEFT SIDE: Train Icons with directional triangle & delay indicator */}
                  {trainsAtStation.map((train, tIdx) =>
                    renderLeftTrainIcon(train, tIdx, trainsAtStation.length)
                  )}

                  {/* Left Station Info (Station Name + Sub-row for Transfers) */}
                  <div className="flex flex-col justify-center min-w-0 py-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStation({ name: st.name, code: st.code, transfers: st.transfers });
                        setSelectedTrain(null);
                      }}
                      className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer group text-left"
                      title={`${st.name}の乗り換え・駅情報を見る`}
                    >
                      {/* Station Code Badge */}
                      {st.code && (
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-[#EFE8FA] text-[#5B21B6] border border-[#5B21B6]/20 shrink-0">
                          {st.code}
                        </span>
                      )}

                      <span className="text-sm font-bold text-[#221C35] group-hover:text-[#5B21B6] truncate">
                        {st.name}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#5B21B6] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>

                    {/* Transfers Badges in a sub-row to prevent horizontal overlap with right train badges */}
                    {st.transfers && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {st.transfers.map((tr) => (
                          <span
                            key={tr}
                            className="text-[9px] font-bold px-1 py-0.2 rounded bg-[#E6E2EE] text-[#6B6380] leading-none"
                          >
                            {tr}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Side: Train Destination Badges Group if stationed at station */}
                  {renderTrainBadgesGroup(trainsAtStation)}
                </div>

                {/* Between Stations Segment (If train is moving between stations) */}
                {idx < displayStations.length - 1 && (
                  <div
                    className={`relative flex items-center ${
                      hasMultipleBetween ? 'h-16' : 'h-6'
                    }`}
                  >
                    {/* LEFT SIDE: Train Icons between stations */}
                    {trainsBetween.map((train, tIdx) =>
                      renderLeftTrainIcon(train, tIdx, trainsBetween.length)
                    )}

                    {/* Right Side: Train Destination Badges Group */}
                    {renderTrainBadgesGroup(trainsBetween)}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Station Transfer Guide Sheet (駅の乗り換え情報カード - 列車詳細と同等のボトムシート表示) */}
      {selectedStation && (
        <div ref={detailCardRef} className="fixed bottom-14 left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-[#E6E2EE] rounded-t-2xl shadow-xl p-3 space-y-2 animate-slideUp max-h-[45vh] overflow-y-auto">
          {/* Pull Handle Bar (プルダウンで閉じるハンドルバー - テキスト非表示のシンプルデザイン) */}
          <button
            type="button"
            onClick={() => setSelectedStation(null)}
            className="w-full py-1.5 flex items-center justify-center cursor-pointer group hover:bg-[#F4F3F8] rounded-t-xl transition-colors"
            title="閉じる"
          >
            <div className="w-12 h-1.5 bg-[#D1C9E3] group-hover:bg-[#5B21B6] rounded-full transition-colors" />
          </button>

          <LocationStationDetailCard
            stationInfo={selectedStation}
          />
        </div>
      )}

      {/* Bottom Sheet / Active Selected Train Details Panel */}
      {selectedTrain && (
        <div ref={detailCardRef} className="fixed bottom-14 left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-[#E6E2EE] rounded-t-2xl shadow-lg p-4 space-y-3 animate-slideUp">
          {/* Pull Handle Bar (プルダウンで閉じるハンドルバー - テキスト非表示のシンプルデザイン) */}
          <button
            type="button"
            onClick={() => setSelectedTrain(null)}
            className="w-full py-1.5 -mt-1 flex items-center justify-center cursor-pointer group hover:bg-[#F4F3F8] rounded-t-xl transition-colors"
            title="閉じる"
          >
            <div className="w-12 h-1.5 bg-[#D1C9E3] group-hover:bg-[#5B21B6] rounded-full transition-colors" />
          </button>

          {/* Train Top Info Line */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-2">
              {(() => {
                let badgeBg = 'bg-slate-600 text-white'; // 各停・普通は灰色
                if (selectedTrain.trainType === '快速' || selectedTrain.trainType === '区間快速') {
                  badgeBg = 'bg-sky-600 text-white';
                } else if (selectedTrain.trainType === '急行' || selectedTrain.trainType === '通勤特快') {
                  badgeBg = 'bg-rose-600 text-white';
                } else if (selectedTrain.trainType === '特別快速') {
                  badgeBg = 'bg-amber-600 text-white';
                } else if (
                  selectedTrain.trainType.includes('特急') ||
                  selectedTrain.trainType.includes('めぐり') ||
                  selectedTrain.trainType.includes('Nライナー') ||
                  selectedTrain.trainType.includes('あやみ')
                ) {
                  badgeBg = 'bg-purple-700 text-white';
                }
                return (
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${badgeBg}`}>
                    {selectedTrain.trainType}
                  </span>
                );
              })()}
              <span className="text-base font-bold text-[#221C35]">
                {selectedTrain.destination} 行き
              </span>
              {selectedTrain.timetable.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-900 border border-purple-200 shrink-0">
                  始発: {selectedTrain.timetable[0].stationName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold bg-[#F4F3F8] text-[#221C35] px-2.5 py-1 rounded-xl border border-[#E6E2EE]">
                {selectedTrain.carCount}両
              </span>
            </div>
          </div>

          {/* Interactive Pull-down / Accordion Section (今後の停車駅時刻表) */}
          <div className="bg-[#F9F8FD] rounded-xl border border-[#E6E2EE] overflow-hidden">
            {/* Accordion Toggle Header */}
            <button
              type="button"
              onClick={() => setIsAccordionOpen(!isAccordionOpen)}
              className="w-full px-3 py-2.5 bg-[#EFE8FA]/60 hover:bg-[#EFE8FA] flex items-center justify-between text-xs font-bold text-[#5B21B6] cursor-pointer transition-colors border-b border-[#E6E2EE]"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#5B21B6]" />
                <span>今後の停車駅・所定/見込み時刻</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#6B6380]">
                <span>{isAccordionOpen ? 'たたむ' : '開く'}</span>
                {isAccordionOpen ? <ChevronUp className="w-4 h-4 text-[#5B21B6]" /> : <ChevronDown className="w-4 h-4 text-[#5B21B6]" />}
              </div>
            </button>

            {/* Accordion Collapsible Content */}
            {isAccordionOpen && (
              <div className="p-3 space-y-2 animate-fadeIn">
                {(() => {
                  // 現在位置より過去（過ぎた駅）を除外し、今後の停車駅のみフィルタリング
                  const currentStationIdx = displayStations.findIndex((s) => s.id === selectedTrain.stationId);
                  
                  const futureTimetable = selectedTrain.timetable.filter((item) => {
                    const itemStIdx = displayStations.findIndex((s) => s.name === item.stationName);
                    if (currentStationIdx === -1 || itemStIdx === -1) return true;
                    if (selectedTrain.direction === 1) {
                      return itemStIdx >= currentStationIdx;
                    } else {
                      return itemStIdx <= currentStationIdx;
                    }
                  });

                  return (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-[#857D99] pb-1 border-b border-[#E6E2EE]">
                        <span>停車駅</span>
                        <div className="flex items-center gap-6">
                          <span>所定時刻</span>
                          <span>見込み</span>
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                        {futureTimetable.length > 0 ? (
                          futureTimetable.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs font-bold py-1 border-b border-[#E6E2EE]/40 last:border-none">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#5B21B6]" />
                                <span className="text-[#221C35]">{item.stationName}</span>
                              </div>
                              <div className="flex items-center gap-8 font-mono">
                                <span className="text-[#6B6380]">{item.scheduledTime}</span>
                                <span className="text-[#5B21B6]">{item.estimatedTime}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-xs text-[#857D99] py-3">
                            まもなく終点に到着します
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
