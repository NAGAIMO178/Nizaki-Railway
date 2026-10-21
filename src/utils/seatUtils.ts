import type { SeatClass, EquipItem, ActiveOrder } from '../types';

// 座席の種類の表示名。予約済みの席が何の席かを、画面ごとにばらばらに判定しないようここに集める
export function getSeatClassLabel(seatType?: SeatClass): string {
  switch (seatType) {
    case 'megu':
      return 'めぐシート';
    case 'green':
      return 'あやみ+';
    case 'premium':
      return 'プレミアム席';
    case 'reserved':
      return '普通指定席';
    case 'standard':
      return '自由席';
    default:
      return '普通席';
  }
}

// 車内デリバリーを使える座席: めぐシートのお客様だけ
export function canUseDelivery(seatType?: SeatClass): boolean {
  return seatType === 'megu';
}

// 座席の種類による注文制限(「めぐシート限定」など)。制限がなければ誰でも注文できる
export function canOrderItem(item: EquipItem, seatType?: SeatClass): boolean {
  if (!item.onlySeatTypes || item.onlySeatTypes.length === 0) return true;
  return seatType !== undefined && item.onlySeatTypes.includes(seatType);
}

export function getItemRestrictionLabel(item: EquipItem): string {
  return `${(item.onlySeatTypes || []).map((t) => getSeatClassLabel(t)).join('・')}限定`;
}

// 予約カードの帯に出す文言(めぐシートだけ「（プレミアム）」を付ける従来の表記)
export function getSeatClassRibbon(seatType?: SeatClass): string {
  return `${seatType === 'megu' ? 'めぐシート（プレミアム）' : getSeatClassLabel(seatType)} 予約確定`;
}

// ---- 複数席(1つの予約に、同じ号車の席を最大6席) ----
// 座席番号は、1席なら '4B'、複数席なら '4B,4C'(席ごとにカンマ)、自由席なら '自由席' または人数つきの '自由席×3'。
// サーバー(gas/Code.gs の parseSeats)と同じ決まり
export const MAX_SEATS = 6;
const FREE_SEAT = '自由席';
const FREE_SEAT_PATTERN = /^自由席×(\d{1,3})$/;

// 座席番号から、席の名前の一覧を作る(自由席×3 は、自由席1・自由席2・自由席3)
export function splitSeats(seatNo: string): string[] {
  const text = String(seatNo ?? '').trim();
  const free = FREE_SEAT_PATTERN.exec(text);
  if (free) {
    const n = Math.min(Number(free[1]), MAX_SEATS);
    return n <= 1 ? [FREE_SEAT] : Array.from({ length: n }, (_, i) => `${FREE_SEAT}${i + 1}`);
  }
  const seats = text.split(',').map((v) => v.trim()).filter((v) => v !== '');
  return seats.length > 0 ? seats : [text];
}

// 席の数(=人数)
export const seatCountOf = (seatNo: string): number => splitSeats(seatNo).length;

// 自由席の人数を、台帳に残す座席番号にする(1人は、これまでどおり '自由席')
export const freeSeatNo = (count: number): string => (count >= 2 ? `${FREE_SEAT}×${Math.min(Math.floor(count), MAX_SEATS)}` : FREE_SEAT);

// 席の名前の表示(自由席の2人目は「2人目」。ほかは、そのまま)
export function seatDisplayName(seat: string): string {
  const m = /^自由席(\d)$/.exec(seat);
  return m ? `${m[1]}人目` : seat;
}

// 画面に出す座席の文字。1席・自由席1人は台帳の文字のまま(これまでの表示と同じ)。複数席は「4B・4C」、自由席の複数人は「3人」
export function formatSeats(seatNo: string): string {
  const text = String(seatNo ?? '');
  const free = FREE_SEAT_PATTERN.exec(text.trim());
  if (free) {
    const n = Math.min(Number(free[1]), MAX_SEATS);
    return n >= 2 ? `${n}人` : FREE_SEAT;
  }
  const seats = splitSeats(text);
  return seats.length >= 2 ? seats.join('・') : text;
}

// 席の一覧として出す座席か(指定席の複数席。1席と自由席は、文字のまま出す)
export const hasSeatList = (seatNo: string): boolean => {
  const seats = splitSeats(seatNo);
  return seats.length >= 2 && !seats[0].startsWith(FREE_SEAT);
};

// 「4号車 4B・4C席」(履歴の見出し用。自由席の人数は「席」を付けない)
export const seatTitle = (carNo: number, seatNo: string): string => `${carNo}号車 ${formatSeats(seatNo)}${/^自由席×/.test(seatNo) ? '' : '席'}`;

// 「4号車 普通指定席 4B・4C」
export const seatLabel = (order: Pick<ActiveOrder, 'carNo' | 'seatType' | 'seatNo'>): string =>
  `${order.carNo}号車 ${getSeatClassLabel(order.seatType)} ${formatSeats(order.seatNo)}`;

// 商品1つを、席ごとに何個届けるか。席を指定した分(この予約の席・注文の個数まで)以外は、先頭の席へ届ける
export function effectiveAllocation(quantity: number, seats: string[], explicit?: { [seat: string]: number }): { [seat: string]: number } {
  const out: { [seat: string]: number } = {};
  let used = 0;
  seats.forEach((seat) => {
    const n = Math.floor(explicit?.[seat] ?? 0);
    if (n > 0 && used + n <= quantity) {
      out[seat] = n;
      used += n;
    }
  });
  if (used < quantity && seats.length > 0) out[seats[0]] = (out[seats[0]] || 0) + quantity - used;
  return out;
}

export interface SeatDelivery {
  seat: string;
  items: { name: string; quantity: number }[];
}

// 席ごとの届け先(お届けする商品がある席だけ。席の並び順)
export function deliveryBySeat(order: Pick<ActiveOrder, 'seatNo' | 'items' | 'itemSeats'>): SeatDelivery[] {
  const seats = splitSeats(order.seatNo);
  const bySeat = new Map<string, SeatDelivery['items']>(seats.map((seat) => [seat, []]));
  (order.items || []).forEach((ci) => {
    const alloc = effectiveAllocation(ci.quantity, seats, order.itemSeats?.[ci.item.id]);
    seats.forEach((seat) => {
      if (alloc[seat] > 0) bySeat.get(seat)!.push({ name: ci.item.name, quantity: alloc[seat] });
    });
  });
  return seats.map((seat) => ({ seat, items: bySeat.get(seat)! })).filter((d) => d.items.length > 0);
}

// Deterministic seed-based random seat generator
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isTodayWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6; // 0=Sun, 6=Sat
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number) {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function generateOccupiedSeats(
  dateStr: string,
  trainKey: string,
  carNo: number,
  isSpecialCar: boolean
): string[] {
  const isWeekend = isTodayWeekend();
  const seedString = `${dateStr}_${trainKey}_car_${carNo}`;
  let seed = stringToSeed(seedString);

  const rows = isSpecialCar ? 8 : 10;
  const cols = isSpecialCar ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  const occupied: string[] = [];

  // Weekend: less vacant seats (60% ~ 85% occupied)
  // Weekday: moderate occupied seats (25% ~ 55% occupied)
  const minOccupancy = isWeekend ? 0.62 : 0.28;
  const maxOccupancy = isWeekend ? 0.85 : 0.58;

  let rand = seededRandom(seed++);
  const targetOccupancyRatio = minOccupancy + rand * (maxOccupancy - minOccupancy);

  for (let r = 1; r <= rows; r++) {
    for (const c of cols) {
      const seatId = `${r}${c}`;
      rand = seededRandom(seed++);
      if (rand < targetOccupancyRatio) {
        occupied.push(seatId);
      }
    }
  }

  return occupied;
}
