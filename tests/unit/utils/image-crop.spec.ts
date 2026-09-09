import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  aspectRatio,
  baseScale,
  clampOffset,
  exportCrop,
  outputMimeType,
  outputSize,
  resolveTransform,
  sourceRect,
} from '@/utils/image-crop'

describe('aspectRatio', () => {
  it('parses every supported ratio as width over height', () => {
    expect(aspectRatio('1:1')).toBe(1)
    expect(aspectRatio('4:3')).toBeCloseTo(4 / 3)
    expect(aspectRatio('16:9')).toBeCloseTo(16 / 9)
    expect(aspectRatio('3:2')).toBeCloseTo(1.5)
  })
})

describe('baseScale', () => {
  const frame = { width: 300, height: 300 }

  it('under cover, takes the LARGER of the two scales so the frame is filled', () => {
    // A 600x200 image in a 300x300 frame: width needs 0.5, height needs 1.5.
    // Cover must pick 1.5 — at 0.5 the frame would show empty bands.
    expect(baseScale({ width: 600, height: 200 }, frame, 'cover')).toBeCloseTo(1.5)
  })

  it('under contain, takes the SMALLER so the whole image fits', () => {
    expect(baseScale({ width: 600, height: 200 }, frame, 'contain')).toBeCloseTo(0.5)
  })

  it('agrees with itself when the image already matches the frame ratio', () => {
    const square = { width: 900, height: 900 }
    expect(baseScale(square, frame, 'cover')).toBeCloseTo(baseScale(square, frame, 'contain'))
  })
})

describe('clampOffset', () => {
  it('bounds panning to the overhang when the image is WIDER than the frame', () => {
    // 500 displayed in a 300 frame: 200 of overhang, 100 to either side.
    expect(clampOffset(0, 500, 300)).toBe(0)
    expect(clampOffset(60, 500, 300)).toBe(60)
    expect(clampOffset(999, 500, 300)).toBe(100)
    expect(clampOffset(-999, 500, 300)).toBe(-100)
  })

  it('pins to centre when the image is NARROWER than the frame', () => {
    // Reachable under contain at zoom 1. The cover clamp would compute a
    // NEGATIVE bound here and let the image drift out of the frame entirely.
    expect(clampOffset(0, 200, 300)).toBe(0)
    expect(clampOffset(80, 200, 300)).toBe(0)
    expect(clampOffset(-80, 200, 300)).toBe(0)
  })

  it('pins to centre on an exact fit rather than allowing a one-pixel drift', () => {
    expect(clampOffset(25, 300, 300)).toBe(0)
  })
})

describe('resolveTransform', () => {
  const frame = { width: 300, height: 300 }
  const natural = { width: 600, height: 200 }

  it('multiplies the base scale by the zoom', () => {
    const t = resolveTransform({ natural, frame, fit: 'contain', zoom: 2, offsetX: 0, offsetY: 0 })

    expect(t.scale).toBeCloseTo(1)
    expect(t.displayWidth).toBeCloseTo(600)
    expect(t.displayHeight).toBeCloseTo(200)
  })

  it('returns CLAMPED offsets, never the raw ones', () => {
    const t = resolveTransform({
      natural,
      frame,
      fit: 'contain',
      zoom: 2,
      offsetX: 9999,
      offsetY: 9999,
    })

    // 600 wide against a 300 frame -> 150 of play. 200 tall against 300 -> none.
    expect(t.offsetX).toBe(150)
    expect(t.offsetY).toBe(0)
  })

  it('clamps the zoom into the supported range', () => {
    const low = resolveTransform({ natural, frame, fit: 'cover', zoom: -5, offsetX: 0, offsetY: 0 })
    const high = resolveTransform({
      natural,
      frame,
      fit: 'cover',
      zoom: 99,
      offsetX: 0,
      offsetY: 0,
    })

    expect(low.scale).toBeCloseTo(baseScale(natural, frame, 'cover') * MIN_ZOOM)
    expect(high.scale).toBeCloseTo(baseScale(natural, frame, 'cover') * MAX_ZOOM)
  })
})

describe('sourceRect', () => {
  const frame = { width: 300, height: 300 }

  it('maps the whole image when contain sits at zoom 1 on a square source', () => {
    const natural = { width: 900, height: 900 }
    const transform = resolveTransform({
      natural,
      frame,
      fit: 'contain',
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    })

    const rect = sourceRect(transform, frame)

    // toBeCloseTo, not toEqual: negating a zero offset yields -0, which is
    // arithmetically the same origin and structurally a different value.
    expect(rect.sx).toBeCloseTo(0)
    expect(rect.sy).toBeCloseTo(0)
    expect(rect.sw).toBeCloseTo(900)
    expect(rect.sh).toBeCloseTo(900)
  })

  it('selects the centre band when cover crops a wide source', () => {
    // 600x200 covering a 300x300 frame scales by 1.5 -> 900x300 displayed.
    // The frame therefore sees 200 natural px of width, centred: x from 200 to 400.
    const natural = { width: 600, height: 200 }
    const transform = resolveTransform({
      natural,
      frame,
      fit: 'cover',
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    })

    const rect = sourceRect(transform, frame)

    expect(rect.sx).toBeCloseTo(200)
    expect(rect.sy).toBeCloseTo(0)
    expect(rect.sw).toBeCloseTo(200)
    expect(rect.sh).toBeCloseTo(200)
  })

  it('produces a source rect that starts OUTSIDE the image under contain padding', () => {
    // The padding case: the frame is larger than the image, so the rect the
    // canvas is asked to read begins at a negative coordinate. drawImage clips
    // it, and the uncovered area stays transparent — which IS the padding.
    const natural = { width: 600, height: 200 }
    const transform = resolveTransform({
      natural,
      frame,
      fit: 'contain',
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    })

    expect(sourceRect(transform, frame).sy).toBeLessThan(0)
  })

  it('shifts the source rect against the pan direction', () => {
    const natural = { width: 900, height: 900 }
    const centred = resolveTransform({
      natural,
      frame,
      fit: 'cover',
      zoom: 2,
      offsetX: 0,
      offsetY: 0,
    })
    const panned = resolveTransform({
      natural,
      frame,
      fit: 'cover',
      zoom: 2,
      offsetX: 30,
      offsetY: 0,
    })

    // Dragging the image right reveals what was to its LEFT.
    expect(sourceRect(panned, frame).sx).toBeLessThan(sourceRect(centred, frame).sx)
  })
})

describe('outputSize', () => {
  it('derives the height from the aspect', () => {
    expect(outputSize('1:1', 512)).toEqual({ width: 512, height: 512 })
    expect(outputSize('16:9', 512)).toEqual({ width: 512, height: 288 })
    expect(outputSize('4:3', 512)).toEqual({ width: 512, height: 384 })
  })

  it('rounds to whole pixels — a fractional canvas dimension is silently floored', () => {
    const size = outputSize('3:2', 501)

    expect(Number.isInteger(size.height)).toBe(true)
  })
})

describe('outputMimeType', () => {
  it('keeps PNG under contain, because padding means transparency', () => {
    expect(outputMimeType('contain')).toBe('image/png')
  })

  it('uses JPEG under cover, where the frame is filled and nothing is transparent', () => {
    expect(outputMimeType('cover')).toBe('image/jpeg')
  })
})

describe('exportCrop', () => {
  const frame = { width: 300, height: 300 }
  const natural = { width: 600, height: 600 }

  function stubCanvas(blob: Blob | null): { drawImage: ReturnType<typeof vi.fn> } {
    const drawImage = vi.fn()

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback
    ) {
      callback(blob)
    } as HTMLCanvasElement['toBlob'])

    return { drawImage }
  }

  const options = {
    image: { naturalWidth: 600, naturalHeight: 600 } as HTMLImageElement,
    natural,
    frame,
    aspect: '1:1' as const,
    fit: 'cover' as const,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    outputWidth: 256,
    fileName: 'logo',
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a File named for the encoding it actually produced', async () => {
    stubCanvas(new Blob(['x'], { type: 'image/jpeg' }))

    const file = await exportCrop(options)

    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toBe('logo.jpg')
  })

  it('names a contain crop .png, matching its PNG encoding', async () => {
    stubCanvas(new Blob(['x'], { type: 'image/png' }))

    const file = await exportCrop({ ...options, fit: 'contain' })

    expect(file.name).toBe('logo.png')
    expect(file.type).toBe('image/png')
  })

  it('draws the computed source rect into the full output box', async () => {
    const { drawImage } = stubCanvas(new Blob(['x'], { type: 'image/jpeg' }))

    await exportCrop(options)

    expect(drawImage).toHaveBeenCalledTimes(1)
    const args = drawImage.mock.calls[0]
    expect(args?.[5]).toBe(0)
    expect(args?.[6]).toBe(0)
    expect(args?.[7]).toBe(256)
    expect(args?.[8]).toBe(256)
  })

  it('REJECTS when the encoder yields null rather than resolving a null file', async () => {
    // toBlob hands back null on a tainted canvas or an encoder failure.
    // Resolving it would push `File | null` through every caller to model
    // what is simply an error.
    stubCanvas(null)

    await expect(exportCrop(options)).rejects.toThrow()
  })

  it('rejects when the canvas gives no 2d context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await expect(exportCrop(options)).rejects.toThrow()
  })
})
