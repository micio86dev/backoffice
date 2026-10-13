import { test, expect, type Page } from '@playwright/test'
import { answerFirstVisitPrompts } from './fixtures/admin-session'
import { abilitiesFor } from './fixtures/abilities'

/**
 * Settings → Piattaforma: the interview intro phrase, end to end.
 *
 * A superadmin types an intro, watches the live counter and spoken-time
 * estimate, saves, reloads the page and finds the same text again. The API is
 * mocked with a small in-memory store so the reload really reads back what was
 * PATCHed, and the PATCH body is asserted to carry the intro and nothing else.
 */

type Intro = { en?: string; it?: string } | null

async function mockSuperadminSettings(page: Page) {
  const state = { intro: null as Intro, patches: [] as unknown[] }

  await answerFirstVisitPrompts(page)
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'e2e-intro-token', token_type: 'bearer' }),
      })
  )
  await page.route(
    (url) => url.pathname === '/auth/me',
    (route) =>
      route.request().resourceType() === 'document'
        ? route.continue()
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              user: {
                id: 1,
                name: 'Root',
                email: 'root@example.com',
                locale: 'it',
                photo_url: null,
                is_superadmin: true,
              },
              organization: null,
              roles: [],
              abilities: abilitiesFor({ roles: [], isSuperadmin: true }),
            }),
          })
  )
  await page.route(
    (url) => url.pathname === '/admin/organizations',
    (route) =>
      route.request().resourceType() === 'document'
        ? route.continue()
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [], acting_organization_id: null }),
          })
  )
  await page.route(
    (url) => url.pathname === '/admin/settings',
    (route) => {
      if (route.request().resourceType() === 'document') return route.continue()

      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as { interview_intro_phrase?: Intro }
        state.patches.push(body)
        if ('interview_intro_phrase' in body) state.intro = body.interview_intro_phrase ?? null
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            max_questions_per_competency: { standard: 1, potential: 4 },
            interview_intro_phrase: state.intro,
          },
        }),
      })
    }
  )

  return state
}

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
    await expect(counter).toContainText('30')
    await expect(counter).toContainText('600')
    await expect(counter).toContainText('2 s')

    await page.getByTestId('intro-phrase-it').fill('Benvenuto in BEAI.')
    await page.getByTestId('intro-phrase-submit').click()

    await expect(page.getByTestId('intro-phrase-banner')).toBeVisible()
    expect(state.patches).toEqual([
      { interview_intro_phrase: { en: 'a'.repeat(30), it: 'Benvenuto in BEAI.' } },
    ])

    await page.reload()
    await page.getByRole('tab', { name: /^Piattaforma/ }).click()

    await expect(page.getByTestId('intro-phrase-en')).toHaveValue('a'.repeat(30))
    await expect(page.getByTestId('intro-phrase-it')).toHaveValue('Benvenuto in BEAI.')
  })

  test('a text over 600 characters is flagged in words and cannot be saved', async ({ page }) => {
    const state = await mockSuperadminSettings(page)

    await page.goto('/settings')
    await page.getByRole('tab', { name: /^Piattaforma/ }).click()
    await page.getByTestId('intro-phrase-en').fill('a'.repeat(610))

    await expect(page.getByTestId('intro-phrase-en-counter')).toContainText('10')
    await page.getByTestId('intro-phrase-submit').click()

    await expect(page.getByTestId('intro-phrase-en-error')).toBeVisible()
    expect(state.patches).toEqual([])
  })
})
