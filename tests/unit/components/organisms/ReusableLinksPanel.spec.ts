/**
 * ReusableLinksPanel.vue (reusable-interview-links, B6b; DESIGN.md 16.18,
 * admin-backoffice spec "The Reusable Links Panel Lists Links And Disables Them")
 *
 * The saved-project drawer's list of a project's reusable links, and the one
 * place an operator disables one. It is a LIST, not an editor, and it never
 * holds a secret: the api describes a link by its label, prefix and usage, so
 * the full URL cannot be shown again, by design.
 *
 * Disabling is final (a disabled link cannot be re-enabled), so it goes through
 * the destructive `ConfirmDialog`: no request until the operator confirms, and
 * Cancel / Escape / backdrop leave the row Active.
 *
 * Rendered with REAL copy (a real vue-i18n instance over `en.json` / `it.json`)
 * because most of what this panel does is say something to an operator: the
 * plural usage line, the date sentence and the confirmation's consequence are
 * asserted as the words they read, not as keys.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../../../i18n/locales/en.json'
import it_ from '../../../../i18n/locales/it.json'
import { formatDate } from '../../../../app/utils/format'
import { confirmDialog } from '../../support/confirm'
import { waitFor, waitForTestId } from '../../support/wait-for'

const listReusableLinksMock = vi.fn()
const disableReusableLinkMock = vi.fn()

vi.mock('../../../../app/composables/useReusableLinks', () => ({
  useReusableLinks: () => ({
    listReusableLinks: listReusableLinksMock,
    disableReusableLink: disableReusableLinkMock,
    createReusableLink: vi.fn(),
  }),
}))

const ReusableLinksPanel = (
  await import('../../../../app/components/organisms/ReusableLinksPanel.vue')
).default

const PROJECT_ID = 42
const MILAN_ID = 'rlk_01HZ0000000000000000000000'
const OLD_ID = 'rlk_01HZ1111111111111111111111'
const UNNAMED_ID = 'rlk_01HZ2222222222222222222222'

type Link = {
  id: string
  label: string | null
  token_prefix: string
  lang: string
  status: 'active' | 'disabled'
  uses_count: number
  last_used_at: string | null
  created_by: { name: string } | null
  created_at: string
  disabled_at: string | null
}

function link(overrides: Partial<Link> = {}): Link {
  return {
    id: MILAN_ID,
    label: 'Milan fair stand',
    token_prefix: 'beai_rl_AbCdEfGh',
    lang: 'en',
    status: 'active',
    uses_count: 3,
    last_used_at: '2026-10-02T09:30:00.000000Z',
    created_by: { name: 'Ada Admin' },
    created_at: '2026-10-01T10:00:00.000000Z',
    disabled_at: null,
    ...overrides,
  }
}

/** An active link used 3 times, a disabled one never used: the spec's own scenario. */
function twoLinks(): Link[] {
  return [
    link(),
    link({
      id: OLD_ID,
      label: 'Old demo',
      token_prefix: 'beai_rl_ZyXwVuTs',
      status: 'disabled',
      uses_count: 0,
      last_used_at: null,
      created_by: { name: 'Grace Operator' },
      created_at: '2026-09-20T08:00:00.000000Z',
      disabled_at: '2026-09-25T08:00:00.000000Z',
    }),
  ]
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

function i18nFor(locale: 'en' | 'it') {
  return createI18n({ legacy: false, locale, messages: { en, it: it_ } })
}

let wrapper: ReturnType<typeof mount> | null = null

async function mountPanel(
  links: Link[] | Promise<{ data: Link[] }> | Error,
  { locale = 'en' as 'en' | 'it' } = {}
): Promise<ReturnType<typeof mount>> {
  if (links instanceof Error) listReusableLinksMock.mockRejectedValue(links)
  else if (links instanceof Promise) listReusableLinksMock.mockReturnValue(links)
  else listReusableLinksMock.mockResolvedValue({ data: links })

  const i18n = i18nFor(locale)
  // The component reads `useI18n()` for its script-side strings; the template
  // reads `$t`. Both must speak the same real copy.
  vi.stubGlobal('useI18n', () => i18n.global)

  wrapper = mount(ReusableLinksPanel, {
    props: { projectId: PROJECT_ID, locale },
    global: { plugins: [i18n] },
  })
  await flushPromises()

  return wrapper
}

const row = (id: string) => wrapper!.find(`[data-testid="reusable-link-row-${id}"]`)
const disableButton = (id: string) =>
  wrapper!.find<HTMLButtonElement>(`[data-testid="reusable-link-disable-${id}"]`)

async function openDisableConfirmation(id: string): Promise<void> {
  await disableButton(id).trigger('click')
  await waitForTestId('confirm-dialog-confirm')
}

beforeEach(() => {
  listReusableLinksMock.mockReset()
  disableReusableLinkMock.mockReset()
  disableReusableLinkMock.mockResolvedValue(undefined)
})

afterEach(() => {
  // reka-ui teleports the confirmation into `document.body`. A test that fails
  // before its own unmount would leave it there for the NEXT test to find.
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('rows', () => {
  it('asks for the links of the project it was given, once, on mount', async () => {
    await mountPanel(twoLinks())

    expect(listReusableLinksMock).toHaveBeenCalledTimes(1)
    expect(listReusableLinksMock).toHaveBeenCalledWith(PROJECT_ID)
  })

  it('renders one row per link, in the order the api sent them', async () => {
    await mountPanel(twoLinks())

    const rows = wrapper!.findAll('[data-testid^="reusable-link-row-"]')

    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      `reusable-link-row-${MILAN_ID}`,
      `reusable-link-row-${OLD_ID}`,
    ])
  })

  it('shows label, prefix, who and when it was created, usage and status on an active row', async () => {
    await mountPanel(twoLinks())

    const text = row(MILAN_ID).text()

    expect(text).toContain('Milan fair stand')
    expect(text).toContain('beai_rl_AbCdEfGh')
    expect(text).toContain(
      `Created on ${formatDate('2026-10-01T10:00:00.000000Z', 'en')} by Ada Admin`
    )
    expect(text).toContain(
      `Used 3 times · last used ${formatDate('2026-10-02T09:30:00.000000Z', 'en')}`
    )
    expect(text).toContain('Active')
  })

  it('shows "Never used" and Disabled on a disabled link that was never opened', async () => {
    await mountPanel(twoLinks())

    const text = row(OLD_ID).text()

    expect(text).toContain('Old demo')
    expect(text).toContain('beai_rl_ZyXwVuTs')
    expect(text).toContain(
      `Created on ${formatDate('2026-09-20T08:00:00.000000Z', 'en')} by Grace Operator`
    )
    expect(text).toContain('Never used')
    expect(text).not.toContain('last used')
    expect(text).toContain('Disabled')
  })

  it('uses the singular for one use and the plural otherwise', async () => {
    await mountPanel([link({ uses_count: 1 }), link({ id: OLD_ID, uses_count: 12 })])

    expect(row(MILAN_ID).text()).toMatch(/Used 1 time · last used/)
    expect(row(MILAN_ID).text()).not.toContain('Used 1 times')
    expect(row(OLD_ID).text()).toMatch(/Used 12 times · last used/)
  })

  it('falls back to "Untitled link" for a link with no label', async () => {
    await mountPanel([link({ id: UNNAMED_ID, label: null })])

    expect(row(UNNAMED_ID).text()).toContain('Untitled link')
  })

  it('leaves out "by <name>" when the creator is gone, instead of printing a blank', async () => {
    await mountPanel([link({ created_by: null })])

    const text = row(MILAN_ID).text()

    expect(text).toContain(`Created on ${formatDate('2026-10-01T10:00:00.000000Z', 'en')}`)
    expect(text).not.toMatch(/ by /)
  })

  it('renders a label as escaped text, never as markup', async () => {
    await mountPanel([link({ label: '<b>x</b>' })])

    expect(row(MILAN_ID).text()).toContain('<b>x</b>')
    expect(row(MILAN_ID).find('b').exists()).toBe(false)
  })

  it('never renders a URL, token or hash, even if the api sent one by mistake', async () => {
    const leaky = {
      ...link(),
      entry_url: 'https://interview.example.test/interview/reusable#beai_rl_SECRETSECRET',
      token_hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      token: 'beai_rl_SECRETSECRET',
    }

    await mountPanel([leaky])

    const html = wrapper!.html()

    expect(html).not.toContain('SECRETSECRET')
    expect(html).not.toContain('deadbeef')
    expect(html).not.toContain('https://')
    // The prefix is the only trace of the token the operator ever sees.
    expect(html).toContain('beai_rl_AbCdEfGh')
  })

  it('keeps the data and changes only the copy when the locale changes', async () => {
    await mountPanel(twoLinks(), { locale: 'it' })

    const text = row(MILAN_ID).text()

    // Copy: Italian.
    expect(text).toContain('Attivo')
    expect(text).toContain('Usato 3 volte')
    expect(row(OLD_ID).text()).toContain('Disattivato')
    expect(row(OLD_ID).text()).toContain('Mai usato')
    // Data: untouched.
    expect(text).toContain('Milan fair stand')
    expect(text).toContain('beai_rl_AbCdEfGh')
  })
})

describe('the Disable action', () => {
  it('is offered on an active row only, never on a disabled one', async () => {
    await mountPanel(twoLinks())

    expect(disableButton(MILAN_ID).exists()).toBe(true)
    expect(disableButton(MILAN_ID).text()).toBe('Disable link')
    expect(disableButton(OLD_ID).exists()).toBe(false)
    // And that is the ONLY action in the whole panel: it is a list, not an editor.
    expect(wrapper!.findAll('button')).toHaveLength(1)
  })

  it('gives each Disable button a name that says WHICH link, so the controls list is not four identical buttons', async () => {
    await mountPanel([
      link(),
      link({ id: UNNAMED_ID, label: null, token_prefix: 'beai_rl_QqQqQqQq' }),
    ])

    expect(disableButton(MILAN_ID).attributes('aria-label')).toBe('Disable link: Milan fair stand')
    expect(disableButton(UNNAMED_ID).attributes('aria-label')).toBe('Disable link: Untitled link')
    // The accessible name still contains the visible text (WCAG 2.5.3).
    expect(disableButton(MILAN_ID).attributes('aria-label')).toContain(
      disableButton(MILAN_ID).text()
    )
    expect(disableButton(MILAN_ID).attributes('type')).toBe('button')
  })

  it('opens a destructive confirmation that names the consequence, and sends nothing yet', async () => {
    await mountPanel(twoLinks())

    await openDisableConfirmation(MILAN_ID)

    expect(document.body.textContent).toContain('Disable this link?')
    expect(document.body.textContent).toContain(
      'Nobody will be able to start a new interview with it. Interviews already in progress are not interrupted. This cannot be undone.'
    )
    expect(
      document.body.querySelector('[data-testid="confirm-dialog-confirm"]')?.textContent?.trim()
    ).toBe('Disable')
    // The confirmation IS the protection: nothing has been sent.
    expect(disableReusableLinkMock).not.toHaveBeenCalled()
  })

  it('does nothing when the operator cancels, and the row stays Active', async () => {
    await mountPanel(twoLinks())
    await openDisableConfirmation(MILAN_ID)

    await confirmDialog('cancel')

    expect(disableReusableLinkMock).not.toHaveBeenCalled()
    expect(listReusableLinksMock).toHaveBeenCalledTimes(1)
    expect(row(MILAN_ID).text()).toContain('Active')
    expect(disableButton(MILAN_ID).exists()).toBe(true)
    await waitFor(
      () => document.body.querySelector('[data-testid="confirm-dialog-confirm"]') === null,
      'the confirmation to close'
    )
  })

  it('does nothing when the operator presses Escape, and the row stays Active', async () => {
    await mountPanel(twoLinks())
    await openDisableConfirmation(MILAN_ID)

    document.body
      .querySelector('[data-testid="confirm-dialog-confirm"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    await waitFor(
      () => document.body.querySelector('[data-testid="confirm-dialog-confirm"]') === null,
      'the confirmation to close on Escape'
    )

    expect(disableReusableLinkMock).not.toHaveBeenCalled()
    expect(row(MILAN_ID).text()).toContain('Active')
  })

  it('leaves no stranded state after a cancel: a second attempt is a fresh, working confirmation', async () => {
    await mountPanel(twoLinks())
    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('cancel')
    await waitFor(
      () => document.body.querySelector('[data-testid="confirm-dialog-confirm"]') === null,
      'the first confirmation to close'
    )

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')

    expect(disableReusableLinkMock).toHaveBeenCalledTimes(1)
  })

  it('disables the right link in the right project once confirmed, then shows it Disabled without a reload', async () => {
    await mountPanel(twoLinks())
    // After the DELETE the api reports the link as disabled.
    listReusableLinksMock.mockResolvedValue({
      data: [
        link({ status: 'disabled', disabled_at: '2026-10-03T08:00:00.000000Z' }),
        twoLinks()[1],
      ],
    })

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')

    expect(disableReusableLinkMock).toHaveBeenCalledTimes(1)
    expect(disableReusableLinkMock).toHaveBeenCalledWith(PROJECT_ID, MILAN_ID)
    // Refreshed from the api, never patched locally.
    expect(listReusableLinksMock).toHaveBeenCalledTimes(2)
    expect(row(MILAN_ID).text()).toContain('Disabled')
    expect(row(MILAN_ID).text()).not.toContain('Active')
    expect(disableButton(MILAN_ID).exists()).toBe(false)
  })

  it('disables the link whose row was clicked, not simply the first one in the list', async () => {
    await mountPanel([
      link(),
      link({ id: UNNAMED_ID, label: 'Second stand', token_prefix: 'beai_rl_QqQqQqQq' }),
    ])

    await openDisableConfirmation(UNNAMED_ID)
    await confirmDialog('confirm')

    expect(disableReusableLinkMock).toHaveBeenCalledTimes(1)
    expect(disableReusableLinkMock).toHaveBeenCalledWith(PROJECT_ID, UNNAMED_ID)
  })

  it('refuses a second submit while the first is in flight', async () => {
    await mountPanel(twoLinks())
    let finish: () => void = () => undefined
    disableReusableLinkMock.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      })
    )

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')

    // Request still pending: the control is held, and says so.
    expect(disableButton(MILAN_ID).attributes('disabled')).toBeDefined()
    expect(disableReusableLinkMock).toHaveBeenCalledTimes(1)

    finish()
    await flushPromises()

    expect(disableButton(MILAN_ID).attributes('disabled')).toBeUndefined()
  })

  it('keeps the row Active and says so when the disable fails', async () => {
    await mountPanel(twoLinks())
    disableReusableLinkMock.mockRejectedValue(httpError(500))

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')

    const banner = wrapper!.find('[data-testid="reusable-links-banner"]')

    expect(banner.exists()).toBe(true)
    expect(banner.text()).toBe('The link could not be disabled. Please try again.')
    expect(row(MILAN_ID).text()).toContain('Active')
    expect(disableButton(MILAN_ID).exists()).toBe(true)
    // Nothing changed, so nothing is refetched.
    expect(listReusableLinksMock).toHaveBeenCalledTimes(1)
  })

  it('says a permission refusal is a permission refusal, not "try again"', async () => {
    await mountPanel(twoLinks())
    disableReusableLinkMock.mockRejectedValue(httpError(403))

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')

    const banner = wrapper!.find('[data-testid="reusable-links-banner"]')

    expect(banner.text()).toBe(en.errors.states.forbidden.message)
    expect(banner.text()).not.toContain('could not be disabled')
  })

  it('clears an earlier failure once a later disable succeeds', async () => {
    await mountPanel(twoLinks())
    disableReusableLinkMock.mockRejectedValueOnce(httpError(500))

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')
    expect(wrapper!.find('[data-testid="reusable-links-banner"]').exists()).toBe(true)

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')

    expect(wrapper!.find('[data-testid="reusable-links-banner"]').exists()).toBe(false)
  })

  // The api answers 204 whether this call disabled the link or it already was,
  // so a second disable of the same link is not an error to report. Here the
  // list the operator is looking at is stale: another tab disabled the link, but
  // this view still shows it Active, so the action is still offered.
  it('treats a second disable of the same link as a plain success: no error, one refresh each', async () => {
    await mountPanel(twoLinks())
    // The refetch after the FIRST disable is still stale (the other tab's write
    // has not reached this view), the one after the second catches up.
    listReusableLinksMock.mockResolvedValueOnce({ data: twoLinks() }).mockResolvedValue({
      data: [
        link({ status: 'disabled', disabled_at: '2026-10-03T08:00:00.000000Z' }),
        twoLinks()[1],
      ],
    })

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')
    expect(wrapper!.find('[data-testid="reusable-links-banner"]').exists()).toBe(false)

    await openDisableConfirmation(MILAN_ID)
    await confirmDialog('confirm')

    expect(disableReusableLinkMock).toHaveBeenCalledTimes(2)
    expect(disableReusableLinkMock).toHaveBeenNthCalledWith(1, PROJECT_ID, MILAN_ID)
    expect(disableReusableLinkMock).toHaveBeenNthCalledWith(2, PROJECT_ID, MILAN_ID)
    expect(wrapper!.find('[data-testid="reusable-links-banner"]').exists()).toBe(false)
    expect(row(MILAN_ID).text()).toContain('Disabled')
  })
})

describe('states', () => {
  it('shows a loading line, and NOT the empty state, until the first answer arrives', async () => {
    let resolve: (value: { data: Link[] }) => void = () => undefined
    await mountPanel(
      new Promise<{ data: Link[] }>((res) => {
        resolve = res
      })
    )

    expect(wrapper!.find('[data-testid="reusable-links-loading"]').text()).toBe('Loading links…')
    expect(wrapper!.find('[data-testid="reusable-links-loading"]').attributes('role')).toBe(
      'status'
    )
    expect(wrapper!.find('[data-testid="reusable-links-empty"]').exists()).toBe(false)

    resolve({ data: twoLinks() })
    await flushPromises()

    expect(wrapper!.find('[data-testid="reusable-links-loading"]').exists()).toBe(false)
    expect(row(MILAN_ID).exists()).toBe(true)
  })

  it('explains how to create a link when the project has none', async () => {
    await mountPanel([])

    const empty = wrapper!.find('[data-testid="reusable-links-empty"]')

    expect(empty.text()).toBe(
      'No reusable links yet. Create one from the project list: Invite candidate, then tick the reusable link option.'
    )
    expect(wrapper!.findAll('[data-testid^="reusable-link-row-"]')).toHaveLength(0)
    expect(wrapper!.find('[data-testid="reusable-links-error"]').exists()).toBe(false)
  })

  it('does not show the empty state when there are links', async () => {
    await mountPanel(twoLinks())

    expect(wrapper!.find('[data-testid="reusable-links-empty"]').exists()).toBe(false)
  })

  it('says the links could not be loaded, with a retry, instead of the empty state', async () => {
    await mountPanel(httpError(500))

    const error = wrapper!.find('[data-testid="reusable-links-error"]')

    expect(error.text()).toBe('The reusable links could not be loaded.')
    expect(wrapper!.find('[data-testid="reusable-links-retry"]').text()).toBe('Try again')
    // A failed load must NEVER read as "you have no links".
    expect(wrapper!.find('[data-testid="reusable-links-empty"]').exists()).toBe(false)
  })

  it('loads again on retry and replaces the error with the rows', async () => {
    await mountPanel(httpError(500))
    listReusableLinksMock.mockResolvedValue({ data: twoLinks() })

    await wrapper!.get('[data-testid="reusable-links-retry"]').trigger('click')
    await flushPromises()

    expect(listReusableLinksMock).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[data-testid="reusable-links-error"]').exists()).toBe(false)
    expect(row(MILAN_ID).exists()).toBe(true)
  })

  it('names a permission refusal as one, and offers no retry that would fail identically', async () => {
    await mountPanel(httpError(403))

    expect(wrapper!.find('[data-testid="reusable-links-error"]').text()).toBe(
      en.errors.states.forbidden.message
    )
    expect(wrapper!.find('[data-testid="reusable-links-retry"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="reusable-links-empty"]').exists()).toBe(false)
  })
})

describe('accessibility', () => {
  it('is a labelled region whose name is its heading', async () => {
    await mountPanel(twoLinks())

    const region = wrapper!.get('section')
    const labelledBy = region.attributes('aria-labelledby')

    expect(labelledBy).toBeTruthy()
    expect(wrapper!.get(`#${labelledBy}`).text()).toBe('Reusable links')
    expect(wrapper!.get(`#${labelledBy}`).element.tagName).toBe('H3')
  })

  it('lists the links as a list, one item per link', async () => {
    await mountPanel(twoLinks())

    const list = wrapper!.get('[data-testid="reusable-links-list"]')

    expect(list.element.tagName).toBe('UL')
    expect(list.findAll('li')).toHaveLength(2)
  })

  it('announces a load failure to assistive technology', async () => {
    await mountPanel(httpError(500))

    expect(wrapper!.get('[data-testid="reusable-links-error"]').attributes('role')).toBe('alert')
  })
})
