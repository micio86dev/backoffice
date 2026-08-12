/**
 * pages/projects/index.vue (Unit 2a, task 17.3 — RED)
 *
 * Container: fetches via useProjects(), passes results down to the
 * presentational ProjectTable, maps failures through
 * resolveResourceErrorState/resourceErrorKey — same house pattern as
 * `pages/participants/index.vue`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const tMock = (key: string) => key

function listResponse() {
  return {
    data: [
      {
        id: '1',
        organization_id: '1',
        framework_version_id: '1',
        slug: 'demo-project',
        name: 'Demo Project',
        assessment_type: 'standard',
        role_code: 'FLL',
        language: 'en',
        status: 'draft',
        pause_every_n_competencies: '3',
        nudge_min_chars: '40',
        exit_redirect_url: null,
        webhook_url: null,
        webhook_events: '[]',
        deadline_at: null,
        goes_live_at: null,
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
        pin_context: null,
        competencies: [],
      },
    ],
  }
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

let useHeadMock: ReturnType<typeof vi.fn>

describe('pages/projects/index.vue', () => {
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

  it('fetches the list on mount and renders the returned projects', async () => {
    const listProjectsMock = vi.fn().mockResolvedValue(listResponse())
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: listProjectsMock, createProject: vi.fn() }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(listProjectsMock).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Demo Project')
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue(listResponse()) }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    mount(IndexPage, { global: { mocks: { $t: tMock } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.projects')
  })

  it('opens the create form when "New project" is clicked', async () => {
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue(listResponse()) }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    await wrapper.get('[data-testid="projects-new"]').trigger('click')

    expect((wrapper.vm as unknown as { editing: unknown }).editing).toBe('new')
  })

  it('opens the edit form with the row id when a table row edit is clicked', async () => {
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue(listResponse()) }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    await wrapper.get('[data-testid="project-row-edit-1"]').trigger('click')

    expect((wrapper.vm as unknown as { editing: unknown }).editing).toBe('1')
  })

  describe('failed list fetch (D4 — a failure must never render as an empty result set)', () => {
    async function mountWithStatus(status: number) {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({ listProjects: vi.fn().mockRejectedValue(httpError(status)) }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()
      return wrapper
    }

    it.each([
      [403, 'errors.states.forbidden'],
      [404, 'errors.states.notFound'],
      [409, 'errors.states.notReady'],
      [500, 'errors.states.error'],
    ])('renders the %i state distinctly, never the table empty state', async (status, key) => {
      const wrapper = await mountWithStatus(status as number)

      expect(wrapper.find('[data-testid="projects-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain(`${key}.title`)
      expect(wrapper.text()).not.toContain('projects.table.empty')
    })
  })
})
