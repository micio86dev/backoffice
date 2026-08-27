/**
 * FormDrawer.vue — the reusable right-side form drawer (feature/form-drawer).
 *
 * A thin wrapper over the existing `Sheet` primitive (reka-ui's `DialogRoot`
 * under the hood), NOT a new panel implementation — reka-ui already gives a
 * focus trap, focus restore, Escape-to-close and `aria-modal` for free. What
 * this wrapper adds on top: a width that fits a two-column form, a footer
 * region that stays visible without scrolling (the exact defect documented on
 * `pages/projects/index.vue`'s Dialog usage), and `SheetTitle`/`SheetDescription`
 * wiring so reka-ui never logs its missing-title/description warning.
 *
 * `Sheet` teleports its content to `document.body` (`DialogPortal`), so every
 * assertion here that needs the rendered content queries `document.body`
 * directly — `wrapper.find(...)` only searches the wrapper's own subtree and
 * will never see it, the same teleport-aware pattern already proven by
 * `ConfirmDialog`/`HelpSheet`'s specs.
 */
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, afterEach } from 'vitest'
import { waitFor } from '../../support/wait-for'

const FormDrawer = (await import('../../../../app/components/organisms/FormDrawer.vue')).default

function mountDrawer(props: Partial<{ open: boolean; title: string; description: string }> = {}) {
  return mount(FormDrawer, {
    props: { open: true, title: 'Test drawer', ...props },
    slots: {
      default: '<input data-testid="drawer-body-field" type="text" />',
      footer: '<button type="button" data-testid="drawer-footer-action">Save</button>',
    },
    attachTo: document.body,
    global: { mocks: { $t: (key: string) => key } },
  })
}

describe('FormDrawer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it("is not in the mounting component's own subtree when open — it is portalled", async () => {
    const wrapper = mountDrawer({ open: true })
    await flushPromises()

    // The Sheet portals its content to document.body (DialogPortal). A find()
    // scoped to the wrapper's own subtree must come back empty even though
    // the drawer is genuinely open and rendered somewhere in the document.
    expect(wrapper.find('[data-testid="drawer-body-field"]').exists()).toBe(false)
    expect(document.body.querySelector('[data-testid="drawer-body-field"]')).not.toBeNull()
  })

  it('renders nothing when closed', async () => {
    mountDrawer({ open: false })
    await flushPromises()

    expect(document.body.querySelector('[data-testid="drawer-body-field"]')).toBeNull()
  })

  it('emits update:open(false) when the built-in close control is activated', async () => {
    const wrapper = mountDrawer({ open: true })
    await flushPromises()

    const closeButton = await waitFor(
      () => document.body.querySelector<HTMLButtonElement>('[data-slot="sheet-close"]'),
      'the sheet close button to render'
    )

    closeButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('renders the title through SheetTitle, so aria-labelledby has a real target', async () => {
    mountDrawer({ open: true, title: 'Edit widget' })
    await flushPromises()

    const content = await waitFor(
      () => document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]'),
      'the sheet content to render'
    )
    const title = document.body.querySelector('[data-slot="sheet-title"]')

    expect(title?.textContent).toBe('Edit widget')
    expect(content.getAttribute('aria-labelledby')).toBe(title?.id)
  })

  it('renders the description through SheetDescription and wires aria-describedby when one is given', async () => {
    mountDrawer({ open: true, description: 'Fill in every field.' })
    await flushPromises()

    const content = await waitFor(
      () => document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]'),
      'the sheet content to render'
    )
    const description = document.body.querySelector('[data-slot="sheet-description"]')

    expect(description?.textContent).toBe('Fill in every field.')
    expect(content.getAttribute('aria-describedby')).toBe(description?.id)
  })

  it('suppresses the dangling aria-describedby when no description is given', async () => {
    mountDrawer({ open: true, description: undefined })
    await flushPromises()

    const content = await waitFor(
      () => document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]'),
      'the sheet content to render'
    )

    // No SheetDescription rendered at all, and no aria-describedby pointing at
    // an id that does not exist — reka-ui's own documented way to opt out of
    // its "missing Description" dev warning is an explicit undefined here.
    expect(document.body.querySelector('[data-slot="sheet-description"]')).toBeNull()
    expect(content.hasAttribute('aria-describedby')).toBe(false)
  })

  it('keeps the footer slot OUTSIDE the element that scrolls', async () => {
    mountDrawer({ open: true })
    await flushPromises()

    const scrollRegion = await waitFor(
      () => document.body.querySelector<HTMLElement>('.overflow-y-auto'),
      'the scrolling body region to render'
    )
    const footerAction = document.body.querySelector('[data-testid="drawer-footer-action"]')

    expect(footerAction).not.toBeNull()
    // This is the exact defect documented on pages/projects/index.vue's
    // Dialog usage: a long form grows past the viewport and takes the submit
    // button with it. The footer must never be a descendant of the scrolling
    // element.
    expect(scrollRegion.contains(footerAction)).toBe(false)
  })

  it('moves focus into the drawer on open', async () => {
    const wrapper = mountDrawer({ open: false })
    await flushPromises()

    await wrapper.setProps({ open: true })

    const focusedInsideDrawer = await waitFor(() => {
      const content = document.body.querySelector('[data-slot="sheet-content"]')
      return content && content.contains(document.activeElement) ? content : null
    }, 'focus to move into the drawer')

    expect(focusedInsideDrawer).not.toBeNull()
  })

  it('respects prefers-reduced-motion by carrying a motion-reduce override', async () => {
    mountDrawer({ open: true })
    await flushPromises()

    const content = await waitFor(
      () => document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]'),
      'the sheet content to render'
    )

    // DESIGN.md mandates that all animation respect prefers-reduced-motion.
    // The vendored SheetContent's slide/fade classes carry no such guard —
    // this wrapper is where that pre-existing gap gets closed.
    expect(content.className).toContain('motion-reduce:')
  })

  it('renders the shared submit/cancel pair when given a form id and no footer slot', async () => {
    // The whole point of the rollout: a sixth form supplies a `form-id` and
    // gets the standard footer, rather than hand-copying a button pair.
    mount(FormDrawer, {
      props: { open: true, title: 'Test drawer', formId: 'demo-form' },
      slots: { default: '<form id="demo-form"><input type="text" /></form>' },
      attachTo: document.body,
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    const submit = await waitFor(
      () => document.body.querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]'),
      'the default footer submit control to render'
    )

    expect(submit.getAttribute('form')).toBe('demo-form')
    expect(document.body.querySelector('[data-testid="form-drawer-cancel"]')).not.toBeNull()
  })

  it('closes the drawer when the default footer cancel is activated', async () => {
    const wrapper = mount(FormDrawer, {
      props: { open: true, title: 'Test drawer', formId: 'demo-form' },
      slots: { default: '<form id="demo-form"><input type="text" /></form>' },
      attachTo: document.body,
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    const cancel = await waitFor(
      () => document.body.querySelector<HTMLButtonElement>('[data-testid="form-drawer-cancel"]'),
      'the default footer cancel control to render'
    )
    cancel.click()
    await flushPromises()

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('forwards pending to the default footer, so every drawer disables submit the same way', async () => {
    mount(FormDrawer, {
      props: { open: true, title: 'Test drawer', formId: 'demo-form', pending: true },
      slots: { default: '<form id="demo-form"><input type="text" /></form>' },
      attachTo: document.body,
      global: { mocks: { $t: (key: string) => key } },
    })
    await flushPromises()

    const submit = await waitFor(
      () => document.body.querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]'),
      'the default footer submit control to render'
    )

    expect(submit.disabled).toBe(true)
  })

  it('lets an explicit footer slot win over the default pair', async () => {
    mountDrawer({ open: true })
    await flushPromises()

    await waitFor(
      () => document.body.querySelector('[data-testid="drawer-footer-action"]'),
      'the explicit footer slot content to render'
    )

    expect(document.body.querySelector('[data-testid="form-drawer-save"]')).toBeNull()
  })

  it('sizes the drawer wide enough for a two-column form', async () => {
    mountDrawer({ open: true })
    await flushPromises()

    const content = await waitFor(
      () => document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]'),
      'the sheet content to render'
    )

    // SheetContent's own default (`data-[side=right]:sm:max-w-sm`, 384px) is
    // far too narrow for two columns — the wrapper must override it to
    // something wider, scoped to the SAME `side="right"` variant (a bare
    // `sm:max-w-3xl` would lose the specificity fight against the
    // side-scoped default and do nothing). `data-[side=left]:sm:max-w-sm` is
    // deliberately left alone — it never applies to this right-side render.
    expect(content.className).not.toContain('data-[side=right]:sm:max-w-sm')
    expect(content.className).toContain('data-[side=right]:sm:max-w-3xl')
  })
})
