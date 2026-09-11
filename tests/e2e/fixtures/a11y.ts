import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Runs @axe-core accessibility checks on the current page at WCAG 2.1 AA level.
 * Call this after each navigation in E2E specs to enforce the D29 mandate.
 *
 * @throws {Error} if any WCAG 2.1 AA violations are found
 */
export async function checkA11y(page: Page): Promise<void> {
  // Let every in-flight animation settle FIRST. Axe measures the pixels that
  // are on screen at the instant it runs, and `toBeVisible()` resolves as soon
  // as an element is in the layout — an enter transition may still be playing.
  //
  // Mid-fade, a dialog title composites to #dcdfe3 over #f6f8fa: contrast 1.25,
  // reported as a serious colour-contrast violation against a dialog that is
  // perfectly legible a frame later. The crop dialog failed exactly this way on
  // WebKit, whose transition timing differs from Chromium's, while passing
  // there — which is what made it read as a browser-specific design bug rather
  // than a measurement taken too early. WCAG governs the settled interface, not
  // the frames on the way to it.
  // Infinite animations are FILTERED OUT rather than waited on. `animate-pulse`
  // (Skeleton) and `animate-spin` (Button's pending state) never reach
  // `finished`, so asking whether EVERY animation is done is permanently false
  // on any page with a skeleton mounted — the wait would burn its timeout and
  // axe would scan the same unsettled frame as before, with nothing going red to
  // say so. The question is not "is everything finished" but "is anything still
  // converging".
  //
  // The timeout is therefore NOT swallowed: with the loopers excluded, reaching
  // it means a finite animation genuinely hung, and that is worth failing on.
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .every((a) => a.playState === 'finished'),
    null,
    { timeout: 5_000 }
  )

  const results = await new AxeBuilder({ page })
    // `wcag21a` included. Without it every rule axe tags as WCAG 2.1 Level A was
    // skipped — `label-content-name-mismatch` (SC 2.5.3, Label in Name) among
    // them — while the docblock above and the error thrown below both announced
    // "WCAG 2.1 AA". AA conformance INCLUDES all Level A criteria, so the gate
    // was lying in its own failure message.
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  if (results.violations.length > 0) {
    // `failureSummary` and `target` are included deliberately. Without them the
    // report names the rule and dumps the element's full class attribute, which
    // for a Tailwind component is hundreds of characters of noise and still does
    // not say what axe measured. For color-contrast in particular the summary
    // carries the actual ratio and the two colours — the only part anyone can
    // act on. A failing a11y check that does not tell you the number makes the
    // fix guesswork.
    const report = results.violations
      .map((v) => {
        const nodes = v.nodes
          .map((n) => `    at ${n.target.join(' ')}\n      ${n.failureSummary ?? n.html}`)
          .join('\n')

        return `[${v.impact}] ${v.id}: ${v.description}\n${nodes}`
      })
      .join('\n\n')
    throw new Error(`WCAG 2.1 AA violations found:\n\n${report}`)
  }
}
