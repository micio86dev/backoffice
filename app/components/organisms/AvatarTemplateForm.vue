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

      <!--
        A checkbox lays out horizontally, everything else vertically, and that
        is a layout fact rather than taste. `fieldVariants`' vertical
        orientation carries `*:w-full`, which stretches EVERY direct child to
        the container width. A select or a text input wants exactly that. A
        16px checkbox does not — and `size-4` on the input cannot win, because
        `*:w-full` compiles to a child combinator and outranks a class on the
        element itself. So it rendered as a box the full width of the page.
        The horizontal variant drops `*:w-full` and gives `flex-row
        items-center`, which is also what a checkbox beside its label should
        look like.
      -->
      <Field
        v-for="field in activeFields"
        :key="field.key"
        :orientation="field.type === 'checkbox' ? 'horizontal' : 'vertical'"
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

    <!--
      pluggable-conversation-llm PR P8. A separate fieldset from the
      provider's own settings above: the binding is provider-agnostic
      (I2/I5 gate on the MODEL, not on `provider`), so it does not belong
      inside `activeFields`'s provider-keyed loop.
    -->
    <fieldset
      class="flex flex-col gap-3 border-t border-border pt-4"
      data-testid="template-llm-section"
    >
      <legend class="sr-only">{{ $t('avatar_templates.llm.section') }}</legend>

      <p
        v-if="draft.llmModelKey === null"
        data-testid="template-llm-unbound-badge"
        class="text-sm text-muted-foreground"
      >
        {{ $t('avatar_templates.llm.badge.unbound') }}
      </p>

      <LlmModelPicker
        id="template-llm-model"
        v-model="draft.llmModelKey"
        :label="$t('avatar_templates.llm.picker.label')"
        :models="models"
      />
      <FieldError v-if="llmModelError" data-testid="template-llm-model-error">
        {{ llmModelError }}
      </FieldError>

      <Field :data-invalid="Boolean(llmCredentialError)">
        <FieldLabel for="template-llm-credential">
          {{ $t('avatar_templates.llm.credential.label') }}
        </FieldLabel>
        <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
        <select
          id="template-llm-credential"
          data-testid="template-llm-credential"
          autocomplete="off"
          :aria-invalid="Boolean(llmCredentialError)"
          :class="formControlClass"
          :value="draft.llmCredentialId === null ? '' : String(draft.llmCredentialId)"
          @change="onCredentialChange"
        >
          <option value="">{{ $t('avatar_templates.llm.credential.none') }}</option>
          <option v-for="credential in credentials" :key="credential.id" :value="credential.id">
            {{ credential.name }}
          </option>
        </select>
        <FieldError v-if="llmCredentialError" data-testid="template-llm-credential-error">
          {{ llmCredentialError }}
        </FieldError>
      </Field>

      <LlmModeExplainer />
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
import { computed, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { formControlClass } from '@/components/ui/form-control'
import { getErrorFields } from '@/utils/http-error'
import { useLlmCredentials } from '@/composables/useLlmCredentials'
import { useLlmModels } from '@/composables/useLlmModels'
import LlmModelPicker from '@/components/molecules/LlmModelPicker.vue'
import LlmModeExplainer from '@/components/molecules/LlmModeExplainer.vue'
import type { AvatarTemplate, FieldSpec, ProviderName } from '@/types/avatar-template'
import type { LlmCredential, LlmModel } from '@/types/llm'

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
  // pluggable-conversation-llm PR P8. `llmModelKey` is the PICKER's value
  // (design D1's natural key — `LlmModelPicker` is built around it, not a
  // numeric id). `llmCredentialId` needs no such translation:
  // `LlmCredentialResource` has always serialized its own `id` — there was
  // never a read-surface gap on the credential side, only on the model side.
  llmModelKey: null as string | null,
  llmCredentialId: props.template.llm_credential_id ?? null,
})

const isNew = computed(() => props.template.id === undefined)
const activeFields = computed(() => props.fieldSpecs[draft.value.provider] ?? [])

const nameError = ref<string | undefined>(undefined)
const descriptionError = ref<string | undefined>(undefined)
const configErrors = ref<Record<string, string | undefined>>({})
const unmappedErrors = ref<string[]>([])
const llmModelError = ref<string | undefined>(undefined)
const llmCredentialError = ref<string | undefined>(undefined)

// The models list is the ONLY place an id↔key mapping can be resolved from
// (design D1: `LlmModelResource` exposes both now; the picker still keys on
// `key`). Loaded once, not cached across mounts — this form is short-lived
// and a stale registry read is worse than a second request, same doctrine
// as `useLlmModels`/`useLlmCredentials`'s own docblocks.
const models = ref<LlmModel[]>([])
const credentials = ref<LlmCredential[]>([])

const { listModels } = useLlmModels()
const { listCredentials } = useLlmCredentials()

onMounted(async () => {
  // `Promise.allSettled`, deliberately not a try/rescue pair: either load
  // failing must leave the OTHER one intact, and `form-contract.spec.ts`'s
  // R3 guard requires every rejection-handling block in a form file to route
  // through `applyServerFieldErrors` — which a background catalogue load has
  // no business doing, since it is not a submit rejection.
  const [modelsOutcome, credentialsOutcome] = await Promise.allSettled([
    listModels(),
    listCredentials(),
  ])

  if (modelsOutcome.status === 'fulfilled') {
    models.value = modelsOutcome.value.data

    // I5's grandfathering trap, resolved here rather than in the picker:
    // the registry NEVER deletes a withdrawn model (`is_available: false`
    // only), so a template already bound to one still finds it in this
    // list — its `key` is what the picker needs to render it selected AND
    // labelled, and what makes the round-trip on submit below possible at
    // all.
    const boundModel = models.value.find((model) => model.id === props.template.llm_model_id)
    draft.value.llmModelKey = boundModel?.key ?? null
  }
  // A rejected load leaves `models`/`credentials` empty: the picker renders
  // only the "provider default" option, which is honest — better than
  // pretending a catalogue exists.

  if (credentialsOutcome.status === 'fulfilled') {
    credentials.value = credentialsOutcome.value.data
  }
})

// Invariant I1 (both-or-neither) is a DB CHECK, not a suggestion — clearing
// ONE binding field must clear the other, or a submit reaches the server
// half-bound and comes back as a 422 the operator did not cause on purpose.
watch(
  () => draft.value.llmModelKey,
  (key) => {
    if (key === null) draft.value.llmCredentialId = null
  }
)
watch(
  () => draft.value.llmCredentialId,
  (id) => {
    if (id === null) draft.value.llmModelKey = null
  }
)

function onCredentialChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  draft.value.llmCredentialId = select.value === '' ? null : Number(select.value)
}

/**
 * The picker emits a `key`; the API wants the matching `id`. `null` maps to
 * `null` unconditionally — an unbind must reach the server as an explicit
 * `null`, never be silently dropped as "unchanged" (see
 * `useAvatarTemplates.ts`'s docblock on the same point).
 */
function resolveModelId(key: string | null): number | null {
  if (key === null) return null

  return models.value.find((model) => model.key === key)?.id ?? null
}

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
 * Per-field 422s, keyed per knob (generated-client-truth-and-session-safety
 * D6). `AvatarTemplateController::assertConfigValid` now throws
 * `ValidationException::withMessages(['config.{key}' => $code, ...])` — one
 * `config.{knob}` server key per invalid knob, never a single flattened
 * `config` array. This is why the watcher below reads `getErrorFields`
 * directly rather than going through `applyServerFieldErrors`: that shared
 * mapper assigns by an EXACT key match, and there is no one static key to
 * assign `config.avatarId`/`config.voiceSpeed`/… onto. `name` and
 * `description` — ordinary single-message top-level fields — still go
 * through the same first-message convention as every other form.
 *
 * The key IS the knob now — no `parseConfigError` message-text parsing. A
 * `config.{key}` entry is claimed onto its control only when the key names a
 * field THIS provider currently renders — otherwise it stays in the summary,
 * same total fallback as before. That is what makes a knob a since-changed
 * provider spec no longer exposes still reach the operator. The bare
 * `config` key (non-array `config`) is handled by the generic top-level
 * branch below and lands in the summary — it can never co-occur with a
 * `config.*` key (disjoint by construction, per the API).
 */
watch(
  () => props.submitError,
  (submitError) => {
    nameError.value = undefined
    descriptionError.value = undefined
    configErrors.value = {}
    unmappedErrors.value = []
    llmModelError.value = undefined
    llmCredentialError.value = undefined

    const fields = getErrorFields(submitError)
    if (fields === null) return

    const activeKeys = new Set(activeFields.value.map((field) => field.key))
    const CONFIG_PREFIX = 'config.'

    for (const [serverField, messages] of Object.entries(fields)) {
      const message = messages?.[0]
      if (message === undefined) continue

      // `llm_model_id` carries BOTH I2's `mode_unsupported` and I5's
      // `model_unavailable` (`AvatarTemplate::booted()`); `llm_credential_id`
      // carries I3/I4's `credential_not_found` for EITHER "no such
      // credential" or "another org's credential" — deliberately one code
      // for both, per design D9's existence-oracle doctrine, so this mapper
      // makes no attempt to tell them apart. Same `config.{key}` mechanism as
      // the branch below: a `te()`-gated translation, falling back to the
      // raw server code when no copy exists for it yet.
      if (serverField === 'llm_model_id' || serverField === 'llm_credential_id') {
        const translationKey = `avatar_templates.error.llm.${message}`
        const hasTranslation = typeof te === 'function' ? te(translationKey) : true
        const resolved = hasTranslation ? t(translationKey) : message

        if (serverField === 'llm_model_id') llmModelError.value = resolved
        else llmCredentialError.value = resolved

        continue
      }

      if (serverField.startsWith(CONFIG_PREFIX)) {
        const key = serverField.slice(CONFIG_PREFIX.length)

        if (activeKeys.has(key)) {
          const translationKey = `avatar_templates.error.config.${message}`
          // Falls back to the RAW server code when it has no translation —
          // an untranslated code the operator can at least read beats an
          // i18n key echoed back as if it were prose. `te` is optional here
          // defensively: every REAL i18n instance provides it, but a test
          // double that only stubs `t` should not crash the whole watcher.
          const hasTranslation = typeof te === 'function' ? te(translationKey) : true
          configErrors.value[key] = hasTranslation ? t(translationKey) : message
        } else {
          unmappedErrors.value.push(message)
        }

        continue
      }

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
    llm_model_id: resolveModelId(draft.value.llmModelKey),
    llm_credential_id: draft.value.llmCredentialId,
  })
}
</script>
