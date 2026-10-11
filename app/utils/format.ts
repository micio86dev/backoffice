/**
 * i18n-aware date/number formatting (admin-backoffice spec, "i18n and
 * Locale-Aware Formatting" requirement). `Intl.DateTimeFormat` /
 * `Intl.NumberFormat` only — never manual string concatenation.
 *
 * Timezone convention (design.md D9): the API emits UTC ISO 8601
 * (`api/config/app.php` hardcodes UTC); display uses the VIEWER'S
 * browser-local timezone via `Intl`'s implicit conversion — there is no
 * user or organization timezone concept anywhere in this app. Only
 * `expires_at` in the API-keys table renders a visible zone indicator
 * (via `FormattedDate`'s `show-zone` prop); every other timestamp renders
 * unsuffixed, because a deadline is the one date where "which zone?"
 * changes what the reader does.
 */
export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '–'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso)
  )
}

export function formatPercent(ratio: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

/**
 * Interview/session elapsed time, translated (design.md D7 — extracted from
 * SessionList.vue and SessionReviewPanel.vue, which duplicated this same
 * minutes/seconds split; a third copy in the interview summary card would
 * repeat the exact drift this extraction exists to prevent). `null` means no
 * session has finished yet — renders `–`, never `0` (D4: a zero would claim
 * the candidate spent no time on an interview that is still in progress).
 */
export function formatDuration(
  seconds: number | null,
  t: (key: string, params?: Record<string, unknown>) => string
): string {
  if (seconds === null) return '–'
  return t('review.durationValue', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })
}

/** The slice of a catalogue currency `formatMoney` needs. */
export interface MoneyCurrency {
  code: string
  decimals: number
  rate_per_usd: number | null
}

/**
 * A cost amount in the organization's display currency; `usd` is always the
 * stored figure. One formatter, so every cost line renders the same shape and
 * the symbol, its placement and spacing belong to `Intl`, never to copy keys.
 *
 * No usable currency (null, a missing/non-positive rate, a code that is not
 * three capital letters, or decimals outside the integers 0..20) falls back to
 * USD: never a guess, never zero, never a thrown `RangeError`. A non-finite
 * amount renders `–`, like every other absent amount in the app, never `NaN`. The conversion is `usd * rate_per_usd`, applied
 * once, and the result rounds to the currency's `decimals`.
 *
 * Precision widens BELOW one minor unit and only there. One interview's
 * conversation-LLM spend is routinely a fraction of a cent, and rounding it to
 * the currency's decimals would show a real charge as zero, which reads as
 * free. Zero is a price; "we did not run this model" is not, and that case
 * arrives as `null` from the API and is rendered as absent by the caller.
 * Below one minor unit it uses SIGNIFICANT digits, not a wider fixed count: a
 * fixed count only moves the boundary at which a real charge reads as zero.
 */
export function formatMoney(
  usd: number,
  currency: MoneyCurrency | null | undefined,
  locale: string
): string {
  if (!Number.isFinite(usd)) return '–'

  const usable =
    currency &&
    currency.rate_per_usd &&
    currency.rate_per_usd > 0 &&
    /^[A-Z]{3}$/.test(currency.code) &&
    Number.isInteger(currency.decimals) &&
    currency.decimals >= 0 &&
    currency.decimals <= 20
  const code = usable ? currency.code : 'USD'
  const decimals = usable ? currency.decimals : 2
  const amount = usable ? usd * currency.rate_per_usd! : usd

  if (amount !== 0 && Math.abs(amount) < 10 ** -decimals) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumSignificantDigits: 2,
    }).format(amount)
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

/**
 * Competency mean (DESIGN.md §8.3): always at least 1 decimal (so a
 * whole-number mean like `4` renders `4.0`, never truncated-looking `4`),
 * rounded to at most 2 decimals otherwise (e.g. `11/3` -> `3.67`, matching
 * the COL reference fixture). `null` means every indicator was unassessable
 * — renders `–`, never `0` (BARS binding rule).
 */
export function formatCompetencyMean(mean: number | null, locale: string): string {
  if (mean === null) return '–'
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(mean)
}
