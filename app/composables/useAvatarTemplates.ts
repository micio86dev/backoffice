/**
 * useAvatarTemplates — typed reads and writes over the C14 template endpoints.
 *
 * Thin wiring over `useApi().apiFetch`, matching useParticipants. No state and
 * no caching: which template is active changes what every candidate of the
 * organization sees next, so a stale list here is worse than a second request.
 */
import type {
  AvatarTemplate,
  FieldSpecsResponse,
  TemplateListResponse,
  TemplateResponse,
} from '../types/avatar-template'
import { useApi } from './useApi'

export function useAvatarTemplates() {
  const { apiFetch } = useApi()

  async function listTemplates(): Promise<TemplateListResponse> {
    return apiFetch<TemplateListResponse>('/avatar-templates')
  }

  async function fetchFieldSpecs(): Promise<FieldSpecsResponse> {
    // Fetched, never duplicated here. The form, the API's validation and the
    // payload sent to the provider all come from one server-side definition —
    // a second copy in this app would drift, and the drift is invisible: a form
    // offering a knob the payload never sends looks exactly like a knob that
    // does not work.
    return apiFetch<FieldSpecsResponse>('/avatar-templates/field-specs')
  }

  async function createTemplate(payload: {
    name: string
    description?: string | null
    provider: AvatarTemplate['provider']
    config: Record<string, unknown>
  }): Promise<TemplateResponse> {
    return apiFetch<TemplateResponse>('/avatar-templates', { method: 'POST', body: payload })
  }

  async function updateTemplate(
    id: number | string,
    payload: { name?: string; description?: string | null; config?: Record<string, unknown> }
  ): Promise<TemplateResponse> {
    // `provider` is deliberately absent from the accepted payload. The API
    // refuses to change it — every knob would then belong to the other
    // provider — and offering the field here would be an edit that always
    // fails.
    return apiFetch<TemplateResponse>(`/avatar-templates/${id}`, { method: 'PATCH', body: payload })
  }

  async function activateTemplate(id: number | string): Promise<TemplateResponse> {
    return apiFetch<TemplateResponse>(`/avatar-templates/${id}/activate`, { method: 'POST' })
  }

  async function deleteTemplate(id: number | string): Promise<void> {
    // <null>, not <void>: the endpoint answers 204 with no body, and `void` is
    // not a valid type argument — it describes a return position, not a value.
    await apiFetch<null>(`/avatar-templates/${id}`, { method: 'DELETE' })
  }

  return {
    listTemplates,
    fetchFieldSpecs,
    createTemplate,
    updateTemplate,
    activateTemplate,
    deleteTemplate,
  }
}
