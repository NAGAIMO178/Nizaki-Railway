// ポイント履歴の行の題名の表示。公開記念イベント「幻のタレ事件」のごほうびの行は、はじめ「解決報奨」という題名で台帳に書かれた
// (画面の「イベント報酬」と字が違う)。台帳・保存データは書き換えず、画面に出すときだけ「解決報酬」にそろえる。
// 台帳の題名は、判定にも重複の検査にも使われない(サーバーは、名札の鍵 event:tare で見る)ので、見せ方だけ直せば足りる。
const OLD = '幻のタレ事件 解決報奨';
const NEW = '幻のタレ事件 解決報酬';

export const pointTitleText = <T,>(title: T): T | string => (typeof title === 'string' && title.startsWith(OLD) ? NEW + title.slice(OLD.length) : title);
