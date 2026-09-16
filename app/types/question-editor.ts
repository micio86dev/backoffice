/**
 * The normalized shape `QuestionListEditor` renders, and the two source
 * domains it is normalized FROM.
 *
 * `QuestionListEditor` is shared by `ProjectQuestionsPanel` (per-project
 * predefined questions, `ProjectQuestion` from `useProjectQuestions.ts`) and
 * `CatalogueDefaultQuestionsPanel` (revision-scoped catalogue defaults,
 * `CatalogueDefaultQuestion` from `useCatalogueDefaultQuestions.ts`). Those two
 * generated-client shapes agree on `competency_id`, but only one carries
 * `revision_id`/`position`, and only the catalogue side requires a create
 * payload to name a `position` at all — a divergence the shared editor must
 * not need to know about. Rather than teach it either container's vocabulary
 * — which would make it not actually shared — each container maps its own
 * list into these two interfaces before handing them down.
 */

/** One group heading: the competency the questions below it belong to. */
export interface QuestionEditorCompetency {
  id: number
  /** Whatever the container wants shown as the group heading. */
  label: string
}

/** One question, addressable by id and grouped by `competencyId`. */
export interface QuestionEditorItem {
  id: number
  competencyId: number
  /** The locale map exactly as the API stores it — never locale-resolved. */
  text: Record<string, string | null | undefined>
}

/**
 * What `QuestionListEditor` asks its container to persist when the operator
 * presses Save. `id: null` means a new question; the container decides how to
 * turn this into a POST/PATCH call, including whatever fields (e.g. a
 * catalogue default's `position`) this shared shape does not carry.
 */
export interface QuestionEditorSubmission {
  id: number | null
  competencyId: number
  text: { en: string; it?: string }
}

/**
 * What `QuestionList` (the reorderable row list) actually needs — `id` and
 * `text` only, never `competencyId`. Deliberately NARROWER than
 * `QuestionEditorItem`, and deliberately a structural `Pick` rather than the
 * full interface: `QuestionList.spec.ts` mounts it directly against
 * `ProjectQuestion`-shaped fixtures (`competency_id`, `project_id`,
 * timestamps, …), and requiring `competencyId` here would reject every one of
 * those fixtures for a field this component never reads.
 */
export type QuestionListEntry = Pick<QuestionEditorItem, 'id' | 'text'>
