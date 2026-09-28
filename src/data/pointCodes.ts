export interface PointCode {
  points: number;
  title: string;
}

// LINE公式アカウントで配布するN-POINT付与コード(アカウントごとに1回のみ使用可能)
export const POINT_CODES: Record<string, PointCode> = {
  GIVE300: { points: 300, title: '【ミステリー制覇特典】消えた試運転列車の謎' },
};

export const normalizePointCode = (raw: string): string => raw.trim().toUpperCase().replace(/[\s_-]/g, '');
