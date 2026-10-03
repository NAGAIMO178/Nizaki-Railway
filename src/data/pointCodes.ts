export interface PointCode {
  points: number;
  title: string;
}

// LINE公式アカウントで配布するN-POINT付与コード(この端末でアカウントごとに1回のみ使用可能。端末のデータを消すと戻る)
export const POINT_CODES: Record<string, PointCode> = {
  GIVE300: { points: 300, title: '【ミステリー制覇特典】消えた試運転列車の謎' },
};

export const normalizePointCode = (raw: string): string => raw.trim().toUpperCase().replace(/[\s_-]/g, '');
