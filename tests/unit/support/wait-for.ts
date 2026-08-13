import { flushPromises } from '@vue/test-utils'

/**
 * Waits until `predicate` returns something truthy, then returns it.
 *
 * Replaces the fixed-budget "flush N times, sleep N ms" helpers that this
 * suite grew independently in eight spec files. Those were flaky by
 * construction: a code-split organism (`defineAsyncComponent`, D10) resolves
 * its dynamic import in real wall-clock time, and under a full parallel
 * `vitest run` — where every worker competes for the same cores and
 * `vi.resetModules()` makes each test pay the module-graph cost again — that
 * import routinely takes longer than the ~200 ms those loops budgeted. The
 * assertion then ran against a DOM the component had not reached yet, and the
 * failure surfaced as `expected undefined to be '<something>'`, i.e. a
 * `querySelector` that found nothing.
 *
 * Polling a condition instead of a duration makes the wait finish as soon as
 * the DOM is ready (so the fast path stays fast) while tolerating a slow one,
 * and turns a timeout into an explicit, named error rather than a confusing
 * assertion mismatch.
 *
 * @param predicate Re-evaluated after every flush; any truthy value ends the wait.
 * @param message   Named in the timeout error, e.g. 'the project form to mount'.
 */
export async function waitFor<T>(
  predicate: () => T | null | undefined | false,
  message: string,
  { timeoutMs = 5000, intervalMs = 10 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    await flushPromises()

    const result = predicate()
    if (result) return result

    if (Date.now() >= deadline) {
      throw new Error(`waitFor: timed out after ${timeoutMs}ms waiting for ${message}`)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * Waits for a teleported element (Dialog content lands on `document.body`,
 * outside the wrapper) to exist, and returns it.
 */
export async function waitForTestId<T extends HTMLElement = HTMLElement>(
  testId: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<T> {
  return waitFor(
    () => document.body.querySelector<T>(`[data-testid="${testId}"]`),
    `[data-testid="${testId}"] to appear`,
    options
  )
}
