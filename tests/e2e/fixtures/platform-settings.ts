import { expect, type Page } from '@playwright/test'
import { answerFirstVisitPrompts } from './admin-session'
import { abilitiesFor } from './abilities'

/**
 * A superadmin session over a small in-memory `/admin/settings` store, so a
 * reload really reads back what was PATCHed. Shared by the intro and closing
 * phrase specs; every PATCH body is recorded in `patches`.
 */
type Phrase = { en?: string; it?: string } | null

export async function mockSuperadminSettings(page: Page) {
  const state = { intro: null as Phrase, closing: null as Phrase, patches: [] as unknown[] }

  await answerFirstVisitPrompts(page)
  await page.route(
    (url) => url.pathname === '/auth/refresh',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'e2e-settings-token', token_type: 'bearer' }),
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
        const body: unknown = route.request().postDataJSON()
        expect(body, 'the PATCH must carry a JSON object body').toEqual(expect.any(Object))
        if (body === null || typeof body !== 'object') return route.abort()
        state.patches.push(body)
        if ('interview_intro_phrase' in body) {
          state.intro = (body as { interview_intro_phrase: Phrase }).interview_intro_phrase ?? null
        }
        if ('interview_closing_phrase' in body) {
          state.closing =
            (body as { interview_closing_phrase: Phrase }).interview_closing_phrase ?? null
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            max_questions_per_competency: { standard: 1, potential: 4 },
            interview_intro_phrase: state.intro,
            interview_closing_phrase: state.closing,
          },
        }),
      })
    }
  )

  return state
}
