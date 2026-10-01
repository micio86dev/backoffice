/**
 * The X button of `SheetContent` and `DialogContent` is announced in the UI
 * language.
 *
 * Both vendored shadcn-vue primitives shipped a hard-coded `<span
 * class="sr-only">Close</span>`: the only accessible name of an icon-only
 * button, read out in English by a screen reader inside the Italian UI. DESIGN.md
 * waives the per-primitive unit test for `app/components/ui/**`, but never "a
 * behavioral or accessibility requirement", and a required-in-both-locales
 * label is exactly that, so this spec mounts the primitives anyway.
 *
 * The label comes from the shared `common.action.close` key. The `$t` mock below
 * resolves REAL copy from the locale files, so the assertion is on what the
 * operator hears, and a key missing from either locale fails here.
 */
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import en from '../../../../i18n/locales/en.json'
import it_ from '../../../../i18n/locales/it.json'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { waitFor } from '../../support/wait-for'

function copy(bundle: unknown, key: string): string {
  const found = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle
    )

  return typeof found === 'string' ? found : `MISSING:${key}`
}

const sheet = defineComponent({
  render: () =>
    h(Sheet, { open: true }, () =>
      h(SheetContent, null, () => [
        h(SheetTitle, null, () => 'Title'),
        h(SheetDescription, null, () => 'Description'),
      ])
    ),
})

const dialog = defineComponent({
  render: () =>
    h(Dialog, { open: true }, () =>
      h(DialogContent, null, () => [
        h(DialogTitle, null, () => 'Title'),
        h(DialogDescription, null, () => 'Description'),
      ])
    ),
})

const CASES = [
  { name: 'SheetContent', component: sheet, slot: 'sheet-close' },
  { name: 'DialogContent', component: dialog, slot: 'dialog-close' },
] as const

describe.each(CASES)('$name close button', ({ component, slot }) => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function closeLabel(locale: unknown): Promise<string | null | undefined> {
    mount(component, {
      attachTo: document.body,
      global: { mocks: { $t: (key: string) => copy(locale, key) } },
    })
    await flushPromises()

    const button = await waitFor(
      () => document.body.querySelector<HTMLElement>(`[data-slot="${slot}"]`),
      'the close button to render'
    )

    return button.querySelector('.sr-only')?.textContent
  }

  it('is named in Italian in the Italian UI', async () => {
    expect(await closeLabel(it_)).toBe('Chiudi')
  })

  it('is named in English in the English UI', async () => {
    expect(await closeLabel(en)).toBe('Close')
  })
})
