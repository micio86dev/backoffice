/**
 * ProjectTable.vue (Unit 2a, task 18.3 — RED)
 *
 * Presentational table: shadcn `Table` + `Button` only, never a raw
 * `<button>` (D8 — `avatar-templates/index.vue` is explicitly NOT the
 * model).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectTable from '../../../../app/components/organisms/ProjectTable.vue'
import EntryLinkForm from '../../../../app/components/organisms/EntryLinkForm.vue'

const tMock = (key: string) => key

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    organization_id: 1,
    framework_version_id: 1,
    slug: 'demo-project',
    name: 'Demo Project',
    assessment_type: 'standard',
    role_code: 'FLL',
    language: 'en',
    status: 'draft',
    pause_every_n_competencies: 3,
    nudge_min_chars: 40,
    exit_redirect_url: 'https://example.com/done',
    webhook_url: 'https://example.com/hook',
    webhook_events: ['progress'],
    has_webhook_secret: false,
    deadline_at: null,
    goes_live_at: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    pin_context: null,
    competencies: [],
    ...overrides,
  }
}

describe('ProjectTable', () => {
  it('renders a row per project with its status badge', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project()] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('Demo Project')
    expect(wrapper.text()).toContain('demo-project')
  })

  it('renders the empty state when there are no projects', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('projects.table.empty')
  })

  it('emits edit with the project id when its row action is clicked, using a real Button', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project({ id: 9 })] },
      global: { mocks: { $t: tMock } },
    })

    const editButton = wrapper.get('[data-testid="project-row-edit-9"]')
    // Real shadcn Button renders a native <button> element under the hood —
    // asserting the tag proves this is Button, not a raw hand-rolled <button>
    // styled to look the same (D8's avatar-templates anti-pattern).
    expect(editButton.element.tagName).toBe('BUTTON')

    editButton.trigger('click')
    expect(wrapper.emitted('edit')?.[0]).toEqual([9])
  })
})

// operator-interview-link, design D4/D5 — "Invite candidate" row action.
describe('ProjectTable — Invite candidate (operator-interview-link)', () => {
  it('does not render the invite action when canInvite is false (default)', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project({ id: 1 })] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('[data-testid="project-row-invite-1"]').exists()).toBe(false)
  })

  it('renders the invite action, enabled, for an eligible (active) project when canInvite is true', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project({ id: 1, status: 'active' })], canInvite: true },
      global: { mocks: { $t: tMock } },
    })

    const button = wrapper.get('[data-testid="project-row-invite-1"]')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="project-row-invite-disabled-reason-1"]').exists()).toBe(
      false
    )
  })

  it('disables the invite action with a stated reason for a draft project', () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project({ id: 1, status: 'draft' })], canInvite: true },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.get('[data-testid="project-row-invite-1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="project-row-invite-disabled-reason-1"]').text()).toContain(
      'entryLink.disabledReason.notActive'
    )
  })

  it('opens the invite dialog with EntryLinkForm, then swaps to EntryLinkPanel on success', async () => {
    const wrapper = mount(ProjectTable, {
      props: { projects: [project({ id: 1, status: 'active' })], canInvite: true, locale: 'en' },
      attachTo: document.body,
      global: { mocks: { $t: tMock } },
    })

    await wrapper.get('[data-testid="project-row-invite-1"]').trigger('click')

    expect(document.body.querySelector('[data-testid="entry-link-form"]')).not.toBeNull()
    expect(document.body.querySelector('[data-testid="entry-link-url"]')).toBeNull()

    // The form's OWN submit/validation contract is covered by
    // EntryLinkForm.spec.ts — here only the parent's success-swap wiring is
    // under test, so the emit is triggered directly.
    const form = wrapper.findComponent(EntryLinkForm)
    form.vm.$emit('success', {
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('[data-testid="entry-link-form"]')).toBeNull()
    expect(document.body.querySelector('[data-testid="entry-link-url"]')?.textContent).toBe(
      'https://interview.example.com/interview/tok'
    )

    wrapper.unmount()
  })

  // feature/form-drawer — "Invite candidate" is a create form launched from a
  // table row, which is the drawer case. The two-stage flow is deliberately
  // NOT split into a drawer plus a separate dialog: the minted link has to
  // appear where the form was, or the operator loses the thread between what
  // they submitted and the single-use link it produced. Only the FOOTER
  // changes between the stages.
  describe('the invite drawer (feature/form-drawer)', () => {
    async function openInvite() {
      const wrapper = mount(ProjectTable, {
        props: { projects: [project({ id: 1, status: 'active' })], canInvite: true, locale: 'en' },
        attachTo: document.body,
        global: { mocks: { $t: tMock } },
      })

      await wrapper.get('[data-testid="project-row-invite-1"]').trigger('click')

      return wrapper
    }

    it('renders the invite form inside the drawer, not a centred dialog', async () => {
      const wrapper = await openInvite()

      expect(
        document.body.querySelector('[data-testid="form-drawer"] [data-testid="entry-link-form"]')
      ).not.toBeNull()
      expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull()

      wrapper.unmount()
    })

    it('offers the shared submit/cancel pair in the footer while the form is showing', async () => {
      const wrapper = await openInvite()

      const scrollRegion = document.body.querySelector('.overflow-y-auto')
      const submit = document.body.querySelector('[data-testid="form-drawer-save"]')

      expect(submit).not.toBeNull()
      expect(submit!.getAttribute('form')).toBe('entry-link-form')
      expect(scrollRegion!.contains(submit)).toBe(false)

      wrapper.unmount()
    })

    // Once the link exists there is nothing left to submit, and a "Save"
    // control pointing at a form no longer in the DOM would be inert.
    it('replaces the submit pair with a close control once the link has been minted', async () => {
      const wrapper = await openInvite()

      wrapper.findComponent(EntryLinkForm).vm.$emit('success', {
        entry_url: 'https://interview.example.com/interview/tok',
        expires_at: '2026-08-17T15:32:00.000000Z',
      })
      await wrapper.vm.$nextTick()

      expect(document.body.querySelector('[data-testid="form-drawer-save"]')).toBeNull()
      expect(document.body.querySelector('[data-testid="entry-link-close"]')).not.toBeNull()

      wrapper.unmount()
    })

    it('closes on the footer cancel while the form is showing', async () => {
      const wrapper = await openInvite()

      const cancel = document.body.querySelector<HTMLButtonElement>(
        '[data-testid="form-drawer-cancel"]'
      )
      cancel!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wrapper.vm.$nextTick()

      expect((wrapper.vm as unknown as { inviteTarget: unknown }).inviteTarget).toBeNull()

      wrapper.unmount()
    })
  })
})

/**
 * The avatar service and the template that selects it.
 *
 * The table listed name, type and status, so the one fact that decides HOW an
 * interview actually runs — which provider, via which template — was readable
 * only by opening each project in turn. The API now sends both on
 * `avatar_template`; these render them.
 *
 * The provider is rendered through a translation key rather than echoed raw:
 * `heygen` is a machine value, and `HeyGen` is how it is spelled to a person.
 */
describe('ProjectTable avatar columns', () => {
  it('shows the provider and the template name', () => {
    const wrapper = mount(ProjectTable, {
      props: {
        projects: [
          project({
            avatar_template: { id: 7, name: 'Ada Warm', provider: 'tavus' },
          }),
        ],
      },
      global: { mocks: { $t: tMock } },
    })

    const html = wrapper.html()

    expect(html).toContain('projects.avatarProvider.tavus')
    expect(html).toContain('Ada Warm')
  })

  it('falls back to a dash when the relation was not sent', () => {
    // Never an empty cell and never "null": the column has to read as "not
    // available here" rather than as a project that runs on nothing.
    const wrapper = mount(ProjectTable, {
      props: { projects: [project({ avatar_template: null })] },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('[data-testid="project-row-provider-1"]').text()).toBe('–')
    expect(wrapper.find('[data-testid="project-row-template-1"]').text()).toBe('–')
  })

  it('keeps the empty row spanning every column', () => {
    // A colspan left behind when a column is added is the classic way an empty
    // table starts rendering a ragged row nobody notices in review.
    const wrapper = mount(ProjectTable, {
      props: { projects: [] },
      global: { mocks: { $t: tMock } },
    })

    const headers = wrapper.findAll('thead th').length

    expect(wrapper.find('tbody td').attributes('colspan')).toBe(String(headers))
  })
})

/**
 * The template cell names the MODEL underneath the template.
 *
 * The provider column already says HeyGen or Tavus. What it cannot say is
 * which LLM the conversation actually runs on, and that is the line that
 * decides cost and behaviour — an operator comparing two projects on the same
 * provider has no other way to tell them apart.
 *
 * Same cell rather than a fourth column: the model is an attribute OF the
 * template, not a peer of it, and a table that grows a column per attribute
 * stops being scannable well before it stops being correct.
 */
describe('ProjectTable template cell', () => {
  it('stacks the LLM model under the template name', () => {
    const wrapper = mount(ProjectTable, {
      props: {
        projects: [
          project({
            avatar_template: {
              id: 7,
              name: 'Ada Warm',
              provider: 'tavus',
              llm_model: 'Gemini 3 Flash Preview',
            },
          }),
        ],
      },
      global: { mocks: { $t: tMock } },
    })

    const cell = wrapper.get('[data-testid="project-row-template-1"]')

    expect(cell.text()).toContain('Ada Warm')
    expect(cell.text()).toContain('Gemini 3 Flash Preview')
  })

  it('shows the template alone when no model is bound', () => {
    // Nullable by schema, and "not configured" must read as absent rather
    // than as an empty second line pretending to hold something.
    const wrapper = mount(ProjectTable, {
      props: {
        projects: [
          project({
            avatar_template: { id: 7, name: 'Ada Warm', provider: 'tavus', llm_model: null },
          }),
        ],
      },
      global: { mocks: { $t: tMock } },
    })

    const cell = wrapper.get('[data-testid="project-row-template-1"]')

    expect(cell.text()).toBe('Ada Warm')
  })
})
