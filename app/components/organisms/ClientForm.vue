<template>
  <Alert v-if="loadFailed" variant="destructive" data-testid="client-load-error">
    <AlertTitle>{{ $t('clients.form.loadErrorTitle') }}</AlertTitle>
    <AlertDescription>{{ $t('clients.form.loadErrorBody') }}</AlertDescription>
  </Alert>

  <p v-else-if="loading" role="status" class="text-sm text-muted-foreground">
    {{ $t('clients.form.loading') }}
  </p>

  <form v-else id="client-form" data-testid="client-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <Field :data-invalid="Boolean(nameError)">
          <FieldLabel for="client-name">{{ $t('clients.form.name') }}</FieldLabel>
          <Input
            id="client-name"
            v-model="name"
            autocomplete="off"
            :aria-invalid="Boolean(nameError)"
            :aria-describedby="describedBy('client-name', Boolean(nameError))"
            data-testid="client-name"
            @blur="validateName"
          />
          <FieldDescription id="client-name-help">{{
            $t('clients.form.help.name')
          }}</FieldDescription>
          <FieldError v-if="nameError" id="client-name-error" data-testid="client-name-error">
            {{ nameError }}
          </FieldError>
        </Field>

        <!--
          The slug is a tenancy identifier: chosen once, at creation, and shown
          read-only afterwards. It is a real (readonly) input in edit rather than
          plain text so the value can still be selected and copied.
        -->
        <Field :data-invalid="Boolean(slugError)">
          <FieldLabel for="client-slug">{{ $t('clients.form.slug') }}</FieldLabel>
          <Input
            id="client-slug"
            v-model="slug"
            autocomplete="off"
            :readonly="isEdit"
            :aria-invalid="Boolean(slugError)"
            :aria-describedby="describedBy('client-slug', Boolean(slugError))"
            data-testid="client-slug"
            @blur="validateSlug"
          />
          <FieldDescription id="client-slug-help">
            {{ isEdit ? $t('clients.form.help.slugLocked') : $t('clients.form.help.slug') }}
          </FieldDescription>
          <FieldError v-if="slugError" id="client-slug-error" data-testid="client-slug-error">
            {{ slugError }}
          </FieldError>
        </Field>

        <Field :data-invalid="Boolean(colorError)">
          <FieldLabel for="client-color">{{ $t('settings.branding.primaryColor') }}</FieldLabel>
          <div class="flex items-center gap-3">
            <input
              id="client-color"
              type="color"
              :value="color || BRAND_PRIMARY"
              :aria-invalid="Boolean(colorError)"
              :aria-describedby="describedBy('client-color', Boolean(colorError))"
              data-testid="client-color-picker"
              class="h-9 w-12 cursor-pointer rounded border border-border bg-card"
              @input="onColorPicked"
            />
            <Input
              v-model="color"
              :aria-label="$t('settings.branding.colorHexLabel')"
              autocomplete="off"
              :placeholder="BRAND_PRIMARY"
              :aria-invalid="Boolean(colorError)"
              :aria-describedby="describedBy('client-color', Boolean(colorError))"
              data-testid="client-color-text"
              class="max-w-40"
              @blur="validateColor"
            />
            <Button
              v-if="color"
              type="button"
              variant="outline"
              data-testid="client-color-clear"
              @click="clearColor"
            >
              {{ $t('settings.branding.colorClear') }}
            </Button>
          </div>
          <FieldDescription id="client-color-help">
            {{ $t('clients.form.help.primaryColor') }}
          </FieldDescription>
          <FieldError v-if="colorError" id="client-color-error" data-testid="client-color-error">
            {{ colorError }}
          </FieldError>
        </Field>

        <FormMessage
          v-if="formMessage"
          kind="error"
          :text="formMessage"
          test-id="client-form-banner"
        />
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
/**
 * Create or edit an organization (superadmin only; template-provider-fixes T7).
 *
 * One form for both. Create takes a name, an optional slug and an optional
 * primary colour; edit loads the organization, changes name and colour, and
 * shows the slug read-only because the API refuses to change it.
 *
 * The create endpoint accepts no colour, so a colour chosen at creation is
 * applied with a follow-up PATCH. If that second call fails the organization
 * already exists: the form keeps its id and the next submit updates instead of
 * creating again (which would only answer `slug_taken`).
 *
 * Save/cancel live in the surrounding `FormDrawer`, which drives this form by
 * its id and follows `update:pending`.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage from '@/components/molecules/FormMessage.vue'
import { useSuperadmin } from '@/composables/useSuperadmin'
import { BRAND_PRIMARY, HEX } from '@/utils/brand'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCodes } from '@/utils/server-message'

/** Lowercase words joined by single hyphens — what the API accepts as a slug. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const props = defineProps<{
  /** Present to edit that organization; absent to create one. */
  clientId?: number
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'update:pending', value: boolean): void
}>()

const { t, te } = useI18n()
const { createClient, fetchClient, updateClient } = useSuperadmin()

// Set once the organization exists — from the prop when editing, from the
// create response otherwise.
const targetId = ref<number | null>(props.clientId ?? null)
const isEdit = computed(() => props.clientId !== undefined)

const name = ref('')
const slug = ref('')
const color = ref('')

const nameError = ref<string | undefined>(undefined)
const slugError = ref<string | undefined>(undefined)
const colorError = ref<string | undefined>(undefined)
const formMessage = ref<string | null>(null)

const loading = ref(isEdit.value)
const loadFailed = ref(false)
const saving = ref(false)

watch(saving, (value) => emit('update:pending', value), { immediate: true })

onMounted(async () => {
  if (props.clientId === undefined) return

  try {
    const { data } = await fetchClient(props.clientId)
    name.value = data.name
    slug.value = data.slug
    color.value = data.primary_color ?? ''
  } catch {
    // Never a form the operator could save blind: a name and colour that were
    // never loaded would overwrite the real ones with blanks.
    loadFailed.value = true
  } finally {
    loading.value = false
  }
})

function describedBy(baseId: string, hasError: boolean): string {
  return [hasError ? `${baseId}-error` : null, `${baseId}-help`]
    .filter((id): id is string => id !== null)
    .join(' ')
}

function validateName(): boolean {
  nameError.value = name.value.trim() === '' ? t('clients.form.errors.name_required') : undefined

  return nameError.value === undefined
}

function validateSlug(): boolean {
  // Blank is valid on create (the API derives one) and irrelevant on edit.
  slugError.value =
    isEdit.value || slug.value === '' || SLUG.test(slug.value)
      ? undefined
      : t('clients.form.errors.slug_invalid')

  return slugError.value === undefined
}

function validateColor(): boolean {
  // Empty is VALID: it means "use the product palette".
  colorError.value =
    color.value === '' || HEX.test(color.value)
      ? undefined
      : t('clients.form.errors.primary_color_invalid')

  return colorError.value === undefined
}

function clearColor(): void {
  color.value = ''
  validateColor()
}

function onColorPicked(event: Event): void {
  color.value = (event.target as HTMLInputElement).value
  validateColor()
}

/** Which errors landed on a field, and which the banner still has to say. */
function showServerError(error: unknown): void {
  const unmapped = applyServerFieldErrors(
    error,
    { name: 'name', slug: 'slug', primary_color: 'color' } as const,
    (key, message) => {
      const translated = translateServerCodes({ t, te }, 'clients.form.serverError', [message])[0]

      if (key === 'name') nameError.value = translated
      else if (key === 'slug') slugError.value = translated
      else colorError.value = translated
    }
  )

  const mapped =
    nameError.value !== undefined || slugError.value !== undefined || colorError.value !== undefined

  if (unmapped !== null && unmapped.length > 0) {
    formMessage.value = translateServerCodes({ t, te }, 'clients.form.serverError', unmapped).join(
      ' '
    )
  } else if (!mapped) {
    formMessage.value = t('clients.form.saveError')
  }
}

async function onSubmit(): Promise<void> {
  formMessage.value = null

  // Every validator runs, so an operator with two problems sees both.
  const nameOk = validateName()
  const slugOk = validateSlug()
  const colorOk = validateColor()
  if (!nameOk || !slugOk || !colorOk) return

  saving.value = true

  try {
    if (targetId.value === null) {
      const created = await createClient({
        name: name.value.trim(),
        ...(slug.value === '' ? {} : { slug: slug.value }),
      })
      targetId.value = created.data.id

      if (color.value !== '') await updateClient(targetId.value, { primary_color: color.value })
    } else {
      await updateClient(targetId.value, {
        name: name.value.trim(),
        primary_color: color.value === '' ? null : color.value,
      })
    }

    emit('saved')
  } catch (error) {
    showServerError(error)
  } finally {
    saving.value = false
  }
}
</script>
