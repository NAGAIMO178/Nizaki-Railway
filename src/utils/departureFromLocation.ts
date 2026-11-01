// 経路検索の出発駅を、いまいる場所の最寄り駅にする。
// 位置情報は、ブラウザの許可の画面で許可されたときだけ使う。座標は、最寄り駅を決めるあいだだけ使い、サーバーへ送らず、端末にも残さない
// (外へ出すのは、駅の名前だけ)。許可されない・失敗・遠すぎるときは、何も決めない(null)。
import { KANZAKI_STATION_GEOS, calculateDistanceKm } from './nearestStation';
import { normalizeStationName } from './diaTimetable';

// これより遠いときは、最寄り駅にしない(km)
export const MAX_DEPARTURE_KM = 20;

// 座標から、経路検索の駅の名前(available の中のもの)で、最寄りの駅を返す。遠すぎる・該当なしは null
export const departureFromCoords = (lat: number, lng: number, available: string[], maxKm: number = MAX_DEPARTURE_KM): string | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: { name: string; km: number } | null = null;
  for (const st of KANZAKI_STATION_GEOS) {
    const name = normalizeStationName(st.name);
    if (!available.includes(name)) continue;
    const km = calculateDistanceKm(lat, lng, st.lat, st.lng);
    if (!best || km < best.km) best = { name, km };
  }
  return best && best.km <= maxKm ? best.name : null;
};

// 許可の画面を出して、最寄り駅を探す。位置情報が使えない・許可されない・時間切れ・遠すぎるときは null
export const locateDepartureStation = (available: string[]): Promise<string | null> => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(departureFromCoords(pos.coords.latitude, pos.coords.longitude, available)),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    } catch {
      resolve(null);
    }
  });
};
