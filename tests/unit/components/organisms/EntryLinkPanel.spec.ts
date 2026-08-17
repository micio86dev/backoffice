/**
 * EntryLinkPanel.vue (operator-interview-link, design D4)
 *
 * One shared organism, rendered by both surfaces (participant detail
 * re-issue, project-row invite). DOM order is load-bearing: the single-use +
 * expiry disclosure MUST render above the URL and BEFORE the Copy control —
 * a toast shown after copy is too late by construction (admin-backoffice
 * spec, "Single-Use and Expiry Are Disclosed Before the Copy").
 *
 * Clipboard failure is designed out, not handled (design D6): the URL is
 * ALWAYS rendered as selectable text before the Copy button exists, so a
 * denied/unavailable clipboard degrades to manual selection with nothing
 * lost. Two additions over the ApiKeysPanel precedent: the catch is not
 * silent (a hint renders), and an insecure context
 * (`navigator.clipboard === undefined`) disables the button up front rather
 * than throwing on click.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string) => key

const EntryLinkPanel = (await import('../../../../app/components/organisms/EntryLinkPanel.vue'))
  .default

const LINK = {
  entry_url: 'https://interview.example.com/en/interview/tok123',
  expires_at: '2026-08-17T15:32:00.000000Z',
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('EntryLinkPanel — disclosure DOM order (design D4)', () => {
  it('renders alert, then expiry, then the URL, then Copy/Generate, in that order', () => {
    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    const alert = wrapper.get('[data-testid="entry-link-disclosure"]').element
    const expiry = wrapper.get('[data-testid="entry-link-expiry"]').element
    const url = wrapper.get('[data-testid="entry-link-url"]').element
    const copy = wrapper.get('[data-testid="entry-link-copy"]').element

    // Node.compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING (4) means the
    // argument comes AFTER the node it's called on.
    expect(alert.compareDocumentPosition(expiry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(expiry.compareDocumentPosition(url) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(url.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders the URL as always-selectable text, not hidden behind a reveal', () => {
    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(LINK.entry_url)
  })

  it('renders the expiry through FormattedDate with show-zone (never a raw timestamp)', () => {
    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).not.toContain(LINK.expires_at)
    expect(wrapper.get('[data-testid="entry-link-expiry"]').text().length).toBeGreaterThan(0)
  })

  it('never renders "revoke" or "regenerate" for the Generate new link action', () => {
    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text().toLowerCase()).not.toContain('revoke')
    expect(wrapper.text().toLowerCase()).not.toContain('regenerate')
  })
})

describe('EntryLinkPanel — clipboard failure is designed out (design D6)', () => {
  it('shows an inline hint (not a silent catch) when writeText rejects, URL stays selectable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })

    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="entry-link-copy"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-copy-hint"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(LINK.entry_url)
  })

  it('disables the Copy button with the same hint when navigator.clipboard is undefined', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })

    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    const copyButton = wrapper.get('[data-testid="entry-link-copy"]')
    expect(copyButton.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="entry-link-copy-hint"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(LINK.entry_url)
  })
})

describe('EntryLinkPanel — Generate new link', () => {
  it('emits "generate" when the Generate new link button is clicked', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })

    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="entry-link-generate"]').trigger('click')

    expect(wrapper.emitted('generate')).toHaveLength(1)
  })
})
