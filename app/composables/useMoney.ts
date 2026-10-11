/**
 * useMoney — the one entry point every cost surface uses (organization-
 * currencies OC-06). Combines the acting organization's currency with the
 * active catalogue and returns formatters for the current UI locale.
 *
 * Conversion is DISPLAY ONLY: the API keeps every `*_usd` field, the amount is
 * `usd * rate_per_usd` applied once inside `formatMoney`, and nothing converted
 * is ever sent back. Anything short of a usable currency renders plain USD
 * (never a guess, never zero): no acting organization, a USD organization, a
 * currency missing from the ACTIVE catalogue, a rate-less one, or a catalogue
 * that failed to load.
 *
 * A converted amount is approximate and must be reconcilable against a USD
 * invoice, so it carries `≈` and `moneyNote` gives the visible note (original
 * USD amount, the rate, its date). USD gets neither.
 */
import { computed } from 'vue'
import { formatMoney, type MoneyCurrency } from '../utils/format'
import { useCurrencies } from './useCurrencies'
import { useOrganization } from './useOrganization'

interface DisplayCurrency extends MoneyCurrency {
  rate_per_usd: number
  rate_as_of: string
}

/**
 * A calendar date, not an instant: read it as UTC so no zone shifts the day.
 * A malformed value from the API must not throw during render, so it is shown
 * as received.
 */
function rateDate(asOf: string, locale: string): string {
  const date = new Date(`${asOf.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return asOf

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

export function useMoney() {
  const { t, locale } = useI18n()
  const { currencies, ensureLoaded } = useCurrencies()
  const { currencyCode } = useOrganization()

  // A failed catalogue read is not an error state of its own: the amounts just
  // stay in USD, which is the honest fallback.
  void ensureLoaded().catch(() => undefined)

  const display = computed<DisplayCurrency | null>(() => {
    const code = currencyCode.value
    if (!code || code === 'USD') return null

    const row = currencies.value?.find((c) => c.code === code && c.is_active)
    const rate = Number(row?.rate_per_usd)
    if (!row || !row.rate_as_of || !(rate > 0)) return null

    return { code, decimals: row.decimals, rate_per_usd: rate, rate_as_of: row.rate_as_of }
  })

  function plain(usd: number): string {
    return formatMoney(usd, display.value, locale.value)
  }

  /** The amount in the display currency, `≈`-prefixed when converted. */
  function money(usd: number): string {
    return display.value ? t('money.approximate', { amount: plain(usd) }) : plain(usd)
  }

  /**
   * Spoken form for an `aria-label`, or `null` when nothing was converted:
   * `≈` is not reliably announced, so the words carry the approximation.
   */
  function moneyLabel(usd: number): string | null {
    return display.value ? t('money.approximateLabel', { amount: plain(usd) }) : null
  }

  /** The reconciliation note, or `null` when nothing was converted. */
  function moneyNote(usd: number): string | null {
    const shown = display.value
    if (!shown) return null

    return t('money.convertedNote', {
      usd: formatMoney(usd, null, locale.value),
      rate: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }).format(
        shown.rate_per_usd
      ),
      code: shown.code,
      date: rateDate(shown.rate_as_of, locale.value),
    })
  }

  return { money, moneyLabel, moneyNote }
}
