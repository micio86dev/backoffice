<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <!--
      No @escape-key-down handler: `onOpenChange` below already fires on every
      dismissal path, Escape included, so wiring both emitted `cancel` twice.
      Harmless only because the caller happens to be idempotent.
    -->
    <DialogContent class="sm:max-w-lg" data-testid="image-crop-dialog">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <!--
        The framing surface. A single dark ground behind the image, so the
        mask edge reads against both a light logo and a dark one — a
        card-coloured ground makes a white PNG's boundary invisible, which is
        precisely the framing the operator is here to judge.
      -->
      <div class="bg-avatar-bg flex justify-center rounded-lg p-4">
        <!--
          `role="application"` with `tabindex="0"` IS the accessible pattern
          for a keyboard-driven manipulation surface, and the arrow/zoom keys
          below are what make it operable (design D8). The rule fires because
          `application` is not in its interactive-role list; a <button> would
          silence it and be wrong — this element performs no action, it is
          dragged, and a button would swallow Space and announce the wrong
          thing to a screen reader.
        -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div
          ref="frameEl"
          data-testid="image-crop-frame"
          role="application"
          tabindex="0"
          :aria-label="$t('imageUpload.crop.frameLabel')"
          :data-aspect="aspect"
          :data-zoom="zoom"
          :data-offset-x="offsetX"
          :data-offset-y="offsetY"
          class="focus-visible:ring-ring relative touch-none overflow-hidden rounded-md focus-visible:ring-3 focus-visible:outline-none"
          :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
          :style="{ width: `${FRAME_WIDTH}px`, height: `${frameHeight}px` }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
          @keydown="onKeyDown"
        >
          <img
            v-if="objectUrl"
            ref="imageEl"
            data-testid="image-crop-image"
            :src="objectUrl"
            alt=""
            draggable="false"
            class="absolute top-1/2 left-1/2 max-w-none select-none"
            :style="imageStyle"
            @load="onImageLoad"
          />

          <!--
            The mask is drawn INSIDE the frame and dims everything outside
            itself with an oversized spread — clipped by the frame's own
            overflow. Under `square` it covers the frame exactly, so nothing
            is dimmed and only the hairline remains, which is correct: there
            is no discarded area to indicate.
          -->
          <div
            data-testid="image-crop-mask"
            :data-shape="shape"
            class="pointer-events-none absolute inset-0 shadow-[0_0_0_9999px_var(--mask-dim)] ring-1 ring-white/70 ring-inset"
            :style="{
              '--mask-dim': 'color-mix(in oklab, var(--color-avatar-bg) 55%, transparent)',
            }"
            :class="shape === 'circle' ? 'rounded-full' : 'rounded-md'"
          />
        </div>
      </div>

      <div class="flex items-center gap-3">
        <ZoomOutIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <input
          :id="`${idPrefix}-crop-zoom`"
          data-testid="image-crop-zoom"
          type="range"
          :min="MIN_ZOOM"
          :max="MAX_ZOOM"
          step="0.01"
          :value="zoom"
          :aria-label="$t('imageUpload.crop.zoomLabel')"
          :disabled="natural === null"
          class="accent-primary h-1 w-full"
          :class="natural === null ? 'cursor-not-allowed' : 'cursor-pointer'"
          @input="onZoomInput"
        />
        <ZoomInIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      </div>

      <p class="text-muted-foreground text-xs">{{ $t('imageUpload.crop.hint') }}</p>

      <FieldError v-if="error" data-testid="image-crop-error">{{ error }}</FieldError>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          data-testid="image-crop-cancel"
          @click="emit('cancel')"
        >
          {{ $t('imageUpload.crop.cancel') }}
        </Button>
        <Button
          type="button"
          data-testid="image-crop-confirm"
          :disabled="natural === null"
          :loading="exporting"
          @click="onConfirm"
        >
          {{ $t('imageUpload.crop.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * ImageCropDialog (image-upload-crop-field, design D4/D5/D6/D8).
 *
 * Pan-and-zoom framing over a fixed-ratio window, producing the `File` that
 * actually gets uploaded. Every number it manipulates is clamped by
 * `utils/image-crop`; this component owns state, events and focus, and no
 * geometry of its own.
 *
 * The frame is a FIXED pixel size rather than a measured one. Measuring would
 * buy nothing on a desktop-only product with a fixed dialog width, and it
 * would make every crop depend on a layout pass that happy-dom reports as
 * zero — turning the geometry above into something no unit test can pin down.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ZoomInIcon, ZoomOutIcon } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  type CropAspect,
  type CropFit,
  type Size,
  aspectRatio,
  clampOffset,
  exportCrop,
  resolveTransform,
} from '@/utils/image-crop'

const FRAME_WIDTH = 360
const KEY_PAN_STEP = 12
const KEY_ZOOM_STEP = 0.2
const WHEEL_ZOOM_FACTOR = 0.0015

const props = withDefaults(
  defineProps<{
    open: boolean
    file: File | null
    aspect: CropAspect
    fit: CropFit
    shape?: 'square' | 'circle'
    outputWidth?: number
    title: string
    description: string
    /**
     * Namespaces this dialog's element ids. Settings is heading towards more
     * than one upload control on a page, and two dialogs sharing
     * `id="image-crop-zoom"` is a duplicate id — which breaks the label
     * association for both.
     */
    idPrefix?: string
  }>(),
  { shape: 'square', outputWidth: 512, idPrefix: 'image' }
)

const emit = defineEmits<{
  (e: 'confirm', file: File): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()

const imageEl = ref<HTMLImageElement | null>(null)
const frameEl = ref<HTMLElement | null>(null)

const objectUrl = ref<string | null>(null)
const natural = ref<Size | null>(null)
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const dragging = ref(false)
const exporting = ref(false)
const error = ref<string | undefined>(undefined)

const frameHeight = computed(() => Math.round(FRAME_WIDTH / aspectRatio(props.aspect)))
const frame = computed<Size>(() => ({ width: FRAME_WIDTH, height: frameHeight.value }))

const transform = computed(() =>
  natural.value === null
    ? null
    : resolveTransform({
        natural: natural.value,
        frame: frame.value,
        fit: props.fit,
        zoom: zoom.value,
        offsetX: offsetX.value,
        offsetY: offsetY.value,
      })
)

/**
 * `translate(-50%, -50%)` centres the image on the frame; the offsets ride on
 * top of that. Written as one transform rather than as `left`/`top` so panning
 * never touches a layout property (DESIGN.md §10).
 */
const imageStyle = computed(() => {
  if (transform.value === null) return { visibility: 'hidden' as const }

  return {
    width: `${transform.value.displayWidth}px`,
    height: `${transform.value.displayHeight}px`,
    transform: `translate(calc(-50% + ${transform.value.offsetX}px), calc(-50% + ${transform.value.offsetY}px))`,
  }
})

function releaseObjectUrl(): void {
  if (objectUrl.value === null) return
  URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = null
}

// A new file is a new framing. Carrying the previous zoom and offsets over
// would frame the incoming image by accident, at values chosen for a
// different one.
watch(
  () => props.file,
  (file) => {
    releaseObjectUrl()
    natural.value = null
    zoom.value = 1
    offsetX.value = 0
    offsetY.value = 0
    error.value = undefined

    if (file !== null) objectUrl.value = URL.createObjectURL(file)
  },
  { immediate: true }
)

onBeforeUnmount(releaseObjectUrl)

function onImageLoad(): void {
  const element = imageEl.value
  if (element === null) return

  natural.value = { width: element.naturalWidth, height: element.naturalHeight }
}

/** Store CLAMPED offsets, never raw ones — see design D4. */
function applyOffset(nextX: number, nextY: number): void {
  if (transform.value === null) return

  offsetX.value = clampOffset(nextX, transform.value.displayWidth, frame.value.width)
  offsetY.value = clampOffset(nextY, transform.value.displayHeight, frame.value.height)
}

function applyZoom(next: number): void {
  zoom.value = Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM)
  // Zooming out shrinks the play in the offsets; re-clamping here is what
  // stops the image sliding off the frame as it gets smaller.
  applyOffset(offsetX.value, offsetY.value)
}

let dragOriginX = 0
let dragOriginY = 0
let dragOffsetX = 0
let dragOffsetY = 0

function onPointerDown(event: PointerEvent): void {
  if (natural.value === null) return

  dragging.value = true
  dragOriginX = event.clientX
  dragOriginY = event.clientY
  dragOffsetX = offsetX.value
  dragOffsetY = offsetY.value

  // Pointer capture, so a drag that leaves the frame still receives its own
  // move and up events instead of stranding the element in a dragging state.
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return

  applyOffset(
    dragOffsetX + (event.clientX - dragOriginX),
    dragOffsetY + (event.clientY - dragOriginY)
  )
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return

  dragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
}

function onWheel(event: WheelEvent): void {
  applyZoom(zoom.value - event.deltaY * WHEEL_ZOOM_FACTOR)
}

function onZoomInput(event: Event): void {
  applyZoom(Number((event.target as HTMLInputElement).value))
}

function onKeyDown(event: KeyboardEvent): void {
  const pan: Record<string, [number, number]> = {
    ArrowLeft: [-KEY_PAN_STEP, 0],
    ArrowRight: [KEY_PAN_STEP, 0],
    ArrowUp: [0, -KEY_PAN_STEP],
    ArrowDown: [0, KEY_PAN_STEP],
  }

  const delta = pan[event.key]

  if (delta !== undefined) {
    event.preventDefault()
    applyOffset(offsetX.value + delta[0], offsetY.value + delta[1])
    return
  }

  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    applyZoom(zoom.value + KEY_ZOOM_STEP)
    return
  }

  if (event.key === '-' || event.key === '_') {
    event.preventDefault()
    applyZoom(zoom.value - KEY_ZOOM_STEP)
  }
}

function onOpenChange(next: boolean): void {
  // Dismissing (backdrop, Escape, the close button) is a cancel. There is no
  // silent-accept path: nothing leaves this dialog except through confirm.
  if (!next) emit('cancel')
}

async function onConfirm(): Promise<void> {
  if (natural.value === null || imageEl.value === null) return

  error.value = undefined
  exporting.value = true

  try {
    emit(
      'confirm',
      await exportCrop({
        image: imageEl.value,
        natural: natural.value,
        frame: frame.value,
        fit: props.fit,
        zoom: zoom.value,
        offsetX: offsetX.value,
        offsetY: offsetY.value,
        aspect: props.aspect,
        outputWidth: props.outputWidth,
        fileName: 'image',
      })
    )
  } catch {
    error.value = t('imageUpload.crop.exportError')
  } finally {
    exporting.value = false
  }
}
</script>
