<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-foreground">{{ $t('platformTemplates.title') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ $t('platformTemplates.intro') }}
        </p>
      </div>
      <!--
        No acting-client notice and no disabled state: a platform template
        belongs to no organization, so creating one never needs a client
        selected (the routes carry no `org.context`).
      -->
      <button
        type="button"
        data-testid="platform-template-new"
        :class="[buttonClass, 'shrink-0 px-4 py-2 font-medium']"
        @click="startCreate"
      >
        {{ $t('platformTemplates.action.new') }}
      </button>
    </div>

    <Alert v-if="loadError" variant="destructive" data-testid="platform-templates-load-error">
      <AlertTitle>{{ $t('platformTemplates.error.loadTitle') }}</AlertTitle>
      <AlertDescription>{{ $t('platformTemplates.error.loadBody') }}</AlertDescription>
    </Alert>

    <!-- A refusal in words, never a generic error (DESIGN.md §16.17). -->
    <Alert v-if="failure !== null" variant="destructive" data-testid="platform-template-error">
      <AlertTitle>{{ $t('platformTemplates.error.title') }}</AlertTitle>
      <AlertDescription>{{ failure }}</AlertDescription>
    </Alert>

    <Alert v-if="warning" variant="warning" data-testid="platform-template-warning">
      <AlertTitle>{{ $t('avatar_templates.warning.title') }}</AlertTitle>
      <AlertDescription>{{ warningMessage }}</AlertDescription>
    </Alert>

    <p
      v-if="notice !== null"
      role="status"
      data-testid="platform-template-notice"
      class="text-sm text-muted-foreground"
    >
      {{ notice }}
    </p>

    <p
      v-if="!loadError && templates.length === 0"
      data-testid="platform-templates-empty"
      class="text-sm text-muted-foreground"
    >
      {{ $t('platformTemplates.empty') }}
    </p>

    <ul v-else-if="!loadError" class="flex flex-col gap-3" data-testid="platform-templates-list">
      <li
        v-for="row in templates"
        :key="row.id"
        :data-testid="`platform-template-row-${row.id}`"
        class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4 hover:bg-primary/10"
      >
        <div class="min-w-0">
          <p class="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {{ row.name }}
            <PlatformTemplateBadge>{{ $t('platformTemplates.badge') }}</PlatformTemplateBadge>
            <span
              :data-testid="`platform-template-state-${row.id}`"
              class="rounded border border-border px-2 py-0.5 text-xs"
            >
              {{
                $t(
                  row.is_active
                    ? 'platformTemplates.state.offered'
                    : 'platformTemplates.state.retired'
                )
              }}
            </span>
          </p>
          <p v-if="row.description" class="text-sm text-muted-foreground">{{ row.description }}</p>
          <p class="text-sm text-muted-foreground">
            {{ $t(`avatar_templates.provider.${row.provider}`) }} ·
            <span :data-testid="`platform-template-usage-${row.id}`">{{ usageText(row) }}</span>
          </p>
          <!-- Two independent provider syncs; either one failing is visible on its row. -->
          <p
            v-if="row.llm_sync_status === 'failed'"
            role="status"
            :data-testid="`platform-template-llm-sync-failed-${row.id}`"
            class="mt-1 text-sm text-warning-dark dark:text-warning"
          >
            {{ $t('platformTemplates.llmSyncFailed') }}
          </p>
          <PalSyncStatus class="mt-2" :sync="row.pal_sync" :provider="row.provider" />
        </div>

        <div class="flex shrink-0 flex-wrap items-start gap-2">
          <button
            type="button"
            :data-testid="`platform-template-edit-${row.id}`"
            :class="buttonClass"
            @click="startEdit(row)"
          >
            {{ $t('platformTemplates.action.edit') }}
          </button>
          <!-- Adjacent on purpose: `v-else` binds to the immediately preceding sibling. -->
          <button
            v-if="!row.is_active"
            type="button"
            :data-testid="`platform-template-offer-${row.id}`"
            :class="buttonClass"
            :disabled="busy"
            @click="onOffer(row)"
          >
            {{ $t('platformTemplates.action.offer') }}
          </button>
          <button
            v-else
            type="button"
            :data-testid="`platform-template-retire-${row.id}`"
            :class="buttonClass"
            :disabled="busy"
            @click="onRetire(row)"
          >
            {{ $t('platformTemplates.action.retire') }}
          </button>
          <button
            type="button"
            :data-testid="`platform-template-copy-${row.id}`"
            :class="buttonClass"
            @click="copyTarget = row"
          >
            {{ $t('platformTemplates.action.copy') }}
          </button>
          <div class="flex flex-col items-end gap-1">
            <button
              type="button"
              :data-testid="`platform-template-delete-${row.id}`"
              :class="[buttonClass, 'disabled:cursor-not-allowed disabled:opacity-50']"
              :disabled="isInUse(row)"
              :aria-describedby="
                isInUse(row) ? `platform-template-delete-reason-${row.id}` : undefined
              "
              @click="impact = { action: 'delete', template: row }"
            >
              {{ $t('platformTemplates.action.delete') }}
            </button>
            <p
              v-if="isInUse(row)"
              :id="`platform-template-delete-reason-${row.id}`"
              :data-testid="`platform-template-delete-reason-${row.id}`"
              class="max-w-56 text-right text-xs text-muted-foreground"
            >
              {{ $t('platformTemplates.deleteBlocked', usageParams(row)) }}
            </p>
          </div>
        </div>
      </li>
    </ul>

    <FormDrawer
      :open="editing !== null"
      :title="formTitle"
      form-id="template-form"
      :pending="saving || busy"
      @update:open="(open) => !open && (editing = null)"
    >
      <AvatarTemplateForm
        v-if="editing !== null"
        :template="editing"
        :field-specs="fieldSpecs"
        :saving="saving || busy"
        :submit-error="submitError"
        data-testid="template-form"
        @submit="onSubmit"
      />
    </FormDrawer>

    <!-- Copies land in OTHER organizations, so nothing on this page changes. -->
    <CopyTemplateDialog
      scope="platform"
      :open="copyTarget !== null"
      :template="copyTarget"
      @update:open="(open) => !open && (copyTarget = null)"
    />

    <GlobalTemplateImpactDialog
      v-if="impact !== null"
      :open="true"
      :action="impact.action"
      :name="impact.template.name"
      :usage="impact.template.usage"
      @confirm="onImpactConfirmed"
      @cancel="impact = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Platform templates — the superadmin's control over the avatar templates BEAI
 * offers to every organization (global-avatar-templates, slice B2).
 *
 * Gated by `03.abilities.global.ts` (`avatarTemplates.manageGlobal`); the
 * server's 403 is the real access control. A separate route root, not a child
 * of `/avatar-templates`, whose guard admits org admins.
 *
 * A platform template is read LIVE by every project that pins it, so the three
 * consequential actions — saving an edit, retiring, deleting — go through the
 * usage warning when the template is in use, and nothing is sent until the
 * superadmin confirms. The list is reloaded after every write rather than
 * patched: usage counts are the server's, and a guess about them is a guess
 * about how many organizations an edit reaches.
 */
import { computed, onMounted, ref } from 'vue'
import PlatformTemplateBadge from '@/components/atoms/PlatformTemplateBadge.vue'
import GlobalTemplateImpactDialog from '@/components/molecules/GlobalTemplateImpactDialog.vue'
import PalSyncStatus from '@/components/molecules/PalSyncStatus.vue'
import AvatarTemplateForm from '@/components/organisms/AvatarTemplateForm.vue'
import CopyTemplateDialog from '@/components/organisms/CopyTemplateDialog.vue'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  PlatformTemplateActiveError,
  PlatformTemplateInUseError,
  usePlatformAvatarTemplates,
} from '@/composables/usePlatformAvatarTemplates'
import type {
  AvatarTemplate,
  FieldSpec,
  PlatformTemplate,
  ProviderName,
} from '@/types/avatar-template'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { serverMessageCode } from '@/utils/http-error'
import { translateServerCode } from '@/utils/server-message'

definePageMeta({ name: 'platform-templates' })

const { t, te } = useI18n()

useHead({
  title: () => t('platformTemplates.title'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

// Primary-family hover and a focus ring on every control (DESIGN.md §16.17).
const buttonClass =
  'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

const { list, create, update, activate, deactivate, remove, fetchFieldSpecs } =
  usePlatformAvatarTemplates()

const templates = ref<PlatformTemplate[]>([])
const fieldSpecs = ref<Record<ProviderName, FieldSpec[]>>({ heygen: [], tavus: [] })
const loadError = ref(false)
const failure = ref<string | null>(null)
const notice = ref<string | null>(null)
const warning = ref<string | null>(null)
const saving = ref(false)
// The raw rejection, handed to the form verbatim: it owns per-field placement.
const submitError = ref<unknown | null>(null)

const copyTarget = ref<PlatformTemplate | null>(null)

/** null = closed; an object with no id = creating. */
const editing = ref<Partial<AvatarTemplate> | null>(null)

/**
 * The action awaiting the usage warning. `payload` is the edit held back until
 * the superadmin confirms; the form stays open behind the dialog so a cancel
 * keeps every value they typed.
 */
const impact = ref<{
  action: 'edit' | 'retire' | 'delete'
  template: PlatformTemplate
  payload?: Partial<AvatarTemplate>
} | null>(null)

const formTitle = computed(() =>
  editing.value?.id === undefined
    ? t('avatar_templates.form.new_title')
    : t('avatar_templates.form.edit_title')
)

const warningMessage = computed(() => {
  const key = `avatar_templates.warning.${warning.value}`

  return warning.value !== null && te(key) ? t(key) : t('avatar_templates.warning.generic')
})

const isInUse = (row: PlatformTemplate): boolean => row.usage.project_count > 0
const usageParams = (row: PlatformTemplate) => ({
  organizations: row.usage.organization_count,
  projects: row.usage.project_count,
})
const usageText = (row: PlatformTemplate): string => t('platformTemplates.usage', usageParams(row))

const busy = ref(false)

async function load(): Promise<void> {
  try {
    const [rows, specs] = await Promise.all([list(), fetchFieldSpecs()])
    templates.value = rows.data
    fieldSpecs.value = specs.data
    loadError.value = false
  } catch {
    loadError.value = true
  }
}

onMounted(load)

function startCreate(): void {
  submitError.value = null
  editing.value = { name: '', description: '', provider: 'heygen', config: {} }
}

function startEdit(row: PlatformTemplate): void {
  submitError.value = null
  // A copy, so abandoning the form leaves the list untouched.
  editing.value = { ...row, config: { ...row.config } } as Partial<AvatarTemplate>
}

/** What a failed action MEANS, in the operator's language. */
function describeFailure(error: unknown): string {
  if (error instanceof PlatformTemplateInUseError) {
    return `${t('platformTemplates.serverError.template_in_use')} ${t(
      'platformTemplates.error.stillUsed',
      {
        organizations: error.organizationCount,
        projects: error.projectCount,
      }
    )}`
  }
  if (error instanceof PlatformTemplateActiveError) {
    return t('platformTemplates.serverError.template_active')
  }

  const code = serverMessageCode(error)

  return code === null
    ? t(resourceErrorKey(resolveResourceErrorState(error), 'message'))
    : translateServerCode({ t, te }, 'platformTemplates.serverError', code)
}

/** Runs one write, then reloads; the failure and the notice are mutually exclusive. */
async function perform(
  run: () => Promise<{ warning?: string } | undefined>,
  noticeKey: string,
  name: string
): Promise<boolean> {
  // One write at a time: a second click while one is in flight would repeat it.
  if (busy.value) return false
  busy.value = true
  failure.value = null
  notice.value = null
  warning.value = null

  try {
    const response = await run()
    warning.value = response?.warning ?? null
    notice.value = t(noticeKey, { name })

    return true
  } catch (error) {
    failure.value = describeFailure(error)

    return false
  } finally {
    await load()
    busy.value = false
  }
}

async function send(payload: Partial<AvatarTemplate>): Promise<void> {
  // Same gate as perform(): a save must not overlap another row write, and
  // while it runs Offer / Retire / Delete are disabled through `busy`.
  if (busy.value) return
  busy.value = true
  saving.value = true
  submitError.value = null
  notice.value = null
  warning.value = null

  try {
    const name = payload.name ?? ''
    const config = payload.config ?? {}
    const binding = {
      llm_model_id: payload.llm_model_id ?? null,
      llm_credential_id: payload.llm_credential_id ?? null,
    }
    const response = payload.id
      ? await update(payload.id, {
          name: payload.name,
          description: payload.description ?? null,
          config,
          ...binding,
        })
      : await create({
          name,
          description: payload.description ?? null,
          provider: (payload.provider ?? 'heygen') as ProviderName,
          config,
          ...binding,
        })

    warning.value = response.warning ?? null
    notice.value = t('platformTemplates.notice.saved', { name })
    failure.value = null
    editing.value = null
    await load()
  } catch (error) {
    submitError.value = error
  } finally {
    saving.value = false
    busy.value = false
  }
}

function onSubmit(payload: Partial<AvatarTemplate>): void {
  const row = templates.value.find((candidate) => candidate.id === payload.id)

  // An edit of something in use is held for the warning; everything else goes.
  if (row !== undefined && isInUse(row)) {
    impact.value = { action: 'edit', template: row, payload }

    return
  }

  void send(payload)
}

const onOffer = (row: PlatformTemplate) =>
  perform(() => activate(row.id), 'platformTemplates.notice.offered', row.name)

function onRetire(row: PlatformTemplate): void {
  if (isInUse(row)) {
    impact.value = { action: 'retire', template: row }

    return
  }

  void perform(() => deactivate(row.id), 'platformTemplates.notice.retired', row.name)
}

/** Read into locals and cleared FIRST, then acted on (the ConfirmDialog contract). */
async function onImpactConfirmed(): Promise<void> {
  const pending = impact.value
  impact.value = null
  if (pending === null) return

  if (pending.action === 'edit' && pending.payload !== undefined) {
    await send(pending.payload)
  } else if (pending.action === 'retire') {
    await perform(
      () => deactivate(pending.template.id),
      'platformTemplates.notice.retired',
      pending.template.name
    )
  } else if (pending.action === 'delete') {
    await perform(
      async () => {
        await remove(pending.template.id)

        return undefined
      },
      'platformTemplates.notice.deleted',
      pending.template.name
    )
  }
}
</script>
