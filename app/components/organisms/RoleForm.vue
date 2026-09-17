<template>
  <form id="role-form" data-testid="role-form" novalidate @submit.prevent="onSubmit">
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <Field :data-invalid="Boolean(errors.code)">
          <FieldLabel for="role-form-code">{{ $t('catalogue.roles.code') }}</FieldLabel>
          <Input
            id="role-form-code"
            v-model="code"
            autocomplete="off"
            :aria-invalid="Boolean(errors.code)"
            :aria-describedby="errors.code ? 'role-form-code-error' : undefined"
            data-testid="role-form-code"
            @blur="validateCode"
          />
          <FieldError
            v-if="errors.code"
            id="role-form-code-error"
            data-testid="role-form-code-error"
            >{{ errors.code }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.nameEn)">
          <FieldLabel for="role-form-name-en">{{ $t('catalogue.form.nameEn') }}</FieldLabel>
          <Input
            id="role-form-name-en"
            v-model="nameEn"
            autocomplete="off"
            :aria-invalid="Boolean(errors.nameEn)"
            :aria-describedby="errors.nameEn ? 'role-form-name-en-error' : undefined"
            data-testid="role-form-name-en"
            @blur="validateNameEn"
          />
          <FieldError
            v-if="errors.nameEn"
            id="role-form-name-en-error"
            data-testid="role-form-name-en-error"
            >{{ errors.nameEn }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.nameIt)">
          <FieldLabel for="role-form-name-it">{{ $t('catalogue.form.nameIt') }}</FieldLabel>
          <Input
            id="role-form-name-it"
            v-model="nameIt"
            autocomplete="off"
            :aria-invalid="Boolean(errors.nameIt)"
            :aria-describedby="errors.nameIt ? 'role-form-name-it-error' : undefined"
            data-testid="role-form-name-it"
          />
          <FieldError
            v-if="errors.nameIt"
            id="role-form-name-it-error"
            data-testid="role-form-name-it-error"
            >{{ errors.nameIt }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.responsibilitiesEn)">
          <FieldLabel for="role-form-responsibilities-en">{{
            $t('catalogue.form.responsibilitiesEn')
          }}</FieldLabel>
          <Textarea
            id="role-form-responsibilities-en"
            v-model="responsibilitiesEn"
            :aria-invalid="Boolean(errors.responsibilitiesEn)"
            :aria-describedby="
              errors.responsibilitiesEn ? 'role-form-responsibilities-en-error' : undefined
            "
            data-testid="role-form-responsibilities-en"
          />
          <FieldError
            v-if="errors.responsibilitiesEn"
            id="role-form-responsibilities-en-error"
            data-testid="role-form-responsibilities-en-error"
            >{{ errors.responsibilitiesEn }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.responsibilitiesIt)">
          <FieldLabel for="role-form-responsibilities-it">{{
            $t('catalogue.form.responsibilitiesIt')
          }}</FieldLabel>
          <Textarea
            id="role-form-responsibilities-it"
            v-model="responsibilitiesIt"
            :aria-invalid="Boolean(errors.responsibilitiesIt)"
            :aria-describedby="
              errors.responsibilitiesIt ? 'role-form-responsibilities-it-error' : undefined
            "
            data-testid="role-form-responsibilities-it"
          />
          <FieldError
            v-if="errors.responsibilitiesIt"
            id="role-form-responsibilities-it-error"
            data-testid="role-form-responsibilities-it-error"
            >{{ errors.responsibilitiesIt }}</FieldError
          >
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="role-form-banner"
        />
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
/**
 * Role create/edit form (framework-catalogue-authoring PR10b, D4).
 *
 * NO role→competency assignment control: `StoreRoleRequest`/
 * `UpdateRoleRequest` carry no `competency_ids` field and
 * `CatalogueRoleResource` carries no competency list at all — PR3's own
 * `RoleController::store()` docblock names this as a real scope gap ("no
 * ... pivot-management endpoint were built"), not an oversight this form can
 * paper over. `CatalogueRolesPanel`'s own description names the gap for the
 * superadmin using it.
 *
 * `responsibilities` is optional on both `en` and `it`
 * (`StoreRoleRequest`) — matching the seeder's own "not yet authored"
 * sentinel, so neither locale is required here.
 */
import { ref, watch } from 'vue'
import { FormFieldset } from '@/components/ui/form-fieldset'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { useCatalogue, type CatalogueRole } from '@/composables/useCatalogue'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCode, translateServerCodes } from '@/utils/server-message'
import { actionErrorMessage } from '@/utils/action-error-message'

const props = defineProps<{ role: CatalogueRole | null }>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'update:pending', value: boolean): void
}>()

const { createRole, updateRole } = useCatalogue()
const { t, te } = useI18n()

const isEditing = props.role !== null

const code = ref(props.role?.code ?? '')
const nameEn = ref(props.role?.name?.en ?? '')
const nameIt = ref(props.role?.name?.it ?? '')
const responsibilitiesEn = ref(props.role?.responsibilities?.en ?? '')
const responsibilitiesIt = ref(props.role?.responsibilities?.it ?? '')

const saving = ref(false)
watch(saving, (value) => emit('update:pending', value), { immediate: true })

const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const errors = ref<{
  code?: string
  nameEn?: string
  nameIt?: string
  responsibilitiesEn?: string
  responsibilitiesIt?: string
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

// `type` has no analogue here (roles carry none); `responsibilities` has no
// entry either — same reasoning as `CompetencyForm.vue`'s omitted `type`:
// both its locale fields already carry their own `FieldError`, so a server
// refusal on the BARE `responsibilities` key (rather than `.en`/`.it`) falls
// through to the banner instead of silently attaching nowhere.
const SERVER_FIELD_TO_ERROR_KEY = {
  code: 'code',
  name: 'nameEn',
  'name.en': 'nameEn',
  'name.it': 'nameIt',
  'responsibilities.en': 'responsibilitiesEn',
  'responsibilities.it': 'responsibilitiesIt',
} as const satisfies Record<string, keyof typeof errors.value>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  const codeOk = validateCode()
  const nameOk = validateNameEn()
  if (!codeOk || !nameOk) return

  saving.value = true
  try {
    const payload = {
      code: code.value.trim(),
      name: { en: nameEn.value, it: nameIt.value || undefined },
      responsibilities:
        responsibilitiesEn.value || responsibilitiesIt.value
          ? { en: responsibilitiesEn.value || undefined, it: responsibilitiesIt.value || undefined }
          : undefined,
    }

    if (isEditing && props.role) {
      await updateRole(props.role.id, payload)
    } else {
      await createRole(payload)
    }
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = translateServerCode({ t, te }, 'catalogue.serverError', message)
    })
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
