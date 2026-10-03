import { TrainLine, EquipItem } from '../types';
import gyokuroImg from '../assets/images/item_gyokuro_1785713816751.jpg';
import clockImg from '../assets/images/item_clock_1785713828591.jpg';
import parfaitImg from '../assets/images/item_parfait_1785713839429.jpg';
import craftbeerImg from '../assets/images/item_craftbeer_1785713851365.jpg';
import makunouchiImg from '../assets/images/item_makunouchi_1785713864189.jpg';
import hidaMatsutakeImg from '../assets/images/item_hida_matsutake_1785713876633.jpg';

export const MOCK_LINES: TrainLine[] = [
  {
    id: 'kanzaki',
    name: '1. 神埼線 (Y)',
    code: 'Y',
    color: '#8B5CF6', // Purple
    status: 'normal',
    statusText: '平常運転',
    infoMessage: '現在、全線(東京〜大宮〜横浜 全23駅)で平常通り運転を行っております。',
  },
  {
    id: 'express',
    name: '2. 神埼高速線 (NI)',
    code: 'NI',
    color: '#3B82F6', // Blue
    status: 'normal',
    statusText: '平常運転',
    infoMessage: '特急めぐり号を含む全列車が定時で運行中です(東京〜横浜 全9駅)。',
  },
  {
    id: 'saisen',
    name: '3. 埼千環状線 (SC)',
    code: 'SC',
    color: '#EC4899', // Pink
    status: 'normal',
    statusText: '平常運転',
    infoMessage: '内回り・外回りともにメガサークル区間(全20駅)で定時運行しています。',
  },
  {
    id: 'tsuchiura',
    name: '4. 土浦線 (TC)',
    code: 'TC',
    color: '#10B981', // Emerald Green
    status: 'normal',
    statusText: '平常運転',
    infoMessage: '松戸〜土浦・茨城空港・日立方面(全22駅)ともに順調です。',
  },
];

export const MOCK_EQUIP_ITEMS: EquipItem[] = [
  {
    id: 'eq-01',
    name: '極上 A5黒毛和牛すき焼きと薫り松茸御膳',
    category: 'bento',
    price: 2850,
    image: hidaMatsutakeImg,
    description: 'めぐシート限定。厳選したA5ランク黒毛和牛の贅沢すき焼きと、芳醇な松茸御飯を敷き詰めた極上車内御膳。',
    isPopular: true,
    isLimited: true,
    badge: 'めぐシート限定',
  },
  {
    id: 'eq-02',
    name: '四季の彩り 和牛・鰻・銀鮭のプレミアム幕の内',
    category: 'bento',
    price: 2280,
    image: makunouchiImg,
    description: '吟味された和牛照り焼き、国産鰻の蒲焼き、大ぶり銀鮭塩焼き、彩り旬菜の出汁煮物を詰め合わせた洗練幕の内。',
    isPopular: true,
    badge: '特選幕の内',
  },
  {
    id: 'eq-03',
    name: '常陸野クラフト生ビール ＆ 銘柄豚炙り燻製',
    category: 'drink',
    price: 1250,
    image: craftbeerImg,
    description: '冷やし常陸野ネスト生ビール缶と、職人が仕込んだ銘柄豚の厚切り炙り燻製ポークジャーキーの上質晩酌セット。',
    isPopular: true,
    badge: '晩酌セット',
  },
  {
    id: 'eq-04',
    name: '宇治抹茶極パフェ ＆ 濃密ピスタチオ',
    category: 'dessert',
    price: 780,
    image: parfaitImg,
    description: '専用保冷庫で冷やしてお届け。宇治抹茶グラニテと濃厚生クリーム、紫芋クランチの和洋折衷カップアイス。',
    isLimited: true,
    badge: '車内限定',
  },
  {
    id: 'eq-05',
    name: 'オリジナルゴールド箔卓上時計',
    category: 'souvenir',
    price: 2800,
    image: clockImg,
    description: 'ラベンダーパープルの車体を象っためぐシートご乗車記念アクリル時計（限定ゴールドアクリル台座付き）。',
    isLimited: true,
    badge: '乗車記念',
  },
  {
    id: 'eq-06',
    name: '有機宇治玉露 氷温抽出ボトル (500ml)',
    category: 'drink',
    price: 450,
    image: gyokuroImg,
    description: '神埼沿線茶園の初摘み一番茶を贅沢に氷温抽出。豊かな香りと芳醇な旨みが際立つ高級日本茶。',
    badge: '神埼特撰',
  },
];
