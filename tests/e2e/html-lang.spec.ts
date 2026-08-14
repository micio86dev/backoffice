import { test, expect } from '@playwright/test'

/**
 * WCAG 3.1.1 (Language of Page, Level A) — `<html lang>` must match the
 * language actually served.
 *
 * Why this spec exists as a SEPARATE, comparative test: axe's `html-has-lang`
 * and `html-lang-valid` rules both PASS against the broken implementation
 * (a hardcoded `lang="it"` in nuxt.config), because a lang attribute IS
 * present and IS a valid BCP-47 tag. Neither rule can detect that it is the
 * WRONG one for an `/en/*` route. The a11y fixture is not at fault — only an
 * assertion that COMPARES the value across two locales discriminates.
 *
 * `/login` is used because it is reachable without a session; the attribute is
 * injected by app.vue for every route regardless of layout or auth state.
 */
test.describe('WCAG 3.1.1 — <html lang> follows the served locale', () => {
  test('the default-locale route serves it and the /en route serves en', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()
    const defaultLocaleLang = await page.locator('html').getAttribute('lang')

    await page.goto('/en/login')
    await expect(page.getByTestId('login-form')).toBeVisible()
    const englishLang = await page.locator('html').getAttribute('lang')

    expect(defaultLocaleLang).toBe('it')
    expect(englishLang).toBe('en')
    // The assertion that actually discriminates: a static value satisfies
    // either expectation above in isolation, never both at once.
    expect(defaultLocaleLang).not.toBe(englishLang)
  })

  test('the /en route serves English copy, matching the lang it declares', async ({ page }) => {
    // Guards the inverse failure: a lang attribute that flips correctly while
    // the content stays Italian would be just as wrong for a screen reader.
    await page.goto('/en/login')

    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

/**
 * form-clarity-and-console-warnings, D8 — "Console Is Free Of I18n baseUrl
 * Warnings On Every Navigation" (admin-backoffice spec).
 *
 * @nuxtjs/i18n's `createHeadContext` (`runtime/routing/head.js:15`) fires an
 * unconditional `console.warn` when `baseUrl` is falsy, and a client-side
 * watcher (`:37-46`) re-invokes it on every route AND locale change — hence
 * covering both, not just initial load. `nuxt.config.ts`'s `i18n.baseUrl`
 * (the function form) is what silences it; `seo: false` alone does not.
 */
test.describe('console is free of the I18n baseUrl warning (admin-backoffice spec)', () => {
  test('never fires on load, after a route change, or after a locale change', async ({ page }) => {
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))

    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()

    // Route change.
    await page.goto('/en/login')
    await expect(page.getByTestId('login-form')).toBeVisible()

    // Locale change (re-fires the head.js watcher independently of navigation).
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()

    // The real message is `I18n \`baseUrl\` is required to generate valid SEO
    // tag links.` — backtick-quoted, so a naive /baseUrl is required/ regex
    // never matches the contiguous substring. Matched on the two words
    // independently instead, tolerant of the exact punctuation.
    const baseUrlWarnings = consoleMessages.filter(
      (text) => /baseurl/i.test(text) && /is required/i.test(text)
    )
    expect(baseUrlWarnings).toEqual([])
  })
})
