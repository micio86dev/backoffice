/**
 * `SelectItem` — the row a Select highlights.
 *
 * `theme.spec.ts` asserts its class STRING; this asserts what the component
 * RENDERS, which is a different claim: a `cn()` call that dropped the base
 * list, or a `props.class` that overrode it, would leave the grep green.
 *
 * reka-ui's SelectItem needs a live `SelectRoot` context to mount at all, so
 * each row is built inside a real open Select and read from `document.body`,
 * where the content teleports.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h, defineComponent } from 'vue'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select'

async function renderItem(props: Record<string, unknown> = {}): Promise<HTMLElement> {
  const host = defineComponent({
    render: () =>
      h(Select, { defaultOpen: true }, () => [
        h(SelectTrigger, () => 'open'),
        h(SelectContent, () => [
          h(SelectGroup, () => [
            h(SelectItem, { value: 'a', 'data-testid': 'row', ...props }, () => 'x'),
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

describe('SelectItem', () => {
  it('renders the shared highlight, never plain accent', async () => {
    const element = await renderItem()

    expect(element.className).toContain('focus:bg-accent-dark')
    expect(element.className).toContain('focus:text-white')
    expect(element.className).not.toContain('text-accent-foreground')
  })

  it('shows a pointer, because it is clickable', async () => {
    expect((await renderItem()).className).toContain('cursor-pointer')
  })

  it('shows not-allowed when disabled, and can still be seen to be disabled', async () => {
    // `pointer-events-none` used to sit on this row, and an element that is
    // not a pointer target resolves its cursor from an ancestor — so
    // `not-allowed` could never render. reka-ui guards activation in JS, so
    // dropping it costs no protection.
    const element = await renderItem({ disabled: true })

    expect(element.getAttribute('data-disabled')).not.toBeNull()
    expect(element.className).toContain('data-[disabled]:cursor-not-allowed')
    expect(element.className).not.toContain('data-[disabled]:pointer-events-none')
  })
})
