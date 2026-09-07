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
import { abilitiesForRole, type MirroredIdentityInput } from '../../unit/support/abilities'

export function abilitiesFor(input: MirroredIdentityInput): Abilities {
  // DELEGATES, and that is the fix rather than a tidy-up.
  //
  // This re-implemented `abilitiesForRole` line for line — four derivations,
  // nine groups — while already importing from that very module one line up,
  // so the barrier that might have justified the copy did not exist. The
  // duplication was invisible to every gate: `abilities-contract.ts` checks the
  // SHAPE (its own docblock says no type can check the booleans),
  // `AbilitiesMapTest.php` lives in another repo, and `typecheck` skips
  // `tests/unit/**`.
  //
  // The mutation that made nothing fail: narrow `participants.recover` to
  // `admin` in the unit mirror, forget it here, and an e2e mocking an operator
  // with `recover: true` passes against a UI that 403s on click — the exact
  // scenario both docblocks exist to prevent.
  return abilitiesForRole(input)
}
