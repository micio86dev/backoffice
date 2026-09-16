/**
 * pages/catalogue/index.vue (framework-catalogue-authoring PR10b)
 *
 * Focused on what PR10b actually changed: the three new sections are wired
 * to their real panels (not the "not available yet" placeholder anymore),
 * and a publish refusal renders the FULL violations list (task 39b.5)
 * instead of the generic banner PR10 left as a known limitation. Each
 * panel's own CRUD behaviour is covered by its own spec file — this file
 * stubs them to test the WIRING, not re-test their internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { realI18n } from '../support/i18n'

const tMock = (key: string) => key

const fetchCurrentRevision = vi.fn()
const publishRevision = vi.fn()

vi.mock('../../../app/composables/useCatalogue', () => ({
  useCatalogue: () => ({ fetchCurrentRevision, publishRevision }),
}))

const CatalogueIndexPage = (await import('../../../app/pages/catalogue/index.vue')).default

vi.stubGlobal('useI18n', () => realI18n())

const STUBS = {
  CatalogueCompetenciesPanel: { template: '<div data-testid="stub-competencies" />' },
  CatalogueRolesPanel: { template: '<div data-testid="stub-roles" />' },
  CatalogueIndicatorsPanel: { template: '<div data-testid="stub-indicators" />' },
  CatalogueDefaultQuestionsPanel: { template: '<div data-testid="stub-default-questions" />' },
}

async function mountPage() {
  fetchCurrentRevision.mockResolvedValue({ data: { id: 1, state: 'draft', label: null } })

  const wrapper = mount(CatalogueIndexPage, {
    global: { mocks: { $t: tMock }, stubs: STUBS },
    attachTo: document.body,
  })
  await flushPromises()

  return wrapper
}

describe('pages/catalogue/index.vue', () => {
  beforeEach(() => {
    fetchCurrentRevision.mockReset()
    publishRevision.mockReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders a 409 load failure as waiting, never the same destructive red as a real error', async () => {
    fetchCurrentRevision.mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }))

    const wrapper = mount(CatalogueIndexPage, {
      global: { mocks: { $t: tMock }, stubs: STUBS },
      attachTo: document.body,
    })
    await flushPromises()

    const alert = wrapper.get('[data-testid="catalogue-error"]')
    // reka-ui's Alert wrapper reads the variant off `data-slot`'s sibling
    // class list; asserting the DESTRUCTIVE class is ABSENT is what proves
    // this is not rendered as an error, regardless of the exact variant.
    expect(alert.classes().join(' ')).not.toContain('destructive')

    wrapper.unmount()
  })

  it('renders a 403 load failure as a genuine error', async () => {
    fetchCurrentRevision.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 }))

    const wrapper = mount(CatalogueIndexPage, {
      global: { mocks: { $t: tMock }, stubs: STUBS },
      attachTo: document.body,
    })
    await flushPromises()

    const alert = wrapper.get('[data-testid="catalogue-error"]')
    expect(alert.classes().join(' ')).toContain('destructive')

    wrapper.unmount()
  })

  it('renders the real Competencies panel, not the old placeholder', async () => {
    const wrapper = await mountPage()

    // The default active section is `defaultQuestions` — reka-ui's Tabs
    // only mounts the SELECTED panel (lazy panel mounting, DESIGN.md
    // §8.2.1), so Competencies has to actually be selected first.
    await wrapper.setData({ activeSection: 'competencies' })
    await flushPromises()

    expect(wrapper.find('[data-testid="stub-competencies"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="catalogue-section-placeholder-competencies"]').exists()
    ).toBe(false)

    wrapper.unmount()
  })

  it('renders the real Roles and Indicators panels once their tab is selected', async () => {
    const wrapper = await mountPage()

    await wrapper.setData({ activeSection: 'roles' })
    await flushPromises()
    expect(wrapper.find('[data-testid="stub-roles"]').exists()).toBe(true)

    await wrapper.setData({ activeSection: 'indicators' })
    await flushPromises()
    expect(wrapper.find('[data-testid="stub-indicators"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('renders the full violations list on a 422 publish refusal, not the generic banner', async () => {
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
    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const list = wrapper.get('[data-testid="catalogue-publish-violations"]')
    expect(list.text()).toContain('expected at most 5 roles, found 6')
    expect(list.text()).toContain('expected exactly 3 indicators, found 4')
    expect(list.text()).toContain('revision:1')
    expect(list.text()).toContain('role:1 competency:2')
    expect(wrapper.find('[data-testid="catalogue-publish-error"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('translates a known violation rule name, falling back to the raw rule otherwise', async () => {
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
    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // `realI18n()`'s own `t` is identity (returns the key it was given), so
    // a rule with copy renders the FULL, namespaced key — proving `te`
    // found it and `t` was actually called — while a rule with none renders
    // its bare, UN-namespaced name instead of that same prefix.
    const list = wrapper.get('[data-testid="catalogue-publish-violations"]')
    expect(list.text()).toContain('catalogue.revision.violationRule.roles_closed_set')
    expect(list.text()).toContain('some_future_rule_this_page_has_no_copy_for')
    expect(list.text()).not.toContain(
      'catalogue.revision.violationRule.some_future_rule_this_page_has_no_copy_for'
    )

    wrapper.unmount()
  })

  it('still renders the generic banner for a publish failure with no violations body', async () => {
    publishRevision.mockRejectedValueOnce(Object.assign(new Error('403'), { status: 403 }))

    const wrapper = await mountPage()

    await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.find('[data-testid="catalogue-publish-violations"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="catalogue-publish-error"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('clears a stale violations list once a later publish succeeds', async () => {
    publishRevision
      .mockRejectedValueOnce(
        Object.assign(new Error('422'), {
          status: 422,
          data: { violations: [{ rule: 'roles_closed_set', subject: 'revision:1', detail: 'x' }] },
        })
      )
      .mockResolvedValueOnce({ data: { id: 1, state: 'published', label: null } })

    const wrapper = await mountPage()

    async function clickPublish(): Promise<void> {
      await wrapper.get('[data-testid="catalogue-publish"]').trigger('click')
      const confirmButton = document.body.querySelector<HTMLButtonElement>(
        '[data-testid="confirm-dialog-confirm"]'
      )
      confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
    }

    await clickPublish()
    expect(wrapper.find('[data-testid="catalogue-publish-violations"]').exists()).toBe(true)

    await clickPublish()
    expect(wrapper.find('[data-testid="catalogue-publish-violations"]').exists()).toBe(false)

    wrapper.unmount()
  })
})
