/**
 * TemplatePortability.vue — export / import controls (C14).
 *
 * The role check here is AFFORDANCE, not enforcement: the server refuses a
 * non-admin regardless. What this pins is that a non-admin never sees the
 * controls at all — a button that appears and then 403s teaches the operator
 * that the product is broken rather than that they lack the right.
 *
 * Import (dates-and-destructive-actions, design.md D8): the file is fully
 * parsed BEFORE any network call, so the confirmation can name what is about
 * to be imported — count plus names — rather than asking for blind consent.
 * `onImport` splits into `onFileChosen` (parse only, never reaches a dialog
 * on failure) and `onImportConfirmed` (the existing POST/banner/emit).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { confirmDialog } from '../../support/confirm'

const exportMock = vi.fn()
const importMock = vi.fn()

vi.mock('../../../../app/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ exportTemplates: exportMock, importTemplates: importMock }),
}))

const TemplatePortability = (
  await import('../../../../app/components/organisms/TemplatePortability.vue')
).default

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

// setup.ts's global useI18n stub discards params (`t: (key) => key`), which
// hides the whole point of the import preview (it must show real names).
// Re-stubbed here with a `t` that echoes params, matching
// avatar-templates-page.spec.ts's convention.
vi.stubGlobal(
  'useI18n',
  vi.fn(() => ({ t: tMock, te: () => true, locale: ref('it') }))
)

function mountIt(isAdmin: boolean) {
  return mount(TemplatePortability, {
    props: { isAdmin },
    global: { mocks: { $t: tMock } },
    attachTo: document.body,
  })
}

function jsonFile(document_: unknown, name = 'x.json'): File {
  return new File([JSON.stringify(document_)], name, { type: 'application/json' })
}

async function chooseFile(wrapper: ReturnType<typeof mountIt>, file: File): Promise<void> {
  const input = wrapper.get('[data-testid="template-import-input"]')
  Object.defineProperty(input.element, 'files', { value: [file] })
  await input.trigger('change')
  await flushPromises()
}

describe('TemplatePortability', () => {
  beforeEach(() => {
    exportMock.mockReset().mockResolvedValue({ schema: 'beai.avatar-template/1', templates: [] })
    importMock.mockReset().mockResolvedValue({ data: [{ id: 1, name: 'X', provider: 'heygen' }] })
  })

  // ConfirmDialog renders through reka-ui's AlertDialog, which teleports to
  // document.body — wrapper.find() never matches it (task 4.5).
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing at all for a non-admin', () => {
    const wrapper = mountIt(false)

    expect(wrapper.find('[data-testid="template-portability"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="template-export"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="template-import"]').exists()).toBe(false)
  })

  it('renders both controls for an admin', () => {
    const wrapper = mountIt(true)

    expect(wrapper.find('[data-testid="template-export"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-import"]').exists()).toBe(true)
  })

  it('parses the file and shows a preview, but does not send until confirmed', async () => {
    const wrapper = mountIt(true)

    await chooseFile(
      wrapper,
      jsonFile({ schema: 'beai.avatar-template/1', templates: [{ name: 'A' }, { name: 'B' }] })
    )

    // The point of the change: selecting a file parses it and shows what is
    // about to be imported, but sends nothing yet.
    expect(importMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).not.toBeNull()
  })

  it('reports how many templates an import created, once confirmed', async () => {
    importMock.mockResolvedValue({
      data: [
        { id: 1, name: 'A', provider: 'heygen' },
        { id: 2, name: 'B', provider: 'tavus' },
      ],
    })

    const wrapper = mountIt(true)

    await chooseFile(
      wrapper,
      jsonFile({ schema: 'beai.avatar-template/1', templates: [{ name: 'A' }, { name: 'B' }] })
    )
    await confirmDialog('confirm')

    expect(importMock).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="portability-result"]').text()).toContain(
      'avatar_templates.portability.importDone'
    )
  })

  it('cancelling leaves the picker and list untouched, and sends nothing', async () => {
    const wrapper = mountIt(true)

    await chooseFile(
      wrapper,
      jsonFile({ schema: 'beai.avatar-template/1', templates: [{ name: 'A' }] })
    )
    await confirmDialog('cancel')

    expect(importMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="portability-result"]').exists()).toBe(false)
    // The picker is cleared so re-choosing the SAME file still fires `change`.
    const input = wrapper.get('[data-testid="template-import-input"]').element as HTMLInputElement
    expect(input.value).toBe('')
  })

  // "unknown key voiceSpeedd" is actionable; "import failed" is not.
  it('surfaces the server reason when a confirmed import is refused', async () => {
    importMock.mockRejectedValue({
      data: { errors: { 'templates.0': ['Unknown configuration key(s): inventedKnob.'] } },
    })

    const wrapper = mountIt(true)

    await chooseFile(
      wrapper,
      jsonFile({ schema: 'beai.avatar-template/1', templates: [{ name: 'A' }] })
    )
    await confirmDialog('confirm')

    expect(wrapper.get('[data-testid="portability-result"]').text()).toContain(
      'avatar_templates.portability.importFailed'
    )
  })

  it('never calls import when the file is not chosen', async () => {
    const wrapper = mountIt(true)
    const input = wrapper.get('[data-testid="template-import-input"]')
    Object.defineProperty(input.element, 'files', { value: [] })
    await input.trigger('change')
    await flushPromises()

    expect(importMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).toBeNull()
  })

  // A parse/shape failure is reported through the existing banner — it never
  // reaches a dialog, so a broken upload is never disguised as a scary
  // confirmation (design.md D8).
  it('a file that fails to parse as JSON never opens a dialog, only the banner', async () => {
    const wrapper = mountIt(true)
    const file = new File(['not json'], 'x.json', { type: 'application/json' })

    await chooseFile(wrapper, file)

    expect(importMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).toBeNull()
    expect(wrapper.find('[data-testid="portability-result"]').exists()).toBe(true)
  })

  it('a file whose templates field is not an array never opens a dialog, only the banner', async () => {
    const wrapper = mountIt(true)

    await chooseFile(wrapper, jsonFile({ schema: 'beai.avatar-template/1', templates: 'nope' }))

    expect(importMock).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-testid="confirm-dialog-confirm"]')).toBeNull()
    expect(wrapper.find('[data-testid="portability-result"]').exists()).toBe(true)
  })

  it('previews every name when 10 or fewer templates are present', async () => {
    const wrapper = mountIt(true)
    const names = Array.from({ length: 10 }, (_, i) => `Template ${i + 1}`)

    await chooseFile(
      wrapper,
      jsonFile({
        schema: 'beai.avatar-template/1',
        templates: names.map((name) => ({ name })),
      })
    )

    const description = document.body
      .querySelector('[data-testid="confirm-dialog-confirm"]')
      ?.closest('[role="alertdialog"]')?.textContent

    for (const name of names) {
      expect(description).toContain(name)
    }
    expect(description).not.toContain('more')
  })

  it('previews the first 10 names and a "+N more" for the rest, beyond 10 templates', async () => {
    const wrapper = mountIt(true)
    const names = Array.from({ length: 13 }, (_, i) => `Template ${i + 1}`)

    await chooseFile(
      wrapper,
      jsonFile({
        schema: 'beai.avatar-template/1',
        templates: names.map((name) => ({ name })),
      })
    )

    const description = document.body
      .querySelector('[data-testid="confirm-dialog-confirm"]')
      ?.closest('[role="alertdialog"]')?.textContent

    expect(description).toContain('Template 1')
    expect(description).toContain('Template 10')
    expect(description).not.toContain('Template 11')
    expect(description).toContain('avatar_templates.confirm.importMore')
  })

  describe('export', () => {
    let click: ReturnType<typeof vi.fn>
    let createObjectURL: ReturnType<typeof vi.fn>
    let revokeObjectURL: ReturnType<typeof vi.fn>
    let blobs: Blob[]
    let download: string | undefined
    let originalUrlApi: { create: typeof URL.createObjectURL; revoke: typeof URL.revokeObjectURL }

    beforeEach(() => {
      click = vi.fn(function (this: HTMLAnchorElement) {
        download = this.download
      })
      blobs = []
      download = undefined
      createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob)
        return 'blob:fake'
      })
      revokeObjectURL = vi.fn()
      originalUrlApi = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
      URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
      URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
    })

    afterEach(() => {
      URL.createObjectURL = originalUrlApi.create
      URL.revokeObjectURL = originalUrlApi.revoke
      vi.restoreAllMocks()
    })

    it('downloads the exported document as pretty-printed JSON under a stable filename', async () => {
      const exported = { schema: 'beai.avatar-template/1', templates: [{ name: 'A' }] }
      exportMock.mockResolvedValue(exported)
      const wrapper = mountIt(true)

      await wrapper.get('[data-testid="template-export"]').trigger('click')
      await flushPromises()

      expect(click).toHaveBeenCalledOnce()
      expect(download).toBe('beai-avatar-templates.json')
      expect(blobs[0]!.type).toBe('application/json')
      expect(await blobs[0]!.text()).toBe(JSON.stringify(exported, null, 2))
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
      expect(wrapper.find('[data-testid="portability-result"]').exists()).toBe(false)
    })

    it('reports a failed export and offers no download', async () => {
      exportMock.mockRejectedValue(new Error('network'))
      const wrapper = mountIt(true)

      await wrapper.get('[data-testid="template-export"]').trigger('click')
      await flushPromises()

      expect(click).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="portability-result"]').text()).toContain(
        'avatar_templates.portability.importFailed'
      )
    })
  })

  it('disables import and points at the acting-client notice while blocked, but keeps export', () => {
    const wrapper = mount(TemplatePortability, {
      props: { isAdmin: true, importBlocked: true },
      global: { mocks: { $t: tMock } },
    })

    const button = wrapper.get('[data-testid="template-import"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-describedby')).toBeTruthy()
    expect(wrapper.get('[data-testid="template-export"]').attributes('disabled')).toBeUndefined()
  })

  it('does not point at the notice when import is available', () => {
    const wrapper = mountIt(true)

    expect(
      wrapper.get('[data-testid="template-import"]').attributes('aria-describedby')
    ).toBeUndefined()
  })

  it('falls back to a positional label for a template without a usable name', async () => {
    const wrapper = mountIt(true)

    await chooseFile(wrapper, jsonFile({ templates: [{ name: 'A' }, { name: '' }, {}, null] }))

    const body = document.body.textContent ?? ''
    expect(body).toContain('A, #2, #3, #4')
  })

  it('translates a machine code from the server instead of showing it raw', async () => {
    importMock.mockRejectedValue({ data: { message: 'organization_context_required' } })
    const wrapper = mountIt(true)

    await chooseFile(wrapper, jsonFile({ templates: [{ name: 'A' }] }))
    await confirmDialog('confirm')

    expect(wrapper.get('[data-testid="portability-result"]').text()).toContain(
      'avatar_templates.serverError.organization_context_required'
    )
  })

  it('joins every field error into the reason when the server sends a validation map', async () => {
    importMock.mockRejectedValue({
      data: {
        message: 'The given data was invalid.',
        errors: { 'templates.0': ['Unknown key a.'], 'templates.1': ['Unknown key b.'] },
      },
    })
    const wrapper = mountIt(true)

    await chooseFile(wrapper, jsonFile({ templates: [{ name: 'A' }, { name: 'B' }] }))
    await confirmDialog('confirm')

    expect(wrapper.get('[data-testid="portability-result"]').text()).toContain(
      'Unknown key a. Unknown key b.'
    )
  })

  it('falls back to the error message when there is neither a code nor a field map', async () => {
    importMock.mockRejectedValue(new Error('socket hang up'))
    const wrapper = mountIt(true)

    await chooseFile(wrapper, jsonFile({ templates: [{ name: 'A' }] }))
    await confirmDialog('confirm')

    expect(wrapper.get('[data-testid="portability-result"]').text()).toContain('socket hang up')
  })

  it('emits imported after a successful import so the list can refresh', async () => {
    const wrapper = mountIt(true)

    await chooseFile(wrapper, jsonFile({ templates: [{ name: 'A' }] }))
    await confirmDialog('confirm')

    expect(wrapper.emitted('imported')).toHaveLength(1)
  })
})
