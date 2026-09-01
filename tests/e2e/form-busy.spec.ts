import { test, expect } from '@playwright/test'

/**
 * A form that is submitting is inert, and says so.
 *
 * Two rules, one moment: while a submit is in flight every field of that form
 * stays disabled, and the submit CTA carries a spinner. Together they stop the
 * second submit — the one an operator makes because nothing appeared to happen
 * — from turning one intention into two writes.
 *
 * THIS IS THE ONLY PLACE THE FIRST HALF CAN BE ASSERTED. `<fieldset disabled>`
 * disables its whole subtree by inheritance, so no child carries the attribute
 * and jsdom implements neither the property nor the `:disabled` selector for
 * it — the unit test at `tests/unit/components/ui/form-fieldset.spec.ts` says
 * so out loud and stops at the fieldset. Playwright's `toBeDisabled()` asks a
 * real engine, which is exactly what is missing everywhere else.
 *
 * The login page is the subject because it is the one form reachable with no
 * session, so the test needs nothing but a held-open request.
 */
test.describe('a form in flight', () => {
  test('disables every field and spins the CTA until the request settles', async ({ page }) => {
    // Held open, then released — a request that never resolves would assert
    // the same thing, but it would also leave the page in that state forever
    // and hide a spinner that is never taken down.
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    await page.route(
      (url) => url.pathname === '/auth/login',
      async (route) => {
        await held
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'e2e-access-token',
            refresh_token: 'e2e-refresh',
            token_type: 'bearer',
          }),
        })
      }
    )

    await page.goto('/login')

    const email = page.getByLabel('Email')
    const password = page.getByLabel('Password')
    const submit = page.getByRole('button', { name: 'Accedi' })

    await email.fill('admin@example.com')
    await password.fill('secret-password')

    // Before: everything is usable. Asserted so the "after" below cannot pass
    // against a form that was inert all along.
    await expect(email).toBeEnabled()
    await expect(submit).toBeEnabled()

    await submit.click()

    // During: no field accepts input, and the button says work is happening.
    await expect(email).toBeDisabled()
    await expect(password).toBeDisabled()
    await expect(submit).toBeDisabled()
    await expect(submit).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('button-spinner')).toBeVisible()

    // The label does NOT change. Swapping it to "Signing in…" would move the
    // control under the pointer that just clicked it, and re-announce it to a
    // screen reader as a different button; `aria-busy` carries the state.
    await expect(submit).toHaveText('Accedi')

    release?.()

    // After: the spinner is taken down rather than left spinning forever.
    await expect(page.getByTestId('button-spinner')).toBeHidden()
  })
})
