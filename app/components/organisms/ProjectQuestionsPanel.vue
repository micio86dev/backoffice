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
        @reorder="(ids) => onReorder(ids)"
        @remove="(id) => onRemove(id)"
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
        <!--
          The house Field/FieldLabel/Textarea, not raw elements: the vendored
          FieldLabel wires `for`/`id` through Reka UI context, which is what
          `vuejs-accessibility/label-has-for` is checking for and what every
          other form here already uses. Hand-rolling the pair passed the eye and
          failed the linter, correctly.
        -->
        <Field :data-invalid="Boolean(errors.text)">
          <FieldLabel for="question-en">{{ $t('projectQuestions.textEn') }}</FieldLabel>
          <Textarea
            id="question-en"
            v-model="draft.en"
            rows="2"
            required
            :aria-invalid="Boolean(errors.text)"
            data-testid="question-text-en"
          />
          <FieldError v-if="errors.text" data-testid="question-text-error">{{
            errors.text
          }}</FieldError>
        </Field>

        <Field>
          <FieldLabel for="question-it">{{ $t('projectQuestions.textIt') }}</FieldLabel>
          <Textarea id="question-it" v-model="draft.it" rows="2" data-testid="question-text-it" />
        </Field>

        <!--
          The competency error stands ALONE, outside both text Fields.

          It used to wrap the Italian one, so a refusal about the COMPETENCY
          ("a standard project allows at most one question per competency")
          marked "Text (Italian)" invalid and printed itself under that label.
          There is genuinely no control to attach it to — the competency is
          decided by which Add was pressed — and that is the argument for a
          field-less message, not for borrowing the nearest field's.
        -->
        <FieldError v-if="errors.competency" data-testid="question-competency-error">{{
          errors.competency
        }}</FieldError>

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
          :data-testid="`question-add-${group.competencyId}`"
          @click="startNew(group.competencyId)"
        >
          {{ $t('projectQuestions.add') }}
        </Button>
      </div>
    </div>

    <p
      v-if="groups.length === 0"
      class="text-muted-foreground text-sm"
      data-testid="project-questions-none"
    >
      {{ $t('projectQuestions.noCompetencies') }}
    </p>

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
  </section>
</template>

<script setup lang="ts">
/**
 * The container for a project's predefined questions.
 *
 * Owns the network so `QuestionList` can stay presentational and testable
 * without one. Rendered only for a SAVED project — a question needs a
 * `project_id`, so offering the editor while creating one would collect input
 * with nowhere to put it.
 *
 * Questions are grouped by competency because that is the unit the domain
 * counts in: `standard` allows one per competency and `potential` requires
 * four, and a flat list would hide which competency is still short.
 */
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import QuestionList from '@/components/organisms/QuestionList.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { applyServerFieldErrors } from '@/utils/http-error'
import { Textarea } from '@/components/ui/textarea'
import { useProjectQuestions, type ProjectQuestion } from '@/composables/useProjectQuestions'

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
  /** The PROJECT's language — what the candidate will hear. */
  locale: string
}>()

const { fetchQuestions, createQuestion, updateQuestion, deleteQuestion, reorderQuestions } =
  useProjectQuestions()
const { t } = useI18n()

const questions = ref<ProjectQuestion[]>([])
const message = ref<{ kind: FormMessageKind; text: string } | null>(null)

const saving = ref(false)
const removingId = ref<number | null>(null)
const errors = ref<{ text?: string; competency?: string }>({})

/**
 * The question being written. `id: null` means a new one.
 *
 * A single draft rather than one editor per row: two open at once invites
 * saving the wrong one, and the list is short enough that the operator never
 * needs both.
 */
const draft = ref<{ id: number | null; competencyId: number; en: string; it: string } | null>(null)

/**
 * Bring the editor into view and put the cursor in it.
 *
 * The panel renders inside `FormDrawer`, whose body scrolls independently, so
 * a group near the bottom of a long competency list can open its editor just
 * off the visible edge — the same "where did it go" the old bottom-of-panel
 * layout caused, arrived at by a different route.
 *
 * `block: 'nearest'` rather than `'center'`: if the editor is ALREADY visible
 * — the common case now that it opens where the operator clicked — nearest
 * scrolls nothing at all, while center yanks the list under their hands for no
 * reason.
 *
 * Both calls are optional-chained on the ELEMENT, not on the method: the
 * element is genuinely absent for a tick after the draft opens, while the
 * methods themselves always exist — the test environment is happy-dom
 * (`vitest.config.ts`), which implements `scrollIntoView`, so an earlier
 * comment claiming jsdom lacked it was wrong on both counts and was the excuse
 * for leaving this untested. It is tested now.
 */
// An ARRAY, because the ref sits inside `v-for` and Vue compiles that with
// `ref_for: true` regardless of how many elements actually render. Typed as a
// single element it was always null, and the `?.` on the method call swallowed
// the miss — so the scroll documented above never once ran, `typecheck` stayed
// green. The "defensive" optional call on the METHOD was what hid it — the
// environment is happy-dom and implements `scrollIntoView`, so a test could
// always have seen this; there simply was not one.
const editorTitleEl = ref<HTMLElement[]>([])

/**
 * The English textarea, by template ref rather than by document lookup.
 *
 * `document.querySelector('[data-testid=question-text-en]')` worked only
 * because exactly one editor can be open at a time — an invariant this
 * component happens to hold today and nothing enforces. A ref says the same
 * thing without depending on it, and an ARRAY for the same `ref_for` reason as
 * the title above.
 */
const editorFormEl = ref<HTMLFormElement[]>([])

/**
 * The first control of the open editor, found WITHIN that editor.
 *
 * The previous version reached for `document.querySelector`, which worked only
 * because exactly one editor can be open — an invariant this component happens
 * to hold and nothing enforces. Scoping the lookup to the form says the same
 * thing without depending on it. An array for the same `ref_for` reason as the
 * title ref above.
 */
function editorField(): HTMLTextAreaElement | null {
  return editorFormEl.value[0]?.querySelector('[data-testid="question-text-en"]') ?? null
}

watch(draft, async (value) => {
  if (value === null) return

  await nextTick()

  // Not `?.scrollIntoView?.()`: a missing method here is a broken assumption,
  // and it must throw rather than quietly do nothing.
  editorTitleEl.value[0]?.scrollIntoView({ block: 'nearest' })
  editorField()?.focus()
})

const groups = computed(() =>
  props.competencies.map((competency) => ({
    competencyId: competency.id,
    label: competency.code,
    questions: questions.value.filter((q) => q.competency_id === competency.id),
  }))
)

async function load(): Promise<void> {
  try {
    questions.value = (await fetchQuestions(props.projectId)).data
  } catch {
    // Not `saveError`. Nothing was being saved — this is the LOAD — and
    // telling an operator "could not save the question" for a failed fetch
    // sends them looking for a draft they never wrote. `reorderError` was
    // already the precedent for per-operation copy.
    message.value = { kind: 'error', text: t('projectQuestions.loadError') }
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
  // `QuestionList` renders once per competency and emits the ids of ITS OWN
  // group. Rebuilding the whole list from that subset dropped every other
  // group's questions from the rendered state — permanently, because the
  // success path clears the banner and never reloads. The bug was invisible
  // when the server succeeded and self-healed when it failed, which is the
  // worst possible pair.
  //
  // The reordered ids take the SLOTS the same ids currently occupy, so
  // questions belonging to other competencies keep their positions untouched.
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
  } catch {
    questions.value = previous
    message.value = { kind: 'error', text: t('projectQuestions.reorderError') }
  }
}

function onRemove(id: number): void {
  removingId.value = id
}

async function confirmRemove(): Promise<void> {
  const id = removingId.value
  removingId.value = null

  if (id === null) return

  try {
    await deleteQuestion(props.projectId, id)
    questions.value = questions.value.filter((q) => q.id !== id)
    message.value = null
  } catch {
    // A failed DELETE, said as one. It claimed the save failed, which is a
    // sentence about an action the operator did not take.
    message.value = { kind: 'error', text: t('projectQuestions.removeError') }
  }
}

function onEdit(id: number): void {
  errors.value = {}

  const q = questions.value.find((item) => item.id === id)

  if (q === undefined) return

  const text = (q.text ?? {}) as Record<string, string | null | undefined>

  draft.value = {
    id: q.id,
    competencyId: q.competency_id,
    en: text.en ?? '',
    it: text.it ?? '',
  }
}

/** Start a new question for a competency that already has at least one. */
/**
 * Close the editor AND drop its errors.
 *
 * `errors` used to be cleared only inside `onSubmit`, so opening, closing or
 * switching drafts carried them: press Add on COL, submit empty, cancel, press
 * Add on INN, and a brand-new untouched editor rendered COL's message. Worse
 * with a server refusal — "at most one question per competency" stayed pinned
 * under a competency that had none. A message has to be true of what is on
 * screen.
 */
function closeEditor(): void {
  draft.value = null
  errors.value = {}
}

function startNew(competencyId: number): void {
  errors.value = {}

  draft.value = { id: null, competencyId, en: '', it: '' }
}

async function onSubmit(): Promise<void> {
  const current = draft.value

  if (current === null) return

  // Say so, rather than returning in silence.
  //
  // The form is `novalidate`, so the `required` on the English field renders
  // nothing native, and this branch used to just `return`: the operator
  // pressed Save and nothing happened at all — no message, no focus, no way to
  // find out why. `errors.text` was only ever written from a server response
  // that this path never reached.
  if (current.en.trim() === '') {
    errors.value = { text: t('projectQuestions.textEnRequired') }

    return
  }

  saving.value = true
  errors.value = {}

  try {
    // `it` is sent only when written. An empty string would store a blank
    // Italian that silently beats the English fallback, so the candidate would
    // be asked nothing at all.
    const text = { en: current.en.trim(), ...(current.it.trim() ? { it: current.it.trim() } : {}) }

    if (current.id === null) {
      await createQuestion(props.projectId, { competency_id: current.competencyId, text })
    } else {
      await updateQuestion(props.projectId, current.id, text)
    }

    draft.value = null
    message.value = null
    await load()
  } catch (submitError) {
    // Server field errors land on the FIELD, not only in the banner: the
    // refusals this endpoint issues are specific ("a standard project allows
    // at most 1 question per competency", "competency is type=standard"), and
    // a generic banner would make the operator hunt for what to change.
    const unmapped = applyServerFieldErrors(
      submitError,
      { text: 'text', 'text.en': 'text', competency_id: 'competency' } as const,
      (key, serverMessage) => {
        errors.value[key] = serverMessage
      }
    )

    message.value =
      unmapped && unmapped.length > 0
        ? { kind: 'error', text: unmapped.join(' ') }
        : { kind: 'error', text: t('projectQuestions.saveError') }
  } finally {
    saving.value = false
  }
}

onMounted(load)

defineExpose({ load, startNew })
</script>
