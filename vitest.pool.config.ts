import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        isolatedStorage: false,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          compatibilityDate: '2024-08-15',
          bindings: { BEARER_TOKEN: 'test-token' },
          durableObjects: {
            BOOK: { className: 'BookDO', useSQLite: true },
          },
        },
      },
    },
    include: ['src/do/**/*.test.ts'],
  },
});
