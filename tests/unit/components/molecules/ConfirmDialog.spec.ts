/**
 * ConfirmDialog.vue (Unit 6, task 24.6 — RED)
 *
 * `AlertDialog` wrapper for deactivate/activate confirmation flows.
 * Confirm/cancel emit distinct events; nothing happens until the operator
 * explicitly confirms.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ConfirmDialog from '../../../../app/components/molecules/ConfirmDialog.vue'

const tMock = (key: string) => key

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ConfirmDialog', () => {
  it('renders the title and description', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Deactivate user?', description: 'They will lose access.' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.body.textContent).toContain('Deactivate user?')
    expect(document.body.textContent).toContain('They will lose access.')
    wrapper.unmount()
  })

  it('emits confirm when the confirm action is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Deactivate user?', description: 'They will lose access.' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-confirm"]')
      ?.click()
    await flushPromises()

    expect(wrapper.emitted('confirm')).toBeTruthy()
    wrapper.unmount()
  })

  it('emits cancel when the cancel action is clicked, not confirm', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Deactivate user?', description: 'They will lose access.' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog-cancel"]')?.click()
    await flushPromises()

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('confirm')).toBeFalsy()
    wrapper.unmount()
  })
})
