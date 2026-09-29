/**
 * useActingClientRequired — the ONE decision "this viewer cannot complete a
 * tenant-scoped write until they pick a client".
 *
 * True only for a viewer who can switch clients (superadmin) with no acting
 * client selected. A regular org user, a superadmin acting as a client, and a
 * failed read all answer false: the server enforces, and a failed read must
 * never lock a working screen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { needsActingClient } from '../../../app/utils/nav-visibility'

const can = vi.fn()
const ensureLoaded = vi.fn()
const fetchClients = vi.fn()

vi.mock('../../../app/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ can, ensureLoaded }),
}))
vi.mock('../../../app/composables/useSuperadmin', () => ({
  useSuperadmin: () => ({ fetchClients }),
}))

const { useActingClientRequired } = await import('../../../app/composables/useActingClientRequired')

async function resolveIt(): Promise<boolean> {
  let state: { value: boolean } | undefined
  mount(
    defineComponent({
      setup() {
        state = useActingClientRequired().actingClientRequired
        return () => h('div')
      },
    })
  )
  await flushPromises()

  return state!.value
}

describe('needsActingClient', () => {
  it('is true only for a client-switcher with nothing selected', () => {
    expect(needsActingClient({ canSwitchClients: true, actingClientId: null })).toBe(true)
    expect(needsActingClient({ canSwitchClients: true, actingClientId: 4 })).toBe(false)
    expect(needsActingClient({ canSwitchClients: false, actingClientId: null })).toBe(false)
  })
})

describe('useActingClientRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureLoaded.mockResolvedValue({})
  })

  it('is true for a superadmin with no acting client', async () => {
    can.mockReturnValue(true)
    fetchClients.mockResolvedValue({ data: [], acting_organization_id: null })

    expect(await resolveIt()).toBe(true)
  })

  it('is false for a superadmin acting as a client', async () => {
    can.mockReturnValue(true)
    fetchClients.mockResolvedValue({ data: [], acting_organization_id: 7 })

    expect(await resolveIt()).toBe(false)
  })

  it('is false for a regular user, without asking for the client list', async () => {
    can.mockReturnValue(false)

    expect(await resolveIt()).toBe(false)
    expect(fetchClients).not.toHaveBeenCalled()
  })

  it('is false when the selection could not be read', async () => {
    can.mockReturnValue(true)
    fetchClients.mockRejectedValue(new Error('boom'))

    expect(await resolveIt()).toBe(false)
  })

  it('is false when identity could not be loaded', async () => {
    ensureLoaded.mockRejectedValue(new Error('boom'))

    expect(await resolveIt()).toBe(false)
  })
})
