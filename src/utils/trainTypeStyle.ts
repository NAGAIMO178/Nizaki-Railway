// 種別ごとの色・帯の字を決める、1か所の表。発車案内(MyStationCard)・列車位置の札(TrainPin)・列車の詳細(TrainDetailV2)が、ここを見る。
//  - 色の決まり: 各停=灰 / 快速=青 / 区間快速=緑 / 急行・通勤特快=赤(同じ色。字で区別) / 特別快速=黄 / 有料特急=紫
//  - 帯の字(列車位置の札だけ): 種別名の略称。各=各停・急=急行・快=快速・区快=区間快速・特快=特別快速・通快=通勤特快・あやみ・めぐり・N(特急(Nライナー))。
//    master の types の2番目の値(時刻表の凡例などが使う略称)とは別の表で、そちらは変えない。
// 種別名は、画面の種別の名前(diaTimetable.ts の displayType を通したもの)。

export interface TypeStyle {
  band: string; // 札の帯の字
  hex: string; // 札・帯の色
  solid: string; // 詳細の種別バッジ(濃い色の地・白い字)の、地の色
  soft: string; // 発車案内の種別バッジ(うすい色の地)
}

const LOCAL: TypeStyle = { band: '各', hex: '#64748B', solid: 'bg-slate-600', soft: 'bg-slate-100 text-slate-800 border border-slate-300' };
const LOCAL_FAR: TypeStyle = { band: '各', hex: '#64748B', solid: 'bg-slate-600', soft: 'bg-teal-50 text-teal-900 border border-teal-300' };
const RAPID: TypeStyle = { band: '快', hex: '#0284C7', solid: 'bg-sky-600', soft: 'bg-sky-50 text-sky-900 border border-sky-300' };
const SECTION_RAPID: TypeStyle = { band: '区快', hex: '#059669', solid: 'bg-emerald-600', soft: 'bg-emerald-50 text-emerald-900 border border-emerald-300' };
const RED_SOFT = 'bg-rose-100 text-rose-950 border border-rose-300';
const EXPRESS: TypeStyle = { band: '急', hex: '#E11D48', solid: 'bg-rose-600', soft: RED_SOFT };
const COMMUTER_SPECIAL: TypeStyle = { band: '通快', hex: '#E11D48', solid: 'bg-rose-600', soft: RED_SOFT };
const SPECIAL_RAPID: TypeStyle = { band: '特快', hex: '#F59E0B', solid: 'bg-amber-600', soft: 'bg-amber-50 text-amber-950 border border-amber-300' };
const LIMITED_SOFT = 'bg-purple-100 text-purple-950 border border-purple-300 font-extrabold';
const AYAMI: TypeStyle = { band: 'あやみ', hex: '#6D28D9', solid: 'bg-purple-700', soft: LIMITED_SOFT };
const MEGURI: TypeStyle = { band: 'めぐり', hex: '#7C3AED', solid: 'bg-purple-700', soft: LIMITED_SOFT };
const N_LINER: TypeStyle = { band: 'N', hex: '#6D28D9', solid: 'bg-purple-700', soft: LIMITED_SOFT };
const LIMITED: TypeStyle = { band: '特', hex: '#6D28D9', solid: 'bg-purple-700', soft: LIMITED_SOFT };

export const typeStyleOf = (trainType: string): TypeStyle => {
  if (trainType === '各停(遠距離)') return LOCAL_FAR;
  if (trainType === '各停' || trainType === '普通' || trainType === '各停(近距離)') return LOCAL;
  if (trainType === '区間快速' || trainType === '区間急行' || trainType === '区快') return SECTION_RAPID;
  if (trainType === '快速') return RAPID;
  if (trainType === '急行') return EXPRESS;
  if (trainType === '特別快速' || trainType === '特快') return SPECIAL_RAPID;
  if (trainType === '通勤特快' || trainType === '通特') return COMMUTER_SPECIAL;
  if (trainType.includes('あやみ')) return AYAMI;
  if (trainType.includes('めぐり')) return MEGURI;
  if (trainType.includes('Nライナー')) return N_LINER;
  if (trainType.includes('特急') || trainType.includes('サークル')) return LIMITED;
  return LOCAL;
};

export const bandLabelOf = (trainType: string): string => typeStyleOf(trainType).band;
