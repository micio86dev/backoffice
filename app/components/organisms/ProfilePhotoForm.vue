<template>
  <form
    data-testid="profile-photo-form"
    novalidate
    :aria-busy="uploading ? 'true' : 'false'"
    @submit.prevent
  >
    <FormFieldset :disabled="uploading">
      <Field :data-invalid="Boolean(photoError)">
        <FieldLabel id="profile-photo-input-label" for="profile-photo-input">{{
          $t('profile.photo.inputLabel')
        }}</FieldLabel>

        <!--
          The same control as the organization logo, differing only in its
          props. `fit="cover"` and a circular mask because this is a face
          rendered in a circle: there are no edges worth preserving, and a
          padded avatar inside that mask reads as a rendering fault.

          The Avatar primitive is gone from this form and that is deliberate.
          It was here to display, and the control displays; keeping both would
          put two previews of the same photo side by side, and the reka-ui
          `:key` workaround this file used to carry existed only to reset an
          AvatarRoot that no longer exists.
        -->
        <ImageUploadField
          id="profile-photo-input"
          ref="photoField"
          test-id="profile-photo"
          aspect="1:1"
          fit="cover"
          shape="circle"
          :preview-url="photoUrl"
          :fallback-text="initials(name)"
          :disabled="uploading"
          :invalid="Boolean(photoError)"
          :described-by="
            photoError ? 'profile-photo-error profile-photo-help' : 'profile-photo-help'
          "
          :max-bytes="MAX_PHOTO_BYTES"
          @cropped="onPhotoCropped"
          @reject="onPhotoRejected"
          @remove="confirmOpen = true"
        />

        <FieldDescription id="profile-photo-help">{{ $t('profile.photo.help') }}</FieldDescription>

        <FieldError v-if="photoError" id="profile-photo-error" data-testid="profile-photo-error">{{
          photoError
        }}</FieldError>
      </Field>
    </FormFieldset>

    <FormMessage
      v-if="formMessage"
      :kind="formMessage.kind"
      :text="formMessage.text"
      test-id="profile-photo-banner"
    />

    <ConfirmDialog
      :open="confirmOpen"
      :title="$t('profile.photo.confirmRemoveTitle')"
      :description="$t('profile.photo.confirmRemoveDescription')"
      :confirm-label="$t('profile.photo.remove')"
      variant="destructive"
      @confirm="removePhoto"
      @cancel="confirmOpen = false"
    />
  </form>
</template>

<script setup lang="ts">
// ProfilePhotoForm (user-avatar-image, design D6; reworked by
// image-upload-crop-field D2/D3): upload/replace/remove through the shared
// ImageUploadField, satisfying all three arch guards from commit one —
// novalidate, FieldError import, and applyServerFieldErrors in the upload
// catch (form-contract.spec.ts); ConfirmDialog on the destructive remove
// handler (destructive-action.spec.ts); no `*_at` field rendered
// (date-render.spec.ts).
import { ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import ImageUploadField from '@/components/molecules/ImageUploadField.vue'
import { useProfile } from '@/composables/useProfile'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCodes } from '@/utils/server-message'
import { initials } from '@/utils/initials'

// Mirrors config('profile.photo.max_bytes') server-side (api/config/profile.php)
// — a client-side CONVENIENCE that fails an oversized file instantly without
// a round trip, never the enforcement itself. The server re-checks the real
// byte count regardless.
const MAX_PHOTO_BYTES = 2_097_152

// `name` feeds the initials the control shows when the stored photo URL
// fails to load — a signed URL expires, and an expired one 404s
// (user-self-service: "a broken or expired photo URL falls back to
// initials"). Removing the Avatar without carrying that behaviour across
// would have traded a ratified requirement for a browser's broken-image glyph.
defineProps<{
  photoUrl: string | null
  name: string
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { uploadPhoto, deletePhoto } = useProfile()

const { t, te } = useI18n()

const photoField = ref<{ clear: () => void } | null>(null)
const uploading = ref(false)
const confirmOpen = ref(false)
const photoError = ref<string | undefined>(undefined)
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)

const SERVER_FIELD_TO_ERROR_KEY = {
  photo: 'photo',
} as const satisfies Record<string, 'photo'>

function onPhotoRejected(reason: 'tooLarge' | 'unsupportedType'): void {
  photoError.value = t(`profile.photo.reject.${reason}`)
  formMessage.value = null
}

/**
 * Uploads on confirmation of the crop, preserving this control's
 * save-on-selection behaviour. The branding form defers to its submit instead
 * — the same component, two organisms, two policies.
 */
async function onPhotoCropped(file: File): Promise<void> {
  photoError.value = undefined
  formMessage.value = null
  uploading.value = true

  try {
    await uploadPhoto(file)
    // The crop is now the stored photo. Leaving the local blob in place would
    // keep a decoded bitmap alive AND shadow whatever the server hands back on
    // the refetch `saved` triggers.
    photoField.value?.clear()
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      // The endpoint answers with CODES, never sentences — a response body is
      // machine-facing and this app is the only layer that knows the
      // operator's language. Rendering `message` verbatim put English in an
      // Italian field error for every rejection.
      if (key === 'photo') {
        photoError.value = translateServerCodes({ t, te }, 'profile.photo.serverError', [
          message,
        ])[0]
      }
    })
    // The rejected crop goes too. `ImageUploadField` sets its preview BEFORE
    // it emits, so leaving it would put "here is your new photo" directly
    // above "your photo was rejected" — and, worse, keep the Remove button
    // showing, so confirming "Remove profile photo?" would delete the
    // PREVIOUSLY stored photo the operator can no longer see. A destructive
    // confirmation describing one image while destroying another.
    photoField.value?.clear()

    if (unmapped === null || unmapped.length > 0 || photoError.value === undefined) {
      formMessage.value = {
        kind: 'error',
        text: unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('profile.photo.uploadError'),
      }
    }
  } finally {
    uploading.value = false
  }
}

// Named removePhoto( deliberately — it matches DESTRUCTIVE_CALL_REGEX
// (destructive-action.spec.ts), which is exactly why ConfirmDialog is
// imported above and gates this call. Renaming this handler to dodge the
// regex (e.g. onPhotoCleared() calling deletePhoto()) would satisfy the
// guard's absence-of-violation check while removing the actual protection
// it exists to enforce — precisely the discipline failure the guard is
// designed to catch. We are not doing that.
async function removePhoto(): Promise<void> {
  confirmOpen.value = false
  uploading.value = true
  formMessage.value = null
  try {
    await deletePhoto()
    // Same contract BrandingForm follows: the control cannot infer this from
    // `photoUrl`, which was already null for a user who had no photo, so the
    // just-deleted image would stay on screen and the removal would read as a
    // no-op.
    photoField.value?.clear()
    emit('saved')
  } catch {
    formMessage.value = { kind: 'error', text: t('profile.photo.removeError') }
  } finally {
    uploading.value = false
  }
}
</script>
