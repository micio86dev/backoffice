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
  TemplateOptionsResponse,
  TemplateResponse,
} from '../types/avatar-template'
import { useApi } from './useApi'

export function useAvatarTemplates() {
  const { apiFetch } = useApi()

  async function listTemplates(): Promise<TemplateListResponse> {
    return apiFetch<TemplateListResponse>('/avatar-templates')
  }

  /**
   * The PICKER list — id, name, provider — readable by every role.
   *
   * `listTemplates` above returns the full record and is admin-only, because
   * that record carries `config` and `config` holds provider-side identifiers
   * closer to credentials than to settings. A project form needs none of that:
   * `projects.avatar_template_id` is NOT NULL, so every operator creating a
   * project must choose a template, and choosing needs a name.
   *
   * Using the admin list here left an operator with an empty select on a form
   * that then refused its own submit, with nothing they could do about it.
   */
  async function listTemplateOptions(): Promise<TemplateOptionsResponse> {
    return apiFetch<TemplateOptionsResponse>('/avatar-templates/options')
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
    /**
     * Both-or-neither (design D4, invariant I1 — a DB CHECK, not just a
     * frontend convention). `null` is a meaningful value here, not "absent":
     * `AvatarTemplateForm` sends it explicitly to unbind, so this composable
     * must forward it as-is rather than treat it as an omittable field.
     */
    llm_model_id?: number | null
    llm_credential_id?: number | null
  }): Promise<TemplateResponse> {
    return apiFetch<TemplateResponse>('/avatar-templates', { method: 'POST', body: payload })
  }

  async function updateTemplate(
    id: number | string,
    payload: {
      name?: string
      description?: string | null
      config?: Record<string, unknown>
      llm_model_id?: number | null
      llm_credential_id?: number | null
    }
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

  /**
   * Take a template out of service without deleting it.
   *
   * Safe in a way it would not have been before every project pinned its own
   * template: `is_active` used to be the organization-wide fallback, so
   * switching it off changed what unpinned projects ran on. It now only decides
   * which template is offered as the default for NEW projects, and the projects
   * already pinning this one keep running on it.
   */
  async function deactivateTemplate(id: number | string): Promise<TemplateResponse> {
    return apiFetch<TemplateResponse>(`/avatar-templates/${id}/deactivate`, { method: 'POST' })
  }

  async function deleteTemplate(id: number | string): Promise<void> {
    // <null>, not <void>: the endpoint answers 204 with no body, and `void` is
    // not a valid type argument — it describes a return position, not a value.
    await apiFetch<null>(`/avatar-templates/${id}`, { method: 'DELETE' })
  }

  /**
   * Admin-only. Export is a read of configuration an operator can already see
   * field by field, but as one file it is also the fastest way to lift
   * configuration out of a tenant.
   */
  async function exportTemplates(): Promise<Record<string, unknown>> {
    return apiFetch<Record<string, unknown>>('/avatar-templates/export')
  }

  async function importTemplates(
    document: Record<string, unknown>
  ): Promise<{ data: Array<{ id: number; name: string; provider: string }> }> {
    return apiFetch('/avatar-templates/import', { method: 'POST', body: document })
  }

  return {
    exportTemplates,
    importTemplates,
    listTemplates,
    listTemplateOptions,
    fetchFieldSpecs,
    createTemplate,
    updateTemplate,
    activateTemplate,
    deactivateTemplate,
    deleteTemplate,
  }
}
