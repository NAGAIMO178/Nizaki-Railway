import { defineConfig } from 'vitest/config';

// 計算とデータのテスト(画面は、動かさない)。`npm test` で走る。
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
