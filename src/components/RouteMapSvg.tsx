import React from 'react';
import { NetworkMap, MapStation, TcRow, LINE_COLORS } from '../utils/routeMapLayout';

const INK = '#221C35';
const SUB = '#6B6380';

const LINE_ORDER = ['Y', 'NI', 'SC', 'TC'];

const codeText = (st: MapStation): string => {
  const sorted = [...st.codes].sort((a, b) => LINE_ORDER.indexOf(a.line) - LINE_ORDER.indexOf(b.line));
  return sorted.map((c) => c.code).join(' ');
};

// 神埼線・神埼高速線・埼千環状線の路線図(ダイヤの駅の並びから描く)
export const NetworkMapSvg: React.FC<{ map: NetworkMap; names: Record<string, string> }> = ({ map, names }) => (
  <svg
    viewBox={`0 0 ${map.width} ${map.height}`}
    width="100%"
    role="img"
    aria-label="神埼線・神埼高速線・埼千環状線の路線図"
    style={{ display: 'block', background: '#FFFFFF', fontFamily: 'inherit', textRendering: 'optimizeLegibility' }}
  >
    {/* 路線 */}
    {map.lines.map((l) => (
      <path key={l.code} d={l.d} fill="none" stroke={l.color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
    ))}

    {/* 駅 */}
    {map.stations.map((st) => (
      <g key={st.name}>
        {st.isHub ? (
          <circle cx={st.x} cy={st.y} r={11} fill="#FFFFFF" stroke={INK} strokeWidth={4} />
        ) : (
          <circle cx={st.x} cy={st.y} r={6.5} fill="#FFFFFF" stroke={LINE_COLORS[st.line]} strokeWidth={4} />
        )}
        <text
          x={st.x + st.label.dx}
          y={st.y + st.label.dy}
          textAnchor={st.label.anchor}
          fontSize={st.isHub ? 24 : 18}
          fontWeight={st.isHub ? 700 : 500}
          fill={INK}
        >
          {st.name}
        </text>
        {st.isHub && (
          <text
            x={st.x + st.label.dx}
            y={st.y + st.label.dy + 16}
            textAnchor={st.label.anchor}
            fontSize={12}
            fontWeight={500}
            fill={SUB}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {codeText(st)}
          </text>
        )}
      </g>
    ))}

    {/* 凡例 */}
    <g transform={`translate(${map.legend.x}, ${map.legend.y})`}>
      <rect x={-14} y={-26} width={300} height={176} rx={12} fill="#FFFFFF" stroke="#E6E2EE" strokeWidth={2} />
      {map.lines.map((l, i) => (
        <g key={l.code} transform={`translate(0, ${i * 30})`}>
          <line x1={0} y1={0} x2={44} y2={0} stroke={l.color} strokeWidth={9} strokeLinecap="round" />
          <text x={58} y={6} fontSize={18} fontWeight={700} fill={INK}>
            {names[l.code] || l.name}
          </text>
        </g>
      ))}
      <g transform="translate(0, 96)">
        <circle cx={22} cy={0} r={11} fill="#FFFFFF" stroke={INK} strokeWidth={4} />
        <text x={58} y={6} fontSize={18} fontWeight={700} fill={INK}>
          乗換駅
        </text>
      </g>
      <text x={0} y={128} fontSize={13} fill={SUB}>
        全駅に、駅番号(Y01 など)があります
      </text>
    </g>
  </svg>
);

// 土浦線(松戸〜日立)を、縦に並べた路線図
export const TsuchiuraList: React.FC<{ rows: TcRow[]; lineName: string }> = ({ rows, lineName }) => (
  <div className="bg-white px-4 py-5" aria-label={`${lineName}の路線図`}>
    <div className="flex items-center gap-2 mb-4">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: LINE_COLORS.TC }} />
      <span className="text-sm font-black text-[#221C35]">{lineName}</span>
      <span className="text-[11px] text-[#857D99]">全{rows.length}駅・{rows[rows.length - 1].km.toFixed(1)}km</span>
    </div>
    <ol>
      {rows.map((r, i) => {
        const hub = r.transfers.length > 0;
        return (
          <li key={r.name} className="flex items-stretch gap-3">
            <div className="relative w-6 shrink-0 flex justify-center">
              {i > 0 && <span className="absolute top-0 h-1/2 w-2 rounded-full" style={{ backgroundColor: LINE_COLORS.TC }} />}
              {i < rows.length - 1 && <span className="absolute bottom-0 h-1/2 w-2 rounded-full" style={{ backgroundColor: LINE_COLORS.TC }} />}
              <span
                className="relative z-10 self-center rounded-full bg-white border-4"
                style={hub ? { width: 20, height: 20, borderColor: INK } : { width: 14, height: 14, borderColor: LINE_COLORS.TC }}
              />
            </div>
            <div className="flex-1 min-w-0 py-2.5 flex items-center justify-between gap-3 border-b border-[#F0EEF6]">
              <div className="min-w-0">
                <div className={`${hub ? 'text-base font-black' : 'text-sm font-bold'} text-[#221C35] truncate`}>{r.name}</div>
                {hub && <div className="text-[10px] text-[#857D99] mt-0.5">乗換: {r.transfers.join('・')}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-mono font-bold text-[#6B6380]">{r.code}</div>
                <div className="text-[10px] font-mono text-[#B4ADC4]">{r.km.toFixed(1)}km</div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  </div>
);
