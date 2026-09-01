<template>
  <form data-testid="branding-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <!--
        The LOGO. Absent is a supported, permanent state — the product ships
        with a mark of its own — so the empty case shows the Quint logo rather
        than a placeholder that reads as broken.
      -->
        <Field>
          <FieldLabel for="branding-logo">{{ $t('settings.branding.logo') }}</FieldLabel>

          <div class="flex items-center gap-4">
            <img
              v-if="logoUrl"
              :src="logoUrl"
              :alt="$t('settings.branding.logoAlt')"
              data-testid="branding-logo-preview"
              class="h-12 w-auto max-w-40 rounded border border-border bg-card object-contain p-1"
            />
            <p v-else class="text-sm text-muted-foreground" data-testid="branding-logo-empty">
              {{ $t('settings.branding.logoEmpty') }}
            </p>

            <input
              id="branding-logo"
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png"
              data-testid="branding-logo-input"
              class="text-sm"
              @change="onFileChosen"
            />

            <Button
              v-if="logoUrl"
              type="button"
              variant="outline"
              data-testid="branding-logo-remove"
              @click="confirmingRemoval = true"
            >
              {{ $t('settings.branding.logoRemove') }}
            </Button>
          </div>

          <!--
          `accept` on the input is a CONVENIENCE, never the check: it filters the
          file picker and is trivially bypassed. The server decides on the file's
          magic bytes. Saying so here stops a future reader treating the attribute
          as the guarantee.
        -->
          <FieldDescription>{{ $t('settings.branding.help.logo') }}</FieldDescription>

          <FieldError v-if="logoError" data-testid="branding-logo-error">{{
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
              :value="color || '#771AAF'"
              data-testid="branding-color-picker"
              class="h-9 w-12 cursor-pointer rounded border border-border bg-card"
              @input="onColorPicked"
            />
            <Input
              v-model="color"
              autocomplete="off"
              placeholder="#771AAF"
              :aria-invalid="Boolean(colorError)"
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

          <FieldDescription>{{ $t('settings.branding.help.primaryColor') }}</FieldDescription>

          <FieldError v-if="colorError" data-testid="branding-color-error">{{
            colorError
          }}</FieldError>
        </Field>

        <Alert
          v-if="formMessage"
          variant="destructive"
          role="alert"
          aria-live="polite"
          data-testid="branding-banner"
        >
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
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCodes } from '@/utils/server-message'

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
const fileInput = ref<HTMLInputElement | null>(null)

const colorError = ref<string | undefined>(undefined)
const logoError = ref<string | undefined>(undefined)
const formMessage = ref<string | null>(null)
const confirmingRemoval = ref(false)
const saving = ref(false)

/**
 * The SAME shape the server enforces, and deliberately so.
 *
 * `\A`/`\z` rather than `^`/`$`: in JavaScript `$` does not match before a
 * final newline the way PCRE's does, but keeping the two rules visibly
 * identical is what stops them drifting — a client rule that is merely
 * "similar" to the server's produces a field the operator can fill in and the
 * server then rejects.
 */
const HEX = /^#[0-9a-f]{6}$/i

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

function onFileChosen(event: Event): void {
  logoError.value = undefined
  pendingFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function onRemoveLogo(): Promise<void> {
  confirmingRemoval.value = false
  formMessage.value = null
  saving.value = true

  try {
    const response = await removeLogo()
    logoUrl.value = response.data.logo_url ?? null
    emit('saved')
  } catch {
    formMessage.value = t('settings.branding.saveError')
  } finally {
    saving.value = false
  }
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

    if (pendingFile.value !== null) {
      const response = await uploadLogo(pendingFile.value)
      logoUrl.value = response.data.logo_url ?? null
      pendingFile.value = null
      if (fileInput.value) fileInput.value.value = ''
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

    formMessage.value =
      unmapped && unmapped.length > 0
        ? translateServerCodes({ t, te }, 'settings.branding.serverError', unmapped).join(' ')
        : t('settings.branding.saveError')
  } finally {
    saving.value = false
  }
}
</script>
