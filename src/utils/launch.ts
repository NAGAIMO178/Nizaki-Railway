// NIZAKI 2.0 の新しい機能を、公開日まで隠すためのしくみ。
//  - 公開日が決まったら、LAUNCH_AT に日時を書く(null のあいだは、準備中の機能は見えない)。
//    その日時になった瞬間から、全員に見える(端末の時計を使う)。
//  - 公開前に動作を確かめるときは、URLの末尾に ?preview=1 を付けて一度開く(戻すときは ?preview=0)。
export const LAUNCH_AT: string | null = null; // 例: '2026-10-31T00:00:00+09:00'

const PREVIEW_KEY = 'nizaki_preview';

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
