/**
 * Avatar template shapes (C14).
 *
 * Hand-written rather than pulled from `types/api.ts`, and that is a temporary
 * state worth naming: the generated client is produced from the API's published
 * OpenAPI spec, and these endpoints postdate the last generation. Regenerating
 * it is the correct fix, and these types should be deleted the moment it
 * happens — two definitions of one contract is exactly the drift this project
 * avoids everywhere else.
 */

export type ProviderName = 'heygen' | 'tavus'

export type FieldType = 'text' | 'number' | 'select' | 'checkbox'

/**
 * One configurable knob, as the API describes it.
 *
 * The form is BUILT from these rather than hand-written, so a knob added
 * server-side appears here without a frontend change — and, more importantly,
 * a knob the server does not know about cannot appear at all.
 */
export interface FieldSpec {
  key: string
  type: FieldType
  label_key: string
  required?: boolean
  options?: string[]
  min?: number
  max?: number
  step?: number
}

export type FieldSpecsResponse = {
  data: Record<ProviderName, FieldSpec[]>
}

export interface AvatarTemplate {
  id: number
  name: string
  description: string | null
  provider: ProviderName
  config: Record<string, unknown>
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

/**
 * A single template response.
 *
 * `warning` carries a STABLE CODE when the persona sync did not reach the
 * provider — never the provider's own words. The save itself succeeded; the
 * operator needs to know a knob has not taken effect yet, and telling them in
 * the vendor's language would name the vendor.
 */
export interface TemplateResponse {
  data: AvatarTemplate
  warning?: string
}

export interface TemplateListResponse {
  data: AvatarTemplate[]
}
