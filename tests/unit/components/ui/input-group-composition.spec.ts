/**
 * The `input-group` primitive set, assembled the way it is meant to be used
 * (avatar-template-catalogue PR 3, a `combobox` dependency): a bordered group
 * wrapping a control (`InputGroupInput`/`InputGroupTextarea`) plus addons
 * (`InputGroupText`, `InputGroupButton`). `input-group-addon.spec.ts` already
 * covers `InputGroupAddon`'s click-to-focus behavior in isolation; this file
 * exercises the rest of the set together, mirroring `dropdown-menu.spec.ts`'s
 * "one file per composed family" convention.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, defineComponent } from 'vue'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('input-group composition', () => {
  it('renders a text addon, a control and an action button together', () => {
    let clicks = 0

    const host = defineComponent({
      render: () =>
        h(InputGroup, { 'data-testid': 'group' }, () => [
          h(InputGroupAddon, () => h(InputGroupText, { 'data-testid': 'unit' }, () => 'kg')),
          h(InputGroupInput, { placeholder: 'Weight', 'data-testid': 'control' }),
          h(InputGroupAddon, () =>
            h(
              InputGroupButton,
              { 'data-testid': 'action', onClick: () => (clicks += 1) },
              () => 'clear'
            )
          ),
        ]),
    })

    const wrapper = mount(host, { attachTo: document.body })

    expect(wrapper.get('[data-testid="unit"]').text()).toBe('kg')
    expect(wrapper.find('[data-testid="control"]').exists()).toBe(true)

    wrapper.get('[data-testid="action"]').trigger('click')
    expect(clicks).toBe(1)
  })

  it('accepts multiline text through InputGroupTextarea', async () => {
    const host = defineComponent({
      render: () => h(InputGroup, () => h(InputGroupTextarea, { 'data-testid': 'notes' })),
    })

    const wrapper = mount(host, { attachTo: document.body })
    const textarea = wrapper.get<HTMLTextAreaElement>('[data-testid="notes"]')

    await textarea.setValue('line one\nline two')

    expect(textarea.element.value).toBe('line one\nline two')
  })
})
