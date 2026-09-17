<template>
  <form
    id="bars-indicator-form"
    data-testid="bars-indicator-form"
    novalidate
    @submit.prevent="onSubmit"
  >
    <FormFieldset :disabled="saving">
      <FieldGroup>
        <!--
          `competency_id`/`role_id` are set ONLY on create — `UpdateBars
          IndicatorRequest` accepts no such field, "reassigning role_id/
          competency_id on an existing indicator is out of scope" (PR3's own
          docblock). Editing an existing row shows both as static text.
        -->
        <Field v-if="isEditing">
          <p id="bars-indicator-form-competency-static-label" class="text-sm font-medium">
            {{ $t('catalogue.indicators.competencyLabel') }}
          </p>
          <p
            aria-labelledby="bars-indicator-form-competency-static-label"
            class="text-sm"
            data-testid="bars-indicator-form-competency-static"
          >
            {{ competencyLabel(props.indicator!.competency_id) }}
          </p>
        </Field>
        <Field v-if="isEditing">
          <p id="bars-indicator-form-role-static-label" class="text-sm font-medium">
            {{ $t('catalogue.indicators.roleLabel') }}
          </p>
          <p
            aria-labelledby="bars-indicator-form-role-static-label"
            class="text-sm"
            data-testid="bars-indicator-form-role-static"
          >
            {{ roleLabel(props.indicator!.role_id) }}
          </p>
        </Field>

        <Field v-if="!isEditing" :data-invalid="Boolean(errors.competencyId)">
          <FieldLabel id="bars-indicator-form-competency-label">{{
            $t('catalogue.indicators.competencyLabel')
          }}</FieldLabel>
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <Select v-model="competencyId">
            <SelectTrigger
              id="bars-indicator-form-competency"
              data-testid="bars-indicator-form-competency"
              aria-labelledby="bars-indicator-form-competency-label bars-indicator-form-competency-value"
            >
              <SelectValue id="bars-indicator-form-competency-value" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="competency in competencies"
                  :key="competency.id"
                  :value="String(competency.id)"
                >
                  {{ competency.code }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError
            v-if="errors.competencyId"
            data-testid="bars-indicator-form-competency-error"
            >{{ errors.competencyId }}</FieldError
          >
        </Field>

        <Field v-if="!isEditing" :data-invalid="Boolean(errors.roleId)">
          <FieldLabel id="bars-indicator-form-role-label">{{
            $t('catalogue.indicators.roleLabel')
          }}</FieldLabel>
          <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
          <Select v-model="roleId" :disabled="selectedCompetencyIsPotential">
            <SelectTrigger
              id="bars-indicator-form-role"
              data-testid="bars-indicator-form-role"
              aria-labelledby="bars-indicator-form-role-label bars-indicator-form-role-value"
            >
              <SelectValue id="bars-indicator-form-role-value" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">{{
                  $t('catalogue.indicators.roleOption.none')
                }}</SelectItem>
                <SelectItem v-for="role in roles" :key="role.id" :value="String(role.id)">
                  {{ role.code }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldError v-if="errors.roleId" data-testid="bars-indicator-form-role-error">{{
            errors.roleId
          }}</FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.textEn)">
          <FieldLabel for="bars-indicator-form-text-en">{{
            $t('catalogue.form.textEn')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-text-en"
            v-model="textEn"
            :aria-invalid="Boolean(errors.textEn)"
            data-testid="bars-indicator-form-text-en"
            @blur="validateRequired('textEn', textEn, 'textEnRequired')"
          />
          <FieldError v-if="errors.textEn" data-testid="bars-indicator-form-text-en-error">{{
            errors.textEn
          }}</FieldError>
        </Field>
        <Field :data-invalid="Boolean(errors.textIt)">
          <FieldLabel for="bars-indicator-form-text-it">{{
            $t('catalogue.form.textIt')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-text-it"
            v-model="textIt"
            :aria-invalid="Boolean(errors.textIt)"
            data-testid="bars-indicator-form-text-it"
          />
          <FieldError v-if="errors.textIt" data-testid="bars-indicator-form-text-it-error">{{
            errors.textIt
          }}</FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.anchor5En)">
          <FieldLabel for="bars-indicator-form-anchor5-en">{{
            $t('catalogue.form.anchor5En')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-anchor5-en"
            v-model="anchor5En"
            :aria-invalid="Boolean(errors.anchor5En)"
            data-testid="bars-indicator-form-anchor5-en"
            @blur="validateRequired('anchor5En', anchor5En, 'anchor5EnRequired')"
          />
          <FieldError v-if="errors.anchor5En" data-testid="bars-indicator-form-anchor5-en-error">{{
            errors.anchor5En
          }}</FieldError>
        </Field>
        <Field :data-invalid="Boolean(errors.anchor5It)">
          <FieldLabel for="bars-indicator-form-anchor5-it">{{
            $t('catalogue.form.anchor5It')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-anchor5-it"
            v-model="anchor5It"
            :aria-invalid="Boolean(errors.anchor5It)"
            data-testid="bars-indicator-form-anchor5-it"
          />
          <FieldError v-if="errors.anchor5It" data-testid="bars-indicator-form-anchor5-it-error">{{
            errors.anchor5It
          }}</FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.anchor3En)">
          <FieldLabel for="bars-indicator-form-anchor3-en">{{
            $t('catalogue.form.anchor3En')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-anchor3-en"
            v-model="anchor3En"
            :aria-invalid="Boolean(errors.anchor3En)"
            data-testid="bars-indicator-form-anchor3-en"
            @blur="validateRequired('anchor3En', anchor3En, 'anchor3EnRequired')"
          />
          <FieldError v-if="errors.anchor3En" data-testid="bars-indicator-form-anchor3-en-error">{{
            errors.anchor3En
          }}</FieldError>
        </Field>
        <Field :data-invalid="Boolean(errors.anchor3It)">
          <FieldLabel for="bars-indicator-form-anchor3-it">{{
            $t('catalogue.form.anchor3It')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-anchor3-it"
            v-model="anchor3It"
            :aria-invalid="Boolean(errors.anchor3It)"
            data-testid="bars-indicator-form-anchor3-it"
          />
          <FieldError v-if="errors.anchor3It" data-testid="bars-indicator-form-anchor3-it-error">{{
            errors.anchor3It
          }}</FieldError>
        </Field>

        <Field :data-invalid="Boolean(errors.anchor1En)">
          <FieldLabel for="bars-indicator-form-anchor1-en">{{
            $t('catalogue.form.anchor1En')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-anchor1-en"
            v-model="anchor1En"
            :aria-invalid="Boolean(errors.anchor1En)"
            data-testid="bars-indicator-form-anchor1-en"
            @blur="validateRequired('anchor1En', anchor1En, 'anchor1EnRequired')"
          />
          <FieldError v-if="errors.anchor1En" data-testid="bars-indicator-form-anchor1-en-error">{{
            errors.anchor1En
          }}</FieldError>
        </Field>
        <Field :data-invalid="Boolean(errors.anchor1It)">
          <FieldLabel for="bars-indicator-form-anchor1-it">{{
            $t('catalogue.form.anchor1It')
          }}</FieldLabel>
          <Textarea
            id="bars-indicator-form-anchor1-it"
            v-model="anchor1It"
            :aria-invalid="Boolean(errors.anchor1It)"
            data-testid="bars-indicator-form-anchor1-it"
          />
          <FieldError v-if="errors.anchor1It" data-testid="bars-indicator-form-anchor1-it-error">{{
            errors.anchor1It
          }}</FieldError>
        </Field>

        <FormMessage
          v-if="formMessage"
          :kind="formMessage.kind"
          :text="formMessage.text"
          test-id="bars-indicator-form-banner"
        />
      </FieldGroup>
    </FormFieldset>
  </form>
</template>

<script setup lang="ts">
/**
 * BARS indicator create/edit form (framework-catalogue-authoring PR10b,
 * catalogue-authoring spec, D4).
 *
 * `position` is NEVER sent by this form, on create or edit: the PANEL
 * computes it on create (`max(position) + 1` within the target pair, same
 * anti-collision reasoning as the default-questions editor), and reorder is
 * the panel's own Move up/down actions — a two-phase PATCH dance, same
 * doctrine as `CatalogueDefaultQuestionsPanel.vue`'s `onReorder`. Mixing
 * position edits into this general-purpose form would reopen the exact
 * same-slot collision that dance exists to avoid.
 */
import { computed, ref, watch } from 'vue'
import { FormFieldset } from '@/components/ui/form-fieldset'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
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
import {
  useCatalogue,
  type CatalogueBarsIndicator,
  type CatalogueCompetency,
  type CatalogueRole,
} from '@/composables/useCatalogue'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCode, translateServerCodes } from '@/utils/server-message'
import { actionErrorMessage } from '@/utils/action-error-message'

const props = defineProps<{
  indicator: CatalogueBarsIndicator | null
  competencies: CatalogueCompetency[]
  roles: CatalogueRole[]
  /**
   * Every indicator currently in the open draft — used ONLY to compute the
   * next `position` for a CREATE, reactively, as the operator changes which
   * pair they are targeting. Kept as raw data rather than a single
   * `nextPosition` number so this form stays self-contained (same doctrine
   * as `CompetencyForm`/`RoleForm`) instead of the panel having to reach
   * into this form's own in-progress selection to compute it externally.
   */
  indicators: CatalogueBarsIndicator[]
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'update:pending', value: boolean): void
}>()

const { createBarsIndicator, updateBarsIndicator } = useCatalogue()
const { t, te } = useI18n()

const isEditing = props.indicator !== null

const competencyId = ref(props.indicator ? String(props.indicator.competency_id) : '')
const roleId = ref(props.indicator ? (props.indicator.role_id?.toString() ?? 'none') : 'none')
const textEn = ref(props.indicator?.text?.en ?? '')
const textIt = ref(props.indicator?.text?.it ?? '')
const anchor5En = ref(props.indicator?.anchor_5?.en ?? '')
const anchor5It = ref(props.indicator?.anchor_5?.it ?? '')
const anchor3En = ref(props.indicator?.anchor_3?.en ?? '')
const anchor3It = ref(props.indicator?.anchor_3?.it ?? '')
const anchor1En = ref(props.indicator?.anchor_1?.en ?? '')
const anchor1It = ref(props.indicator?.anchor_1?.it ?? '')

const saving = ref(false)
watch(saving, (value) => emit('update:pending', value), { immediate: true })

const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
type ErrorField =
  | 'competencyId'
  | 'roleId'
  | 'textEn'
  | 'textIt'
  | 'anchor5En'
  | 'anchor5It'
  | 'anchor3En'
  | 'anchor3It'
  | 'anchor1En'
  | 'anchor1It'
const errors = ref<Partial<Record<ErrorField, string>>>({})

const selectedCompetencyIsPotential = computed(() => {
  const found = props.competencies.find((c) => String(c.id) === competencyId.value)
  return found?.type === 'potential'
})

// A `potential` competency's indicators MUST be role-less (PublishRevision's
// own sweep) — forced here rather than merely suggested, so the operator
// cannot submit a shape the publish sweep would refuse later.
watch(selectedCompetencyIsPotential, (isPotential) => {
  if (isPotential) roleId.value = 'none'
})

/**
 * `max(position) + 1` within the exact (competency, role) pair the operator
 * has currently selected — NEVER the pair's row count, same anti-collision
 * reasoning as `CatalogueDefaultQuestionsPanel.vue`'s create path. `0` for a
 * brand-new pair (no existing rows to be `max` of).
 */
const nextPosition = computed(() => {
  const targetCompetencyId = Number(competencyId.value)
  const targetRoleId = roleId.value === 'none' ? null : Number(roleId.value)

  const pairPositions = props.indicators
    .filter((i) => i.competency_id === targetCompetencyId && i.role_id === targetRoleId)
    .map((i) => i.position)

  return pairPositions.length > 0 ? Math.max(...pairPositions) + 1 : 0
})

function competencyLabel(id: number): string {
  return props.competencies.find((c) => c.id === id)?.code ?? String(id)
}

function roleLabel(id: number | null): string {
  if (id === null) return t('catalogue.indicators.roleOption.none')
  return props.roles.find((r) => r.id === id)?.code ?? String(id)
}

function validateRequired(field: ErrorField, value: string, requiredKey: string): boolean {
  errors.value[field] = value.trim() === '' ? t(`catalogue.form.${requiredKey}`) : undefined
  return !errors.value[field]
}

function validateAll(): boolean {
  let ok = true
  if (!isEditing) {
    errors.value.competencyId =
      competencyId.value === '' ? t('catalogue.form.competencyRequired') : undefined
    if (errors.value.competencyId) ok = false

    if (!selectedCompetencyIsPotential.value && roleId.value === 'none') {
      errors.value.roleId = t('catalogue.form.roleRequired')
      ok = false
    } else {
      errors.value.roleId = undefined
    }
  }

  if (!validateRequired('textEn', textEn.value, 'textEnRequired')) ok = false
  if (!validateRequired('anchor5En', anchor5En.value, 'anchor5EnRequired')) ok = false
  if (!validateRequired('anchor3En', anchor3En.value, 'anchor3EnRequired')) ok = false
  if (!validateRequired('anchor1En', anchor1En.value, 'anchor1EnRequired')) ok = false

  return ok
}

const SERVER_FIELD_TO_ERROR_KEY = {
  competency_id: 'competencyId',
  role_id: 'roleId',
  'text.en': 'textEn',
  'text.it': 'textIt',
  'anchor_5.en': 'anchor5En',
  'anchor_5.it': 'anchor5It',
  'anchor_3.en': 'anchor3En',
  'anchor_3.it': 'anchor3It',
  'anchor_1.en': 'anchor1En',
  'anchor_1.it': 'anchor1It',
} as const satisfies Record<string, ErrorField>

async function onSubmit(): Promise<void> {
  formMessage.value = null
  if (!validateAll()) return

  saving.value = true
  try {
    const textPayload = { en: textEn.value, it: textIt.value || undefined }
    const anchor5Payload = { en: anchor5En.value, it: anchor5It.value || undefined }
    const anchor3Payload = { en: anchor3En.value, it: anchor3It.value || undefined }
    const anchor1Payload = { en: anchor1En.value, it: anchor1It.value || undefined }

    if (isEditing && props.indicator) {
      await updateBarsIndicator(props.indicator.id, {
        text: textPayload,
        anchor_5: anchor5Payload,
        anchor_3: anchor3Payload,
        anchor_1: anchor1Payload,
      })
    } else {
      await createBarsIndicator({
        competency_id: Number(competencyId.value),
        role_id: roleId.value === 'none' ? null : Number(roleId.value),
        position: nextPosition.value,
        text: textPayload,
        anchor_5: anchor5Payload,
        anchor_3: anchor3Payload,
        anchor_1: anchor1Payload,
      })
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
