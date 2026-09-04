/**
 * COMPILE-TIME contract test — enforced by `bun run typecheck`, not by Vitest.
 *
 * Why it lives in `tests/nuxt/` and nowhere else: `.nuxt/tsconfig.app.json` (the
 * project `nuxi typecheck` actually builds) includes `../app/**`,
 * `../tests/nuxt/**` and `../test/nuxt/**`. It includes NEITHER `tests/unit/**`
 * NOR `tests/e2e/**`, so the `: Abilities` annotations on the two mirrors are
 * unenforced where they sit — a gate that can never fire, which is exactly the
 * class of non-evidence the standards forbid. This file is where they bite.
 *
 * WHAT IT GUARDS. Two files reproduce what the server's policies answer: the
 * unit stub the component tests gate on, and the E2E fixture that mocks
 * `/auth/me`. Both used to be anonymous objects under a comment asking the
 * reader to keep them in step with `UserAbilities.php`.
 *
 * Play that forward. The server narrows `participants.recover` to admin-only.
 * `AbilitiesMapTest.php` is updated in the api repo — green. `openapi.json`
 * regenerates, `types/api.ts` regenerates — green. Both mirrors keep saying
 * `recover: true` for an operator, the unit test "operator sees Recover"
 * passes, the E2E test mocks a map with `recover: true` and passes, and the
 * product ships an operator a button that 403s on click. Nothing anywhere goes
 * red.
 *
 * The PHP test proves the SERVER right. It cannot fail when the MIRROR drifts,
 * because it lives in another repository with no mechanical link to these
 * lines. This file is that link.
 *
 * HOW IT ACTUALLY BITES, stated precisely because the first version of this
 * comment got it wrong. The `import type` lines pull both modules into the TS
 * program, so the `: Abilities` return annotations INSIDE them are checked and
 * a dropped group is reported at its own source line. That is the primary
 * mechanism. While those annotations stand, `ReturnType<typeof f>` is
 * `Abilities` by construction and the assertions below are tautologies — they
 * earn their place only if someone deletes an annotation, which is exactly the
 * edit that would otherwise re-open the hole. Defence in depth, not the gate
 * itself.
 *
 * The `can()` probe is a separate gate and a real one: `AbilityKey` is a
 * template-literal union, but `typecheck` covers neither `tests/unit/**` nor
 * `tests/e2e/**`, so a bad key at a call site over there compiles silently and
 * answers `false` — which in a gating test reads as "button correctly hidden".
 * Calling it from HERE is what makes the stub's documented strictness true.
 *
 * None of this checks the booleans — no type can. `AbilitiesMapTest.php` owns
 * those, role by role, against the real policies.
 */
import type { Abilities } from '../../app/composables/useCurrentUser'
import type { abilitiesFor } from '../e2e/fixtures/abilities'
import { currentUserStub, type abilitiesForRole } from '../unit/support/abilities'

/** Resolves to `true` only when A and B are mutually assignable. */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const unitMirrorMatchesGeneratedAbilities: MutuallyAssignable<
  ReturnType<typeof abilitiesForRole>,
  Abilities
> = true

export const e2eMirrorMatchesGeneratedAbilities: MutuallyAssignable<
  ReturnType<typeof abilitiesFor>,
  Abilities
> = true

/**
 * Every ability the stub is asked for across the suite, checked against the
 * real `AbilityKey` union. A key the server stops publishing — or a typo —
 * fails the build here instead of quietly answering `false` at a call site
 * `typecheck` never looks at.
 */
export const stubAcceptsOnlyRealAbilityKeys: boolean = [
  currentUserStub('admin').can('organization.update'),
  currentUserStub('admin').can('users.viewAny'),
  currentUserStub('admin').can('apiClients.delete'),
  currentUserStub('admin').can('llmCredentials.update'),
  currentUserStub('admin').can('avatarTemplates.viewAny'),
  currentUserStub({ roles: [], isSuperadmin: true }).can('avatarTemplates.create'),
  currentUserStub('operator').can('projects.update'),
  currentUserStub('operator').can('participants.recover'),
  currentUserStub('viewer').can('projects.viewAny'),
].every((answer) => typeof answer === 'boolean')
