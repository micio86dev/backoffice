<template>
  <form novalidate @submit.prevent="submit">
    <h2 class="text-lg font-semibold text-foreground">
      {{ isNew ? $t('avatar_templates.form.new_title') : $t('avatar_templates.form.edit_title') }}
    </h2>

    <!--
      D4: kept as the form-level banner, fed ONLY by messages the per-field
      parsing below could not place — a config message naming a knob the
      current provider does not expose, a top-level field with no control, or
      anything unparseable. Removing this would make those invisible, which is
      the exact defect this change exists to remove.
    -->
    <ul
      v-if="unmappedErrors.length > 0"
      data-testid="template-form-errors"
      role="alert"
      class="flex flex-col gap-1 text-sm text-destructive"
    >
      <li v-for="error in unmappedErrors" :key="error">{{ error }}</li>
    </ul>

    <Field :data-invalid="Boolean(nameError)">
      <FieldLabel for="template-name">{{ $t('avatar_templates.form.name') }}</FieldLabel>
      <input
        id="template-name"
        v-model="draft.name"
        data-testid="template-field-name"
        type="text"
        autocomplete="off"
        :aria-invalid="Boolean(nameError)"
        :aria-describedby="nameDescribedBy"
        :class="formControlClass"
        @blur="validateName"
      />
      <FieldDescription id="template-name-help">
        {{ $t('avatar_templates.form.help.name') }}
      </FieldDescription>
      <FieldError v-if="nameError" id="template-name-error" data-testid="template-name-error">
        {{ nameError }}
      </FieldError>
    </Field>

    <Field :data-invalid="Boolean(descriptionError)">
      <FieldLabel for="template-description">{{
        $t('avatar_templates.form.description')
      }}</FieldLabel>
      <input
        id="template-description"
        v-model="draft.description"
        data-testid="template-field-description"
        type="text"
        autocomplete="off"
        :aria-invalid="Boolean(descriptionError)"
        :aria-describedby="descriptionError ? 'template-description-error' : undefined"
        :class="formControlClass"
        @blur="validateDescription"
      />
      <FieldError
        v-if="descriptionError"
        id="template-description-error"
        data-testid="template-description-error"
      >
        {{ descriptionError }}
      </FieldError>
    </Field>

    <Field>
      <FieldLabel for="template-provider">{{ $t('avatar_templates.form.provider') }}</FieldLabel>
      <!--
        Disabled once the template exists. The API refuses to change it, because
        every knob in the config belongs to one provider and none of them
        overlap — a switched provider would validate as empty and silently fall
        back to defaults. Rendered disabled rather than hidden so an operator
        can see WHICH provider a template uses without opening anything.

        Same false-positive `vuejs-accessibility/form-control-has-label`
        escape documented on ProjectForm.vue/UserForm.vue — this is a native
        <select>, so the rule DOES see the `for`/`id` association; the escape
        here is for a different reason: eslint-plugin-vuejs-accessibility
        cannot see through `FieldLabel`'s `<label>`-via-slot indirection at
        the time this was written.
      -->
      <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
      <select
        id="template-provider"
        v-model="draft.provider"
        data-testid="template-field-provider"
        :disabled="!isNew"
        autocomplete="off"
        :class="formControlClass"
      >
        <option v-for="name in providers" :key="name" :value="name">
          {{ $t(`avatar_templates.provider.${name}`) }}
        </option>
      </select>
      <span v-if="!isNew" class="text-xs text-muted-foreground">
        {{ $t('avatar_templates.form.provider_locked') }}
      </span>
      <!--
        The vendor IS named here, deliberately. Provider anonymity is a promise
        to the CANDIDATE, not to the operator — and an operator who cannot tell
        which service a template targets cannot know which dashboard to copy an
        avatar id from. Hiding it would make the field unusable to serve a
        requirement it does not belong to.

        Converges onto FieldDescription (D5/D6) — same string, no copy change,
        just no longer a raw <span> a Field-conversion could orphan.
      -->
      <FieldDescription>
        {{ $t('avatar_templates.form.provider_hint') }}
      </FieldDescription>
    </Field>

    <fieldset class="flex flex-col gap-3 border-t border-border pt-4">
      <legend class="sr-only">{{ $t('avatar_templates.form.settings') }}</legend>

      <Field
        v-for="field in activeFields"
        :key="field.key"
        :data-invalid="Boolean(configErrors[field.key])"
      >
        <FieldLabel :for="`template-config-${field.key}`">
          {{ $t(field.label_key) }}
          <abbr
            v-if="field.required"
            :title="$t('avatar_templates.form.required')"
            class="no-underline"
            >*</abbr
          >
        </FieldLabel>

        <select
          v-if="field.type === 'select'"
          :id="`template-config-${field.key}`"
          :data-testid="`template-config-${field.key}`"
          :value="stringValue(field.key)"
          autocomplete="off"
          :aria-invalid="Boolean(configErrors[field.key])"
          :aria-required="field.required ? 'true' : undefined"
          :aria-describedby="describedBy(field)"
          :class="formControlClass"
          @change="onFieldChange(field, ($event.target as HTMLSelectElement).value)"
        >
          <!--
            An empty option is essential, not decoration: absent means "use the
            provider's default", and without a way back to absent an operator
            who opens a select can never unset it again.
          -->
          <option value="">{{ $t('avatar_templates.form.default') }}</option>
          <option v-for="option in field.options ?? []" :key="option" :value="option">
            {{ option }}
          </option>
        </select>

        <input
          v-else-if="field.type === 'checkbox'"
          :id="`template-config-${field.key}`"
          :data-testid="`template-config-${field.key}`"
          type="checkbox"
          :checked="draft.config[field.key] === true"
          :aria-invalid="Boolean(configErrors[field.key])"
          :aria-required="field.required ? 'true' : undefined"
          :aria-describedby="describedBy(field)"
          class="size-4 self-start accent-primary"
          @change="onFieldChange(field, ($event.target as HTMLInputElement).checked)"
        />

        <input
          v-else
          :id="`template-config-${field.key}`"
          :data-testid="`template-config-${field.key}`"
          :type="field.type === 'number' ? 'number' : 'text'"
          :value="stringValue(field.key)"
          autocomplete="off"
          :aria-invalid="Boolean(configErrors[field.key])"
          :aria-required="field.required ? 'true' : undefined"
          :aria-describedby="describedBy(field)"
          :class="formControlClass"
          @input="onFieldChange(field, ($event.target as HTMLInputElement).value)"
          @blur="validateConfigField(field)"
        />
        <FieldDescription v-if="field.hint_key" :id="`template-config-${field.key}-hint`">
          {{ $t(field.hint_key) }}
        </FieldDescription>
        <FieldError
          v-if="configErrors[field.key]"
          :id="`template-config-${field.key}-error`"
          :data-testid="`template-config-${field.key}-error`"
        >
          {{ configErrors[field.key] }}
        </FieldError>
      </Field>
    </fieldset>

    <div class="flex gap-2">
      <Button type="submit" data-testid="template-save" :disabled="saving">
        {{ $t('avatar_templates.action.save') }}
      </Button>
      <Button type="button" variant="outline" data-testid="template-cancel" @click="emit('cancel')">
        {{ $t('avatar_templates.action.cancel') }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * The template form, BUILT from the server's field specs (C14 PR6).
 *
 * Not one hand-written input per knob. The spec that drives this form is the
 * same one the API validates against and the same one the provider payload is
 * mapped from — so a knob added server-side appears here with no frontend
 * change, and a knob the server does not know about cannot appear at all.
 *
 * The alternative, three hand-maintained lists, drifts invisibly: a form
 * offering a control the payload never sends looks exactly like a control that
 * does not work.
 *
 * form-clarity-and-console-warnings (D3): converted onto the `Field`
 * primitives, `novalidate` + real JS validation replacing the native
 * `required`/`maxlength`/`min`/`max`/`step` bubbles, and per-field 422
 * placement — while deliberately KEEPING the native `<input>`/`<select>` +
 * `formControlClass` rather than swapping to `ui/input`/`ui/select`. See D3 in
 * the change's design.md: this form is `setValue`/`@change`-driven over
 * server `FieldSpec`s in a way the vendored `Select`/`Input` components
 * cannot support.
 */
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { formControlClass } from '@/components/ui/form-control'
import { getErrorFields } from '@/utils/http-error'
import { parseConfigError } from '@/utils/avatar-template-config-error'
import type { AvatarTemplate, FieldSpec, ProviderName } from '@/types/avatar-template'

const props = defineProps<{
  template: Partial<AvatarTemplate>
  fieldSpecs: Record<ProviderName, FieldSpec[]>
  saving: boolean
  submitError: unknown | null
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'submit', payload: Partial<AvatarTemplate>): void
}>()

const { t, te } = useI18n()

const NAME_MAX_LENGTH = 120
const DESCRIPTION_MAX_LENGTH = 500

const providers: ProviderName[] = ['heygen', 'tavus']

const draft = ref({
  name: props.template.name ?? '',
  description: props.template.description ?? '',
  provider: (props.template.provider ?? 'heygen') as ProviderName,
  config: { ...(props.template.config ?? {}) } as Record<string, unknown>,
})

const isNew = computed(() => props.template.id === undefined)
const activeFields = computed(() => props.fieldSpecs[draft.value.provider] ?? [])

const nameError = ref<string | undefined>(undefined)
const descriptionError = ref<string | undefined>(undefined)
const configErrors = ref<Record<string, string | undefined>>({})
const unmappedErrors = ref<string[]>([])

const nameDescribedBy = computed(() =>
  [nameError.value ? 'template-name-error' : null, 'template-name-help']
    .filter((id): id is string => id !== null)
    .join(' ')
)

function describedBy(field: FieldSpec): string | undefined {
  const ids = [
    configErrors.value[field.key] ? `template-config-${field.key}-error` : null,
    field.hint_key ? `template-config-${field.key}-hint` : null,
  ].filter((id): id is string => id !== null)

  return ids.length > 0 ? ids.join(' ') : undefined
}

// Switching provider on a NEW template clears the config. Carrying the old
// values over would post knobs belonging to the other provider, which the API
// rejects as unknown keys — a validation wall for an action that felt like
// changing one dropdown.
watch(
  () => draft.value.provider,
  () => {
    if (isNew.value) draft.value.config = {}
    configErrors.value = {}
  }
)

/**
 * Rebuilds the config WITHOUT a key.
 *
 * Not `delete config[key]`: a dynamic delete on a reactive object is both a
 * lint error and a deoptimisation, and rebuilding makes the intent — "this knob
 * is now absent" — the literal shape of the code.
 */
function withoutKey(config: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _removed, ...rest } = config

  return rest
}

function stringValue(key: string): string {
  const value = draft.value.config[key]

  return value === undefined || value === null ? '' : String(value)
}

/**
 * Writes a knob, DELETING it when the operator empties the input.
 *
 * An empty string must not be stored. The API treats absent as "use the
 * provider's default" and would reject '' as a type error on a number — so
 * clearing a field has to remove the key, not blank it.
 */
function onFieldChange(field: FieldSpec, raw: string | boolean): void {
  if (field.type === 'checkbox') {
    draft.value.config =
      raw === false
        ? withoutKey(draft.value.config, field.key)
        : { ...draft.value.config, [field.key]: true }

    return
  }

  const text = String(raw)

  if (text === '') {
    draft.value.config = withoutKey(draft.value.config, field.key)

    return
  }

  if (field.type === 'number') {
    const parsed = Number(text)

    // NaN is left out entirely rather than stored. Sending it would fail
    // validation with a type error about a field the operator can see they
    // filled in.
    if (Number.isNaN(parsed)) {
      draft.value.config = withoutKey(draft.value.config, field.key)

      return
    }

    draft.value.config = { ...draft.value.config, [field.key]: parsed }

    return
  }

  draft.value.config = { ...draft.value.config, [field.key]: text }
}

function validateName(): boolean {
  const trimmed = draft.value.name.trim()

  if (trimmed === '') {
    nameError.value = t('avatar_templates.form.errors.nameRequired')
  } else if (draft.value.name.length > NAME_MAX_LENGTH) {
    nameError.value = t('avatar_templates.form.errors.nameTooLong')
  } else {
    nameError.value = undefined
  }

  return !nameError.value
}

function validateDescription(): boolean {
  descriptionError.value =
    draft.value.description.length > DESCRIPTION_MAX_LENGTH
      ? t('avatar_templates.form.errors.descriptionTooLong')
      : undefined

  return !descriptionError.value
}

/**
 * `step` is deliberately NOT checked here (D3): float steps (0.01 on
 * `voiceSpeed`) make a JS modulo check produce false negatives, and the
 * server is authoritative on this one constraint.
 */
function validateConfigField(field: FieldSpec): boolean {
  const value = draft.value.config[field.key]

  if (field.required && (value === undefined || value === null)) {
    configErrors.value[field.key] = t('avatar_templates.form.errors.fieldRequired')

    return false
  }

  if (field.type === 'number' && typeof value === 'number') {
    const belowMin = field.min !== undefined && field.min !== null && value < field.min
    const aboveMax = field.max !== undefined && field.max !== null && value > field.max

    if (belowMin || aboveMax) {
      configErrors.value[field.key] = t('avatar_templates.form.errors.numberOutOfRange')

      return false
    }
  }

  configErrors.value[field.key] = undefined

  return true
}

function validateAllConfigFields(): boolean {
  let ok = true

  for (const field of activeFields.value) {
    if (!validateConfigField(field)) ok = false
  }

  return ok
}

/**
 * Per-field 422s, and the string contract nobody documented (D3). Verified in
 * the API: `AvatarTemplateController.php:234-239` throws
 * `ValidationException::withMessages(['config' => ["{$key}: {$code}", …]])` —
 * a SINGLE `config` key holding N flattened strings, not per-knob keys. This
 * is why the watcher below reads `getErrorFields` directly rather than going
 * through `applyServerFieldErrors`: that shared mapper takes only the FIRST
 * message per server field (the normal Laravel shape, one message per key),
 * which would silently drop every knob but the first under `config`. `name`
 * and `description` — ordinary single-message top-level fields — still go
 * through the same first-message convention as every other form.
 *
 * `parseConfigError` (this file's counterpart the API's own comment names)
 * splits each `config` message at the first `': '`; a parsed message is
 * claimed onto its control only when its key names a field THIS provider
 * currently renders — otherwise it stays in the summary, exactly like a
 * message this parser could not split at all. That total, safe fallback is
 * what makes a knob a since-changed provider spec no longer exposes still
 * reach the operator.
 */
watch(
  () => props.submitError,
  (submitError) => {
    nameError.value = undefined
    descriptionError.value = undefined
    configErrors.value = {}
    unmappedErrors.value = []

    const fields = getErrorFields(submitError)
    if (fields === null) return

    const activeKeys = new Set(activeFields.value.map((field) => field.key))

    for (const [serverField, messages] of Object.entries(fields)) {
      if (serverField === 'config') {
        for (const message of messages) {
          const parsed = parseConfigError(message)

          if (parsed !== null && activeKeys.has(parsed.key)) {
            const translationKey = `avatar_templates.error.config.${parsed.code}`
            // Falls back to the RAW server message when the code has no
            // translation — an untranslated code the operator can at least
            // read beats an i18n key echoed back as if it were prose. `te`
            // is optional here defensively: every REAL i18n instance
            // provides it, but a test double that only stubs `t` should not
            // crash the whole watcher.
            const hasTranslation = typeof te === 'function' ? te(translationKey) : true
            configErrors.value[parsed.key] = hasTranslation ? t(translationKey) : message
          } else {
            unmappedErrors.value.push(message)
          }
        }

        continue
      }

      const message = messages?.[0]
      if (message === undefined) continue

      if (serverField === 'name') nameError.value = message
      else if (serverField === 'description') descriptionError.value = message
      else if (!unmappedErrors.value.includes(message)) unmappedErrors.value.push(message)
    }
  },
  { immediate: true }
)

function submit(): void {
  const nameOk = validateName()
  const descriptionOk = validateDescription()
  const configOk = validateAllConfigFields()

  if (!nameOk || !descriptionOk || !configOk) return

  emit('submit', {
    ...(props.template.id === undefined ? {} : { id: props.template.id }),
    name: draft.value.name,
    description: draft.value.description === '' ? null : draft.value.description,
    provider: draft.value.provider,
    config: draft.value.config,
  })
}
</script>
