<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-lg" data-testid="copy-template-dialog">
      <DialogHeader>
        <DialogTitle>{{
          $t('avatar_templates.copy.title', { name: template?.name ?? '' })
        }}</DialogTitle>
        <DialogDescription>{{ $t('avatar_templates.copy.description') }}</DialogDescription>
      </DialogHeader>

      <!--
        A platform source: labelled as one, and the copy is said to be
        independent of it, because the alternative reading ("it stays linked,
        so my edit to the global reaches it") is exactly what it is not.
      -->
      <div v-if="scope === 'platform'" class="flex flex-col gap-2">
        <PlatformTemplateBadge class="w-fit" data-testid="copy-template-platform-badge">
          {{ $t('platformTemplates.badge') }}
        </PlatformTemplateBadge>
        <p class="text-muted-foreground text-sm" data-testid="copy-template-independence">
          {{ $t('avatar_templates.copy.platformIndependent') }}
        </p>
      </div>

      <!--
        The outcome replaces the form rather than sitting under it: the copies
        are in OTHER organizations, so nothing on the page behind this dialog
        changes, and this summary is the only confirmation the operator gets.
        `role="status"` so it is announced without stealing the focus twice;
        the heading takes focus so a keyboard user lands on the news.
      -->
      <div
        v-if="created !== null"
        role="status"
        class="flex flex-col gap-3"
        data-testid="copy-template-result"
      >
        <h3
          ref="resultTitle"
          tabindex="-1"
          class="text-base font-medium outline-none"
          data-testid="copy-template-result-title"
        >
          {{ $t('avatar_templates.copy.resultTitle', { count: created.length }, created.length) }}
        </h3>
        <ul class="flex flex-col gap-1 text-sm">
          <li v-for="copy in created" :key="copy.id" :data-testid="`copy-result-${copy.id}`">
            {{
              $t('avatar_templates.copy.resultItem', {
                organization: organizationName(copy.organization_id),
                name: copy.name,
              })
            }}
          </li>
        </ul>
        <p class="text-muted-foreground text-sm">
          {{ $t('avatar_templates.copy.resultInactive') }}
        </p>
      </div>

      <template v-else>
        <FormMessage
          v-if="loadError"
          kind="error"
          :text="$t('avatar_templates.copy.loadError')"
          test-id="copy-template-load-error"
        />

        <p
          v-else-if="loading"
          class="text-muted-foreground text-sm"
          data-testid="copy-template-loading"
        >
          {{ $t('avatar_templates.copy.loading') }}
        </p>

        <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="submit">
          <OrganizationMultiSelect
            v-model="selectedIds"
            :organizations="organizations"
            id-prefix="copy-template"
            :disabled="submitting"
          />

          <Field :data-invalid="nameError ? 'true' : undefined">
            <FieldLabel for="copy-template-name">{{
              $t('avatar_templates.copy.nameLabel')
            }}</FieldLabel>
            <Input
              id="copy-template-name"
              v-model="name"
              type="text"
              maxlength="120"
              autocomplete="off"
              data-testid="copy-template-name"
              aria-describedby="copy-template-name-hint"
              :aria-invalid="nameError ? 'true' : undefined"
              :disabled="submitting"
            />
            <FieldError v-if="nameError" data-testid="copy-template-name-error">
              {{ nameError }}
            </FieldError>
            <FieldDescription id="copy-template-name-hint">
              {{ $t('avatar_templates.copy.nameHint', { name: template?.name ?? '' }) }}
            </FieldDescription>
          </Field>

          <FormMessage
            v-if="errorText"
            kind="error"
            :text="errorText"
            test-id="copy-template-error"
          />

          <!--
            The reason a control is disabled is text, not just a greyed button:
            "why can't I press this" has to be answerable without a tooltip.
          -->
          <p
            v-if="selectedIds.length === 0"
            id="copy-template-submit-hint"
            class="text-muted-foreground text-xs"
            data-testid="copy-template-submit-hint"
          >
            {{ $t('avatar_templates.copy.submitNone') }}
          </p>
        </form>
      </template>

      <DialogFooter>
        <Button
          v-if="created !== null"
          type="button"
          data-testid="copy-template-done"
          @click="emit('update:open', false)"
        >
          {{ $t('avatar_templates.copy.close') }}
        </Button>
        <template v-else>
          <Button
            type="button"
            variant="outline"
            data-testid="copy-template-cancel"
            :disabled="submitting"
            @click="emit('update:open', false)"
          >
            {{ $t('avatar_templates.copy.cancel') }}
          </Button>
          <Button
            v-if="!loading && !loadError"
            type="button"
            data-testid="copy-template-submit"
            :disabled="selectedIds.length === 0 || submitting"
            :aria-busy="submitting ? 'true' : undefined"
            :aria-describedby="selectedIds.length === 0 ? 'copy-template-submit-hint' : undefined"
            @click="submit"
          >
            {{
              submitting
                ? $t('avatar_templates.copy.submitting')
                : $t(
                    'avatar_templates.copy.submit',
                    { count: selectedIds.length },
                    selectedIds.length
                  )
            }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * Copy one avatar template to other organizations (DESIGN.md §16.15).
 *
 * SUPERADMIN ONLY — the page decides whether to mount it, the API enforces.
 *
 * The source organization is the ACTING client: a superadmin's template list
 * is the acting client's, so that is the row being copied FROM, and it is
 * removed from the choices rather than offered and refused (`422
 * source_organization_included` remains the server's answer if the selection
 * changed in another tab). The organization list is fetched on every open, not
 * cached: it is the one thing here that another superadmin can change under us.
 */
import { computed, nextTick, ref, watch } from 'vue'
import PlatformTemplateBadge from '@/components/atoms/PlatformTemplateBadge.vue'
import FormMessage from '@/components/molecules/FormMessage.vue'
import OrganizationMultiSelect from '@/components/molecules/OrganizationMultiSelect.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAvatarTemplates } from '@/composables/useAvatarTemplates'
import { useSuperadmin } from '@/composables/useSuperadmin'
import type { AvatarTemplate, DuplicatedTemplate, TemplateScope } from '@/types/avatar-template'
import { applyServerFieldErrors } from '@/utils/http-error'
import { translateServerCode } from '@/utils/server-message'

const props = withDefaults(
  defineProps<{
    open: boolean
    template: Pick<AvatarTemplate, 'id' | 'name'> | null
    /**
     * Whose template is being copied. `platform` (a global) has no source
     * organization, so nothing is excluded from the choices.
     */
    scope?: TemplateScope
  }>(),
  { scope: 'organization' }
)

const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const { t, te } = useI18n()
const { duplicateTemplate } = useAvatarTemplates()
const { fetchClients } = useSuperadmin()

const organizations = ref<Array<{ id: number; name: string }>>([])
const selectedIds = ref<number[]>([])
const name = ref('')
const loading = ref(false)
const loadError = ref(false)
const submitting = ref(false)
const errorCode = ref<string | null>(null)
const nameError = ref<string | null>(null)
const created = ref<DuplicatedTemplate[] | null>(null)
const resultTitle = ref<HTMLElement | null>(null)

const errorText = computed(() =>
  errorCode.value === null
    ? null
    : translateServerCode({ t, te }, 'avatar_templates.serverError', errorCode.value)
)

function organizationName(id: number): string {
  return organizations.value.find((organization) => organization.id === id)?.name ?? String(id)
}

function reset(): void {
  organizations.value = []
  selectedIds.value = []
  name.value = ''
  loadError.value = false
  errorCode.value = null
  nameError.value = null
  created.value = null
}

async function loadOrganizations(): Promise<void> {
  loading.value = true
  try {
    const response = await fetchClients()
    organizations.value =
      props.scope === 'platform'
        ? response.data
        : response.data.filter(
            (organization) => organization.id !== response.acting_organization_id
          )
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    reset()
    void loadOrganizations()
  },
  { immediate: true }
)

async function submit(): Promise<void> {
  if (props.template === null || selectedIds.value.length === 0 || submitting.value) return

  submitting.value = true
  errorCode.value = null
  nameError.value = null

  try {
    const response = await duplicateTemplate(
      props.template.id,
      selectedIds.value,
      name.value,
      props.scope
    )
    created.value = response.data
    await nextTick()
    resultTitle.value?.focus()
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    const resolved = typeof code === 'string' ? code : 'duplicate_failed'

    // A refusal about the name belongs ON the name field; the composable's
    // typed error keeps the raw rejection as `cause` for exactly this walk.
    let onNameField = false
    applyServerFieldErrors(
      (error as { cause?: unknown } | null)?.cause ?? error,
      { name: 'name' } as const,
      (_key, message) => {
        nameError.value = translateServerCode({ t, te }, 'avatar_templates.serverError', message)
        onNameField = true
      }
    )

    // ...and then the banner has nothing further to add.
    errorCode.value = onNameField && resolved === 'validation_failed' ? null : resolved
  } finally {
    submitting.value = false
  }
}

function onOpenChange(open: boolean): void {
  // Closing mid-request would leave the operator unsure whether copies exist.
  if (!open && submitting.value) return
  emit('update:open', open)
}
</script>
