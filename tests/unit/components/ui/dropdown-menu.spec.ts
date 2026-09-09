/**
 * The dropdown-menu row primitives.
 *
 * Vendored shadcn source is NOT exempt from "every component must have a
 * matching Vitest unit test" — `tests/unit/components/ui/` already holds
 * `input.spec.ts` and `form-fieldset.spec.ts`. And a source-level grep in
 * `theme.spec.ts` asserts the class STRING, which is not the same claim as
 * "the component renders it": a `cn()` call that dropped the base list, or a
 * `props.class` that overrode it, would leave that grep green.
 *
 * These render through reka-ui's Menu primitives, which need a live root
 * context — so each row is mounted inside a real `DropdownMenu`, opened, and
 * read from `document.body` where the content teleports.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h, defineComponent } from 'vue'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

function host(row: ReturnType<typeof h>) {
  return defineComponent({
    render: () =>
      h(DropdownMenu, { defaultOpen: true }, () => [
        h(DropdownMenuTrigger, () => 'open'),
        h(DropdownMenuContent, () => [row]),
      ]),
  })
}

async function renderRow(row: ReturnType<typeof h>): Promise<HTMLElement> {
  mount(host(row), { attachTo: document.body })
  await flushPromises()

  const element = document.body.querySelector<HTMLElement>('[data-testid="row"]')
  if (element === null) throw new Error('the row did not render')

  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('dropdown-menu rows', () => {
  it.each([
    ['item', () => h(DropdownMenuItem, { 'data-testid': 'row' }, () => 'x')],
    ['checkbox item', () => h(DropdownMenuCheckboxItem, { 'data-testid': 'row' }, () => 'x')],
  ])('renders %s with the shared highlight and a pointer cursor', async (_label, build) => {
    const element = await renderRow(build())

    expect(element.className).toContain('focus:bg-accent-dark')
    expect(element.className).toContain('focus:text-white')
    // The 3.7:1 pairing, and the other treatment.
    expect(element.className).not.toContain('focus:bg-accent ')
    expect(element.className).not.toContain('text-accent-foreground')
    // A clickable row that shows the arrow cursor reads as inert.
    expect(element.className).toContain('cursor-pointer')
  })

  it('renders a radio item with the same highlight', async () => {
    const element = await renderRow(
      h(DropdownMenuRadioGroup, { modelValue: 'a' }, () => [
        h(DropdownMenuRadioItem, { value: 'a', 'data-testid': 'row' }, () => 'x'),
      ])
    )

    expect(element.className).toContain('focus:bg-accent-dark')
    expect(element.className).toContain('cursor-pointer')
  })

  it('shows not-allowed on a disabled row, and can still be seen to be disabled', async () => {
    // `pointer-events-none` used to sit on these rows, and an element that
    // is not a pointer target resolves its cursor from an ancestor — so
    // `not-allowed` could never render. reka-ui guards activation in JS
    // (`if (!props.disabled)` in MenuItem), so dropping it costs nothing.
    const element = await renderRow(
      h(DropdownMenuItem, { 'data-testid': 'row', disabled: true }, () => 'x')
    )

    expect(element.getAttribute('data-disabled')).not.toBeNull()
    expect(element.className).toContain('data-disabled:cursor-not-allowed')
    expect(element.className).not.toContain('data-disabled:pointer-events-none')
  })

  it('renders a sub-trigger with the same highlight, open state and cursors', async () => {
    // It was carved out of the guard on the claim that it "has no disabled
    // state to style". `reka-ui/dist/Menu/MenuSubTrigger.js` declares a
    // `disabled` prop, guards on it three times, and renders through
    // `MenuItemImpl` — which emits `data-disabled`.
    const element = await renderRow(
      h(DropdownMenuSub, () => [h(DropdownMenuSubTrigger, { 'data-testid': 'row' }, () => 'x')])
    )

    expect(element.className).toContain('focus:bg-accent-dark')
    // Its OPEN state is the one `data-open:bg-*` in the family, and the
    // first version of the source guard never looked at it.
    expect(element.className).toContain('data-open:bg-accent-dark')
    expect(element.className).toContain('cursor-pointer')
    expect(element.className).toContain('data-disabled:cursor-not-allowed')
  })

  it('keeps the destructive variant destructive, not orange', async () => {
    // The one row that must NOT take the shared highlight: a delete action
    // reads as destructive, and the accent is the ordinary highlight.
    const element = await renderRow(
      h(DropdownMenuItem, { 'data-testid': 'row', variant: 'destructive' }, () => 'x')
    )

    expect(element.getAttribute('data-variant')).toBe('destructive')
    expect(element.className).toContain('data-[variant=destructive]:focus:bg-destructive/10')
  })
})
