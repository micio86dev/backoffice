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

async function mountPage() {
  const { default: CataloguePage } = await import('../../../../app/pages/catalogue/index.vue')

  const wrapper = mount(CataloguePage, {
    global: {
      mocks: { $t: tMock },
      stubs: { CatalogueDefaultQuestionsPanel: true },
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

  it('shows the "no open revision" state when none has ever been opened', async () => {
    fetchCurrentRevision.mockResolvedValue({ data: null })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="catalogue-revision-none"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="catalogue-publish"]').exists()).toBe(false)
  })
})
