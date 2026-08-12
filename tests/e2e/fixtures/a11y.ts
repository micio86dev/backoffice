import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Runs @axe-core accessibility checks on the current page at WCAG 2.1 AA level.
 * Call this after each navigation in E2E specs to enforce the D29 mandate.
 *
 * @throws {Error} if any WCAG 2.1 AA violations are found
 */
export async function checkA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
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
