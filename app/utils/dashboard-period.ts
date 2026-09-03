/**
 * The dashboard's period selection, as dates the API accepts.
 *
 * Pure functions rather than logic in the component: this is calendar
 * arithmetic, which is where off-by-ones live, and it should be verifiable by
 * running it instead of by reading a template.
 */

export type Period =
  { kind: 'all' } | { kind: 'year'; year: number } | { kind: 'month'; year: number; month: number }

export interface DateRange {
  from?: string
  to?: string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * The LAST day of a month, computed rather than tabulated.
 *
 * `new Date(year, month, 0)` is day zero of the following month, which is the
 * last day of this one — and it gets February right in a leap year, which a
 * hardcoded table gets wrong every four years.
 */
function lastDayOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * INCLUSIVE of the last day, deliberately.
 *
 * The API extends `to` to the end of that day, so a month ends on its own last
 * date — never on the 1st of the next. An exclusive bound would quietly
 * include a day belonging to the following month, and the totals would drift
 * by one day every time.
 */
export function periodToRange(period: Period): DateRange {
  if (period.kind === 'all') {
    // Empty, not a very wide range: empty means the API applies no filter,
    // while any bound we invented would still exclude everything older.
    return {}
  }

  if (period.kind === 'year') {
    return { from: `${period.year}-01-01`, to: `${period.year}-12-31` }
  }

  const month = pad(period.month)

  return {
    from: `${period.year}-${month}-01`,
    to: `${period.year}-${month}-${pad(lastDayOf(period.year, period.month))}`,
  }
}

/**
 * Selectable years, most recent first.
 *
 * An operator asking about a period almost always means a recent one, and
 * making them scroll past 2019 to reach this month is friction for the common
 * case.
 */
export function yearsBack(currentYear: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => currentYear - i)
}
