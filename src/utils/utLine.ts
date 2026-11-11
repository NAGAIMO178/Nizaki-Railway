// 宇都宮線(路線コード UT)を、利用者に見せるかどうか。年末のメジャーアップデートまで、見せない。
//  - 公開日が決まったら、UT_LAUNCH_AT に日時を書く(null のあいだは、宇都宮線は、どの画面にも出ない)。
//    その日時になった瞬間から、全員に見える(端末の時計を使う。launch.ts と同じ考え方)。
//  - データ(public/data の宇都宮線のファイル)は、先に入れてある。見せないあいだは、アプリが読まない・使わない。
//  - 路線の一覧は、見せないあいだは master.json(4路線のまま)、見せるときは master-ut.json(宇都宮線つき)を読む(diaTimetable.ts の loadMaster)。
//    master.json を書き換えないのは、古い版のアプリ(まだ更新していない端末)が、新しい master.json を読んで、宇都宮線を出してしまうのを防ぐため。
//    公開の PR で、master-ut.json の中身を master.json に移してよい(そのあとは、master-ut.json は要らない)。
export const UT_LAUNCH_AT: string | null = null;

export const UT_CODE = 'UT';
export const MASTER_FILE = 'master.json';
export const MASTER_UT_FILE = 'master-ut.json';

export const isUtLaunched = (): boolean => UT_LAUNCH_AT !== null && Date.now() >= Date.parse(UT_LAUNCH_AT);

// 路線コードの一覧から、見せない路線(宇都宮線)を取り除く
export const visibleLineCodes = (codes: string[]): string[] => (isUtLaunched() ? codes : codes.filter((c) => c !== UT_CODE));
