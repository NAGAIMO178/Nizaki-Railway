// NIZAKI 2.0 の新しい機能を、公開日まで隠すためのしくみ。
//  - 公開日が決まったら、LAUNCH_AT に日時を書く(null のあいだは、準備中の機能は見えない)。
//    その日時になった瞬間から、全員に見える(端末の時計を使う)。
//  - 公開前に動作を確かめる手段も、ここで決める(開発者向け)。
export const LAUNCH_AT: string | null = null; // 例: '2026-10-31T00:00:00+09:00'

// ホームの「公開まで あと○日」の帯が数える先(公開の日時。広報ずみの日付)。
// 公開の PR で、LAUNCH_AT にも同じ日時を書く
export const COUNTDOWN_TO = '2026-11-01T00:00:00+09:00';

const PREVIEW_KEY = 'nizaki_preview';

// 公開記念ボーナスを受け取れる期間(公開日から)。サーバーは、期限を見ない(アプリの画面だけで区切る)
export const LAUNCH_BONUS_DAYS = 30;


export const isLaunched = (): boolean => {
  try {
    const param = new URLSearchParams(window.location.search).get('preview');
    if (param === '1') localStorage.setItem(PREVIEW_KEY, '1');
    if (param === '0') localStorage.removeItem(PREVIEW_KEY);
    if (localStorage.getItem(PREVIEW_KEY) === '1') return true;
  } catch {
    // 保存できない環境でも、日付の判定は続ける
  }
  return LAUNCH_AT !== null && Date.now() >= Date.parse(LAUNCH_AT);
};

// 公開記念ボーナスの案内を出す期間か(公開日が決まっていないあいだの作業用リンクでは、常に出す)
export const isLaunchBonusOpen = (): boolean => {
  if (!isLaunched()) return false;
  if (LAUNCH_AT === null) return true;
  return Date.now() < Date.parse(LAUNCH_AT) + LAUNCH_BONUS_DAYS * 24 * 60 * 60 * 1000;
};
