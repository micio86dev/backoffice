import { test, expect } from '@playwright/test'
import { mockSuperadminSettings } from './fixtures/platform-settings'

/**
 * Settings → Piattaforma: the interview intro phrase, end to end.
 *
 * A superadmin types an intro, watches the live counter and spoken-time
 * estimate, saves, reloads the page and finds the same text again. The API is
 * mocked with a small in-memory store so the reload really reads back what was
 * PATCHed, and the PATCH body is asserted to carry the intro and nothing else.
 */

test.describe('Settings → Piattaforma: interview intro phrase', () => {
  test('a superadmin sets an intro, sees the counter, saves, reloads and sees it again', async ({
    page,
  }) => {
    const state = await mockSuperadminSettings(page)

    await page.goto('/settings')
    await page.getByRole('tab', { name: /^Piattaforma/ }).click()

    const english = page.getByTestId('intro-phrase-en')
    await expect(english).toBeVisible()
    await english.fill('a'.repeat(30))

    // 30 characters at ~15 per second: exactly 2 s. The counter names both.
    const counter = page.getByTestId('intro-phrase-en-counter')
    // The words around the numbers are localised; the numbers and the unit are not.
    await expect(counter).toHaveText(/^30 \/ 3600\b.*≈ 2 s\b/)

    await page.getByTestId('intro-phrase-tab-it').click()
    await page.getByTestId('intro-phrase-it').fill('Benvenuto in BEAI.')
    await page.getByTestId('intro-phrase-submit').click()

    await expect(page.getByTestId('intro-phrase-banner')).toBeVisible()
    expect(state.patches).toEqual([
      { interview_intro_phrase: { en: 'a'.repeat(30), it: 'Benvenuto in BEAI.' } },
    ])

    await page.reload()
    await page.getByRole('tab', { name: /^Piattaforma/ }).click()

    await expect(page.getByTestId('intro-phrase-en')).toHaveValue('a'.repeat(30))
    await page.getByTestId('intro-phrase-tab-it').click()
    await expect(page.getByTestId('intro-phrase-it')).toHaveValue('Benvenuto in BEAI.')
  })

  test('a text over 3600 characters is flagged in words and cannot be saved', async ({ page }) => {
    const state = await mockSuperadminSettings(page)

    await page.goto('/settings')
    await page.getByRole('tab', { name: /^Piattaforma/ }).click()
    await page.getByTestId('intro-phrase-en').fill('a'.repeat(3610))

    const counter = page.getByTestId('intro-phrase-en-counter')
    await expect(counter).toHaveText(/^3610 \/ 3600\b/)
    // The overage is the warning in words: exactly 10, not the 10 inside 3610.
    await expect(counter.locator('strong')).toHaveText(/(?<!\d)10(?!\d)/)
    await page.getByTestId('intro-phrase-submit').click()

    // Settled: the refusal is shown and the form is idle again, so a late PATCH would have fired.
    await expect(page.getByTestId('intro-phrase-en-error')).toBeVisible()
    await expect(page.getByTestId('intro-phrase-submit')).toBeEnabled()
    expect(state.patches).toEqual([])
  })
})
