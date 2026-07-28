// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // SPA mode (D2 — backoffice is always client-side rendered; no SSR)
  ssr: false,

  // i18n — always multilingual (D12); it default, prefix_except_default, lazy
  modules: ['@nuxtjs/i18n'],
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
    },
  },
})
