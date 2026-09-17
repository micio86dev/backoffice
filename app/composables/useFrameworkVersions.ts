/**
 * useFrameworkVersions — typed read over the C4 framework-version listing endpoint.
 *
 * Thin wiring over `useApi().apiFetch`, matching `useAvatarTemplates`. The
 * endpoint already lists only the acting organization's own versions
 * (`FrameworkVersion` is org-scoped) — this composable adds no filtering of
 * its own.
 */
import type { FrameworkVersionListResponse } from '../types/framework-version'
import { useApi } from './useApi'

export function useFrameworkVersions() {
  const { apiFetch } = useApi()

  async function listVersions(): Promise<FrameworkVersionListResponse> {
    return apiFetch<FrameworkVersionListResponse>('/framework/versions')
  }

  return { listVersions }
}
