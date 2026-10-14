// 遅れの見張り(NIZAKI 2.0。公開後だけ働く)。
// 列車位置タブを開いていなくても、アプリを開いていれば、全路線・両方面の列車の遅れを見張って、知らせる。
//  - 同じ列車は、同じ日に1回だけ知らせる(再読み込みしても、重ねて知らせない)。
//  - 路線ごとに、続けて知らせない時間(クールダウン)を置く。
//  - アプリを開いた直後に、すでに遅れている列車が2本以上あるときは、まとめて1回だけ知らせる。
//  - アプリを閉じているあいだは、知らせられない(ブラウザの仕組みによる)。
import { useCallback, useEffect, useRef, useState } from 'react';
import { computeLiveTrains, getCachedLineData, loadLineData, normalizeStationName } from './diaTimetable';
import { DelayNotifyMode } from './delayNotifySettings';
import { getNotificationPermissionState, sendLocalPushNotification } from './pushNotification';

const SCAN_INTERVAL_MS = 30 * 1000;
const LINE_COOLDOWN_MS = 15 * 60 * 1000; // 同じ路線で、続けて知らせない時間
const NOTICE_SHOW_MS = 20 * 1000; // 画面の帯を出しておく時間
const MYSTATION_WINDOW_MIN = 60; // 「マイ駅に関係する」: この分数以内に、マイ駅に着く(通る)予定
const PAST_GRACE_MIN = 5; // 着く時刻をこの分数すぎても、まだ「関係する」とみなす
const MIN_DELAY_MIN = 1; // これ以上の遅れを知らせる(分)
const SUSPENDED_DELAY = 99; // 運転見合わせの印(列車位置と同じ)
const STORAGE_KEY = 'nizaki_delay_notified';

// 路線(画面の路線ID・ダイヤの路線コード・路線名)
const LINES = [
  { id: 'kanzaki', code: 'Y', name: '神埼線' },
  { id: 'kanzaki_kosoku', code: 'NI', name: '神埼高速線' },
  { id: 'saichi_loop', code: 'SC', name: '埼千環状線' },
  { id: 'tsuchiura', code: 'TC', name: '土浦線' },
];

export interface DelayNotice {
  key: number;
  text: string;
}

interface DelayedTrain {
  key: string; // 日付と列車ID
  lineId: string;
  lineName: string;
  text: string;
  stopNames: string[];
  stopTimes: string[];
}

const todayKey = (now: Date): string => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

const readNotified = (day: string): Set<string> => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && raw.day === day && Array.isArray(raw.keys)) return new Set<string>(raw.keys);
  } catch {
    // 読めなければ、なし
  }
  return new Set<string>();
};

const writeNotified = (day: string, keys: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day, keys: Array.from(keys).slice(-300) }));
  } catch {
    // 保存できなくても、この画面を開いているあいだは、重ねて知らせない
  }
};

// "HH:MM" が、いまから何分後か(0〜1439)。いまより前は、1439に近い大きな数になる
const minutesFromNow = (hhmm: string, now: Date): number => {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return Infinity;
  return (((h * 60 + m) - (now.getHours() * 60 + now.getMinutes())) % 1440 + 1440) % 1440;
};

export function useDelayWatcher(opts: {
  enabled: boolean; // 公開後 かつ 設定が「オフ」でない
  mode: DelayNotifyMode;
  myStationNames: string[];
}): { notice: DelayNotice | null; dismiss: () => void } {
  const { enabled, mode, myStationNames } = opts;
  const [notice, setNotice] = useState<DelayNotice | null>(null);
  const noticeTimerRef = useRef<number | undefined>(undefined);
  const noticeKeyRef = useRef(0);
  const firstScanDoneRef = useRef(false);
  const lastByLineRef = useRef<Record<string, number>>({});
  // 最新の設定を、タイマーの中から読む
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const stationsRef = useRef(myStationNames);
  stationsRef.current = myStationNames;

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

  useEffect(() => {
    if (!enabled) {
      setNotice(null);
      firstScanDoneRef.current = false;
      return;
    }
    let alive = true;

    const notify = (title: string, body: string, tag: string) => {
      show(body);
      // 通知の許可がすでにあるときだけ、端末の通知を出す(ここで、許可を求めるお願いは出さない)
      if (getNotificationPermissionState() === 'granted') {
        sendLocalPushNotification({ title, body, tag }).catch(() => undefined);
      }
    };

    const scan = () => {
      const now = new Date();
      const nowMs = now.getTime();
      const day = todayKey(now);
      const notified = readNotified(day);

      // いま遅れている列車を、全路線・両方面から集める
      const delayed: DelayedTrain[] = [];
      for (const line of LINES) {
        const data = getCachedLineData(line.code);
        if (!data) continue;
        for (const direction of [1, 2] as const) {
          for (const t of computeLiveTrains(data, line.id, direction, nowMs)) {
            if (t.delayMinutes < MIN_DELAY_MIN || t.delayMinutes >= SUSPENDED_DELAY) continue;
            delayed.push({
              key: `${day}|${t.id}`,
              lineId: line.id,
              lineName: line.name,
              text: `${line.name} ${t.trainType}（${t.destination}行）で約 ${t.delayMinutes} 分の遅れが発生しています。`,
              stopNames: t.timetable.map((s) => normalizeStationName(s.stationName)),
              // 遅れた列車の「着く見込みの時刻」で、マイ駅に近いかを調べる
              stopTimes: t.timetable.map((s) => s.estimatedTime),
            });
          }
        }
      }

      // 設定が「マイ駅に関係するものだけ」のときは、マイ駅に、これから停まる列車に絞る
      let candidates = delayed;
      if (modeRef.current === 'mystation') {
        const mine = stationsRef.current.map(normalizeStationName);
        candidates = delayed.filter((d) =>
          d.stopNames.some((name, i) => {
            if (!mine.includes(name)) return false;
            const m = minutesFromNow(d.stopTimes[i], now);
            // これから60分以内に着く見込み(着く時刻を、数分すぎたところも含める)
            return m <= MYSTATION_WINDOW_MIN || m >= 1440 - PAST_GRACE_MIN;
          })
        );
      }
      const fresh = candidates.filter((d) => !notified.has(d.key));

      // アプリを開いた直後: すでに遅れている列車が2本以上なら、まとめて1回だけ知らせる
      if (!firstScanDoneRef.current) {
        firstScanDoneRef.current = true;
        if (fresh.length >= 2) {
          fresh.forEach((d) => notified.add(d.key));
          writeNotified(day, notified);
          const lines = Array.from(new Set(fresh.map((d) => d.lineName))).join('・');
          notify('【列車遅延】', `現在、${fresh.length}本の列車で遅れが出ています（${lines}）。`, 'delay-summary');
          fresh.forEach((d) => (lastByLineRef.current[d.lineId] = nowMs));
          return;
        }
      }

      // 1回の確認で、知らせるのは1本だけ。路線ごとのクールダウン中の路線は、あとで知らせる
      const next = fresh.find((d) => nowMs - (lastByLineRef.current[d.lineId] ?? 0) >= LINE_COOLDOWN_MS);
      if (!next) return;
      notified.add(next.key);
      writeNotified(day, notified);
      lastByLineRef.current[next.lineId] = nowMs;
      notify(`【列車遅延発生】${next.lineName}`, next.text, `delay-${next.key}`);
    };

    // 4路線のダイヤを読み込んでから、見張りを始める
    Promise.all(LINES.map((l) => loadLineData(l.code)))
      .then(() => {
        if (!alive) return;
        scan();
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => {
      if (alive) scan();
    }, SCAN_INTERVAL_MS);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [enabled, show]);

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  return { notice, dismiss };
}
