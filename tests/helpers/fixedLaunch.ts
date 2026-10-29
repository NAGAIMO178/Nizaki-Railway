// 公開日を固定した launch.ts を作る(公開の境の確認用)。
// 本物の launch.ts の中身をそのまま使い、LAUNCH_AT の行だけを、指定の日時に置き換える(判定の計算も、本物のまま)。
// launch.ts の書き方が変わって、置き換えられなくなったら、わざと落とす。
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const LAUNCH_AT_LINE = /export const LAUNCH_AT: string \| null = [^;]*;/;

export const buildLaunchModule = (launchAt: string | null): Record<string, unknown> => {
  const file = path.resolve(__dirname, '..', '..', 'src', 'utils', 'launch.ts');
  const source = fs.readFileSync(file, 'utf-8');
  if (!LAUNCH_AT_LINE.test(source)) throw new Error('launch.ts の LAUNCH_AT の行が見つかりません(tests/helpers/fixedLaunch.ts を直してください)');
  const replaced = source.replace(LAUNCH_AT_LINE, `export const LAUNCH_AT: string | null = ${JSON.stringify(launchAt)};`);
  const { code } = transformSync(replaced, { loader: 'ts', format: 'cjs', target: 'es2022' });
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function('module', 'exports', 'window', 'localStorage', code)(
    mod,
    mod.exports,
    (globalThis as { window: unknown }).window,
    (globalThis as { localStorage: unknown }).localStorage
  );
  return { ...mod.exports };
};
