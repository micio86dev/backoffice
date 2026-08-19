// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // SPA mode (D2 — backoffice is always client-side rendered; no SSR)
  ssr: false,

  // i18n — always multilingual (D12); it default, prefix_except_default, lazy
  modules: ['@nuxtjs/i18n', '@sentry/nuxt/module'],

  // Sentry — application error monitoring (C13, task 5.1, Nuxt half).
  // Source-map upload is OFF unless a SENTRY_AUTH_TOKEN is present in the
  // deploy environment: an unattended `enabled: true` default would make
  // every local `nuxt generate` attempt an authenticated network call it has
  // no credentials for. `sentry.client.config.ts` / `sentry.server.config.ts`
  // hold the actual DSN/PII/scrubbing posture.
  sentry: {
    sourceMapsUploadOptions: {
      enabled: Boolean(process.env['SENTRY_AUTH_TOKEN']),
      org: process.env['SENTRY_ORG'],
      project: process.env['SENTRY_PROJECT'],
      authToken: process.env['SENTRY_AUTH_TOKEN'],
    },
  },
  i18n: {
    defaultLocale: 'it',
    strategy: 'prefix_except_default',
    lazy: true,
    langDir: 'locales/',
    // `language` is REQUIRED for the `<html lang>` binding: @nuxtjs/i18n's
    // localeHead only emits `htmlAttrs.lang` when the active locale declares
    // one (`runtime/routing/head.js`: `if (ctx.lang && ctx.currentLanguage)`),
    // and `currentLanguage` reads `locale.language` — NOT `locale.code`.
    // Without it useLocaleHead() returns no lang at all and every route falls
    // back to the default. It also feeds the hreflang/og:locale SEO tags.
    locales: [
      { code: 'it', language: 'it', file: 'it.json' },
      { code: 'en', language: 'en', file: 'en.json' },
    ],
    // form-clarity-and-console-warnings, D8: silences the unconditional
    // `console.warn` inside @nuxtjs/i18n's `createHeadContext`
    // (`runtime/routing/head.js:15`), which fires BEFORE `options.seo` is
    // read at `:96` and re-fires on every route/locale change via its
    // client-side watcher (`:37-46`). `seo: false` (app.vue) does NOT
    // silence it — only `baseUrl` does; `seo: false` stays because this app's
    // `noindex, nofollow` policy (D30) means a canonical URL has no product
    // value here.
    //
    // Function form, kept here for documentation/typing and for the SSR path
    // this option is designed for. It does NOT reach the browser by itself:
    // @nuxtjs/i18n forwards it into `runtimeConfig.public.i18n.baseUrl`,
    // which this `ssr: false` static build embeds client-side as a JSON
    // literal (`window.__NUXT__.config`, verified in the generated
    // `index.html`) — and a function cannot survive `JSON.stringify`, so it
    // is silently dropped and the warning fires exactly as if this were never
    // set. `app/plugins/i18n-base-url.client.ts` is what actually makes this
    // work for this app's deployment shape: it re-injects the same function
    // into the live `useRuntimeConfig()` object, in memory, before
    // @nuxtjs/i18n's own plugin reads it — never touching serialization.
    // Caught end-to-end by `tests/e2e/html-lang.spec.ts`'s console listener.
    baseUrl: () => (typeof window === 'undefined' ? '' : window.location.origin),
  },

  // Tailwind CSS v4 via Vite plugin (D26)
  vite: {
    plugins: [tailwindcss()],
  },

  // Global CSS
  css: ['~/assets/css/main.css'],

  // App head (D29/D30). Both values are injected reactively by app.vue:
  //   - `noindex` ALWAYS (D30)
  //   - `htmlAttrs.lang` from @nuxtjs/i18n's useLocaleHead(), so `/en/*`
  //     serves lang="en" (WCAG 3.1.1). The literal below is ONLY the
  //     pre-hydration default baked into the generated SPA shell — it is
  //     `defaultLocale` by construction and must never be read as the
  //     authoritative page language.
  app: {
    head: {
      htmlAttrs: { lang: 'it' },
    },
  },

  // Security headers (D29 / task 7.8).
  // For the SPA (ssr: false), these are primarily applied at nginx level (see Dockerfile).
  // Nitro route rules are included here for dev server and `nuxt preview` consistency.
  nitro: {
    routeRules: {
      '/**': {
        headers: {
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        },
      },
    },
  },

  // Runtime config
  runtimeConfig: {
    public: {
      apiBase: '',
      // C13 task 5.3 — analytics. EMPTY means the tool does not load at all,
      // which is the correct default: these are per-deployment IDs, and a
      // committed one would have every developer's local session reported into
      // a production property. Consent gates them independently
      // (app/utils/analytics-consent.ts) and defaults to denied.
      gaMeasurementId: '',
      clarityProjectId: '',
      // C13 task 5.1 — Sentry. EMPTY means the SDK never initializes
      // (app/utils/sentry-init.ts's `enabled` gate), the same "unset ID"
      // posture as Clarity/GA4 above. Unlike those two, Sentry is NOT
      // additionally gated on analytics consent — see
      // sentry.client.config.ts for why.
      sentryDsn: '',
      sentryEnvironment: '',
    },
  },
})
