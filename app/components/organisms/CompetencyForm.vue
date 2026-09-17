<template>
  <form id="competency-form" data-testid="competency-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <Field :data-invalid="Boolean(errors.code)">
          <FieldLabel for="competency-form-code">{{
            $t('catalogue.competencies.code')
          }}</FieldLabel>
          <Input
            id="competency-form-code"
            v-model="code"
            autocomplete="off"
            :aria-invalid="Boolean(errors.code)"
            :aria-describedby="errors.code ? 'competency-form-code-error' : undefined"
            data-testid="competency-form-code"
            @blur="validateCode"
          />
          <FieldError
            v-if="errors.code"
            id="competency-form-code-error"
            data-testid="competency-form-code-error"
            >{{ errors.code }}</FieldError
          >
        </Field>

        <Field>
          <!--
            NOT `for="competency-form-type"`: a native `label[for]` pointing
            at the trigger button would replace the button's OWN accessible
            name (its currently selected value text), so a screen reader
            would announce only "Type" and never "Standard"/"Potential".
            `aria-labelledby` on the trigger, naming BOTH this label's id and
            the rendered value's id, is what lets the announced name be
            "Type Standard" instead (gga review finding).
          -->
          <FieldLabel id="competency-form-type-label">{{
            $t('catalogue.competencies.type')
          }}</FieldLabel>
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <Select v-model="type">
            <SelectTrigger
              id="competency-form-type"
              data-testid="competency-form-type"
              aria-labelledby="competency-form-type-label competency-form-type-value"
            >
              <SelectValue id="competency-form-type-value" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="value in COMPETENCY_TYPES" :key="value" :value="value">
                  {{ $t(`catalogue.competencies.typeOption.${value}`) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field :data-invalid="Boolean(errors.nameEn)">
          <FieldLabel for="competency-form-name-en">{{ $t('catalogue.form.nameEn') }}</FieldLabel>
          <Input
            id="competency-form-name-en"
            v-model="nameEn"
            autocomplete="off"
            :aria-invalid="Boolean(errors.nameEn)"
            :aria-describedby="errors.nameEn ? 'competency-form-name-en-error' : undefined"
            data-testid="competency-form-name-en"
            @blur="validateNameEn"
          />
          <FieldError
            v-if="errors.nameEn"
            id="competency-form-name-en-error"
            data-testid="competency-form-name-en-error"
            >{{ errors.nameEn }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.nameIt)">
          <FieldLabel for="competency-form-name-it">{{ $t('catalogue.form.nameIt') }}</FieldLabel>
          <Input
            id="competency-form-name-it"
            v-model="nameIt"
            autocomplete="off"
            :aria-invalid="Boolean(errors.nameIt)"
            :aria-describedby="errors.nameIt ? 'competency-form-name-it-error' : undefined"
            data-testid="competency-form-name-it"
          />
          <FieldError
            v-if="errors.nameIt"
            id="competency-form-name-it-error"
            data-testid="competency-form-name-it-error"
            >{{ errors.nameIt }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.definitionEn)">
          <FieldLabel for="competency-form-definition-en">{{
            $t('catalogue.form.definitionEn')
          }}</FieldLabel>
          <Textarea
            id="competency-form-definition-en"
            v-model="definitionEn"
            :aria-invalid="Boolean(errors.definitionEn)"
            :aria-describedby="
              errors.definitionEn ? 'competency-form-definition-en-error' : undefined
            "
            data-testid="competency-form-definition-en"
            @blur="validateDefinitionEn"
          />
          <FieldError
            v-if="errors.definitionEn"
            id="competency-form-definition-en-error"
            data-testid="competency-form-definition-en-error"
            >{{ errors.definitionEn }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.definitionIt)">
          <FieldLabel for="competency-form-definition-it">{{
            $t('catalogue.form.definitionIt')
          }}</FieldLabel>
          <Textarea
            id="competency-form-definition-it"
            v-model="definitionIt"
            :aria-invalid="Boolean(errors.definitionIt)"
            :aria-describedby="
              errors.definitionIt ? 'competency-form-definition-it-error' : undefined
            "
            data-testid="competency-form-definition-it"
          />
          <FieldError
            v-if="errors.definitionIt"
            id="competency-form-definition-it-error"
            data-testid="competency-form-definition-it-error"
            >{{ errors.definitionIt }}</FieldError
          >
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="competency-form-banner"
        />
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
/**
 * Competency create/edit form (framework-catalogue-authoring PR10b, D4).
 *
 * `code`/`type` are immutable in spirit but not enforced client-side beyond
 * the server's own rules — `UpdateCompetencyRequest` accepts both on PATCH,
 * same shape as create. Server-side uniqueness (`code` per open draft) and
 * the `standard`/`potential` enum are validated remotely; this form only
 * catches the blank/shape cases a round trip would waste on.
 */
import { ref, watch } from 'vue'
import { FormFieldset } from '@/components/ui/form-fieldset'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { useCatalogue, type CatalogueCompetency } from '@/composables/useCatalogue'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCode, translateServerCodes } from '@/utils/server-message'
import { actionErrorMessage } from '@/utils/action-error-message'

const COMPETENCY_TYPES = ['standard', 'potential'] as const

const props = defineProps<{ competency: CatalogueCompetency | null }>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'update:pending', value: boolean): void
}>()

const { createCompetency, updateCompetency } = useCatalogue()
const { t, te } = useI18n()

const isEditing = props.competency !== null

const code = ref(props.competency?.code ?? '')
const type = ref<(typeof COMPETENCY_TYPES)[number]>(
  (props.competency?.type as (typeof COMPETENCY_TYPES)[number]) ?? 'standard'
)
const nameEn = ref(props.competency?.name?.en ?? '')
const nameIt = ref(props.competency?.name?.it ?? '')
const definitionEn = ref(props.competency?.definition?.en ?? '')
const definitionIt = ref(props.competency?.definition?.it ?? '')

const saving = ref(false)
watch(saving, (value) => emit('update:pending', value), { immediate: true })

const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const errors = ref<{
  code?: string
  nameEn?: string
  nameIt?: string
  definitionEn?: string
  definitionIt?: string
}>({})

const CODE_PATTERN = /^[A-Z0-9_]+$/

function validateCode(): boolean {
  const trimmed = code.value.trim()
  if (trimmed === '') {
    errors.value.code = t('catalogue.form.codeRequired')
  } else if (trimmed.length > 16 || !CODE_PATTERN.test(trimmed)) {
    errors.value.code = t('catalogue.form.codeInvalid')
  } else {
    errors.value.code = undefined
  }
  return !errors.value.code
}

function validateNameEn(): boolean {
  errors.value.nameEn = nameEn.value.trim() === '' ? t('catalogue.form.nameEnRequired') : undefined
  return !errors.value.nameEn
}

function validateDefinitionEn(): boolean {
  errors.value.definitionEn =
    definitionEn.value.trim() === '' ? t('catalogue.form.definitionEnRequired') : undefined
  return !errors.value.definitionEn
}

// `type` deliberately has NO entry: the Select carries no error slot of its
// own (unlike `code`/`name`/`definition`, each with a `FieldError` right
// below them), so a server refusal on it reaches the form-level banner
// instead of a field nobody can see is actually invalid — never mapped onto
// `code`, which IS a real, unrelated field with its own error display.
const SERVER_FIELD_TO_ERROR_KEY = {
  code: 'code',
  name: 'nameEn',
  'name.en': 'nameEn',
  'name.it': 'nameIt',
  definition: 'definitionEn',
  'definition.en': 'definitionEn',
  'definition.it': 'definitionIt',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  const codeOk = validateCode()
  const nameOk = validateNameEn()
  const definitionOk = validateDefinitionEn()
  if (!codeOk || !nameOk || !definitionOk) return

  saving.value = true
  try {
    const payload = {
      code: code.value.trim(),
      type: type.value,
      name: { en: nameEn.value, it: nameIt.value || undefined },
      definition: { en: definitionEn.value, it: definitionIt.value || undefined },
    }

    if (isEditing && props.competency) {
      await updateCompetency(props.competency.id, payload)
    } else {
      await createCompetency(payload)
    }
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = translateServerCode({ t, te }, 'catalogue.serverError', message)
    })
    // A 403/404/409 with no field payload renders through the SAME D4 state
    // mapper the panel's own delete path uses — a 409 (a concurrent publish
    // mid-write) must read as `waiting`, never the same red `error` a genuine
    // save failure gets (gga review finding: this previously only split out
    // 403, leaving 404 and 409 both under the generic save-failed copy).
    formMessage.value =
      unmapped && unmapped.length > 0
        ? {
            kind: 'error',
            text: translateServerCodes({ t, te }, 'catalogue.serverError', unmapped).join(' '),
          }
        : actionErrorMessage(error, t, 'catalogue.form.saveError')
  } finally {
    saving.value = false
  }
}
</script>
