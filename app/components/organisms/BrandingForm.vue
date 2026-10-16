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
          <FieldLabel for="branding-logo">{{ $t('settings.branding.logo') }}</FieldLabel>

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
              @click="clearColor"
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

        <!--
          The BACKGROUND COLOUR of the candidate page (canvas). Candidate-only:
          the backoffice's own theme never reads it. Empty means the default
          dark canvas, so the hint says so instead of showing a blank field.
          The two presets are the common case; the picker + hex are the escape
          hatch, same pattern as the primary colour.
        -->
        <Field :data-invalid="Boolean(backgroundError)">
          <FieldLabel for="branding-background">{{
            $t('settings.branding.backgroundColor')
          }}</FieldLabel>

          <div
            role="group"
            :aria-label="$t('settings.branding.presets')"
            class="flex flex-wrap gap-2"
          >
            <button
              v-for="preset in BACKGROUND_PRESETS"
              :key="preset.id"
              type="button"
              :aria-pressed="isPreset(preset.value)"
              :data-testid="`branding-background-${preset.id}`"
              class="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              :class="
                isPreset(preset.value)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              "
              @click="pickPreset(preset.value)"
            >
              <span
                aria-hidden="true"
                class="size-5 rounded-full border border-border"
                :style="{ backgroundColor: preset.value }"
              />
              {{ $t(`settings.branding.${preset.label}`) }}
              <!-- Selection is not carried by colour alone (WCAG 1.4.1). -->
              <CheckIcon v-if="isPreset(preset.value)" aria-hidden="true" class="size-4" />
            </button>
          </div>

          <div class="flex items-center gap-3">
            <input
              id="branding-background"
              type="color"
              :value="background || BACKGROUND_DEFAULT"
              :aria-invalid="Boolean(backgroundError)"
              :aria-describedby="describedBy('branding-background', Boolean(backgroundError))"
              data-testid="branding-background-picker"
              class="h-9 w-12 rounded border border-border bg-card"
              :class="saving ? 'cursor-not-allowed' : 'cursor-pointer'"
              @input="onBackgroundPicked"
            />
            <Input
              v-model="background"
              :aria-label="$t('settings.branding.backgroundHexLabel')"
              autocomplete="off"
              :placeholder="BACKGROUND_DEFAULT"
              :aria-invalid="Boolean(backgroundError)"
              :aria-describedby="describedBy('branding-background', Boolean(backgroundError))"
              data-testid="branding-background-text"
              class="max-w-40"
              @blur="validateBackground"
            />
            <Button
              v-if="background"
              type="button"
              variant="outline"
              data-testid="branding-background-clear"
              @click="clearBackground"
            >
              {{ $t('settings.branding.colorClear') }}
            </Button>
          </div>

          <FieldDescription id="branding-background-help">{{
            $t('settings.branding.help.backgroundColor')
          }}</FieldDescription>

          <FieldError
            v-if="backgroundError"
            id="branding-background-error"
            data-testid="branding-background-error"
            >{{ backgroundError }}</FieldError
          >
        </Field>

        <!--
          The SHARED banner, not a hand-rolled Alert. `FormMessage` exists so
          "which role, which live region, which variant" is answered once —
          this copy had drifted to `role="alert"` with no live region while
          the shared one carries both, so two save failures in the same
          settings surface announced differently.
        -->
        <FormMessage
          v-if="formMessage"
          kind="error"
          :text="formMessage"
          test-id="branding-banner"
        />

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
 * Per-organization branding — logo, primary colour and candidate-page background (product decision 9,
 * reopened 2026-09-01).
 *
 * Admin-only, enforced by the section registry AND by the API. Both fields are
 * permanently optional: an organization that sets neither renders in the Quint
 * palette, so the empty state is a supported configuration rather than an
 * unfinished one.
 */
import { ref } from 'vue'
import { CheckIcon } from '@lucide/vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage from '@/components/molecules/FormMessage.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import ImageUploadField from '@/components/molecules/ImageUploadField.vue'
import { useOrganization, type OrganizationRecord } from '@/composables/useOrganization'
import { applyBrandColor } from '@/composables/useBrandTheme'
import { BRAND_PRIMARY, HEX } from '@/utils/brand'
import { applyServerFieldErrors } from '@/utils/http-error'
import { toSameOriginImageUrl } from '@/utils/image-url'
import { translateServerCodes } from '@/utils/server-message'

/**
 * Mirrors `config('branding.logo.max_bytes')` (api/config/branding.php) — a
 * client-side CONVENIENCE that fails an oversized file instantly without a
 * round trip, never the enforcement itself. The server re-checks the real
 * byte count of what it actually receives.
 */
const MAX_LOGO_BYTES = 1_048_576

const props = defineProps<{
  organization: OrganizationRecord
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { updateOrganization, uploadLogo, removeLogo } = useOrganization()
const { t, te } = useI18n()

const color = ref(props.organization.primary_color ?? '')
const background = ref(props.organization.background_color ?? '')

/** Candidate-page canvas presets; `DARK` is also what an unset value renders. */
const BACKGROUND_DEFAULT = '#0f172a'
const BACKGROUND_PRESETS = [
  { id: 'dark', label: 'presetDark', value: BACKGROUND_DEFAULT },
  { id: 'light', label: 'presetLight', value: '#f1f5f9' },
] as const
// The API builds `logo_url` from APP_URL; in local docker that is an http
// cross-origin URL the CSP blocks, so it is normalised to a same-origin path.
const logoUrl = ref(toSameOriginImageUrl(props.organization.logo_url))
const pendingFile = ref<File | null>(null)

const colorError = ref<string | undefined>(undefined)
const backgroundError = ref<string | undefined>(undefined)
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

/**
 * Clear IS a fix: an empty colour is the valid "use the product palette"
 * state. Assigning without revalidating left `colorError` and both controls'
 * `aria-invalid` reporting a field that had just become valid — and the Clear
 * button is `v-if="color"`, so it had already vanished, leaving nothing to
 * press to clear the error it caused.
 */
function clearColor(): void {
  color.value = ''
  validateColor()
}

function validateColor(): boolean {
  // Empty is VALID — it means "use the product palette". Treating it as an
  // error would make the field impossible to clear.
  colorError.value =
    color.value === '' || HEX.test(color.value) ? undefined : t('settings.branding.invalidColor')

  return colorError.value === undefined
}

function isPreset(value: string): boolean {
  return background.value.toLowerCase() === value
}

function pickPreset(value: string): void {
  background.value = value
  validateBackground()
}

function clearBackground(): void {
  background.value = ''
  validateBackground()
}

function validateBackground(): boolean {
  // Empty is VALID: it means the default dark canvas.
  backgroundError.value =
    background.value === '' || HEX.test(background.value)
      ? undefined
      : t('settings.branding.invalidBackgroundColor')

  return backgroundError.value === undefined
}

function onBackgroundPicked(event: Event): void {
  background.value = (event.target as HTMLInputElement).value
  validateBackground()
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
  // Same as the sibling: a rejected crop leaves `logoError` set, and a
  // successful removal must not leave an error standing about it. The
  // no-stored-logo branch of `onRemoveRequested` already clears it — this
  // destructive path was the one door left open.
  logoError.value = undefined
  saving.value = true

  try {
    const response = await removeLogo()
    logoUrl.value = toSameOriginImageUrl(response.data.logo_url)
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

  // Both run: short-circuiting would leave the second field's error unannounced.
  const valid = [validateColor(), validateBackground()].every(Boolean)
  if (!valid) return

  saving.value = true

  try {
    // The colour first. The two are separate endpoints because `logo_path` is
    // written only where a file was actually stored — so a failed upload must
    // not silently discard a colour the operator also changed.
    await updateOrganization({
      primary_color: color.value || null,
      background_color: background.value || null,
    })

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
      // `Organization::absoluteLogoUrl()` (api) already appends a `?v=` that
      // changes with every upload — the stored object's own filename — so
      // this URL is one the browser has never fetched. No client-side
      // cache-buster needed on top of it.
      logoUrl.value = toSameOriginImageUrl(response.data.logo_url)
      pendingFile.value = null
      // The crop is now the stored image; the local blob has nothing left to
      // say and holds a decoded bitmap for the life of the document.
      logoField.value?.clear()
    }

    emit('saved')
  } catch (submitError) {
    // The rejected crop goes, and BOTH halves of it. The control sets its
    // preview BEFORE it emits, so leaving the preview shows the refused image
    // on top of the STORED logo while `logoUrl` still points at the stored
    // one — and Remove is live, so confirming "the file will be permanently
    // deleted" would delete a logo the operator can no longer see.
    //
    // Clearing only the control is worse than clearing neither: the preview
    // goes, Remove is `v-if="displayUrl"` so it goes too, and the file stays
    // queued in `pendingFile` with NOTHING on screen referring to it. The
    // next save — of the colour alone — silently re-uploads the rejected
    // image and reports an error about a file the operator cannot see, with
    // no affordance short of a reload to get rid of it. `onRemoveLogo`
    // already clears both.
    pendingFile.value = null
    logoField.value?.clear()

    const unmapped = applyServerFieldErrors(
      submitError,
      { primary_color: 'color', background_color: 'background', logo: 'logo' } as const,
      (key, message) => {
        const translated = translateServerCodes({ t, te }, 'settings.branding.serverError', [
          message,
        ])[0]

        if (key === 'color') colorError.value = translated
        else if (key === 'background') backgroundError.value = translated
        else logoError.value = translated
      }
    )

    const mapped =
      colorError.value !== undefined ||
      backgroundError.value !== undefined ||
      logoError.value !== undefined

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
