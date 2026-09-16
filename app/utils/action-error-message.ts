/**
 * A container-level banner message for a failed WRITE (not a load), built
 * from the shared D4 state mapper (`error-state.ts`).
 *
 * Extracted from `ProjectQuestionsPanel.vue`'s own `onReorder`/`onRemove`
 * catch blocks (framework-catalogue-authoring, gga review finding on PR10):
 * a bare `catch { message.value = { kind: 'error', text: t(fixedKey) } }`
 * shows the SAME copy for a 403, a 404, a 409 and a dead network — collapsing
 * four distinct outcomes into one, which is exactly what `error-state.ts`'s
 * own docblock says this repo keeps re-learning not to do. `CatalogueDefault
 * QuestionsPanel.vue` needs the identical shape for its own remove/reorder
 * failures, so this is the ONE place it is written.
 */
import { resolveResourceErrorState, resourceErrorKey } from './error-state'
import type { FormMessageKind } from '@/components/molecules/FormMessage.vue'

/**
 * `state === 'error'` (no distinguishable HTTP status) keeps the caller's OWN
 * fallback copy — "could not remove the question" says more than a generic
 * "something went wrong". A 403, 404 or 409 renders as ITSELF instead: a
 * permission refusal is not "could not remove", and a 409 is `waiting`
 * (temporal, self-resolving), never `error` at all.
 */
export function actionErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallbackKey: string
): { kind: FormMessageKind; text: string } {
  const state = resolveResourceErrorState(error)

  if (state === 'error') return { kind: 'error', text: t(fallbackKey) }

  return {
    kind: state === 'not-ready' ? 'waiting' : 'error',
    text: t(resourceErrorKey(state, 'message')),
  }
}
