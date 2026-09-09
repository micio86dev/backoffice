/**
 * Crop geometry and canvas export for `ImageUploadField` / `ImageCropDialog`
 * (image-upload-crop-field, design D1/D4/D5/D6).
 *
 * Everything here is arithmetic over numbers plus one canvas call. It lives
 * outside the components on purpose: the clamping rule below was written
 * wrong twice, and a named function with its own tests is the only version of
 * it that stays correct.
 */

/** Supported frame ratios. A string union, not a float — see design D2. */
export type CropAspect = '1:1' | '4:3' | '16:9' | '3:2'

/**
 * `cover` fills the frame and crops the overhang (a face photo).
 * `contain` fits the whole image inside the frame and pads (a wordmark).
 */
export type CropFit = 'cover' | 'contain'

export interface Size {
  width: number
  height: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

const RATIOS: Record<CropAspect, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '3:2': 3 / 2,
}

/** Width over height. */
export function aspectRatio(aspect: CropAspect): number {
  return RATIOS[aspect]
}

/**
 * The scale at zoom 1 — the whole difference between the two fit modes.
 *
 * `cover` takes the larger of the two axis scales so neither axis leaves a
 * gap; `contain` takes the smaller so neither axis overflows.
 */
export function baseScale(natural: Size, frame: Size, fit: CropFit): number {
  const byWidth = frame.width / natural.width
  const byHeight = frame.height / natural.height

  return fit === 'cover' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight)
}

/**
 * Bound a pan offset on one axis.
 *
 * Two branches, and BOTH are load-bearing. When the displayed image overhangs
 * the frame, panning is allowed up to half that overhang on either side —
 * further would expose an uncovered edge. When it does NOT overhang (only
 * reachable under `contain`), the image is pinned to centre: the overhang
 * expression goes negative there, and using it as a bound lets the image
 * wander out of the frame entirely.
 */
export function clampOffset(offset: number, displaySize: number, frameSize: number): number {
  const overhang = (displaySize - frameSize) / 2

  if (overhang <= 0) return 0

  return Math.min(Math.max(offset, -overhang), overhang)
}

export interface TransformInput {
  natural: Size
  frame: Size
  fit: CropFit
  zoom: number
  offsetX: number
  offsetY: number
}

export interface CropTransform {
  scale: number
  displayWidth: number
  displayHeight: number
  offsetX: number
  offsetY: number
}

/**
 * Resolve zoom + raw offsets into the geometry the frame actually renders.
 *
 * The offsets come back CLAMPED. Callers store what this returns rather than
 * what the pointer produced, so a drag that runs past the edge settles at the
 * edge instead of accumulating an offset that snaps back on the next frame.
 */
export function resolveTransform(input: TransformInput): CropTransform {
  const zoom = Math.min(Math.max(input.zoom, MIN_ZOOM), MAX_ZOOM)
  const scale = baseScale(input.natural, input.frame, input.fit) * zoom

  const displayWidth = input.natural.width * scale
  const displayHeight = input.natural.height * scale

  return {
    scale,
    displayWidth,
    displayHeight,
    offsetX: clampOffset(input.offsetX, displayWidth, input.frame.width),
    offsetY: clampOffset(input.offsetY, displayHeight, input.frame.height),
  }
}

export interface SourceRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * The frame expressed in the image's own pixel coordinates — the rectangle
 * `drawImage` reads from.
 *
 * Under `contain` this rect can start at a negative coordinate or run past the
 * image. That is not a bug to guard against: `drawImage` clips it, and the
 * area left untouched stays transparent, which is exactly the padding.
 */
export function sourceRect(transform: CropTransform, frame: Size): SourceRect {
  const x0 = (frame.width - transform.displayWidth) / 2 + transform.offsetX
  const y0 = (frame.height - transform.displayHeight) / 2 + transform.offsetY

  return {
    sx: -x0 / transform.scale,
    sy: -y0 / transform.scale,
    sw: frame.width / transform.scale,
    sh: frame.height / transform.scale,
  }
}

/** The exported bitmap's dimensions. Rounded — a fractional canvas size floors silently. */
export function outputSize(aspect: CropAspect, outputWidth: number): Size {
  return {
    width: Math.round(outputWidth),
    height: Math.round(outputWidth / aspectRatio(aspect)),
  }
}

/**
 * PNG under `contain`, JPEG under `cover` (design D5).
 *
 * Not a separate prop: `contain` is the mode that pads, padding is the only
 * source of transparency here, and transparency is the only reason to pay
 * PNG's size for a photograph.
 */
export function outputMimeType(fit: CropFit): 'image/png' | 'image/jpeg' {
  return fit === 'contain' ? 'image/png' : 'image/jpeg'
}

const JPEG_QUALITY = 0.9

const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
} as const

export interface ExportCropOptions extends TransformInput {
  image: CanvasImageSource
  aspect: CropAspect
  outputWidth: number
  fileName: string
}

/**
 * Render the current framing to a canvas and hand back an uploadable `File`.
 *
 * The canvas is deliberately NOT pre-filled: a padded logo keeps a transparent
 * background so the same file works on light and dark chrome. Filling white
 * would put a card-coloured box around every logo.
 */
export async function exportCrop(options: ExportCropOptions): Promise<File> {
  const type = outputMimeType(options.fit)
  const size = outputSize(options.aspect, options.outputWidth)

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const context = canvas.getContext('2d')

  if (context === null) {
    throw new Error('image-crop: no 2d canvas context')
  }

  const transform = resolveTransform(options)
  const rect = sourceRect(transform, options.frame)

  context.drawImage(
    options.image,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    size.width,
    size.height
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        // Null on a tainted canvas or an encoder failure. Rejecting keeps
        // `File | null` out of every downstream signature — see design D6.
        if (result === null) {
          reject(new Error('image-crop: the canvas produced no blob'))
          return
        }

        resolve(result)
      },
      type,
      JPEG_QUALITY
    )
  })

  return new File([blob], `${options.fileName}.${EXTENSIONS[type]}`, { type })
}
