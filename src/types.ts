export type TabType = 'home' | 'location' | 'reservation' | 'equip' | 'events' | 'settings';

export interface KanzakiEvent {
  id: string;
  title: string;
  subtitle: string;
  category: 'stamp' | 'tour' | 'kids' | 'seasonal' | 'special';
  categoryLabel: string;
  period: string;
  location: string;
  description: string;
  details: string[];
  imageUrl: string;
  badge?: string;
  status: 'open' | 'upcoming' | 'ending_soon' | 'ended';
  capacity?: string;
  fee?: string;
  isJoined?: boolean;
  pointReward?: number;
  stampProgress?: {
    current: number;
    total: number;
    checkpoints: { name: string; station: string; checked: boolean }[];
  };
}

export interface TrainLine {
  id: string;
  name: string;
  code: string;
  color: string;
  status: 'normal' | 'delay' | 'suspended';
  statusText: string;
  delayMinutes?: number;
  infoMessage?: string;
}

export interface DepartureInfo {
  id: string;
  lineName: string;
  platform: string;
  trainType: '特別快速' | '特急' | '特急めぐり号' | '急行' | '普通' | '通勤快速';
  trainTypeColor: string;
  destination: string;
  departureTime: string; // e.g. "14:02"
  minutesRemaining: number;
  congestion: 'vacant' | 'normal' | 'crowded' | 'very_crowded'; // 混雑度
  carCount: number;
  doorPosition: string;
  isMeguriExpress?: boolean;
  hasEDelivery?: boolean;
  nextStops: string[];
}

export interface Station {
  id: string;
  name: string;
  nameKana: string;
  code: string;
  lines: string[];
  platforms: {
    number: string;
    lineName: string;
    direction: string;
    departures: DepartureInfo[];
  }[];
}

export interface EquipItem {
  id: string;
  name: string;
  category: 'bento' | 'drink' | 'dessert' | 'souvenir';
  price: number;
  image: string;
  description: string;
  isPopular?: boolean;
  isLimited?: boolean;
  badge?: string;
}

export interface LiveTrain {
  id: string;
  trainNumber: string; // e.g. "1402M"
  lineId: string;
  trainType: string;
  trainTypeColor: string;
  destination: string;
  currentSection: string; // e.g. "松戸 〜 神埼本町"
  direction: 'up' | 'down';
  delayMinutes: number;
  status: 'moving' | 'stopped' | 'approaching';
  carCount: number;
  hasSeatDelivery?: boolean;
}

export interface ActiveOrder {
  orderId: string;
  trainName: string; // e.g. "特急めぐり 3号"
  carNo: number;
  seatNo: string;
  seatType?: 'megu' | 'standard';
  boardingStation?: string;
  destinationStation?: string;
  departureTime?: string;
  arrivalTime?: string;
  items: { item: EquipItem; quantity: number }[];
  totalPrice: number;
  status: 'confirmed' | 'preparing' | 'delivering' | 'delivered';
  estimatedDeliveryTime: string;
  deliveryStation: string;
}

export interface PointHistoryItem {
  id: string;
  title: string;
  date: string;
  points: number;
  type: 'reservation' | 'stamp' | 'coupon' | 'equip';
}

export interface UserProfile {
  memberId: string;
  name: string;
  email: string;
  rank: 'レギュラー' | 'ゴールド' | 'プレミアム';
  joinDate: string;
}

export interface AccountActivityItem {
  id: string;
  category: 'ticket' | 'delivery' | 'event' | 'point';
  title: string;
  subtitle: string;
  date: string;
  status: string;
  statusColor?: string;
  amount?: string;
  pointsEarned?: number;
  details?: Record<string, string>;
}

