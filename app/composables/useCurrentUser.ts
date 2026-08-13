/**
 * useCurrentUser — identity and roles of the signed-in operator.
 *
 * Wraps the existing `GET /auth/me`. Added because the backoffice had no idea
 * WHO was using it: every screen rendered the same controls for an admin, an
 * operator and a viewer, and the difference surfaced only as a 403 after the
 * click.
 *
 * Client-side role checks are for AFFORDANCE ONLY. The server enforces; this
 * decides what is worth showing. A control that appears and then fails teaches
 * the operator that the product is broken rather than that they lack the right.
 */
import { useApi } from './useApi'

export interface CurrentUser {
  user: { id: number; name: string; email: string }
  organization: { id: number; name: string } | null
  roles: string[]
}

export function useCurrentUser() {
  const { apiFetch } = useApi()

  async function fetchMe(): Promise<CurrentUser> {
    return apiFetch<CurrentUser>('/auth/me')
  }

  return { fetchMe }
}
