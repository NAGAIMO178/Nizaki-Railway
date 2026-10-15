// 混雑予報(NIZAKI 2.0。公開後だけ)の、データの読み込みと、混雑レベルの決まり。
// データは tools/crowd-sim/sim.py が作った public/data/crowd-2/(仮想の住民による、模擬の混雑)。設計は docs/NIZAKI-2.0-crowd.md。

export type CrowdDay = 'wd' | 'we'; // 平日 / 土休日

export interface CrowdLevelInfo {
  level: number;
  label: string;
  range: string; // 乗車率の目安
  color: string; // 表の色
  text: string; // 色の上の文字色
}

// 1〜6。乗車率は、定員を100%とした目安(sim.py の LEVELS と合わせる)
export const CROWD_LEVELS: CrowdLevelInfo[] = [
  { level: 1, label: '座れる', range: '〜50%', color: '#E4F4EC', text: '#2C6B4F' },
  { level: 2, label: 'ゆったり', range: '〜100%', color: '#C9E9BF', text: '#3B6B2E' },
  { level: 3, label: 'やや混んでいる', range: '〜150%', color: '#FBE7A1', text: '#7A5A00' },
  { level: 4, label: '混んでいる', range: '〜180%', color: '#FBBE7D', text: '#7A3F00' },
  { level: 5, label: 'かなり混んでいる', range: '〜200%', color: '#F28B82', text: '#7A1E17' },
  { level: 6, label: '身動きが取れない', range: '200%超', color: '#A8386C', text: '#FFFFFF' },
];

export const crowdInfo = (level: number): CrowdLevelInfo | undefined => CROWD_LEVELS[level - 1];

// 表の列: 5:00から30分ごと、40枠(翌1:00まで)
export const SLOT_COUNT = 40;
export const SLOT_START_SEC = 5 * 3600;
export const SLOT_SEC = 1800;

export const slotLabel = (slot: number): string => {
  const sec = SLOT_START_SEC + slot * SLOT_SEC;
  return `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
};

// いまの時刻が、どの枠か(範囲外は null)
export const currentSlot = (now: Date): number | null => {
  let sec = now.getHours() * 3600 + now.getMinutes() * 60;
  if (sec < SLOT_START_SEC) sec += 86400; // 0時台は、前の日の続き
  const slot = Math.floor((sec - SLOT_START_SEC) / SLOT_SEC);
  return slot >= 0 && slot < SLOT_COUNT ? slot : null;
};

// 土曜・日曜は「土休日」、それ以外は「平日」(祝日は、いまは見ない)
export const dayTypeOf = (ms: number): CrowdDay => {
  const d = new Date(ms).getDay();
  return d === 0 || d === 6 ? 'we' : 'wd';
};

// 路線 → 方向コード → 駅名 → 40文字(0=列車なし、1〜6=レベル)
export type CrowdSlots = Record<string, Record<string, Record<string, string>>>;
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

export const loadCrowdSlots = (day: CrowdDay): Promise<CrowdSlots> => loadOnce<CrowdSlots>(`slot_${day}.json`);

const trainCache = new Map<CrowdDay, CrowdTrains>();
export const loadCrowdTrains = async (day: CrowdDay): Promise<CrowdTrains> => {
  const data = await loadOnce<CrowdTrains>(`train_${day}.json`);
  trainCache.set(day, data);
  return data;
};

// 読み込み済みなら、列車の、k番目の区間(k番目の停車駅を出たあとの区間)のレベル。まだ・データなしは undefined
export const trainSegmentLevel = (day: CrowdDay, lineCode: string, trainNo: string, k: number): number | undefined => {
  const s = trainCache.get(day)?.[lineCode]?.[trainNo];
  if (!s || k < 0 || k >= s.length) return undefined;
  const n = Number(s[k]);
  return n >= 1 && n <= 6 ? n : undefined;
};
