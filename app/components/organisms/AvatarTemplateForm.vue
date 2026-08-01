<template>
  <form class="flex flex-col gap-4 rounded-md border border-border p-4" @submit.prevent="submit">
    <h2 class="text-lg font-semibold text-foreground">
      {{ isNew ? $t('avatar_templates.form.new_title') : $t('avatar_templates.form.edit_title') }}
    </h2>

    <ul
      v-if="errors.length > 0"
      data-testid="template-form-errors"
      class="flex flex-col gap-1 text-sm text-destructive"
    >
      <li v-for="error in errors" :key="error">{{ error }}</li>
    </ul>

    <label for="template-name" class="flex flex-col gap-1 text-sm">
      <span>{{ $t('avatar_templates.form.name') }}</span>
      <input
        id="template-name"
        v-model="draft.name"
        data-testid="template-field-name"
        type="text"
        required
        maxlength="120"
        class="rounded-md border border-border px-3 py-2"
      />
    </label>

    <label for="template-description" class="flex flex-col gap-1 text-sm">
      <span>{{ $t('avatar_templates.form.description') }}</span>
      <input
        id="template-description"
        v-model="draft.description"
        data-testid="template-field-description"
        type="text"
        maxlength="500"
        class="rounded-md border border-border px-3 py-2"
      />
    </label>

    <label for="template-provider" class="flex flex-col gap-1 text-sm">
      <span>{{ $t('avatar_templates.form.provider') }}</span>
      <!--
        Disabled once the template exists. The API refuses to change it, because
        every knob in the config belongs to one provider and none of them
        overlap — a switched provider would validate as empty and silently fall
        back to defaults. Rendered disabled rather than hidden so an operator
        can see WHICH provider a template uses without opening anything.
      -->
      <select
        id="template-provider"
        v-model="draft.provider"
        data-testid="template-field-provider"
        :disabled="!isNew"
        class="rounded-md border border-border px-3 py-2"
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
      -->
      <span class="text-xs text-muted-foreground">
        {{ $t('avatar_templates.form.provider_hint') }}
      </span>
    </label>

    <fieldset class="flex flex-col gap-3 border-t border-border pt-4">
      <legend class="sr-only">{{ $t('avatar_templates.form.settings') }}</legend>

      <label
        v-for="field in activeFields"
        :key="field.key"
        :for="`template-config-${field.key}`"
        class="flex flex-col gap-1 text-sm"
      >
        <span>
          {{ $t(field.label_key) }}
          <abbr
            v-if="field.required"
            :title="$t('avatar_templates.form.required')"
            class="no-underline"
            >*</abbr
          >
        </span>

        <select
          v-if="field.type === 'select'"
          :id="`template-config-${field.key}`"
          :data-testid="`template-config-${field.key}`"
          :value="stringValue(field.key)"
          class="rounded-md border border-border px-3 py-2"
          @change="setValue(field, ($event.target as HTMLSelectElement).value)"
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
          class="size-4 self-start"
          @change="setValue(field, ($event.target as HTMLInputElement).checked)"
        />

        <input
          v-else
          :id="`template-config-${field.key}`"
          :data-testid="`template-config-${field.key}`"
          :type="field.type === 'number' ? 'number' : 'text'"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :value="stringValue(field.key)"
          class="rounded-md border border-border px-3 py-2"
          @input="setValue(field, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </fieldset>

    <div class="flex gap-2">
      <button
        type="submit"
        data-testid="template-save"
        :disabled="saving"
        class="rounded-md border border-border px-4 py-2 text-sm font-medium"
      >
        {{ $t('avatar_templates.action.save') }}
      </button>
      <button
        type="button"
        data-testid="template-cancel"
        class="rounded-md border border-border px-4 py-2 text-sm font-medium"
        @click="emit('cancel')"
      >
        {{ $t('avatar_templates.action.cancel') }}
      </button>
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
 */
import { computed, ref, watch } from 'vue'
import type { AvatarTemplate, FieldSpec, ProviderName } from '@/types/avatar-template'

const props = defineProps<{
  template: Partial<AvatarTemplate>
  fieldSpecs: Record<ProviderName, FieldSpec[]>
  saving: boolean
  errors: string[]
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'submit', payload: Partial<AvatarTemplate>): void
}>()

const providers: ProviderName[] = ['heygen', 'tavus']

const draft = ref({
  name: props.template.name ?? '',
  description: props.template.description ?? '',
  provider: (props.template.provider ?? 'heygen') as ProviderName,
  config: { ...(props.template.config ?? {}) } as Record<string, unknown>,
})

const isNew = computed(() => props.template.id === undefined)
const activeFields = computed(() => props.fieldSpecs[draft.value.provider] ?? [])

// Switching provider on a NEW template clears the config. Carrying the old
// values over would post knobs belonging to the other provider, which the API
// rejects as unknown keys — a validation wall for an action that felt like
// changing one dropdown.
watch(
  () => draft.value.provider,
  () => {
    if (isNew.value) draft.value.config = {}
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
function setValue(field: FieldSpec, raw: string | boolean): void {
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

function submit(): void {
  emit('submit', {
    ...(props.template.id === undefined ? {} : { id: props.template.id }),
    name: draft.value.name,
    description: draft.value.description === '' ? null : draft.value.description,
    provider: draft.value.provider,
    config: draft.value.config,
  })
}
</script>
