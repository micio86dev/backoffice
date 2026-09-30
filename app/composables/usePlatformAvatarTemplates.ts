/**
 * usePlatformAvatarTemplates — typed reads and writes over the superadmin-only
 * `/admin/avatar-templates*` routes (global-avatar-templates, slice B2).
 *
 * Kept apart from `useAvatarTemplates` on purpose: a platform template has NO
 * organization, so none of the organization concerns apply, and the two
 * surfaces answer different 409s. No state and no caching, for the reason that
 * file gives: a stale list here is a stale picture of what every organization
 * is being offered.
 */
import type {
  PlatformTemplateCreatePayload,
  PlatformTemplateListResponse,
  PlatformTemplateResponse,
  PlatformTemplateUpdatePayload,
} from '../types/avatar-template'
import { useApi } from './useApi'

const BASE = '/admin/avatar-templates'

/** 409 `template_in_use`: pinned in `organizationCount` organizations, `projectCount` projects. */
export class PlatformTemplateInUseError extends Error {
  readonly organizationCount: number
  readonly projectCount: number

  constructor(organizationCount: number, projectCount: number, cause: unknown) {
    super('template_in_use', { cause })
    this.name = 'PlatformTemplateInUseError'
    this.organizationCount = organizationCount
    this.projectCount = projectCount
  }
}

/** 409 `template_active`: still offered to every organization; retire it first. */
export class PlatformTemplateActiveError extends Error {
  constructor(cause: unknown) {
    super('template_active', { cause })
    this.name = 'PlatformTemplateActiveError'
  }
}

function conflictBody(error: unknown): Record<string, unknown> | null {
  const e = error as { status?: unknown; statusCode?: unknown; data?: unknown } | null
  if ((e?.status ?? e?.statusCode) !== 409) return null

  return typeof e?.data === 'object' && e.data !== null ? (e.data as Record<string, unknown>) : null
}

const count = (value: unknown): number => (typeof value === 'number' ? value : 0)

export function usePlatformAvatarTemplates() {
  const { apiFetch } = useApi()

  const list = (): Promise<PlatformTemplateListResponse> =>
    apiFetch<PlatformTemplateListResponse>(BASE)

  const get = (id: number | string): Promise<PlatformTemplateResponse> =>
    apiFetch<PlatformTemplateResponse>(`${BASE}/${id}`)

  const create = (payload: PlatformTemplateCreatePayload): Promise<PlatformTemplateResponse> =>
    apiFetch<PlatformTemplateResponse>(BASE, { method: 'POST', body: payload })

  // `provider` is absent from the update body for the same reason as the
  // organization composable: the api refuses to change it.
  const update = (
    id: number | string,
    payload: PlatformTemplateUpdatePayload
  ): Promise<PlatformTemplateResponse> =>
    apiFetch<PlatformTemplateResponse>(`${BASE}/${id}`, { method: 'PATCH', body: payload })

  /** Offer to every organization for NEW pins. */
  const activate = (id: number | string): Promise<PlatformTemplateResponse> =>
    apiFetch<PlatformTemplateResponse>(`${BASE}/${id}/activate`, { method: 'POST' })

  /** Retire: no longer offered for new pins; existing pins keep working. */
  const deactivate = (id: number | string): Promise<PlatformTemplateResponse> =>
    apiFetch<PlatformTemplateResponse>(`${BASE}/${id}/deactivate`, { method: 'POST' })

  async function remove(id: number | string): Promise<void> {
    try {
      await apiFetch<null>(`${BASE}/${id}`, { method: 'DELETE' })
    } catch (error) {
      const body = conflictBody(error)

      if (body?.error === 'template_in_use') {
        throw new PlatformTemplateInUseError(
          count(body.organization_count),
          count(body.project_count),
          error
        )
      }
      if (body?.error === 'template_active') throw new PlatformTemplateActiveError(error)

      throw error
    }
  }

  return { list, get, create, update, activate, deactivate, remove }
}
