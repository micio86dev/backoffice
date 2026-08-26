/**
 * LLM credential shapes (pluggable-conversation-llm PR P7).
 *
 * DERIVED from the generated client (`LlmCredentialResource`) and narrowed —
 * with a reason — for the one field the generator cannot type precisely,
 * following the exact `Omit` + re-add pattern documented at
 * `app/types/avatar-template.ts:1-35`. Every OTHER field still tracks the API
 * automatically: add one server-side and it appears here without an edit;
 * remove one and this file stops compiling.
 *
 * `validation_error` is inferred by Scramble as plain `string | null`,
 * because the value comes from a PHP union return type
 * (`GeminiKeyValidator::validate()`), not an OpenAPI enum. Narrowing it here
 * lets the panel exhaustively distinguish a credential that is STORED but
 * unverified (`rate_limited` / `unreachable`, `validated_at` null) from one
 * that is verified (`validated_at` non-null) — see design.md D9's table.
 * `invalid_key` never appears on a STORED `LlmCredential` — the API refuses
 * to persist it (D9's asymmetric store rule) — but is kept in the union
 * because it is exactly the code a create/rotate 422 carries on `api_key`.
 *
 * The API NEVER returns `api_key` — it is `$hidden` on the model
 * (`LlmCredential.php`) and absent from `LlmCredentialResource::toArray()` —
 * so there is nothing here to mask on the client. `key_last_four` IS the
 * masking; no type in this file carries a raw key value.
 */
import type { components, paths } from '../../types/api'

export type LlmCredentialVendor = 'google'

/**
 * A stable code, never Google's prose (design D9) — it travels to the UI and
 * to i18n.
 */
export type LlmCredentialValidationError = 'invalid_key' | 'rate_limited' | 'unreachable'

type GeneratedLlmCredential = components['schemas']['LlmCredentialResource']

export type LlmCredential = Omit<GeneratedLlmCredential, 'validation_error'> & {
  validation_error: LlmCredentialValidationError | null
}

export interface LlmCredentialResponse {
  data: LlmCredential
}

export type LlmCredentialListResponse = Omit<
  paths['/llm-credentials']['get']['responses']['200']['content']['application/json'],
  'data'
> & { data: LlmCredential[] }

/** `POST /llm-credentials`. `vendor` is presently a one-member enum server-side. */
export interface CreateLlmCredentialPayload {
  name: string
  vendor: LlmCredentialVendor
  api_key: string
}

/**
 * `PATCH /llm-credentials/{id}` — both fields are `sometimes` server-side,
 * but the panel sends exactly one of them per request: `api_key` alone to
 * rotate, or `name` alone to rename. Rotation is re-validated synchronously
 * against the same asymmetric store rule as create (D9) — an invalid key
 * leaves the row byte-unchanged.
 */
export interface RotateLlmCredentialPayload {
  name?: string
  api_key?: string
}

/**
 * `DELETE /llm-credentials/{id}` on a bound credential — the FK is
 * `restrictOnDelete` (design D2), so this is a 409, never a 422. `templates`
 * carries the bound template NAMES, never ids: an id is unreadable in a
 * refusal banner six months later.
 */
export interface CredentialInUseError {
  error: 'credential_in_use'
  message: string
  templates: string[]
}

/**
 * LLM model catalogue shapes (pluggable-conversation-llm PR P8).
 *
 * `capability`/`mode` are inferred by Scramble as plain `string`, because
 * they come from a PHP enum's `->value` (`LlmCapability`/`LlmMode`), not an
 * OpenAPI enum. Narrowed here with the same `Omit` + re-add pattern as
 * `LlmCredential.validation_error` above.
 *
 * There is deliberately NO numeric `id` field on this type: `LlmModelResource`
 * (`api/app/Http/Resources/LlmModelResource.php`) does not serialize one —
 * `key` (the vendor's own model id, design D1's natural key) is the only
 * identifier this endpoint exposes. `LlmModelPicker` is built around `key` for
 * exactly this reason; see the PR P8 apply-progress "Deviations" section for
 * the read-surface gap this leaves in `AvatarTemplateForm`'s binding wiring.
 */
export type LlmModelCapability = 'text' | 'native_duplex'

/** Derived server-side from `capability` (design D1: "there is no `mode` column"). */
export type LlmModelMode = 'managed' | 'native_duplex'

type GeneratedLlmModel = components['schemas']['LlmModelResource']

export type LlmModel = Omit<GeneratedLlmModel, 'capability' | 'mode'> & {
  capability: LlmModelCapability
  mode: LlmModelMode
}

export interface LlmModelListResponse {
  data: LlmModel[]
}
