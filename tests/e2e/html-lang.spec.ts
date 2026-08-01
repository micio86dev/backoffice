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
