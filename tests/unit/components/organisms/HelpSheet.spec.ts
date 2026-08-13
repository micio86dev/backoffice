/**
 * HelpSheet.vue — contextual help, one topic per route.
 *
 * The behaviour worth pinning is the ROUTING: a help button that opens generic
 * help on a specific page is worse than no help button, and an unrecognised
 * route must fall back rather than render an empty panel — new routes are added
 * more often than the topic map is updated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { waitFor } from '../../support/wait-for'

const tMock = (key: string) => key

function mountAt(path: string) {
  vi.stubGlobal(
    'useRoute',
    vi.fn(() => ({ path, fullPath: path, params: {}, query: {} }))
  )

  return mount(HelpSheet, { attachTo: document.body, global: { mocks: { $t: tMock } } })
}

const HelpSheet = (await import('../../../../app/components/organisms/HelpSheet.vue')).default

describe('HelpSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    ['/projects', 'help.topics.projects.title'],
    ['/projects/42', 'help.topics.projects.title'],
    ['/reports', 'help.topics.reports.title'],
    ['/settings', 'help.topics.settings.title'],
    ['/participants', 'help.topics.participants.title'],
    ['/avatar-templates', 'help.topics.avatarTemplates.title'],
    ['/', 'help.topics.dashboard.title'],
  ])('opens the topic for %s', async (path, expectedTitleKey) => {
    const wrapper = mountAt(path)
    await flushPromises()

    await wrapper.get('[data-testid="help-trigger"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="help-sheet"]'),
      'the help sheet to open'
    )

    expect(document.body.textContent).toContain(expectedTitleKey)

    wrapper.unmount()
  })

  it('falls back to the overview topic on a route it does not know', async () => {
    const wrapper = mountAt('/some-future-page')
    await flushPromises()

    await wrapper.get('[data-testid="help-trigger"]').trigger('click')
    await waitFor(
      () => document.body.querySelector('[data-testid="help-sheet"]'),
      'the help sheet to open'
    )

    expect(document.body.textContent).toContain('help.topics.dashboard.title')

    wrapper.unmount()
  })

  it('renders the steps as an ordered list, because they are an order and not a menu', async () => {
    const wrapper = mountAt('/projects')
    await flushPromises()

    await wrapper.get('[data-testid="help-trigger"]').trigger('click')
    const steps = await waitFor(
      () => document.body.querySelector('[data-testid="help-steps"]'),
      'the help steps to render'
    )

    expect(steps.tagName).toBe('OL')
    expect(steps.querySelectorAll('li').length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('renders the glossary as a definition list', async () => {
    const wrapper = mountAt('/reports')
    await flushPromises()

    await wrapper.get('[data-testid="help-trigger"]').trigger('click')
    const glossary = await waitFor(
      () => document.body.querySelector('[data-testid="help-glossary"]'),
      'the glossary to render'
    )

    expect(glossary.tagName).toBe('DL')
    expect(glossary.querySelectorAll('dt').length).toBe(glossary.querySelectorAll('dd').length)

    wrapper.unmount()
  })
})
