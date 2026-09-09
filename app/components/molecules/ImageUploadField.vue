<template>
  <div class="flex items-start gap-3">
    <!--
      The dropzone is the whole panel: preview, call to action and constraints
      in one target, so there is never a question of what the clickable thing
      is. A real <button>, not a div with @click — it lands in the tab order,
      fires on Enter and Space, and announces correctly, all without
      reimplementation.

      No `disabled:pointer-events-none`: an element with `pointer-events: none`
      is not a pointer-event target, so the cursor resolves from an ancestor
      and NO cursor declared on it ever renders — the `not-allowed` beside it
      could never have fired. The native `disabled` attribute on a real button
      already blocks click, drag and keyboard activation.
    -->
    <button
      :id="id"
      type="button"
      :data-testid="`${testId}-dropzone`"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="announcedBy"
      class="border-input not-disabled:hover:border-primary not-disabled:hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive flex flex-1 items-center gap-4 rounded-lg border border-dashed p-3 text-left transition-colors duration-150 focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      :class="draggingOver ? 'border-primary bg-muted/50' : ''"
      @click="inputEl?.click()"
      @dragenter.prevent="draggingOver = !disabled"
      @dragover.prevent="draggingOver = !disabled"
      @dragleave.prevent="draggingOver = false"
      @drop.prevent="onDrop"
    >
      <span
        class="bg-muted ring-border relative flex shrink-0 items-center justify-center overflow-hidden ring-1"
        :class="shape === 'circle' ? 'rounded-full' : 'rounded-md'"
        :style="{ width: `${PREVIEW_WIDTH}px`, aspectRatio: cssAspect }"
      >
        <img
          v-if="displayUrl && !previewFailed"
          :data-testid="`${testId}-preview`"
          :src="displayUrl"
          alt=""
          class="size-full object-contain"
          @error="previewFailed = true"
        />
        <!--
          A signed photo URL EXPIRES, and an expired one 404s. Without this,
          the browser's broken-image glyph is what an operator sees, which
          reads as a bug rather than as a photo that is no longer there
          (user-self-service: "falls back to initials").
        -->
        <span
          v-else-if="fallbackText"
          :data-testid="`${testId}-fallback`"
          class="text-muted-foreground text-sm font-medium"
          >{{ fallbackText }}</span
        >
        <ImageIcon
          v-else
          :data-testid="`${testId}-empty`"
          class="text-muted-foreground size-5"
          aria-hidden="true"
        />
      </span>

      <!--
        Two of these three lines are DESCRIBED, not named. `<label for>`
        supersedes a button's own subtree when it computes the accessible
        name, so everything here was rendered for sighted readers and
        announced to nobody — the name was the caller's static "Logo" and
        nothing else. Two things were lost with it: WCAG 2.5.3 (a speech-input
        user says "Add image" and matches nothing), and the fact that Add vs
        Replace is the ONLY textual signal of whether an image is currently
        set — the preview is `alt=""`, so with the subtree superseded there
        was no cue left at all.

        The middle line, the drag hint, is deliberately NOT referenced. It
        describes a pointer gesture to a reader who is not using one, and
        `role=button` already implies activation. Announcing it would add
        length to every focus without adding information.
      -->
      <span class="min-w-0">
        <span :id="`${id}-cta`" class="text-foreground block text-sm font-semibold">
          {{ displayUrl ? $t('imageUpload.cta.replace') : $t('imageUpload.cta.add') }}
        </span>
        <span class="text-muted-foreground mt-0.5 block text-xs">
          {{ $t('imageUpload.cta.hint') }}
        </span>
        <span :id="`${id}-constraints`" class="text-muted-foreground mt-1 block text-xs">
          {{ $t('imageUpload.constraints', { aspect }) }}
        </span>
      </span>
    </button>

    <!--
      Outside the dropzone button, not inside it: a button nested in a button
      is invalid HTML and the inner one's activation behaviour is undefined.
    -->
    <Button
      v-if="displayUrl"
      type="button"
      variant="outline"
      size="sm"
      :disabled="disabled"
      :data-testid="`${testId}-remove`"
      @click="emit('remove')"
    >
      {{ $t('imageUpload.remove') }}
    </Button>

    <!--
      A MECHANISM, not a control. The button above is what the operator
      interacts with and what the caller's FieldLabel names; this element only
      exists to open the picker when that button asks it to.
      So it is out of the tab order AND out of the accessibility tree. It was
      neither: labelled by the same FieldLabel as the button, it gave the field
      TWO controls with one name — which a screen-reader user meets as two
      identical things, and which a strict locator meets as an ambiguity.
    -->
    <input
      ref="inputEl"
      tabindex="-1"
      aria-hidden="true"
      type="file"
      :accept="ACCEPT"
      :disabled="disabled"
      :data-testid="`${testId}-input`"
      class="sr-only"
      @change="onFileChosen"
    />

    <ImageCropDialog
      :open="pendingFile !== null"
      :file="pendingFile"
      :aspect="aspect"
      :fit="fit"
      :shape="shape"
      :output-width="outputWidth"
      :id-prefix="testId"
      :title="$t('imageUpload.crop.title')"
      :description="$t('imageUpload.crop.description')"
      @confirm="onCropConfirmed"
      @cancel="closeCrop"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * ImageUploadField (image-upload-crop-field, design D2/D3/D7/D8).
 *
 * The single image upload surface in the backoffice. It renders the framing
 * dialog, produces a cropped `File`, and previews it immediately.
 *
 * It is the CONTROL, not the whole field: the caller owns
 * `Field > FieldLabel + control + FieldDescription/FieldError` per DESIGN.md
 * §16.1, which is also why a rejected file is reported as a REASON rather
 * than rendered as copy — the message and its placement belong to the form.
 *
 * The confirmed crop leaves as `cropped`, NOT `update:modelValue`: this
 * component declares no `modelValue` prop, and an event named for a v-model
 * that does not exist invites `v-model="file"` to be written and silently
 * ignored.
 *
 * It never touches the network. Uploading is the organism's decision, which
 * is what lets one component serve a form that saves on submit (branding) and
 * one that saves on selection (profile photo) without either behaviour
 * leaking into the shared code.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ImageIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import ImageCropDialog from '@/components/molecules/ImageCropDialog.vue'
import type { CropAspect, CropFit } from '@/utils/image-crop'

/**
 * The picker filter, and ONLY the picker filter. The server decides on the
 * file's magic bytes; `accept` is trivially bypassed and verifies nothing.
 * It matches what the endpoints actually store, so the picker never offers a
 * format the upload would then reject.
 */
const ACCEPT = 'image/png,image/jpeg'
const PREVIEW_WIDTH = 88

const props = withDefaults(
  defineProps<{
    /**
     * The DROPZONE BUTTON's id — the operable control, and the one the
     * caller's `FieldLabel` must point `for` at. `<button>` is labelable, so
     * the label names it directly and nothing else in this component carries
     * a name.
     */
    id: string
    testId: string
    aspect?: CropAspect
    fit?: CropFit
    shape?: 'square' | 'circle'
    previewUrl?: string | null
    fallbackText?: string
    disabled?: boolean
    invalid?: boolean
    describedBy?: string
    maxBytes?: number
    outputWidth?: number
  }>(),
  {
    aspect: '1:1',
    fit: 'cover',
    shape: 'square',
    previewUrl: null,
    fallbackText: undefined,
    disabled: false,
    invalid: false,
    describedBy: undefined,
    maxBytes: undefined,
    outputWidth: 512,
  }
)

const emit = defineEmits<{
  (e: 'cropped', file: File): void
  (e: 'reject', reason: 'tooLarge' | 'unsupportedType'): void
  (e: 'remove'): void
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const pendingFile = ref<File | null>(null)
const croppedUrl = ref<string | null>(null)
const draggingOver = ref(false)

const cssAspect = computed(() => props.aspect.replace(':', ' / '))

const displayUrl = computed(() => croppedUrl.value ?? props.previewUrl)

const previewFailed = ref(false)

// Reset on every change of URL. A latched failure would leave a freshly
// uploaded photo invisible behind the initials of the one that expired.
watch(displayUrl, () => {
  previewFailed.value = false
})

function releaseCroppedUrl(): void {
  if (croppedUrl.value === null) return
  URL.revokeObjectURL(croppedUrl.value)
  croppedUrl.value = null
}

onBeforeUnmount(releaseCroppedUrl)

/**
 * Drop the local crop.
 *
 * EXPLICIT rather than watched. The first version watched `previewUrl` and
 * released on change, which silently did nothing for an organization that
 * had no logo to begin with — null before, null after, no change to observe —
 * so cropping and then removing left the just-deleted image on screen for
 * exactly the case product decision 9 calls a permanent supported state.
 *
 * The organism owns both terminal moments: the upload that consumed the crop,
 * and the removal that discarded it. It says so here rather than leaving the
 * control to infer it from a prop that may not move.
 */
function clear(): void {
  releaseCroppedUrl()
  resetInput()
}

defineExpose({ clear })

/**
 * Clearing the input's value is not housekeeping: without it, re-picking the
 * SAME file after a cancel fires no `change` event at all and the control
 * looks broken.
 */
function resetInput(): void {
  if (inputEl.value !== null) inputEl.value.value = ''
}

/**
 * The ONE gate every incoming file passes, whichever door it arrived through.
 *
 * `accept` on the input is a picker SUGGESTION, not a check: GTK's dialog
 * carries an "All Files" entry and both macOS and Windows let a path be typed.
 * So the picker needed the same refusal the drop path already had — without
 * it a PDF opened the crop dialog on an image that never loads, leaving Apply
 * disabled forever with nothing saying why. A dead end with no message is
 * worse than a refusal.
 */
function accept(file: File | undefined): void {
  if (file === undefined) return

  if (!ACCEPT.split(',').includes(file.type)) {
    emit('reject', 'unsupportedType')
    resetInput()

    return
  }

  // Checked HERE, before the source is decoded into an <img>: a 50MB file
  // would otherwise be loaded and framed before anything measured it. It
  // remains a convenience — the server re-checks the real byte count, and it
  // checks the cropped result, not this one.
  if (props.maxBytes !== undefined && file.size > props.maxBytes) {
    emit('reject', 'tooLarge')
    resetInput()
    return
  }

  pendingFile.value = file
}

function onFileChosen(event: Event): void {
  accept((event.target as HTMLInputElement).files?.[0])
}

/**
 * The caller's help and error ids, plus the two the button renders itself.
 *
 * The caller cannot supply these: the strings live inside this component and
 * change with its state. Appending them here is what puts the CTA (Add vs
 * Replace) and the required shape back into the accessibility tree after
 * `<label for>` supersedes the button's contents.
 */
const announcedBy = computed(() =>
  [props.describedBy, `${props.id}-cta`, `${props.id}-constraints`]
    .filter((value): value is string => value !== undefined && value !== '')
    .join(' ')
)

function onDrop(event: DragEvent): void {
  draggingOver.value = false

  // HTML makes a disabled control swallow CLICK events. A drop is not a
  // click, and the crop dialog teleports out of the disabled fieldset, so a
  // file dropped mid-upload would open a fully interactive dialog and the
  // confirm would start a SECOND concurrent upload — whose sibling's
  // `finally` then re-enables the form underneath it.
  if (props.disabled) return

  accept(event.dataTransfer?.files?.[0])
}

function closeCrop(): void {
  pendingFile.value = null
  resetInput()
}

function onCropConfirmed(file: File): void {
  // Revoke BEFORE reassigning, so the revoke can never race the new value and
  // blank a preview that was just set.
  releaseCroppedUrl()
  croppedUrl.value = URL.createObjectURL(file)
  emit('cropped', file)
  closeCrop()
}
</script>
