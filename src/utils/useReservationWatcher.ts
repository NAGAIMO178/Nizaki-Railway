// 予約の見守り(NIZAKI 2.0。公開後だけ働く)。ご予約の特急について、アプリを開いているあいだ、次を知らせる。
//  - 発車のリマインド: 発車の30分前と10分前(遅れていれば、遅れた発車の時刻を基準にする)。
//  - 列車の遅れ: 予約した特急が遅れているとき、1回だけ。
//  - お届け完了: デリバリーを注文していれば、乗車駅の発車の5分後(遅れていれば、その分あと)。注文の状態も進める。
//  - 同じ予約の同じ知らせは、1回だけ(再読み込みしても重ねない)。アプリを閉じているあいだは、知らせられない。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveOrder } from '../types';
import { EXPRESS_TYPES, findExpressTrips, loadExpressData, resolveTrainDelay } from './diaTimetable';
import { getNotificationPermissionState, sendLocalPushNotification } from './pushNotification';
import { formatSeats } from './seatUtils';

const SCAN_INTERVAL_MS = 30 * 1000;
const NOTICE_SHOW_MS = 20 * 1000;
const REMIND_MIN = [30, 10]; // 発車の何分前に知らせるか
export const DELIVERY_AFTER_DEPARTURE_MIN = 5; // 乗車駅の発車の何分後に、お届けとするか
const STORAGE_KEY = 'nizaki_reservation_notified';

export interface ReservationNotice {
  key: number;
  text: string;
}

interface Resolved {
  orderId: string;
  lineCode: string;
  code: string;
  dirIdx: 0 | 1;
  trainStartSec: number;
  depSec: number; // 乗車駅の発車(時刻表どおり。0時からの秒数)
  arrSec: number;
  dayStartMs: number;
  boarding: string;
  trainName: string;
  carNo: number;
  seatNo: string;
  hasItems: boolean;
}

const stripEki = (name: string): string => name.replace(/駅$/, '');
const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const readNotified = (orderId: string): Set<string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && raw.orderId === orderId && Array.isArray(raw.keys)) return new Set<string>(raw.keys);
  } catch {
    // 読めなければ、なし
  }
  return new Set<string>();
};

const writeNotified = (orderId: string, keys: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ orderId, keys: Array.from(keys) }));
  } catch {
    // 保存できなくても、この画面を開いているあいだは、重ねて知らせない
  }
};

// 予約から、ダイヤ上の列車を探す(特急の名前・乗る駅・降りる駅・日付から)
const resolveOrder = async (order: ActiveOrder): Promise<Resolved | null> => {
  const key = (Object.keys(EXPRESS_TYPES) as (keyof typeof EXPRESS_TYPES)[]).find((k) => order.trainName.startsWith(EXPRESS_TYPES[k].label));
  if (!key || !order.boardingStation || !order.destinationStation) return null;
  const cfg = EXPRESS_TYPES[key];
  const data = await loadExpressData(key); // 直通の特急(めぐり)は、2つの路線をつないだデータ
  const boarding = stripEki(order.boardingStation);
  const trip = findExpressTrips(data, cfg.typeName, boarding, stripEki(order.destinationStation)).find((t) => t.trainName === order.trainName);
  if (!trip) return null;
  const train = data.trains.find((t) => t[0] === trip.code);
  if (!train) return null;
  let dayStartMs: number;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(order.reservedDate || '');
  if (m) dayStartMs = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  else {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    dayStartMs = d.getTime();
  }
  return {
    orderId: order.orderId,
    lineCode: trip.boardLine ?? cfg.lineCode,
    code: trip.code,
    dirIdx: (data.master.dirs.indexOf(train[2]) === 1 ? 1 : 0) as 0 | 1,
    trainStartSec: train[4],
    depSec: trip.depSec,
    arrSec: trip.arrSec,
    dayStartMs,
    boarding,
    trainName: order.trainName,
    carNo: order.carNo,
    seatNo: order.seatNo,
    hasItems: !!order.items && order.items.length > 0,
  };
};

export function useReservationWatcher(opts: {
  enabled: boolean; // 公開後 かつ ログイン中
  order: ActiveOrder | null;
  onStatusChange: (orderId: string, status: ActiveOrder['status']) => void;
}): { notice: ReservationNotice | null; dismiss: () => void } {
  const { enabled, order } = opts;
  const [notice, setNotice] = useState<ReservationNotice | null>(null);
  const noticeTimerRef = useRef<number | undefined>(undefined);
  const noticeKeyRef = useRef(0);
  const onStatusRef = useRef(opts.onStatusChange);
  onStatusRef.current = opts.onStatusChange;
  const statusRef = useRef<ActiveOrder['status'] | undefined>(order?.status);
  statusRef.current = order?.status;

  const dismiss = useCallback(() => {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(null);
  }, []);

  const show = useCallback((text: string) => {
    window.clearTimeout(noticeTimerRef.current);
    noticeKeyRef.current += 1;
    setNotice({ key: noticeKeyRef.current, text });
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), NOTICE_SHOW_MS);
  }, []);

  const orderId = order?.orderId;
  const trainName = order?.trainName;
  const boardingStation = order?.boardingStation;
  const destinationStation = order?.destinationStation;
  const reservedDate = order?.reservedDate;

  useEffect(() => {
    if (!enabled || !order) {
      setNotice(null);
      return;
    }
    let alive = true;
    let timer: number | undefined;

    const notify = (title: string, body: string, tag: string) => {
      show(body);
      // 通知の許可がすでにあるときだけ、端末の通知も出す(ここで、許可を求めるお願いは出さない)
      if (getNotificationPermissionState() === 'granted') {
        sendLocalPushNotification({ title, body, tag }).catch(() => undefined);
      }
    };

    resolveOrder(order)
      .then((r) => {
        if (!alive || !r) return;
        const notified = readNotified(r.orderId);
        const mark = (k: string) => {
          notified.add(k);
          writeNotified(r.orderId, notified);
        };

        const scan = () => {
          const now = Date.now();
          const schedDepMs = r.dayStartMs + r.depSec * 1000;
          const arrMs = r.dayStartMs + r.arrSec * 1000;
          const delay = resolveTrainDelay(r.lineCode, r.code, r.dayStartMs, r.dirIdx, r.boarding, schedDepMs, r.trainStartSec);
          const delayMin = delay.isSuspended ? 0 : delay.delayMinutes;
          const depMs = schedDepMs + delayMin * 60 * 1000;
          const minsToDep = (depMs - now) / 60000;
          const tag = (kind: string) => `reservation-${r.orderId}-${kind}`;

          // 発車のリマインド(発車の前だけ。近いほうだけを、1回知らせる)
          if (minsToDep > 0) {
            const [far, near] = REMIND_MIN;
            if (minsToDep <= near && !notified.has(`remind${near}`)) {
              mark(`remind${far}`);
              mark(`remind${near}`);
              notify('【発車のお知らせ】', `ご予約の${r.trainName}は、あと約${Math.max(1, Math.ceil(minsToDep))}分で${r.boarding}駅を発車します(${r.carNo}号車 ${formatSeats(r.seatNo)})。`, tag('remind'));
            } else if (minsToDep <= far && !notified.has(`remind${far}`) && !notified.has(`remind${near}`)) {
              mark(`remind${far}`);
              notify('【発車のお知らせ】', `ご予約の${r.trainName}は、あと約${Math.ceil(minsToDep)}分で${r.boarding}駅を発車します(${r.carNo}号車 ${formatSeats(r.seatNo)})。`, tag('remind'));
            }
          }

          // 列車の遅れ(到着までのあいだに、1回)
          if (delayMin >= 1 && now < arrMs && !notified.has('delay')) {
            mark('delay');
            notify('【列車の遅れ】', `ご予約の${r.trainName}は、約${delayMin}分遅れています。${r.boarding}駅の発車は${hhmm(depMs)}の見込みです。`, tag('delay'));
          }

          // お届け: 発車したら「配達中」、発車の5分後に「お届け済み」(注文があるときだけ)
          if (r.hasItems && now >= depMs && now < arrMs) {
            if (statusRef.current === 'confirmed' || statusRef.current === 'preparing') {
              onStatusRef.current(r.orderId, 'delivering');
              statusRef.current = 'delivering';
            }
            if (now >= depMs + DELIVERY_AFTER_DEPARTURE_MIN * 60 * 1000) {
              if (statusRef.current !== 'delivered') {
                onStatusRef.current(r.orderId, 'delivered');
                statusRef.current = 'delivered';
              }
              if (!notified.has('delivered')) {
                mark('delivered');
                notify('【お届け完了】', `ご予約席(${r.carNo}号車 ${formatSeats(r.seatNo)})へ、ご注文のデリバリーをお届けしました。`, tag('delivered'));
              }
            }
          }
        };

        scan();
        timer = window.setInterval(() => {
          if (alive) scan();
        }, SCAN_INTERVAL_MS);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
    // 予約の中身が変わったときだけ、やり直す(状態の変化では、やり直さない)
  }, [enabled, orderId, trainName, boardingStation, destinationStation, reservedDate, show]);

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  return { notice, dismiss };
}
