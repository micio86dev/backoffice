<template>
  <section data-testid="catalogue-default-questions-panel" class="flex flex-col gap-4">
    <div>
      <h3 class="text-base font-semibold">{{ $t('catalogue.defaultQuestions.title') }}</h3>
      <p class="text-muted-foreground text-sm">
        {{ $t('catalogue.defaultQuestions.description') }}
      </p>
    </div>

    <FormMessage
      v-if="message"
      :kind="message.kind"
      :text="message.text"
      test-id="catalogue-default-questions-banner"
    />

    <!--
      `locale` here is the OPERATOR's own UI locale — there is no "project
      language" on this surface. `QuestionList`'s row summary resolves it,
      falling back to English, exactly as it does for a project's own
      language.
    -->
    <QuestionListEditor
      v-if="competencies.length > 0"
      ref="editorRef"
      :competencies="editorCompetencies"
      :questions="editorQuestions"
      :locale="locale"
      :cap="null"
      :saving="saving"
      :submit-error="submitError"
      @reorder="onReorder"
      @remove="onRemove"
      @submit="onSubmit"
      @unmapped-error="onUnmappedError"
    />

    <p v-else class="text-muted-foreground text-sm" data-testid="catalogue-default-questions-none">
      {{ $t('catalogue.defaultQuestions.noCompetencies') }}
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * The catalogue's own default-questions authoring surface (catalogue-
 * authoring spec, "Catalogue-Level Default Questions Per Competency"):
 * revision-scoped, per-competency, no "copy from revision X" affordance
 * (OQ-B — not built).
 *
 * A thin container over `QuestionListEditor`, the SAME editor
 * `ProjectQuestionsPanel` mounts (framework-catalogue-authoring D11) — this
 * file only owns the network and the two places the catalogue's generated
 * client genuinely disagrees with the project surface:
 *
 *   - Creating a default REQUIRES `position` AND both locales
 *     (`StoreDefaultQuestionRequest`), computed here as `max(position) + 1`
 *     within the target competency's own group — never the group's row
 *     COUNT, which collides with a surviving row's position the moment a
 *     delete has left a gap. `useProjectQuestions.ts`'s sibling never sends a
 *     position at all because the server assigns it, and never requires `it`
 *     because a project question's Italian text is optional.
 *   - There is no bulk `PUT .../order` endpoint for catalogue defaults (PR3's
 *     own scope note — never built). A reorder is N individual `PATCH` calls,
 *     issued SEQUENTIALLY (the DB's own `UNIQUE (revision_id, competency_id,
 *     position)` makes concurrent swaps risky) and followed by a `load()`
 *     regardless of outcome — see `onReorder`'s own docblock for why even the
 *     SUCCESS path reloads.
 *
 * There is no per-competency cap — `cap: null` is passed unconditionally.
 * Default questions are a TEMPLATE `ApplyCompetencySelection` copies FROM;
 * `PlatformSettings::maxQuestionsPerCompetency()` bounds the COPY
 * (`project_questions`), not the source.
 */
import { ref, computed, onMounted } from 'vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import QuestionListEditor from '@/components/organisms/QuestionListEditor.vue'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { actionErrorMessage } from '@/utils/action-error-message'
import { useCatalogue, type CatalogueCompetency } from '@/composables/useCatalogue'
import {
  useCatalogueDefaultQuestions,
  type CatalogueDefaultQuestion,
} from '@/composables/useCatalogueDefaultQuestions'
import type { QuestionEditorCompetency, QuestionEditorSubmission } from '@/types/question-editor'

const { listCompetencies } = useCatalogue()
const {
  fetchDefaultQuestions,
  createDefaultQuestion,
  updateDefaultQuestion,
  deleteDefaultQuestion,
} = useCatalogueDefaultQuestions()
const { t, locale } = useI18n()

const competencies = ref<CatalogueCompetency[]>([])
const questions = ref<CatalogueDefaultQuestion[]>([])
const message = ref<{ kind: FormMessageKind; text: string } | null>(null)
const saving = ref(false)
/** The raw rejection from the last submit attempt — `QuestionListEditor` maps it. */
const submitError = ref<unknown>(null)

const editorRef = ref<InstanceType<typeof QuestionListEditor> | null>(null)

const editorCompetencies = computed<QuestionEditorCompetency[]>(() =>
  competencies.value.map((competency) => ({ id: competency.id, label: competency.code }))
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
    const [competenciesResponse, questionsResponse] = await Promise.all([
      listCompetencies(),
      fetchDefaultQuestions(),
    ])

    competencies.value = competenciesResponse.data
    questions.value = questionsResponse.data
    message.value = null
  } catch (loadFailure) {
    const state = resolveResourceErrorState(loadFailure)

    message.value = {
      kind: state === 'not-ready' ? 'waiting' : 'error',
      text: t(resourceErrorKey(state, 'message')),
    }
  }
}

/**
 * Optimistic within the LOCAL list for the drag itself, but the write is N
 * separate `PATCH` calls — there is no bulk order endpoint (see the file
 * docblock) — and this ALWAYS reloads from the server afterward, success or
 * failure.
 *
 * A success still reloads (unlike `ProjectQuestionsPanel`'s single
 * transactional `PUT .../order`, which does not need to): this container's
 * own `questions` objects would otherwise keep their PRE-reorder `position`
 * values forever, since nothing here ever writes the new position back onto
 * them locally. A second drag back to the original order would then compare
 * each id's CURRENT slot against that stale `position`, compute "no change"
 * for every row, and send zero PATCHes — silently leaving the server's order
 * exactly as the first drag left it (gga review finding). Reloading is the
 * one point of truth this shape can safely have.
 *
 * On FAILURE, reloading is what makes the message honest rather than a
 * guess: some PATCHes may have already succeeded before one rejected, so a
 * local rollback to `previous` would claim "the previous order was kept"
 * when it might not have been.
 */
async function onReorder(ids: number[]): Promise<void> {
  const previous = questions.value
  const byId = new Map(previous.map((q) => [q.id, q]))

  const moving = new Set(ids)
  const reordered = ids
    .map((id) => byId.get(id))
    .filter((q): q is CatalogueDefaultQuestion => q !== undefined)

  let next = 0

  questions.value = previous.map((question) =>
    moving.has(question.id) ? (reordered[next++] ?? question) : question
  )

  const changes = ids
    .map((id, position) => ({ id, position }))
    .filter(({ id, position }) => byId.get(id)?.position !== position)

  // Every target slot a row in `changes` wants is, by construction,
  // currently held by ANOTHER member of `changes` — never a row excluded
  // from it: `ids` is the group's full new order, a permutation of the SAME
  // members, so a row NOT in `changes` sits at the same position both
  // before and after, and no other row in that same final arrangement can
  // also want the one position it never gave up. `UpdateDefaultQuestionRequest`
  // (`api`) validates `position` uniqueness PER REQUEST against whatever is
  // in the database right now, not deferred to commit — so a same-competency swap
  // sent as two ordinary PATCHes (A: 0→1, B: 1→0) has its first request
  // refused outright: B still holds slot 1 (gga review finding on an earlier
  // "just make it sequential" attempt, which only fixed a DIFFERENT race and
  // left this one). Two phases avoid it structurally: park every changing
  // row at a TEMPORARY position no real row in the group could hold, THEN
  // place each at its real final position — every slot phase 2 could want
  // was vacated in phase 1.
  //
  // The temporary base is DERIVED from the group's own current highest
  // position, never a fixed constant: a fixed value risks colliding with a
  // row a PREVIOUS reorder attempt left parked there after failing partway
  // (the API places no upper bound on `position`, so a stranded temporary
  // value survives a reload).
  const highestPosition = Math.max(0, ...previous.map((q) => q.position))
  const tempPositionBase = highestPosition + 1

  try {
    for (const [index, { id }] of changes.entries()) {
      await updateDefaultQuestion(id, { position: tempPositionBase + index })
    }

    for (const { id, position } of changes) {
      await updateDefaultQuestion(id, { position })
    }

    await load()
  } catch (error) {
    // `load()` runs FIRST and, on its own success, sets `message.value =
    // null` — so the reorder failure has to be applied AFTER it, or the
    // resync silently erases the very message it exists to show.
    await load()
    message.value = actionErrorMessage(error, t, 'catalogue.defaultQuestions.reorderError')
  }
}

async function onRemove(id: number): Promise<void> {
  try {
    await deleteDefaultQuestion(id)
    questions.value = questions.value.filter((q) => q.id !== id)
    message.value = null
  } catch (error) {
    message.value = actionErrorMessage(error, t, 'catalogue.defaultQuestions.removeError')
  }
}

function onUnmappedError(payload: { kind: FormMessageKind; text: string } | null): void {
  message.value = payload
}

async function onSubmit(payload: QuestionEditorSubmission): Promise<void> {
  saving.value = true
  submitError.value = null

  try {
    if (payload.id === null) {
      // Appended at the end of ITS OWN group — the server requires a
      // position on create and assigns none itself, unlike a project
      // question. `max(position) + 1`, NEVER the group's row COUNT: a
      // competency whose first default was deleted has a count of, say, 1
      // but its surviving row may already sit at position 1 — a fresh
      // `count` (also 1) would collide with it against the DB's own
      // `UNIQUE (revision_id, competency_id, position)` constraint. Nothing
      // here compacts positions on delete, so a gap is the ordinary case,
      // not an edge one.
      const groupPositions = questions.value
        .filter((q) => q.competency_id === payload.competencyId)
        .map((q) => q.position)
      const position = groupPositions.length > 0 ? Math.max(...groupPositions) + 1 : 0

      await createDefaultQuestion({
        competency_id: payload.competencyId,
        // `it` defaults to `''`, never omitted: `StoreDefaultQuestionRequest`
        // requires BOTH locales (catalogue-authoring spec — a default is a
        // TEMPLATE copied verbatim into whatever language a project runs in,
        // so an `en`-only one would silently ship a blank Italian question
        // the day it is first selected). `QuestionListEditor`'s own
        // client-side check only enforces `en`, so a blank `it` reaches the
        // server rather than being silently dropped here — the 422 it
        // answers with maps onto the Italian field exactly like any other
        // `text.it` refusal (QuestionListEditor's `submitError` watcher).
        text: { en: payload.text.en, it: payload.text.it ?? '' },
        position,
      })
    } else {
      // Same `it` default as create, and for the same reason:
      // `UpdateDefaultQuestionRequest` marks `text.it` `required_with:text`
      // — whenever `text` is present in the payload at all (which it always
      // is here, since `QuestionListEditor` never submits an edit with no
      // text), `it` must be too, blank or not.
      await updateDefaultQuestion(payload.id, {
        text: { en: payload.text.en, it: payload.text.it ?? '' },
      })
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

defineExpose({ load })
</script>
