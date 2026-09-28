import React, { useState } from 'react';
import { ArrowRightLeft, MapPin, Train, ChevronDown, ChevronUp } from 'lucide-react';

export interface LocationStationInfo {
  name: string;
  code?: string;
  transfers?: string[];
}

interface LocationStationDetailCardProps {
  stationInfo: LocationStationInfo;
}

// 社内線（当社線）データ構造
interface CompanyLineInfo {
  id: string;
  name: string;
  code: string;
  color: string;
  direction: string;
}

// 社内線のマスター情報
const COMPANY_LINES: Record<string, CompanyLineInfo> = {
  Y: { id: 'kanzaki', name: '神埼線', code: 'Y', color: '#8B5CF6', direction: '大宮・横浜方面 / 東京方面' },
  NI: { id: 'kanzaki_kosoku', name: '神埼高速線', code: 'NI', color: '#3B82F6', direction: '横浜方面 / 東京方面' },
  SC: { id: 'saichi_loop', name: '埼千環状線', code: 'SC', color: '#EC4899', direction: '大宮・柏方面 / 新宿・東京方面' },
  TC: { id: 'tsuchiura', name: '土浦線', code: 'TC', color: '#10B981', direction: '土浦・日立方面 / 松戸・東京方面' },
};

// 他社線・接続マスター情報
interface OtherLineInfo {
  name: string;
  badge: string;
  bgClass: string;
  textClass: string;
  gateNotice?: string;
}

const OTHER_LINES_DATABASE: Record<string, OtherLineInfo[]> = {
  '東京': [
    { name: 'JR東日本（山手線・京浜東北線・中央線・東海道線・横須賀線・総武快速線・京葉線等）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '1階 八重洲・丸の内中央改札口' },
    { name: '新幹線（東海道・山陽・東北・上越・北陸新幹線）', badge: '新幹線', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '八重洲北口 / 丸の内地下改札' },
    { name: '東京メトロ 丸ノ内線', badge: '地下鉄', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '地下中央通路連絡口' },
  ],
  '浅草': [
    { name: '東京メトロ銀座線', badge: '地下鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '地下連絡通路（1番出入口）' },
    { name: '都営地下鉄浅草線', badge: '地下鉄', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: 'A4・A5出口経由 徒歩3分' },
    { name: '東武スカイツリーライン（伊勢崎線）', badge: '東武', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '松屋浅草1階 正面改札口' },
  ],
  '北千住': [
    { name: 'JR東日本（常磐線 快速・各駅停車）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '2階 仲町改札口' },
    { name: '東京メトロ（千代田線・日比谷線）', badge: '地下鉄', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: '地下連絡通路' },
    { name: '東武スカイツリーライン（伊勢崎線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '2階 東武正面改札' },
    { name: 'つくばエクスプレス（TX）', badge: 'TX', bgClass: 'bg-indigo-100 border-indigo-300', textClass: 'text-indigo-900', gateNotice: '3階 TX連絡改札口' },
  ],
  '足立': [
    { name: '都営バス / 京成バス（足立区内主要路線・西新井・千住方面）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '駅前バスターミナル 1〜3番のりば' },
  ],
  '草加': [
    { name: '東武スカイツリーライン（伊勢崎線 - 急行・準急・各停）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '改札口横 東武乗換跨線橋' },
  ],
  '越谷レイクタウン': [
    { name: 'JR東日本（武蔵野線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR高架改札口（イオンレイクタウン直結）' },
  ],
  '七光台': [
    { name: '東武アーバンパークライン（野田線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '自由通路改札口' },
  ],
  '北春日部': [
    { name: '東武スカイツリーライン・伊勢崎線', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '橋上改札口' },
  ],
  '地下鉄岩槻': [
    { name: '埼玉高速鉄道線（浦和美園・赤羽岩淵・目黒方面）', badge: '地下鉄', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: '地下連絡通路1番連絡口' },
    { name: '東武アーバンパークライン（岩槻駅連絡バス）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '地上ターミナル 徒歩4分' },
  ],
  '蓮田': [
    { name: 'JR東日本（宇都宮線・東北本線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR蓮田駅 東口改札' },
  ],
  '丸山': [
    { name: '埼玉新都市交通ニューシャトル（大宮〜内宿）', badge: '私鉄', bgClass: 'bg-indigo-100 border-indigo-300', textClass: 'text-indigo-900', gateNotice: '高架連絡通路' },
  ],
  '大宮': [
    { name: 'JR東日本（宇都宮線・高崎線・湘南新宿ライン・埼京線・川越線等）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '中央改札（北・南）' },
    { name: '新幹線（東北・北海道・山形・秋田・上越・北陸新幹線）', badge: '新幹線', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '2階 新幹線中央乗り換え口' },
    { name: '東武アーバンパークライン（野田線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '東口改札横 東武乗車口' },
    { name: '埼玉新都市交通ニューシャトル', badge: '私鉄', bgClass: 'bg-indigo-100 border-indigo-300', textClass: 'text-indigo-900', gateNotice: '西口連絡ペデストリアンデッキ経由' },
  ],
  '朝霞台': [
    { name: '東武東上線（朝霞台駅）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '南口改札 徒歩1分' },
    { name: 'JR東日本（武蔵野線 - 北朝霞駅）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '高架下連絡通路 徒歩1分' },
  ],
  '新座': [
    { name: 'JR東日本（武蔵野線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR新座駅 南口連絡口' },
  ],
  'ひばりヶ丘': [
    { name: '西武池袋線（急行・快速急行・各停）', badge: '西武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '西武ひばりヶ丘駅 改札口' },
  ],
  '田無': [
    { name: '西武新宿線（急行・準急・各停）', badge: '西武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '田無駅 北口連絡口' },
  ],
  '武蔵境': [
    { name: 'JR東日本（中央線 快速）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR中央改札口' },
    { name: '西武多摩川線', badge: '西武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '西武のりば改札' },
  ],
  '中三鷹': [
    { name: 'JR東日本（中央線・総武線 各駅停車直通バス）', badge: 'JR/バス', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '三鷹駅南口直行バス連絡' },
  ],
  '調布': [
    { name: '京王線・京王相模原線（特急・急行・各停）', badge: '京王', bgClass: 'bg-pink-100 border-pink-300', textClass: 'text-pink-900', gateNotice: '地下1階 中央改札口' },
  ],
  '生田': [
    { name: '小田急電鉄（小田急小田原線）', badge: '小田急', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: '小田急生田駅 自由通路改札' },
  ],
  '溝の口': [
    { name: '東急電鉄（田園都市線・大井町線）', badge: '東急', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '東急溝の口駅 正面改札口' },
    { name: 'JR東日本（南武線 - 武蔵溝ノ口駅）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'ペデストリアンデッキ経由 徒歩1分' },
  ],
  '新横浜': [
    { name: '東海道新幹線（JR東海）', badge: '新幹線', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '2階 新幹線改札口' },
    { name: 'JR東日本（横浜線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR北口改札' },
    { name: '相鉄・東急直通線（新横浜線）', badge: '東急/相鉄', bgClass: 'bg-purple-100 border-purple-300', textClass: 'text-purple-900', gateNotice: '地下2階 南北改札' },
    { name: '横浜市営地下鉄ブルーライン', badge: '地下鉄', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '地下1階 地下鉄連絡改札' },
  ],
  '横浜': [
    { name: 'JR東日本（東海道線・横須賀線・京浜東北線・根岸線・横浜線直通）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '中央北・中央南改札' },
    { name: '東急東横線・横浜高速鉄道みなとみらい線', badge: '東急', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '地下3階 東急連絡口' },
    { name: '京浜急行電鉄（京急本線）', badge: '京急', bgClass: 'bg-red-100 border-red-300', textClass: 'text-red-900', gateNotice: '中央改札口横 京急連絡口' },
    { name: '相模鉄道（相鉄本線）', badge: '相鉄', bgClass: 'bg-indigo-100 border-indigo-300', textClass: 'text-indigo-900', gateNotice: '相鉄1階・2階改札口' },
    { name: '横浜市営地下鉄ブルーライン', badge: '地下鉄', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '地下2階 地下鉄中央改札' },
  ],
  '新橋': [
    { name: 'JR東日本（山手線・京浜東北線・東海道線・横須賀線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '烏森口 / 汐留口改札' },
    { name: '東京メトロ銀座線 / 都営地下鉄浅草線', badge: '地下鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '地下乗り換え連絡通路' },
    { name: 'ゆりかもめ（東京臨海新交通臨海線）', badge: '私鉄', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: 'ペデストリアンデッキ2階改札' },
  ],
  '品川': [
    { name: 'JR東日本（山手線・京浜東北線・東海道線・横須賀線・常磐線直通）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '2階 自由通路中央改札' },
    { name: '東海道新幹線（JR東海）', badge: '新幹線', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '港南口 新幹線のりば' },
    { name: '京浜急行電鉄（京急本線・羽田空港国際線直通）', badge: '京急', bgClass: 'bg-red-100 border-red-300', textClass: 'text-red-900', gateNotice: '高輪口 / JR・京急中間連絡改札' },
  ],
  '大井町': [
    { name: 'JR東日本（京浜東北線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR中央改札口' },
    { name: '東急電鉄（東急大井町線）', badge: '東急', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '東急正面改札口' },
    { name: '東京臨海高速鉄道（りんかい線 - お台場方面）', badge: '私鉄', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: '地下2階 りんかい線連絡口' },
  ],
  '平和島': [
    { name: '京浜急行電鉄（京急本線 - 特急・急行・普通）', badge: '京急', bgClass: 'bg-red-100 border-red-300', textClass: 'text-red-900', gateNotice: '平和島駅 改札口' },
  ],
  '地下鉄蒲田': [
    { name: 'JR東日本（京浜東北線 - 蒲田駅）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '地下通路出入口5番 徒歩3分' },
    { name: '東急電鉄（池上線・東急多摩川線）', badge: '東急', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '蒲田駅 東急2階改札口' },
    { name: '京急バス（羽田空港・京急蒲田駅行）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '東口バスターミナル' },
  ],
  '川崎': [
    { name: 'JR東日本（東海道線・京浜東北線・南武線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '中央改札・北改札' },
    { name: '京浜急行電鉄（京急川崎駅 - 本線・大師線）', badge: '京急', bgClass: 'bg-red-100 border-red-300', textClass: 'text-red-900', gateNotice: 'アゼリア地下街経由 徒歩3分' },
  ],
  '鶴見': [
    { name: 'JR東日本（京浜東北線・鶴見線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '東口・西口改札' },
    { name: '京浜急行電鉄（京急鶴見駅）', badge: '京急', bgClass: 'bg-red-100 border-red-300', textClass: 'text-red-900', gateNotice: 'ペデストリアンデッキ経由 徒歩1分' },
  ],
  '南千住': [
    { name: 'JR東日本（常磐線 快速）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR改札口' },
    { name: '東京メトロ日比谷線', badge: '地下鉄', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: '日比谷線歩道橋連絡口' },
    { name: 'つくばエクスプレス（TX）', badge: 'TX', bgClass: 'bg-indigo-100 border-indigo-300', textClass: 'text-indigo-900', gateNotice: 'TX南千住駅 改札口' },
  ],
  '綾瀬': [
    { name: '東京メトロ千代田線', badge: '地下鉄', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '東口・西口改札' },
    { name: 'JR東日本（常磐線 各駅停車直通）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'メトロ・JR共同ホーム' },
  ],
  '松戸': [
    { name: 'JR東日本（常磐線 快速・各駅停車）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '中央改札口（JR共通改札）' },
    { name: '京成電鉄（京成松戸線）', badge: '京成', bgClass: 'bg-pink-100 border-pink-300', textClass: 'text-pink-900', gateNotice: '西口乗り換え歩道橋' },
  ],
  '柏': [
    { name: 'JR東日本（常磐線 快速・各駅停車）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '中央改札口' },
    { name: '東武アーバンパークライン（野田線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '東武専用南改札口' },
  ],
  '春日部': [
    { name: '東武スカイツリーライン（伊勢崎線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '東口・西口改札' },
    { name: '東武アーバンパークライン（野田線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '7・8番線ホーム乗り換え' },
  ],
  '岩槻': [
    { name: '東武アーバンパークライン（野田線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '橋上駅舎改札口' },
  ],
  '大宮公園': [
    { name: '東武アーバンパークライン（野田線）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '大宮公園入口改札' },
  ],
  'さいたま新都心': [
    { name: 'JR東日本（宇都宮線・高崎線・京浜東北線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '東西自由通路改札（さいたまスーパーアリーナ直結）' },
  ],
  '南浦和': [
    { name: 'JR東日本（京浜東北線・武蔵野線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '改札内立体乗り換え階' },
  ],
  '西青木': [
    { name: '埼玉高速鉄道（鳩ヶ谷・川口元郷駅アクセスバス）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '駅前バスのりば' },
  ],
  '川口': [
    { name: 'JR東日本（京浜東北線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR川口駅 東口・西口改札' },
  ],
  '志村坂上': [
    { name: '都営地下鉄三田線', badge: '地下鉄', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: 'A1・A2出入口' },
  ],
  '上板橋': [
    { name: '東武東上線（準急・各停）', badge: '東武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '上板橋駅 北口・南口改札' },
  ],
  '小竹向原': [
    { name: '東京メトロ（有楽町線・副都心線）', badge: '地下鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '地下乗り換えホーム' },
    { name: '西武有楽町線（西武池袋線直通）', badge: '西武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '同ホーム対面乗り換え' },
  ],
  '池袋': [
    { name: 'JR東日本（山手線・埼京線・湘南新宿ライン等）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '北改札・中央改札・南改札' },
    { name: '東京メトロ（丸ノ内線・有楽町線・副都心線）', badge: '地下鉄', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '地下通路各線連絡口' },
    { name: '東武東上線 / 西武池袋線', badge: '私鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '東武北口改札 / 西武南口改札' },
  ],
  '新宿': [
    { name: 'JR東日本（山手線・中央線・埼京線・湘南新宿ライン等）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '東西自由通路・南口改札' },
    { name: '京王線・京王新線 / 小田急小田原線', badge: '私鉄', bgClass: 'bg-pink-100 border-pink-300', textClass: 'text-pink-900', gateNotice: '西口地下改札 / 小田急地下改札' },
    { name: '東京メトロ丸ノ内線 / 都営地下鉄（新宿線・大江戸線）', badge: '地下鉄', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '地下プロムナード連絡口' },
    { name: '西武新宿線（西武新宿駅）', badge: '西武', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: 'サブナード地下街経由 徒歩6分' },
  ],
  '新松戸': [
    { name: 'JR東日本（常磐線各駅停車・武蔵野線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR新松戸駅 改札口' },
    { name: '流鉄流山線（幸谷駅）', badge: '私鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '駅前ロータリー対面 徒歩1分' },
  ],
  '松が丘': [
    { name: '京成電鉄（京成松戸線・八柱駅バス連絡）', badge: '京成/バス', bgClass: 'bg-pink-100 border-pink-300', textClass: 'text-pink-900', gateNotice: '駅前バスのりば' },
  ],
  '守谷': [
    { name: 'つくばエクスプレス（TX）', badge: 'TX', bgClass: 'bg-indigo-100 border-indigo-300', textClass: 'text-indigo-900', gateNotice: '2階 中央連絡自由通路' },
    { name: '関東鉄道常総線（取手〜水海道〜下館）', badge: '私鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '1階 関鉄改札口' },
  ],
  '谷井田': [
    { name: '関東鉄道バス（取手・守谷・つくばみらい方面）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '谷井田交差点バスターミナル' },
  ],
  '森の里': [
    { name: '関東鉄道バス（牛久駅・みらい平駅方面）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '森の里中央バス停' },
  ],
  '荒川沖': [
    { name: 'JR東日本（常磐線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR荒川沖駅 橋上改札口' },
  ],
  '土浦': [
    { name: 'JR東日本（常磐線 - 特急ときわ等）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR土浦駅 改札口' },
    { name: '関東鉄道バス（筑波山・阿見・霞ヶ浦観光船方面）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '西口バスターミナル' },
  ],
  '高浜': [
    { name: 'JR東日本（常磐線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR高浜駅 改札口' },
  ],
  '茨城空港': [
    { name: '茨城空港リムジンバス（東京駅・水戸駅・石岡駅直行）', badge: 'バス/空港', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: 'ターミナル1階 バス乗り場1〜3番' },
    { name: '国内線・国際線（スカイマーク・春秋航空等）', badge: '飛行機', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: '2階 出発ロビー' },
  ],
  '鹿島旭': [
    { name: '鹿島臨海鉄道大洗鹿島線（水戸〜鹿島神宮）', badge: '私鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '駅舎改札口' },
  ],
  '大洗': [
    { name: '鹿島臨海鉄道大洗鹿島線', badge: '私鉄', bgClass: 'bg-amber-100 border-amber-300', textClass: 'text-amber-900', gateNotice: '大洗駅構内' },
    { name: '商船三井フェリー（苫小牧行フェリーターミナル連絡バス）', badge: 'フェリー', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '駅前バスのりば 徒歩1分' },
  ],
  '那珂湊': [
    { name: 'ひたちなか海浜鉄道湊線（勝田〜阿字ヶ浦）', badge: '私鉄', bgClass: 'bg-orange-100 border-orange-300', textClass: 'text-orange-900', gateNotice: '那珂湊駅 本屋改札' },
  ],
  '平磯': [
    { name: 'ひたちなか海浜鉄道湊線', badge: '私鉄', bgClass: 'bg-orange-100 border-orange-300', textClass: 'text-orange-900', gateNotice: 'ホーム入口' },
  ],
  'ひたちなか海浜公園': [
    { name: 'ひたちなか海浜鉄道湊線', badge: '私鉄', bgClass: 'bg-orange-100 border-orange-300', textClass: 'text-orange-900', gateNotice: '公園口連絡口' },
    { name: '国営ひたち海浜公園シャトルバス（茨城交通）', badge: 'バス', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '海浜公園西口・翼のゲート直結' },
  ],
  '久慈川': [
    { name: '茨城交通バス（勝田・常陸太田・日立方面）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '久慈川橋本バス停' },
  ],
  '大甕（おおみか）': [
    { name: 'JR東日本（常磐線）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR大甕駅 地下自由通路改札' },
    { name: '日立BRT（ひたち都市圏バス高速輸送システム）', badge: 'BRT', bgClass: 'bg-teal-100 border-teal-300', textClass: 'text-teal-900', gateNotice: 'BRT専用ホーム' },
  ],
  '東大沼': [
    { name: '日立BRT / 茨城交通バス', badge: 'BRT', bgClass: 'bg-teal-100 border-teal-300', textClass: 'text-teal-900', gateNotice: 'BRT乗降バスターミナル' },
  ],
  '多賀': [
    { name: 'JR東日本（常磐線 - 常陸多賀駅）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR常陸多賀駅 改札口' },
  ],
  '会瀬（おうせ）': [
    { name: '茨城交通バス（日立港・日立駅中央口行）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '国道245号沿いバス停' },
  ],
  '日立': [
    { name: 'JR東日本（常磐線 - 特急ひたち・ときわ）', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: 'JR日立駅 展望自由通路改札' },
    { name: '茨城交通バス（高萩・常陸太田・日立市内各方面）', badge: 'バス', bgClass: 'bg-stone-100 border-stone-300', textClass: 'text-stone-900', gateNotice: '中央口バスターミナル' },
  ],
};

export const LocationStationDetailCard: React.FC<LocationStationDetailCardProps> = ({
  stationInfo,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const name = stationInfo.name;

  // 当社線（社内乗り換え）リストの抽出
  const companyLines: CompanyLineInfo[] = [];
  if (stationInfo.transfers) {
    stationInfo.transfers.forEach((code) => {
      if (COMPANY_LINES[code]) {
        companyLines.push(COMPANY_LINES[code]);
      }
    });
  }

  // もし当社線リストに含まれていない場合は、駅名で当社所属線を追加
  if (companyLines.length === 0) {
    if (name.includes('松戸') || name.includes('柏') || name.includes('土浦') || name.includes('日立')) {
      companyLines.push(COMPANY_LINES.TC);
    }
    if (name.includes('東京') || name.includes('北千住') || name.includes('大宮')) {
      companyLines.push(COMPANY_LINES.Y);
    }
  }

  // 他社線接続リストの抽出
  let otherLines: OtherLineInfo[] = OTHER_LINES_DATABASE[name] || [];
  if (otherLines.length === 0 && stationInfo.transfers) {
    if (stationInfo.transfers.includes('JR')) {
      otherLines.push({ name: 'JR東日本 各線', badge: 'JR', bgClass: 'bg-emerald-100 border-emerald-300', textClass: 'text-emerald-900', gateNotice: '改札通路経由' });
    }
    if (stationInfo.transfers.includes('地下鉄')) {
      otherLines.push({ name: '地下鉄各線', badge: '地下鉄', bgClass: 'bg-sky-100 border-sky-300', textClass: 'text-sky-900', gateNotice: '地下乗り換え連絡口' });
    }
    if (stationInfo.transfers.includes('新幹線')) {
      otherLines.push({ name: '新幹線各線', badge: '新幹線', bgClass: 'bg-blue-100 border-blue-300', textClass: 'text-blue-900', gateNotice: '新幹線専用改札' });
    }
    if (stationInfo.transfers.includes('東急')) {
      otherLines.push({ name: '東急電鉄', badge: '東急', bgClass: 'bg-rose-100 border-rose-300', textClass: 'text-rose-900', gateNotice: '乗り換え通路' });
    }
  }

  const hasCompany = companyLines.length > 0;
  const hasOther = otherLines.length > 0;

  return (
    <div className="bg-white rounded-xl border border-[#E2DFE8] p-3 space-y-2.5 shadow-2xs relative overflow-hidden transition-all">
      {/* Top Header Banner - Pull-down Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#FAF9FC] hover:bg-[#F2EFF7] border border-[#E8E5EE] text-[#2E283C] px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-[#6B6380]" />
          <h3 className="text-xs font-bold text-[#2E283C] tracking-wide">
            {name}駅 乗り換え案内
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[#7A738C] bg-white px-2 py-0.5 rounded border border-[#E2DFE8] font-medium">
            {hasCompany && hasOther ? '当社線・他社線' : hasCompany ? '当社線' : '他社線'}
          </span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-[#6B6380]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#6B6380]" />
          )}
        </div>
      </button>

      {/* Main Connection Section - Collapsible Content */}
      {isOpen && (
        <div className="space-y-2 animate-fadeIn">
          {/* 1. 当社線（社内乗り換え路線） */}
          {hasCompany && (
            <div className="bg-[#FAF9FC] rounded-lg border border-[#EBE8F0] p-2 space-y-1.5">
              <div className="text-[10px] font-bold text-[#524B63] flex items-center gap-1.5 pb-1 border-b border-[#E8E5EE]">
                <Train className="w-3.5 h-3.5 text-[#6B6380]" />
                <span>当社線（社内乗り換え）</span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {companyLines.map((line) => (
                  <div key={line.code} className="bg-white p-2 rounded-md border border-[#E8E5EE] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: line.color }}
                      />
                      <div>
                        <div className="font-bold text-[#2E283C] text-[11px] flex items-center gap-1.5">
                          <span>{line.name}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 bg-[#F2EFF7] text-[#5A526B] rounded border border-[#E2DFE8]">
                            {line.code}
                          </span>
                        </div>
                        <div className="text-[9px] text-[#7A738C] mt-0.5">{line.direction}</div>
                      </div>
                    </div>
                    <span className="text-[9px] font-medium text-[#5A526B] bg-[#F4F2F8] px-1.5 py-0.5 rounded border border-[#E2DFE8] shrink-0">
                      スムーズ乗換
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. 他社線（接続路線） */}
          {hasOther && (
            <div className="bg-[#FAF9FC] rounded-lg border border-[#EBE8F0] p-2 space-y-1.5">
              <div className="text-[10px] font-bold text-[#524B63] flex items-center gap-1.5 pb-1 border-b border-[#E8E5EE]">
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#6B6380]" />
                <span>他社線・接続鉄道会社</span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {otherLines.map((line, idx) => (
                  <div key={idx} className="bg-white p-2 rounded-md border border-[#E8E5EE] flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#F0EDF5] text-[#4A4358] border border-[#DDD8E8] shrink-0">
                          {line.badge}
                        </span>
                        <span className="font-bold text-[#2E283C] text-[11px]">{line.name}</span>
                      </div>
                      {line.gateNotice && (
                        <div className="text-[9px] text-[#7A738C] pl-0.5">{line.gateNotice}</div>
                      )}
                    </div>
                    <span className="text-[9px] font-medium text-[#7A738C] bg-[#F4F2F8] px-1.5 py-0.5 rounded border border-[#E8E5EE] shrink-0">
                      改札連携
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
