export type TabType = 'home' | 'location' | 'reservation' | 'equip' | 'events' | 'settings';

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
  onlySeatTypes?: SeatClass[]; // 指定した座席の種類で予約したお客様だけ注文できる(未指定なら誰でも)
}

// 座席の種類(予約画面で選んだもの): 自由席 / 普通指定席 / あやみ+ / プレミアム / めぐシート
export type SeatClass = 'standard' | 'reserved' | 'green' | 'premium' | 'megu';

export interface ActiveOrder {
  orderId: string;
  trainName: string; // e.g. "特急めぐり 3号"
  carNo: number;
  seatNo: string;
  seatType?: SeatClass;
  boardingStation?: string;
  destinationStation?: string;
  departureTime?: string;
  arrivalTime?: string;
  reservedDate?: string; // 予約日 (YYYY-MM-DD)。到着時刻を過ぎたら自動終了する基準
  items: { item: EquipItem; quantity: number }[];
  totalPrice: number;
  status: 'confirmed' | 'preparing' | 'delivering' | 'delivered';
  estimatedDeliveryTime: string;
  deliveryStation: string;
}

// 終了した予約(乗車済み・キャンセル)の記録。アカウント利用履歴の「特急券」「デリバリー」に表示する
export interface OrderHistoryItem {
  orderId: string;
  trainName: string;
  carNo: number;
  seatNo: string;
  seatType?: SeatClass;
  boardingStation?: string;
  destinationStation?: string;
  departureTime?: string;
  arrivalTime?: string;
  reservedDate?: string;
  ticketPrice: number;
  items: { name: string; quantity: number; price: number }[];
  result: 'completed' | 'cancelled';
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
  sessionToken?: string; // GASが発行するログイン証(予約の記録などに使う。デモ会員は無し)
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

