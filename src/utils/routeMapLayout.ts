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
  lines: MapLine[];
  stations: MapStation[];
}

export const LINE_COLORS: Record<string, string> = { Y: '#8B5CF6', NI: '#3B82F6', SC: '#EC4899', TC: '#10B981' };

const W = 1000;
const H = 1120;
const CX = 560;
const CY = 430;
const RX = 300;
const RY = 270;
const INNER = 0.78; // 神埼線(東側)を、環状線の内側へ寄せる割合

const pad2 = (n: number) => String(n).padStart(2, '0');
const codeOf = (line: string, idx: number) => `${line}${pad2(idx + 1)}`;
const round = (n: number) => Math.round(n * 10) / 10;

// 環状線の駅 i(全 n 駅)の位置。i=0(東京)が真下で、東側(右)→北(上)→西(左)の順に回る
const loopPoint = (phi: number, r = 1) => ({ x: CX + RX * r * Math.sin(phi), y: CY + RY * r * Math.cos(phi) });
const loopPhi = (i: number, n: number) => (i * 2 * Math.PI) / n;

// 駅の名前の置き方: 環状線の外側(円の中心から遠い側)
const outwardLabel = (phi: number): MapStation['label'] => {
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  if (Math.abs(s) > 0.35) return { dx: s > 0 ? 14 : -14, dy: 6, anchor: s > 0 ? 'start' : 'end' };
  return { dx: 0, dy: c > 0 ? 30 : -16, anchor: 'middle' };
};

export const buildNetworkMap = (master: Record<string, MapMaster>): NetworkMap => {
  const sc = master.SC.stations.map((s) => s[0]);
  const y = master.Y.stations.map((s) => s[0]);
  const ni = master.NI.stations.map((s) => s[0]);
  const nSc = sc.length;

  const stations = new Map<string, MapStation>();
  const addCode = (name: string, line: string, idx: number) => {
    const st = stations.get(name);
    if (st && !st.codes.some((c) => c.line === line)) st.codes.push({ line, code: codeOf(line, idx) });
  };
  const put = (name: string, line: string, idx: number, pt: { x: number; y: number }, label: MapStation['label']) => {
    const hit = stations.get(name);
    if (hit) {
      addCode(name, line, idx);
      return;
    }
    stations.set(name, { name, x: round(pt.x), y: round(pt.y), codes: [{ line, code: codeOf(line, idx) }], isHub: false, label, line });
  };

  // --- 環状線(楕円) ---
  sc.forEach((name, i) => {
    const phi = loopPhi(i, nSc);
    put(name, 'SC', i, loopPoint(phi), outwardLabel(phi));
  });
  const scPhi = (name: string) => loopPhi(sc.indexOf(name), nSc);

  // --- 神埼線: 東京〜大宮は、環状線の内側(乗換駅は環状線の上) ---
  const omiya = y.indexOf('大宮');
  const hubIdx = y.map((n, i) => (sc.includes(n) && i <= omiya ? i : -1)).filter((i) => i >= 0);
  const yPoints: { x: number; y: number }[] = [];
  for (let k = 0; k < hubIdx.length; k++) {
    const a = hubIdx[k];
    const pa = loopPoint(scPhi(y[a]));
    yPoints.push(pa);
    put(y[a], 'Y', a, pa, outwardLabel(scPhi(y[a])));
    const b = hubIdx[k + 1];
    if (b === undefined) continue;
    const phiA = scPhi(y[a]);
    const phiB = scPhi(y[b]);
    const m = b - a - 1;
    for (let j = 1; j <= m; j++) {
      const phi = phiA + ((phiB - phiA) * j) / (m + 1);
      const pt = loopPoint(phi, INNER);
      yPoints.push(pt);
      // 内側の駅は、名前を内側(左)へ。駅どうしが近いところは、名前が重ならないよう、1つおきに真下へ
      const tight = Math.abs(phiB - phiA) / (m + 1) < (14 * Math.PI) / 180;
      put(y[a + j], 'Y', a + j, pt, tight && j % 2 === 1 ? { dx: 0, dy: 32, anchor: 'middle' } : { dx: -12, dy: 6, anchor: 'end' });
    }
  }
  const yPath1 = yPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');

  // --- 神埼線: 大宮〜横浜は、環状線の外を、上・西・南と回る ---
  const omiyaPt = loopPoint(scPhi('大宮'));
  const yokohamaY = 1060;
  const west: { x: number; y: number }[] = [
    omiyaPt,
    { x: CX - 20, y: 70 },
    { x: 260, y: 70 },
    { x: 150, y: 180 },
    { x: 150, y: 780 },
    { x: 250, y: 990 },
    { x: CX, y: yokohamaY },
  ];
  const seg = west.slice(1).map((p, i) => Math.hypot(p.x - west[i].x, p.y - west[i].y));
  const total = seg.reduce((a, b) => a + b, 0);
  const after = y.length - 1 - omiya; // 大宮のあとの駅の数(横浜まで)
  const at = (dist: number) => {
    let d = dist;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i]) {
        const t = seg[i] === 0 ? 0 : d / seg[i];
        return { x: west[i].x + (west[i + 1].x - west[i].x) * t, y: west[i].y + (west[i + 1].y - west[i].y) * t, seg: i };
      }
      d -= seg[i];
    }
    return { ...west[west.length - 1], seg: seg.length - 1 };
  };
  for (let k = 1; k <= after; k++) {
    const pt = at((total * k) / after);
    const idx = omiya + k;
    // 上の横線は、名前を交互に上・下へ。西の縦線は右(内側)へ。南の斜めは下へ
    let label: MapStation['label'];
    if (pt.seg <= 1) label = { dx: 0, dy: k % 2 === 0 ? 30 : -16, anchor: 'middle' };
    else if (pt.seg === 2) label = { dx: -14, dy: -6, anchor: 'end' };
    else if (pt.seg === 3) label = { dx: -16, dy: 6, anchor: 'end' };
    else label = { dx: 0, dy: -18, anchor: 'middle' };
    put(y[idx], 'Y', idx, pt, label);
  }
  const yPath2 = west.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');

  // --- 神埼高速線: 東京から真下へ ---
  const tokyoPt = loopPoint(0);
  const nVert = ni.length - 1;
  const niPoints = ni.map((name, i) => ({ name, i, pt: { x: tokyoPt.x, y: tokyoPt.y + ((yokohamaY - tokyoPt.y) * i) / nVert } }));
  niPoints.forEach(({ name, i, pt }) => put(name, 'NI', i, pt, { dx: 16, dy: 6, anchor: 'start' }));
  const niPath = `M${round(tokyoPt.x)} ${round(tokyoPt.y)} L${round(tokyoPt.x)} ${yokohamaY}`;

  // --- 乗換駅 ---
  stations.forEach((st) => {
    st.isHub = st.codes.length > 1;
  });
  // 土浦線との乗換(松戸・柏)は、土浦線の駅の番号も出す
  const tc = master.TC ? master.TC.stations.map((s) => s[0]) : [];
  tc.forEach((name, i) => {
    const st = stations.get(name);
    if (st) {
      st.codes.push({ line: 'TC', code: codeOf('TC', i) });
      st.isHub = true;
    }
  });

  // 東京・大宮・横浜は、線が集まるので、名前の位置を決めておく
  const set = (name: string, label: MapStation['label']) => {
    const st = stations.get(name);
    if (st) st.label = label;
  };
  set('東京', { dx: -16, dy: -58, anchor: 'end' });
  set('大宮', { dx: -16, dy: -46, anchor: 'end' });
  set('横浜', { dx: 18, dy: 8, anchor: 'start' });

  return {
    width: W,
    height: H,
    lines: [
      { code: 'SC', name: master.SC.name, color: LINE_COLORS.SC, d: `M${CX} ${CY + RY} A${RX} ${RY} 0 1 1 ${CX} ${CY - RY} A${RX} ${RY} 0 1 1 ${CX} ${CY + RY} Z`, closed: true },
      { code: 'Y', name: master.Y.name, color: LINE_COLORS.Y, d: `${yPath1} ${yPath2.replace(/^M[\d. -]+/, '')}` },
      { code: 'NI', name: master.NI.name, color: LINE_COLORS.NI, d: niPath },
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
