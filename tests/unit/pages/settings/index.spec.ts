/**
 * pages/settings/index.vue (Unit 6, task 24.8 — RED)
 *
 * Four `Tabs`/`TabsTrigger` inside `TabsList` (Organization profile, API
 * keys, Webhook defaults, Users & roles); each tab panel mounts lazily
 * (only the active tab, D10).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

let useHeadMock: ReturnType<typeof vi.fn>

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
}

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

  it('renders four tabs inside a TabsList', async () => {
    vi.doMock('../../../../app/composables/useOrganization', () => ({
      useOrganization: () => ({
        fetchOrganization: vi.fn().mockResolvedValue(organizationResponse()),
        updateOrganization: vi.fn(),
      }),
    }))

    const SettingsPage = (await import('../../../../app/pages/settings/index.vue')).default
    const wrapper = mount(SettingsPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    const triggers = wrapper.findAll('[role="tab"]')
    expect(triggers).toHaveLength(4)
    expect(wrapper.text()).toContain('settings.tabs.organization')
    expect(wrapper.text()).toContain('settings.tabs.apiKeys')
    expect(wrapper.text()).toContain('settings.tabs.webhooks')
    expect(wrapper.text()).toContain('settings.tabs.users')
  })

  it('mounts only the active tab panel (organization profile by default)', async () => {
    vi.doMock('../../../../app/composables/useOrganization', () => ({
      useOrganization: () => ({
        fetchOrganization: vi.fn().mockResolvedValue(organizationResponse()),
        updateOrganization: vi.fn(),
      }),
    }))

    const SettingsPage = (await import('../../../../app/pages/settings/index.vue')).default
    const wrapper = mount(SettingsPage, { global: { mocks: { $t: tMock } } })
    await settle()

    expect(wrapper.find('[data-testid="organization-profile-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="api-keys-new"]').exists()).toBe(false)
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    vi.doMock('../../../../app/composables/useOrganization', () => ({
      useOrganization: () => ({
        fetchOrganization: vi.fn().mockResolvedValue(organizationResponse()),
        updateOrganization: vi.fn(),
      }),
    }))

    const SettingsPage = (await import('../../../../app/pages/settings/index.vue')).default
    mount(SettingsPage, { global: { mocks: { $t: tMock } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.settings')
  })
})
