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

    <div v-for="group in groups" :key="group.competencyId" class="flex flex-col gap-2">
      <h4 class="text-sm font-medium">{{ group.label }}</h4>

      <QuestionList
        :questions="group.questions"
        :locale="locale"
        @reorder="(ids) => onReorder(ids)"
        @remove="(id) => onRemove(id)"
        @edit="(id) => onEdit(id)"
      />

      <div>
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
      Both languages, side by side, and always — never one field that follows
      the operator's locale. The API stores a map and the interview reads the
      PROJECT's language, so an editor showing one would let somebody save a
      question the candidate never hears.
    -->
    <form
      v-if="draft"
      data-testid="question-editor"
      class="border-border flex flex-col gap-2 rounded-lg border p-3"
      novalidate
      @submit.prevent="onSubmit"
    >
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

      <Field :data-invalid="Boolean(errors.competency)">
        <FieldLabel for="question-it">{{ $t('projectQuestions.textIt') }}</FieldLabel>
        <Textarea id="question-it" v-model="draft.it" rows="2" data-testid="question-text-it" />
        <!--
          The competency error lands HERE rather than on a control of its own:
          the competency is chosen by which "Add" button was pressed, so there
          is no field to attach it to — and the server's refusals about it
          ("a standard project allows at most 1 question per competency") are
          exactly what the operator needs to read before retyping.
        -->
        <FieldError v-if="errors.competency" data-testid="question-competency-error">{{
          errors.competency
        }}</FieldError>
      </Field>

      <div class="flex gap-2">
        <Button type="submit" :loading="saving" data-testid="question-save">
          {{ $t('projects.action.save') }}
        </Button>
        <Button type="button" variant="outline" data-testid="question-cancel" @click="draft = null">
          {{ $t('projects.action.cancel') }}
        </Button>
      </div>
    </form>
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
import { ref, computed, onMounted } from 'vue'
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
    message.value = { kind: 'error', text: t('projectQuestions.saveError') }
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

  questions.value = ids
    .map((id) => byId.get(id))
    .filter((q): q is ProjectQuestion => q !== undefined)

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
    message.value = { kind: 'error', text: t('projectQuestions.saveError') }
  }
}

function onEdit(id: number): void {
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
function startNew(competencyId: number): void {
  draft.value = { id: null, competencyId, en: '', it: '' }
}

async function onSubmit(): Promise<void> {
  const current = draft.value

  if (current === null || current.en.trim() === '') return

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
