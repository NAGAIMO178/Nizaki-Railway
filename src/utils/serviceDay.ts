// ダイヤの日(営業日): 0:00〜3:59 は、前日のダイヤの続き。
// 管理者設定の遅れ・運休の「ばらつきの種」と、遅れの通知済みの記録は、この日で決める(0時をまたいでも、同じ列車は同じ結果にするため)。
const DAY_MS = 24 * 3600 * 1000;
const SERVICE_DAY_CUTOFF_HOUR = 4;

// 時刻(ms)が属する、ダイヤの日の始まり(ローカルの0時のms)
export const serviceDayStartOf = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const midnight = d.getTime();
  return new Date(ms).getHours() < SERVICE_DAY_CUTOFF_HOUR ? midnight - DAY_MS : midnight;
};

// ダイヤの日を、文字にした形(例: 2026-11-9)
export const serviceDayKey = (serviceDayStartMs: number): string => {
  const d = new Date(serviceDayStartMs);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// 管理者設定の遅れ・運休の、ばらつきの種: ダイヤの日 + 列車番号。発車案内・列車位置・経路検索・予約の知らせ、どこで呼んでも同じ
export const adminDelaySeed = (serviceDayStartMs: number, trainNo: string): string => `${serviceDayKey(serviceDayStartMs)}|${trainNo}`;
