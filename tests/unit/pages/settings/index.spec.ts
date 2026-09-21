/**
 * pages/settings/index.vue (Unit 6, task 24.8 — RED)
 *
 * Seven sections. FIVE are reachable by an org admin (Organization profile,
 * Branding, API keys, Webhook defaults, Users & roles); TWO are platform-owned
 * and gated on `is_superadmin` rather than on an ability — Platform settings,
 * and since 2026-09-14 LLM credentials. Each tab panel mounts lazily (only the
 * active tab, D10).
 *
 * LLM credentials USED to be the admin-only section described here. Those rows
 * became BEAI's own — one set of keys serving every tenant — so the gate moved
 * from an org-scoped ability to platform identity: `hasRole('admin')` is
 * granted per organization (Spatie teams mode) and cannot describe who may
 * touch a row that belongs to no organization. An admin who managed these
 * yesterday is refused today, by `LlmCredentialPolicy` and by this rail.
 *
 * The doctrine behind hiding rather than disabling is unchanged
 * (`TemplatePortability`, DESIGN.md §8.2.6): a control that appears and then
 * 403s teaches the operator that the product is broken rather than that they
 * lack the right.
 *
 * THREE GATES, and they are not the same question:
 *   - `requires` — an ability the SERVER resolved from its own policies.
 *   - `superadminOnly` — platform identity, for rows no org-scoped policy
 *     can describe.
 *   - `requiresTenant` — meaningless with no client selected (API keys).
 *     Deliberately NOT dropped on a failed organization read; see the test
 *     that pins it, which exists because that distinction was prose only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'
import { ref } from 'vue'

// Pre-warm every panel loaded via `defineAsyncComponent` (D10 code-split).
// `vi.resetModules()` in this file's `beforeEach` clears Vitest's module
// registry before each test; without a first, stable resolution here, a
// dynamic import triggered mid-test can race against that reset and resolve
// a mismatched module instance for a shared dependency (observed: vendored
// `Field.vue` losing its own `fieldVariants` export across the reset).
await Promise.all([
  import('../../../../app/components/organisms/OrganizationProfileForm.vue'),
  import('../../../../app/components/organisms/WebhookDefaultsForm.vue'),
  import('../../../../app/components/organisms/ApiKeysPanel.vue'),
  import('../../../../app/components/organisms/UsersPanel.vue'),
  import('../../../../app/components/organisms/LlmCredentialsPanel.vue'),
  import('../../../../app/components/organisms/BrandingForm.vue'),
  import('../../../../app/components/organisms/PlatformSettingsPanel.vue'),
])

const tMock = (key: string) => key

function organizationResponse() {
  return {
    data: {
      id: 1,
      name: 'Acme',
      slug: 'acme',
      default_webhook_url: null,
      default_webhook_events: null,
      has_default_webhook_secret: false,
      created_at: null,
      updated_at: null,
    },
  }
}

function mockOrganization() {
  vi.doMock('../../../../app/composables/useOrganization', () => ({
    useOrganization: () => ({
      fetchOrganization: vi.fn().mockResolvedValue(organizationResponse()),
      updateOrganization: vi.fn(),
    }),
  }))
}

/**
 * `/api/organization` resolving the way it does for a SUPERADMIN.
 *
 * Not a hypothetical: a superadmin belongs to no organization
 * (`users.organization_id` is null — that is what makes them one), so the
 * singular self-resolving route has no row to return. It answers `200` with
 * `data: null` (api's `OrganizationController::show()`,
 * fix/organization-no-acting-org-404) — never a 404 — on every page load.
 * `NavBar.vue` already documents this and skips the call entirely.
 */
function mockOrganizationNotFound() {
  vi.doMock('../../../../app/composables/useOrganization', () => ({
    useOrganization: () => ({
      fetchOrganization: vi.fn().mockResolvedValue({ data: null }),
      updateOrganization: vi.fn(),
    }),
  }))
}

/**
 * The page filters its sections through `can()`, which reads the ability map
 * the SERVER resolves from its own policies — never a role name in the client,
 * which would be a second copy of the rule that drifts as soon as the policy
 * changes.
 *
 * `role: null` stands for `/auth/me` rejecting outright, and the mock then
 * answers `false` to everything: fail-closed, the same way the real composable
 * does when it has no identity to read.
 */
/**
 * The abilities an org ADMIN holds, and the ones no tenant role ever does.
 *
 * Two sets, because the server answers them from two different places and the
 * mock must not flatten that. `ADMIN_ONLY` comes from org-scoped policies —
 * `hasRole('admin')` in teams mode. `PLATFORM_ONLY` comes from
 * `Gate::define('viewAnyClients' | 'viewPlatformSettings')` and
 * `LlmCredentialPolicy`, all of which answer from `is_superadmin`: an org
 * admin holds none of them no matter how many tenant roles they collect.
 *
 * Before the hotfix this distinction did not exist here, because the page read
 * `user.is_superadmin` directly for those sections and asked the map nothing.
 * Now the map is the only input, so a mock that got this wrong would hide a
 * real regression.
 */
const ADMIN_ONLY = new Set(['organization.update', 'users.viewAny', 'apiClients.viewAny'])

const PLATFORM_ONLY = new Set([
  'llmCredentials.viewAny',
  'platformSettings.viewAny',
  'clients.viewAny',
])

function mockCurrentUser(role: 'admin' | 'operator' | 'superadmin' | null) {
  const isSuperadmin = role === 'superadmin'
  // A superadmin also holds every ORG ability through `Gate::before`, so the
  // tenant answers below treat them as an admin — anything narrower would make
  // the platform-section tests pass for the wrong reason.
  const abilityRole = isSuperadmin ? 'admin' : role

  vi.doMock('../../../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      ensureLoaded:
        role === null
          ? vi.fn().mockRejectedValue(new Error('unauthenticated'))
          : vi.fn().mockResolvedValue({ roles: [abilityRole] }),
      can: (ability: string) => {
        if (abilityRole === null) return false
        if (PLATFORM_ONLY.has(ability)) return isSuperadmin
        return abilityRole === 'admin' || !ADMIN_ONLY.has(ability)
      },
      // `user` is still published because other code reads `name`/`photo_url`
      // from it — but NOT `is_superadmin` for any gate on this page any more.
      user: ref(role === null ? null : { is_superadmin: isSuperadmin }),
    }),
  }))
}

/**
 * Identity arriving the way it actually arrives.
 *
 * `mockCurrentUser` hands back a populated `user` ref and a synchronous `can()`,
 * so under test `visibleSections` is already correct on the FIRST tick. In
 * production it is empty on that tick: `ensureLoaded()` runs in `onMounted`,
 * after `<Tabs>` has finished its setup. A mock that skips the gap deletes the
 * only window in which the open-section bug can happen, which is how a green
 * suite sat on top of a page that opened no panel at all.
 */
function mockCurrentUserAsync(role: 'admin' | 'operator' | 'superadmin') {
  const isSuperadmin = role === 'superadmin'
  // Same mapping as the synchronous sibling: a superadmin holds every org
  // ability through `Gate::before`, so ability-wise they answer as an admin.
  const abilityRole = isSuperadmin ? 'admin' : role
  const user = ref<{ is_superadmin: boolean } | null>(null)
  const loaded = ref(false)

  vi.doMock('../../../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      ensureLoaded: vi.fn().mockImplementation(async () => {
        user.value = { is_superadmin: isSuperadmin }
        loaded.value = true
        return { roles: ['admin'] }
      }),
      // Fails closed until the identity lands — exactly like the real one —
      // and answers PLATFORM_ONLY from `isSuperadmin`, exactly like the
      // synchronous sibling. Reading only `ADMIN_ONLY` here granted an
      // OPERATOR `llmCredentials.viewAny`, because that key is not in the
      // org-scoped set: the two mocks have to model the same two sources or
      // whichever tests use this one silently gate on nothing.
      can: (ability: string) => {
        if (!loaded.value) return false
        if (PLATFORM_ONLY.has(ability)) return isSuperadmin
        return abilityRole === 'admin' || !ADMIN_ONLY.has(ability)
      },
      user,
    }),
  }))
}

/**
 * Every panel's own `onMounted` fetch, resolved rather than rejected.
 *
 * The panels are `defineAsyncComponent` chunks (D10): whichever one is OPEN
 * mounts and immediately fetches. With no access token `apiFetch` throws
 * `Not authenticated`, and because that happens after the test body has
 * finished, it surfaces as an UNHANDLED REJECTION — the suite printed
 * "16 passed" and exited 1 on roughly half of its runs. A gate that goes red
 * on half its runs while every assertion reads green is worse than no gate:
 * the next real regression is indistinguishable from the flake.
 *
 * Stubbing the transport rather than the panels, because
 * `'mounts only the active tab panel'` asserts on the panels' REAL testids and
 * a stubbed panel would make that assertion vacuous.
 */
function mockApiTransport() {
  vi.doMock('../../../../app/composables/useApi', () => ({
    useApi: () => ({ apiFetch: vi.fn().mockResolvedValue({ data: [] }) }),
  }))
}

/**
 * Wrappers still mounted when a test ends.
 *
 * `vi.resetModules()` in `beforeEach` tears down the module registry, and a
 * panel chunk still resolving against the OLD one threw
 * `$setup.fieldVariants is not a function` from `Field.vue` — after the test
 * body, so it landed as an unhandled rejection rather than a failure. Unmount
 * and flush first, so pending work finishes inside the registry that started
 * it.
 */
const mounted: { unmount: () => void }[] = []

async function mountSettings() {
  const SettingsPage = (await import('../../../../app/pages/settings/index.vue')).default
  const wrapper = mount(SettingsPage, { global: { mocks: { $t: tMock } } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

let useHeadMock: ReturnType<typeof vi.fn>

// Waits on the CONDITION, not a fixed timer budget: the panels are
// `defineAsyncComponent` chunks (D10) whose dynamic import takes real
// wall-clock time, and `vi.resetModules()` above makes every test pay it
// again. A fixed ~120 ms budget did not survive a full parallel run.

describe('pages/settings/index.vue', () => {
  beforeEach(() => {
    vi.resetModules()
    mockApiTransport()
    useHeadMock = vi.fn()
    // Nuxt auto-import, absent under Vitest. Needed since these tests began
    // asserting on an OPEN panel: an active panel runs its own `onMounted`
    // fetch, `useApi` finds no access token and calls `navigateTo('/login')`,
    // and the resulting unhandled rejection made the run exit non-zero while
    // every test still reported green.
    vi.stubGlobal('navigateTo', vi.fn())
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, locale: ref('en') }))
    )
  })

  afterEach(async () => {
    while (mounted.length > 0) mounted.pop()!.unmount()
    await flushPromises()
  })

  it('renders every tab an admin may use inside a TabsList', async () => {
    // Was asserted with an operator, back when four of the six sections were
    // ungated in the client and the server refused them only on save. Every
    // section is now gated by the ability the SERVER publishes for it, and an
    // operator may reach none of these four — so the test that says "these
    // tabs render" has to be the one that says who they render for.
    mockOrganization()
    mockCurrentUser('admin')

    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('settings.tabs.organization')
    expect(wrapper.text()).toContain('settings.tabs.apiKeys')
    expect(wrapper.text()).toContain('settings.tabs.webhooks')
    expect(wrapper.text()).toContain('settings.tabs.users')
  })

  it('mounts only the active tab panel (organization profile by default)', async () => {
    mockOrganization()
    mockCurrentUser('admin')

    const SettingsPage = (await import('../../../../app/pages/settings/index.vue')).default
    const wrapper = mount(SettingsPage, { global: { mocks: { $t: tMock } } })
    await waitFor(
      () => wrapper.find('[data-testid="organization-profile-form"]').exists(),
      'the organization profile panel to mount'
    )

    expect(wrapper.find('[data-testid="organization-profile-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="api-keys-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="llm-credentials-new"]').exists()).toBe(false)
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    mockOrganization()
    mockCurrentUser('admin')

    const SettingsPage = (await import('../../../../app/pages/settings/index.vue')).default
    mount(SettingsPage, { global: { mocks: { $t: tMock } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.settings')
  })

  /**
   * The credential vault LEFT this list on 2026-09-14, and that is the change.
   *
   * LLM credentials became BEAI's own platform rows, gated on `is_superadmin`,
   * so an org admin no longer reaches them — the count drops from six sections
   * to five. Branding stays admin-only for the reason it always was.
   *
   * Counted rather than merely present, because the number is the guard: a
   * section silently dropped from the registry would still leave every
   * `toContain` passing on the sections that remain.
   */
  /**
   * The selected section carries a NON-COLOUR cue.
   *
   * `AGENTS.md`: "Never convey meaning by colour alone. Every state needs a
   * non-colour cue." Everything else marking selection on this rail is colour
   * — `bg-primary/10`, a primary label, a primary icon — so a reader who
   * cannot distinguish those two had nothing.
   *
   * Asserted on the CLASS rather than on rendered pixels because that is what
   * a unit test can see, and asserted at all because the alternative is a
   * design rule that lives only in prose. `role="tab"` + `aria-selected`
   * already serve assistive tech; this is for the sighted reader.
   *
   * Weight, not a border: DESIGN.md §8.2.1 rules side stripes out explicitly.
   */
  it('marks the selected section with a non-colour cue, not colour alone', async () => {
    mockOrganization()
    mockCurrentUser('admin')

    const wrapper = await mountSettings()
    const trigger = wrapper.find('[role="tab"]')

    expect(trigger.exists()).toBe(true)
    expect(trigger.classes().join(' ')).toContain('data-active:[&_[data-part=label]]:font-semibold')
  })

  it('gives an admin the branding section but NOT the credential vault', async () => {
    mockOrganization()
    mockCurrentUser('admin')

    const wrapper = await mountSettings()

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(5)
    expect(wrapper.text()).not.toContain('settings.tabs.llmCredentials')
    // Branding is admin-only for the reason the vault used to be: what every
    // candidate of an organization sees is not an operator-level decision.
    expect(wrapper.text()).toContain('settings.tabs.branding')
  })

  /**
   * THE HOTFIX, stated as a test: the page reads the ANSWER, not the input.
   *
   * A viewer who IS a superadmin but whose published ability map says no must
   * not see these sections. That combination is impossible today — both gates
   * answer from `is_superadmin` server-side — and that is exactly why it is
   * worth pinning: it is the only shape that distinguishes "reads the ability"
   * from "re-derives the identity", and an identity gate passes every other
   * case identically.
   *
   * It stops being hypothetical the moment `Gate::define('viewPlatformSettings')`
   * or `LlmCredentialPolicy` grows a second condition — a maintenance lock, a
   * platform permission, a disabled account. Under the old gate the rail kept
   * rendering both sections and every action inside 403'd, with nothing red.
   */
  it('hides both platform sections from a superadmin the server has refused', async () => {
    mockOrganizationNotFound()

    vi.doMock('../../../../app/composables/useCurrentUser', () => ({
      useCurrentUser: () => ({
        ensureLoaded: vi.fn().mockResolvedValue({ roles: [] }),
        // Superadmin identity, and the server says no to both platform
        // abilities. `clients.viewAny` stays TRUE so the page still reads the
        // 404 as structural — otherwise this would pass for the wrong reason,
        // by falling into the error branch instead of the refusal.
        can: (ability: string) => ability === 'clients.viewAny',
        user: ref({ is_superadmin: true }),
      }),
    }))

    const wrapper = await mountSettings()

    expect(wrapper.text()).not.toContain('settings.tabs.llmCredentials')
    expect(wrapper.text()).not.toContain('settings.tabs.platform')
  })

  /**
   * The two platform sections name DIFFERENT abilities, and this is the only
   * test that can tell.
   *
   * Every other fixture answers both from one `isSuperadmin` flag, so swapping
   * `platformSettings.viewAny` for `llmCredentials.viewAny` on the Platform
   * section passes all 25 of them: the two are always equal, so the wrong one
   * is indistinguishable from the right one. Granting exactly one is what
   * separates them.
   *
   * Not hypothetical arithmetic either — they are resolved by two different
   * server gates (`viewPlatformSettings` and `LlmCredentialPolicy::viewAny`),
   * so the day either grows a condition the other does not, they diverge.
   */
  it('names a DIFFERENT ability per platform section', async () => {
    mockOrganizationNotFound()

    vi.doMock('../../../../app/composables/useCurrentUser', () => ({
      useCurrentUser: () => ({
        ensureLoaded: vi.fn().mockResolvedValue({ roles: [] }),
        // Platform settings YES, credential vault NO — and `clients.viewAny`
        // true so the 404 still reads as structural rather than as an error.
        can: (ability: string) =>
          ability === 'platformSettings.viewAny' || ability === 'clients.viewAny',
        user: ref({ is_superadmin: true }),
      }),
    }))

    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('settings.tabs.platform')
    expect(wrapper.text()).not.toContain('settings.tabs.llmCredentials')
  })

  it("and the other way round, so neither section can borrow the other's gate", async () => {
    mockOrganizationNotFound()

    vi.doMock('../../../../app/composables/useCurrentUser', () => ({
      useCurrentUser: () => ({
        ensureLoaded: vi.fn().mockResolvedValue({ roles: [] }),
        can: (ability: string) =>
          ability === 'llmCredentials.viewAny' || ability === 'clients.viewAny',
        user: ref({ is_superadmin: true }),
      }),
    }))

    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('settings.tabs.llmCredentials')
    expect(wrapper.text()).not.toContain('settings.tabs.platform')
  })

  /**
   * The 404 branch reads `clients.viewAny`, not the identity.
   *
   * A viewer who IS a superadmin but whom the server has refused the estate
   * must get the ERROR banner, not the silent "this is normal" path — because
   * for them it is not normal. The identity version of this line answered
   * "structural" for anyone holding the flag, whatever the server said.
   */
  it('treats a 404 as a real failure when the server refuses the estate', async () => {
    vi.doMock('../../../../app/composables/useCurrentUser', () => ({
      useCurrentUser: () => ({
        ensureLoaded: vi.fn().mockResolvedValue({ roles: ['admin'] }),
        // Every ability EXCEPT the estate one.
        can: (ability: string) => ability !== 'clients.viewAny',
        user: ref({ is_superadmin: true }),
      }),
    }))
    mockOrganizationNotFound()

    const wrapper = await mountSettings()

    expect(wrapper.find('[data-testid="settings-error"]').exists()).toBe(true)
  })

  it('gives the credential vault to a superadmin, with or without a client selected', async () => {
    // Unlike API keys, these rows mean the same thing in the all-clients view —
    // they belong to no client — so the section is reachable in both states.
    mockCurrentUser('superadmin')
    mockOrganizationNotFound()

    expect((await mountSettings()).text()).toContain('settings.tabs.llmCredentials')

    mockCurrentUser('superadmin')
    mockOrganization()

    expect((await mountSettings()).text()).toContain('settings.tabs.llmCredentials')
  })

  it('hides branding from a non-admin', async () => {
    mockOrganization()
    mockCurrentUser('operator')

    const wrapper = await mountSettings()

    // The rail hiding it is a COURTESY — the API enforces the same boundary and
    // is the actual control. Asserted here so the courtesy does not quietly
    // disappear and leave an operator staring at a section that 403s.
    expect(wrapper.text()).not.toContain('settings.tabs.branding')
  })

  it('does not render the credential vault for a non-admin at all', async () => {
    mockOrganization()
    mockCurrentUser('operator')

    const wrapper = await mountSettings()

    // Only the organization profile survives: every other section on this page
    // writes something an operator may not write, or reads something they may
    // not read. The whole PAGE is admin-only at the route guard too — this
    // mounts the component directly, so it asserts the second layer.
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('settings.tabs.llmCredentials')
    expect(wrapper.text()).not.toContain('settings.tabs.apiKeys')
  })

  // A transient `/auth/me` failure must not hand anyone a section. EVERY
  // section names an ability, so an identity that failed to load leaves the
  // page with nothing on it rather than with whatever happened to be ungated.
  it('fails closed to NOTHING when the identity fetch rejects', async () => {
    mockOrganization()
    mockCurrentUser(null)

    const wrapper = await mountSettings()

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('settings.tabs.llmCredentials')
  })

  /**
   * The PLATFORM section.
   *
   * Gated on identity, not on an ability, and the distinction is the point:
   * these rows belong to BEAI rather than to any organization, so no org-scoped
   * policy can describe who may edit them. An org ADMIN — who holds every
   * tenant ability there is — must not see it.
   */
  it('shows the platform section to a superadmin', async () => {
    mockCurrentUser('superadmin')

    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('settings.tabs.platform')
  })

  it('hides the platform section from an org admin, who holds every tenant ability', async () => {
    mockCurrentUser('admin')

    const wrapper = await mountSettings()

    expect(wrapper.text()).not.toContain('settings.tabs.platform')
  })

  it('hides the platform section when the identity fetch fails', async () => {
    // Fails closed like every other section: the one moment the page knows
    // least about who is looking at it is the moment to show least.
    mockCurrentUser(null)

    const wrapper = await mountSettings()

    expect(wrapper.text()).not.toContain('settings.tabs.platform')
  })
  /**
   * The organization is ONE section's data, not the page's.
   *
   * A superadmin with no client selected gets a 404 from
   * `/api/organization`, and the page used to answer that by replacing the
   * whole `Tabs` block with a "not found" alert — hiding Users, LLM
   * credentials and, worst of all, the PLATFORM section, which is the one
   * built for exactly this viewer and needs no organization at all. Observed
   * in production: the superadmin opened Settings and was told the resource
   * did not exist.
   *
   * Three of the seven sections take the organization as a prop; the other
   * four fetch their own data. Only the first three may be affected by its
   * absence.
   */
  it('keeps the sections that need no organization when the organization 404s', async () => {
    mockCurrentUser('superadmin')
    mockOrganizationNotFound()

    const wrapper = await mountSettings()

    // The one section that exists FOR this viewer.
    expect(wrapper.text()).toContain('settings.tabs.platform')
    // And the tenant sections that fetch their own data.
    expect(wrapper.text()).toContain('settings.tabs.users')
    expect(wrapper.text()).toContain('settings.tabs.llmCredentials')
  })

  /**
   * API keys are ONE TENANT'S, so the all-clients view has none to show.
   *
   * Fetching its own data is not the same as being meaningful without a
   * client selected, and this section was on the wrong side of that line. An
   * M2M key authenticates FOR an organization — `api_clients.organization_id`
   * is NOT NULL — so with no client selected the list has nothing to list and
   * the create has no owner to stamp: the endpoint answered an empty list and
   * a 500 on the insert, and the rail offered both anyway.
   *
   * The API refuses on its own now (`ApiClientController`), which is where the
   * control belongs. This is the affordance half: do not offer a superadmin a
   * section whose every action is a refusal.
   */
  it('hides the API keys section when no client is selected', async () => {
    mockCurrentUser('superadmin')
    mockOrganizationNotFound()

    const wrapper = await mountSettings()

    expect(wrapper.text()).not.toContain('settings.tabs.apiKeys')
  })

  /**
   * A FAILED organization read must NOT take the API keys section away.
   *
   * The `requiresTenant` guard reads `noOrganizationInContext` alone, and that
   * omission is the deliberate half: a 500 says nothing about whether a client
   * is selected, so hiding this section on a transient failure would take the
   * keys away from an ordinary admin whose unrelated request merely broke.
   *
   * Written because the claim existed only as a comment. Widening the guard to
   * `(loadError.value !== null || noOrganizationInContext.value)` — the exact
   * behaviour that comment calls wrong — left all 23 other specs green, so the
   * regression would have shipped unnoticed. This is the case that dies.
   */
  it('keeps the API keys section when the organization read merely FAILS', async () => {
    mockCurrentUser('admin')
    vi.doMock('../../../../app/composables/useOrganization', () => ({
      useOrganization: () => ({
        fetchOrganization: vi.fn().mockRejectedValue({ status: 500 }),
        updateOrganization: vi.fn(),
      }),
    }))

    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('settings.tabs.apiKeys')
  })

  it('shows the API keys section to a superadmin acting as a client', async () => {
    // `TenantContext` scopes them to that organization and `/api/organization`
    // answers 200 — the ordinary org surface, keys included.
    mockCurrentUser('superadmin')
    mockOrganization()

    const wrapper = await mountSettings()

    expect(wrapper.text()).toContain('settings.tabs.apiKeys')
  })

  /**
   * The Users section follows the SCOPE (platform-user-management D6).
   *
   * One click of the client switcher moves this section between an
   * organization's people and BEAI's own. The signal is the page's existing
   * `noOrganizationInContext` — set only when `/api/organization` 404s FOR A
   * SUPERADMIN — so it is derived from a response the page already makes and
   * fails closed on every other outcome.
   */
  async function openUsersTab(wrapper: Awaited<ReturnType<typeof mountSettings>>) {
    const tab = wrapper
      .findAll('[role="tab"]')
      .find((candidate) => candidate.text().includes('settings.tabs.users'))

    expect(tab, 'the users tab is not on this page').toBeTruthy()
    // reka-ui's TabsTrigger activates on a real pointer sequence, not on a
    // bare synthetic click — the same discipline ConfirmDialog's helper
    // already documents for its own reka-ui buttons.
    tab!.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    tab!.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    tab!.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    await waitFor(() => wrapper.find('[data-testid="users-scope"]').exists())

    return wrapper.find('[data-testid="users-scope"]')
  }

  it('manages BEAI’s own people for a superadmin with no client selected', async () => {
    mockCurrentUser('superadmin')
    mockOrganizationNotFound()

    const scope = await openUsersTab(await mountSettings())

    expect(scope.text()).toContain('users.scope.platform')
  })

  it('manages the organization’s people when a client IS selected', async () => {
    // A superadmin acting as a client: TenantContext scopes them to that
    // organization and `/api/organization` answers 200, so this is the
    // ordinary organization surface — the whole point of the scope switch.
    mockCurrentUser('superadmin')
    mockOrganization()

    const scope = await openUsersTab(await mountSettings())

    expect(scope.text()).toContain('users.scope.organization')
  })

  it('never shows the platform variant to an org admin', async () => {
    mockCurrentUser('admin')
    mockOrganization()

    const scope = await openUsersTab(await mountSettings())

    expect(scope.text()).toContain('users.scope.organization')
  })

  it('FAILS CLOSED to the organization variant when the organization read errors', async () => {
    // A 500 is not "no client selected". Treating any failed read as the
    // platform scope would show BEAI's own people to someone whose request
    // merely broke.
    mockCurrentUser('superadmin')
    vi.doMock('../../../../app/composables/useOrganization', () => ({
      useOrganization: () => ({
        fetchOrganization: vi.fn().mockRejectedValue({ status: 500 }),
        updateOrganization: vi.fn(),
      }),
    }))

    const scope = await openUsersTab(await mountSettings())

    expect(scope.text()).toContain('users.scope.organization')
  })

  it('does not call a superadmin having no organization an error', async () => {
    // A superadmin's `users.organization_id` is null — that is what makes them
    // one — so `/api/organization` 404s on every load. A destructive "this
    // resource could not be found" banner on every visit reports a failure
    // that did not happen. `NavBar.vue` already guards this exact request for
    // this exact viewer.
    mockCurrentUserAsync('superadmin')
    mockOrganizationNotFound()

    const wrapper = await mountSettings()
    await waitFor(() => wrapper.findAll('[role="tabpanel"][data-state="active"]').length > 0)

    expect(wrapper.find('[data-testid="settings-error"]').exists()).toBe(false)
  })

  it('still reports a real failure to an operator who has an organization', async () => {
    // The counterpart, so the silence above cannot spread: scoping the error
    // must not make it silent for someone whose organization genuinely failed
    // to load and who is left without their profile section.
    mockCurrentUserAsync('admin')
    mockOrganizationNotFound()

    const wrapper = await mountSettings()
    await waitFor(() => wrapper.find('[data-testid="settings-error"]').exists())

    expect(wrapper.find('[data-testid="settings-error"]').exists()).toBe(true)
  })
  /**
   * The panel, not the rail label.
   *
   * Every other assertion in this file reads `wrapper.text()`, which is
   * satisfied by the TRIGGER in the rail — rendered by `v-for` over
   * `visibleSections` regardless of which section is open. So a page showing a
   * full rail beside an EMPTY column passed all of them.
   *
   * The panel ELEMENT always renders — `reka-ui/dist/Tabs/TabsContent.js:48-64`
   * sets `present: forceMount || isSelected` and only gates the SLOT on it, so
   * every visible section contributes a `[role="tabpanel"]` and the inactive
   * ones carry `hidden` plus `data-state="inactive"`. The active one is what
   * the operator can actually read, so that is what these assert on.
   */
  it('opens a panel that survives the organization 404, not just its rail entry', async () => {
    mockCurrentUserAsync('superadmin')
    mockOrganizationNotFound()

    const wrapper = await mountSettings()
    await waitFor(() => wrapper.findAll('[role="tabpanel"][data-state="active"]').length > 0)

    const open = wrapper.findAll('[role="tabpanel"][data-state="active"]')

    // Exactly one section is open — not zero, which is the rail-beside-an-
    // empty-column state this test exists to catch.
    expect(open).toHaveLength(1)
    // And it is not the section that was dropped.
    expect(open[0]!.text()).not.toContain('settings.tabs.organization')
  })

  it('opens the organization panel when the organization does load', async () => {
    // The counterpart, so the assertion above cannot pass by opening nothing
    // useful: with the organization present it must be first, as before.
    mockCurrentUserAsync('admin')
    mockOrganization()

    const wrapper = await mountSettings()
    await waitFor(() => wrapper.findAll('[role="tabpanel"][data-state="active"]').length > 0)

    const open = wrapper.findAll('[role="tabpanel"][data-state="active"]')

    expect(open).toHaveLength(1)
    expect(open[0]!.text()).toContain('settings.tabs.organization')
  })
  it('opens a panel for an operator, and none of the admin-only ones', async () => {
    // Exercises the async mock's ABILITY gate, which the two tests above
    // cannot: both of their roles map to `admin`, so `ADMIN_ONLY` never
    // discriminates for them and a tautological `can()` would look identical
    // to a correct one. An operator is the only caller that tells them apart.
    mockCurrentUserAsync('operator')
    mockOrganization()

    const wrapper = await mountSettings()
    await waitFor(() => wrapper.findAll('[role="tabpanel"][data-state="active"]').length > 0)

    expect(wrapper.text()).not.toContain('settings.tabs.llmCredentials')
    expect(wrapper.text()).not.toContain('settings.tabs.users')
    expect(wrapper.findAll('[role="tabpanel"][data-state="active"]')).toHaveLength(1)
  })
})
