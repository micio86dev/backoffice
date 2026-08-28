/**
 * FormDrawerActions.vue — the submit/cancel pair every FormDrawer footer needs
 * (feature/form-drawer).
 *
 * Extracted so a sixth CRUD form costs a `<FormDrawer>` element and an `id` on
 * its `<form>`, not another hand-copied pair of buttons with its own
 * disabled-while-saving wiring. The `form` attribute is the load-bearing part:
 * the submit control lives in the drawer's NON-scrolling footer while the
 * `<form>` markup itself lives in the scrolling body, and this native HTML
 * attribute is the only thing that connects them — without it the button is
 * inert.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

const FormDrawerActions = (
  await import('../../../../app/components/organisms/FormDrawerActions.vue')
).default

function mountActions(props: Record<string, unknown> = {}) {
  return mount(FormDrawerActions, {
    props: { formId: 'demo-form', ...props },
    global: { mocks: { $t: (key: string) => key } },
  })
}

describe('FormDrawerActions', () => {
  it('submits the form it names, from outside that form', () => {
    const submit = mountActions().get('[data-testid="form-drawer-save"]')

    expect(submit.attributes('type')).toBe('submit')
    // Without this the button sits in the footer, outside the <form>, and
    // clicking it does nothing at all.
    expect(submit.attributes('form')).toBe('demo-form')
  })

  it('falls back to the shared save/cancel copy, so a new form needs no strings of its own', () => {
    const wrapper = mountActions()

    expect(wrapper.get('[data-testid="form-drawer-save"]').text()).toBe('common.action.save')
    expect(wrapper.get('[data-testid="form-drawer-cancel"]').text()).toBe('common.action.cancel')
  })

  it('accepts a call-site submit label where "Save" would be the wrong word', () => {
    const wrapper = mountActions({ submitLabel: 'Create key' })

    expect(wrapper.get('[data-testid="form-drawer-save"]').text()).toBe('Create key')
    // Cancel is never overridden — it means the same thing on every form.
    expect(wrapper.get('[data-testid="form-drawer-cancel"]').text()).toBe('common.action.cancel')
  })

  it('disables submit and marks it busy while the request is in flight', () => {
    const submit = mountActions({ pending: true }).get('[data-testid="form-drawer-save"]')

    expect(submit.attributes('disabled')).toBeDefined()
    expect(submit.attributes('aria-busy')).toBe('true')
  })

  it('leaves cancel enabled while pending — a slow request must never trap the operator', () => {
    const cancel = mountActions({ pending: true }).get('[data-testid="form-drawer-cancel"]')

    expect(cancel.attributes('disabled')).toBeUndefined()
  })

  it('emits cancel rather than submitting when the cancel control is activated', async () => {
    const wrapper = mountActions()

    const cancel = wrapper.get('[data-testid="form-drawer-cancel"]')
    // type="button", not the implicit "submit" a bare <button> inside a form
    // would carry — and it names no form either way.
    expect(cancel.attributes('type')).toBe('button')
    expect(cancel.attributes('form')).toBeUndefined()

    await cancel.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
