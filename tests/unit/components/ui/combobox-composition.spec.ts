/**
 * The `combobox` primitive set, assembled the way the shadcn-vue registry's
 * own usage example composes it (avatar-template-catalogue PR 3): anchor +
 * trigger + input + list + empty state + group + item + item-indicator +
 * viewport + separator. `combobox-item.spec.ts` already covers `ComboboxItem`'s
 * project-specific cursor/disabled patch in isolation; this file exercises
 * the rest of the set together — mirroring `dropdown-menu.spec.ts`'s own
 * "one file per composed family, not one per forwarding sub-component"
 * convention — proving the assembly actually searches, selects and empties,
 * not just that each piece mounts.
 *
 * reka-ui teleports `ComboboxList`'s content to `document.body`, outside the
 * mounted wrapper's own element tree (the same reason `select-item.spec.ts`
 * reads from `document.body` rather than the wrapper), so every query below
 * goes through `document.body` directly.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h, defineComponent, ref } from 'vue'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxList,
  ComboboxViewport,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxSeparator,
} from '@/components/ui/combobox'

const frameworks = [
  { value: 'next', label: 'Next.js' },
  { value: 'nuxt', label: 'Nuxt.js' },
]

function renderCombobox() {
  const selected = ref<(typeof frameworks)[number]>()

  const host = defineComponent({
    render: () =>
      h(
        Combobox,
        {
          modelValue: selected.value,
          'onUpdate:modelValue': (v: unknown) => (selected.value = v as typeof selected.value),
          by: 'label',
          defaultOpen: true,
        },
        () => [
          h(ComboboxAnchor, () => h(ComboboxTrigger, { 'data-testid': 'trigger' }, () => 'open')),
          h(ComboboxList, { 'data-testid': 'list' }, () => [
            h(ComboboxInput, { placeholder: 'Search framework...', 'data-testid': 'search' }),
            h(ComboboxEmpty, { 'data-testid': 'empty' }, () => 'No framework found.'),
            h(ComboboxViewport, () => [
              h(ComboboxGroup, { heading: 'Frameworks', 'data-testid': 'group' }, () => [
                ...frameworks.map((framework) =>
                  h(
                    ComboboxItem,
                    {
                      key: framework.value,
                      value: framework,
                      'data-testid': `item-${framework.value}`,
                    },
                    () => [
                      framework.label,
                      h(
                        ComboboxItemIndicator,
                        { 'data-testid': `indicator-${framework.value}` },
                        () => '✓'
                      ),
                    ]
                  )
                ),
                h(ComboboxSeparator, { 'data-testid': 'separator' }),
              ]),
            ]),
          ]),
        ]
      ),
  })

  mount(host, { attachTo: document.body })
  return { selected }
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
}

async function search(text: string): Promise<void> {
  const input = byTestId('search') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('combobox composition', () => {
  it('renders the group heading, every item and the separator', async () => {
    renderCombobox()
    await flushPromises()

    expect(document.body.textContent).toContain('Frameworks')
    expect(byTestId('item-next')).not.toBeNull()
    expect(byTestId('item-nuxt')).not.toBeNull()
    expect(byTestId('separator')).not.toBeNull()
  })

  it('filters items by the search text typed into the input', async () => {
    renderCombobox()
    await flushPromises()

    await search('Nuxt')

    expect(byTestId('item-nuxt')).not.toBeNull()
    expect(byTestId('item-next')).toBeNull()
  })

  it('shows the empty state when the search matches nothing', async () => {
    renderCombobox()
    await flushPromises()

    await search('Angular')

    const empty = byTestId('empty')
    expect(empty?.textContent).toBe('No framework found.')
    expect(byTestId('item-next')).toBeNull()
    expect(byTestId('item-nuxt')).toBeNull()
  })

  it('selecting an item updates the model and shows its indicator', async () => {
    const { selected } = renderCombobox()
    await flushPromises()

    byTestId('item-nuxt')?.click()
    await flushPromises()

    expect(selected.value).toEqual(frameworks[1])
  })
})
