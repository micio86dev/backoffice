<template>
  <div class="flex flex-col gap-4">
    <!--
      One block per competency, and the editor lives INSIDE the block it
      belongs to.

      It used to render once, after every group. Pressing "Add" on the first of
      eight competencies opened a form below all eight: nothing happened where
      the operator clicked, and when they scrolled down to find it, nothing on
      it said which competency they were writing for. Position is now the
      primary answer to "which one is this?" — the form is attached to the
      thing it edits — and the heading below states it in words as well,
      because layout alone is exactly what could not be seen.
    -->
    <div
      v-for="group in groups"
      :key="group.competencyId"
      class="flex flex-col gap-2"
      :data-testid="`question-group-${group.competencyId}`"
    >
      <h4 class="text-sm font-medium">{{ group.label }}</h4>

      <QuestionList
        :questions="group.questions"
        :locale="locale"
        @reorder="(ids) => emit('reorder', ids)"
        @remove="(id) => (removingId = id)"
        @edit="(id) => onEdit(id)"
      />

      <!--
        Both languages, side by side, and always — never one field that follows
        the operator's locale. The API stores a map and the interview reads the
        PROJECT's language, so an editor showing one would let somebody save a
        question the candidate never hears.
      -->
      <form
        v-if="draft && draft.competencyId === group.competencyId"
        ref="editorFormEl"
        data-testid="question-editor"
        class="border-primary/30 bg-primary/[0.03] flex flex-col gap-3 rounded-lg border p-4"
        novalidate
        @submit.prevent="onSubmit"
      >
        <!--
          The competency, named. The form sits under its group already, which
          is the primary answer to "which one is this?"; this is the answer
          that survives a screen reader, a narrow window, and an operator who
          scrolled in from somewhere else.

          Tinted rather than plain-bordered: it is a transient surface opening
          inside an already-bordered list, and a second neutral box reads as
          one more row instead of as something that just appeared.
        -->
        <h5
          ref="editorTitleEl"
          class="text-foreground text-sm font-semibold"
          data-testid="question-editor-title"
        >
          {{
            $t(draft.id === null ? 'projectQuestions.newFor' : 'projectQuestions.editFor', {
              competency: group.label,
            })
          }}
        </h5>
        <Field :data-invalid="Boolean(errors.text)">
          <FieldLabel :for="`question-en-${group.competencyId}`">{{
            $t('projectQuestions.textEn')
          }}</FieldLabel>
          <Textarea
            :id="`question-en-${group.competencyId}`"
            v-model="draft.en"
            rows="2"
            required
            :aria-invalid="Boolean(errors.text)"
            :aria-describedby="errors.text ? `question-en-error-${group.competencyId}` : undefined"
            data-testid="question-text-en"
          />
          <FieldError
            v-if="errors.text"
            :id="`question-en-error-${group.competencyId}`"
            data-testid="question-text-error"
            >{{ errors.text }}</FieldError
          >
        </Field>

        <Field :data-invalid="Boolean(errors.textIt)">
          <FieldLabel :for="`question-it-${group.competencyId}`">{{
            $t('projectQuestions.textIt')
          }}</FieldLabel>
          <Textarea
            :id="`question-it-${group.competencyId}`"
            v-model="draft.it"
            rows="2"
            :aria-invalid="Boolean(errors.textIt)"
            :aria-describedby="
              errors.textIt ? `question-it-error-${group.competencyId}` : undefined
            "
            data-testid="question-text-it"
          />
          <FieldError
            v-if="errors.textIt"
            :id="`question-it-error-${group.competencyId}`"
            data-testid="question-text-it-error"
            >{{ errors.textIt }}</FieldError
          >
        </Field>

        <!--
          The competency error stands ALONE, outside both text Fields.

          It used to wrap the Italian one, so a refusal about the COMPETENCY
          marked "Text (Italian)" invalid and printed itself under that label.
          There is genuinely no control to attach it to — the competency is
          decided by which Add was pressed — and that is the argument for a
          field-less message, not for borrowing the nearest field's.
        -->
        <FieldError
          v-if="errors.competency"
          :id="`question-competency-error-${group.competencyId}`"
          data-testid="question-competency-error"
          >{{ errors.competency }}</FieldError
        >

        <div class="flex gap-2">
          <Button type="submit" :loading="saving" data-testid="question-save">
            {{ $t('projects.action.save') }}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="question-cancel"
            @click="closeEditor()"
          >
            {{ $t('projects.action.cancel') }}
          </Button>
        </div>
      </form>

      <!--
        Withdrawn while THIS group's editor is open. Pressing it again would
        re-seed the draft and silently discard whatever had been typed — a
        destructive no-op wearing the label of the action that opened the form.
        The other groups keep theirs: switching competency mid-draft is a
        legitimate thing to want, and it is the same single-draft swap that has
        always happened.
      -->
      <div v-if="!draft || draft.competencyId !== group.competencyId">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="atCap(group)"
          :aria-describedby="atCap(group) ? `question-cap-${group.competencyId}` : undefined"
          :data-testid="`question-add-${group.competencyId}`"
          @click="startNew(group.competencyId)"
        >
          {{ $t('projectQuestions.add') }}
        </Button>

        <!--
          The reason, next to the disabled control. A button that stops
          responding and says nothing teaches the operator the page is broken;
          the cap is a real limit and it has a number.
        -->
        <p
          v-if="atCap(group)"
          :id="`question-cap-${group.competencyId}`"
          class="text-muted-foreground mt-1.5 text-xs"
          :data-testid="`question-cap-${group.competencyId}`"
        >
          {{ $t('projectQuestions.atCap', { max: cap }) }}
        </p>
      </div>
    </div>

    <!--
      No "zero competencies" message here — deliberately. Both containers
      already guard this component behind their own `v-if="… .length > 0"`
      (ProjectQuestionsPanel.vue, CatalogueDefaultQuestionsPanel.vue) with
      their own wording for what an empty set means on THEIR surface, so a
      second copy of that branch here could only ever be unreachable dead
      code sharing a test id with the container's real one.
    -->
    <!--
      Confirmed even though the delete is SOFT. The operator cannot tell the
      difference from here, the question disappears from their list either
      way, and there is no undo in this UI — so the dialog is the only place
      the decision can be reconsidered.
    -->
    <ConfirmDialog
      :open="removingId !== null"
      :title="$t('projectQuestions.confirmRemoveTitle')"
      :description="$t('projectQuestions.confirmRemoveBody')"
      :confirm-label="$t('projectQuestions.remove')"
      @confirm="confirmRemove"
      @cancel="removingId = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * QuestionListEditor — the presentational core `ProjectQuestionsPanel` and
 * `CatalogueDefaultQuestionsPanel` both mount (framework-catalogue-authoring
 * D11): the competency-grouped list, the dual-locale `{en, it}` editor, drag
 * reorder, and the per-competency cap display.
 *
 * OWNS the editing UI state (which draft is open, its text, client-side and
 * mapped server-side validation) and emits network-shaped intents up:
 * `reorder`, `remove` (after its own confirmation), and `submit`. It knows
 * NOTHING about HTTP — no composable, no `apiFetch` — so it is the one place
 * this editing UI can be written and tested once instead of drifting into two
 * components that happen to look alike (the failure this repo has already
 * paid for: `ProjectQuestionsPanel` had a twin-length editor duplicated
 * nowhere else only because nothing had needed a second one yet).
 *
 * `submitError` follows `AvatarTemplateForm.vue`'s own precedent: the
 * container passes the RAW rejection down, unmapped, and this component maps
 * it onto its own fields via `applyServerFieldErrors` — the same shared
 * mapper every submitting form in this app uses (admin-backoffice spec,
 * "Form Field Validation And Banner Contract"). The container never touches
 * field-level error state itself.
 */
import { computed, nextTick, ref, watch } from 'vue'
import QuestionList from '@/components/organisms/QuestionList.vue'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { applyServerFieldErrors, getErrorFields } from '@/utils/http-error'
import { translateServerCodeOrFallback } from '@/utils/server-message'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import type { FormMessageKind } from '@/components/molecules/FormMessage.vue'
import type {
  QuestionEditorCompetency,
  QuestionEditorItem,
  QuestionEditorSubmission,
} from '@/types/question-editor'

const props = defineProps<{
  competencies: QuestionEditorCompetency[]
  questions: QuestionEditorItem[]
  /** The interview's language — what the candidate will hear, not the operator's. */
  locale: string
  /**
   * The per-competency maximum, or `null` when there is none to enforce (an
   * unknown cap, or a surface with genuinely no ceiling — e.g. the catalogue's
   * own default questions, which `ApplyCompetencySelection` only ever copies
   * FROM). Either way `null` must never disable Add: a wrongly-disabled button
   * is a feature the operator simply cannot reach.
   */
  cap: number | null
  saving: boolean
  /** The raw rejection from the container's last submit attempt, or `null`. */
  submitError: unknown | null
}>()

const emit = defineEmits<{
  (e: 'reorder', ids: number[]): void
  (e: 'remove', id: number): void
  (e: 'submit', payload: QuestionEditorSubmission): void
  /**
   * The part of `submitError` no field could claim, already translated — or
   * `null` once every message landed on a field (or there is no error at
   * all). The container owns no error-mapping logic of its own; this is the
   * one channel back for whatever THIS component's own mapping could not
   * place, so a container wanting a banner has something to show without
   * re-implementing the same `.data.errors` walk a second time.
   *
   * `kind` follows D4 (`error-state.ts`) for a rejection with NO field-shaped
   * body at all (403/404/409/network): `waiting` for a 409 — temporal,
   * self-resolving, not a failure — `error` for everything else. A 422 that
   * left some fields unclaimed is always `error`: it is a validation
   * response, never "try again shortly".
   */
  (e: 'unmapped-error', message: { kind: FormMessageKind; text: string } | null): void
}>()

const { t, te } = useI18n()

const removingId = ref<number | null>(null)

/** The question being written. `id: null` means a new one. */
const draft = ref<{ id: number | null; competencyId: number; en: string; it: string } | null>(null)
const errors = ref<{ text?: string; textIt?: string; competency?: string }>({})

const editorTitleEl = ref<HTMLElement[]>([])
const editorFormEl = ref<HTMLFormElement[]>([])

function editorField(): HTMLTextAreaElement | null {
  return editorFormEl.value[0]?.querySelector('[data-testid="question-text-en"]') ?? null
}

watch(draft, async (value) => {
  if (value === null) return

  await nextTick()

  editorTitleEl.value[0]?.scrollIntoView({ block: 'nearest' })
  editorField()?.focus()
})

/**
 * Server field errors land on the FIELD, not only in a banner — the banner is
 * for what the fields could NOT say. When the 422 mapped cleanly the operator
 * already has the exact reason under the control, and adding "the question
 * could not be saved" on top invites a retry that fails identically.
 */
watch(
  () => props.submitError,
  (submitError) => {
    errors.value = {}

    if (submitError === null) {
      emit('unmapped-error', null)

      return
    }

    // NO `{data:{errors}}` body at all — a 403, a 404, a 409, or a dead
    // network never carries one, and `applyServerFieldErrors` cannot invent
    // fields for them. Resolved through the SAME D4 state mapping every
    // remote read in this app already uses (`error-state.ts`), so a
    // permission refusal, a vanished question and "not ready yet" render as
    // themselves instead of all collapsing into one "could not save".
    if (getErrorFields(submitError) === null) {
      const state = resolveResourceErrorState(submitError)

      emit('unmapped-error', {
        kind: state === 'not-ready' ? 'waiting' : 'error',
        text: t(resourceErrorKey(state, 'message')),
      })

      return
    }

    const unmapped = applyServerFieldErrors(
      submitError,
      {
        text: 'text',
        'text.en': 'text',
        'text.it': 'textIt',
        competency_id: 'competency',
      } as const,
      (key, serverMessage) => {
        // NEVER the wire value. The shape rules answer with machine codes;
        // the per-competency cap answers with authored English prose composed
        // around a number, and printing that under an Italian label is the
        // defect the i18n mandate exists to stop.
        errors.value[key] = translateServerCodeOrFallback(
          { t, te },
          'projectQuestions.serverError',
          serverMessage,
          'projectQuestions.saveError'
        )
      }
    )

    const mapped = Object.values(errors.value).some((value) => value !== undefined)

    // Always `error`: a 422 that left a field unclaimed (or claimed none at
    // all) is a validation response, never the temporal "not ready yet" a 409
    // means — that distinction only applies to the no-body branch above.
    emit(
      'unmapped-error',
      unmapped && unmapped.length > 0
        ? {
            kind: 'error',
            text: unmapped
              .map((value) =>
                translateServerCodeOrFallback(
                  { t, te },
                  'projectQuestions.serverError',
                  value,
                  'projectQuestions.saveError'
                )
              )
              .join(' '),
          }
        : mapped
          ? null
          : { kind: 'error', text: t('projectQuestions.saveError') }
    )
  }
)

const groups = computed(() =>
  props.competencies.map((competency) => ({
    competencyId: competency.id,
    label: competency.label,
    questions: props.questions.filter((q) => q.competencyId === competency.id),
  }))
)

function atCap(group: { questions: QuestionEditorItem[] }): boolean {
  return props.cap !== null && group.questions.length >= props.cap
}

function onEdit(id: number): void {
  errors.value = {}

  const q = props.questions.find((item) => item.id === id)

  if (q === undefined) return

  draft.value = {
    id: q.id,
    competencyId: q.competencyId,
    en: q.text.en ?? '',
    it: q.text.it ?? '',
  }
}

function closeEditor(): void {
  draft.value = null
  errors.value = {}
}

function startNew(competencyId: number): void {
  errors.value = {}

  draft.value = { id: null, competencyId, en: '', it: '' }
}

function confirmRemove(): void {
  const id = removingId.value
  removingId.value = null

  if (id === null) return

  emit('remove', id)
}

function onSubmit(): void {
  const current = draft.value

  if (current === null) return

  if (current.en.trim() === '') {
    errors.value = { text: t('projectQuestions.textEnRequired') }

    return
  }

  errors.value = {}

  const text = { en: current.en.trim(), ...(current.it.trim() ? { it: current.it.trim() } : {}) }

  emit('submit', { id: current.id, competencyId: current.competencyId, text })
}

defineExpose({ startNew, closeEditor })
</script>
