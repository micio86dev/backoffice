/**
 * pages/settings/index.vue (Unit 6, task 24.8 — RED)
 *
 * Seven sections, six of them reachable by an org admin (Organization profile,
 * Branding, API keys, Webhook defaults, Users & roles, LLM credentials) and the
 * seventh — Platform — gated on `is_superadmin` rather than on an ability. Each
 * tab panel mounts lazily (only the active tab, D10).
 *
 * The LLM credentials section is ADMIN-ONLY and is the only gated section on
 * this page. `/llm-credentials` is admin-only server-side
 * (`api/routes/api.php`, `LlmCredentialPolicy`), and the row it manages holds
 * a decryptable vendor API key — a tighter gate than the four ungated
 * sections, never a looser one. Same doctrine as `TemplatePortability`
 * (DESIGN.md §8.2.6): the section does not render at all for other roles,
 * because a control that appears and then 403s teaches the operator that the
 * product is broken rather than that they lack the right.
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
 * `/api/organization` rejecting the way it does for a SUPERADMIN.
 *
 * Not a hypothetical: a superadmin belongs to no organization
 * (`users.organization_id` is null — that is what makes them one), so the
 * singular self-resolving route has no row to return and answers 404 on every
 * page load. `NavBar.vue` already documents this and skips the call entirely.
 */
function mockOrganizationNotFound() {
  vi.doMock('../../../../app/composables/useOrganization', () => ({
    useOrganization: () => ({
      fetchOrganization: vi.fn().mockRejectedValue({ status: 404 }),
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
const ADMIN_ONLY = new Set([
  'organization.update',
  'users.viewAny',
  'llmCredentials.viewAny',
  'apiClients.viewAny',
])

function mockCurrentUser(role: 'admin' | 'operator' | 'superadmin' | null) {
  const isSuperadmin = role === 'superadmin'
  // A superadmin also holds every org ability through `Gate::before`, so the
  // ability answers below treat them as an admin — anything narrower would
  // make the platform-section tests pass for the wrong reason.
  const abilityRole = isSuperadmin ? 'admin' : role

  vi.doMock('../../../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      ensureLoaded:
        role === null
          ? vi.fn().mockRejectedValue(new Error('unauthenticated'))
          : vi.fn().mockResolvedValue({ roles: [abilityRole] }),
      can: (ability: string) =>
        abilityRole !== null && (abilityRole === 'admin' || !ADMIN_ONLY.has(ability)),
      // The page reads `is_superadmin` for the PLATFORM section, which is
      // gated on identity rather than on an ability: its rows belong to no
      // organization, so no org-scoped policy can describe who may edit them.
      // `null` for the unauthenticated case, so that path still fails closed.
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
      // Fails closed until the identity lands — exactly like the real one.
      //
      // `!ADMIN_ONLY.has(ability) || true` was here, which is `true`: the gate
      // collapsed to `loaded.value` and authorized EVERYTHING, in the one mock
      // the two panel tests below depend on. A mock that grants every ability
      // cannot fail on an ability-gating regression, which is the whole thing
      // those tests exist to hold.
      can: (ability: string) =>
        loaded.value && (abilityRole === 'admin' || !ADMIN_ONLY.has(ability)),
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

  // The panel exists, is tested, and until now no route mounted it — an
  // operator could not reach the vault at all. Reachability is the assertion.
  it('gives an admin the credential vault and the branding section', async () => {
    // Counted rather than merely present, because the number is the guard: a
    // section silently dropped from the registry would still leave every
    // `toContain` below passing on the sections that remain.
    mockOrganization()
    mockCurrentUser('admin')

    const wrapper = await mountSettings()

    expect(wrapper.findAll('[role="tab"]')).toHaveLength(6)
    expect(wrapper.text()).toContain('settings.tabs.llmCredentials')
    expect(wrapper.text()).toContain('settings.sectionDescription.llmCredentials')
    // Branding is admin-only for the same reason the vault is: what every
    // candidate of an organization sees is not an operator-level decision.
    expect(wrapper.text()).toContain('settings.tabs.branding')
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
