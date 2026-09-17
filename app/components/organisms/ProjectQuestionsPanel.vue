<template>
  <section data-testid="project-questions-panel" class="flex flex-col gap-4">
    <div>
      <h3 class="text-base font-semibold">{{ $t('projectQuestions.title') }}</h3>
      <p class="text-muted-foreground text-sm">{{ $t('projectQuestions.description') }}</p>
    </div>

    <FormMessage
      v-if="message"
      :kind="message.kind"
      :text="message.text"
      test-id="project-questions-banner"
    />

    <QuestionListEditor
      v-if="competencies.length > 0"
      ref="editorRef"
      :competencies="editorCompetencies"
      :questions="editorQuestions"
      :unsaved-competency-ids="unsavedCompetencyIds ?? []"
      :locale="locale"
      :cap="cap"
      :saving="saving"
      :submit-error="submitError"
      @reorder="onReorder"
      @remove="onRemove"
      @submit="onSubmit"
      @unmapped-error="onUnmappedError"
    />

    <p v-else class="text-muted-foreground text-sm" data-testid="project-questions-none">
      {{ $t('projectQuestions.noCompetencies') }}
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * The container for a project's predefined questions.
 *
 * Owns the network so `QuestionListEditor` can stay presentational and
 * testable without one. Rendered only for a SAVED project — a question needs
 * a `project_id`, so offering the editor while creating one would collect
 * input with nowhere to put it.
 *
 * A THIN container (framework-catalogue-authoring D11): every rendering and
 * editing decision this file used to make directly — the competency grouping,
 * the dual-locale editor, drag reorder, the per-competency cap, client and
 * server-side validation, and the removal `ConfirmDialog` — now lives in
 * `QuestionListEditor`, extracted rather than duplicated so it can also back
 * `CatalogueDefaultQuestionsPanel` without becoming a second editor that
 * drifts from this one. This file only ever reaches `deleteQuestion()` after
 * `QuestionListEditor` has already emitted `remove`, which it does not do
 * until its OWN `ConfirmDialog` confirms.
 */
import { ref, computed, onMounted } from 'vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import QuestionListEditor from '@/components/organisms/QuestionListEditor.vue'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { actionErrorMessage } from '@/utils/action-error-message'
import { useProjectQuestions, type ProjectQuestion } from '@/composables/useProjectQuestions'
import type { QuestionEditorCompetency, QuestionEditorSubmission } from '@/types/question-editor'

const props = defineProps<{
  projectId: number
  /**
   * The project's competencies, in order.
   *
   * The groups are driven by THESE, not by the questions that happen to
   * exist: a competency with none would otherwise render no group, and there
   * would be nowhere to add its first question — which is the state every
   * project starts in.
   */
  competencies: { id: number; code: string }[]
  /**
   * Which of `competencies` the server does not know about yet — ticked in
   * the form's picker but not yet saved. Forwarded to `QuestionListEditor`,
   * which disables "Add" for these with an explanation rather than letting
   * the operator reach a confusing `competency_invalid` 422.
   */
  unsavedCompetencyIds?: number[]
  /** The PROJECT's language — what the candidate will hear. */
  locale: string
}>()

const { fetchQuestions, createQuestion, updateQuestion, deleteQuestion, reorderQuestions } =
  useProjectQuestions()
const { t } = useI18n()

const questions = ref<ProjectQuestion[]>([])

/**
 * The per-competency maximum, published by the API alongside the list.
 *
 * The server has always refused the (N+1)th question; the operator learned N
 * by writing one and being told no. It is a platform setting behind a
 * superadmin-only endpoint, so it could not be read directly — it travels in
 * `meta` on this list instead, and it depends on the project's assessment
 * type, which is why it cannot be a constant here.
 *
 * `null` until the first load: an unknown cap must never disable the button.
 */
const cap = ref<number | null>(null)
const message = ref<{ kind: FormMessageKind; text: string } | null>(null)
const saving = ref(false)
/** The raw rejection from the last submit attempt — `QuestionListEditor` maps it. */
const submitError = ref<unknown>(null)

const editorRef = ref<InstanceType<typeof QuestionListEditor> | null>(null)

const editorCompetencies = computed<QuestionEditorCompetency[]>(() =>
  props.competencies.map((competency) => ({ id: competency.id, label: competency.code }))
)

const editorQuestions = computed(() =>
  questions.value.map((q) => ({
    id: q.id,
    competencyId: q.competency_id,
    text: (q.text ?? {}) as Record<string, string | null | undefined>,
  }))
)

async function load(): Promise<void> {
  try {
    const response = await fetchQuestions(props.projectId)

    questions.value = response.data
    // Read defensively even though the contract declares it required: a
    // missing `meta` must leave the cap UNKNOWN, not throw. Throwing here
    // lands in the catch below and reports "could not load the questions"
    // about a list that arrived perfectly well.
    cap.value = response.meta?.max_questions_per_competency ?? null
  } catch (loadFailure) {
    // Not `saveError`. Nothing was being saved — this is the LOAD — and
    // telling an operator "could not save the question" for a failed fetch
    // sends them looking for a draft they never wrote.
    //
    // And through the SHARED mapper, like every other remote read in the
    // backoffice: a 403 is permanent, and "could not load, please try again"
    // invites a retry that fails identically. `error-state.ts` already holds
    // the copy for each state.
    const state = resolveResourceErrorState(loadFailure)

    message.value = {
      kind: state === 'not-ready' ? 'waiting' : 'error',
      text: t(resourceErrorKey(state, 'message')),
    }
  }
}

/**
 * Reorder OPTIMISTICALLY, and reload on failure.
 *
 * A drag that visibly snaps back after a round trip reads as a broken
 * control, so the list moves immediately. The server is still the authority:
 * if the write fails the previous order is restored from it rather than
 * guessed at locally, which is also what the endpoint guarantees by rewriting
 * every position in one transaction.
 */
async function onReorder(ids: number[]): Promise<void> {
  const previous = questions.value
  const byId = new Map(previous.map((q) => [q.id, q]))

  // SPLICED back into place, never rebuilt from `ids`.
  //
  // `QuestionListEditor` re-emits ids for ONE competency's group. Rebuilding
  // the whole list from that subset would drop every other group's questions
  // from the rendered state — permanently, because the success path clears
  // the banner and never reloads.
  const moving = new Set(ids)
  const reordered = ids
    .map((id) => byId.get(id))
    .filter((q): q is ProjectQuestion => q !== undefined)

  let next = 0

  questions.value = previous.map((question) =>
    moving.has(question.id) ? (reordered[next++] ?? question) : question
  )

  try {
    await reorderQuestions(props.projectId, ids)
    message.value = null
  } catch (error) {
    questions.value = previous
    message.value = actionErrorMessage(error, t, 'projectQuestions.reorderError')
  }
}

async function onRemove(id: number): Promise<void> {
  try {
    await deleteQuestion(props.projectId, id)
    questions.value = questions.value.filter((q) => q.id !== id)
    message.value = null
  } catch (error) {
    // A failed DELETE, said as one. It claimed the save failed, which is a
    // sentence about an action the operator did not take.
    message.value = actionErrorMessage(error, t, 'projectQuestions.removeError')
  }
}

/**
 * `QuestionListEditor` owns the field-error mapping and its own D4 state
 * resolution for a submit failure with no field-shaped body; this is the one
 * channel back for whatever that produced.
 */
function onUnmappedError(payload: { kind: FormMessageKind; text: string } | null): void {
  message.value = payload
}

async function onSubmit(payload: QuestionEditorSubmission): Promise<void> {
  saving.value = true
  submitError.value = null

  try {
    if (payload.id === null) {
      await createQuestion(props.projectId, {
        competency_id: payload.competencyId,
        text: payload.text,
      })
    } else {
      await updateQuestion(props.projectId, payload.id, payload.text)
    }

    message.value = null
    editorRef.value?.closeEditor()
    await load()
  } catch (error) {
    submitError.value = error
  } finally {
    saving.value = false
  }
}

onMounted(load)

defineExpose({ load, startNew: (competencyId: number) => editorRef.value?.startNew(competencyId) })
</script>
