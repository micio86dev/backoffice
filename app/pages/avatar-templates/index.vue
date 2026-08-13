<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-foreground">{{ $t('avatar_templates.title') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ $t('avatar_templates.intro') }}
        </p>
      </div>
      <TemplatePortability :is-admin="isAdmin" @imported="load" />
      <button
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

    <Alert v-if="warning" data-testid="template-warning">
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
        </div>

        <div class="flex shrink-0 gap-2">
          <button
            type="button"
            :data-testid="`template-edit-${template.id}`"
            class="rounded-md border border-border px-3 py-1.5 text-sm"
            @click="startEdit(template)"
          >
            {{ $t('avatar_templates.action.edit') }}
          </button>
          <button
            v-if="!template.is_active"
            type="button"
            :data-testid="`template-activate-${template.id}`"
            class="rounded-md border border-border px-3 py-1.5 text-sm"
            @click="activate(template)"
          >
            {{ $t('avatar_templates.action.activate') }}
          </button>
          <!--
            No delete button on the active template at all. The API answers 409,
            but offering a control whose only outcome is an error is a worse
            experience than not offering it — and this one reads as destructive,
            so an operator would hesitate over it before finding out.
          -->
          <button
            v-if="!template.is_active"
            type="button"
            :data-testid="`template-delete-${template.id}`"
            class="rounded-md border border-border px-3 py-1.5 text-sm"
            @click="remove(template)"
          >
            {{ $t('avatar_templates.action.delete') }}
          </button>
        </div>
      </li>
    </ul>

    <AvatarTemplateForm
      v-if="editing !== null"
      :template="editing"
      :field-specs="fieldSpecs"
      :saving="saving"
      :errors="formErrors"
      data-testid="template-form"
      @cancel="editing = null"
      @submit="save"
    />
  </div>
</template>

<script setup lang="ts">
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
import { onMounted, ref } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import AvatarTemplateForm from '@/components/organisms/AvatarTemplateForm.vue'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'
import type { AvatarTemplate, FieldSpec, ProviderName } from '@/types/avatar-template'

definePageMeta({ name: 'avatar-templates' })

const { t } = useI18n()

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
  deleteTemplate,
} = useAvatarTemplates()

const templates = ref<AvatarTemplate[]>([])
const fieldSpecs = ref<Record<ProviderName, FieldSpec[]>>({ heygen: [], tavus: [] })
const loadError = ref(false)
const warning = ref<string | null>(null)
const saving = ref(false)
const formErrors = ref<string[]>([])

/** null = closed; an object with no id = creating. */
const editing = ref<Partial<AvatarTemplate> | null>(null)

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

const isAdmin = ref(false)

onMounted(async () => {
  await load()

  try {
    // Affordance only — the server enforces. Failing closed keeps a transient
    // error from handing an operator controls they cannot use.
    isAdmin.value = (await useCurrentUser().fetchMe()).roles.includes('admin')
  } catch {
    isAdmin.value = false
  }
})

function startCreate(): void {
  formErrors.value = []
  warning.value = null
  editing.value = { name: '', description: '', provider: 'heygen', config: {} }
}

function startEdit(template: AvatarTemplate): void {
  formErrors.value = []
  warning.value = null
  // A copy, so abandoning the form leaves the list untouched.
  editing.value = { ...template, config: { ...template.config } }
}

async function save(payload: Partial<AvatarTemplate>): Promise<void> {
  saving.value = true
  formErrors.value = []

  try {
    const response = payload.id
      ? await updateTemplate(payload.id, {
          name: payload.name,
          description: payload.description ?? null,
          config: payload.config ?? {},
        })
      : await createTemplate({
          name: payload.name ?? '',
          description: payload.description ?? null,
          provider: (payload.provider ?? 'heygen') as ProviderName,
          config: payload.config ?? {},
        })

    warning.value = response.warning ?? null
    editing.value = null
    await load()
  } catch (error) {
    // The API returns every config problem at once, keyed by field. Surfacing
    // one at a time would turn a seventeen-field form into a guessing game.
    formErrors.value = extractConfigErrors(error)
  } finally {
    saving.value = false
  }
}

async function activate(template: AvatarTemplate): Promise<void> {
  warning.value = null

  try {
    const response = await activateTemplate(template.id)
    warning.value = response.warning ?? null
  } catch {
    loadError.value = true
  }

  // Reloaded rather than patched locally: the server deactivates the previous
  // template in the same transaction, and guessing which row that was is a
  // guess about what candidates see next.
  await load()
}

async function remove(template: AvatarTemplate): Promise<void> {
  try {
    await deleteTemplate(template.id)
  } catch {
    loadError.value = true
  }

  await load()
}

function extractConfigErrors(error: unknown): string[] {
  const data = (error as { data?: { errors?: Record<string, string[]> } })?.data

  return Object.values(data?.errors ?? {}).flat()
}
</script>
