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
    // 経路検索を、たくさんの駅の組み合わせで動かすテストがあるので、遅い環境でも、時間切れで落ちないようにする
    testTimeout: 30000,
  },
});
