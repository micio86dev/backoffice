# Plan: extract ProjectForm.vue's field validators into useProjectFormValidation

**Why:** `app/components/organisms/ProjectForm.vue` was 1285 lines. Of that, 9
field-level `validate*` functions plus their shared `errors` ref and two
message-key helpers (`missingKey`/`rangeKey`) were self-contained logic with
no dependency on the rest of the component beyond the field refs themselves —
a clean single-responsibility boundary.

**What moved:** `validateName`, `validateSlug`, `validateRoleCode`,
`validatePauseEveryNCompetencies`, `validateNudgeMinChars`,
`validateExitRedirectUrl`, `validateWebhookUrl`, `validateAvatarTemplate`,
`validateFrameworkVersion`, the `errors` ref, `missingKey`/`rangeKey` → new
`app/composables/useProjectFormValidation.ts`.

**What stayed:** the three async load-orchestration blocks (framework
versions, avatar templates, competency options) — re-read during this task,
they're entangled with `onMounted`, cross-field watchers (`roleCode` /
`assessmentType` / `frameworkVersionId` triggering a competency reload), and
default-selection logic specific to this component's lifecycle. Consolidating
them would have meant either leaking that entanglement into a new composable's
public interface or changing behaviour to hide it — out of scope for a
zero-behaviour-change extraction. Scoped down to the validation extraction
only, as the task brief explicitly allowed.

**Interface:** `useProjectFormValidation(fields)` takes the field refs
(`name`, `slug`, `roleCode`, `assessmentType`, `pauseEveryNCompetencies`,
`nudgeMinChars`, `exitRedirectUrl`, `webhookUrl`, `avatarTemplateId`,
`frameworkVersionId`, `isEditing`) and returns `{ errors, validateName, … }` —
same shape the template already binds to (`errors.name`, `@blur="validateName"`,
etc.), so the template needed zero changes.

**Verification:** RED (new composable test, `import` fails) → GREEN (23/23
new tests) → wired into the component → typecheck clean → eslint clean →
existing `ProjectForm.spec.ts` (78 tests) unchanged, still green → full repo
suite run in single-fork mode (memory-constrained sandbox, several sibling
agents running concurrent test suites on the same 8GB machine) — 2591/2593
passed, the one failure (`catalogue/index.spec.ts`) confirmed pre-existing
and unrelated (passes 24/24 in isolation, zero diff on that file/component
from `develop`), 15 unhandled-rejection warnings in unrelated files
(`RoleCompetenciesForm.spec.ts`, `input-group-addon.spec.ts`) attributable to
single-fork-mode teardown races under memory pressure, not this change.
