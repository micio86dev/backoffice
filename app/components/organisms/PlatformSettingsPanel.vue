<template>
  <form data-testid="platform-settings-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <Field :data-invalid="Boolean(errors.standard)">
          <FieldLabel for="platform-max-questions-standard">
            {{ $t('settings.platform.maxQuestions.standard') }}
          </FieldLabel>
          <Input
            id="platform-max-questions-standard"
            v-model="standard"
            type="number"
            inputmode="numeric"
            min="1"
            max="10"
            autocomplete="off"
            :aria-invalid="Boolean(errors.standard)"
            :aria-describedby="describedBy('standard')"
            data-testid="platform-max-questions-standard"
          />
          <FieldDescription id="platform-max-questions-standard-help">
            {{ $t('settings.platform.maxQuestions.standardHelp') }}
          </FieldDescription>
          <FieldError
            v-if="errors.standard"
            id="platform-max-questions-standard-error"
            data-testid="platform-standard-error"
          >
            {{ errors.standard }}
          </FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.potential)">
          <FieldLabel for="platform-max-questions-potential">
            {{ $t('settings.platform.maxQuestions.potential') }}
          </FieldLabel>
          <Input
            id="platform-max-questions-potential"
            v-model="potential"
            type="number"
            inputmode="numeric"
            min="1"
            max="10"
            autocomplete="off"
            :aria-invalid="Boolean(errors.potential)"
            :aria-describedby="describedBy('potential')"
            data-testid="platform-max-questions-potential"
          />
          <FieldDescription id="platform-max-questions-potential-help">
            {{ $t('settings.platform.maxQuestions.potentialHelp') }}
          </FieldDescription>
          <FieldError
            v-if="errors.potential"
            id="platform-max-questions-potential-error"
            data-testid="platform-potential-error"
          >
            {{ errors.potential }}
          </FieldError>
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="platform-settings-banner"
        />

        <!--
          Disabled rather than hidden until the current values have been read.
          A control that vanishes reads as "you may not do this"; this one is
          "not yet", and the banner above says why.
        -->
        <Button
          type="submit"
          :loading="saving"
          :disabled="!loaded"
          data-testid="platform-settings-submit"
        >
          {{ $t('projects.action.save') }}
        </Button>
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
/**
 * PlatformSettingsPanel — BEAI's own knobs, not a client's.
 *
 * The only settings section that is NOT gated on an ability, because it is not
 * an ability question: these rows belong to the platform, and the superadmin —
 * who belongs to no organization — is the only identity that may write them.
 * `settings/index.vue` gates it on `is_superadmin` for that reason, and the
 * endpoints answer 403 to every tenant role regardless.
 *
 * WHAT THE CAP MEANS, and why it is here rather than in a client's settings: a
 * `standard` interview may carry ONE predefined question per competency by
 * default because the adaptivity is the product — the interviewer is meant to
 * follow the candidate, not read a script. A client able to raise that would
 * turn a BARS interview into a questionnaire while still calling it a BARS
 * interview.
 */
import { computed, onMounted, ref } from 'vue'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormFieldset } from '@/components/ui/form-fieldset'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { usePlatformSettings, type PlatformSettingsCaps } from '@/composables/usePlatformSettings'
import { applyServerFieldErrors } from '@/utils/http-error'

const emit = defineEmits<{ (e: 'saved'): void }>()

const { fetchPlatformSettings, updatePlatformSettings } = usePlatformSettings()
const { t } = useI18n()

// Held as STRINGS because that is what an `<input type="number">` binds, and
// coercing on every keystroke turns a half-typed value into 0 while the
// operator is still typing it. Parsed once, on submit.
const standard = ref('1')
const potential = ref('4')
const saving = ref(false)

/**
 * Has the current stored value actually been READ?
 *
 * Until it has, the two numbers on screen are the product's compiled-in
 * defaults, not this platform's settings — and `onSubmit` sends BOTH keys, so
 * one click on a form whose read had failed would overwrite the real stored
 * caps with values the operator never saw and did not choose. Silent, and
 * indistinguishable from a deliberate change afterwards.
 *
 * The server's PATCH is partial precisely so a narrow edit stays narrow; a
 * panel that always sends the whole map cannot benefit from that. So saving is
 * withheld until there is something true to save against.
 */
const loaded = ref(false)
// One per FIELD, not one shared. A single ref drove `data-invalid` and
// `aria-invalid` on the standard input alone, so typing 99 into `potential`
// announced `standard` as invalid — it wasn't — and marked `potential` as
// nothing at all. WCAG 3.3.1 asks which field is wrong, and the answer has to
// be the field that is.
const errors = ref<{ standard?: string; potential?: string }>({})
const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)

/**
 * What describes this field, error FIRST.
 *
 * `aria-describedby` used to be a static string naming only the help text, and
 * the `<FieldError>` had no id to point at — so `aria-invalid` told a screen
 * reader the value was wrong and nothing told it WHY. An operator tabbing back
 * to fix it heard the label and the hint, never the message.
 *
 * Same shape every other form in this app already uses (WebhookDefaultsForm,
 * ProfilePasswordForm, AvatarTemplateForm, and the rest); this panel was the
 * only one hardcoding it. Note the arch guard could not see it: form-contract
 * checks `novalidate`, the FieldError import and the server-error mapper, and
 * all three passed here.
 */
function describedBy(field: 'standard' | 'potential'): string {
  return [
    errors.value[field] ? `platform-max-questions-${field}-error` : null,
    `platform-max-questions-${field}-help`,
  ]
    .filter((id): id is string => id !== null)
    .join(' ')
}

const parsed = computed(() => ({
  standard: Number.parseInt(standard.value, 10),
  potential: Number.parseInt(potential.value, 10),
}))

function validate(): boolean {
  const { standard: s, potential: p } = parsed.value

  const outOfRange = (value: number): boolean => !Number.isInteger(value) || value < 1 || value > 10

  // A cap of 0 does not read as "unlimited" and does not read as "authoring is
  // off": it reads as every save failing with a message about a maximum, which
  // is the least explicable state this knob could be left in. Mirrors the
  // server's own `min:1|max:10`.
  const range = t('settings.platform.maxQuestions.range')

  errors.value = {
    ...(outOfRange(s) ? { standard: range } : {}),
    ...(outOfRange(p) ? { potential: range } : {}),
  }

  return Object.keys(errors.value).length === 0
}

const SERVER_FIELD_TO_ERROR_KEY = { max_questions_per_competency: 'range' } as const

async function onSubmit(): Promise<void> {
  // Guarded here and not only on the button: a form still submits on Enter
  // from a text field, with no button involved at all.
  if (!loaded.value) return

  formMessage.value = null

  if (!validate()) return

  saving.value = true

  try {
    const response = await updatePlatformSettings(parsed.value)

    // Re-seeded from the RESPONSE, not from what was typed: the server merges
    // a partial write over the stored map, so its answer is the only account
    // of what the settings now are.
    apply(response.data.max_questions_per_competency)

    formMessage.value = { kind: 'success', text: t('settings.platform.saved') }
    emit('saved')
  } catch (submitError) {
    // The server validates the same range this form does (`min:1|max:10`), and
    // a 422 from it must land ON the setting rather than in a generic banner —
    // otherwise an operator is told "could not save" with no idea which number
    // was refused or why.
    //
    // ONE map entry, because `applyServerFieldErrors` keys on the ROOT of the
    // server field name and both `…standard` and `…potential` share it. That is
    // the right granularity here anyway: the root IS the setting, and the two
    // inputs sit under one shared error line.
    const unmapped = applyServerFieldErrors(
      submitError,
      SERVER_FIELD_TO_ERROR_KEY,
      (_key, message) => {
        // The server roots both sub-keys onto one name, so a 422 about either
        // cap lands on both fields rather than on a guess.
        errors.value = { standard: message, potential: message }
      }
    )

    // A field this form renders no control for still has to reach the
    // operator, so anything unmapped goes to the banner rather than being
    // swallowed. `null` means the rejection carried no field errors at all.
    formMessage.value = {
      kind: 'error',
      text:
        unmapped !== null && unmapped.length > 0
          ? unmapped.join(' ')
          : t('settings.platform.saveFailed'),
    }
  } finally {
    saving.value = false
  }
}

// `Partial<PlatformSettingsCaps>`, not a hand-written copy of it: the
// committed spec marks both keys required, so a local `{ standard?: number }`
// re-declared a looser contract and made the guards below dead against it.
function apply(caps: Partial<PlatformSettingsCaps>): void {
  if (typeof caps.standard === 'number') standard.value = String(caps.standard)
  if (typeof caps.potential === 'number') potential.value = String(caps.potential)
}

onMounted(async () => {
  try {
    const response = await fetchPlatformSettings()
    apply(response.data.max_questions_per_competency)
    loaded.value = true
  } catch {
    // The numbers stay on screen — they are the product's real defaults, and
    // showing a blank form says less than showing what the server would apply
    // — but saving stays closed. Rendering a value is a claim about what is
    // configured only once it has been read.
    formMessage.value = { kind: 'error', text: t('settings.platform.loadFailed') }
  }
})
</script>
