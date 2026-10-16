// 路線ごとの駅の並びと、「影響区間」の文言から対象の駅の範囲を求める計算。
// 保存や通信は disruptionManager.ts が行う。

export const LINE_STATIONS: Record<string, string[]> = {
  kanzaki: [
    '東京', '浅草', '北千住', '足立', '草加', '越谷レイクタウン', '七光台', '北春日部',
    '地下鉄岩槻', '蓮田', '丸山', '大宮', '朝霞台', '新座', 'ひばりヶ丘', '田無',
    '武蔵境', '中三鷹', '調布', '生田', '溝の口', '新横浜', '横浜'
  ],
  kanzaki_kosoku: [
    '東京', '新橋', '品川', '大井町', '平和島', '地下鉄蒲田', '川崎', '鶴見', '横浜'
  ],
  saichi: [
    '東京', '南千住', '北千住', '綾瀬', '松戸', '柏', '七光台', '春日部', '地下鉄岩槻',
    '大宮公園', '大宮', 'さいたま新都心', '南浦和', '川口', '赤羽', '志村坂上',
    '上板橋', '小竹向原', '池袋', '新宿'
  ],
  tsuchiura: [
    '松戸', '新松戸', '松が丘', '柏', '守谷', '谷井田', '森の里', '荒川沖', '土浦',
    '高浜', '茨城空港', '鹿島旭', '大洗', '那珂湊', '平磯', 'ひたちなか海浜公園',
    '久慈川', '大甕（おおみか）', '東大沼', '多賀', '会瀬（おうせ）', '日立'
  ],
};

export const getStationsForLine = (lineId: string): string[] => {
  if (lineId === 'saichi_loop' || lineId === 'saichi') return LINE_STATIONS.saichi || [];
  return LINE_STATIONS[lineId] || LINE_STATIONS.kanzaki || [];
};

// 駅名の読み仮名「（おおみか）」を除いた名前
const stripStationReading = (name: string): string => name.replace(/（.*?）/g, '');

/**
 * 影響区間の文字列から、対象となる駅の範囲(駅の並びの添字)を求める。
 *  - 「全線」「上り線のみ」「下り線のみ」や、駅名が読み取れない文言 → null(全線に反映)
 *  - 「大宮 〜 池袋 間」のように駅名が2つ以上読み取れる → その2駅の間
 *  - 駅名が1つだけ → その駅のみ
 */
export const getAffectedStationRange = (lineId: string, section: string): [number, number] | null => {
  const text = (section || '').trim();
  if (!text || text === '全線' || /上り線のみ|下り線のみ/.test(text)) return null;

  const names = getStationsForLine(lineId).map(stripStationReading);
  // 「大宮」と「大宮公園」のような包含を避けるため、長い駅名から順に文中を探して消していく
  const order = names.map((name, idx) => ({ name, idx })).sort((a, b) => b.name.length - a.name.length);
  let remaining = text;
  const found: { idx: number; pos: number }[] = [];
  for (const { name, idx } of order) {
    const pos = remaining.indexOf(name);
    if (pos !== -1) {
      found.push({ idx, pos });
      remaining = remaining.slice(0, pos) + '\u0000'.repeat(name.length) + remaining.slice(pos + name.length);
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a.pos - b.pos);
  const first = found[0].idx;
  const second = found.length > 1 ? found[1].idx : first;
  return [Math.min(first, second), Math.max(first, second)];
};

/** 列車の位置(駅に停車中/次の駅との間)が、影響区間に含まれるか */
export const isTrainInAffectedRange = (
  lineId: string,
  range: [number, number] | null,
  stationName: string,
  isBetween: boolean
): boolean => {
  if (!range) return true;
  const stationIdx = getStationsForLine(lineId).map(stripStationReading).indexOf(stripStationReading(stationName));
  if (stationIdx === -1) return false;
  const [from, to] = range;
  return isBetween ? stationIdx >= from && stationIdx + 1 <= to : stationIdx >= from && stationIdx <= to;
};
