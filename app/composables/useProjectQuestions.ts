/**
 * useProjectQuestions — the predefined questions of one project.
 *
 * Thin wiring over `useApi().apiFetch`, in the same shape as
 * `useOrganization.ts`. The types come from the generated client, so a change
 * to the API contract breaks the build here rather than at runtime in front of
 * an operator.
 */
import type { paths } from '../../types/api'
import { useApi } from './useApi'

export type ProjectQuestionsResponse =
  paths['/projects/{project}/questions']['get']['responses']['200']['content']['application/json']

export type ProjectQuestion = ProjectQuestionsResponse['data'][number]

/** The locale map, exactly as the API stores it — never locale-resolved. */
export interface QuestionText {
  en: string
  it?: string | null
}

export function useProjectQuestions() {
  const { apiFetch } = useApi()

  async function fetchQuestions(projectId: number): Promise<ProjectQuestionsResponse> {
    return apiFetch<ProjectQuestionsResponse>(`/projects/${projectId}/questions`)
  }

  async function createQuestion(
    projectId: number,
    payload: { competency_id: number; text: QuestionText }
  ): Promise<{ data: ProjectQuestion }> {
    return apiFetch<{ data: ProjectQuestion }>(`/projects/${projectId}/questions`, {
      method: 'POST',
      body: payload,
    })
  }

  async function updateQuestion(
    projectId: number,
    questionId: number,
    text: QuestionText
  ): Promise<{ data: ProjectQuestion }> {
    return apiFetch<{ data: ProjectQuestion }>(`/projects/${projectId}/questions/${questionId}`, {
      method: 'PATCH',
      body: { text },
    })
  }

  async function deleteQuestion(projectId: number, questionId: number): Promise<void> {
    await apiFetch(`/projects/${projectId}/questions/${questionId}`, { method: 'DELETE' })
  }

  /**
   * Send the WHOLE ordered list, never a single move.
   *
   * The server rewrites every position in one transaction: positions are
   * unique per competency among live rows, so moving one row at a time would
   * collide with the position it is moving into. It also means a failed
   * request leaves the previous order intact rather than a half-applied one.
   */
  async function reorderQuestions(projectId: number, ids: number[]): Promise<void> {
    await apiFetch(`/projects/${projectId}/questions/order`, {
      method: 'PUT',
      body: { ids },
    })
  }

  return { fetchQuestions, createQuestion, updateQuestion, deleteQuestion, reorderQuestions }
}
