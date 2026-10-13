/**
 * ImageCropDialog.vue (image-upload-crop-field, design D4/D8).
 *
 * Renders through reka-ui's `Dialog`, which portals to `document.body`, so
 * every assertion below queries the body rather than the wrapper's own
 * subtree — the same teleport-aware pattern as `ConfirmDialog`/`FormDrawer`.
 *
 * The real `image-crop` utilities run here; only the canvas is stubbed. That
 * keeps the geometry under test rather than replacing it with a mock that
 * would agree with any implementation.
 */
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ImageCropDialog = (await import('../../../../app/components/molecules/ImageCropDialog.vue'))
  .default

function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback
  ) {
    callback(new Blob(['bytes'], { type: 'image/jpeg' }))
  } as HTMLCanvasElement['toBlob'])
}

function makeFile(name = 'source.png'): File {
  return new File(['bytes'], name, { type: 'image/png' })
}

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ImageCropDialog, {
    props: {
      open: true,
      file: makeFile(),
      aspect: '1:1',
      fit: 'cover',
      shape: 'square',
      outputWidth: 256,
      title: 'crop.title',
      description: 'crop.description',
      ...props,
    },
    attachTo: document.body,
    global: { mocks: { $t: (key: string) => key } },
  })
}

function body<T extends Element = HTMLElement>(testId: string): T {
  const element = document.body.querySelector<T>(`[data-testid="${testId}"]`)
  if (element === null) throw new Error(`missing element: ${testId}`)
  return element
}

/** The image only reports dimensions once it has loaded; happy-dom never loads one. */
async function loadImage(width = 800, height = 400): Promise<void> {
  const image = body<HTMLImageElement>('image-crop-image')
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true })
  image.dispatchEvent(new Event('load'))
  await flushPromises()
}

describe('ImageCropDialog', () => {
  beforeEach(() => {
    stubCanvas()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('portals its content out of the mounting subtree', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.find('[data-testid="image-crop-frame"]').exists()).toBe(false)
    expect(document.body.querySelector('[data-testid="image-crop-frame"]')).not.toBeNull()
  })

  it('renders the frame at the requested aspect', async () => {
    mountDialog({ aspect: '16:9' })
    await flushPromises()

    expect(body('image-crop-frame').getAttribute('data-aspect')).toBe('16:9')
  })

  it('marks the mask circular for an avatar and square for a logo', async () => {
    mountDialog({ shape: 'circle' })
    await flushPromises()
    expect(body('image-crop-mask').getAttribute('data-shape')).toBe('circle')

    document.body.innerHTML = ''
    mountDialog({ shape: 'square' })
    await flushPromises()
    expect(body('image-crop-mask').getAttribute('data-shape')).toBe('square')
  })

  it('exposes zoom as a labelled native range input', async () => {
    mountDialog()
    await flushPromises()

    const zoom = body<HTMLInputElement>('image-crop-zoom')

    expect(zoom.tagName).toBe('INPUT')
    expect(zoom.type).toBe('range')
    // A range input with no accessible name is a slider a screen reader
    // announces as nothing at all.
    expect(
      zoom.getAttribute('aria-label') ??
        document.body.querySelector(`label[for="${zoom.id}"]`)?.textContent
    ).toBeTruthy()
  })

  it('keeps confirm unavailable until the image has reported its dimensions', async () => {
    mountDialog()
    await flushPromises()

    expect(body<HTMLButtonElement>('image-crop-confirm').disabled).toBe(true)

    await loadImage()

    expect(body<HTMLButtonElement>('image-crop-confirm').disabled).toBe(false)
  })

  it('emits cancel — and never confirm — when dismissed', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await loadImage()

    body<HTMLButtonElement>('image-crop-cancel').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    await flushPromises()

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits confirm with the cropped File', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await loadImage()

    body<HTMLButtonElement>('image-crop-confirm').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    await flushPromises()

    const emitted = wrapper.emitted('confirm')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]?.[0]).toBeInstanceOf(File)
  })

  it('surfaces an error instead of emitting when the encoder fails', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback
    ) {
      callback(null)
    } as HTMLCanvasElement['toBlob'])

    const wrapper = mountDialog()
    await flushPromises()
    await loadImage()

    body<HTMLButtonElement>('image-crop-confirm').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    await flushPromises()

    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(document.body.querySelector('[data-testid="image-crop-error"]')).not.toBeNull()
  })

  describe('keyboard operation (D8)', () => {
    it('pans on the arrow keys', async () => {
      mountDialog()
      await flushPromises()
      await loadImage()

      const frame = body('image-crop-frame')
      const before = Number(frame.getAttribute('data-offset-x'))

      frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
      await flushPromises()

      expect(Number(body('image-crop-frame').getAttribute('data-offset-x'))).toBeLessThan(before)
    })

    it('zooms on + and -', async () => {
      mountDialog()
      await flushPromises()
      await loadImage()

      const frame = body('image-crop-frame')
      frame.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
      await flushPromises()

      const zoomed = Number(body('image-crop-frame').getAttribute('data-zoom'))
      expect(zoomed).toBeGreaterThan(1)

      body('image-crop-frame').dispatchEvent(
        new KeyboardEvent('keydown', { key: '-', bubbles: true })
      )
      await flushPromises()

      expect(Number(body('image-crop-frame').getAttribute('data-zoom'))).toBeLessThan(zoomed)
    })

    it('refuses to pan past the clamp, so the frame can never show a gap', async () => {
      mountDialog()
      await flushPromises()
      // 800x400 under cover in a square frame: no vertical play at all.
      await loadImage(800, 400)

      const frame = body('image-crop-frame')
      for (let i = 0; i < 50; i += 1) {
        frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      }
      await flushPromises()

      expect(Number(body('image-crop-frame').getAttribute('data-offset-y'))).toBe(0)
    })
  })

  it('resets framing when a different file is handed in', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await loadImage()

    body('image-crop-frame').dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', bubbles: true })
    )
    await flushPromises()
    expect(Number(body('image-crop-frame').getAttribute('data-zoom'))).toBeGreaterThan(1)

    await wrapper.setProps({ file: makeFile('other.png') })
    await flushPromises()

    // Carrying the previous zoom into a new image would frame it by accident.
    expect(Number(body('image-crop-frame').getAttribute('data-zoom'))).toBe(1)
  })

  it('revokes the object URL it created when the file is replaced', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.setProps({ file: makeFile('other.png') })
    await flushPromises()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source')
  })

  describe('pointer and wheel operation', () => {
    const pointer = (type: string, clientX: number, clientY = 0) =>
      new PointerEvent(type, { clientX, clientY, pointerId: 1, bubbles: true })

    it('drags the image by the pointer delta and stops following once released', async () => {
      mountDialog()
      await flushPromises()
      // 800x400 cover in a 360 square: 720 wide, so +/-180 of horizontal play.
      await loadImage(800, 400)
      const frame = body('image-crop-frame')

      frame.dispatchEvent(pointer('pointerdown', 100))
      await flushPromises()
      expect(frame.className).toContain('cursor-grabbing')

      frame.dispatchEvent(pointer('pointermove', 160))
      await flushPromises()
      expect(Number(frame.getAttribute('data-offset-x'))).toBe(60)

      frame.dispatchEvent(pointer('pointerup', 160))
      await flushPromises()
      expect(frame.className).toContain('cursor-grab')
      expect(frame.className).not.toContain('cursor-grabbing')

      frame.dispatchEvent(pointer('pointermove', 20))
      await flushPromises()
      expect(Number(frame.getAttribute('data-offset-x'))).toBe(60)
    })

    it('clamps a drag that overshoots, so the frame never shows a gap', async () => {
      mountDialog()
      await flushPromises()
      await loadImage(800, 400)
      const frame = body('image-crop-frame')

      frame.dispatchEvent(pointer('pointerdown', 0))
      frame.dispatchEvent(pointer('pointermove', 5000))
      await flushPromises()

      expect(Number(frame.getAttribute('data-offset-x'))).toBe(180)
    })

    it('ignores a pointermove that was never preceded by a pointerdown', async () => {
      mountDialog()
      await flushPromises()
      await loadImage(800, 400)
      const frame = body('image-crop-frame')

      frame.dispatchEvent(pointer('pointermove', 90))
      frame.dispatchEvent(pointer('pointerup', 90))
      await flushPromises()

      expect(Number(frame.getAttribute('data-offset-x'))).toBe(0)
    })

    it('does not start a drag before the image has reported its size', async () => {
      mountDialog()
      await flushPromises()
      const frame = body('image-crop-frame')

      frame.dispatchEvent(pointer('pointerdown', 0))
      frame.dispatchEvent(pointer('pointermove', 80))
      await flushPromises()

      expect(frame.className).not.toContain('cursor-grabbing')
      expect(Number(frame.getAttribute('data-offset-x'))).toBe(0)
    })

    it('zooms with the wheel (up zooms in) and never beyond the bounds', async () => {
      mountDialog()
      await flushPromises()
      await loadImage()
      const frame = body('image-crop-frame')

      frame.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true })
      )
      await flushPromises()
      const zoomedIn = Number(frame.getAttribute('data-zoom'))
      expect(zoomedIn).toBeGreaterThan(1)

      frame.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -1e6, bubbles: true, cancelable: true })
      )
      await flushPromises()
      const max = Number(frame.getAttribute('data-zoom'))
      expect(max).toBeGreaterThanOrEqual(zoomedIn)

      frame.dispatchEvent(new WheelEvent('wheel', { deltaY: 1e7, bubbles: true, cancelable: true }))
      await flushPromises()
      expect(Number(frame.getAttribute('data-zoom'))).toBeLessThan(max)
      expect(Number(frame.getAttribute('data-zoom'))).toBeGreaterThan(0)
    })

    it('prevents the page from scrolling under a wheel gesture on the frame', async () => {
      mountDialog()
      await flushPromises()
      await loadImage()

      const event = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true })
      body('image-crop-frame').dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    })

    it('follows the zoom slider', async () => {
      mountDialog()
      await flushPromises()
      await loadImage()
      const slider = body<HTMLInputElement>('image-crop-zoom')

      slider.value = '2'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()

      expect(Number(body('image-crop-frame').getAttribute('data-zoom'))).toBe(2)
    })

    it('shrinking the zoom re-clamps the offsets so the image cannot slide off the frame', async () => {
      mountDialog()
      await flushPromises()
      await loadImage(800, 400)
      const frame = body('image-crop-frame')
      const slider = body<HTMLInputElement>('image-crop-zoom')

      slider.value = '3'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      frame.dispatchEvent(pointer('pointerdown', 0))
      frame.dispatchEvent(pointer('pointermove', 5000))
      frame.dispatchEvent(pointer('pointerup', 5000))
      await flushPromises()
      const wide = Number(frame.getAttribute('data-offset-x'))
      expect(wide).toBeGreaterThan(180)

      slider.value = '1'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()

      expect(Number(frame.getAttribute('data-offset-x'))).toBe(180)
    })
  })

  it('treats Escape as a cancel, exactly once', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    body('image-crop-dialog').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    await flushPromises()

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('does not export before the image has loaded', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    body<HTMLButtonElement>('image-crop-confirm').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    await flushPromises()

    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
