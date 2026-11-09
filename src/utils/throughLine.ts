// 直通(2つの路線をまたいで走る列車)の、つなぎ目の駅と、直通先の路線。
// 列車位置の路線図(乗換駅の「神埼線 ›」の札)と、列車の詳細(停車駅の乗換駅の行の札)で使う。
// 路線は、画面の路線ID(kanzaki / saichi_loop / tsuchiura)。

export interface ThroughLink {
  station: string; // つなぎ目の駅(駅名)
  lines: [string, string]; // つながる2つの路線ID
}

export const THROUGH_LINKS: ThroughLink[] = [
  { station: '大宮', lines: ['saichi_loop', 'kanzaki'] },
  { station: '松戸', lines: ['saichi_loop', 'tsuchiura'] },
];

// 直通先の札の色(color: 枠と線 / text: 文字。白地で読みやすい濃さ)。路線の色(列車位置の路線タブの丸)に合わせてある
export const THROUGH_STYLE: Record<string, { color: string; text: string }> = {
  kanzaki: { color: '#8B5CF6', text: '#6D28D9' },
  saichi_loop: { color: '#EC4899', text: '#BE185D' },
  tsuchiura: { color: '#3CB371', text: '#15803D' },
};

// 駅名の読み(カッコ書き)を除いた形(diaTimetable.ts の normalizeStationName と同じ)
const plain = (name: string): string => name.replace(/（.*?）/g, '').trim();

// その路線のその駅から、直通でつながる路線ID(なければ undefined)
export const throughLineAt = (lineId: string, stationName: string): string | undefined => {
  const st = plain(stationName);
  const link = THROUGH_LINKS.find((l) => l.station === st && l.lines.includes(lineId));
  return link ? link.lines.find((l) => l !== lineId) : undefined;
};

// 列車が、この路線の終点(endStation)で終わらず、行先(destination)がもっと先なら、直通。つなぎ目の駅と、直通先の路線を返す
export const trainThrough = (lineId: string, endStation: string, destination: string): { stationName: string; lineId: string } | undefined => {
  if (!endStation || !destination || plain(endStation) === plain(destination)) return undefined;
  const to = throughLineAt(lineId, endStation);
  return to ? { stationName: plain(endStation), lineId: to } : undefined;
};
