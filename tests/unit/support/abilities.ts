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
import { computed } from 'vue'
import type { Abilities, AbilityKey, CurrentUser } from '../../../app/composables/useCurrentUser'

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

/** The runtime counterpart of `TenantRole`, so the union can actually bite. */
const TENANT_ROLES: readonly TenantRole[] = ['admin', 'operator', 'viewer']

/**
 * One normaliser. `Array.isArray` does not narrow a readonly-array union, hence
 * the explicit check on the object shape.
 *
 * It THROWS on an unknown role, and that is the only mechanism available here:
 * `.nuxt/tsconfig.app.json` includes `../tests/nuxt/**` and never
 * `tests/unit/**`, so a type-level guarantee placed in this tree is a gate that
 * can never fire. Two live callers had already widened back to `string`
 * (`participants/detail.spec.ts`'s `role?: string`, and
 * `OrganizationProfileForm.spec.ts`'s inferred `{ current: 'admin' }`).
 *
 * The failure it prevents is worse than it sounds. A typo does NOT fall through
 * to viewer — it falls through to ALL-FALSE, so `mountEntryLinkCard({ role:
 * 'viewr' })` renders nothing, `expect(...).toBe(false)` passes, and the test
 * reports "correctly hidden for a viewer" while exercising a role that does not
 * exist. A gating test is green in the permissive direction only when it is
 * wrong.
 */
function toIdentity(input: MirroredIdentityInput | TenantRole): MirroredIdentity {
  const identity: MirroredIdentity =
    typeof input === 'string' ? { roles: [input] } : 'roles' in input ? input : { roles: input }

  for (const role of identity.roles) {
    if (!TENANT_ROLES.includes(role)) {
      throw new Error(
        `Unknown tenant role: ${String(role)}. Expected one of ${TENANT_ROLES.join(', ')}.`
      )
    }
  }

  return identity
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
 * THREE members, not two. `pages/settings/index.vue` destructures
 * `{ can, user, ensureLoaded }` and gates its platform section on
 * `user.value?.is_superadmin`, so a stub without `user` makes that page throw
 * on `undefined` — the same argument that fixed `ensureLoaded` above, stopping
 * one member short. Still not the whole composable: a stub returning
 * everything invites tests to assert on internals instead of on what renders.
 */
export function currentUserStub(input: MirroredIdentityInput | TenantRole) {
  const abilities = abilitiesForRole(input)
  const identity = toIdentity(input)
  const identityUser: CurrentUser['user'] = {
    id: 1,
    name: 'Test user',
    email: 'test@example.com',
    locale: 'en',
    photo_url: null,
    is_superadmin: identity.isSuperadmin === true,
  }

  return {
    can: (key: AbilityKey): boolean => {
      const [group, action] = key.split('.') as [keyof Abilities, string]
      const entry = abilities[group] as Record<string, boolean> | undefined

      return entry?.[action] === true
    },
    // Resolves to a CurrentUser, because the real one does.
    //
    // This returned `undefined`, and nothing type-checked it: `typecheck` skips
    // `tests/unit/**` and the contract test probes only `can()`. Today's three
    // call sites all `void … .catch()` so it was inert — but `SidebarNav.vue`
    // does `const { user } = await useCurrentUser().ensureLoaded()`, so the
    // first unit test to point this shared stub at that component would have
    // got a TypeError on undefined instead of a useful failure. A stub looser
    // than the thing it stands in for is green for the wrong reason.
    // NO `as CurrentUser`. A type assertion needs only comparability, not
    // assignability, so a literal missing `user.locale` and the top-level
    // `organization` compiled in silence — the cast disarmed the very
    // annotation added to enforce the shape. `abilities-contract.ts` imports
    // this module as a VALUE, so `nuxi typecheck` pulls it into the program and
    // an unasserted literal is a build error at its own line. That is the gate;
    // the cast was opting out of it.
    // ONE literal, shared with `ensureLoaded` below. In production these are the
    // same object — `user` is `computed(() => current.value?.user ?? null)` over
    // the value `ensureLoaded()` resolved — so two independent literals could
    // drift into a disagreement production cannot produce.
    //
    // `computed`, not `ref`: production's is readonly, and a component that
    // assigned `user.value` would pass every unit test here while warning
    // "Write operation failed: computed value is readonly" in the browser.
    user: computed<CurrentUser['user'] | null>(() => identityUser),
    ensureLoaded: (): Promise<CurrentUser> =>
      Promise.resolve({
        user: identityUser,
        // A superadmin belongs to no organization — that is what makes them
        // one — so null is the honest default for the stub's own identity.
        organization: null,
        roles: [...identity.roles],
        abilities,
      }),
  }
}
