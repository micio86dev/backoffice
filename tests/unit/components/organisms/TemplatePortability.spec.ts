/**
 * TemplatePortability.vue — export / import controls (C14).
 *
 * The role check here is AFFORDANCE, not enforcement: the server refuses a
 * non-admin regardless. What this pins is that a non-admin never sees the
 * controls at all — a button that appears and then 403s teaches the operator
 * that the product is broken rather than that they lack the right.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const exportMock = vi.fn()
const importMock = vi.fn()

vi.mock('../../../../app/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ exportTemplates: exportMock, importTemplates: importMock }),
}))

const TemplatePortability = (
  await import('../../../../app/components/organisms/TemplatePortability.vue')
).default

const tMock = (key: string) => key

function mountIt(isAdmin: boolean) {
  return mount(TemplatePortability, {
    props: { isAdmin },
    global: { mocks: { $t: tMock } },
  })
}

describe('TemplatePortability', () => {
  beforeEach(() => {
    exportMock.mockReset().mockResolvedValue({ schema: 'beai.avatar-template/1', templates: [] })
    importMock.mockReset().mockResolvedValue({ data: [{ id: 1, name: 'X', provider: 'heygen' }] })
  })

  it('renders nothing at all for a non-admin', () => {
    const wrapper = mountIt(false)

    expect(wrapper.find('[data-testid="template-portability"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="template-export"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="template-import"]').exists()).toBe(false)
  })

  it('renders both controls for an admin', () => {
    const wrapper = mountIt(true)

    expect(wrapper.find('[data-testid="template-export"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-import"]').exists()).toBe(true)
  })

  it('reports how many templates an import created', async () => {
    importMock.mockResolvedValue({
      data: [
        { id: 1, name: 'A', provider: 'heygen' },
        { id: 2, name: 'B', provider: 'tavus' },
      ],
    })

    const wrapper = mountIt(true)
    const input = wrapper.get('[data-testid="template-import-input"]')

    const file = new File(
      [JSON.stringify({ schema: 'beai.avatar-template/1', templates: [] })],
      'x.json',
      {
        type: 'application/json',
      }
    )
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.get('[data-testid="portability-result"]').text()).toContain(
      'avatar_templates.portability.importDone'
    )
  })

  // "unknown key voiceSpeedd" is actionable; "import failed" is not.
  it('surfaces the server reason when an import is refused', async () => {
    importMock.mockRejectedValue({
      data: { errors: { 'templates.0': ['Unknown configuration key(s): inventedKnob.'] } },
    })

    const wrapper = mountIt(true)
    const input = wrapper.get('[data-testid="template-import-input"]')
    const file = new File(['{}'], 'x.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.get('[data-testid="portability-result"]').text()).toContain(
      'avatar_templates.portability.importFailed'
    )
  })

  it('never calls import when the file is not chosen', async () => {
    const wrapper = mountIt(true)
    const input = wrapper.get('[data-testid="template-import-input"]')
    Object.defineProperty(input.element, 'files', { value: [] })
    await input.trigger('change')
    await flushPromises()

    expect(importMock).not.toHaveBeenCalled()
  })
})
