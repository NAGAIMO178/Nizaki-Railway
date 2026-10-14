// 路線図の配置。ダイヤのデータ(master.json)の駅の並びから、神埼線・神埼高速線・埼千環状線の略図の、駅の位置を求める。
// 駅の名前・順番・乗換駅は、データから決まる。位置の決め方(環状線は楕円・神埼線の東側は環状線の内側・
// 神埼線の西側は外側を回って横浜へ・高速線は東京から真下へ)だけが、ここの決めごと。
export interface MapMaster {
  name: string;
  stations: [string, number][];
}

export interface MapStation {
  name: string;
  x: number;
  y: number;
  codes: { line: string; code: string }[];
  isHub: boolean; // 乗換駅
  label: { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' };
  // 駅が属する、いちばん手前の路線(丸の色)
  line: string;
}

export interface MapLine {
  code: string;
  name: string;
  color: string;
  d: string;
  closed?: boolean;
}

export interface NetworkMap {
  width: number;
  height: number;
  legend: { x: number; y: number };
  lines: MapLine[];
  stations: MapStation[];
}

export const LINE_COLORS: Record<string, string> = { Y: '#8B5CF6', NI: '#3B82F6', SC: '#EC4899', TC: '#10B981' };

// 路線図の形は、オーナーが用意した図(2026-10-14)の形にそろえる。縦・横・斜めの線だけで、環状線が少し折れ曲がる、東京の路線図のような形。
// 下の座標は、その図の上の座標(幅1316×高さ2000)。駅の位置は、データの駅の並びを、この線の上に、等しい間隔で並べて決める。
type Pt = { x: number; y: number };
const SCALE = 0.76;
const OFFSET_X = 24;
const OFFSET_Y = 30;
const W = 1090;
const H = 1580;
const P = (x: number, y: number): Pt => ({ x: x * SCALE + OFFSET_X, y: y * SCALE + OFFSET_Y });

// 駅の位置が決まっている、乗換駅(図の座標)
const PINS: Record<string, Pt> = {
  東京: P(940, 1085),
  北千住: P(938, 738),
  七光台: P(860, 107),
  地下鉄岩槻: P(484, 107),
  大宮: P(103, 388),
  横浜: P(456, 1948),
  松戸: P(1195, 652),
  柏: P(1262, 318),
};

// 線の通り道: 駅の名前(位置が決まっている駅)と、曲がり角の座標を、順に並べる
type Step = string | Pt;
const SC_PATH: Step[] = [
  '東京', P(967, 1025), P(967, 875), '北千住', P(1142, 733), '松戸', P(1265, 467), '柏', '七光台', P(672, 160), '地下鉄岩槻', '大宮',
  P(537, 388), P(692, 578), P(692, 857), P(775, 857), P(808, 968), P(808, 1085), '東京',
];
const Y_PATH: Step[] = [
  '東京', '北千住', P(940, 105), '七光台', '地下鉄岩槻', P(275, 107), '大宮',
  P(45, 490), P(258, 490), P(258, 1555), P(456, 1555), '横浜',
];
const NI_PATH: Step[] = ['東京', P(940, 1740), P(740, 1925), '横浜'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const codeOf = (line: string, idx: number) => `${line}${pad2(idx + 1)}`;
const round = (n: number) => Math.round(n * 10) / 10;

type LabelMode = 'left' | 'right' | 'above' | 'below' | 'belowRight' | 'leftUp';
const LABELS: Record<LabelMode, MapStation['label']> = {
  left: { dx: -14, dy: 6, anchor: 'end' },
  right: { dx: 14, dy: 6, anchor: 'start' },
  above: { dx: 0, dy: -16, anchor: 'middle' },
  below: { dx: 0, dy: 30, anchor: 'middle' },
  belowRight: { dx: 12, dy: 26, anchor: 'start' },
  leftUp: { dx: -16, dy: -14, anchor: 'end' },
};
// 名前の置き方を、駅ごとに決めたもの(線の向きの決まりでは、重なるところだけ)
const LABEL_OVERRIDE: Record<string, LabelMode> = {
  東京: 'right',
  北千住: 'left',
  七光台: 'above',
  地下鉄岩槻: 'above',
  大宮: 'leftUp',
  横浜: 'left',
  松戸: 'right',
  柏: 'right',
  綾瀬: 'above',
  南千住: 'right',
  春日部: 'below',
  大宮公園: 'belowRight',
};

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

// 線の通り道を、駅の並び(names。環状線は、最後に起点の駅名をもう一度入れる)の上に置いて、駅の位置を求める
const placeAlong = (
  path: Step[],
  names: string[],
  sideOf: (pt: Pt) => 'left' | 'right'
): { points: Pt[]; at: Map<number, { pt: Pt; mode: LabelMode }> } => {
  const resolved: { pt: Pt; hub?: string }[] = path.map((st) => (typeof st === 'string' ? { pt: PINS[st], hub: st } : { pt: st }));
  const at = new Map<number, { pt: Pt; mode: LabelMode }>();

  // 位置が決まっている駅(通り道の中の名前)が、駅の並びの何番目かを探す(環状線の最後の起点は、最後の駅)
  const hubSlot: { step: number; idx: number }[] = [];
  let from = 0;
  resolved.forEach((r, i) => {
    if (!r.hub) return;
    const idx = names.indexOf(r.hub, from);
    if (idx >= 0) {
      hubSlot.push({ step: i, idx });
      from = idx + 1;
    }
  });
  // 通り道の最初と最後は、必ず、駅の並びの最初と最後
  if (!hubSlot.length || hubSlot[0].step !== 0) hubSlot.unshift({ step: 0, idx: 0 });
  if (hubSlot[hubSlot.length - 1].step !== resolved.length - 1) hubSlot.push({ step: resolved.length - 1, idx: names.length - 1 });

  let horizontalCount = 0;
  for (let h = 0; h < hubSlot.length; h++) {
    const a = hubSlot[h];
    const slot = resolved[a.step];
    at.set(a.idx, { pt: slot.pt, mode: 'left' });
    const b = hubSlot[h + 1];
    if (!b) break;
    // a から b までの、通り道の点
    const piece: Pt[] = resolved.slice(a.step, b.step + 1).map((r) => r.pt);
    const lens = piece.slice(1).map((p, i) => dist(piece[i], p));
    const total = lens.reduce((x, y) => x + y, 0);
    const m = b.idx - a.idx - 1; // 間の駅の数
    for (let j = 1; j <= m; j++) {
      let d = (total * j) / (m + 1);
      let k = 0;
      while (k < lens.length - 1 && d > lens[k]) {
        d -= lens[k];
        k++;
      }
      const t = lens[k] === 0 ? 0 : d / lens[k];
      const pt = { x: piece[k].x + (piece[k + 1].x - piece[k].x) * t, y: piece[k].y + (piece[k + 1].y - piece[k].y) * t };
      // 線の向き: 横なら、名前を交互に上・下へ。縦や斜めなら、左か右(その駅が、図のどちら側にあるか)へ
      const dx = piece[k + 1].x - piece[k].x;
      const dy = piece[k + 1].y - piece[k].y;
      let mode: LabelMode;
      if (Math.abs(dy) < 1 && Math.abs(dx) > 1) {
        mode = horizontalCount++ % 2 === 0 ? 'above' : 'below';
      } else {
        mode = sideOf(pt);
      }
      at.set(a.idx + j, { pt, mode });
    }
  }
  return { points: resolved.map((r) => r.pt), at };
};

export const buildNetworkMap = (master: Record<string, MapMaster>): NetworkMap => {
  const sc = master.SC.stations.map((s) => s[0]);
  const y = master.Y.stations.map((s) => s[0]);
  const ni = master.NI.stations.map((s) => s[0]);
  const tc = master.TC ? master.TC.stations.map((s) => s[0]) : [];

  const stations = new Map<string, MapStation>();
  const add = (names: string[], line: string, placed: Map<number, { pt: Pt; mode: LabelMode }>, count: number) => {
    for (let i = 0; i < count; i++) {
      const name = names[i];
      const pl = placed.get(i);
      if (!pl) continue;
      const hit = stations.get(name);
      if (hit) {
        if (!hit.codes.some((c) => c.line === line)) hit.codes.push({ line, code: codeOf(line, i) });
        continue;
      }
      stations.set(name, { name, x: round(pl.pt.x), y: round(pl.pt.y), codes: [{ line, code: codeOf(line, i) }], isHub: false, label: LABELS[pl.mode], line });
    }
  };

  // 環状線: 図の東側(右)は、名前を右へ。西側(左)は、左へ
  const scPlaced = placeAlong(SC_PATH, [...sc, sc[0]], (pt) => (pt.x > 700 ? 'right' : 'left'));
  add(sc, 'SC', scPlaced.at, sc.length);
  // 神埼線: 名前を、左(図の内側)へ
  const yPlaced = placeAlong(Y_PATH, y, () => 'left');
  add(y, 'Y', yPlaced.at, y.length);
  // 神埼高速線: 名前を、左へ
  const niPlaced = placeAlong(NI_PATH, ni, () => 'left');
  add(ni, 'NI', niPlaced.at, ni.length);

  // 乗換駅
  stations.forEach((st) => {
    st.isHub = st.codes.length > 1;
  });
  // 土浦線との乗換(松戸・柏)は、土浦線の駅の番号も出す
  tc.forEach((name, i) => {
    const st = stations.get(name);
    if (st) {
      st.codes.push({ line: 'TC', code: codeOf('TC', i) });
      st.isHub = true;
    }
  });
  // 名前の置き方を、決めてある駅は、そのとおりに。乗換駅は、名前が大きいので、上に置くときは、番号の分も上げる
  stations.forEach((st) => {
    const mode = LABEL_OVERRIDE[st.name];
    if (mode) st.label = { ...LABELS[mode] };
    if (st.isHub && (mode === 'above' || mode === 'leftUp')) st.label = { ...st.label, dy: st.label.dy - 20 };
  });

  const toD = (pts: Pt[], close = false) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ') + (close ? ' Z' : '');
  return {
    width: W,
    height: H,
    legend: { x: 790, y: 1230 },
    lines: [
      { code: 'SC', name: master.SC.name, color: LINE_COLORS.SC, d: toD(scPlaced.points) },
      { code: 'Y', name: master.Y.name, color: LINE_COLORS.Y, d: toD(yPlaced.points) },
      { code: 'NI', name: master.NI.name, color: LINE_COLORS.NI, d: toD(niPlaced.points) },
    ],
    stations: Array.from(stations.values()),
  };
};

// 土浦線(松戸〜日立): 縦に並べる
export interface TcRow {
  name: string;
  code: string;
  km: number;
  transfers: string[]; // 乗り換えられる、ほかの路線の名前と駅番号
}

export const buildTsuchiuraRows = (master: Record<string, MapMaster>): TcRow[] => {
  const tc = master.TC.stations;
  const others = Object.entries(master).filter(([code]) => code !== 'TC');
  return tc.map(([name, km], i) => ({
    name,
    code: codeOf('TC', i),
    km,
    transfers: others.flatMap(([code, m]) => {
      const idx = m.stations.findIndex((s) => s[0] === name);
      return idx >= 0 ? [`${m.name} ${codeOf(code, idx)}`] : [];
    }),
  }));
};
