<template>
  <div class="flex flex-col gap-4">
    <form
      id="role-competencies-form"
      data-testid="role-competencies-form"
      novalidate
      @submit.prevent="onSubmit"
    >
      <FormFieldset :disabled="saving">
        <FieldGroup>
          <div class="flex flex-col gap-2">
            <p class="text-sm font-medium">
              {{ $t('catalogue.roles.competencies.assignedTitle') }}
            </p>

            <p
              v-if="assigned.length === 0"
              class="text-muted-foreground text-sm"
              data-testid="role-competencies-empty"
            >
              {{ $t('catalogue.roles.competencies.empty') }}
            </p>

            <ul v-else class="flex flex-col gap-2" data-testid="role-competencies-list">
              <li
                v-for="(competency, index) in assigned"
                :key="competency.id"
                class="border-border bg-card flex items-center gap-2 rounded-lg border p-2"
                :data-testid="`role-competency-row-${competency.id}`"
              >
                <span class="flex-1 text-sm">{{ competency.code }}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="index === 0"
                  :aria-label="$t('catalogue.roles.competencies.moveUp')"
                  :data-testid="`role-competency-up-${competency.id}`"
                  @click="move(index, -1)"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="index === assigned.length - 1"
                  :aria-label="$t('catalogue.roles.competencies.moveDown')"
                  :data-testid="`role-competency-down-${competency.id}`"
                  @click="move(index, 1)"
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :data-testid="`role-competency-remove-${competency.id}`"
                  @click="removeCompetency(competency.id)"
                >
                  {{ $t('catalogue.roles.competencies.remove') }}
                </Button>
              </li>
            </ul>

            <FieldError v-if="errors.competencyIds" data-testid="role-competencies-error">{{
              errors.competencyIds
            }}</FieldError>
          </div>

          <Field v-if="available.length > 0">
            <FieldLabel id="role-competencies-add-label">{{
              $t('catalogue.roles.competencies.addLabel')
            }}</FieldLabel>
            <div class="flex gap-2">
              <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
              <Select v-model="pendingAddId">
                <SelectTrigger
                  id="role-competencies-add-select"
                  data-testid="role-competencies-add-select"
                  aria-labelledby="role-competencies-add-label role-competencies-add-value"
                >
                  <SelectValue id="role-competencies-add-value" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem
                      v-for="competency in available"
                      :key="competency.id"
                      :value="String(competency.id)"
                    >
                      {{ competency.code }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                :disabled="pendingAddId === ''"
                data-testid="role-competencies-add-button"
                @click="addPending"
              >
                {{ $t('catalogue.roles.competencies.add') }}
              </Button>
            </div>
          </Field>
          <p
            v-else
            class="text-muted-foreground text-xs"
            data-testid="role-competencies-none-available"
          >
            {{ $t('catalogue.roles.competencies.noneAvailable') }}
          </p>

          <FormMessage
            v-if="formMessage"
            :kind="formMessage.kind"
            :text="formMessage.text"
            test-id="role-competencies-banner"
          />
        </FieldGroup>
      </FormFieldset>
    </form>

    <!--
      Confirmed only when the save would DETACH an already-assigned
      competency — adding or reordering never destroys anything the draft
      currently holds, and Cancel on the drawer discards every local edit
      regardless. See the file docblock for why this differs from
      QuestionListEditor's unconditional confirm-on-remove.
    -->
    <ConfirmDialog
      :open="confirmingDetach"
      variant="destructive"
      :title="$t('catalogue.roles.competencies.confirmDetachTitle')"
      :description="$t('catalogue.roles.competencies.confirmDetachBody')"
      :confirm-label="$t('common.action.save')"
      @confirm="onConfirmSave"
      @cancel="confirmingDetach = false"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * RoleCompetenciesForm — edits a role's ORDERED competency set
 * (framework-catalogue-authoring PR10c, 39c.2, DESIGN.md §8.2.10).
 *
 * Every edit (add, remove, reorder) is LOCAL state until Save — the panel
 * that mounts this drawer can Cancel with zero writes, same as every other
 * catalogue form in this app. Save sends the whole ORDERED `competency_ids`
 * list in one `PUT .../competencies` call (`UpdateRoleCompetenciesRequest`'s
 * own no-partial-diff contract, PR8b) — never N separate calls, unlike the
 * default-questions/indicators reorder dances, because this endpoint is a
 * single idempotent write by design.
 *
 * CONFIRMED ONLY WHEN THE SAVE WOULD DETACH something already assigned —
 * that is the one genuinely destructive outcome this form can produce (a
 * detach that later 422s if the pair still carries BARS indicators). Adding
 * or reordering never destroys anything already in the draft, so gating
 * every keystroke behind a dialog would train the operator to click through
 * it. This is deliberately NOT the same doctrine as `QuestionListEditor`'s
 * unconditional confirm-on-remove: THAT remove is an immediate network
 * DELETE with no further step: this form's local remove is fully reversible
 * by Cancel until Save actually runs, so the confirmation belongs on the
 * write, not on staging the change.
 *
 * `competencies` is passed down already filtered to `type === 'standard'` —
 * a `potential` competency is refused server-side
 * (`UpdateRoleCompetenciesRequest`'s `exists(...)->where('type', 'standard')`
 * rule) and never belongs to a role by design (the same rule
 * `PublishRevision::potentialInPivotViolations()` enforces at publish time).
 */
import { computed, ref, watch } from 'vue'
import { FormFieldset } from '@/components/ui/form-fieldset'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import {
  useCatalogue,
  type CatalogueCompetency,
  type CatalogueRole,
} from '@/composables/useCatalogue'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCode, translateServerCodes } from '@/utils/server-message'
import { actionErrorMessage } from '@/utils/action-error-message'

const props = defineProps<{
  role: CatalogueRole
  /** Standard-only — see the file docblock for why potential never appears here. */
  competencies: CatalogueCompetency[]
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'update:pending', value: boolean): void
}>()

const { updateRoleCompetencies } = useCatalogue()
const { t, te } = useI18n()

// Filtered against `props.competencies` up front so `selectedIds` and
// `assigned` stay a 1:1 index correspondence — a dangling id (a competency
// the draft no longer carries, e.g. deleted concurrently) would otherwise
// make `assigned`'s filtered view disagree with `selectedIds`'s own indices,
// breaking `move()`'s index arithmetic silently.
const selectedIds = ref<number[]>(
  props.role.competency_ids.filter((id) => props.competencies.some((c) => c.id === id))
)
// The FULL server-assigned set, taken from `props.role.competency_ids`
// directly rather than from the filtered `selectedIds` above —
// `detachedIds()` compares against this to decide whether Save is
// destructive. Deriving it from `selectedIds` instead would silently drop
// any id `props.competencies` does not carry (e.g. a competency deleted or
// retyped concurrently) from BOTH sides of that comparison at once, so a
// save that never touched anything would detach it from the real payload
// with zero confirmation — the same class of "confirmation computed from
// stale state" defect this form exists to prevent (gga review finding,
// R3-role-competencies-silent-detach).
const originalIds = [...props.role.competency_ids]

const pendingAddId = ref('')

const saving = ref(false)
watch(saving, (value) => emit('update:pending', value), { immediate: true })

const formMessage = ref<{ kind: FormMessageKind; text: string } | null>(null)
const errors = ref<{ competencyIds?: string }>({})
const confirmingDetach = ref(false)

const assigned = computed<CatalogueCompetency[]>(() =>
  selectedIds.value
    .map((id) => props.competencies.find((c) => c.id === id))
    .filter((c): c is CatalogueCompetency => c !== undefined)
)

const available = computed<CatalogueCompetency[]>(() =>
  props.competencies.filter((c) => !selectedIds.value.includes(c.id))
)

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= selectedIds.value.length) return

  const ids = [...selectedIds.value]
  const [moved] = ids.splice(index, 1)
  if (moved === undefined) return
  ids.splice(target, 0, moved)
  selectedIds.value = ids
}

function removeCompetency(id: number): void {
  selectedIds.value = selectedIds.value.filter((existing) => existing !== id)
}

function addPending(): void {
  if (pendingAddId.value === '') return
  const id = Number(pendingAddId.value)
  if (!selectedIds.value.includes(id)) selectedIds.value = [...selectedIds.value, id]
  pendingAddId.value = ''
}

/** Ids the CURRENT selection would drop from what the role has today. */
function detachedIds(): number[] {
  return originalIds.filter((id) => !selectedIds.value.includes(id))
}

const SERVER_FIELD_TO_ERROR_KEY = { competency_ids: 'competencyIds' } as const

async function save(): Promise<void> {
  formMessage.value = null
  errors.value = {}
  saving.value = true

  try {
    await updateRoleCompetencies(props.role.id, { competency_ids: selectedIds.value })
    emit('saved')
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      // NEVER just the raw code: the field-shape refusals answer in a
      // machine `lower_snake` code (translated below), but the detach
      // refusal answers in an authored SENTENCE naming the still-anchored
      // competency codes (`UpdateRoleCompetenciesRequest::
      // refuseDetachWithLiveIndicators()`) — `translateServerCode` falls
      // back to that exact raw value when no translation key matches it,
      // which is precisely "render it verbatim" for a server-computed
      // diagnostic, the same treatment DESIGN.md gives publish violations'
      // `subject`/`detail`.
      errors.value[key] = translateServerCode({ t, te }, 'catalogue.serverError', message)
    })

    formMessage.value =
      unmapped && unmapped.length > 0
        ? {
            kind: 'error',
            text: translateServerCodes({ t, te }, 'catalogue.serverError', unmapped).join(' '),
          }
        : actionErrorMessage(error, t, 'catalogue.roles.competencies.saveError')
  } finally {
    saving.value = false
  }
}

function onSubmit(): void {
  if (detachedIds().length > 0) {
    confirmingDetach.value = true
    return
  }

  void save()
}

function onConfirmSave(): void {
  confirmingDetach.value = false
  void save()
}
</script>
