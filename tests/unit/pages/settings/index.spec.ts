/**
 * pages/settings/index.vue (Unit 6, task 24.8 — RED)
 *
 * Five `Tabs`/`TabsTrigger` inside `TabsList` for an admin (Organization
 * profile, API keys, Webhook defaults, Users & roles, LLM credentials); each
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
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

function mockCurrentUser(role: 'admin' | 'operator' | null) {
  vi.doMock('../../../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      ensureLoaded:
        role === null
          ? vi.fn().mockRejectedValue(new Error('unauthenticated'))
          : vi.fn().mockResolvedValue({ roles: [role] }),
      can: (ability: string) => role !== null && (role === 'admin' || !ADMIN_ONLY.has(ability)),
    }),
  }))
}

async function mountSettings() {
  const SettingsPage = (await import('../../../../app/pages/settings/index.vue')).default
  const wrapper = mount(SettingsPage, { global: { mocks: { $t: tMock } } })
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
    useHeadMock = vi.fn()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, locale: ref('en') }))
    )
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
})
