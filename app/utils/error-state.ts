/**
 * Shared HTTP-rejection → user-facing state mapping (D4).
 *
 * Every remote read in the backoffice resolves its failure through this
 * helper so the four states stay DISTINCT everywhere:
 *   - 409 → `not-ready`  (temporal, self-resolving — NOT an error)
 *   - 403 → `forbidden`  (permission, permanent)
 *   - 404 → `not-found`  (does not exist)
 *   - anything else → `error`
 *
 * Collapsing them (or, worse, letting a rejection fall through into an EMPTY
 * state that looks like success) discards the only reason the status was
 * chosen in the first place. Extracted from `pages/participants/[id].vue`,
 * which was the single page that had this right, so the dashboard and the
 * participant list can reuse it instead of re-implementing it.
 */
import { getErrorStatus } from './http-error'

export type ResourceErrorState = 'not-ready' | 'forbidden' | 'not-found' | 'error'

/** `loading` and `ready` are success-path states; the rest are failures. */
export type ResourceState = 'loading' | 'ready' | ResourceErrorState

export function resolveResourceErrorState(error: unknown): ResourceErrorState {
  switch (getErrorStatus(error)) {
    case 409:
      return 'not-ready'
    case 403:
      return 'forbidden'
    case 404:
      return 'not-found'
    default:
      return 'error'
  }
}

/**
 * i18n key segment per state. Kept separate from the state union so the
 * kebab-case state values stay readable in `data-state` attributes while the
 * locale files keep their camelCase key convention.
 */
const KEY_SEGMENT: Record<ResourceErrorState, string> = {
  'not-ready': 'notReady',
  forbidden: 'forbidden',
  'not-found': 'notFound',
  error: 'error',
}

/**
 * Builds the i18n key for a failure state.
 *
 * `namespace` defaults to the generic `errors.states` block; the participant
 * detail page passes `report.states` so the evaluation report keeps its
 * report-specific wording.
 */
export function resourceErrorKey(
  state: ResourceErrorState,
  part: 'title' | 'message',
  namespace = 'errors.states'
): string {
  return `${namespace}.${KEY_SEGMENT[state]}.${part}`
}
