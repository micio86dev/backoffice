<template>
  <form
    data-testid="profile-photo-form"
    novalidate
    :aria-busy="uploading ? 'true' : 'false'"
    @submit.prevent
  >
    <FormFieldset :disabled="uploading" class="flex items-center gap-4">
      <!--
        `:key` forces a fresh AvatarRoot (and its internally-provided
        imageLoadingStatus ref) across a null <-> non-null photoUrl
        transition. Without it, removing a photo unmounts AvatarImage via
        v-if but reka-ui's shared root context is never reset back to
        'idle' by that unmount — imageLoadingStatus stays stuck at 'loaded'
        from the photo that just displayed, and AvatarFallback's own render
        guard (`imageLoadingStatus !== 'loaded'`) then never re-satisfies,
        so NEITHER the image nor the fallback renders. Only reachable with a
        real image load completing, which is why jsdom-based unit tests
        cannot see it — caught by the Playwright case in task 9.1.
      -->
      <Avatar :key="photoUrl ? 'photo' : 'no-photo'" size="lg" aria-hidden="true">
        <AvatarImage
          v-if="photoUrl"
          data-testid="profile-photo-avatar-image"
          :src="photoUrl"
          alt=""
        />
        <AvatarFallback data-testid="profile-photo-avatar-fallback">{{
          initials(name)
        }}</AvatarFallback>
      </Avatar>

      <!--
        Hidden but focusable — never display:none, which removes it from the
        tab order (design D6). `accept` is a picker filter only; the server
        decides what is actually valid. The label NESTS the input (rather
        than only pairing via for/id) to satisfy label-has-for's default
        `every: ['nesting', 'id']` requirement.
      -->
      <label for="profile-photo-input" class="sr-only">
        {{ $t('profile.photo.inputLabel') }}
        <input
          id="profile-photo-input"
          ref="inputEl"
          data-testid="profile-photo-input"
          type="file"
          accept="image/jpeg,image/png"
          class="sr-only"
          :disabled="uploading"
          @change="onFileSelected"
        />
      </label>

      <div class="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="profile-photo-change"
          :loading="uploading"
          @click="inputEl?.click()"
        >
          {{ $t('profile.photo.change') }}
        </Button>
        <Button
          v-if="photoUrl"
          type="button"
          variant="outline"
          size="sm"
          data-testid="profile-photo-remove"
          :disabled="uploading"
          @click="confirmOpen = true"
        >
          {{ $t('profile.photo.remove') }}
        </Button>
      </div>
    </FormFieldset>

    <FieldError v-if="photoError" id="profile-photo-error" data-testid="profile-photo-error">{{
      photoError
    }}</FieldError>

    <Alert
      v-if="formMessage"
      :variant="formMessage.kind === 'error' ? 'destructive' : 'success'"
      role="alert"
      aria-live="polite"
      data-testid="profile-photo-banner"
    >
      <AlertDescription>{{ formMessage.text }}</AlertDescription>
    </Alert>

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
import { FormFieldset } from '@/components/ui/form-fieldset'
// ProfilePhotoForm (user-avatar-image, design D6): upload/replace/remove,
// satisfying all three arch guards from commit one — novalidate,
// FieldError import, and applyServerFieldErrors in the upload catch (form-
// contract.spec.ts); ConfirmDialog on the destructive remove handler
// (destructive-action.spec.ts); no `*_at` field rendered (date-render.spec.ts).
import { ref } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { useProfile } from '@/composables/useProfile'
import { applyServerFieldErrors } from '@/utils/http-error'
import { initials } from '@/utils/initials'

// Mirrors config('profile.photo.max_bytes') server-side (api/config/profile.php)
// — a client-side CONVENIENCE that fails an oversized file instantly without
// a round trip, never the enforcement itself. The server re-checks the real
// byte count regardless.
const MAX_PHOTO_BYTES = 2_097_152

// Not captured to a variable: script logic below never reads photoUrl/name
// directly (only the template does), and defineProps() still exposes both
// as top-level template bindings without a captured return value.
defineProps<{
  photoUrl: string | null
  name: string
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { uploadPhoto, deletePhoto } = useProfile()

const { t } = useI18n()

const inputEl = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const confirmOpen = ref(false)
const photoError = ref<string | undefined>(undefined)
const formMessage = ref<{ kind: 'error' | 'success'; text: string } | null>(null)

const SERVER_FIELD_TO_ERROR_KEY = {
  photo: 'photo',
} as const satisfies Record<string, 'photo'>

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  photoError.value = undefined
  formMessage.value = null

  if (file.size > MAX_PHOTO_BYTES) {
    photoError.value = t('profile.photo.tooLarge')
    input.value = ''
    return
  }

  uploading.value = true
  try {
    await uploadPhoto(file)
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      if (key === 'photo') photoError.value = message
    })
    if (unmapped === null || unmapped.length > 0 || photoError.value === undefined) {
      formMessage.value = {
        kind: 'error',
        text: unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('profile.photo.uploadError'),
      }
    }
  } finally {
    uploading.value = false
    input.value = ''
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
    emit('saved')
  } catch {
    formMessage.value = { kind: 'error', text: t('profile.photo.removeError') }
  } finally {
    uploading.value = false
  }
}
</script>
