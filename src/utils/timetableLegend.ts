// 駅の時刻表の記号(種別・行先の頭文字)と、その凡例を決める。
// 凡例は「行」の並びで返す(種別・行先・時刻)。あとで、別の行(例: 番線)を足しやすいように、画面は行を順に出すだけにしてある。

export interface LegendItem {
  mark: string; // 記号(例: 特・大・記号なし)
  text: string; // 意味(例: 特急(有料)・大宮)
  tone?: 'paid'; // 有料の特急は、時刻の記号と同じ橙色
}

export interface LegendRow {
  key: string;
  title: string;
  items: LegendItem[];
}

interface LegendDeparture {
  typeAbbr: string;
  paid: boolean;
  dest: string;
}

// 種別の記号の意味(括弧つきの名前は、使わない)
const TYPE_TEXT: Record<string, string> = {
  特: '特急',
  特快: '特別快速',
  通快: '通勤特快',
  快: '快速',
  区快: '区間快速',
  急: '急行',
  各: '各停',
};
const TYPE_ORDER = ['特', '特快', '通快', '快', '区快', '急', '各'];
const typeRank = (abbr: string): number => {
  const i = TYPE_ORDER.indexOf(abbr);
  return i < 0 ? TYPE_ORDER.length : i;
};

// 行先の記号: 漢字の頭文字1つ。同じ頭文字の行先があるときだけ、見分けがつくまで文字を足す(松戸・松が丘 → 松戸・松が)
export const destLabels = (dests: string[]): Map<string, string> => {
  const names = Array.from(new Set(dests));
  const labels = new Map<string, string>();
  names.forEach((n) => labels.set(n, n.slice(0, 1)));
  for (let len = 2; len <= Math.max(...names.map((n) => n.length), 1); len++) {
    const count = new Map<string, number>();
    labels.forEach((l) => count.set(l, (count.get(l) || 0) + 1));
    let changed = false;
    names.forEach((n) => {
      const l = labels.get(n)!;
      if ((count.get(l) || 0) > 1 && n.length >= len) {
        labels.set(n, n.slice(0, len));
        changed = true;
      }
    });
    if (!changed) break;
  }
  return labels;
};

// その方向の時刻表に出る記号だけの凡例
export const buildLegendRows = (departures: LegendDeparture[], mainDest: string, labels: Map<string, string>): LegendRow[] => {
  const types = new Map<string, boolean>();
  departures.forEach((d) => {
    if (!types.has(d.typeAbbr)) types.set(d.typeAbbr, d.paid);
  });
  const typeItems: LegendItem[] = Array.from(types.entries())
    .sort((a, b) => typeRank(a[0]) - typeRank(b[0]))
    .map(([abbr, paid]) => ({
      mark: abbr,
      text: `${TYPE_TEXT[abbr] ?? abbr}${paid ? '(有料)' : ''}`,
      tone: paid ? 'paid' : undefined,
    }));

  const others = Array.from(new Set(departures.map((d) => d.dest)))
    .filter((d) => d !== mainDest)
    .sort();
  const destItems: LegendItem[] = [
    { mark: '記号なし', text: `${mainDest}行き` },
    ...others.map((d) => ({ mark: labels.get(d) ?? d.slice(0, 1), text: d })),
  ];

  return [
    { key: 'type', title: '種別', items: typeItems },
    { key: 'dest', title: '行先', items: destItems },
    { key: 'time', title: '時刻', items: [{ mark: '24', text: '翌日の0時台' }, { mark: '', text: '予定の時刻(遅れは反映されません)' }] },
  ];
};
