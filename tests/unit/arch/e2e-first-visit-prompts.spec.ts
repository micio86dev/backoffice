/**
 * e2e-first-visit-prompts.spec.ts
 *
 * Architecture guard: an e2e spec that signs the admin in by mocking `/auth/me`
 * MUST also answer the two first-visit prompts, through the shared fixture
 * (`tests/e2e/fixtures/admin-session.ts`).
 *
 * WHY. A fresh browser profile is asked two things on first sight: the analytics
 * consent banner and, after sign-in, the guided onboarding tour. Both arrive
 * AFTER the page is interactive and take focus. `useExclusivePopover` closes an
 * open picker on any `focusin` outside it, so a prompt that opens late closes a
 * dropdown under a running test: a race that fails on slow CI runners and on
 * WebKit, and passes locally. The fixture answers both deterministically
 * (`answerFirstVisitPrompts`, seeded through `addInitScript`) before the page
 * loads.
 *
 * RULE. A spec that mentions `/auth/me` must either import from the
 * `admin-session` fixture or call `answerFirstVisitPrompts`.
 *
 * ALLOWLIST. Specs that deliberately exercise a prompt must see it open. There
 * are none today that mock `/auth/me`; add one here, named and justified, rather
 * than weakening the rule.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const E2E_ROOT = join(__dirname, '../../e2e')

const ALLOWLIST: Record<string, string> = {
  // 'example.spec.ts': 'asserts the tour card itself, so the tour must open',
}

function answersFirstVisitPrompts(source: string): boolean {
  return (
    /from\s+['"][^'"]*fixtures\/admin-session['"]/.test(source) ||
    /answerFirstVisitPrompts\s*\(/.test(source)
  )
}

describe('e2e specs that mock the identity answer the first-visit prompts', () => {
  const specs = readdirSync(E2E_ROOT).filter((f) => f.endsWith('.spec.ts'))

  it('finds the e2e specs', () => {
    expect(specs.length).toBeGreaterThan(10)
  })

  it('every spec mocking /auth/me imports the admin-session fixture or calls answerFirstVisitPrompts', () => {
    const offenders = specs
      .filter((f) => !(f in ALLOWLIST))
      .filter((f) => readFileSync(join(E2E_ROOT, f), 'utf-8').includes('/auth/me'))
      .filter((f) => !answersFirstVisitPrompts(readFileSync(join(E2E_ROOT, f), 'utf-8')))

    expect(
      offenders,
      `specs that mock /auth/me without answering the prompts:\n${offenders.join('\n')}`
    ).toEqual([])
  })

  it('keeps no stale allowlist entry', () => {
    for (const f of Object.keys(ALLOWLIST)) expect(specs).toContain(f)
  })
})
