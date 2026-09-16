/**
 * pages/catalogue/index.vue (framework-catalogue-authoring PR10, DESIGN.md
 * §8.2.10): the revision header (state, label, Publish behind
 * `ConfirmDialog`) and the vertical section rail (Competencies · Roles ·
 * Indicators · Default questions — never a tab strip, per §8.2.1's ruling).
 *
 * `CatalogueDefaultQuestionsPanel` is stubbed here — its own network wiring
 * is `CatalogueDefaultQuestionsPanel.spec.ts`'s job; this file owns the
 * revision header and the rail shape only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { confirmDialog } from '../../support/confirm'
import { realI18n } from '../../support/i18n'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

vi.stubGlobal('useI18n', () => realI18n())

const fetchCurrentRevision = vi.fn()
const publishRevision = vi.fn()

vi.mock('../../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({
    fetchCurrentRevision,
    publishRevision,
    listCompetencies: vi.fn(),
    listRoles: vi.fn(),
    listBarsIndicators: vi.fn(),
  }),
}))

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    state: 'draft',
    is_baseline: false,
    label: 'September revision',
    published_at: null,
    parent_revision_id: null,
    ...overrides,
  }
}

// PR10b's three sections are stubbed here too — their own CRUD is each
// panel's own spec file's job (`CatalogueCompetenciesPanel.spec.ts`,
// `CatalogueRolesPanel.spec.ts`, `CatalogueIndicatorsPanel.spec.ts`); this
// file owns the revision header, the rail shape, and the publish outcome
// only. Harmless for every test ABOVE this PR10b addition too: the rail's
// lazy panel mounting (reka-ui Tabs) never renders a non-active section's
// panel, and every existing test here leaves `defaultQuestions` selected.
const PR10B_STUBS = {
  CatalogueCompetenciesPanel: { template: '<div data-testid="stub-competencies" />' },
  CatalogueRolesPanel: { template: '<div data-testid="stub-roles" />' },
  CatalogueIndicatorsPanel: { template: '<div data-testid="stub-indicators" />' },
}

async function mountPage() {
  const { default: CataloguePage } = await import('../../../../app/pages/catalogue/index.vue')

  const wrapper = mount(CataloguePage, {
    global: {
      mocks: { $t: tMock },
      stubs: { CatalogueDefaultQuestionsPanel: true, ...PR10B_STUBS },
    },
    attachTo: document.body,
  })

  await flushPromises()

  return wrapper
}

describe('pages/catalogue/index.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('useI18n', () => realI18n())
    document.body.innerHTML = ''
  })

  it('renders the section rail as a vertical tablist, never a horizontal strip', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: revision() })
    const wrapper = await mountPage()

    const tablist = wrapper.get('[role="tablist"]')

    expect(tablist.attributes('data-orientation')).toBe('vertical')

    const tabs = wrapper.findAll('[role="tab"]')

    expect(tabs).toHaveLength(4)
  })

  it('shows the revision state and label', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'draft', label: 'Draft A' }) })
    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="catalogue-revision-state"]').text()).toContain(
      'catalogue.revision.draft'
    )
    expect(wrapper.get('[data-testid="catalogue-revision-label"]').text()).toContain('Draft A')
  })

  it('shows Publish only while the revision is a draft', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'published' }) })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="catalogue-publish"]').exists()).toBe(false)
  })

  it('gates Publish behind ConfirmDialog and calls publishRevision only once confirmed', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'draft' }) })
    publishRevision.mockResolvedValue({ data: revision({ state: 'published' }) })

    const wrapper = await mountPage()

    await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')

    expect(publishRevision).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()

    await confirmDialog('confirm')

    expect(publishRevision).toHaveBeenCalledOnce()
  })

  it('shows a publish failure inline and leaves the revision a draft', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'draft' }) })
    publishRevision.mockRejectedValue(
      Object.assign(new Error('422'), { status: 422, data: { violations: [] } })
    )

    const wrapper = await mountPage()

    await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
    await confirmDialog('confirm')

    expect(wrapper.get('[data-testid="catalogue-publish-error"]').text()).toContain(
      'catalogue.revision.publishError'
    )
    // Still a draft — the sweep refused, nothing was published.
    expect(wrapper.get('[data-testid="catalogue-revision-state"]').text()).toContain(
      'catalogue.revision.draft'
    )
  })

  it('renders a 409 publish failure as waiting, not as an error', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'draft' }) })
    publishRevision.mockRejectedValue(Object.assign(new Error('409'), { status: 409 }))

    const wrapper = await mountPage()

    await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
    await confirmDialog('confirm')

    const banner = wrapper
      .findAllComponents({ name: 'FormMessage' })
      .find((component) => component.attributes('data-testid') === 'catalogue-publish-error')

    expect(banner?.props('kind')).toBe('waiting')
    expect(banner?.text()).toContain('errors.states.notReady.message')
  })

  it('does not claim "no revision" while the first load is still in flight', async () => {
    let resolveFetch!: (value: { data: unknown }) => void

    fetchCurrentRevision.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      })
    )

    const { default: CataloguePage } = await import('../../../../app/pages/catalogue/index.vue')

    const wrapper = mount(CataloguePage, {
      global: { mocks: { $t: tMock }, stubs: { CatalogueDefaultQuestionsPanel: true } },
      attachTo: document.body,
    })
    await flushPromises()

    // Neither state is known yet — the fetch has not settled.
    expect(wrapper.find('[data-testid="catalogue-revision-none"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="catalogue-revision-header"]').exists()).toBe(false)

    resolveFetch({ data: revision() })
    await flushPromises()

    expect(wrapper.find('[data-testid="catalogue-revision-header"]').exists()).toBe(true)
  })

  it('reports a failed load through the shared D4 state mapper', async () => {
    fetchCurrentRevision.mockRejectedValue(Object.assign(new Error('403'), { status: 403 }))
    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="catalogue-error"]').text()).toContain(
      'errors.states.forbidden.message'
    )
  })

  it('refreshes the revision header when the default-questions panel signals a write', async () => {
    // A default-question write (create/edit/remove/reorder) can auto-open a
    // draft the same way the other three rail sections already do
    // (CatalogueCompetenciesPanel/CatalogueRolesPanel/CatalogueIndicatorsPanel
    // all wire `@refresh-revision="load"`) — this panel was the one section
    // left out (gga review finding).
    fetchCurrentRevision.mockResolvedValue({ data: revision() })

    const { default: CataloguePage } = await import('../../../../app/pages/catalogue/index.vue')

    const wrapper = mount(CataloguePage, {
      global: {
        mocks: { $t: tMock },
        stubs: {
          CatalogueDefaultQuestionsPanel: {
            template:
              '<button data-testid="stub-default-questions-refresh" @click="$emit(\'refresh-revision\')" />',
          },
          ...PR10B_STUBS,
        },
      },
      attachTo: document.body,
    })
    await flushPromises()

    expect(fetchCurrentRevision).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-testid="stub-default-questions-refresh"]').trigger('click')
    await flushPromises()

    expect(fetchCurrentRevision).toHaveBeenCalledTimes(2)
  })

  it('shows the "no open revision" state when none has ever been opened', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: null })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="catalogue-revision-none"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="catalogue-publish"]').exists()).toBe(false)
  })

  it('renders a 409 LOAD failure without the destructive style, unlike a 403', async () => {
    fetchCurrentRevision.mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))
    const notReady = await mountPage()

    expect(notReady.get('[data-testid="catalogue-error"]').classes().join(' ')).not.toContain(
      'destructive'
    )

    fetchCurrentRevision.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 }))
    const forbidden = await mountPage()

    expect(forbidden.get('[data-testid="catalogue-error"]').classes().join(' ')).toContain(
      'destructive'
    )
  })

  // framework-catalogue-authoring PR10b, task 39b.5: the three placeholder
  // rail sections above now mount the real panels, and a publish 422
  // renders the full violations list instead of the generic banner.
  describe('PR10b — real panels and the publish violations list', () => {
    it('mounts the real Competencies/Roles/Indicators panels, not the old placeholder', async () => {
      fetchCurrentRevision.mockResolvedValue({ data: revision() })
      const wrapper = await mountPage()

      await wrapper.setData({ activeSection: 'competencies' })
      await flushPromises()
      expect(wrapper.find('[data-testid="stub-competencies"]').exists()).toBe(true)
      expect(
        wrapper.find('[data-testid="catalogue-section-placeholder-competencies"]').exists()
      ).toBe(false)

      await wrapper.setData({ activeSection: 'roles' })
      await flushPromises()
      expect(wrapper.find('[data-testid="stub-roles"]').exists()).toBe(true)

      await wrapper.setData({ activeSection: 'indicators' })
      await flushPromises()
      expect(wrapper.find('[data-testid="stub-indicators"]').exists()).toBe(true)
    })

    it('renders the full violations list on a 422 refusal, not the generic banner', async () => {
      fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'draft' }) })
      publishRevision.mockRejectedValueOnce(
        Object.assign(new Error('422'), {
          status: 422,
          data: {
            violations: [
              {
                rule: 'roles_closed_set',
                subject: 'revision:1',
                detail: 'expected at most 5 roles, found 6',
              },
              {
                rule: 'exactly_three_indicators',
                subject: 'role:1 competency:2',
                detail: 'expected exactly 3 indicators, found 4',
              },
            ],
          },
        })
      )

      const wrapper = await mountPage()

      await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
      await confirmDialog('confirm')

      const list = wrapper.get('[data-testid="catalogue-publish-violations"]')
      expect(list.text()).toContain('expected at most 5 roles, found 6')
      expect(list.text()).toContain('expected exactly 3 indicators, found 4')
      expect(list.text()).toContain('revision:1')
      expect(list.text()).toContain('role:1 competency:2')
      expect(wrapper.find('[data-testid="catalogue-publish-error"]').exists()).toBe(false)
    })

    it('translates a known violation rule name, falling back to the raw rule otherwise', async () => {
      fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'draft' }) })
      publishRevision.mockRejectedValueOnce(
        Object.assign(new Error('422'), {
          status: 422,
          data: {
            violations: [
              { rule: 'roles_closed_set', subject: 'revision:1', detail: 'x' },
              { rule: 'some_future_rule_this_page_has_no_copy_for', subject: 'y', detail: 'z' },
            ],
          },
        })
      )

      const wrapper = await mountPage()

      await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
      await confirmDialog('confirm')

      // `realI18n()`'s own `t` is identity, so a rule WITH copy renders the
      // full, namespaced key (proving `te` found it and `t` ran), while a
      // rule with none renders its bare, un-namespaced name instead.
      const list = wrapper.get('[data-testid="catalogue-publish-violations"]')
      expect(list.text()).toContain('catalogue.revision.violationRule.roles_closed_set')
      expect(list.text()).toContain('some_future_rule_this_page_has_no_copy_for')
      expect(list.text()).not.toContain(
        'catalogue.revision.violationRule.some_future_rule_this_page_has_no_copy_for'
      )
    })

    it('clears a stale violations list once a later publish succeeds', async () => {
      fetchCurrentRevision.mockResolvedValue({ data: revision({ state: 'draft' }) })
      publishRevision
        .mockRejectedValueOnce(
          Object.assign(new Error('422'), {
            status: 422,
            data: {
              violations: [{ rule: 'roles_closed_set', subject: 'revision:1', detail: 'x' }],
            },
          })
        )
        .mockResolvedValueOnce({ data: revision({ state: 'published' }) })

      const wrapper = await mountPage()

      await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
      await confirmDialog('confirm')
      expect(wrapper.find('[data-testid="catalogue-publish-violations"]').exists()).toBe(true)

      await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
      await confirmDialog('confirm')
      expect(wrapper.find('[data-testid="catalogue-publish-violations"]').exists()).toBe(false)
    })
  })
})
