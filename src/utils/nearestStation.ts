import { RegisterableStation } from '../components/MyStationRegisterCard';

export interface StationGeoData {
  id: string;
  name: string;
  code: string;
  lineName: string;
  lat: number;
  lng: number;
}

// 神埼鉄道グループ 4路線・全74駅の正確なGPS座標データ（全駅徹底対応）
export const KANZAKI_STATION_GEOS: StationGeoData[] = [
  // 1. 神埼線 (Nizaki Line / Y) - 全23駅
  { id: 'kanzaki_Y01', name: '東京', code: 'Y01', lineName: '1. 神埼線', lat: 35.6812, lng: 139.7671 },
  { id: 'kanzaki_Y02', name: '浅草', code: 'Y02', lineName: '1. 神埼線', lat: 35.7106, lng: 139.7966 },
  { id: 'kanzaki_Y03', name: '北千住', code: 'Y03', lineName: '1. 神埼線', lat: 35.7492, lng: 139.8052 },
  { id: 'kanzaki_Y04', name: '足立', code: 'Y04', lineName: '1. 神埼線', lat: 35.7750, lng: 139.8040 },
  { id: 'kanzaki_Y05', name: '草加', code: 'Y05', lineName: '1. 神埼線', lat: 35.8282, lng: 139.8021 },
  { id: 'kanzaki_Y06', name: '越谷レイクタウン', code: 'Y06', lineName: '1. 神埼線', lat: 35.8778, lng: 139.8267 },
  { id: 'kanzaki_Y07', name: '七光台', code: 'Y07', lineName: '1. 神埼線', lat: 35.9810, lng: 139.8510 },
  { id: 'kanzaki_Y08', name: '北春日部', code: 'Y08', lineName: '1. 神埼線', lat: 35.9902, lng: 139.7533 },
  { id: 'kanzaki_Y09', name: '地下鉄岩槻', code: 'Y09', lineName: '1. 神埼線', lat: 35.9500, lng: 139.6940 },
  { id: 'kanzaki_Y10', name: '蓮田', code: 'Y10', lineName: '1. 神埼線', lat: 35.9814, lng: 139.6531 },
  { id: 'kanzaki_Y11', name: '丸山', code: 'Y11', lineName: '1. 神埼線', lat: 35.9650, lng: 139.6180 },
  { id: 'kanzaki_Y12', name: '大宮', code: 'Y12', lineName: '1. 神埼線', lat: 35.9063, lng: 139.6240 },
  { id: 'kanzaki_Y13', name: '朝霞台', code: 'Y13', lineName: '1. 神埼線', lat: 35.8144, lng: 139.5872 },
  { id: 'kanzaki_Y14', name: '新座', code: 'Y14', lineName: '1. 神埼線', lat: 35.8037, lng: 139.5562 },
  { id: 'kanzaki_Y15', name: 'ひばりヶ丘', code: 'Y15', lineName: '1. 神埼線', lat: 35.7517, lng: 139.5453 },
  { id: 'kanzaki_Y16', name: '田無', code: 'Y16', lineName: '1. 神埼線', lat: 35.7275, lng: 139.5383 },
  { id: 'kanzaki_Y17', name: '武蔵境', code: 'Y17', lineName: '1. 神埼線', lat: 35.7022, lng: 139.5448 },
  { id: 'kanzaki_Y18', name: '中三鷹', code: 'Y18', lineName: '1. 神埼線', lat: 35.6880, lng: 139.5600 },
  { id: 'kanzaki_Y19', name: '調布', code: 'Y19', lineName: '1. 神埼線', lat: 35.6521, lng: 139.5441 },
  { id: 'kanzaki_Y20', name: '生田', code: 'Y20', lineName: '1. 神埼線', lat: 35.6152, lng: 139.5414 },
  { id: 'kanzaki_Y21', name: '溝の口', code: 'Y21', lineName: '1. 神埼線', lat: 35.5997, lng: 139.6105 },
  { id: 'kanzaki_Y22', name: '新横浜', code: 'Y22', lineName: '1. 神埼線', lat: 35.5074, lng: 139.6178 },
  { id: 'kanzaki_Y23', name: '横浜', code: 'Y23', lineName: '1. 神埼線', lat: 35.4658, lng: 139.6223 },

  // 2. 神埼高速線 (Nizaki Kosoku Line / NI) - 全9駅
  { id: 'kosoku_NI01', name: '東京', code: 'NI01', lineName: '2. 神埼高速線', lat: 35.6812, lng: 139.7671 },
  { id: 'kosoku_NI02', name: '新橋', code: 'NI02', lineName: '2. 神埼高速線', lat: 35.6664, lng: 139.7583 },
  { id: 'kosoku_NI03', name: '品川', code: 'NI03', lineName: '2. 神埼高速線', lat: 35.6284, lng: 139.7387 },
  { id: 'kosoku_NI04', name: '大井町', code: 'NI04', lineName: '2. 神埼高速線', lat: 35.6064, lng: 139.7344 },
  { id: 'kosoku_NI05', name: '平和島', code: 'NI05', lineName: '2. 神埼高速線', lat: 35.5819, lng: 139.7388 },
  { id: 'kosoku_NI06', name: '地下鉄蒲田', code: 'NI06', lineName: '2. 神埼高速線', lat: 35.5625, lng: 139.7161 },
  { id: 'kosoku_NI07', name: '川崎', code: 'NI07', lineName: '2. 神埼高速線', lat: 35.5313, lng: 139.6969 },
  { id: 'kosoku_NI08', name: '鶴見', code: 'NI08', lineName: '2. 神埼高速線', lat: 35.5085, lng: 139.6763 },
  { id: 'kosoku_NI09', name: '横浜', code: 'NI09', lineName: '2. 神埼高速線', lat: 35.4658, lng: 139.6223 },

  // 3. 埼千環状線 (Saichi Loop Line / SC) - 全20駅
  { id: 'saichi_SC01', name: '東京', code: 'SC01', lineName: '3. 埼千環状線', lat: 35.6812, lng: 139.7671 },
  { id: 'saichi_SC02', name: '南千住', code: 'SC02', lineName: '3. 埼千環状線', lat: 35.7337, lng: 139.7992 },
  { id: 'saichi_SC03', name: '北千住', code: 'SC03', lineName: '3. 埼千環状線', lat: 35.7492, lng: 139.8052 },
  { id: 'saichi_SC04', name: '綾瀬', code: 'SC04', lineName: '3. 埼千環状線', lat: 35.7621, lng: 139.8250 },
  { id: 'saichi_SC05', name: '松戸', code: 'SC05', lineName: '3. 埼千環状線', lat: 35.7843, lng: 139.9008 },
  { id: 'saichi_SC06', name: '柏', code: 'SC06', lineName: '3. 埼千環状線', lat: 35.8622, lng: 139.9710 },
  { id: 'saichi_SC07', name: '七光台', code: 'SC07', lineName: '3. 埼千環状線', lat: 35.9810, lng: 139.8510 },
  { id: 'saichi_SC08', name: '春日部', code: 'SC08', lineName: '3. 埼千環状線', lat: 35.9802, lng: 139.7523 },
  { id: 'saichi_SC09', name: '岩槻', code: 'SC09', lineName: '3. 埼千環状線', lat: 35.9502, lng: 139.6940 },
  { id: 'saichi_SC10', name: '大宮公園', code: 'SC10', lineName: '3. 埼千環状線', lat: 35.9180, lng: 139.6330 },
  { id: 'saichi_SC11', name: '大宮', code: 'SC11', lineName: '3. 埼千環状線', lat: 35.9063, lng: 139.6240 },
  { id: 'saichi_SC12', name: 'さいたま新都心', code: 'SC12', lineName: '3. 埼千環状線', lat: 35.8938, lng: 139.6336 },
  { id: 'saichi_SC13', name: '南浦和', code: 'SC13', lineName: '3. 埼千環状線', lat: 35.8475, lng: 139.6689 },
  { id: 'saichi_SC14', name: '西青木', code: 'SC14', lineName: '3. 埼千環状線', lat: 35.8150, lng: 139.7100 },
  { id: 'saichi_SC15', name: '川口', code: 'SC15', lineName: '3. 埼千環状線', lat: 35.8031, lng: 139.7175 },
  { id: 'saichi_SC16', name: '志村坂上', code: 'SC16', lineName: '3. 埼千環状線', lat: 35.7761, lng: 139.6960 },
  { id: 'saichi_SC17', name: '上板橋', code: 'SC17', lineName: '3. 埼千環状線', lat: 35.7635, lng: 139.6760 },
  { id: 'saichi_SC18', name: '小竹向原', code: 'SC18', lineName: '3. 埼千環状線', lat: 35.7436, lng: 139.6792 },
  { id: 'saichi_SC19', name: '池袋', code: 'SC19', lineName: '3. 埼千環状線', lat: 35.7295, lng: 139.7109 },
  { id: 'saichi_SC20', name: '新宿', code: 'SC20', lineName: '3. 埼千環状線', lat: 35.6895, lng: 139.7005 },

  // 4. 土浦線 (Tsuchiura Line / TC) - 全22駅
  { id: 'tsuchiura_TC01', name: '松戸', code: 'TC01', lineName: '4. 土浦線', lat: 35.7843, lng: 139.9008 },
  { id: 'tsuchiura_TC02', name: '新松戸', code: 'TC02', lineName: '4. 土浦線', lat: 35.8252, lng: 139.9211 },
  { id: 'tsuchiura_TC03', name: '松が丘', code: 'TC03', lineName: '4. 土浦線', lat: 35.8420, lng: 139.9450 },
  { id: 'tsuchiura_TC04', name: '柏', code: 'TC04', lineName: '4. 土浦線', lat: 35.8622, lng: 139.9710 },
  { id: 'tsuchiura_TC05', name: '守谷', code: 'TC05', lineName: '4. 土浦線', lat: 35.9502, lng: 139.9926 },
  { id: 'tsuchiura_TC06', name: '谷井田', code: 'TC06', lineName: '4. 土浦線', lat: 35.9750, lng: 140.0500 },
  { id: 'tsuchiura_TC07', name: '森の里', code: 'TC07', lineName: '4. 土浦線', lat: 36.0080, lng: 140.1000 },
  { id: 'tsuchiura_TC08', name: '荒川沖', code: 'TC08', lineName: '4. 土浦線', lat: 36.0315, lng: 140.1668 },
  { id: 'tsuchiura_TC09', name: '土浦', code: 'TC09', lineName: '4. 土浦線', lat: 36.0782, lng: 140.2064 },
  { id: 'tsuchiura_TC10', name: '高浜', code: 'TC10', lineName: '4. 土浦線', lat: 36.1285, lng: 140.2882 },
  { id: 'tsuchiura_TC11', name: '茨城空港', code: 'TC11', lineName: '4. 土浦線', lat: 36.1812, lng: 140.4135 },
  { id: 'tsuchiura_TC12', name: '鹿島旭', code: 'TC12', lineName: '4. 土浦線', lat: 36.2420, lng: 140.4900 },
  { id: 'tsuchiura_TC13', name: '大洗', code: 'TC13', lineName: '4. 土浦線', lat: 36.3150, lng: 140.5600 },
  { id: 'tsuchiura_TC14', name: '那珂湊', code: 'TC14', lineName: '4. 土浦線', lat: 36.3450, lng: 140.5980 },
  { id: 'tsuchiura_TC15', name: '平磯', code: 'TC15', lineName: '4. 土浦線', lat: 36.3600, lng: 140.6120 },
  { id: 'tsuchiura_TC16', name: 'ひたちなか海浜公園', code: 'TC16', lineName: '4. 土浦線', lat: 36.4020, lng: 140.5980 },
  { id: 'tsuchiura_TC17', name: '久慈川', code: 'TC17', lineName: '4. 土浦線', lat: 36.4600, lng: 140.6080 },
  { id: 'tsuchiura_TC18', name: '大甕（おおみか）', code: 'TC18', lineName: '4. 土浦線', lat: 36.5135, lng: 140.6212 },
  { id: 'tsuchiura_TC19', name: '東大沼', code: 'TC19', lineName: '4. 土浦線', lat: 36.5500, lng: 140.6400 },
  { id: 'tsuchiura_TC20', name: '多賀', code: 'TC20', lineName: '4. 土浦線', lat: 36.5535, lng: 140.6480 },
  { id: 'tsuchiura_TC21', name: '会瀬（おうせ）', code: 'TC21', lineName: '4. 土浦線', lat: 36.5820, lng: 140.6580 },
  { id: 'tsuchiura_TC22', name: '日立', code: 'TC22', lineName: '4. 土浦線', lat: 36.5986, lng: 140.6625 },
];

// Haversine formula: 2点間の距離(km)を計算
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // 地球の半径 (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface NearestStationResult {
  station: RegisterableStation | null;
  distanceKm: number;
  isWithinRange: boolean;
  message?: string;
}

/**
 * 現在地から最寄りの神埼鉄道グループ駅を判定
 */
export async function findNearestStation(): Promise<NearestStationResult> {
  if (!navigator.geolocation) {
    throw new Error('お使いの端末・ブラウザは位置情報(GPS)機能に対応していません。');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        let closestStation: StationGeoData | null = null;
        let minDistance = Infinity;

        KANZAKI_STATION_GEOS.forEach((st) => {
          const dist = calculateDistanceKm(userLat, userLng, st.lat, st.lng);
          if (dist < minDistance) {
            minDistance = dist;
            closestStation = st;
          }
        });

        if (!closestStation) {
          resolve({
            station: null,
            distanceKm: 0,
            isWithinRange: false,
            message: '周辺に神埼鉄道グループの駅が見つかりませんでした。',
          });
          return;
        }

        // 50km以内の場合のみ最寄り駅として判定
        const isWithinRange = minDistance <= 50;

        const regStation: RegisterableStation = {
          id: (closestStation as StationGeoData).id,
          name: (closestStation as StationGeoData).name,
          code: (closestStation as StationGeoData).code,
          lineName: (closestStation as StationGeoData).lineName,
        };

        resolve({
          station: regStation,
          distanceKm: minDistance,
          isWithinRange,
          message: isWithinRange
            ? `最寄り駅: ${regStation.name}駅 (約${minDistance}km)`
            : `最寄りの${regStation.name}駅まで約${minDistance}kmです（神埼鉄道線エリア外）。`,
        });
      },
      (error) => {
        let errorMsg = '位置情報の取得に失敗しました。';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = '位置情報の利用許可が拒否されました。ブラウザ設定で位置情報を許可してください。';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = '現在地を取得できませんでした。';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = '位置情報の取得がタイムアウトしました。';
        }
        reject(new Error(errorMsg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}
