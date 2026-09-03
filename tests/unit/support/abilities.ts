/**
 * The ability map `/auth/me` publishes, derived from a role.
 *
 * The server resolves it from its POLICIES; a unit test cannot call those, so
 * this reproduces their outcome — the same job `tests/e2e/fixtures/abilities.ts`
 * does for the E2E route mocks, and deliberately the same shape.
 *
 * THE SHAPE IS THE GENERATED ONE, not a copy of it. An earlier version returned
 * an inferred anonymous object with a comment asking the reader to keep it in
 * step with `UserAbilities.php`. That comment was a hope, not a gate: narrow
 * `participants.recover` to admin-only on the server and every layer stays
 * green — the API's own test, the regenerated `openapi.json`, the regenerated
 * `types/api.ts` — while this mirror keeps answering `true` for an operator and
 * the suite happily proves a button renders that will 403 on click. Annotating
 * the return type as `Abilities` makes a group the server adds, renames or
 * drops a COMPILE error instead.
 *
 * `bun run typecheck` does not cover `tests/unit/**`, so the annotation here
 * would be unenforced on its own. `tests/nuxt/abilities-contract.ts` is what
 * actually fails the build — see its docblock.
 *
 * DERIVED FROM THE ROLE, never hardcoded per test. A test that spells out its
 * own map keeps passing after the policy it describes has changed, which is the
 * failure mode this whole mechanism exists to remove.
 *
 * `api/tests/Feature/Authorization/AbilitiesMapTest.php` is what proves the REAL
 * map is right, role by role. This only has to agree with it.
 */
import type { Abilities, AbilityKey } from '../../../app/composables/useCurrentUser'

/**
 * The Spatie roles `/auth/me` actually publishes.
 *
 * A union, not `string`: a typo like `'oprator'` used to fall through every
 * branch to viewer-level abilities, and a test asserting "the control is
 * hidden" passed for the wrong reason.
 *
 * `platform` is deliberately NOT in here. The superadmin has no Spatie role at
 * all — `roles` is `$user->getRoleNames()`, which for them is `[]` — so a
 * fixture branching on `roles.includes('platform')` keys off a value the API
 * can never emit. Worse, it inverts: mock the superadmin HONESTLY (`roles: []`,
 * `is_superadmin: true`) and such a fixture falls through to viewer level and
 * answers `avatarTemplates.create: false`, the exact opposite of the truth.
 * Production reads the field that carries the identity — `user.is_superadmin`,
 * in `settings/index.vue` and `SidebarNav.vue` — and so does this.
 */
export type TenantRole = 'admin' | 'operator' | 'viewer'

/**
 * Who is asking, in the shape `/auth/me` reports it: Spatie roles plus the
 * superadmin discriminator, which are two independent facts on the server and
 * must stay two here.
 */
export interface MirroredIdentity {
  roles: readonly TenantRole[]
  isSuperadmin?: boolean
}

/** The array form the E2E specs already use, widened to the honest shape. */
export type MirroredIdentityInput = MirroredIdentity | readonly TenantRole[]

/**
 * One normaliser, exported, so the two mirrors cannot disagree about what an
 * input means. `Array.isArray` does not narrow a readonly-array union, hence
 * the explicit check on the object shape.
 */
export function toIdentity(input: MirroredIdentityInput | TenantRole): MirroredIdentity {
  if (typeof input === 'string') return { roles: [input] }
  if ('roles' in input) return input

  return { roles: input }
}

export function abilitiesForRole(input: MirroredIdentityInput | TenantRole): Abilities {
  const identity = toIdentity(input)
  const platform = identity.isSuperadmin === true
  const admin = platform || identity.roles.includes('admin')
  const operator = admin || identity.roles.includes('operator')
  // Everything the server answers from `admin || operator || viewer`. Derived
  // rather than written `true`, because "any signed-in role" and "true" stop
  // being the same answer the moment a fourth role exists.
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

/**
 * A `useCurrentUser` stub for `vi.doMock`, answering as the given role.
 *
 * `can()` takes `AbilityKey` — the same template-literal union the real one
 * takes — so a bad key is rejected rather than silently answering `false`. That
 * direction matters: in a gating test `false` renders as "button correctly
 * hidden", so a stub looser than the real thing is green for the wrong reason.
 *
 * The annotation alone does NOT enforce that here: `typecheck` covers neither
 * `tests/unit/**` nor `tests/e2e/**`, so a bad key at a call site in those
 * trees compiles. `tests/nuxt/abilities-contract.ts` calls this with the real
 * key set precisely so the claim is a build failure rather than a sentence.
 *
 * Only the two members a page uses for gating. A stub returning the whole
 * composable would invite tests to assert on its internals instead of on what
 * renders.
 */
export function currentUserStub(input: MirroredIdentityInput | TenantRole) {
  const abilities = abilitiesForRole(input)

  return {
    can: (key: AbilityKey): boolean => {
      const [group, action] = key.split('.') as [keyof Abilities, string]
      const entry = abilities[group] as Record<string, boolean> | undefined

      return entry?.[action] === true
    },
    ensureLoaded: () => Promise.resolve(undefined),
  }
}
