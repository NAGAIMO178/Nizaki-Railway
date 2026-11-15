// 経路検索の出発駅を、いまいる場所の最寄り駅にする。
// 位置情報は、ブラウザの許可の画面で許可されたときだけ使う。座標は、最寄り駅を決めるあいだだけ使い、サーバーへ送らず、端末にも残さない
// (外へ出すのは、駅の名前だけ)。許可されない・失敗・遠すぎるときは、何も決めない(null)。
import { stationGeos, calculateDistanceKm } from './nearestStation';
import { normalizeStationName } from './diaTimetable';
import { recentPosition, rememberPosition } from './recentPosition';

// これより遠いときは、最寄り駅にしない(km)
export const MAX_DEPARTURE_KM = 20;

// 座標から、経路検索の駅の名前(available の中のもの)で、最寄りの駅を返す。遠すぎる・該当なしは null
export const departureFromCoords = (lat: number, lng: number, available: string[], maxKm: number = MAX_DEPARTURE_KM): string | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: { name: string; km: number } | null = null;
  for (const st of stationGeos()) {
    const name = normalizeStationName(st.name);
    if (!available.includes(name)) continue;
    const km = calculateDistanceKm(lat, lng, st.lat, st.lng);
    if (!best || km < best.km) best = { name, km };
  }
  return best && best.km <= maxKm ? best.name : null;
};

// 許可の画面を出して、いまいる場所を調べる(同時に何度頼まれても、1回だけ。分かった場所は、数分だけ覚えて使い回せる=recentPosition)。使えない・許可されない・時間切れは null
let pending: Promise<{ lat: number; lng: number } | null> | null = null;
export const requestPosition = (): Promise<{ lat: number; lng: number } | null> => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  if (pending) return pending;
  const p = new Promise<{ lat: number; lng: number } | null>((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          rememberPosition(lat, lng);
          resolve({ lat, lng });
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    } catch {
      resolve(null);
    }
  });
  pending = p;
  void p.then(() => {
    if (pending === p) pending = null;
  });
  return p;
};

// 許可の画面を出して、最寄り駅を探す。位置情報が使えない・許可されない・時間切れ・遠すぎるときは null
export const locateDepartureStation = async (available: string[]): Promise<string | null> => {
  const p = await requestPosition();
  return p ? departureFromCoords(p.lat, p.lng, available) : null;
};

// 駅を選ぶシート用: 直近に場所が分かっていれば(ホームの最寄り駅の探しなど)、それを使い回す。無ければ、探す
export const findNearestForPicker = (available: string[]): Promise<string | null> => {
  const p = recentPosition();
  return p ? Promise.resolve(departureFromCoords(p.lat, p.lng, available)) : locateDepartureStation(available);
};
