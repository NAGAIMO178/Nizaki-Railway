// 混雑予報(NIZAKI 2.0。公開後だけ)の、データの読み込みと、混雑レベルの決まり。
// データは tools/crowd-sim/sim.py が作った public/data/crowd-2/(仮想の住民による、模擬の混雑)。設計は docs/NIZAKI-2.0-crowd.md。

export type CrowdDay = 'wd' | 'we'; // 平日 / 土休日

export interface CrowdLevelInfo {
  level: number;
  label: string; // 「〜です」の言い方(詳細の画面)
  short: string; // 狭い場所(経路検索の候補など)で使う短い言葉
  range: string; // 乗車率の目安
  color: string; // 小さな札の背景色
  text: string; // 札の文字色
  icon: string; // 人のアイコンの色
}

// 5段階。乗車率は、定員を100%とした目安(tools/crowd-sim/sim.py の LEVELS と合わせる。データは6段階で出るが、5と6は、同じ「かなり混み合っています」)
export const CROWD_MAX_LEVEL = 5;
export const CROWD_LEVELS: CrowdLevelInfo[] = [
  { level: 1, label: '座席に座れる程度です', short: '座れる', range: '〜50%', color: '#E4F4EC', text: '#2C6B4F', icon: '#3FA37A' },
  { level: 2, label: 'ゆったり立てる程度です', short: 'ゆったり', range: '〜100%', color: '#C9E9BF', text: '#3B6B2E', icon: '#7BBF5E' },
  { level: 3, label: '少し混み合っています', short: 'やや混', range: '〜150%', color: '#FBE7A1', text: '#7A5A00', icon: '#E5B320' },
  { level: 4, label: '肩がふれあう程度です', short: '混雑', range: '〜180%', color: '#FBBE7D', text: '#7A3F00', icon: '#F08A2C' },
  { level: 5, label: 'かなり混み合っています', short: '大混雑', range: '180%超', color: '#F28B82', text: '#7A1E17', icon: '#E0554B' },
];

export const crowdInfo = (level: number): CrowdLevelInfo | undefined =>
  level >= 1 ? CROWD_LEVELS[Math.min(level, CROWD_MAX_LEVEL) - 1] : undefined;

// 土曜・日曜は「土休日」、それ以外は「平日」(祝日は、いまは見ない)
export const dayTypeOf = (ms: number): CrowdDay => {
  const d = new Date(ms).getDay();
  return d === 0 || d === 6 ? 'we' : 'wd';
};

// 路線 → 列車番号 → 区間ごとのレベル(1文字1区間。その駅を出たあとの区間)
export type CrowdTrains = Record<string, Record<string, string>>;

const BASE_URL = `${import.meta.env.BASE_URL}data/crowd-2/`;

const fetchJson = async <T>(file: string): Promise<T> => {
  const res = await fetch(`${BASE_URL}${file}?v=${__APP_VERSION__}`);
  if (!res.ok) throw new Error(`混雑のデータの読み込みに失敗しました (${file}: ${res.status})`);
  return res.json();
};

const promiseCache = new Map<string, Promise<unknown>>();
const loadOnce = <T>(file: string): Promise<T> => {
  let p = promiseCache.get(file) as Promise<T> | undefined;
  if (!p) {
    p = fetchJson<T>(file);
    promiseCache.set(file, p);
    p.catch(() => promiseCache.delete(file));
  }
  return p;
};

const trainCache = new Map<CrowdDay, CrowdTrains>();
export const loadCrowdTrains = async (day: CrowdDay): Promise<CrowdTrains> => {
  const data = await loadOnce<CrowdTrains>(`train_${day}.json`);
  trainCache.set(day, data);
  return data;
};

// 平日・土休日の両方を読み込む(発車案内などが、日をまたいでも、続けて使えるように)
export const loadAllCrowdTrains = async (): Promise<void> => {
  await Promise.all([loadCrowdTrains('wd'), loadCrowdTrains('we')]);
};

// 遅れている列車は、人がたまるので、混雑を1つ上げて見せる(3分以上の遅れ)
export const DELAY_BUMP_MIN = 3;
export const bumpForDelay = (level: number, delayMinutes: number | undefined): number =>
  delayMinutes !== undefined && delayMinutes >= DELAY_BUMP_MIN ? Math.min(CROWD_MAX_LEVEL, level + 1) : Math.min(CROWD_MAX_LEVEL, level);

// 列車の、いちばん混む区間のレベル(1〜5)。遅れやすさの元にする。まだ・データなしは undefined
const maxLevelCache = new Map<string, number | undefined>();
export const trainMaxLevel = (day: CrowdDay, lineCode: string, trainNo: string): number | undefined => {
  const s = trainCache.get(day)?.[lineCode]?.[trainNo];
  if (!s) return undefined;
  const key = `${day}|${lineCode}|${trainNo}`;
  if (maxLevelCache.has(key)) return maxLevelCache.get(key);
  let m = 0;
  for (const c of s) m = Math.max(m, Number(c));
  const v = m >= 1 ? Math.min(m, CROWD_MAX_LEVEL) : undefined;
  maxLevelCache.set(key, v);
  return v;
};

// 混雑 → 遅れ: 混んでいる列車ほど、遅れやすい(乗り降りに時間がかかるため)。全体で、1日に約40本、いまの朝夕の山と同じくらいになるよう調整した
export const CROWD_DELAY_BASE_RATE = 0.022;
export const CROWD_DELAY_FACTOR = [0.5, 1, 2, 3.5, 5]; // レベル1〜5
export const crowdDelayRate = (level: number): number =>
  CROWD_DELAY_BASE_RATE * CROWD_DELAY_FACTOR[Math.min(Math.max(level, 1), CROWD_MAX_LEVEL) - 1];

// 読み込み済みなら、列車の、k番目の区間(k番目の停車駅を出たあとの区間)のレベル。まだ・データなしは undefined
export const trainSegmentLevel = (day: CrowdDay, lineCode: string, trainNo: string, k: number): number | undefined => {
  const s = trainCache.get(day)?.[lineCode]?.[trainNo];
  if (!s || k < 0 || k >= s.length) return undefined;
  const n = Number(s[k]);
  return n >= 1 && n <= 6 ? Math.min(n, CROWD_MAX_LEVEL) : undefined;
};
