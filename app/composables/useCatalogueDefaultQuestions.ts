/**
 * useCatalogueDefaultQuestions — the catalogue's own default questions
 * (catalogue-authoring spec, "Catalogue-Level Default Questions Per
 * Competency"): the template `ApplyCompetencySelection` copies FROM the
 * moment a project first selects a competency — never read directly at
 * interview time (see `project-config`).
 *
 * Thin wiring over `useApi().apiFetch`, same shape as
 * `useProjectQuestions.ts`. Two real differences from that sibling, both
 * DERIVED FROM THE GENERATED CLIENT rather than assumed:
 *
 *   - `POST /catalogue/default-questions` requires `position` AND both
 *     `text.en`/`text.it` (`StoreDefaultQuestionRequest` — deliberately
 *     stricter than a project question's `it`-optional shape: a default is a
 *     TEMPLATE copied verbatim into whatever language a project runs in, so
 *     an `en`-only default would silently ship a blank Italian question the
 *     day it is first selected). The caller (`CatalogueDefaultQuestionsPanel`)
 *     computes `position` as `max(position) + 1` within the target
 *     competency's own group — NEVER the group's row count, which collides
 *     with a surviving row's position the moment a delete has left a gap —
 *     and MUST supply `text.it`.
 *   - There is no bulk `PUT .../order` endpoint for catalogue defaults (the
 *     scope note on `RevisionController`/CRUD wiring, PR3 task 12.1, never
 *     built one). A reorder is therefore N individual `PATCH` calls, each
 *     carrying the row's new `position` — the caller's job, not this file's.
 *     `UpdateDefaultQuestionRequest` validates that `position` is unique
 *     within `(revision_id, competency_id)` PER REQUEST, against whatever the
 *     database holds at that instant — so a same-competency swap needs a
 *     two-phase temporary-position dance to avoid a same-slot refusal; see
 *     `CatalogueDefaultQuestionsPanel.vue`'s own `onReorder` docblock.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type CatalogueDefaultQuestionsResponse =
  paths['/catalogue/default-questions']['get']['responses']['200']['content']['application/json']

export type CatalogueDefaultQuestion = CatalogueDefaultQuestionsResponse['data'][number]

export type CreateDefaultQuestionPayload =
  paths['/catalogue/default-questions']['post']['requestBody']['content']['application/json']

export type CreateDefaultQuestionResponse =
  paths['/catalogue/default-questions']['post']['responses']['201']['content']['application/json']

export type UpdateDefaultQuestionPayload = NonNullable<
  paths['/catalogue/default-questions/{defaultQuestion}']['patch']['requestBody']
>['content']['application/json']

export type UpdateDefaultQuestionResponse =
  paths['/catalogue/default-questions/{defaultQuestion}']['patch']['responses']['200']['content']['application/json']

export function useCatalogueDefaultQuestions() {
  const { apiFetch } = useApi()

  async function fetchDefaultQuestions(): Promise<CatalogueDefaultQuestionsResponse> {
    return apiFetch<CatalogueDefaultQuestionsResponse>('/catalogue/default-questions')
  }

  async function createDefaultQuestion(
    payload: CreateDefaultQuestionPayload
  ): Promise<CreateDefaultQuestionResponse> {
    return apiFetch<CreateDefaultQuestionResponse>('/catalogue/default-questions', {
      method: 'POST',
      body: payload,
    })
  }

  async function updateDefaultQuestion(
    id: number,
    payload: UpdateDefaultQuestionPayload
  ): Promise<UpdateDefaultQuestionResponse> {
    return apiFetch<UpdateDefaultQuestionResponse>(`/catalogue/default-questions/${id}`, {
      method: 'PATCH',
      body: payload,
    })
  }

  async function deleteDefaultQuestion(id: number): Promise<void> {
    await apiFetch(`/catalogue/default-questions/${id}`, { method: 'DELETE' })
  }

  return {
    fetchDefaultQuestions,
    createDefaultQuestion,
    updateDefaultQuestion,
    deleteDefaultQuestion,
  }
}
