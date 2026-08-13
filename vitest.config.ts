import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/unit/setup.ts'],
    // Several page specs `await import()` a route module inside the test, and
    // call `vi.resetModules()` between tests, so each one pays a cold Vite
    // transform of that module's whole tree. That cost is bound by the
    // machine, not by the code under test: on a loaded host the import alone
    // has been observed to exceed the 5s default, failing as "Test timed out"
    // with nothing wrong in the assertion. A genuine hang still fails here,
    // just later — which is the right trade for a suite that must be
    // trustworthy on a busy CI runner.
    testTimeout: 20_000,
    // Only run unit tests; Playwright E2E runs separately via playwright test
    include: ['tests/unit/**/*.spec.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.nuxt/**'],
    coverage: {
      provider: 'v8',
      include: ['app/**', 'components/**', 'composables/**', 'pages/**', 'server/**'],
      // `app/components/ui/**` is vendored shadcn-vue source (bunx shadcn-vue
      // add), not hand-authored logic — DESIGN.md §5's "every component
      // needs a matching Vitest test" rule targets atoms/molecules/organisms
      // the team writes; the vendored primitives are exercised indirectly
      // through the organisms/pages that consume them (same size:exception
      // precedent as PR B0's vendoring commit). Excluding them here mirrors
      // the pre-existing `types/api.ts` exclusion (generated, not authored)
      // and fixes a coverage gate that was silently broken BEFORE this PR —
      // confirmed by measuring the base branch: 54.09% overall lines, all
      // of the shortfall inside app/components/ui/**, never caught because
      // nothing had run `--coverage` end to end since B0 vendored it in.
      exclude: ['.nuxt/**', 'types/api.ts', '*.config.*', 'app/components/ui/**'],
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
