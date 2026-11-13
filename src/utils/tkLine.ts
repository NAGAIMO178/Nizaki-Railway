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

// 高宮線の路線色(オレンジ)。オレンジ(Tailwind の orange-600)にした理由: 既存の路線色(violet/blue/pink/emerald の500番台)と十分に離れ(色の差 ΔE2000 で 35 以上)、
// 種別の色(特別快速=黄 #F59E0B と 急行=赤 #E11D48)の、どちらからも 20 以上離れる(orange-500 #F97316 だと、特別快速の黄と 15.7 で近すぎる)。
export const TK_LINE_COLOR = '#EA580C';
// 高宮線の駅(駅コード TK01〜13。路線のダイヤ master と同じ並び)
export const TK_STATION_NAMES = ['大宮', '羽貫', '加須', '古河', '八俣', '下妻', '騰波ノ江', '新治', '栃木県総合運動公園', '群馬製作所', '宇都宮', '清原', '高根沢'];

export const isTkLaunched = (): boolean => TK_LAUNCH_AT !== null && Date.now() >= Date.parse(TK_LAUNCH_AT);

// 路線の一覧に、高宮線を足す(見せないあいだは、足さない)
export const withTk = <T,>(base: T[], tk: T): T[] => (isTkLaunched() ? [...base, tk] : base);

// 路線コードの一覧から、見せない路線(高宮線)を取り除く
export const visibleLineCodes = (codes: string[]): string[] => (isTkLaunched() ? codes : codes.filter((c) => c !== TK_CODE));
