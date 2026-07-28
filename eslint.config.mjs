// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    tooling: true,
    stylistic: false, // Prettier handles formatting
  },
  dirs: {
    src: ['./app'],
  },
}).append({
  rules: {
    // Enforce no unused vars (D27 strict mode).
    // Base rule is disabled per typescript-eslint's own guidance: it is not
    // type-aware and false-positives on TS-only constructs such as function-type
    // parameter names in `defineEmits<{ (e: 'x', payload: T): void }>()` call
    // signatures (surfaced by the vendored shadcn-vue Input/Sidebar components).
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
  },
})
