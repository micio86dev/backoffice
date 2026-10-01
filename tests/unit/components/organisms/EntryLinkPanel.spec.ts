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

/**
 * The disclosure is a CAUTION, not a failure.
 *
 * It rendered `destructive` — the same red the app uses when something has
 * gone wrong — while nothing has: the link was minted successfully and this
 * explains how to handle it. Red for a successful outcome trains an operator
 * to read red as decoration, which is exactly what makes a real error
 * invisible later.
 *
 * Deliberately NOT migrated to `FormMessage`. That component sets
 * `role="alert"` and `aria-live="polite"` because it announces an outcome that
 * just happened; this text is static and always present, and a live region
 * that never changes is noise in a screen reader rather than help.
 */
describe('EntryLinkPanel — the disclosure is a warning, not an error', () => {
  it('uses the warning variant', () => {
    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })

    const classes = wrapper.get('[data-testid="entry-link-disclosure"]').classes().join(' ')

    expect(classes).toContain('warning')
    expect(classes).not.toContain('destructive')
  })
})

/**
 * The single-use variant is pinned byte for byte (admin-backoffice spec,
 * "The single-use variant is unchanged").
 *
 * Written BEFORE the reusable variant existed, against the then-current
 * template, so a refactor that quietly alters the single-use DOM turns it red.
 * The expiry date is the one thing replaced by a placeholder: `FormattedDate`
 * renders in the host's timezone, and a snapshot that changes with the CI
 * runner's clock zone would be a test that fails for the wrong reason.
 */
describe('EntryLinkPanel — the single-use variant is unchanged', () => {
  function singleUseHtml(props: Record<string, unknown>): string {
    const wrapper = mount(EntryLinkPanel, {
      props: { link: LINK, locale: 'en', ...props },
      global: { mocks: { $t: tMock } },
    })

    return (
      wrapper
        .html()
        // Comments are template documentation and `v-if` placeholders, not DOM an
        // operator can see or a screen reader can reach; pinning them would make
        // a reworded comment fail this test for the wrong reason.
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\n\s*(?=\n)/g, '')
        .replace(
          /(data-testid="entry-link-expiry">\s*entryLink\.expiresAt\s*)<span>[^<]*<\/span>/,
          '$1<span>DATE</span>'
        )
    )
  }

  it('renders the exact single-use DOM when no kind is given', () => {
    expect(singleUseHtml({})).toMatchInlineSnapshot(`
      "<div class="flex flex-col gap-4">
        <div data-slot="alert" class="grid gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*=size-])]:size-4 group/alert relative w-full border-warning/40 bg-warning-light text-warning-dark dark:border-warning/30 dark:bg-warning/15 dark:text-warning *:data-[slot=alert-description]:text-current/90 *:[svg]:text-current" role="alert" data-testid="entry-link-disclosure">
          <div data-slot="alert-description" class="text-muted-foreground text-sm text-balance md:text-pretty [&amp;_p:not(:last-child)]:mb-4 [&amp;_a]:underline [&amp;_a]:underline-offset-3 [&amp;_a]:hover:text-foreground">entryLink.disclosure</div>
        </div>
        <p class="text-muted-foreground text-sm" data-testid="entry-link-expiry">entryLink.expiresAt <span>DATE</span></p>
        <p class="bg-muted rounded-lg p-3 font-mono text-sm break-all" data-testid="entry-link-url">https://interview.example.com/en/interview/tok123</p>
        <div class="flex gap-2"><button data-slot="button" class="focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&amp;_svg:not([class*=size-])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 bg-primary text-primary-foreground [a]:hover:bg-primary/80 h-(--spacing-control) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2" data-testid="entry-link-copy">
            entryLink.copy
          </button><button data-slot="button" data-variant="outline" class="focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&amp;_svg:not([class*=size-])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground h-(--spacing-control) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2" data-testid="entry-link-generate">
            entryLink.generate
          </button></div>
      </div>"
    `)
  })

  it('renders the same DOM when kind is explicitly "single-use"', () => {
    expect(singleUseHtml({ kind: 'single-use' })).toBe(singleUseHtml({}))
  })
})

/**
 * reusable-interview-links (design AD-17, DESIGN.md 16.18).
 *
 * A reusable link never expires and is not single-use, so none of the
 * single-use statements apply to it. What it needs instead is a different
 * disclosure — "does not expire, usable many times, anyone who has it can start
 * this interview, shown only once" — and, as in the single-use panel, that
 * disclosure must precede the Copy control in DOM order.
 */
describe('EntryLinkPanel — the reusable variant', () => {
  const REUSABLE_LINK = {
    entry_url: 'https://interview.example.com/en/interview/reusable#beai_rl_SECRETSECRET',
  }

  function mountReusable() {
    return mount(EntryLinkPanel, {
      props: { link: REUSABLE_LINK, kind: 'reusable' as const, locale: 'en' },
      global: { mocks: { $t: tMock } },
    })
  }

  function follows(first: Element, second: Element): boolean {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
  }

  it('renders the warning, then the never-expires line, then the URL, then Copy, in that order', () => {
    const wrapper = mountReusable()

    const alert = wrapper.get('[data-testid="entry-link-disclosure"]').element
    const neverExpires = wrapper.get('[data-testid="entry-link-never-expires"]').element
    const url = wrapper.get('[data-testid="entry-link-url"]').element
    const copy = wrapper.get('[data-testid="entry-link-copy"]').element

    expect(follows(alert, neverExpires)).toBe(true)
    expect(follows(neverExpires, url)).toBe(true)
    expect(follows(url, copy)).toBe(true)
  })

  it('shows the reusable disclosure as a warning, not an error, with no interaction needed', () => {
    const wrapper = mountReusable()

    const disclosure = wrapper.get('[data-testid="entry-link-disclosure"]')

    expect(disclosure.text()).toContain('entryLink.reusable.disclosure')
    expect(disclosure.classes().join(' ')).toContain('warning')
    expect(disclosure.classes().join(' ')).not.toContain('destructive')
  })

  it('states that the link never expires and when it stops working', () => {
    const wrapper = mountReusable()

    const line = wrapper.get('[data-testid="entry-link-never-expires"]').text()

    expect(line).toContain('entryLink.reusable.neverExpires')
    expect(line).toContain('entryLink.reusable.stopsWhen')
  })

  it('renders the full URL as selectable text', () => {
    const wrapper = mountReusable()

    expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(REUSABLE_LINK.entry_url)
  })

  it('has no Generate new link control and emits no generate event', () => {
    const wrapper = mountReusable()

    expect(wrapper.find('[data-testid="entry-link-generate"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('entryLink.generate')
    expect(wrapper.emitted('generate')).toBeUndefined()
  })

  it('has no expiry line and none of the single-use statements', () => {
    const wrapper = mountReusable()

    expect(wrapper.find('[data-testid="entry-link-expiry"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('entryLink.expiresAt')
    // The single-use disclosure key must not be the one shown here.
    expect(wrapper.get('[data-testid="entry-link-disclosure"]').text()).not.toBe(
      'entryLink.disclosure'
    )
  })

  it('never uses revoke or regenerate wording', () => {
    const text = mountReusable().text().toLowerCase()

    expect(text).not.toContain('revoke')
    expect(text).not.toContain('regenerate')
  })

  it('copies the complete URL including its fragment', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mountReusable()

    await wrapper.get('[data-testid="entry-link-copy"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(REUSABLE_LINK.entry_url)
    expect(writeText.mock.calls[0]?.[0]).toContain('#beai_rl_')
  })

  it('keeps the clipboard-blocked hint: the selectable URL is the fallback here too', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })

    const wrapper = mountReusable()

    await wrapper.get('[data-testid="entry-link-copy"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-copy-hint"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="entry-link-url"]').text()).toBe(REUSABLE_LINK.entry_url)
  })

  it('never writes the URL to storage, history or the address bar', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
    localStorage.clear()
    sessionStorage.clear()
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const hashBefore = window.location.hash

    const wrapper = mountReusable()
    await wrapper.get('[data-testid="entry-link-copy"]').trigger('click')
    await flushPromises()

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(window.location.hash).toBe(hashBefore)
  })
})
