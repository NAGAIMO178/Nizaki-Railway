// 予約の2つの規則(1人1件・同じ席の重なり)への対応。サーバー(gas/Code.gs の handleCreateReservation)の断りを受けて、画面に出す。
//  - seat_taken: その座席は、すでに予約されている / active_exists: いま、ほかの予約がある
//  - サーバーにある自分の予約(getMyReservations)を、端末の予約として出す(別の端末で予約した会員のため)
import type { ActiveOrder, EquipItem, SeatClass } from '../types';
import { effectiveAllocation, splitSeats } from './seatUtils';

export type RuleCode = 'seat_taken' | 'active_exists';

export interface RuleRefusal {
  code: RuleCode;
  message: string;
}

// サーバーが message を返さなかったときの文(サーバーの文と同じ)
export const RULE_MESSAGES: Record<RuleCode, string> = {
  seat_taken: 'その座席は、すでに予約されています。',
  active_exists: 'いま、ほかの予約があります。その予約が終わってから、ご予約ください。',
};

interface GasLike {
  status?: string;
  code?: string;
  message?: string;
  reservations?: unknown;
}

// サーバーの返事が、2つの規則の断りなら、その中身を返す(それ以外は null)
export const refusalOf = (res: GasLike | undefined | null): RuleRefusal | null => {
  if (!res || res.status !== 'error') return null;
  if (res.code !== 'seat_taken' && res.code !== 'active_exists') return null;
  const message = typeof res.message === 'string' && res.message.trim() ? res.message : RULE_MESSAGES[res.code];
  return { code: res.code, message };
};

// ---- 台帳へ送る中身 ----

// 台帳へ送る予約の中身(createReservation の order)。画像などは含めない
export const buildReservationOrder = (o: ActiveOrder) => {
  const { orderId, trainName, carNo, seatNo, seatType, boardingStation, destinationStation, departureTime, arrivalTime, reservedDate, totalPrice } = o;
  return {
    orderId,
    trainName,
    carNo,
    seatNo,
    seatType,
    boardingStation,
    destinationStation,
    departureTime,
    arrivalTime,
    reservedDate,
    totalPrice,
    items: (o.items || []).map((ci) => {
      // 複数席の予約は、どの席に何個届けるか(指定のない分は先頭の席)も送る
      const seats = splitSeats(o.seatNo);
      const allocation = seats.length >= 2 ? effectiveAllocation(ci.quantity, seats, o.itemSeats?.[ci.item.id]) : null;
      return { id: ci.item.id, name: ci.item.name, quantity: ci.quantity, price: ci.item.price, ...(allocation ? { seats: allocation } : {}) };
    }),
    itemDiscount: o.itemDiscount || 0,
    pointsUsed: o.pointsUsed || 0,
  };
};

// 「サーバーに、この中身で、すでに送った」の印に使う文字列(ポイントなど、サーバーが決める項目は含まない)
export const orderSignature = (o: ActiveOrder): string => JSON.stringify(buildReservationOrder(o));

// ---- サーバーにある自分の予約(getMyReservations) ----

export interface ServerReservation {
  orderId: string;
  trainName: string;
  carNo: number;
  seatNo: string;
  seatType: string;
  boardingStation: string;
  destinationStation: string;
  departureTime: string;
  arrivalTime: string;
  reservedDate: string;
  totalPrice: number;
  items: { name: string; quantity: number; price: number; seats?: Record<string, number> }[];
  itemDiscount: number;
  pointsUsed: number;
  boarded?: boolean;
}

const SEAT_CLASSES: SeatClass[] = ['standard', 'reserved', 'green', 'premium', 'megu', 'special'];

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

// 返事から、予約の一覧を取り出す。取れなかった(通信の失敗・断り)ときは null。形の合わないものは、読み飛ばす
export const parseMyReservations = (res: GasLike | undefined | null): ServerReservation[] | null => {
  if (!res || res.status !== 'success' || !Array.isArray(res.reservations)) return null;
  const out: ServerReservation[] = [];
  for (const raw of res.reservations as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const orderId = str(raw.orderId);
    if (!/^[A-Za-z0-9-]{3,40}$/.test(orderId)) continue;
    out.push({
      orderId,
      trainName: str(raw.trainName),
      carNo: num(raw.carNo),
      seatNo: str(raw.seatNo),
      seatType: str(raw.seatType),
      boardingStation: str(raw.boardingStation),
      destinationStation: str(raw.destinationStation),
      departureTime: str(raw.departureTime),
      arrivalTime: str(raw.arrivalTime),
      reservedDate: str(raw.reservedDate),
      totalPrice: num(raw.totalPrice),
      items: Array.isArray(raw.items)
        ? (raw.items as Record<string, unknown>[])
            .filter((it) => it && typeof it === 'object')
            .map((it) => ({
              name: str(it.name),
              quantity: num(it.quantity),
              price: num(it.price),
              ...(it.seats && typeof it.seats === 'object' && !Array.isArray(it.seats) ? { seats: it.seats as Record<string, number> } : {}),
            }))
        : [],
      itemDiscount: num(raw.itemDiscount),
      pointsUsed: num(raw.pointsUsed),
      boarded: raw.boarded === true,
    });
  }
  return out;
};

export const fetchMyReservations = async (call: (action: string, payload: Record<string, unknown>) => Promise<GasLike>, sessionToken: string): Promise<ServerReservation[] | null> => {
  try {
    return parseMyReservations(await call('getMyReservations', { sessionToken }));
  } catch {
    return null;
  }
};

// サーバーの予約を、端末の予約(ActiveOrder)の形にする。デリバリーの商品は、名前で、商品の一覧から探す(サーバーは商品の番号を残さない)
export const serverReservationToOrder = (r: ServerReservation, ownerEmail: string | undefined, equipItems: EquipItem[]): ActiveOrder => {
  const items: ActiveOrder['items'] = [];
  const itemSeats: NonNullable<ActiveOrder['itemSeats']> = {};
  for (const it of r.items) {
    if (it.quantity <= 0) continue;
    const known = equipItems.find((e) => e.name === it.name);
    const item: EquipItem = known ? { ...known, price: it.price } : { id: `server-${it.name}`, name: it.name, category: 'souvenir', price: it.price, image: '', description: '' };
    items.push({ item, quantity: it.quantity });
    if (it.seats) itemSeats[item.id] = it.seats;
  }
  const board = r.boardingStation;
  const seatType = (SEAT_CLASSES as string[]).includes(r.seatType) ? (r.seatType as SeatClass) : undefined;
  return {
    orderId: r.orderId,
    trainName: r.trainName,
    carNo: r.carNo,
    seatNo: r.seatNo,
    ...(seatType ? { seatType } : {}),
    boardingStation: board,
    destinationStation: r.destinationStation,
    departureTime: r.departureTime,
    arrivalTime: r.arrivalTime,
    reservedDate: r.reservedDate,
    items,
    ...(Object.keys(itemSeats).length > 0 ? { itemSeats } : {}),
    totalPrice: r.totalPrice,
    status: 'confirmed',
    estimatedDeliveryTime: `${board.replace('駅', '')}駅発車後 5分頃`,
    deliveryStation: board,
    ownerEmail,
    ...(r.itemDiscount > 0 ? { itemDiscount: r.itemDiscount } : {}),
    ...(r.pointsUsed > 0 ? { pointsUsed: r.pointsUsed } : {}),
  };
};

// 端末に出す、サーバーの予約を1件選ぶ。端末にすでに予約があるとき(同じ予約番号も含む)は、何もしない。
// このアプリは、予約を1件だけ持つ。サーバーに複数あれば(新しい順の先頭)1件だけ。この端末で取り消した予約は、出さない
export const pickReservationToImport = (list: ServerReservation[] | null, local: ActiveOrder | null, skipIds: ReadonlySet<string>): ServerReservation | null => {
  if (!list || local) return null;
  return list.find((r) => !skipIds.has(r.orderId)) ?? null;
};
