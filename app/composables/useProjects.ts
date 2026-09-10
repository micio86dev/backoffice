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
  // From the SNAPSHOT, not hand-written: this union is already generated as
  // `ProjectResource.status`, so a new lifecycle state on the server reaches
  // this type through codegen instead of waiting for someone to remember.
  status?: Project['status']
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

  /**
   * Soft-delete a project.
   *
   * Named `deleteProject(` deliberately: it matches DESTRUCTIVE_CALL_REGEX in
   * `tests/unit/destructive-action.spec.ts`, which is what forces every call
   * site to be gated by a ConfirmDialog. Renaming it to dodge that regex
   * would satisfy the guard and remove the protection.
   *
   * The API answers 409 while the project is `active`; `can.delete` on the
   * resource already carries that half, so the control is not offered there.
   */
  async function deleteProject(id: number | string): Promise<void> {
    await apiFetch<null>(`/projects/${id}`, { method: 'DELETE' })
  }

  return { listProjects, createProject, updateProject, deleteProject }
}
