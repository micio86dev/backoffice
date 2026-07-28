/**
 * nuxt.config.ts — i18n contract that the `<html lang>` binding depends on.
 *
 * @nuxtjs/i18n only emits `htmlAttrs.lang` when the ACTIVE locale declares a
 * `language` (BCP-47) field:
 *
 *   runtime/routing/head.js
 *     currentLanguage: currentLocale.language     // NOT currentLocale.code
 *     if (ctx.lang && ctx.currentLanguage) { metaObject.htmlAttrs.lang = ... }
 *
 * Without it `useLocaleHead()` returns no lang at all, app.vue silently falls
 * back to the default, and every `/en/*` route serves `lang="it"` again —
 * with app.vue's own unit tests still green, because they stub useLocaleHead.
 * The E2E spec catches this end to end; this test catches it in milliseconds.
 */
import { describe, it, expect, vi } from 'vitest'

interface LocaleEntry {
  code: string
  language?: string
  file: string
}

async function loadNuxtConfig() {
  // `defineNuxtConfig` is a Nuxt auto-import; outside the Nuxt context it just
  // needs to hand the object back unchanged.
  vi.stubGlobal('defineNuxtConfig', <T>(config: T): T => config)
  vi.resetModules()
  return (await import('../../nuxt.config')).default as unknown as {
    i18n: { defaultLocale: string; locales: LocaleEntry[] }
    app: { head: { htmlAttrs: { lang: string } } }
  }
}

describe('nuxt.config i18n — <html lang> prerequisites (WCAG 3.1.1)', () => {
  it('declares a `language` tag on EVERY locale', async () => {
    const config = await loadNuxtConfig()

    expect(config.i18n.locales.length).toBeGreaterThan(1)
    for (const locale of config.i18n.locales) {
      expect(locale.language, `locale "${locale.code}" is missing \`language\``).toBeTruthy()
    }
  })

  it('gives each locale a DISTINCT language tag (a shared one would pin every route to one language)', async () => {
    const config = await loadNuxtConfig()
    const languages = config.i18n.locales.map((locale) => locale.language)

    expect(new Set(languages).size).toBe(languages.length)
  })

  it('keeps the static head lang as the pre-hydration default only — it must equal defaultLocale', async () => {
    const config = await loadNuxtConfig()

    expect(config.app.head.htmlAttrs.lang).toBe(config.i18n.defaultLocale)
  })
})
