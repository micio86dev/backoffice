/**
 * The ability map `/auth/me` returns, derived from a role list.
 *
 * The server resolves this from its POLICIES; a fixture cannot call those, so it
 * reproduces their outcome.
 *
 * THE SHAPE IS THE GENERATED ONE. This used to return an inferred anonymous
 * object under a comment asking the reader to keep it in step with
 * `UserAbilities.php` — and the comment was already wrong when it was written:
 * it said `avatarTemplates.create` was an admin ability a year after managing
 * templates became platform-only. Prose cannot fail a build. Annotating the
 * return as `Abilities` means a group the server adds, renames or drops is a
 * compile error, and `tests/nuxt/abilities-contract.ts` is what makes that
 * annotation bite (`typecheck` covers neither `tests/e2e/**` nor
 * `tests/unit/**` on its own).
 *
 * DERIVED FROM THE ROLE rather than hardcoded per spec, for the same reason the
 * production code does not hardcode it in Vue: a second copy of an
 * authorization rule drifts, and a fixture that drifts makes every test using
 * it quietly stop testing what it says it tests.
 *
 * `api/tests/Feature/Authorization/AbilitiesMapTest.php` proves the real map is
 * right; this only has to agree with it.
 */
import type { Abilities } from '../../../app/composables/useCurrentUser'
import { toIdentity, type MirroredIdentityInput } from '../../unit/support/abilities'

export function abilitiesFor(input: MirroredIdentityInput): Abilities {
  // The superadmin is NOT a Spatie role. `/auth/me` builds `roles` from
  // `getRoleNames()`, which for them is `[]`, so branching on
  // `roles.includes('platform')` keys off something the API cannot emit — and
  // a fixture that mocks the superadmin honestly would then answer
  // `avatarTemplates.create: false`, the opposite of the truth. The identity
  // lives in its own field, here as in `SidebarNav.vue`.
  const identity = toIdentity(input)

  const platform = identity.isSuperadmin === true
  const admin = platform || identity.roles.includes('admin')
  const operator = admin || identity.roles.includes('operator')
  // What the server answers from `admin || operator || viewer`. Derived, not
  // written `true`: the two stop being the same answer the moment a role exists
  // outside that set.
  const viewer = operator || identity.roles.includes('viewer')

  return {
    organization: { view: viewer, update: admin },
    apiClients: { viewAny: admin, create: admin, delete: admin },
    users: { viewAny: admin, create: admin, update: admin, deactivate: admin, activate: admin },
    llmCredentials: { viewAny: admin, create: admin, update: admin, delete: admin },
    avatarTemplates: {
      viewAny: admin,
      create: platform,
      update: platform,
      activate: platform,
      delete: platform,
    },
    projects: { viewAny: viewer, create: operator, update: operator, delete: admin },
    participants: { viewAny: viewer, create: operator, recover: operator },
  }
}
