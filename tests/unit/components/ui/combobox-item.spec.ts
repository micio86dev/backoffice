/**
 * `ComboboxItem` — the row a Combobox highlights.
 *
 * Vendored from the shadcn-vue registry (avatar-template-catalogue PR 3) with
 * `cursor-default`/`data-disabled:pointer-events-none` unchanged from upstream —
 * this project's own `SelectItem`/`DropdownMenuItem` siblings both carry
 * `cursor-pointer` + `data-disabled:cursor-not-allowed` instead, exactly the
 * "silently loses the affordance signal" failure `select-item.spec.ts`
 * documents: an element with `pointer-events-none` is not a pointer target, so
 * it resolves its cursor from an ancestor and `cursor-not-allowed` can never
 * render on it. reka-ui guards activation in JS for Combobox the same way it
 * does for Select, so dropping `pointer-events-none` costs no protection.
 *
 * reka-ui's ComboboxItem needs a live `ComboboxRoot` context to mount at all,
 * so each row is built inside a real open Combobox and read from
 * `document.body`, where the content teleports.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h, defineComponent } from 'vue'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxList,
  ComboboxGroup,
  ComboboxItem,
} from '@/components/ui/combobox'

async function renderItem(props: Record<string, unknown> = {}): Promise<HTMLElement> {
  const host = defineComponent({
    render: () =>
      h(Combobox, { defaultOpen: true }, () => [
        h(ComboboxAnchor, () => h(ComboboxInput)),
        h(ComboboxList, () => [
          h(ComboboxGroup, () => [
            h(ComboboxItem, { value: 'a', 'data-testid': 'row', ...props }, () => 'x'),
          ]),
        ]),
      ]),
  })

  mount(host, { attachTo: document.body })
  await flushPromises()

  const element = document.body.querySelector<HTMLElement>('[data-testid="row"]')
  if (element === null) throw new Error('the row did not render')

  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ComboboxItem', () => {
  it('shows a pointer, because it is clickable', async () => {
    expect((await renderItem()).className).toContain('cursor-pointer')
  })

  it('shows not-allowed when disabled, and can still be seen to be disabled', async () => {
    const element = await renderItem({ disabled: true })

    expect(element.getAttribute('data-disabled')).not.toBeNull()
    expect(element.className).toContain('data-disabled:cursor-not-allowed')
    expect(element.className).not.toContain('data-disabled:pointer-events-none')
  })
})
