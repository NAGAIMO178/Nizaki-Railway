// ミステリートレインの最終関門: 答えは「新松戸」(柏・北千住・我孫子の重心)。図は、実際の位置の比率
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BOSS_STAGE, KANZAKI_STATIONS_72, CLEAR_CODE } from '../src/components/MysteryTrainApp.jsx';

const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/MysteryTrainApp.jsx'), 'utf-8');

describe('最終関門の答え', () => {
  it('答えは新松戸(TC02)。駅の一覧に、ある', () => {
    expect(BOSS_STAGE.correctStationId).toBe('shinmatsudo');
    expect(BOSS_STAGE.correctStationName).toBe('新松戸駅');
    const st = KANZAKI_STATIONS_72.find((s: { id: string }) => s.id === BOSS_STAGE.correctStationId);
    expect(st).toMatchObject({ name: '新松戸', code: 'TC02' });
  });
  it('松戸(SC05)を選ぶと、間違いになる。松戸は、間違いの選択肢として、残っている', () => {
    const matsudo = KANZAKI_STATIONS_72.find((s: { id: string }) => s.id === 'matsudo');
    expect(matsudo).toMatchObject({ name: '松戸', code: 'SC05' });
    expect(matsudo.id === BOSS_STAGE.correctStationId).toBe(false);
  });
  it('解説・台詞・クリア証・「制覇」の札は、新松戸駅。答えとしての「松戸駅」は、残っていない', () => {
    expect(BOSS_STAGE.explanation).toContain('新松戸駅の地下留置線');
    expect(src).toContain('あっぱれじゃ！！新松戸駅にて怪盗のアジト');
    expect(src).toContain('新松戸駅 制覇');
    expect(src).toContain('三角形の結節点たる「新松戸駅」');
    expect(src.replace(/新松戸/g, '')).not.toMatch(/松戸駅(にて|の地下| 制覇|」のアジト)/);
  });
  it('クリアの記録は、答えの駅名・駅の番号に、よらない(クリア済みの会員は、そのまま)', () => {
    expect(CLEAR_CODE).toBe('MYSTERY_2026_MASHIN_CLEAR');
    // 保存する状態に、最終関門の答えを入れていない(判定は、その場の選択と BOSS_STAGE の比較だけ)
    const refs = src.match(/BOSS_STAGE\.correctStation(Id|Name)/g) ?? [];
    expect(refs).toEqual(['BOSS_STAGE.correctStationId']);
  });
});

describe('三角形の図(viewBox 400x240)', () => {
  // 実際の位置(緯度・経度)。1km ≈ 12px。経度1度は、緯度1度の約0.81倍(緯度35.8度)
  const real = { kitasenju: [35.75, 139.805], kashiwa: [35.862, 139.971], abiko: [35.866, 140.032] };
  const centroid = [(35.75 + 35.862 + 35.866) / 3, (139.805 + 139.971 + 140.032) / 3];
  const KM = 111.2;
  const px = (lat: number, lng: number) => {
    const o = real.kitasenju;
    return { x: 70 + (lng - o[1]) * KM * 0.81 * 12, y: 195 - (lat - o[0]) * KM * 12 };
  };
  const poly = /<polygon\s+points="(\d+),(\d+) (\d+),(\d+) (\d+),(\d+)"/.exec(src)!;
  const pts = [0, 1, 2].map((i) => ({ x: Number(poly[1 + i * 2]), y: Number(poly[2 + i * 2]) }));

  it('3駅の位置が、実際の緯度・経度の比率と、3px以内で合う(北千住・柏・我孫子)', () => {
    [real.kitasenju, real.kashiwa, real.abiko].forEach((r, i) => {
      const e = px(r[0], r[1]);
      expect(Math.abs(pts[i].x - e.x), `x${i}`).toBeLessThanOrEqual(3);
      expect(Math.abs(pts[i].y - e.y), `y${i}`).toBeLessThanOrEqual(3);
    });
  });
  it('「？」の点は、3駅の重心(新松戸のあたり)で、三角形の中に入っている。松戸の位置(重心の南西)ではない', () => {
    const c = px(centroid[0], centroid[1]);
    const m = /<circle cx="(\d+)" cy="(\d+)" r="7" fill="#EF4444"/.exec(src)!;
    const cx = Number(m[1]);
    const cy = Number(m[2]);
    expect(Math.abs(cx - c.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(cy - c.y)).toBeLessThanOrEqual(3);
    const matsudo = px(35.784, 139.903); // 重心より、約4km(約48px)西南西
    expect(Math.hypot(cx - matsudo.x, cy - matsudo.y)).toBeGreaterThan(30);
    const [a, b, d] = pts;
    const s = (p: { x: number; y: number }, q: { x: number; y: number }) => (q.x - p.x) * (cy - p.y) - (q.y - p.y) * (cx - p.x);
    const signs = [s(a, b), s(b, d), s(d, a)].map(Math.sign);
    expect(new Set(signs).size).toBe(1);
  });
  it('ラベルは、画面(0〜400 × 0〜240)の外へ出ず、たがいに重ならない', () => {
    const texts = [...src.matchAll(/<text x="(\d+)" y="(\d+)"[^>]*fontSize="(\d+)"[^>]*textAnchor="(\w+)"[^>]*>\s*([^<]+?)\s*<\/text>/g)].filter((m) => /駅（|？/.test(m[5]));
    expect(texts).toHaveLength(4);
    const boxes = texts.map((m) => {
      const x = Number(m[1]);
      const y = Number(m[2]);
      const fs2 = Number(m[3]);
      const w = [...m[5]].length * fs2; // 全角の文字を、1文字 = fontSize として見積もる
      const left = m[4] === 'middle' ? x - w / 2 : m[4] === 'end' ? x - w : x;
      return { left, right: left + w, top: y - fs2, bottom: y + 3 };
    });
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(400);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(240);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `${i} と ${j}`).toBe(false);
      }
  });
  it('背景のグリッド・点滅(animate-ping)は、そのまま', () => {
    expect(src).toContain('className="animate-ping opacity-75"');
    expect((src.match(/stroke="#251F33" strokeDasharray="4"/g) ?? []).length).toBe(6);
  });
});
