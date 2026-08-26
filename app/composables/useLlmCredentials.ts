/**
 * useLlmCredentials — typed reads and writes over the C14 `llm_credentials`
 * endpoints (pluggable-conversation-llm PR P7).
 *
 * Thin wiring over `useApi().apiFetch`, mirroring `useAvatarTemplates.ts`. No
 * state and no caching: this vault is admin-only and rarely read outside the
 * settings panel, so there is nothing worth caching and a stale credential
 * list (e.g. showing a just-deleted row as still present) is worse than a
 * second request.
 *
 * There is deliberately no `verifyCredential()` call — design D9 refuses a
 * "test this key without saving it" endpoint outright (the oracle risk it
 * names). Validation is INLINE on `createCredential`/`rotateCredential`: a
 * `200` from Google persists `validated_at`; `429`/`5xx` still persist with
 * `validation_error` set (D9's asymmetric store rule); a `401`/`403` throws a
 * 422 and writes nothing. The panel reads that outcome off the returned
 * resource — it never polls or re-checks separately.
 */
import type {
  CreateLlmCredentialPayload,
  LlmCredentialListResponse,
  LlmCredentialResponse,
  RotateLlmCredentialPayload,
} from '../types/llm'
import { useApi } from './useApi'

export function useLlmCredentials() {
  const { apiFetch } = useApi()

  async function listCredentials(): Promise<LlmCredentialListResponse> {
    return apiFetch<LlmCredentialListResponse>('/llm-credentials')
  }

  async function createCredential(
    payload: CreateLlmCredentialPayload
  ): Promise<LlmCredentialResponse> {
    return apiFetch<LlmCredentialResponse>('/llm-credentials', { method: 'POST', body: payload })
  }

  /**
   * Rotation and rename share this one verb — there is no separate
   * `/rotate` route. The caller decides which field(s) to send.
   */
  async function rotateCredential(
    id: number | string,
    payload: RotateLlmCredentialPayload
  ): Promise<LlmCredentialResponse> {
    return apiFetch<LlmCredentialResponse>(`/llm-credentials/${id}`, {
      method: 'PATCH',
      body: payload,
    })
  }

  async function deleteCredential(id: number | string): Promise<void> {
    // <null>, not <void>: the endpoint answers 200 with a null body on
    // success, and a bound credential answers 409 `credential_in_use`
    // instead — the caller (LlmCredentialsPanel) resolves that rejection.
    await apiFetch<null>(`/llm-credentials/${id}`, { method: 'DELETE' })
  }

  return { listCredentials, createCredential, rotateCredential, deleteCredential }
}
