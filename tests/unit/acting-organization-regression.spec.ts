/**
 * Acting organization, end to end through the real composables
 * (template-provider-fixes T8 — regression for "a superadmin acting as Quint
 * cannot update a user").
 *
 * The bug was server-side: `PATCH /api/users/{id}` resolved the organization
 * from the CALLER's own row (null for a superadmin) instead of the acting
 * organization. This app never sends an organization id — the selection lives
 * on the server — so the backoffice half of the contract is exactly three
 * facts, pinned here against a fake API that behaves like the real one:
 *
 *   1. picking a client in the topbar PUTs `/admin/acting-organization` with
 *      that id, and the page reloads only AFTER the PUT settled (a reload that
 *      raced the write would come back showing the previous client);
 *   2. the users edit flow then issues `PATCH /users/{id}` with no
 *      organization id of its own, and succeeds;
 *   3. after the reload the switcher shows the stored selection, read from
 *      `GET /admin/organizations` — nothing is held client-side.
 *
 * The composables and `useApi` are REAL; only `$fetch` (the network) and the
 * identity read are faked. `$fetch` is a tiny model of the server's contract:
 * `PATCH /users/{id}` succeeds only while an acting organization is stored.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

interface Call {
  method: string
  path: string
  body?: unknown
}

const QUINT = { id: 2, name: 'Quint' }
const OTHER = { id: 7, name: 'Globex' }

let actingOrganizationId: number | null
let calls: Call[]
let events: string[]

function fakeApi() {
  return vi.fn(async (url: string, options: { method?: string; body?: unknown } = {}) => {
    const path = url.replace('https://api.test/api', '')
    const method = options.method ?? 'GET'
    calls.push({ method, path, body: options.body })

    if (method === 'PUT' && path === '/admin/acting-organization') {
      // A real network hop: the write lands AFTER the caller's next statement,
      // so a caller that does not await it is caught by the ordering assertion.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const { organization_id: id } = options.body as { organization_id: number | null }
      actingOrganizationId = id
      events.push(`put:${id}`)

      return { data: { organization_id: id } }
    }

    if (method === 'GET' && path === '/admin/organizations') {
      return { data: [QUINT, OTHER], acting_organization_id: actingOrganizationId }
    }

    if (method === 'PATCH' && path.startsWith('/users/')) {
      // The real API's rule: an org-scoped write needs an organization, and for
      // a superadmin that is the acting one.
      if (actingOrganizationId === null) {
        throw Object.assign(new Error('403'), { status: 403 })
      }

      return {
        data: { id: Number(path.split('/')[2]), ...(options.body as object) },
      }
    }

    throw new Error(`unexpected request: ${method} ${path}`)
  })
}

async function mountNavBar(onError: (error: unknown) => void = () => undefined) {
  vi.doMock('../../app/composables/useCurrentUser', () => ({
    useCurrentUser: () => ({
      ensureLoaded: vi.fn().mockResolvedValue({
        user: { name: 'Root', photo_url: null, is_superadmin: true },
      }),
      can: (ability: string) => ability === 'clients.viewAny',
    }),
  }))

  const { SidebarProvider } = await import('../../app/components/ui/sidebar')
  const NavBar = (await import('../../app/components/organisms/NavBar.vue')).default
  const wrapper = mount(defineComponent({ render: () => h(SidebarProvider, () => h(NavBar)) }), {
    // NavBar deliberately lets a failed PUT propagate after reloading (its
    // `try/finally` has no catch), which Vue routes to the app error handler.
    global: { mocks: { $t: (key: string) => key }, config: { errorHandler: onError } },
  })
  await flushPromises()

  return wrapper
}

describe('a superadmin acting as a client (backoffice half of the contract)', () => {
  beforeEach(async () => {
    vi.resetModules()
    actingOrganizationId = null
    calls = []
    events = []

    sessionStorage.clear()
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test/api' } }))
    )
    vi.stubGlobal(
      'useRoute',
      vi.fn(() => ({ path: '/', fullPath: '/', params: {}, query: {} }))
    )
    vi.stubGlobal('$fetch', fakeApi())

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn(() => events.push('reload')) },
    })

    const { useAuth } = await import('../../app/composables/useAuth')
    useAuth().setSession('superadmin-token')
  })

  afterEach(() => {
    vi.doUnmock('../../app/composables/useCurrentUser')
    document.body.innerHTML = ''
  })

  it('PUTs the chosen client, then reloads only after the write settled', async () => {
    const wrapper = await mountNavBar()

    await wrapper.get('[data-testid="client-switcher"]').setValue(String(QUINT.id))
    await flushPromises()

    expect(calls).toContainEqual({
      method: 'PUT',
      path: '/admin/acting-organization',
      body: { organization_id: QUINT.id },
    })
    expect(events).toEqual([`put:${QUINT.id}`, 'reload'])
  })

  it('still reloads when the PUT fails, so the page shows what the server recorded', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn(async (url: string, options: { method?: string } = {}) => {
        if (options.method === 'PUT') throw Object.assign(new Error('500'), { status: 500 })

        return { data: [QUINT], acting_organization_id: null }
      })
    )
    const surfaced = vi.fn()
    const wrapper = await mountNavBar(surfaced)

    await wrapper.get('[data-testid="client-switcher"]').setValue(String(QUINT.id))
    await flushPromises()

    expect(window.location.reload).toHaveBeenCalled()
    // The failure is not swallowed: it reaches the app's error handler.
    expect(surfaced).toHaveBeenCalled()
  })

  it('sends "all clients" as an explicit null, not an empty string', async () => {
    actingOrganizationId = QUINT.id
    const wrapper = await mountNavBar()

    await wrapper.get('[data-testid="client-switcher"]').setValue('')
    await flushPromises()

    expect(calls).toContainEqual({
      method: 'PUT',
      path: '/admin/acting-organization',
      body: { organization_id: null },
    })
  })

  it('restores the selection after a reload from the server, holding nothing client-side', async () => {
    const first = await mountNavBar()
    await first.get('[data-testid="client-switcher"]').setValue(String(QUINT.id))
    await flushPromises()
    first.unmount()

    // The "reload": every module instance is gone, only the server remembers.
    vi.resetModules()
    const { useAuth } = await import('../../app/composables/useAuth')
    useAuth().setSession('superadmin-token')
    calls = []

    const second = await mountNavBar()

    expect(calls).toContainEqual({ method: 'GET', path: '/admin/organizations', body: undefined })
    expect((second.get('[data-testid="client-switcher"]').element as HTMLSelectElement).value).toBe(
      String(QUINT.id)
    )
  })

  it('lets the users edit flow PATCH /users/{id} with no organization of its own, once acting', async () => {
    const wrapper = await mountNavBar()
    await wrapper.get('[data-testid="client-switcher"]').setValue(String(QUINT.id))
    await flushPromises()
    calls = []

    const UserForm = (await import('../../app/components/organisms/UserForm.vue')).default
    const form = mount(UserForm, {
      props: {
        user: { id: 5, name: 'Ada', email: 'ada@example.com', role: 'operator' },
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    await form.get('[data-testid="user-form-name"]').setValue('Ada Lovelace')
    await form.get('form').trigger('submit')
    await flushPromises()

    const patch = calls.find((call) => call.method === 'PATCH')

    expect(patch).toEqual({
      method: 'PATCH',
      path: '/users/5',
      body: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'operator' },
    })
    // The selection is server-side: the body carries no organization id.
    expect(JSON.stringify(patch?.body)).not.toContain('organization')
    expect(form.emitted('saved')).toHaveLength(1)
  })

  it('a users edit before any client is selected is refused by the API, and the form says so instead of saving', async () => {
    const UserForm = (await import('../../app/components/organisms/UserForm.vue')).default
    const form = mount(UserForm, {
      props: {
        user: { id: 5, name: 'Ada', email: 'ada@example.com', role: 'operator' },
      },
      global: { mocks: { $t: (key: string) => key } },
    })

    await form.get('form').trigger('submit')
    await flushPromises()

    expect(form.emitted('saved')).toBeUndefined()
  })
})
