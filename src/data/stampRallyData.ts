import { KanzakiEvent } from '../types';

export type RallyDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface StampStation {
  id: string;
  name: string;
  nameKana: string;
  code: string;
  line: string;
  description: string;
  spotGuide: string;
  lat: number;
  lng: number;
  stampDesign: {
    iconName: string;
    subText: string;
    color: string;
  };
}

export interface StampCourse {
  id: RallyDifficulty;
  title: string;
  difficultyLabel: string;
  levelBadge: string;
  targetCount: number;
  subtitle: string;
  description: string;
  targetVibe: string;
  rewardPoints: number;
  rewardBadge: string;
  color: string;
  gradient: string;
  lineCouponText: string;
  lineKeyword: string;
  lineCouponCode: string;
  bonusPoints: number;
  couponRewardTitle: string;
  couponRewardDetail: string;
  stations: StampStation[];
}

export const STAMP_COURSES: Record<RallyDifficulty, StampCourse> = {
  beginner: {
    id: 'beginner',
    title: '【初級】都市圏イージー',
    difficultyLabel: '初級コース',
    levelBadge: '★☆☆☆☆ EASY',
    targetCount: 3,
    subtitle: '通勤・買い物ついでに達成できる都心・副都心コース',
    description: '日頃のお買い物や通勤・通学のついでにサクッと巡れる定番3駅！神埼線・埼千環状線の主要ターミナル駅を巡り、デジタルスタンプラリーの楽しさを体験しましょう。',
    targetVibe: '通勤・買い物ついでに達成',
    rewardPoints: 300,
    rewardBadge: '都市圏マスターバッジ',
    color: '#059669', // emerald
    gradient: 'from-emerald-600 to-teal-700',
    lineCouponText: '車内デリバリー 1品20%OFFクーポン',
    lineKeyword: '初級クリア済み',
    lineCouponCode: 'KZ-EASY-20',
    bonusPoints: 200,
    couponRewardTitle: 'デリバリー1品 20%割引 ＆ +200 pt',
    couponRewardDetail: '車内デリバリー（E-DELIVERY）注文時に、お好きな商品1品が20%割引になるクーポンと、N-POINTボーナス200ptが付与されます。',
    stations: [
      {
        id: 'st-omiya',
        name: '大宮駅',
        nameKana: 'おおみやえき',
        code: 'Y20 / SC12',
        line: '神埼線 / 埼千環状線',
        description: '埼玉県最大のメガターミナル。鉄道博物館やルミネなどお買い物スポットも充実。',
        spotGuide: '中央改札南側・コンコース付近（GPS有効範囲: 駅半径300m）',
        lat: 35.9063,
        lng: 139.6240,
        stampDesign: {
          iconName: 'Building2',
          subText: '鉄道と商業のメガ拠点',
          color: '#059669',
        },
      },
      {
        id: 'st-tokyo',
        name: '東京駅',
        nameKana: 'とうきょうえき',
        code: 'Y01 / NI01 / SC01',
        line: '神埼線 / 神埼高速線 / 埼千環状線',
        description: '赤レンガ駅舎が美しい日本のセントラルステーション。神埼線全系統の起点。',
        spotGuide: '丸の内地下南口 改札外コンコース（GPS有効範囲: 駅半径300m）',
        lat: 35.6812,
        lng: 139.7671,
        stampDesign: {
          iconName: 'Landmark',
          subText: '歴史を紡ぐ赤レンガの起点',
          color: '#D97706',
        },
      },
      {
        id: 'st-kashiwa',
        name: '柏駅',
        nameKana: 'かしわえき',
        code: 'TC04 / SC08',
        line: '土浦線 / 埼千環状線',
        description: '東葛エリア随一の若者とショッピングの街。駅前デッキと商業施設が直結。',
        spotGuide: '中央口改札前・東西連絡自由通路（GPS有効範囲: 駅半径300m）',
        lat: 35.8622,
        lng: 139.9710,
        stampDesign: {
          iconName: 'ShoppingBag',
          subText: '賑わい集う東葛のクロスロード',
          color: '#2563EB',
        },
      },
    ],
  },
  intermediate: {
    id: 'intermediate',
    title: '【中級】中都市ステップ',
    difficultyLabel: '中級コース',
    levelBadge: '★★★☆☆ MEDIUM',
    targetCount: 4,
    subtitle: '休日の日帰りお出かけ・街歩きにぴったりな4駅コース',
    description: '千葉・茨城の個性あふれる中核都市を電車でホッピング！松戸のラーメン街、土浦の霞ヶ浦レイクサイド、つくばの科学・研究拠点をめぐる日帰り小旅行に最適なコースです。',
    targetVibe: '休日の日帰りお出かけ',
    rewardPoints: 600,
    rewardBadge: '中都市エキスパートバッジ',
    color: '#D97706', // amber
    gradient: 'from-amber-600 to-orange-700',
    lineCouponText: '特急予約 乗車運賃10%OFFクーポン',
    lineKeyword: '中級クリア済み',
    lineCouponCode: 'KZ-STEP-10',
    bonusPoints: 500,
    couponRewardTitle: '特急予約 乗車運賃10%割引 ＆ +500 pt',
    couponRewardDetail: '特急予約時に、区間の乗車基本運賃が10%割引になるクーポンと、N-POINTボーナス500ptが付与されます。',
    stations: [
      {
        id: 'st-matsudo',
        name: '松戸駅',
        nameKana: 'まつどえき',
        code: 'TC01 / SC05',
        line: '土浦線 / 埼千環状線',
        description: '神埼鉄道の本社・総合車両基地を擁する中核駅。江戸川の潤いと名店が広がる街。',
        spotGuide: '西口・東口連絡コンコース（GPS有効範囲: 駅半径300m）',
        lat: 35.7844,
        lng: 139.9008,
        stampDesign: {
          iconName: 'TrainTrack',
          subText: '神埼鉄道の拠点・車両のふるさと',
          color: '#7C3AED',
        },
      },
      {
        id: 'st-tsuchiura',
        name: '土浦駅',
        nameKana: 'つちうらえき',
        code: 'TC15',
        line: '土浦線',
        description: '霞ヶ浦に面するサイクリング＆水辺の街。駅直結のサイクリングリゾートが人気。',
        spotGuide: '改札口正面・プレイアトレ土浦入口（GPS有効範囲: 駅半径300m）',
        lat: 36.0788,
        lng: 140.2062,
        stampDesign: {
          iconName: 'Bike',
          subText: '霞ヶ浦を臨む水郷サイクリングシティ',
          color: '#0D9488',
        },
      },
      {
        id: 'st-minaminagareyama',
        name: '南流山駅',
        nameKana: 'みなみながれやまえき',
        code: 'TC03 / SC07',
        line: '土浦線 / 埼千環状線',
        description: '各線が交差する交通の要衝。つくば・都心・埼玉方面へのスマートアクセス拠点。',
        spotGuide: '地下乗換通路・改札階コンコース（GPS有効範囲: 駅半径300m）',
        lat: 35.8378,
        lng: 139.9038,
        stampDesign: {
          iconName: 'GitMerge',
          subText: '多方面を繋ぐスマートジャンクション',
          color: '#EC4899',
        },
      },
      {
        id: 'st-tsukuba',
        name: 'つくば駅',
        nameKana: 'つくばえき',
        code: 'TC09',
        line: '土浦線 つくば支線',
        description: '筑波研究学園都市の中心。JAXAや科学館、筑波山への玄関口として賑わう。',
        spotGuide: 'A3出口・つくばセンターバスターミナル前（GPS有効範囲: 駅半径300m）',
        lat: 36.0825,
        lng: 140.1110,
        stampDesign: {
          iconName: 'Rocket',
          subText: '科学と自然が調和する未来都市',
          color: '#3B82F6',
        },
      },
    ],
  },
  advanced: {
    id: 'advanced',
    title: '【上級】ディープ神埼線',
    difficultyLabel: '上級コース',
    levelBadge: '★★★★★ HARD',
    targetCount: 3,
    subtitle: '本格的な乗り鉄・ローカル旅を満喫するマニアック3駅',
    description: '神埼線の歴史を感じる宿場町・草加から、利根川を越える取手、そしてローカル情緒あふれる高浜まで！知る人ぞ知るディープな名所を巡る、乗り鉄・鉄道ファン納得の踏破コース。',
    targetVibe: '本格的な乗り鉄・ローカル旅',
    rewardPoints: 1000,
    rewardBadge: '神埼線グランドマスターピン',
    color: '#7C3AED', // purple
    gradient: 'from-purple-700 to-indigo-900',
    lineCouponText: '1日フリー乗車券（特急予約時の乗車運賃タダ）',
    lineKeyword: '上級クリア済み',
    lineCouponCode: 'KZ-DEEP-FREE',
    bonusPoints: 1000,
    couponRewardTitle: '1日フリー乗車券（乗車運賃 ¥0 無料） ＆ +1,000 pt',
    couponRewardDetail: '特急予約時に区間乗車運賃が完全に無料（¥0）になる1日フリー乗車券と、N-POINTボーナス1,000ptが付与されます。',
    stations: [
      {
        id: 'st-takahama',
        name: '高浜駅',
        nameKana: 'たかはまえき',
        code: 'TC20',
        line: '土浦線（茨城ローカル区間）',
        description: '歴史ある静かな佇まいを見せるローカル駅。のどかな田園と霞ヶ浦高浜入りの風情。',
        spotGuide: '駅舎前ロータリー・改札口（GPS有効範囲: 駅半径300m）',
        lat: 36.2235,
        lng: 140.3015,
        stampDesign: {
          iconName: 'Trees',
          subText: '風情漂う郷愁のローカル駅',
          color: '#16A34A',
        },
      },
      {
        id: 'st-soka',
        name: '草加駅',
        nameKana: 'そうかえき',
        code: 'Y07',
        line: '神埼線（日光街道区間）',
        description: '草加せんべいと旧日光街道の松並木で名高い宿場町。神埼線の急行・快足停車駅。',
        spotGuide: '東口・西口自由通路改札前（GPS有効範囲: 駅半径300m）',
        lat: 35.8286,
        lng: 139.8055,
        stampDesign: {
          iconName: 'Cookie',
          subText: '宿場町のおもかげと名産草加煎餅',
          color: '#EA580C',
        },
      },
      {
        id: 'st-toride',
        name: '取手駅',
        nameKana: 'とりでえき',
        code: 'TC05',
        line: '土浦線',
        description: '利根川を渡ってすぐの茨城の玄関口。アートの街としても知られる歴史ある駅。',
        spotGuide: '東口改札外・利根川展望歩道デッキ付近（GPS有効範囲: 駅半径300m）',
        lat: 35.8962,
        lng: 140.0632,
        stampDesign: {
          iconName: 'Waves',
          subText: '利根川を渡る常陸のゲートウェイ',
          color: '#0284C7',
        },
      },
    ],
  },
};

export interface AppliedCouponRecord {
  courseId: RallyDifficulty;
  code: string;
  appliedAt: string;
  rewardTitle: string;
  rewardDetail: string;
  bonusPoints: number;
}

// クーポンコードの正規化と検証
export function findCourseByCouponCode(rawCode: string): StampCourse | null {
  const normalized = rawCode.trim().toUpperCase().replace(/[\s_]/g, '-');
  for (const course of Object.values(STAMP_COURSES)) {
    if (
      course.lineCouponCode.toUpperCase() === normalized ||
      course.lineCouponCode.replace(/-/g, '').toUpperCase() === normalized.replace(/-/g, '')
    ) {
      return course;
    }
  }
  return null;
}
