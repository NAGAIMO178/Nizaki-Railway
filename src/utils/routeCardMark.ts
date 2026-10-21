// 経路検索の候補カードに出す、赤い印(1つだけ)。乗換が遅れで間に合わないなら「乗換が困難」、そうでなく遅れがあれば「遅れあり」
export type RouteCardMark = 'hard' | 'delayed' | null;

export const ROUTE_CARD_MARK_TEXT: Record<'hard' | 'delayed', string> = {
  hard: 'このルートは乗換が困難です',
  delayed: '遅れあり',
};

export const routeCardMark = (r: { delayed: boolean; connections: { level: string }[] }): RouteCardMark => {
  if (r.connections.some((c) => c.level === 'fail')) return 'hard';
  return r.delayed ? 'delayed' : null;
};
