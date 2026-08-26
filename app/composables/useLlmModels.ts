/**
 * useLlmModels — typed reads over the global `GET /llm-models` price list
 * (pluggable-conversation-llm PR P8, design D9: "a public price list,
 * readable by all three roles").
 *
 * Thin wiring over `useApi().apiFetch`, mirroring `useLlmCredentials.ts`. No
 * state and no caching — the catalogue is small and rarely read outside the
 * template form, so there is nothing worth caching.
 */
import type { LlmModelListResponse } from '../types/llm'
import { useApi } from './useApi'

export function useLlmModels() {
  const { apiFetch } = useApi()

  async function listModels(): Promise<LlmModelListResponse> {
    return apiFetch<LlmModelListResponse>('/llm-models')
  }

  return { listModels }
}
