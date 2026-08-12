/**
 * useProjects — typed reads/writes over the C4 project-configuration
 * endpoints (D8). Thin wiring over `useApi().apiFetch`, mirroring
 * `useParticipants.ts:16-30`.
 */
import type { components, paths } from '../../types/api'
import { useApi } from './useApi'

export type ProjectListResponse =
  paths['/projects']['get']['responses']['200']['content']['application/json']

export type ProjectResponse =
  paths['/projects']['post']['responses']['201']['content']['application/json']

export type Project = components['schemas']['ProjectResource']

export type CreateProjectPayload =
  paths['/projects']['post']['requestBody']['content']['application/json']

/**
 * `UpdateProjectRequest`'s Scramble schema has no derivable `properties`
 * (its `rules()` array is built conditionally, which Scramble cannot
 * statically resolve — verified against the committed `openapi.json`), so
 * the PATCH payload is typed off the CREATE payload instead: every field
 * `UpdateProjectRequest.php` accepts is also a `StoreProjectRequest` field
 * (cross-checked against the PHP source), minus `framework_version_id`
 * (blanket-`prohibited` on every PATCH, D9) and plus `status` (only ever
 * written post-create, for the lifecycle transition).
 */
export type UpdateProjectPayload = Partial<Omit<CreateProjectPayload, 'framework_version_id'>> & {
  status?: 'draft' | 'active' | 'archived'
}

export function useProjects() {
  const { apiFetch } = useApi()

  async function listProjects(): Promise<ProjectListResponse> {
    return apiFetch<ProjectListResponse>('/projects')
  }

  async function createProject(payload: CreateProjectPayload): Promise<ProjectResponse> {
    return apiFetch<ProjectResponse>('/projects', { method: 'POST', body: payload })
  }

  async function updateProject(
    id: number | string,
    payload: UpdateProjectPayload
  ): Promise<ProjectResponse> {
    return apiFetch<ProjectResponse>(`/projects/${id}`, { method: 'PATCH', body: payload })
  }

  return { listProjects, createProject, updateProject }
}
