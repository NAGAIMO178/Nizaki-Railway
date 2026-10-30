// 更新のお知らせ(UpdatePrompt)の、出すか・保留するかの決まり。
// version.json の版が、アプリの版と違えば、お知らせを出す。ただし、version.json に showAfter(日時)があり、
// いまの時刻がそれより前なら、まだ出さない(保留)。その時刻をすぎたら、出す。
// showAfter が無い・読めない・壊れているときは、保留せずに、今までどおり出す(更新を止めないため)。

export interface VersionInfo {
  version?: unknown;
  notes?: unknown;
  showAfter?: unknown;
}

export type UpdateCheck =
  | { kind: 'none' } // 新しい版は無い(または、確認できない)
  | { kind: 'held'; showAtMs: number } // 新しい版はあるが、showAfter の時刻まで、お知らせを出さない
  | { kind: 'show'; notes: string[] };

// showAfter を、ミリ秒の時刻にする。無い・文字でない・日時として読めないときは、null(保留しない)
export const parseShowAfter = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

export const evaluateUpdate = (data: unknown, appVersion: string, nowMs: number): UpdateCheck => {
  if (!data || typeof data !== 'object') return { kind: 'none' };
  const info = data as VersionInfo;
  if (typeof info.version !== 'string' || info.version === appVersion) return { kind: 'none' };
  const showAt = parseShowAfter(info.showAfter);
  if (showAt !== null && nowMs < showAt) return { kind: 'held', showAtMs: showAt };
  return { kind: 'show', notes: Array.isArray(info.notes) ? info.notes.filter((n): n is string => typeof n === 'string') : [] };
};

// version.json を取りに行って、出すか・保留するかを決める。取れない・読めないときは、none(何もしない)
export const checkForUpdate = async (fetchFn: typeof fetch, appVersion: string, nowMs: number): Promise<UpdateCheck> => {
  try {
    const res = await fetchFn(`./version.json?t=${nowMs}`, { cache: 'no-store' });
    if (!res.ok) return { kind: 'none' };
    return evaluateUpdate(await res.json(), appVersion, nowMs);
  } catch {
    // オフラインや開発環境(version.jsonなし)では何もしない
    return { kind: 'none' };
  }
};

// ビルドが出す version.json の中身。showAfter が無いときは、これまでと同じ { version, notes } のまま
export const buildVersionJson = (version: string, releaseNotes: { notes?: unknown; showAfter?: unknown }): string => {
  const out: Record<string, unknown> = { version, notes: releaseNotes.notes };
  if (releaseNotes.showAfter !== undefined) out.showAfter = releaseNotes.showAfter;
  return JSON.stringify(out);
};

// 保留中に、showAfter の時刻ちょうどの直後に、もう一度確かめるまでの待ち時間(ms)。待てない(長すぎる・もう過ぎた)ときは null
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
export const delayUntilRecheck = (showAtMs: number, nowMs: number): number | null => {
  const delay = showAtMs - nowMs + 1000;
  return delay > 0 && delay <= MAX_TIMEOUT_MS ? delay : null;
};
