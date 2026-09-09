<template>
  <form data-testid="branding-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <!--
        The LOGO. Absent is a supported, permanent state (product decision 9),
        and the PRODUCT falls back to the Quint mark everywhere it renders one
        — which is what the help text below promises.

        This control does not: its empty state is a neutral icon, because a
        Quint logo sitting in the upload preview would read as "your logo is
        already set to ours" rather than "nothing configured". The fallback
        belongs to the chrome, not to the picker.
      -->
        <Field :data-invalid="Boolean(logoError)">
          <FieldLabel id="branding-logo-label" for="branding-logo">{{
            $t('settings.branding.logo')
          }}</FieldLabel>

          <!--
            One control, shared with the profile photo. `fit="contain"` is the
            whole reason the two call sites can share it: a wide logotype
            cropped to FILL a square loses its ends, so the square frame pads
            the mark instead of trimming it. The operator can still zoom in
            past that if a crop is what they want.
          -->
          <ImageUploadField
            id="branding-logo"
            ref="logoField"
            test-id="branding-logo"
            aspect="1:1"
            fit="contain"
            shape="square"
            :preview-url="logoUrl"
            :disabled="saving"
            :invalid="Boolean(logoError)"
            :described-by="describedBy('branding-logo', Boolean(logoError))"
            :max-bytes="MAX_LOGO_BYTES"
            @cropped="onLogoCropped"
            @reject="onLogoRejected"
            @remove="onRemoveRequested"
          />

          <FieldDescription id="branding-logo-help">{{
            $t('settings.branding.help.logo')
          }}</FieldDescription>

          <FieldError v-if="logoError" id="branding-logo-error" data-testid="branding-logo-error">{{
            logoError
          }}</FieldError>
        </Field>

        <!-- The PRIMARY COLOUR. -->
        <Field :data-invalid="Boolean(colorError)">
          <FieldLabel for="branding-color">{{ $t('settings.branding.primaryColor') }}</FieldLabel>

          <div class="flex items-center gap-3">
            <!--
            A native colour picker AND a text field over the same value. The
            picker cannot express "no colour", and the text field is how an
            operator pastes an exact hex from a brand document — neither alone
            covers both, and a brand colour pasted wrong is worse than one
            picked approximately.
          -->
            <input
              id="branding-color"
              type="color"
              :value="color || BRAND_PRIMARY"
              :aria-invalid="Boolean(colorError)"
              :aria-describedby="describedBy('branding-color', Boolean(colorError))"
              data-testid="branding-color-picker"
              class="h-9 w-12 rounded border border-border bg-card"
              :class="saving ? 'cursor-not-allowed' : 'cursor-pointer'"
              @input="onColorPicked"
            />
            <Input
              v-model="color"
              :aria-label="$t('settings.branding.colorHexLabel')"
              autocomplete="off"
              :placeholder="BRAND_PRIMARY"
              :aria-invalid="Boolean(colorError)"
              :aria-describedby="describedBy('branding-color', Boolean(colorError))"
              data-testid="branding-color-text"
              class="max-w-40"
              @blur="validateColor"
            />
            <Button
              v-if="color"
              type="button"
              variant="outline"
              data-testid="branding-color-clear"
              @click="color = ''"
            >
              {{ $t('settings.branding.colorClear') }}
            </Button>
          </div>

          <FieldDescription id="branding-color-help">{{
            $t('settings.branding.help.primaryColor')
          }}</FieldDescription>

          <FieldError
            v-if="colorError"
            id="branding-color-error"
            data-testid="branding-color-error"
            >{{ colorError }}</FieldError
          >
        </Field>

        <Alert v-if="formMessage" variant="destructive" role="alert" data-testid="branding-banner">
          <AlertDescription>{{ formMessage }}</AlertDescription>
        </Alert>

        <Button type="submit" :loading="saving" data-testid="branding-submit">
          {{ $t('projects.action.save') }}
        </Button>
      </FieldGroup>
    </FormFieldset>

    <!--
      Removing the logo DELETES the stored file. Reversible only if the operator
      still has the original — which, months after uploading it, they very often
      do not. That is what puts it behind a confirmation while the colour's
      "clear" button is not: a colour can be retyped from a brand document, a
      file cannot be recovered from one.
    -->
    <ConfirmDialog
      :open="confirmingRemoval"
      :title="$t('settings.branding.confirm.removeLogoTitle')"
      :description="$t('settings.branding.confirm.removeLogoBody')"
      :confirm-label="$t('settings.branding.logoRemove')"
      variant="destructive"
      @confirm="onRemoveLogo"
      @cancel="confirmingRemoval = false"
    />
  </form>
</template>

<script setup lang="ts">
/**
 * Per-organization branding — logo and primary colour (product decision 9,
 * reopened 2026-09-01).
 *
 * Admin-only, enforced by the section registry AND by the API. Both fields are
 * permanently optional: an organization that sets neither renders in the Quint
 * palette, so the empty state is a supported configuration rather than an
 * unfinished one.
 */
import { ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import ImageUploadField from '@/components/molecules/ImageUploadField.vue'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { applyBrandColor } from '@/composables/useBrandTheme'
import { BRAND_PRIMARY, HEX } from '@/utils/brand'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCodes } from '@/utils/server-message'

/**
 * Mirrors `config('branding.logo.max_bytes')` (api/config/branding.php) — a
 * client-side CONVENIENCE that fails an oversized file instantly without a
 * round trip, never the enforcement itself. The server re-checks the real
 * byte count of what it actually receives.
 */
const MAX_LOGO_BYTES = 1_048_576

const props = defineProps<{
  organization: OrganizationResponse['data']
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateOrganization, uploadLogo, removeLogo } = useOrganization()
const { t, te } = useI18n()

const color = ref(props.organization.primary_color ?? '')
const logoUrl = ref(props.organization.logo_url ?? null)
const pendingFile = ref<File | null>(null)

const colorError = ref<string | undefined>(undefined)
const logoError = ref<string | undefined>(undefined)
const formMessage = ref<string | null>(null)
const logoField = ref<{ clear: () => void } | null>(null)
const confirmingRemoval = ref(false)
const saving = ref(false)

/**
 * Joins a field's help text with its error, when it has one.
 *
 * Both were rendered and neither was referenced: a screen-reader user heard
 * "invalid" and never the sentence explaining the format, which is the whole
 * reason the help text exists. Mirrors `UserForm`'s helper of the same name.
 */
function describedBy(baseId: string, hasError: boolean): string {
  return [hasError ? `${baseId}-error` : null, `${baseId}-help`]
    .filter((id): id is string => id !== null)
    .join(' ')
}

function validateColor(): boolean {
  // Empty is VALID — it means "use the product palette". Treating it as an
  // error would make the field impossible to clear.
  colorError.value =
    color.value === '' || HEX.test(color.value) ? undefined : t('settings.branding.invalidColor')

  return colorError.value === undefined
}

function onColorPicked(event: Event): void {
  color.value = (event.target as HTMLInputElement).value
  validateColor()
}

/**
 * The control hands back a CROPPED file. It is held until submit rather than
 * uploaded here, because the colour and the logo are separate endpoints and a
 * failed upload must not silently discard a colour the operator also changed.
 */
function onLogoCropped(file: File): void {
  logoError.value = undefined
  pendingFile.value = file
}

function onLogoRejected(reason: 'tooLarge' | 'unsupportedType'): void {
  logoError.value = t(`settings.branding.reject.${reason}`)
  pendingFile.value = null
}

/**
 * Remove means two different things, and only one of them is destructive.
 *
 * With nothing stored there is no file to delete: the only thing to discard is
 * a client-side crop. Firing the confirmation would promise "the file will be
 * permanently deleted. If you no longer have the original you will not be able
 * to restore it" about a blob the operator can re-pick in a second, and spend
 * a DELETE on a row that does not exist.
 */
function onRemoveRequested(): void {
  if (logoUrl.value === null) {
    pendingFile.value = null
    logoError.value = undefined
    logoField.value?.clear()

    return
  }

  confirmingRemoval.value = true
}

async function onRemoveLogo(): Promise<void> {
  confirmingRemoval.value = false
  formMessage.value = null
  saving.value = true

  try {
    const response = await removeLogo()
    logoUrl.value = response.data.logo_url ?? null
    // The pending crop goes WITH it, in the form AND in the control. The
    // confirmation promises "the file will be permanently deleted"; leaving it
    // queued meant the next Save re-uploaded the exact file the operator had
    // just removed, while the control kept showing it.
    pendingFile.value = null
    logoField.value?.clear()
    emit('saved')
  } catch {
    formMessage.value = t('settings.branding.saveError')
  } finally {
    saving.value = false
  }
}

/**
 * Which message, if any, the form-level banner should carry.
 *
 * `unmapped === null` means the failure carried no field payload at all — a
 * network error, a 500 — and that is exactly what the banner exists for.
 */
function match(unmapped: string[] | null, mapped: boolean): string | null {
  if (unmapped !== null && unmapped.length > 0) {
    return translateServerCodes({ t, te }, 'settings.branding.serverError', unmapped).join(' ')
  }

  return mapped ? null : t('settings.branding.saveError')
}

async function onSubmit(): Promise<void> {
  formMessage.value = null
  logoError.value = undefined

  if (!validateColor()) return

  saving.value = true

  try {
    // The colour first. The two are separate endpoints because `logo_path` is
    // written only where a file was actually stored — so a failed upload must
    // not silently discard a colour the operator also changed.
    await updateOrganization({ primary_color: color.value || null })

    // Paint it NOW. `applyBrandColor` ran only in `layouts/default.vue` on
    // mount, so an admin who picked a colour kept seeing the old one until
    // they reloaded — the value was stored correctly and the UI simply did not
    // agree with it, which reads as a save that did not work.
    //
    // Applied from what we just sent rather than by making the layout
    // re-fetch: this form already knows the answer, and a round trip to learn
    // what it itself submitted would be slower and no more correct. Clearing
    // removes the override, so the product palette returns without a reload
    // either.
    applyBrandColor(color.value || null)

    if (pendingFile.value !== null) {
      const response = await uploadLogo(pendingFile.value)
      logoUrl.value = response.data.logo_url ?? null
      pendingFile.value = null
      // The crop is now the stored image; the local blob has nothing left to
      // say and holds a decoded bitmap for the life of the document.
      logoField.value?.clear()
    }

    emit('saved')
  } catch (submitError) {
    const unmapped = applyServerFieldErrors(
      submitError,
      { primary_color: 'color', logo: 'logo' } as const,
      (key, message) => {
        const translated = translateServerCodes({ t, te }, 'settings.branding.serverError', [
          message,
        ])[0]

        if (key === 'color') colorError.value = translated
        else logoError.value = translated
      }
    )

    const mapped = colorError.value !== undefined || logoError.value !== undefined

    // The banner is for what the FIELDS could not say. When a 422 mapped
    // cleanly, the operator already has the exact reason under the control,
    // and adding "Could not save. Please try again." on top invites a retry
    // that will fail identically. Same guard ProfilePhotoForm already applies.
    formMessage.value = match(unmapped, mapped)
  } finally {
    saving.value = false
  }
}
</script>
