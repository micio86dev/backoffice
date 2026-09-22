/**
 * `InputGroupAddon` — the icon/action slot flanking an `InputGroup`'s control.
 *
 * Vendored from the shadcn-vue registry (avatar-template-catalogue PR 3)
 * alongside `combobox`. Unlike its sibling primitives in this same install,
 * it is not pure prop/class forwarding: `handleInputGroupAddonClick`
 * imperatively focuses the group's `<input>` when the addon area itself is
 * clicked (a mouse-only "click near the input to focus it" convenience,
 * the same affordance a `<label for>` gives for free), but bails out when the
 * click landed on a nested `<button>` — otherwise clicking an addon action
 * (e.g. a clear button) would also steal focus back to the input.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, defineComponent } from 'vue'
import { InputGroup, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('InputGroupAddon', () => {
  it('focuses the sibling input when the addon area itself is clicked', async () => {
    const host = defineComponent({
      render: () =>
        h(InputGroup, () => [
          h(InputGroupAddon, { 'data-testid': 'addon' }, () => 'icon'),
          h(Input, { 'data-testid': 'control' }),
        ]),
    })

    const wrapper = mount(host, { attachTo: document.body })
    const addon = wrapper.get('[data-testid="addon"]')
    const input = wrapper.get<HTMLInputElement>('[data-testid="control"]').element

    expect(document.activeElement).not.toBe(input)
    await addon.trigger('click')

    expect(document.activeElement).toBe(input)
  })

  it('does not steal focus when the click landed on a nested button', async () => {
    const host = defineComponent({
      render: () =>
        h(InputGroup, () => [
          h(Input, { 'data-testid': 'control' }),
          h(InputGroupAddon, { 'data-testid': 'addon' }, () =>
            h(InputGroupButton, { 'data-testid': 'action' }, () => 'clear')
          ),
        ]),
    })

    const wrapper = mount(host, { attachTo: document.body })
    const action = wrapper.get('[data-testid="action"]')
    const input = wrapper.get<HTMLInputElement>('[data-testid="control"]').element

    action.element.focus()
    expect(document.activeElement).not.toBe(input)

    await action.trigger('click')

    expect(document.activeElement).not.toBe(input)
    expect(document.activeElement).toBe(action.element)
  })
})
