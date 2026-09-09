/**
 * ImageUploadField.vue (image-upload-crop-field, design D2/D3/D7/D8).
 *
 * The ONE image upload surface in the backoffice. Both call sites — the
 * organization logo and the profile photo — go through it, which is the whole
 * point of the change: the two used to be different widgets with different
 * behaviour and no shared code.
 */
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ImageUploadField = (await import('../../../../app/components/molecules/ImageUploadField.vue'))
  .default

const TEST_ID = 'branding-logo'

function stubCanvas(blob: Blob | null = new Blob(['bytes'], { type: 'image/png' })): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback
  ) {
    callback(blob)
  } as HTMLCanvasElement['toBlob'])
}

function makeFile(name = 'logo.png', size = 1024): File {
  const file = new File(['bytes'], name, { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: size, configurable: true })
  return file
}

function mountField(props: Record<string, unknown> = {}) {
  return mount(ImageUploadField, {
    props: {
      id: 'branding-logo',
      testId: TEST_ID,
      aspect: '1:1',
      fit: 'contain',
      ...props,
    },
    attachTo: document.body,
    // Renders the PARAMS as well as the key: `imageUpload.constraints` now
    // carries `{aspect}`, and an identity mock would silently drop it — the
    // assertion that the CTA states the required shape would then pass on a
    // control that no longer says it.
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key,
      },
    },
  })
}

function inField(wrapper: ReturnType<typeof mountField>, suffix: string) {
  return wrapper.find(`[data-testid="${TEST_ID}-${suffix}"]`)
}

function inBody<T extends Element = HTMLElement>(testId: string): T | null {
  return document.body.querySelector<T>(`[data-testid="${testId}"]`)
}

/** Drive the hidden input the way a picker would. */
async function chooseFile(
  wrapper: ReturnType<typeof mountField>,
  file: File = makeFile()
): Promise<void> {
  const input = inField(wrapper, 'input').element as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

/** Load the crop dialog's image and confirm, as an operator would. */
async function confirmCrop(): Promise<void> {
  const image = inBody<HTMLImageElement>('image-crop-image')
  if (image === null) throw new Error('the crop dialog is not open')

  Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: 800, configurable: true })
  image.dispatchEvent(new Event('load'))
  await flushPromises()

  inBody<HTMLButtonElement>('image-crop-confirm')?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  )
  await flushPromises()
}

describe('ImageUploadField', () => {
  beforeEach(() => {
    stubCanvas()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  describe('the affordance', () => {
    it('is a real button, not a div with a click handler', () => {
      const wrapper = mountField()
      const dropzone = inField(wrapper, 'dropzone')

      // A button is in the tab order, fires on Enter and Space, and announces
      // as a button — three things a clickable div has to reimplement badly.
      expect(dropzone.element.tagName).toBe('BUTTON')
      expect(dropzone.attributes('type')).toBe('button')
      // Named by the caller's FieldLabel, which is `for` the hidden input:
      // without this the control that announces the error is the one with no
      // name.
      expect(dropzone.attributes('aria-labelledby')).toBe('branding-logo-label')
    })

    it('keeps the file input in the DOM, hidden but focusable', () => {
      const wrapper = mountField()
      const input = inField(wrapper, 'input')

      expect(input.exists()).toBe(true)
      // sr-only rather than display:none so it stays in the accessibility
      // tree — but OUT of the tab order, because the dropzone button is the
      // operable element and two tab stops for one affordance means focus
      // vanishing into a one-pixel control.
      expect(input.classes()).toContain('sr-only')
      expect(input.attributes('tabindex')).toBe('-1')
    })

    it('filters the picker to image formats the server actually accepts', () => {
      const wrapper = mountField()

      expect(inField(wrapper, 'input').attributes('accept')).toBe('image/png,image/jpeg')
    })

    it('states the required shape in the call to action', () => {
      const wrapper = mountField({ aspect: '16:9' })

      expect(inField(wrapper, 'dropzone').text()).toContain('16:9')
    })
  })

  describe('preview', () => {
    it('renders the persisted image when there is one', () => {
      const wrapper = mountField({ previewUrl: 'https://api.test/storage/logo.png' })

      expect(inField(wrapper, 'preview').attributes('src')).toBe(
        'https://api.test/storage/logo.png'
      )
      expect(inField(wrapper, 'empty').exists()).toBe(false)
    })

    it('renders an empty state when there is none — absent is a supported configuration', () => {
      const wrapper = mountField({ previewUrl: null })

      expect(inField(wrapper, 'empty').exists()).toBe(true)
      expect(inField(wrapper, 'preview').exists()).toBe(false)
    })

    it('falls back to the given text when the stored image FAILS to load', async () => {
      // user-self-service: "a broken or expired photo URL falls back to
      // initials". A signed URL that has expired 404s, and a bare <img> shows
      // a browser's broken-image glyph — which reads as a bug, not as an
      // absent photo.
      const wrapper = mountField({ previewUrl: 'https://api.test/expired.png', fallbackText: 'AL' })

      expect(inField(wrapper, 'fallback').exists()).toBe(false)

      await inField(wrapper, 'preview').trigger('error')

      expect(inField(wrapper, 'preview').exists()).toBe(false)
      expect(inField(wrapper, 'fallback').text()).toBe('AL')
    })

    it('retries the fallback decision when the URL changes', async () => {
      const wrapper = mountField({ previewUrl: 'https://api.test/expired.png', fallbackText: 'AL' })
      await inField(wrapper, 'preview').trigger('error')
      expect(inField(wrapper, 'fallback').exists()).toBe(true)

      // A failure latched forever would leave a freshly uploaded photo
      // invisible behind the initials of the one that expired.
      await wrapper.setProps({ previewUrl: 'https://api.test/fresh.png' })

      expect(inField(wrapper, 'preview').exists()).toBe(true)
      expect(inField(wrapper, 'fallback').exists()).toBe(false)
    })

    it('shows the neutral icon, not empty initials, when no fallback text is given', () => {
      const wrapper = mountField({ previewUrl: null })

      expect(inField(wrapper, 'empty').exists()).toBe(true)
      expect(inField(wrapper, 'fallback').exists()).toBe(false)
    })

    it('shows the cropped result immediately, before any upload', async () => {
      const wrapper = mountField({ previewUrl: null })

      await chooseFile(wrapper)
      await confirmCrop()

      expect(inField(wrapper, 'preview').attributes('src')).toBe('blob:preview')
    })
  })

  describe('choosing a file', () => {
    it('opens the crop dialog rather than accepting the raw rectangle', async () => {
      const wrapper = mountField()

      expect(inBody('image-crop-dialog')).toBeNull()
      await chooseFile(wrapper)

      expect(inBody('image-crop-dialog')).not.toBeNull()
      expect(wrapper.emitted('cropped')).toBeUndefined()
    })

    it('emits the CROPPED file on confirmation', async () => {
      const wrapper = mountField()

      await chooseFile(wrapper)
      await confirmCrop()

      const emitted = wrapper.emitted('cropped')
      expect(emitted).toHaveLength(1)
      expect(emitted?.[0]?.[0]).toBeInstanceOf(File)
    })

    it('emits nothing and closes when the crop is cancelled', async () => {
      const wrapper = mountField({ previewUrl: 'https://api.test/storage/logo.png' })

      await chooseFile(wrapper)
      inBody<HTMLButtonElement>('image-crop-cancel')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
      await flushPromises()

      expect(wrapper.emitted('cropped')).toBeUndefined()
      expect(inBody('image-crop-dialog')).toBeNull()
      expect(inField(wrapper, 'preview').attributes('src')).toBe(
        'https://api.test/storage/logo.png'
      )
    })

    it('lets the same file be chosen again after a cancel', async () => {
      const wrapper = mountField()

      await chooseFile(wrapper)
      inBody<HTMLButtonElement>('image-crop-cancel')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
      await flushPromises()

      // The input's value must be cleared on close, or re-picking the SAME
      // file fires no change event at all and the field looks dead.
      expect((inField(wrapper, 'input').element as HTMLInputElement).value).toBe('')
    })

    it('REJECTS an oversized file before opening anything, and reports why', async () => {
      const wrapper = mountField({ maxBytes: 1000 })

      await chooseFile(wrapper, makeFile('huge.png', 5000))

      // The size check belongs here, before the source is decoded into an
      // <img>: a 50MB source would be loaded and framed before anything
      // measured it. The message itself is the organism's to choose, which
      // is why this reports a REASON rather than rendering copy.
      expect(inBody('image-crop-dialog')).toBeNull()
      expect(wrapper.emitted('reject')).toEqual([['tooLarge']])
      expect(wrapper.emitted('cropped')).toBeUndefined()
    })
  })

  describe('drag and drop', () => {
    it('opens the crop dialog for a dropped image', async () => {
      const wrapper = mountField()

      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { files: [makeFile()] } })
      inField(wrapper, 'dropzone').element.dispatchEvent(event)
      await flushPromises()

      expect(inBody('image-crop-dialog')).not.toBeNull()
    })

    it('REFUSES a dropped file the picker would never have offered', async () => {
      // `accept` guards the PICKER only; a drop bypasses it entirely. Without
      // this, dropping a PDF — or an SVG, which product decision 9 refuses
      // outright — opened the dialog on an image that never loads: Apply stays
      // disabled forever and nothing says why.
      const wrapper = mountField()
      const pdf = new File(['bytes'], 'brochure.pdf', { type: 'application/pdf' })

      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { files: [pdf] } })
      inField(wrapper, 'dropzone').element.dispatchEvent(event)
      await flushPromises()

      expect(inBody('image-crop-dialog')).toBeNull()
      expect(wrapper.emitted('reject')).toEqual([['unsupportedType']])
    })

    it('ignores a drop carrying no file', async () => {
      const wrapper = mountField()

      const event = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { files: [] } })
      inField(wrapper, 'dropzone').element.dispatchEvent(event)
      await flushPromises()

      expect(inBody('image-crop-dialog')).toBeNull()
      expect(wrapper.emitted('reject')).toBeUndefined()
    })
  })

  describe('removal', () => {
    it('emits remove — a distinct event from cancelling a pick', async () => {
      const wrapper = mountField({ previewUrl: 'https://api.test/storage/logo.png' })

      await inField(wrapper, 'remove').trigger('click')

      expect(wrapper.emitted('remove')).toHaveLength(1)
      // Deleting what is stored is the organism's decision, behind its own
      // confirmation — this field never assumes it.
      expect(wrapper.emitted('cropped')).toBeUndefined()
    })

    it('offers no removal when there is nothing stored', () => {
      const wrapper = mountField({ previewUrl: null })

      expect(inField(wrapper, 'remove').exists()).toBe(false)
    })
  })

  describe('clearing the crop', () => {
    it('drops the preview when the organism says the crop is done with', async () => {
      // EXPLICIT, because watching `previewUrl` silently did nothing for an
      // organization that had no logo to begin with: null before, null after,
      // no change to observe — and cropping then removing left the deleted
      // image on screen for exactly the case product decision 9 calls a
      // permanent supported state.
      const wrapper = mountField({ previewUrl: null })

      await chooseFile(wrapper)
      await confirmCrop()
      expect(inField(wrapper, 'preview').attributes('src')).toBe('blob:preview')

      ;(wrapper.vm as unknown as { clear: () => void }).clear()
      await flushPromises()

      expect(inField(wrapper, 'preview').exists()).toBe(false)
      expect(inField(wrapper, 'empty').exists()).toBe(true)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    })

    it('falls back to the stored image, not to nothing', async () => {
      const wrapper = mountField({ previewUrl: 'https://api.test/stored.png' })

      await chooseFile(wrapper)
      await confirmCrop()
      ;(wrapper.vm as unknown as { clear: () => void }).clear()
      await flushPromises()

      expect(inField(wrapper, 'preview').attributes('src')).toBe('https://api.test/stored.png')
    })
  })

  describe('object URLs', () => {
    it('revokes the previous preview URL when a new crop replaces it', async () => {
      const wrapper = mountField()

      await chooseFile(wrapper)
      await confirmCrop()
      await chooseFile(wrapper, makeFile('second.png'))
      await confirmCrop()

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    })

    it('revokes on unmount, so a decoded bitmap is not pinned for the document lifetime', async () => {
      const wrapper = mountField()

      await chooseFile(wrapper)
      await confirmCrop()
      wrapper.unmount()

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    })
  })

  describe('invalid and disabled state', () => {
    it('passes the parent-owned error wiring through to the control (§16.4)', () => {
      const wrapper = mountField({ invalid: true, describedBy: 'branding-logo-error' })

      const dropzone = inField(wrapper, 'dropzone')
      expect(dropzone.attributes('aria-invalid')).toBe('true')
      expect(dropzone.attributes('aria-describedby')).toBe('branding-logo-error')
    })

    it('disables the affordance when the form is busy', () => {
      const wrapper = mountField({ disabled: true, previewUrl: 'https://api.test/logo.png' })

      expect((inField(wrapper, 'dropzone').element as HTMLButtonElement).disabled).toBe(true)
      expect((inField(wrapper, 'remove').element as HTMLButtonElement).disabled).toBe(true)
    })
  })
})
