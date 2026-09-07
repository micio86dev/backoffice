/**
 * ClientTable.vue (superadmin-clients-console, Phase 10 — RED).
 *
 * Presentational-ish: rows come in as a prop, but the row action calls
 * useSuperadmin().setActingClient() directly and reloads — byte-for-byte the
 * shape of NavBar.vue's onSwitchClient (design D6) — so this composable is
 * mocked here, the same pattern OrganizationProfileForm.spec.ts and friends
 * use for their own composables.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientTable from '../../../../app/components/organisms/ClientTable.vue'
import type { ClientOverviewRow } from '../../../../app/composables/useSuperadmin'

// Interpolates, because the labels under test CARRY a value. A `$t` that
// returns the bare key cannot tell "Act as {name}" from "Act as", so an
// assertion about the client's name in the button would be asserting on
// something the mock had already thrown away.
const tMock = (key: string, params?: Record<string, unknown>) =>
  params === undefined ? key : `${key}:${Object.values(params).join(',')}`

const setActingClientMock = vi.fn()

vi.mock('@/composables/useSuperadmin', () => ({
  useSuperadmin: () => ({ setActingClient: setActingClientMock }),
}))

function row(overrides: Partial<ClientOverviewRow> = {}): ClientOverviewRow {
  return {
    id: 2,
    name: 'Acme',
    created_at: '2026-01-01T00:00:00Z',
    projects: 3,
    candidates: 10,
    completed: 7,
    errored: 1,
    last_activity_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function mountTable(rows: ClientOverviewRow[], actingOrganizationId: number | null = null) {
  return mount(ClientTable, {
    props: { clients: rows, actingOrganizationId },
    global: { mocks: { $t: tMock } },
  })
}

describe('ClientTable', () => {
  beforeEach(() => {
    setActingClientMock.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: vi.fn() },
    })
  })

  it('renders every column for each row', () => {
    // Asserted PER CELL, with values that cannot be found in a neighbour.
    //
    // This test used to read the whole row's text with `toContain`, on a
    // fixture of 3 / 10 / 7 / 1 — so `errored: 1` was satisfied by the `1`
    // inside `candidates: 10`, and that binding could be deleted outright with
    // the suite staying green. Both date columns had no assertion at all.
    // Proven: replacing `errored` and both dates with a literal left all seven
    // tests passing.
    const wrapper = mountTable([
      row({
        id: 2,
        name: 'Acme',
        created_at: '2026-01-01T00:00:00Z',
        projects: 41,
        candidates: 52,
        completed: 63,
        errored: 74,
        last_activity_at: '2026-03-09T00:00:00Z',
      }),
    ])

    const cell = (part: string) => wrapper.get(`[data-testid="client-${part}-2"]`).text()

    expect(wrapper.get('[data-testid="client-row-2"]').text()).toContain('Acme')
    expect(cell('projects')).toContain('41')
    expect(cell('candidates')).toContain('52')
    expect(cell('completed')).toContain('63')
    expect(cell('errored')).toContain('74')
    // The dates go through FormattedDate; assert the YEAR rather than a full
    // rendering, so this pins that the field is WIRED without re-testing Intl.
    expect(cell('since')).toContain('2026')
    expect(cell('last-activity')).toContain('2026')
  })

  it('renders TableEmpty when there are zero clients', () => {
    const wrapper = mountTable([])

    expect(wrapper.find('[data-testid="clients-table-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="client-row-2"]').exists()).toBe(false)
  })

  it('calls setActingClient(id) then reloads when "Act as" is clicked', async () => {
    const wrapper = mountTable([row()])

    await wrapper.get('[data-testid="client-act-as-2"]').trigger('click')

    expect(setActingClientMock).toHaveBeenCalledWith(2)
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('still reloads when setActingClient rejects (the finally block runs on failure too)', async () => {
    setActingClientMock.mockReset().mockRejectedValue(new Error('network error'))
    const wrapper = mountTable([row()])
    const vm = wrapper.vm as unknown as { onActAsClient: (id: number) => Promise<void> }

    // Awaited and caught directly rather than through `trigger('click')`:
    // Vue's DOM dispatch attaches its own `.catch` only after the native
    // event finishes, which is not a race a synchronous test assertion can
    // rely on. This calls the exact same production function.
    await expect(vm.onActAsClient(2)).rejects.toThrow('network error')

    expect(setActingClientMock).toHaveBeenCalledWith(2)
    expect(window.location.reload).toHaveBeenCalled()
  })

  it('disables the act-as button on the current organization’s own row', () => {
    const wrapper = mountTable([row({ id: 2 }), row({ id: 7, name: 'Globex' })], 2)

    expect(wrapper.get('[data-testid="client-act-as-2"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="client-act-as-7"]').attributes('disabled')).toBeUndefined()
  })
  it('names each row action after its client, not the same label on every row', () => {
    // Out of context — which is how a screen reader's element list presents
    // them — identical names identify nothing. `nav.profileLabel` established
    // the interpolated-label pattern in this app; this table had opted out.
    const wrapper = mountTable([row({ id: 2, name: 'Acme' }), row({ id: 3, name: 'Globex' })])

    expect(wrapper.get('[data-testid="client-act-as-2"]').text()).toContain('Acme')
    expect(wrapper.get('[data-testid="client-act-as-3"]').text()).toContain('Globex')
  })

  it('gives the row being acted as a reason, not just grey', () => {
    // "You are already acting as this client" was conveyed by the disabled
    // styling alone. `ProjectTable.vue` wires aria-describedby to a per-row
    // reason for its disabled action; this copies that shape.
    const wrapper = mountTable([row({ id: 2, name: 'Acme' }), row({ id: 3, name: 'Globex' })], 2)
    const reasonId = wrapper.get('[data-testid="client-act-as-2"]').attributes('aria-describedby')

    expect(reasonId).toBe('client-act-as-disabled-reason-2')
    expect(wrapper.get('[data-testid="client-act-as-current-2"]').text()).toContain('Acme')
    // The enabled row must NOT point at a reason element that does not exist.
    expect(
      wrapper.get('[data-testid="client-act-as-3"]').attributes('aria-describedby')
    ).toBeUndefined()
    expect(wrapper.find('[data-testid="client-act-as-current-3"]').exists()).toBe(false)
  })
})
