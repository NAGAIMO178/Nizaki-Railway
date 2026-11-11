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

// 本体の外に浮かせる札(遅れ・通過)。札と本体のあいだのすき間は 5px、遅れと通過の札のあいだは 2px
export const DELAY_BADGE_H = 11;
export const PASSING_BADGE_H = 10;
export const FLOAT_GAP = 5; // 浮かせる札と、本体のあいだ(px)
export const FLOAT_STACK_GAP = 2; // 遅れの札と通過の札のあいだ(px)
export const pinFloatHeight = (opts: { delayed: boolean; passing: boolean }): number =>
  !opts.delayed && !opts.passing
    ? 0
    : (opts.delayed ? DELAY_BADGE_H : 0) + (opts.passing ? PASSING_BADGE_H : 0) + (opts.delayed && opts.passing ? FLOAT_STACK_GAP : 0) + FLOAT_GAP;

// 路線図で、札が重ならないために取る高さ(px)。本体を、列の中心に置くので、浮かせる札のぶんを、本体の両側に取る
export const pinHeight = (opts: { delayed: boolean; passing: boolean }): number => PIN_BODY_H + 2 * pinFloatHeight(opts);

// 束ね札(同じ場所に3本以上)。後ろにずらして見せる札の枚数(本数−1。最大5枚)と、1枚ごとのずらし(左へ・下へ、px)
export const BUNDLE_MAX_BACK = 5;
export const BUNDLE_STEP = 4;
export const bundleBackLayers = (total: number): number => Math.max(0, Math.min(total - 1, BUNDLE_MAX_BACK));
// 束ね札の高さ(px。重ならない高さの計算用): 先頭の札の高さ + ずらした札が、本体の外へはみ出すぶん(両側)
export const bundleHeight = (head: { delayed: boolean; passing: boolean }, total: number): number => pinHeight(head) + 2 * BUNDLE_STEP * bundleBackLayers(total);

// 帯の字の大きさ(px)。帯の字は、3文字まで(あやみ・めぐり)で、9px で幅(38px)に収まる。それより長いときは、収まるまで小さくする(知らない種別のための備え)
export const bandFontSize = (label: string): number => (label.length <= 3 ? 9 : Math.floor((34 / label.length) * 10) / 10);

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
  floatOffset?: number; // 浮かせる札を、本体からさらに離す距離(px)。束ね札で、後ろの札のはみ出しをよけるため
}

export const TrainPin: React.FC<TrainPinProps> = ({ label, color, direction, delayMinutes, passing, crowd, floatOffset = 0 }) => {
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
      className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto"
      style={{ gap: FLOAT_STACK_GAP, ...(down ? { bottom: '100%', marginBottom: FLOAT_GAP + floatOffset } : { top: '100%', marginTop: FLOAT_GAP + floatOffset }) }}
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

// 束ね札(同じ場所に3本以上): 先頭(いちばん優等)の札を前に、後ろに「本数−1」枚(最大5枚)の札を、左下へずらして重ねる。数字は出さない。
// 大きさは、1本のときと同じ(幅38px・本体の高さ PIN_BODY_H)。後ろの札の遅れ・通過の札は出さない
export const TrainPinBundle: React.FC<{ pins: TrainPinProps[] }> = ({ pins }) => {
  const back = bundleBackLayers(pins.length);
  const head = pins[0];
  return (
    <div className="relative pointer-events-none" style={{ width: PIN_WIDTH, height: PIN_BODY_H }}>
      {Array.from({ length: back }, (_, k) => back - k).map((i) => {
        const b = pins[Math.min(i, pins.length - 1)];
        return (
          <div key={i} className="absolute" style={{ left: -BUNDLE_STEP * i, top: BUNDLE_STEP * i, zIndex: 10 - i }}>
            <TrainPin label={b.label} color={b.color} direction={b.direction} delayMinutes={0} passing={false} crowd={b.crowd} />
          </div>
        );
      })}
      <div className="absolute left-0 top-0" style={{ zIndex: 20 }}>
        {/* 先端が上の札は、後ろの札が下へはみ出すので、浮かせる札(本体の下)を、そのぶん離す */}
        <TrainPin {...head} floatOffset={head.direction === 2 ? BUNDLE_STEP * back : 0} />
      </div>
    </div>
  );
};
