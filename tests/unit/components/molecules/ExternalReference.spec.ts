/**
 * ExternalReference.vue (candidate-external-reference, design AD-8)
 *
 * Presentational molecule: renders the calling system's own reference for a
 * candidate — `source` and/or `external_id` — in two shapes. `compact` is the
 * muted sub-line in the participants list, `labelled` is the detail-page
 * header line. It renders NOTHING when neither value is present, so rows and
 * older payloads without the keys stay valid and no empty container or lone
 * separator can appear.
 *
 * `external_id` is an identifier, not a quantity: plain decimal digits, never
 * locale-grouped. `source` is operator-supplied free text and must only ever
 * reach the DOM as escaped text.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ExternalReference from '../../../../app/components/molecules/ExternalReference.vue'

const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    'externalReference.label': 'External reference',
    'externalReference.externalId': 'External ID',
    'externalReference.source': 'Source',
  },
  it: {
    'externalReference.label': 'Riferimento esterno',
    'externalReference.externalId': 'ID esterno',
    'externalReference.source': 'Origine',
  },
}

/** Re-stubs the Nuxt `useI18n` auto-import with real copy for one locale. */
function stubLocale(locale: 'en' | 'it'): void {
  vi.stubGlobal(
    'useI18n',
    vi.fn(() => ({
      t: (key: string) => MESSAGES[locale]?.[key] ?? key,
      te: () => true,
      locale: ref(locale),
    }))
  )
}

type Props = {
  externalId?: number | null
  source?: string | null
  variant: 'compact' | 'labelled'
}

function mountReference(props: Props, attrs: Record<string, unknown> = {}) {
  return mount(ExternalReference, { props, attrs })
}

const value = (wrapper: ReturnType<typeof mountReference>) =>
  wrapper.get('[data-testid="external-reference-value"]').text()

describe('ExternalReference', () => {
  afterEach(() => {
    // Restore the suite-wide identity `useI18n` stub from tests/unit/setup.ts.
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, te: () => true, locale: ref('it') }))
    )
  })

  describe('compact', () => {
    it('joins source and id with a middle dot when both are present', () => {
      stubLocale('en')
      const wrapper = mountReference({ externalId: 4471, source: 'Acme ATS', variant: 'compact' })

      expect(value(wrapper)).toBe('Acme ATS · #4471')
    })

    it('renders only the id, with a hash and no separator', () => {
      stubLocale('en')
      const wrapper = mountReference({ externalId: 4471, source: null, variant: 'compact' })

      expect(value(wrapper)).toBe('#4471')
    })

    it('renders only the source, with no hash and no separator', () => {
      stubLocale('en')
      const wrapper = mountReference({ externalId: null, source: 'Acme ATS', variant: 'compact' })

      expect(value(wrapper)).toBe('Acme ATS')
    })

    it('carries an sr-only label prefix so the bare value is announced with its meaning', () => {
      stubLocale('en')
      const wrapper = mountReference({ externalId: 4471, source: 'Acme ATS', variant: 'compact' })
      const prefix = wrapper.get('.sr-only')

      expect(prefix.text()).toContain('External reference')
      // The prefix is NOT part of the visible value.
      expect(value(wrapper)).not.toContain('External reference')
    })

    it('exposes the test hook on the root element', () => {
      const wrapper = mountReference({ externalId: 4471, source: 'Acme ATS', variant: 'compact' })

      expect(wrapper.attributes('data-testid')).toBe('external-reference')
    })

    it('forwards the caller class to the root, so the host decides the muted styling', () => {
      const wrapper = mountReference(
        { externalId: 4471, source: 'Acme ATS', variant: 'compact' },
        { class: 'text-muted-foreground text-xs' }
      )

      expect(wrapper.classes()).toEqual(
        expect.arrayContaining(['text-muted-foreground', 'text-xs'])
      )
    })
  })

  describe('labelled', () => {
    it('labels both parts and joins them with a middle dot', () => {
      stubLocale('en')
      const wrapper = mountReference({ externalId: 12345, source: 'Workday', variant: 'labelled' })

      expect(value(wrapper)).toBe('External ID 12345 · Source Workday')
    })

    it('renders only the id part when there is no source', () => {
      stubLocale('en')
      const wrapper = mountReference({ externalId: 12345, source: null, variant: 'labelled' })

      expect(value(wrapper)).toBe('External ID 12345')
    })

    it('renders only the source part when there is no id', () => {
      stubLocale('en')
      const wrapper = mountReference({ externalId: null, source: 'Workday', variant: 'labelled' })

      expect(value(wrapper)).toBe('Source Workday')
    })

    it('uses the Italian labels and keeps the data untouched', () => {
      stubLocale('it')
      const wrapper = mountReference({ externalId: 12345, source: 'Workday', variant: 'labelled' })

      expect(value(wrapper)).toBe('ID esterno 12345 · Origine Workday')
    })

    it('has no sr-only prefix: the visible labels already name each part', () => {
      const wrapper = mountReference({ externalId: 12345, source: 'Workday', variant: 'labelled' })

      expect(wrapper.find('.sr-only').exists()).toBe(false)
    })

    it('exposes the test hook on the root element', () => {
      const wrapper = mountReference({ externalId: 12345, source: 'Workday', variant: 'labelled' })

      expect(wrapper.attributes('data-testid')).toBe('external-reference')
    })
  })

  describe.each(['compact', 'labelled'] as const)('%s: nothing to show', (variant) => {
    it('renders nothing when both values are null', () => {
      const wrapper = mountReference({ externalId: null, source: null, variant })

      expect(wrapper.find('[data-testid="external-reference"]').exists()).toBe(false)
      expect(wrapper.text()).toBe('')
    })

    it('renders nothing when both props are omitted (older payloads without the keys)', () => {
      const wrapper = mountReference({ variant })

      expect(wrapper.find('[data-testid="external-reference"]').exists()).toBe(false)
      expect(wrapper.text()).toBe('')
    })

    it('treats an empty source as absent, leaving no lone separator', () => {
      stubLocale('en')
      const withId = mountReference({ externalId: 4471, source: '', variant })
      const empty = mountReference({ externalId: null, source: '', variant })

      expect(value(withId)).not.toContain('·')
      expect(empty.find('[data-testid="external-reference"]').exists()).toBe(false)
    })
  })

  describe.each(['it', 'en'] as const)('identifier formatting in %s', (locale) => {
    it('prints a large id as plain digits, never locale-grouped', () => {
      stubLocale(locale)
      const compact = mountReference({ externalId: 1234567, source: null, variant: 'compact' })
      const labelled = mountReference({ externalId: 1234567, source: null, variant: 'labelled' })

      expect(value(compact)).toBe('#1234567')
      expect(value(labelled)).toContain('1234567')
      expect(compact.text()).not.toMatch(/1[.,\s]234/)
      expect(labelled.text()).not.toMatch(/1[.,\s]234/)
    })

    it('prints the largest safe integer exactly', () => {
      stubLocale(locale)
      const wrapper = mountReference({
        externalId: Number.MAX_SAFE_INTEGER,
        source: null,
        variant: 'compact',
      })

      expect(value(wrapper)).toBe('#9007199254740991')
    })
  })

  describe('source is data, not markup', () => {
    it.each(['compact', 'labelled'] as const)(
      '%s renders html-looking text literally',
      (variant) => {
        const wrapper = mountReference({ externalId: null, source: '<b>x</b>', variant })

        expect(wrapper.text()).toContain('<b>x</b>')
        expect(wrapper.find('b').exists()).toBe(false)
      }
    )
  })
})
