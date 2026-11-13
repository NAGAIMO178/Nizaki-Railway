// 高宮線(路線コード TK)を、利用者に見せるかどうか。年末のメジャーアップデートまで、見せない。
//  - 公開日が決まったら、TK_LAUNCH_AT に日時を書く(null のあいだは、高宮線は、どの画面にも出ない)。
//    その日時になった瞬間から、全員に見える(端末の時計を使う。launch.ts と同じ考え方)。
//  - データ(public/data の高宮線のファイル)は、先に入れてある。見せないあいだは、アプリが読まない・使わない。
//  - 路線の一覧は、見せないあいだは master.json(4路線のまま)、見せるときは master-tk.json(高宮線つき)を読む(diaTimetable.ts の loadMaster)。
//    master.json を書き換えないのは、古い版のアプリ(まだ更新していない端末)が、新しい master.json を読んで、高宮線を出してしまうのを防ぐため。
//    公開の PR で、master-tk.json の中身を master.json に移してよい(そのあとは、master-tk.json は要らない)。
export const TK_LAUNCH_AT: string | null = null;

export const TK_CODE = 'TK';
export const MASTER_FILE = 'master.json';
export const MASTER_TK_FILE = 'master-tk.json';

export const isTkLaunched = (): boolean => TK_LAUNCH_AT !== null && Date.now() >= Date.parse(TK_LAUNCH_AT);

// 路線コードの一覧から、見せない路線(高宮線)を取り除く
export const visibleLineCodes = (codes: string[]): string[] => (isTkLaunched() ? codes : codes.filter((c) => c !== TK_CODE));
