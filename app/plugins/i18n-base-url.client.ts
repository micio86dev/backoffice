/**
 * Makes `i18n.baseUrl` (`nuxt.config.ts`) actually reach @nuxtjs/i18n at
 * runtime, for THIS app's deployment shape (form-clarity-and-console-warnings,
 * D8 — corrects an assumption in that change's design.md).
 *
 * The module option is a function, forwarded by @nuxtjs/i18n's own build step
 * into `nuxt.options.runtimeConfig.public.i18n.baseUrl`. That works for an SSR
 * app, where each request re-evaluates the config fresh in Node.js. It does
 * NOT survive here: this app is `ssr: false` (a static SPA, `nuxt generate`),
 * so the public runtime config is embedded client-side as a JSON literal
 * (`window.__NUXT__.config`, verified in `.output/public/index.html`) —
 * and a function value cannot survive `JSON.stringify`. It is silently
 * dropped, `@nuxtjs/i18n`'s `extendBaseUrl` sees a non-function and falls
 * back to `''`, and the `head.js:15` warning fires exactly as if `baseUrl`
 * had never been configured at all. Caught by
 * `tests/e2e/html-lang.spec.ts`'s console listener, which is what makes this
 * plugin necessary rather than decorative.
 *
 * The fix: `useRuntimeConfig()` returns the SAME in-memory object every
 * runtime reader consults — including `@nuxtjs/i18n`'s own plugin, which
 * calls `extendBaseUrl(nuxtApp)` reading `nuxtApp.$config.public.i18n.baseUrl`
 * — so mutating it here, in a plugin ordered `enforce: 'pre'` (before the
 * i18n module's own default-priority plugin runs), reaches the module without
 * ever touching serialization. `window` is guaranteed to exist: this file is
 * `.client.ts`, and `ssr: false` means there is no other pass to run it in.
 */
export default defineNuxtPlugin({
  name: 'i18n-base-url',
  enforce: 'pre',
  setup() {
    const config = useRuntimeConfig()
    const i18nConfig = config.public.i18n as { baseUrl?: () => string }

    i18nConfig.baseUrl = () => window.location.origin
  },
})
