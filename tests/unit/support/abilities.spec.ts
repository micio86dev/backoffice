import { describe, it, expect } from 'vitest'
import { abilitiesForRole } from './abilities'

/**
 * The ability MIRROR's values, asserted where a wrong one fails.
 *
 * `tests/nuxt/abilities-contract.ts` guards this fixture's SHAPE — that every
 * key exists and is assignable to the generated `Abilities` type — and that is
 * all it can do: it is typecheck-only, so a `const x: boolean = false` compiles
 * exactly as well as `true`. Every other consumer checks `typeof answer ===
 * 'boolean'`.
 *
 * That gap is not hypothetical. `llmCredentials` flipped from an org-admin
 * ability to a platform one and the whole 2064-test suite stayed green: nothing
 * read the value. The fixture was asserting a security claim with no consumer.
 *
 * The settings page cannot close it either, and the reason is worth stating so
 * nobody deletes this file believing it duplicates one of those specs. The
 * credential-vault section is gated on `user.is_superadmin`, never on
 * `can('llmCredentials.viewAny')`, so its specs pass whichever way this mirror
 * answers. And `admin = platform || roles.includes('admin')`, so a SUPERADMIN
 * reads `true` under both versions — only the ORG ADMIN case tells them apart.
 */
describe('tests/unit/support/abilities — the mirror answers VALUES, not just booleans', () => {
  it('gives an org admin no LLM-credential ability at all', () => {
    // The security claim. `LlmCredentialPolicy` answers all five methods from
    // `is_superadmin === true` since 2026-09-14: these rows are BEAI's own,
    // and `hasRole('admin')` is an org-scoped grant that cannot describe a row
    // belonging to no organization.
    const admin = abilitiesForRole('admin').llmCredentials

    expect(admin).toEqual({ viewAny: false, create: false, update: false, delete: false })
  })

  it('gives a superadmin every LLM-credential ability', () => {
    const platform = abilitiesForRole({ roles: [], isSuperadmin: true }).llmCredentials

    expect(platform).toEqual({ viewAny: true, create: true, update: true, delete: true })
  })

  /**
   * The sibling group that already worked this way, pinned alongside it so the
   * two platform surfaces cannot drift apart — and because this file's own
   * docblock cites `avatarTemplates.create` as the drift that went unnoticed
   * for a year.
   */
  it('lets an org admin LIST avatar templates but not create one', () => {
    const admin = abilitiesForRole('admin').avatarTemplates

    expect(admin.viewAny).toBe(true)
    expect(admin.create).toBe(false)
    expect(abilitiesForRole({ roles: [], isSuperadmin: true }).avatarTemplates.create).toBe(true)
  })

  it('still gives an org admin the abilities that ARE theirs', () => {
    // A guard that answered `false` to everything would pass the cases above
    // for the wrong reason.
    const admin = abilitiesForRole('admin')

    expect(admin.apiClients.viewAny).toBe(true)
    expect(admin.users.viewAny).toBe(true)
    expect(admin.organization.update).toBe(true)
  })
})
