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

  // design.md D4 — confirmLabel/cancelLabel/variant, widening the props
  // without changing today's default strings.
  it('falls back to the default confirm/cancel labels when none are given', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Deactivate user?', description: 'They will lose access.' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.body.textContent).toContain('users.confirm.action')
    expect(document.body.textContent).toContain('projects.action.cancel')
    wrapper.unmount()
  })

  it('renders overridden confirmLabel and cancelLabel verbatim', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        title: 'Revoke this key?',
        description: 'It stops working immediately.',
        confirmLabel: 'Revoke',
        cancelLabel: 'Keep it',
      },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.body.textContent).toContain('Revoke')
    expect(document.body.textContent).toContain('Keep it')
    expect(document.body.textContent).not.toContain('users.confirm.action')
    expect(document.body.textContent).not.toContain('projects.action.cancel')
    wrapper.unmount()
  })

  it('applies the destructive variant to the confirm button only', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        title: 'Delete this template?',
        description: 'This cannot be undone.',
        variant: 'destructive',
      },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    const confirmButton = document.body.querySelector('[data-testid="confirm-dialog-confirm"]')
    const cancelButton = document.body.querySelector('[data-testid="confirm-dialog-cancel"]')

    expect(confirmButton?.className).toContain('text-destructive')
    expect(cancelButton?.className).not.toContain('text-destructive')
    wrapper.unmount()
  })

  // The missing regression test (design.md D4): a confirm click must emit
  // `confirm` exactly once and `cancel` zero times — reka-ui's
  // AlertDialogAction ALSO closes the dialog on click, which without
  // `suppressNextCancel` would fire a spurious 'cancel' right after.
  it('confirming emits confirm exactly once and cancel zero times', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, title: 'Deactivate user?', description: 'They will lose access.' },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })
    await flushPromises()

    const confirmButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-dialog-confirm"]'
    )
    confirmButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeFalsy()
    wrapper.unmount()
  })
})
