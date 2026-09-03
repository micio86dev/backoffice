/**
 * pages/projects/index.vue (Unit 2a, task 17.3 — RED)
 *
 * Container: fetches via useProjects(), passes results down to the
 * presentational ProjectTable, maps failures through
 * resolveResourceErrorState/resourceErrorKey — same house pattern as
 * `pages/participants/index.vue`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { currentUserStub } from '../../support/abilities'
import { ref } from 'vue'
import { waitFor } from '../../support/wait-for'

// `ProjectForm.vue` is loaded by the page via `defineAsyncComponent` (D10 —
// code-split). Pre-warming its module (and its own transitive tree: Select,
// Dialog, ToggleGroup, Checkbox, CompetencyPicker...) here means the dynamic
// `import()` the page triggers resolves from Vite's already-populated module
// cache on the next microtask; without this, the FIRST cold transform of
// that whole tree can take real wall-clock time that plain `flushPromises()`
// (a microtask-only flush) does not wait for.
await import('../../../../app/components/organisms/ProjectForm.vue')

const tMock = (key: string) => key

function listResponse() {
  return {
    data: [
      {
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
        exit_redirect_url: null,
        webhook_url: null,
        webhook_events: [],
        has_webhook_secret: false,
        deadline_at: null,
        goes_live_at: null,
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
        pin_context: null,
        competencies: [],
      },
    ],
  }
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

let useHeadMock: ReturnType<typeof vi.fn>

describe('pages/projects/index.vue', () => {
  beforeEach(() => {
    vi.resetModules()
    // The page gates "New project" on `projects.create` and the row edit on
    // `projects.update`, both read from `/auth/me`'s ability map. Unmocked,
    // `can()` fails closed (correctly) and every control this file drives is
    // absent. `admin` is the identity these tests describe.
    vi.doMock('../../../../app/composables/useCurrentUser', () => ({
      useCurrentUser: () => currentUserStub('admin'),
    }))
    // The drawer mounts the REAL ProjectForm, and a project cannot be saved
    // without an avatar template — the column is NOT NULL and the form refuses
    // a submit with nothing selected. Unmocked, the composable reaches for the
    // network, the list stays empty, and every save assertion below fails for
    // a reason that has nothing to do with what it is testing.
    vi.doMock('../../../../app/composables/useAvatarTemplates', () => ({
      useAvatarTemplates: () => ({
        listTemplateOptions: vi.fn().mockResolvedValue({
          data: [{ id: 7, name: 'Default template', provider: 'heygen', is_active: true }],
        }),
      }),
    }))
    useHeadMock = vi.fn()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', useHeadMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ t: (key: string) => key, locale: ref('en') }))
    )
  })

  it('fetches the list on mount and renders the returned projects', async () => {
    const listProjectsMock = vi.fn().mockResolvedValue(listResponse())
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: listProjectsMock, createProject: vi.fn() }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    expect(listProjectsMock).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Demo Project')
  })

  it('routes the <title> through i18n instead of a hardcoded English literal', async () => {
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue(listResponse()) }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    mount(IndexPage, { global: { mocks: { $t: tMock } } })

    const head = useHeadMock.mock.calls[0]?.[0] as { title?: () => string }
    expect(typeof head?.title).toBe('function')
    expect(head?.title?.()).toBe('head.title.projects')
  })

  it('opens the create form when "New project" is clicked', async () => {
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue(listResponse()) }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    await wrapper.get('[data-testid="projects-new"]').trigger('click')

    expect((wrapper.vm as unknown as { editing: unknown }).editing).toBe('new')
  })

  it('opens the edit form with the row id when a table row edit is clicked', async () => {
    vi.doMock('../../../../app/composables/useProjects', () => ({
      useProjects: () => ({ listProjects: vi.fn().mockResolvedValue(listResponse()) }),
    }))

    const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
    const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
    await flushPromises()

    await wrapper.get('[data-testid="project-row-edit-1"]').trigger('click')

    expect((wrapper.vm as unknown as { editing: unknown }).editing).toBe(1)
  })

  // feature/form-drawer — the project form is a record-editing form launched
  // from a list, so it moves off the centred Dialog onto the shared
  // FormDrawer. The Dialog it replaces carried a documented defect: the
  // longest form in the product grew past the viewport and took its submit
  // button with it. The drawer's footer is a SIBLING of the scroll region, so
  // that is now structurally impossible rather than capped by a magic
  // max-height.
  describe('the create/edit drawer (feature/form-drawer)', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    async function mountWithProjects(
      overrides: Record<string, unknown> = {}
    ): Promise<ReturnType<typeof mount>> {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: vi.fn().mockResolvedValue(listResponse()),
          createProject: vi.fn(),
          updateProject: vi.fn(),
          ...overrides,
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, {
        attachTo: document.body,
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      return wrapper
    }

    const formInDrawer = () =>
      document.body.querySelector('[data-testid="form-drawer"] [data-testid="project-form"]')

    it('renders the form inside the drawer, not a centred dialog', async () => {
      const wrapper = await mountWithProjects()

      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      await waitFor(formInDrawer, 'the project form to mount inside the drawer')

      expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull()
      expect(formInDrawer()).not.toBeNull()

      wrapper.unmount()
    })

    it('keeps the submit control out of the scrolling region', async () => {
      const wrapper = await mountWithProjects()

      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      await waitFor(formInDrawer, 'the project form to mount inside the drawer')

      const scrollRegion = document.body.querySelector('.overflow-y-auto')
      const submit = document.body.querySelector('[data-testid="form-drawer-save"]')

      expect(submit).not.toBeNull()
      expect(scrollRegion!.contains(submit)).toBe(false)

      wrapper.unmount()
    })

    // THE regression this conversion is most likely to introduce: a drawer
    // that closes on ANY submit, successful or not, throwing away both the
    // operator's input and the 422 explaining what was wrong with it.
    it('leaves the drawer OPEN with the field error visible when the save is rejected', async () => {
      const createProject = vi.fn().mockRejectedValue(
        Object.assign(new Error('Unprocessable'), {
          status: 422,
          data: { errors: { name: ['The name has already been taken.'] } },
        })
      )
      const wrapper = await mountWithProjects({ createProject })

      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      await waitFor(formInDrawer, 'the project form to mount inside the drawer')

      const nameInput = document.body.querySelector<HTMLInputElement>(
        '[data-testid="project-form-name"]'
      )
      const slugInput = document.body.querySelector<HTMLInputElement>(
        '[data-testid="project-form-slug"]'
      )
      nameInput!.value = 'Demo'
      nameInput!.dispatchEvent(new Event('input'))
      slugInput!.value = 'demo'
      slugInput!.dispatchEvent(new Event('input'))
      // `potential`, so the submit is not also blocked by the role/competency
      // cross-field rules a `standard` project carries.
      document.body
        .querySelector<HTMLButtonElement>(
          '[data-testid="project-form-assessment-type"] button:last-child'
        )
        ?.click()
      await flushPromises()

      document.body
        .querySelector<HTMLButtonElement>('[data-testid="form-drawer-save"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(
        () => document.body.querySelector('[data-testid="project-form-name-error"]'),
        'the server field error to render on the name field'
      )

      expect(createProject).toHaveBeenCalled()
      expect(formInDrawer()).not.toBeNull()
      expect(
        document.body.querySelector('[data-testid="project-form-name-error"]')?.textContent
      ).toContain('The name has already been taken.')

      wrapper.unmount()
    })

    it('closes on the drawer footer cancel without saving', async () => {
      const createProject = vi.fn()
      const wrapper = await mountWithProjects({ createProject })

      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      await waitFor(formInDrawer, 'the project form to mount inside the drawer')

      const cancel = document.body.querySelector<HTMLButtonElement>(
        '[data-testid="form-drawer-cancel"]'
      )
      cancel!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => formInDrawer() === null, 'the drawer to close after cancel')

      expect(createProject).not.toHaveBeenCalled()
      expect((wrapper.vm as unknown as { editing: unknown }).editing).toBeNull()

      wrapper.unmount()
    })

    it('closes on Escape without saving', async () => {
      const createProject = vi.fn()
      const wrapper = await mountWithProjects({ createProject })

      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      const form = await waitFor(formInDrawer, 'the project form to mount inside the drawer')

      form.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
      await waitFor(() => formInDrawer() === null, 'the drawer to close after Escape')

      expect(createProject).not.toHaveBeenCalled()

      wrapper.unmount()
    })
  })

  describe('the create/edit dialog (task 21.5)', () => {
    // reka-ui's DialogContent teleports to `document.body` (real Teleport,
    // not stubbed) — mounted `attachTo: document.body` so the teleported
    // node is a descendant of the wrapper's own document, then queried via
    // `document.body` directly rather than `wrapper.find`, which only
    // searches the wrapper's own root subtree.
    function dialogBody(): HTMLElement {
      return document.body
    }

    // The async `ProjectForm` chunk (D10) can take real wall-clock time to
    // resolve on a cold module graph — `vi.resetModules()` in this file's
    // `beforeEach` means every test pays that cost again, and a
    // microtask-only `flushPromises()` does not wait for it. Waiting on the
    // CONDITION rather than a fixed number of timer ticks is what makes this
    // deterministic: the previous fixed ~200 ms budget was routinely exceeded
    // under a full parallel `vitest run` and this file failed intermittently.
    const projectForm = () => dialogBody().querySelector('[data-testid="project-form"]')

    const waitForFormOpen = () => waitFor(projectForm, 'the project form dialog to mount')

    const waitForFormClosed = () =>
      waitFor(() => projectForm() === null, 'the project form dialog to unmount')

    // A failed assertion mid-test would otherwise skip the trailing
    // `wrapper.unmount()`, leaving teleported Dialog content orphaned in
    // `document.body` for the NEXT test — `querySelector` then silently
    // matches that stale node instead of the new mount's. Runs regardless
    // of pass/fail.
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('renders the ProjectForm dialog once "New project" is clicked, in create mode', async () => {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: vi.fn().mockResolvedValue(listResponse()),
          createProject: vi.fn(),
          updateProject: vi.fn(),
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, {
        attachTo: document.body,
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      // The form organism is code-split (defineAsyncComponent, D10) — its own
      // dynamic import can take real wall-clock time to resolve.
      await waitForFormOpen()

      const nameInput = dialogBody().querySelector<HTMLInputElement>(
        '[data-testid="project-form-name"]'
      )
      expect(dialogBody().querySelector('[data-testid="project-form"]')).not.toBeNull()
      // Create mode: no existing project name is prefilled.
      expect(nameInput?.value).toBe('')

      wrapper.unmount()
    })

    it('renders the ProjectForm dialog pre-filled when a table row edit is clicked', async () => {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: vi.fn().mockResolvedValue(listResponse()),
          createProject: vi.fn(),
          updateProject: vi.fn(),
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, {
        attachTo: document.body,
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()

      await wrapper.get('[data-testid="project-row-edit-1"]').trigger('click')
      await waitForFormOpen()

      const nameInput = dialogBody().querySelector<HTMLInputElement>(
        '[data-testid="project-form-name"]'
      )
      expect(nameInput?.value).toBe('Demo Project')

      wrapper.unmount()
    })

    it('closes the dialog when the drawer footer cancel is activated', async () => {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: vi.fn().mockResolvedValue(listResponse()),
          createProject: vi.fn(),
          updateProject: vi.fn(),
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, {
        attachTo: document.body,
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()
      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      await waitForFormOpen()

      // The button lives inside the teleported drawer content — `wrapper.get`
      // only searches the wrapper's own (non-teleported) subtree, so this
      // interacts with the real DOM node directly, same as the assertions
      // above and below.
      dialogBody().querySelector<HTMLButtonElement>('[data-testid="form-drawer-cancel"]')?.click()
      await waitForFormClosed()

      expect((wrapper.vm as unknown as { editing: unknown }).editing).toBeNull()
      expect(dialogBody().querySelector('[data-testid="project-form"]')).toBeNull()

      wrapper.unmount()
    })

    it('closes the dialog and refetches the list when the form emits saved', async () => {
      const listProjectsMock = vi.fn().mockResolvedValue(listResponse())
      const createProjectMock = vi.fn().mockResolvedValue({ data: listResponse().data[0] })
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: listProjectsMock,
          createProject: createProjectMock,
          updateProject: vi.fn(),
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, {
        attachTo: document.body,
        global: { mocks: { $t: tMock } },
      })
      await flushPromises()
      await wrapper.get('[data-testid="projects-new"]').trigger('click')
      await waitForFormOpen()

      // Same teleport constraint as the "closes ... emits close" test above:
      // interacting with the real DOM node directly rather than `wrapper.get`.
      const nameInput = dialogBody().querySelector<HTMLInputElement>(
        '[data-testid="project-form-name"]'
      )
      const slugInput = dialogBody().querySelector<HTMLInputElement>(
        '[data-testid="project-form-slug"]'
      )
      nameInput!.value = 'New Demo'
      nameInput!.dispatchEvent(new Event('input'))
      slugInput!.value = 'new-demo'
      slugInput!.dispatchEvent(new Event('input'))
      dialogBody()
        .querySelector<HTMLButtonElement>(
          '[data-testid="project-form-assessment-type"] button:last-child'
        )
        ?.click()
      await flushPromises()
      dialogBody()
        .querySelector<HTMLFormElement>('[data-testid="project-form"]')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await waitForFormClosed()

      expect(listProjectsMock).toHaveBeenCalledTimes(2)
      expect(dialogBody().querySelector('[data-testid="project-form"]')).toBeNull()

      wrapper.unmount()
    })
  })

  describe('failed list fetch (D4 — a failure must never render as an empty result set)', () => {
    async function mountWithStatus(status: number) {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({ listProjects: vi.fn().mockRejectedValue(httpError(status)) }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()
      return wrapper
    }

    it.each([
      [403, 'errors.states.forbidden'],
      [404, 'errors.states.notFound'],
      [409, 'errors.states.notReady'],
      [500, 'errors.states.error'],
    ])('renders the %i state distinctly, never the table empty state', async (status, key) => {
      const wrapper = await mountWithStatus(status as number)

      expect(wrapper.find('[data-testid="projects-error"]').exists()).toBe(true)
      expect(wrapper.text()).toContain(`${key}.title`)
      expect(wrapper.text()).not.toContain('projects.table.empty')
    })
  })

  // bars-coverage-visibility Phase 4 (design D1) — the list surface asks
  // useBarsCoverage() (a thin cache over the same catalog endpoint the
  // picker reads) for each distinct role_code among the loaded projects,
  // and ProjectTable renders a per-row count. Never zero, never on failure.
  //
  // PROJECT-scoped, not role-scoped (fixed a real bug, caught by verify):
  // the count must be THIS project's own `competencies` intersected with
  // the role's uncovered-id set — not the role's raw uncovered count.
  // Two projects can share a role and hold different competency subsets, so
  // every fixture below builds `competencies` deliberately rather than
  // leaving it `[]` (a `[]` fixture cannot tell a per-project implementation
  // apart from a per-role one — both would happen to pass).
  describe('list-surface uncovered-competency count (Phase 4)', () => {
    // The role's coverage: STG covered, PRS and JDG uncovered. Reused by
    // every test below so the ROLE side of the computation is identical
    // across rows — only each PROJECT's own `competencies` differs.
    const MIXED_ROLE_COMPETENCIES = {
      data: [
        { id: 1, code: 'STG', name: 'Strategy', bars_available: true },
        { id: 2, code: 'PRS', name: 'Presence', bars_available: false },
        { id: 3, code: 'JDG', name: 'Judgement', bars_available: false },
      ],
    }

    function projectHolding(
      overrides: Record<string, unknown>,
      competencies: Array<{ id: number; code: string; type: string; position: number }>
    ) {
      return { ...listResponse().data[0], ...overrides, competencies }
    }

    it('shows the uncovered count on a row whose PROJECT holds an uncovered competency', async () => {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: vi.fn().mockResolvedValue({
            data: [
              projectHolding({ id: 1 }, [{ id: 2, code: 'PRS', type: 'standard', position: 0 }]),
            ],
          }),
        }),
      }))
      vi.doMock('../../../../app/composables/useFrameworkRoles', () => ({
        useFrameworkRoles: () => ({
          fetchRoleCompetencies: vi.fn().mockResolvedValue(MIXED_ROLE_COMPETENCIES),
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()
      await waitFor(
        () => wrapper.text().includes('projects.table.uncoveredCompetencies'),
        'the uncovered-competency count to render on the row'
      )

      expect(wrapper.text()).toContain('projects.table.uncoveredCompetencies')
    })

    // THE regression test: two projects share the SAME role (mixed
    // coverage), but hold DIFFERENT competency subsets. A role-scoped
    // implementation renders the identical count on both rows; only a
    // project-scoped one tells them apart.
    it('scopes the count to each PROJECT, not to the shared role — two projects, same role, different holdings', async () => {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: vi.fn().mockResolvedValue({
            data: [
              // Holds only the COVERED competency (STG) — must show nothing,
              // even though its role (FLL) has two uncovered competencies.
              projectHolding({ id: 1, slug: 'covered-project', name: 'Covered Project' }, [
                { id: 1, code: 'STG', type: 'standard', position: 0 },
              ]),
              // Holds BOTH uncovered competencies (PRS, JDG) — must show 2.
              projectHolding({ id: 2, slug: 'uncovered-project', name: 'Uncovered Project' }, [
                { id: 2, code: 'PRS', type: 'standard', position: 0 },
                { id: 3, code: 'JDG', type: 'standard', position: 1 },
              ]),
            ],
          }),
        }),
      }))
      vi.doMock('../../../../app/composables/useFrameworkRoles', () => ({
        useFrameworkRoles: () => ({
          fetchRoleCompetencies: vi.fn().mockResolvedValue(MIXED_ROLE_COMPETENCIES),
        }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()
      await waitFor(
        () => wrapper.find('[data-testid="project-row-uncovered-2"]').exists(),
        'the uncovered row (project 2) to render its count'
      )

      expect(wrapper.find('[data-testid="project-row-uncovered-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="project-row-uncovered-2"]').exists()).toBe(true)
    })

    it('shows nothing on a row whose role is fully covered', async () => {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({
          listProjects: vi.fn().mockResolvedValue({
            data: [
              projectHolding({ id: 1 }, [{ id: 1, code: 'STG', type: 'standard', position: 0 }]),
            ],
          }),
        }),
      }))
      const fetchRoleCompetenciesMock = vi.fn().mockResolvedValue({
        data: [{ id: 1, code: 'STG', name: 'Strategy', bars_available: true }],
      })
      vi.doMock('../../../../app/composables/useFrameworkRoles', () => ({
        useFrameworkRoles: () => ({ fetchRoleCompetencies: fetchRoleCompetenciesMock }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()
      await waitFor(
        () => fetchRoleCompetenciesMock.mock.calls.length > 0,
        'the coverage fetch to have been issued'
      )
      await flushPromises()

      expect(wrapper.text()).not.toContain('projects.table.uncoveredCompetencies')
    })

    it('shows nothing, never zero, when the coverage fetch fails', async () => {
      vi.doMock('../../../../app/composables/useProjects', () => ({
        useProjects: () => ({ listProjects: vi.fn().mockResolvedValue(listResponse()) }),
      }))
      const fetchRoleCompetenciesMock = vi.fn().mockRejectedValue(new Error('network error'))
      vi.doMock('../../../../app/composables/useFrameworkRoles', () => ({
        useFrameworkRoles: () => ({ fetchRoleCompetencies: fetchRoleCompetenciesMock }),
      }))

      const IndexPage = (await import('../../../../app/pages/projects/index.vue')).default
      const wrapper = mount(IndexPage, { global: { mocks: { $t: tMock } } })
      await flushPromises()
      await waitFor(
        () => fetchRoleCompetenciesMock.mock.calls.length > 0,
        'the coverage fetch to have been issued'
      )
      await flushPromises()

      expect(wrapper.text()).not.toContain('projects.table.uncoveredCompetencies')
    })
  })
})
