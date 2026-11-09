import React from 'react';
import { CROWD_LEVELS, CROWD_MAX_LEVEL, crowdInfo } from '../utils/crowd';

// 列車位置の列車の札(白いピン型)。本体は、種別の色の帯(種別だけ)・列車の絵・混雑の人アイコン5つ。遅れ・通過の札は、本体の外に浮かせる。
// 先端が進む向き(下り=下、上り=上)。行先は、札に出さない(列車の詳細に出る)。
export const PIN_WIDTH = 38;
const TIP = 8; // 先端の高さ(px)
const BAND_H = 13; // 帯の高さ(px)
const ICON_H = 13; // 列車の絵の高さ(px)
const PERSON_H = 9.8; // 人アイコンの高さ(px)

// 札の本体(帯・列車の絵・人アイコン)の高さ(px)。遅れ・通過の札の有無、混雑データの有無で変えない
// (同じ場所に並ぶ列車で、本体の上端・下端がそろうように。混雑データが無いときは、人アイコンの場所を空けておく)
export const PIN_BODY_H = TIP + 1 + BAND_H + 3 + ICON_H + 3 + PERSON_H;

// 本体の外に浮かせる札(遅れ・通過)の高さ(px。間の余白を含む)
export const DELAY_BADGE_H = 11 + 2;
export const PASSING_BADGE_H = 10 + 2;
export const pinFloatHeight = (opts: { delayed: boolean; passing: boolean }): number => (opts.delayed ? DELAY_BADGE_H : 0) + (opts.passing ? PASSING_BADGE_H : 0);

// 路線図で、札が重ならないために取る高さ(px)。本体を、列の中心に置くので、浮かせる札のぶんを、本体の両側に取る
export const pinHeight = (opts: { delayed: boolean; passing: boolean }): number => PIN_BODY_H + 2 * pinFloatHeight(opts);

// 帯の字の大きさ(px)。4文字までは9px、それより長いときは、幅(38px)に収まるまで小さくする
export const bandFontSize = (label: string): number => (label.length <= 4 ? 9 : Math.floor((34 / label.length) * 10) / 10);

const Person: React.FC<{ color: string }> = ({ color }) => (
  <svg width="7" height="9.8" viewBox="0 0 10 14" aria-hidden="true">
    <circle cx="5" cy="2.8" r="2.4" fill={color} />
    <path d="M1 13V7.2C1 5.8 2.2 5.2 5 5.2s4 .6 4 2V13z" fill={color} />
  </svg>
);

interface TrainPinProps {
  label: string; // 種別(各停・急行・特急など)
  color: string; // 種別の色
  direction: 1 | 2;
  delayMinutes: number;
  passing: boolean;
  crowd?: number; // いまの混雑(1〜5)。なければ、人アイコンは出さない
}

export const TrainPin: React.FC<TrainPinProps> = ({ label, color, direction, delayMinutes, passing, crowd }) => {
  const down = direction === 1;
  const info = crowd ? crowdInfo(crowd) : undefined;

  const band = (
    <div
      className="w-full text-center text-white font-extrabold whitespace-nowrap overflow-hidden"
      style={{ background: color, fontSize: `${bandFontSize(label)}px`, lineHeight: `${BAND_H}px`, height: BAND_H }}
    >
      {label}
    </div>
  );
  const icon = (
    <svg className="mt-[3px]" width="12" height="13" viewBox="0 0 24 26" aria-hidden="true">
      <rect x="3" y="1.5" width="18" height="20" rx="5" fill={color} />
      <rect x="6" y="5" width="12" height="7" rx="1.8" fill="#fff" />
      <circle cx="8" cy="16.5" r="1.7" fill="#fff" />
      <circle cx="16" cy="16.5" r="1.7" fill="#fff" />
      <rect x="6" y="22" width="3" height="3" rx=".8" fill={color} />
      <rect x="15" y="22" width="3" height="3" rx=".8" fill={color} />
    </svg>
  );
  const people = info ? (
    <div className="flex mt-[3px]" style={{ gap: 0.4 }} aria-hidden="true">
      {CROWD_LEVELS.slice(0, CROWD_MAX_LEVEL).map((l) => (
        <Person key={l.level} color={l.level <= info.level ? info.icon : '#D3CFDF'} />
      ))}
    </div>
  ) : null;

  const shape: React.CSSProperties = down
    ? {
        borderRadius: '5px 5px 0 0',
        paddingBottom: TIP + 1,
        clipPath: `polygon(0 0,100% 0,100% calc(100% - ${TIP}px),50% 100%,0 calc(100% - ${TIP}px))`,
      }
    : {
        borderRadius: '0 0 5px 5px',
        paddingTop: TIP + 1,
        clipPath: `polygon(50% 0,100% ${TIP}px,100% 100%,0 100%,0 ${TIP}px)`,
      };

  // 遅れ・通過の札は、本体の外に浮かせる(本体の位置・高さは、札の有無で動かさない)。下り(先端が下)は本体の上、上り(先端が上)は本体の下
  const delayBadge = delayMinutes > 0 && (
    <span className="rounded-full border border-white bg-[#E11D48] px-1.5 text-[8px] font-black leading-[11px] text-white whitespace-nowrap shadow-xs">+{delayMinutes}分</span>
  );
  const passBadge = passing && (
    <span className="rounded bg-purple-100 border border-purple-300 px-1 text-[8px] font-black leading-[10px] text-purple-700 whitespace-nowrap">通過</span>
  );
  const floats = delayBadge || passBadge ? (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-auto"
      style={down ? { bottom: '100%', marginBottom: 2 } : { top: '100%', marginTop: 2 }}
    >
      {down ? (
        <>
          {delayBadge}
          {passBadge}
        </>
      ) : (
        <>
          {passBadge}
          {delayBadge}
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="relative flex flex-col items-center pointer-events-none" style={{ width: PIN_WIDTH, height: PIN_BODY_H }}>
      {floats}
      <div style={{ filter: 'drop-shadow(0 1px 2px rgba(40,30,70,.32))', height: PIN_BODY_H }}>
        <div className="flex flex-col items-center overflow-hidden bg-white" style={{ width: PIN_WIDTH, height: PIN_BODY_H, ...shape }}>
          {down ? (
            <>
              {band}
              {icon}
              {people}
            </>
          ) : (
            <>
              {icon}
              {people}
              <div className="mt-auto w-full">{band}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
