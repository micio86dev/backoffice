import { vi } from 'vitest'
import { ref, computed, reactive, watch, watchEffect, nextTick, toRef, toRefs } from 'vue'

// Expose Vue reactivity APIs as globals — Nuxt auto-imports them but Vitest doesn't
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('watchEffect', watchEffect)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('toRef', toRef)
vi.stubGlobal('toRefs', toRefs)

// Stub Nuxt compiler macros that are unavailable in Vitest context
// Nuxt auto-import. Stubbed globally rather than per-spec because it is a
// global in the running app: app.vue reads the route to tell the consent banner
// where it is, and a spec that mounts the app shell should not have to know
// that a component three levels down cares about the URL.
vi.stubGlobal(
  'useRoute',
  vi.fn(() => ({ fullPath: '/', path: '/', params: {}, query: {} }))
)

vi.stubGlobal('definePageMeta', vi.fn())
vi.stubGlobal('useHead', vi.fn())
// apiBase carries the `/api` suffix, exactly like .env.example / Dockerfile.
// The previous `''` default made every URL assertion in this suite pass
// identically whether the composables prefixed apiBase or dropped it — a
// blind spot that hid the missing-suffix bug the whole time.
vi.stubGlobal(
  'useRuntimeConfig',
  vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
)
vi.stubGlobal(
  'useNuxtApp',
  vi.fn(() => ({}))
)
// @nuxtjs/i18n auto-imports; pages call `useI18n().t` for their <title>.
// Identity `t` keeps assertions on the KEY, not on translated copy.
vi.stubGlobal(
  'useI18n',
  vi.fn(() => ({ t: (key: string) => key, locale: ref('it') }))
)
vi.stubGlobal(
  'useLocaleHead',
  vi.fn(() => ref({ htmlAttrs: { lang: 'it' } }))
)
