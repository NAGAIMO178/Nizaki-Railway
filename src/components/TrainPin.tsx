import React from 'react';
import { CROWD_LEVELS, CROWD_MAX_LEVEL, crowdInfo } from '../utils/crowd';

// 列車位置の列車の札(白いピン型)。上から: 遅れ(赤い札)・種別の色の帯(種別だけ)・列車の絵・混雑の人アイコン5つ。
// 先端が進む向き(下り=下、上り=上)。行先は、札に出さない(列車の詳細に出る)。
export const PIN_WIDTH = 32;
const TIP = 7; // 先端の高さ(px)

// 札の高さ(px。遅れ・通過の札も含む)。路線図で、札が重ならない高さを取るために使う
export const pinHeight = (opts: { delayed: boolean; passing: boolean; hasCrowd: boolean }): number =>
  TIP + 1 + 11 + 3 + 11 + (opts.hasCrowd ? 3 + 8.4 : 0) + (opts.delayed ? 11 : 0) + (opts.passing ? 10 : 0);

// 帯の字の大きさ(px)。4文字までは7px、それより長いときは、幅(32px)に収まるまで小さくする
export const bandFontSize = (label: string): number => (label.length <= 4 ? 7 : Math.floor((28 / label.length) * 10) / 10);

const Person: React.FC<{ color: string }> = ({ color }) => (
  <svg width="6" height="8.4" viewBox="0 0 10 14" aria-hidden="true">
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
      style={{ background: color, fontSize: `${bandFontSize(label)}px`, lineHeight: '11px', height: 11 }}
    >
      {label}
    </div>
  );
  const icon = (
    <svg className="mt-[3px]" width="10" height="11" viewBox="0 0 24 26" aria-hidden="true">
      <rect x="3" y="1.5" width="18" height="20" rx="5" fill={color} />
      <rect x="6" y="5" width="12" height="7" rx="1.8" fill="#fff" />
      <circle cx="8" cy="16.5" r="1.7" fill="#fff" />
      <circle cx="16" cy="16.5" r="1.7" fill="#fff" />
      <rect x="6" y="22" width="3" height="3" rx=".8" fill={color} />
      <rect x="15" y="22" width="3" height="3" rx=".8" fill={color} />
    </svg>
  );
  const people = info ? (
    <div className="flex mt-[3px]" style={{ gap: 0.3 }} aria-hidden="true">
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

  return (
    <div className="flex flex-col items-center pointer-events-none">
      {/* 遅れ(札の上) */}
      {delayMinutes > 0 && (
        <span
          className="mb-0.5 rounded-full border border-white bg-[#E11D48] px-1 text-[6px] font-black leading-[9px] text-white whitespace-nowrap shadow-xs"
        >
          +{delayMinutes}分
        </span>
      )}
      {passing && <span className="mb-0.5 rounded bg-purple-100 border border-purple-300 px-0.5 text-[6px] font-black leading-[8px] text-purple-700 whitespace-nowrap">通過</span>}
      <div style={{ filter: 'drop-shadow(0 1px 2px rgba(40,30,70,.32))' }}>
        <div className="flex flex-col items-center overflow-hidden bg-white" style={{ width: PIN_WIDTH, ...shape }}>
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
              <div className="mt-[3px] w-full">{band}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
