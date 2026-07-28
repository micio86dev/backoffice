import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/unit/setup.ts'],
    // Only run unit tests; Playwright E2E runs separately via playwright test
    include: ['tests/unit/**/*.spec.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.nuxt/**'],
    coverage: {
      provider: 'v8',
      include: ['app/**', 'components/**', 'composables/**', 'pages/**', 'server/**'],
      exclude: ['.nuxt/**', 'types/api.ts', '*.config.*'],
      thresholds: {
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      // Nuxt 4's default srcDir is `<rootDir>/app` — both `~` and `@` alias to
      // it there (and in components.json's `aliases` block for shadcn-vue).
      // Vitest doesn't run through Nuxt's config, so this must be mirrored
      // explicitly or any `@/...`/`~/...` import (all vendored ui/** components
      // use `@/lib/utils`, `@/components/ui/*`) fails to resolve under test.
      '~': resolve(__dirname, 'app'),
      '@': resolve(__dirname, 'app'),
    },
  },
})
