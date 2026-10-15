import { test, expect } from '@playwright/test'
import { mockSuperadminSettings } from './fixtures/platform-settings'

/**
 * Settings → Piattaforma: the interview closing greeting, end to end.
 *
 * Same contract as the intro (its own PATCH field only, per-locale tabs), plus
 * the point of the tabs: an error in the Italian tab must not stay hidden
 * while English is showing.
 */

async function openPlatform(page: import('@playwright/test').Page) {
  await page.goto('/settings')
  await page.getByRole('tab', { name: /^Piattaforma/ }).click()
}

test.describe('Settings → Piattaforma: interview closing greeting', () => {
  test('a superadmin sets a closing greeting, saves, reloads and sees it again', async ({
    page,
  }) => {
    const state = await mockSuperadminSettings(page)
    await openPlatform(page)

    await page.getByTestId('closing-phrase-en').fill('Thank you, it was a pleasure.')
    await page.getByTestId('closing-phrase-tab-it').click()
    await page.getByTestId('closing-phrase-it').fill('Grazie, è stato un piacere.')
    await page.getByTestId('closing-phrase-submit').click()

    await expect(page.getByTestId('closing-phrase-banner')).toBeVisible()
    expect(state.patches).toEqual([
      {
        interview_closing_phrase: {
          en: 'Thank you, it was a pleasure.',
          it: 'Grazie, è stato un piacere.',
        },
      },
    ])

    await page.reload()
    await page.getByRole('tab', { name: /^Piattaforma/ }).click()

    await expect(page.getByTestId('closing-phrase-en')).toHaveValue('Thank you, it was a pleasure.')
    await page.getByTestId('closing-phrase-tab-it').click()
    await expect(page.getByTestId('closing-phrase-it')).toHaveValue('Grazie, è stato un piacere.')
  })

  test('an error in the Italian tab is flagged and brought into view on save', async ({ page }) => {
    const state = await mockSuperadminSettings(page)
    await openPlatform(page)

    await page.getByTestId('closing-phrase-en').fill('Thank you.')
    await page.getByTestId('closing-phrase-tab-it').click()
    await page.getByTestId('closing-phrase-it').fill('a'.repeat(3610))
    await page.getByTestId('closing-phrase-tab-en').click()
    await page.getByTestId('closing-phrase-submit').click()

    await expect(page.getByTestId('closing-phrase-tab-it')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('closing-phrase-it-error')).toBeVisible()
    await expect(page.getByTestId('closing-phrase-tab-it-error')).toBeAttached()
    expect(state.patches).toEqual([])
  })

  test('clearing asks first and then sends null for the closing greeting only', async ({
    page,
  }) => {
    const state = await mockSuperadminSettings(page)
    await openPlatform(page)

    await page.getByTestId('closing-phrase-en').fill('Thank you.')
    await page.getByTestId('closing-phrase-submit').click()
    await expect(page.getByTestId('closing-phrase-banner')).toBeVisible()

    await page.getByTestId('closing-phrase-clear').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Rimuovi saluto' }).click()

    await expect.poll(() => state.patches.length).toBe(2)
    expect(state.patches[1]).toEqual({ interview_closing_phrase: null })
    await expect(page.getByTestId('closing-phrase-en')).toHaveValue('')
  })
})
