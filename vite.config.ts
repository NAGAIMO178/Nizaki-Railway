import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import { buildVersionJson } from './src/utils/updateNotice';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const releaseNotes = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'release-notes.json'), 'utf-8'));

const emitVersionJson = () => ({
  name: 'emit-version-json',
  generateBundle(this: { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      // お知らせを、ある時刻まで保留したいときだけ、release-notes.json の showAfter が、そのまま載る(無ければ、これまでと同じ)
      source: buildVersionJson(pkg.version, releaseNotes),
    });
  },
});

export default defineConfig(() => {
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react(), tailwindcss(), emitVersionJson()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'esnext',
      minify: 'esbuild' as const,
      cssMinify: true,
      rollupOptions: {
        output: {
          // 変わらない部品は別ファイルにして、アプリを更新しても取り直さずに済むようにする
          manualChunks(id: string) {
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor';
            if (id.includes('node_modules/lucide-react/')) return 'icons';
          },
        },
      },
    },
  };
});
