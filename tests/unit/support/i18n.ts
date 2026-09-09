/**
 * A `useI18n` stub whose `te()` tells the truth.
 *
 * `tests/unit/setup.ts` stubs `te: () => true` globally, which is convenient
 * and makes every "did we translate this?" assertion structurally incapable
 * of failing: `translateServerCode` returns the KEY on a hit and the RAW VALUE
 * on a miss, so a blanket-true `te` reports success for a key that does not
 * exist. That is how `users.serverError.role_invalid` shipped missing while a
 * test asserting the translation stayed green.
 *
 * It requires the key in BOTH locales, not just English. i18n it/en is
 * mandatory, and a helper that only consults en.json would let an Italian gap
 * ship under exactly the green test it exists to prevent — the same failure
 * one language further along.
 */
import en from '../../../i18n/locales/en.json'
import it from '../../../i18n/locales/it.json'

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined

    return (node as Record<string, unknown>)[segment]
  }, bundle)
}

function has(key: string): boolean {
  return lookup(en, key) !== undefined && lookup(it, key) !== undefined
}

/**
 * `t` stays the identity on the KEY — assertions read better against a key
 * than against copy a translator may reword tomorrow. `te` is the half that
 * has to be real.
 */
export function realI18n() {
  return { t: (key: string) => key, te: has, locale: { value: 'it' } }
}
