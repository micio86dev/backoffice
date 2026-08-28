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
// `te` reports whether a key has a translation. Stubbed as always-true so the
// identity `t` above stays the observed value: a component that falls back when
// a key is MISSING is exercised by its own spec re-stubbing `te`, not by every
// unrelated spec silently taking the fallback branch.
vi.stubGlobal(
  'useI18n',
  vi.fn(() => ({ t: (key: string) => key, te: () => true, locale: ref('it') }))
)
vi.stubGlobal(
  'useLocaleHead',
  vi.fn(() => ref({ htmlAttrs: { lang: 'it' } }))
)
// @nuxtjs/i18n auto-import. Identity, so a spec asserts on the path a page
// ASKED for rather than on the locale prefix @nuxtjs/i18n would add to it —
// which is that module's contract to keep, not this app's to re-test.
vi.stubGlobal(
  'useLocalePath',
  vi.fn(() => (path: string) => path)
)
// Nuxt auto-import. Stubbed globally for the same reason as `useI18n` above:
// the app shell reaches for the route (NavBar renders HelpSheet, which picks
// its topic from the current path), and a spec that mounts a shell component
// should not have to know which of its descendants reads the route. Specs that
// care about a SPECIFIC path re-stub it themselves.
vi.stubGlobal(
  'useRoute',
  vi.fn(() => ({ path: '/', fullPath: '/', params: {}, query: {} }))
)
