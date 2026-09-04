<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-foreground">{{ $t('avatar_templates.title') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ $t('avatar_templates.intro') }}
        </p>
        <!--
          One glossary trigger for the whole list rather than one per row: the
          term is the same on every row, and N focusable triggers would put N
          copies of one definition in the tab order. Same idiom as the report
          grid's glossary row (DESIGN.md §8.3).
        -->
        <p
          class="mt-2 flex max-w-2xl flex-wrap items-baseline gap-x-1.5 text-sm text-muted-foreground"
        >
          <span>{{ $t('avatar_templates.llmForecastIntro') }}</span>
          <HelpTip term="llmCost" />
        </p>
      </div>
      <TemplatePortability :is-admin="canCreate" @imported="load" />
      <button
        v-if="canCreate"
        type="button"
        data-testid="template-new"
        class="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium"
        @click="startCreate"
      >
        {{ $t('avatar_templates.action.new') }}
      </button>
    </div>

    <Alert v-if="loadError" variant="destructive" data-testid="templates-error">
      <AlertTitle>{{ $t('avatar_templates.error.load_title') }}</AlertTitle>
      <AlertDescription>{{ $t('avatar_templates.error.load_body') }}</AlertDescription>
    </Alert>

    <!--
      A failed write, in its OWN alert with its OWN copy. The load message
      ("Could not load templates… check that you hold the administrator role")
      was being shown for a failed write, which is the wrong sentence even in
      the tick before it was wiped.
    -->
    <Alert
      v-if="writeError || writeErrorCode"
      variant="destructive"
      data-testid="template-write-error"
    >
      <AlertTitle>{{ $t('avatar_templates.error.write_title') }}</AlertTitle>
      <AlertDescription>
        {{ writeErrorMessage }}
        <span v-if="writeErrorCount !== null" data-testid="template-write-error-count">
          {{ $t('avatar_templates.error.projectCount', { count: writeErrorCount }) }}
        </span>
      </AlertDescription>
    </Alert>

    <Alert v-if="warning" variant="warning" data-testid="template-warning">
      <AlertTitle>{{ $t('avatar_templates.warning.title') }}</AlertTitle>
      <!--
        The save SUCCEEDED. This says a persona-level knob has not reached the
        provider yet, which an operator must be told: without it they would
        believe a setting they configured is live when it is not.
      -->
      <AlertDescription>{{ $t(`avatar_templates.warning.${warning}`) }}</AlertDescription>
    </Alert>

    <p
      v-if="!loadError && templates.length === 0"
      data-testid="templates-empty"
      class="text-sm text-muted-foreground"
    >
      {{ $t('avatar_templates.empty') }}
    </p>

    <ul v-else class="flex flex-col gap-3" data-testid="templates-list">
      <li
        v-for="template in templates"
        :key="template.id"
        class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4"
        :data-active="template.is_active ? 'true' : 'false'"
      >
        <div class="min-w-0">
          <p class="font-medium text-foreground">
            {{ template.name }}
            <span
              v-if="template.is_active"
              data-testid="template-active-badge"
              class="ml-2 rounded bg-foreground px-2 py-0.5 text-xs text-background"
            >
              {{ $t('avatar_templates.active') }}
            </span>
          </p>
          <p v-if="template.description" class="text-sm text-muted-foreground">
            {{ template.description }}
          </p>
          <!--
            A TOTAL for one reference interview, never a per-minute rate: the
            model is re-sent the whole conversation on every turn, so input
            tokens grow quadratically in turn count and a rate misstates cost
            at any other length. The reference shape travels with the number,
            because a total only means something alongside the interview it is
            a total for.

            Only the language model is priced here. Avatar minutes are a
            different vendor on a different meter and are shown on the session
            review, never summed with this — the refusal ratified at
            `api/app/Services/Proctoring/SessionCostEstimator.php:20-22`.
          -->
          <p
            class="mt-1 text-sm text-muted-foreground"
            :data-testid="`template-llm-forecast-${template.id}`"
          >
            {{ forecastLabel(template) }}
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <button
            v-if="canUpdate"
            type="button"
            :data-testid="`template-edit-${template.id}`"
            class="rounded-md border border-border px-3 py-1.5 text-sm"
            @click="startEdit(template)"
          >
            {{ $t('avatar_templates.action.edit') }}
          </button>
          <!--
            Activate / deactivate, and the two must stay ADJACENT: `v-else`
            requires the immediately preceding sibling to carry the `v-if`, so a
            comment placed between them silently breaks the pair and neither
            branch renders. This comment sits above both for that reason.

            Deactivation needs no confirmation dialog, unlike activation.
            Activating swaps which template every NEW project defaults to and is
            the change worth pausing over; withdrawing one only removes it from
            that choice. Nothing live moves — the projects pinning it keep
            running on it — and the action is one click to undo.
          -->
          <!--
            The ability wraps the PAIR rather than each branch: `v-else` binds
            to the immediately preceding sibling, so `v-if="canActivate && …"`
            on the first and a bare `v-else` on the second would leave the
            second rendering for someone who may not activate — the exact
            silent-permissive failure this sweep exists to remove. One
            `<template v-if>` around both keeps the branches adjacent.

            One ability for both directions, deliberately: activate and
            deactivate are the same write to `is_active`, and
            `AvatarTemplatePolicy::activate` is the single gate on it.
          -->
          <template v-if="canActivate">
            <button
              v-if="!template.is_active"
              type="button"
              :data-testid="`template-activate-${template.id}`"
              class="rounded-md border border-border px-3 py-1.5 text-sm"
              @click="activateTarget = template"
            >
              {{ $t('avatar_templates.action.activate') }}
            </button>
            <button
              v-else
              type="button"
              :data-testid="`template-deactivate-${template.id}`"
              class="rounded-md border border-border px-3 py-1.5 text-sm"
              @click="onDeactivate(template)"
            >
              {{ $t('avatar_templates.action.deactivate') }}
            </button>
          </template>
          <!--
            No delete button on the active template at all. The API answers 409,
            but offering a control whose only outcome is an error is a worse
            experience than not offering it — and this one reads as destructive,
            so an operator would hesitate over it before finding out.
          -->
          <button
            v-if="canDelete && !template.is_active"
            type="button"
            :data-testid="`template-delete-${template.id}`"
            class="rounded-md border border-border px-3 py-1.5 text-sm"
            @click="deleteTarget = template"
          >
            {{ $t('avatar_templates.action.delete') }}
          </button>
        </div>
      </li>
    </ul>

    <!--
      Right-side drawer, not a sibling below the list (feature/form-drawer):
      the form has up to 15 generated fields plus 3 static ones plus the LLM
      binding section, and FormDrawer's own height cap + internal scroll is
      what keeps its footer actions reachable — the defect the project form's
      old centred Dialog carried, which this one form is longer than. Every
      CRUD form in the backoffice now goes through this same wrapper.
    -->
    <FormDrawer
      :open="editing !== null"
      :title="formTitle"
      form-id="template-form"
      :pending="saving"
      @update:open="(open) => !open && (editing = null)"
    >
      <AvatarTemplateForm
        v-if="editing !== null"
        :template="editing"
        :field-specs="fieldSpecs"
        :saving="saving"
        :submit-error="submitError"
        data-testid="template-form"
        @submit="save"
      />
    </FormDrawer>

    <!--
      Activation's blast radius: the server atomically swaps the org's single
      active template, so one unconfirmed click changes the face and voice
      every candidate meets. The description names what gets replaced —
      "activate X" is not the consequence; "X replaces Y" is (design.md D5,
      admin-backoffice spec).
    -->
    <ConfirmDialog
      :open="activateTarget !== null"
      :title="$t('avatar_templates.confirm.activateTitle')"
      :description="activateDescription"
      :confirm-label="$t('avatar_templates.action.activate')"
      @confirm="onActivateConfirmed"
      @cancel="activateTarget = null"
    />

    <ConfirmDialog
      :open="deleteTarget !== null"
      :title="$t('avatar_templates.confirm.deleteTitle')"
      :description="$t('avatar_templates.confirm.deleteDescription')"
      :confirm-label="$t('avatar_templates.action.delete')"
      variant="destructive"
      @confirm="onDeleteConfirmed"
      @cancel="deleteTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
import HelpTip from '@/components/atoms/HelpTip.vue'
import TemplatePortability from '@/components/organisms/TemplatePortability.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
/**
 * Avatar templates — the operator's control over the face and voice every
 * candidate of this organization meets (C14 PR6).
 *
 * Exactly one template is active at a time, enforced by a partial unique index
 * in the database rather than by this page. Activation is therefore a swap the
 * server performs atomically; the UI reloads the list afterwards rather than
 * patching its own copy, because a client-side guess about which row is now
 * active is a guess about what candidates are seeing.
 */
import { computed, onMounted, ref } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import AvatarTemplateForm from '@/components/organisms/AvatarTemplateForm.vue'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'
import { serverMessageCode } from '@/utils/http-error'
import { translateServerCode } from '@/utils/server-message'
import { formatUsdAmount } from '@/utils/format'
import type { AvatarTemplate, FieldSpec, ProviderName } from '@/types/avatar-template'

definePageMeta({ name: 'avatar-templates' })

const { t, te, locale } = useI18n()

/**
 * What one typical interview on this template costs in conversation-LLM
 * tokens, as the API forecast it.
 *
 * `null` means the template has no usable model binding — no model, or a model
 * the price list no longer carries. That reads as "cannot be forecast", never
 * as a forecast of zero: zero is a price, and this template has none.
 */
function forecastLabel(template: AvatarTemplate): string {
  const forecast = template.llm?.estimated_cost_usd_per_interview

  if (!forecast) return t('avatar_templates.llmForecastUnavailable')

  return t('avatar_templates.llmForecast', {
    amount: formatUsdAmount(forecast.usd, locale.value),
    minutes: forecast.minutes,
    turns: forecast.turns,
  })
}

useHead({
  title: () => t('avatar_templates.title'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const {
  listTemplates,
  fetchFieldSpecs,
  createTemplate,
  updateTemplate,
  activateTemplate,
  deactivateTemplate,
  deleteTemplate,
} = useAvatarTemplates()

const templates = ref<AvatarTemplate[]>([])
const fieldSpecs = ref<Record<ProviderName, FieldSpec[]>>({ heygen: [], tavus: [] })
const loadError = ref(false)

/**
 * A failed WRITE, kept separate from a failed read.
 *
 * Activate, deactivate and delete all used to set `loadError` and then call
 * `load()`, which sets it back to false the moment the listing succeeds. The
 * flag was raised and wiped within the same tick, so the operator clicked, the
 * API refused, and the screen showed a list that looked exactly as before —
 * no error, no change, no explanation.
 *
 * Not academic since the 2026-09-02 ruling: activate and delete are now
 * platform-only, so 403 is the ORDINARY answer for an admin, and deleting a
 * pinned template answers 409. Both landed in the same bare catch.
 *
 * `load()` owns `loadError`; a write owns this. Resolved through
 * `resolveResourceErrorState` like every other surface, so 403, 404, 409 and a
 * dead network read as themselves rather than as one boolean.
 */
const writeError = ref<ResourceErrorState | null>(null)

/**
 * The server's own explanation, when it gave one.
 *
 * A 409 from this endpoint is NOT the "not ready yet, reopen later" that
 * `resolveResourceErrorState` maps it to — the API answers
 * `{"error": "template_in_use", "project_count": 7}`, meaning seven projects
 * pin this template and someone has to reassign them. Rendering that as
 * "processing will finish shortly" is not a vague message, it is a confidently
 * wrong one, and it discards the count the server computed precisely so the
 * operator would know how much work they are signing up for.
 *
 * Same shape `participants/[id].vue` already uses for the same class of
 * response: prefer the machine code when there is one, fall back to the HTTP
 * state when there is not.
 */
const writeErrorCode = ref<string | null>(null)
const writeErrorCount = ref<number | null>(null)

const writeErrorMessage = computed(() => {
  if (writeErrorCode.value !== null) {
    return translateServerCode({ t, te }, 'avatar_templates.serverError', writeErrorCode.value)
  }

  return writeError.value === null ? null : t(resourceErrorKey(writeError.value, 'message'))
})
const warning = ref<string | null>(null)
const saving = ref(false)
// The raw rejection, passed down VERBATIM (form-clarity-and-console-warnings,
// D3) — the form runs `applyServerFieldErrors` and its own "knob: code"
// parser on it. This page previously hand-rolled `extractConfigErrors`,
// duplicating what the form now owns and flattening away the field
// association in the process.
const submitError = ref<unknown | null>(null)

/** null = closed; an object with no id = creating. */
const editing = ref<Partial<AvatarTemplate> | null>(null)

// FormDrawer's own title, not AvatarTemplateForm's — the form is layout-only
// now (feature/form-drawer) and no longer renders a heading of its own.
const formTitle = computed(() =>
  editing.value?.id === undefined
    ? t('avatar_templates.form.new_title')
    : t('avatar_templates.form.edit_title')
)

// Confirmation call-site contract (design.md D4): a single nullable ref per
// dialog, `:open` derived from it, `@cancel` clears it and nothing else,
// `@confirm` reads it into a local, clears the ref FIRST, then acts.
const activateTarget = ref<AvatarTemplate | null>(null)
const deleteTarget = ref<AvatarTemplate | null>(null)

// Names the template being replaced — "activate X" is not the consequence,
// "X replaces Y for every candidate in your organization" is (design.md D5).
const activateDescription = computed(() => {
  if (activateTarget.value === null) return ''
  const current = templates.value.find((candidate) => candidate.is_active)

  return current
    ? t('avatar_templates.confirm.activateDescription', {
        name: activateTarget.value.name,
        current: current.name,
      })
    : t('avatar_templates.confirm.activateDescriptionNoPrevious', {
        name: activateTarget.value.name,
      })
})

async function load(): Promise<void> {
  try {
    const [list, specs] = await Promise.all([listTemplates(), fetchFieldSpecs()])
    templates.value = list.data
    fieldSpecs.value = specs.data
    loadError.value = false
  } catch {
    loadError.value = true
  }
}

// Resolved by the server's policies, not by reading a role name here: a
// `roles.includes('admin')` check is a second copy of an authorization rule
// written in a second language, and the copy drifts the moment the policy
// changes. `can()` fails closed, so a transient `/auth/me` error hides the
// import/export controls rather than offering ones that come back 403.
// Affordance only — the endpoints enforce.
// One computed per ability rather than one `isAdmin` reused for all of them.
// The page had exactly that, and it was wrong in both directions the day
// managing templates became platform-only (2026-09-02): `create` no longer
// implies `update`, and reading the list — which an ADMIN may still do — is
// not an ability the row controls should ever have been inferring from.
const { can } = useCurrentUser()
const canCreate = computed(() => can('avatarTemplates.create'))
const canUpdate = computed(() => can('avatarTemplates.update'))
const canActivate = computed(() => can('avatarTemplates.activate'))
const canDelete = computed(() => can('avatarTemplates.delete'))

onMounted(async () => {
  await load()

  // Fills the shared identity cache `can()` reads. Swallowed: `can()` already
  // answers false without it.
  await useCurrentUser()
    .ensureLoaded()
    .catch(() => undefined)
})

function startCreate(): void {
  submitError.value = null
  warning.value = null
  editing.value = { name: '', description: '', provider: 'heygen', config: {} }
}

function startEdit(template: AvatarTemplate): void {
  submitError.value = null
  warning.value = null
  // A copy, so abandoning the form leaves the list untouched.
  editing.value = { ...template, config: { ...template.config } }
}

async function save(payload: Partial<AvatarTemplate>): Promise<void> {
  saving.value = true
  submitError.value = null

  try {
    const response = payload.id
      ? await updateTemplate(payload.id, {
          name: payload.name,
          description: payload.description ?? null,
          config: payload.config ?? {},
          llm_model_id: payload.llm_model_id ?? null,
          llm_credential_id: payload.llm_credential_id ?? null,
        })
      : await createTemplate({
          name: payload.name ?? '',
          description: payload.description ?? null,
          provider: (payload.provider ?? 'heygen') as ProviderName,
          config: payload.config ?? {},
          llm_model_id: payload.llm_model_id ?? null,
          llm_credential_id: payload.llm_credential_id ?? null,
        })

    warning.value = response.warning ?? null
    editing.value = null
    await load()
  } catch (error) {
    // The API returns every config problem at once, keyed by field. Surfacing
    // one at a time would turn a seventeen-field form into a guessing game —
    // the form itself now owns turning this into per-field placement.
    submitError.value = error
  } finally {
    saving.value = false
  }
}

/**
 * One place that decides what a failed write MEANS.
 *
 * The machine code wins when the server sent one, because it says what
 * actually happened; the HTTP state is the fallback for a network fault or an
 * endpoint that answered nothing useful.
 */
function recordWriteFailure(error: unknown): void {
  writeErrorCode.value = serverMessageCode(error)
  writeError.value = writeErrorCode.value === null ? resolveResourceErrorState(error) : null

  const data = (error as { data?: { project_count?: unknown } } | null)?.data
  writeErrorCount.value = typeof data?.project_count === 'number' ? data.project_count : null
}

function clearWriteFailure(): void {
  writeError.value = null
  writeErrorCode.value = null
  writeErrorCount.value = null
}

async function onActivateConfirmed(): Promise<void> {
  clearWriteFailure()

  if (activateTarget.value === null) return
  const template = activateTarget.value
  activateTarget.value = null

  warning.value = null

  try {
    const response = await activateTemplate(template.id)
    warning.value = response.warning ?? null
  } catch (error) {
    recordWriteFailure(error)
  }

  // Reloaded rather than patched locally: the server deactivates the previous
  // template in the same transaction, and guessing which row that was is a
  // guess about what candidates see next.
  await load()
}

/**
 * Withdraw a template from the default choice, without deleting it.
 *
 * No confirmation dialog, deliberately. Activation gets one because it changes
 * which template every new project starts from; this only removes one from that
 * list. Nothing running moves — projects pin their own template and keep it —
 * and reactivating is one click.
 */
async function onDeactivate(template: AvatarTemplate): Promise<void> {
  warning.value = null
  clearWriteFailure()

  try {
    const response = await deactivateTemplate(template.id)
    warning.value = response.warning ?? null
  } catch (error) {
    recordWriteFailure(error)
  }

  await load()
}

async function onDeleteConfirmed(): Promise<void> {
  clearWriteFailure()

  if (deleteTarget.value === null) return
  const template = deleteTarget.value
  deleteTarget.value = null

  try {
    await deleteTemplate(template.id)
  } catch (error) {
    recordWriteFailure(error)
  }

  await load()
}
</script>
