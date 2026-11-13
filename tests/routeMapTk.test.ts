// 路線図(神埼・神埼高速・埼千環状)に、高宮線をつなげる。見せないあいだは、これまでの図のまま。
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildNetworkMap, LINE_COLORS, MapStation, MapMaster } from '../src/utils/routeMapLayout';
import { NetworkMapSvg } from '../src/components/RouteMapSvg';

const DIA = path.resolve(__dirname, '..', 'public', 'data', 'dia-2');
const load = (file: string): Record<string, MapMaster> => {
  const m = JSON.parse(fs.readFileSync(path.join(DIA, file), 'utf-8')) as Record<string, MapMaster>;
  return Object.fromEntries(Object.entries(m).map(([c, v]) => [c, { name: v.name, stations: v.stations }]));
};
const names = (m: Record<string, MapMaster>) => Object.fromEntries(Object.entries(m).map(([c, v]) => [c, v.name]));
const svgOf = (m: Record<string, MapMaster>) => renderToStaticMarkup(React.createElement(NetworkMapSvg, { map: buildNetworkMap(m), names: names(m) }));
const st = (map: ReturnType<typeof buildNetworkMap>, name: string): MapStation => map.stations.find((s) => s.name === name)!;

describe('見せないとき(master.json・4路線): 図は、これまでのまま', () => {
  const master = load('master.json');
  const map = buildNetworkMap(master);
  const html = svgOf(master);

  it('高さ・凡例の位置・大宮の位置と名前の置き方・路線の数が、これまでと同じ', () => {
    expect(map.height).toBe(1580);
    expect(map.legend).toEqual({ x: 790, y: 1230 });
    expect(map.lines.map((l) => l.code)).toEqual(['SC', 'Y', 'NI']);
    expect(st(map, '大宮')).toMatchObject({ x: 102.3, y: 324.9, label: { dx: -16, dy: -34, anchor: 'end' } });
    expect(st(map, '大宮').codes.map((c) => c.code)).toEqual(['SC11', 'Y12']);
    expect(map.stations).toHaveLength(45);
  });

  it('画面の出力に、高宮線も、その色(オレンジ)も、TK の番号も出ない。凡例は、これまでの大きさ', () => {
    expect(html).not.toContain('高宮');
    expect(html).not.toContain(LINE_COLORS.TK);
    expect(html).not.toContain('TK0');
    expect(html).toContain('viewBox="0 0 1090 1580"');
    expect(html).toContain('aria-label="神埼線・神埼高速線・埼千環状線の路線図"');
    expect(html).toContain('height="176"');
    expect(html).toContain('translate(0, 96)');
    expect(html).toContain('y="128"');
  });

  it('master に TK が無ければ、高宮線の分は、なにも足されない(TK を取り除いた master と同じ出力)', () => {
    const withTk = load('master-tk.json');
    const { TK: _unused, ...four } = withTk;
    expect(_unused).toBeTruthy();
    expect(svgOf(four)).toBe(html);
  });
});

describe('見せるとき(master-tk.json): 大宮から真上へのび、上の端で横へ', () => {
  const master = load('master-tk.json');
  const map = buildNetworkMap(master);
  const tk = master.TK.stations.map((s) => s[0]);
  const html = svgOf(master);

  it('高さは約1.2倍(1580 → 1880)。凡例も、300 下がる。既存の駅は、すべて 300 下がる(形はそのまま)', () => {
    expect(map.height).toBe(1880);
    expect(map.legend).toEqual({ x: 790, y: 1530 });
    const base = buildNetworkMap(load('master.json'));
    for (const s of base.stations) {
      if (s.name === '大宮') continue;
      expect(st(map, s.name), s.name).toMatchObject({ x: s.x, y: Math.round((s.y + 300) * 10) / 10, label: s.label });
    }
  });

  it('大宮は3路線の乗換駅(Y12 SC11 TK01)。名前は右下へ動く。位置は x が同じで、300 下がる', () => {
    const o = st(map, '大宮');
    expect(o.codes.map((c) => c.code).sort()).toEqual(['SC11', 'TK01', 'Y12']);
    expect(o.isHub).toBe(true);
    expect(o.label).toEqual({ dx: 12, dy: 26, anchor: 'start' });
    expect(o).toMatchObject({ x: 102.3, y: 624.9 });
    expect(html).toContain('Y12 SC11 TK01');
  });

  it('高宮線の12駅は、等しい間隔(90)で、真上 → 横の順。駅番号は TK02〜TK13。名前は、縦は左・横は上下交互', () => {
    const o = st(map, '大宮');
    const stops = tk.slice(1).map((n) => st(map, n));
    expect(stops.map((s) => s.codes[0].code)).toEqual(tk.slice(1).map((_, i) => `TK${String(i + 2).padStart(2, '0')}`));
    stops.forEach((s, i) => {
      expect(s.line).toBe('TK');
      expect(s.isHub).toBe(false);
      const along = 90 * (i + 1);
      const lv = o.y - 130;
      if (along <= lv) expect(s, s.name).toMatchObject({ x: o.x, y: Math.round((o.y - along) * 10) / 10, label: { dx: -14, dy: 6, anchor: 'end' } });
      else expect(s, s.name).toMatchObject({ x: Math.round((o.x + along - lv) * 10) / 10, y: 130 });
    });
    const horizontal = stops.filter((s) => s.y === 130);
    expect(horizontal.map((s) => s.name)).toEqual(['騰波ノ江', '新治', '栃木県総合運動公園', '群馬製作所', '宇都宮', '清原', '高根沢']);
    expect(horizontal.map((s) => s.label.dy)).toEqual([-16, 30, -16, 30, -16, 30, -16]);
    expect(stops.filter((s) => s.y !== 130).map((s) => s.name)).toEqual(['羽貫', '加須', '古河', '八俣', '下妻']);
  });

  it('高宮線の線は、オレンジ(#EA580C)で、大宮から真上へ、角を丸めて横へ。図の外にはみ出さない', () => {
    const line = map.lines.find((l) => l.code === 'TK')!;
    expect(line.color).toBe('#EA580C');
    expect(line.name).toBe('高宮線');
    expect(line.d).toBe('M102.3 624.9 L102.3 152 Q102.3 130 124.3 130 L687.4 130');
    for (const s of map.stations) {
      expect(s.x, s.name).toBeGreaterThan(0);
      expect(s.x, s.name).toBeLessThan(map.width);
      expect(s.y, s.name).toBeGreaterThan(100);
      expect(s.y, s.name).toBeLessThan(map.height);
    }
  });

  it('高宮線の駅の名前どうしが、重ならない(文字の幅は 18px × 字数)', () => {
    const boxes = map.stations.map((s) => {
      const size = s.isHub ? 24 : 18;
      const w = s.name.length * size;
      const x0 = s.label.anchor === 'start' ? s.x + s.label.dx : s.label.anchor === 'end' ? s.x + s.label.dx - w : s.x + s.label.dx - w / 2;
      const y0 = s.y + s.label.dy - size;
      return { n: s.name, x0, x1: x0 + w, y0, y1: y0 + size };
    });
    const tkNames = new Set(tk);
    for (const a of boxes) for (const b of boxes) {
      if (a.n >= b.n || !(tkNames.has(a.n) || tkNames.has(b.n))) continue;
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      expect(overlap, `${a.n} と ${b.n}`).toBe(false);
    }
  });

  it('凡例に、高宮線(オレンジ)が、いちばん下の路線として入る。凡例の箱は、1路線ぶん(30)のびる', () => {
    expect(map.lines.map((l) => l.code)).toEqual(['SC', 'Y', 'NI', 'TK']);
    expect(html).toContain('height="206"');
    expect(html).toContain('translate(0, 126)');
    expect(html).toContain('y="158"');
    expect(html).toContain('viewBox="0 0 1090 1880"');
    expect(html).toContain('aria-label="神埼線・神埼高速線・埼千環状線・高宮線の路線図"');
    // 凡例の「高宮線」の行は、乗換駅の行と重ならない(路線の行は 0・30・60・90、乗換駅は 126)
    expect(html).toContain('translate(0, 90)');
  });
});
