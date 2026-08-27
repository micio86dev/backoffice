<template>
  <div class="flex flex-col gap-4">
    <!-- The section title lives in the settings page header; repeating it here
         would give the panel two competing headings. -->
    <div class="flex items-center justify-end">
      <Button data-testid="api-keys-new" @click="creating = true">
        {{ $t('settings.apiKeys.new') }}
      </Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('settings.apiKeys.table.name') }}</TableHead>
          <TableHead>{{ $t('settings.apiKeys.table.createdAt') }}</TableHead>
          <TableHead>{{ $t('settings.apiKeys.table.expiresAt') }}</TableHead>
          <TableHead>{{ $t('settings.apiKeys.table.lastUsedAt') }}</TableHead>
          <TableHead>{{ $t('settings.apiKeys.table.state') }}</TableHead>
          <TableHead>
            <span class="sr-only">{{ $t('settings.apiKeys.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="clients.length === 0" :colspan="6">
          {{ $t('settings.apiKeys.empty') }}
        </TableEmpty>
        <TableRow v-for="client in clients" :key="client.id">
          <TableCell>{{ client.name }}</TableCell>
          <TableCell><FormattedDate :value="client.created_at" :locale="locale" /></TableCell>
          <TableCell>
            <FormattedDate :value="client.expires_at" :locale="locale" show-zone />
          </TableCell>
          <TableCell><FormattedDate :value="client.last_used_at" :locale="locale" /></TableCell>
          <TableCell><ApiKeyStateBadge :state="client.state" /></TableCell>
          <TableCell class="text-right">
            <!--
              Do not offer a control whose only outcome is an error (same
              ratified reasoning as avatar-templates/index.vue's delete
              button) — the badge in the same row supplies the explanation
              for the absence (design.md D3).
            -->
            <Button
              v-if="client.state === 'active'"
              variant="outline"
              size="sm"
              :data-testid="`api-key-revoke-${client.id}`"
              @click="revokeTarget = client"
            >
              {{ $t('settings.apiKeys.revoke') }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!--
      Right-side drawer, not a centred dialog (feature/form-drawer): the
      create-key FORM is a record-creating form launched from a list, which is
      the drawer case. The raw-key reveal below deliberately stays a Dialog —
      see its own comment.

      `id` is load-bearing, not decoration: the submit control lives in the
      drawer's non-scrolling footer, OUTSIDE this form, and
      `<button form="api-key-form">` is what connects the two.
    -->
    <FormDrawer
      :open="creating"
      :title="$t('settings.apiKeys.new')"
      form-id="api-key-form"
      :pending="creatingKey"
      :submit-label="$t('settings.apiKeys.create')"
      @update:open="(open) => !open && (creating = false)"
    >
      <form id="api-key-form" data-testid="api-key-form" novalidate @submit.prevent="onCreate">
        <FieldGroup>
          <Field :data-invalid="Boolean(errors.name)">
            <FieldLabel for="api-key-form-name">{{ $t('settings.apiKeys.name') }}</FieldLabel>
            <Input
              id="api-key-form-name"
              v-model="name"
              autocomplete="off"
              :aria-invalid="Boolean(errors.name)"
              :aria-describedby="nameDescribedBy"
              data-testid="api-key-form-name"
            />
            <FieldDescription id="api-key-form-name-help">
              {{ $t('settings.apiKeys.help.name') }}
            </FieldDescription>
            <FieldError
              v-if="errors.name"
              id="api-key-form-name-error"
              data-testid="api-key-form-name-error"
              >{{ errors.name }}</FieldError
            >
          </Field>
          <!--
              Abilities are a CLOSED set validated server-side against
              config/m2m_abilities.php; a free-text field made every key
              creation a guessing game against names the operator has no way
              to know, and any typo came back as an opaque 422. A checkbox
              group makes the whole grant surface visible and unguessable-wrong.
            -->
          <FieldSet
            :data-invalid="Boolean(errors.abilities)"
            :aria-invalid="errors.abilities ? 'true' : undefined"
            :aria-describedby="errors.abilities ? 'api-key-form-abilities-error' : undefined"
            data-testid="api-key-form-abilities"
          >
            <FieldLegend variant="label">{{ $t('settings.apiKeys.abilities') }}</FieldLegend>
            <FieldDescription>{{ $t('settings.apiKeys.abilitiesDescription') }}</FieldDescription>
            <Alert
              v-if="abilitiesError"
              variant="destructive"
              data-testid="api-key-abilities-error"
            >
              <AlertDescription>{{ $t('settings.apiKeys.abilitiesLoadError') }}</AlertDescription>
            </Alert>
            <ul
              v-else
              class="divide-y divide-border overflow-hidden rounded-lg border border-border"
              :data-invalid="Boolean(errors.abilities)"
            >
              <li v-for="ability in abilities" :key="ability.value">
                <div
                  class="flex items-center gap-3 px-3 py-2.5 transition-colors has-data-checked:bg-primary/5 hover:bg-muted"
                >
                  <!--
                      Deliberately `FieldTitle`, not `Label`: a <label for>
                      cannot name a reka-ui checkbox, because the primitive
                      renders a <button role="checkbox"> and a <button> is not
                      a labelable element — neither the accessible name nor
                      the click would ever reach it. The name is wired through
                      `aria-labelledby`, and the click is forwarded explicitly.
                    -->
                  <Checkbox
                    :id="`api-key-ability-${ability.id}`"
                    :aria-labelledby="`api-key-ability-${ability.id}-label`"
                    :model-value="selectedAbilities.includes(ability.value)"
                    :data-testid="`api-key-ability-${ability.id}`"
                    @update:model-value="(checked) => toggleAbility(ability.value, checked)"
                  />
                  <FieldTitle
                    :id="`api-key-ability-${ability.id}-label`"
                    class="flex flex-1 cursor-pointer items-baseline justify-between gap-3"
                    @click="
                      toggleAbility(ability.value, !selectedAbilities.includes(ability.value))
                    "
                  >
                    <span class="text-foreground">{{ ability.label }}</span>
                    <code class="font-mono text-xs font-normal text-muted-foreground">{{
                      ability.value
                    }}</code>
                  </FieldTitle>
                </div>
              </li>
            </ul>
            <FieldError
              v-if="errors.abilities"
              id="api-key-form-abilities-error"
              data-testid="api-key-form-abilities-error"
              >{{ errors.abilities }}</FieldError
            >
          </FieldSet>
          <Alert
            v-if="formMessage"
            variant="destructive"
            role="alert"
            aria-live="polite"
            data-testid="api-key-form-banner"
          >
            <AlertDescription>{{ formMessage }}</AlertDescription>
          </Alert>
          <!--
              No submit control here — it lives in FormDrawer's non-scrolling
              footer, wired back by this form's `id`. The banner above is the
              last thing in the drawer's scrolling body, so it and the submit
              control stay visible together however far the form is scrolled.
            -->
        </FieldGroup>
      </form>
    </FormDrawer>

    <!--
      The raw key dialog is deliberately a SEPARATE piece of state
      (`rawKeyReveal`), held only in-memory for this component's lifetime —
      never persisted, never re-derivable from a later GET (the API itself
      never returns it again).

      Deliberately still a Dialog, not a FormDrawer (feature/form-drawer). This
      is a one-time secret disclosure with a copy affordance and an
      acknowledge control — there is nothing to fill in and nothing to submit,
      so the form-drawer standard does not apply to it. A centred modal that
      interrupts is the right shape for a value that can never be shown again.
    -->
    <Dialog :open="rawKeyReveal !== null" @update:open="(open) => !open && (rawKeyReveal = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('settings.apiKeys.rawKeyTitle') }}</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertDescription>{{ $t('settings.apiKeys.rawKeyWarning') }}</AlertDescription>
        </Alert>
        <p
          class="bg-muted rounded-lg p-3 font-mono text-sm break-all"
          data-testid="api-key-raw-value"
        >
          {{ rawKeyReveal }}
        </p>
        <div class="flex gap-2">
          <Button data-testid="api-key-copy" @click="onCopy">
            {{ copied ? $t('settings.apiKeys.copied') : $t('settings.apiKeys.copy') }}
          </Button>
          <Button variant="outline" data-testid="api-key-reveal-close" @click="rawKeyReveal = null">
            {{ $t('settings.apiKeys.close') }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      :open="revokeTarget !== null"
      :title="$t('settings.apiKeys.confirmRevokeTitle')"
      :description="$t('settings.apiKeys.confirmRevokeDescription')"
      :confirm-label="$t('settings.apiKeys.revoke')"
      variant="destructive"
      @confirm="onRevokeConfirmed"
      @cancel="revokeTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
// API keys panel (D8): the raw key is returned exactly once, on create, and
// can never be retrieved again — held only in a local, in-memory ref for
// this component's own lifetime (`rawKeyReveal`), never round-tripped
// through the list endpoint (`ApiClientResource` does not even carry a
// `key_hash`, structurally preventing that leak).
import { ref, computed, onMounted } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import FormattedDate from '@/components/atoms/FormattedDate.vue'
import ApiKeyStateBadge from '@/components/atoms/ApiKeyStateBadge.vue'
import { useApiClients, type ApiClient } from '@/composables/useApiClients'
import { applyServerFieldErrors } from '@/utils/http-error'

/**
 * DOM-safe id for an ability name (`participants:create` -> `participants-create`).
 * `:` is not usable in an element id or a `data-testid` selector.
 */
function abilityId(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

/**
 * i18n key for an ability name (`sso_link:generate` -> `ssoLinkGenerate`).
 *
 * Derived rather than looked up in a table, so the only thing this file knows
 * about the ability set is how to SPELL a key — never which abilities exist.
 * That list belongs to the API and is fetched from it.
 */
function abilityLabelKey(value: string): string {
  const parts = value.split(/[^a-z0-9]+/i).filter(Boolean)

  return parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('')
}

const { listClients, listAbilities, createClient, revokeClient } = useApiClients()
const { t, te, locale } = useI18n()

const clients = ref<ApiClient[]>([])
const creating = ref(false)
const creatingKey = ref(false)
const name = ref('')
const selectedAbilities = ref<string[]>([])
const abilityCatalog = ref<string[]>([])
const abilitiesError = ref(false)

/**
 * An ability the server advertises but this build has no translation for still
 * has to be selectable — showing its literal name is honest, and better than a
 * raw i18n key or silently dropping a permission the operator may need.
 */
const abilities = computed(() =>
  abilityCatalog.value.map((value) => {
    const key = `settings.apiKeys.ability.${abilityLabelKey(value)}`

    return { value, id: abilityId(value), label: te(key) ? t(key) : value }
  })
)
const errors = ref<{ name?: string; abilities?: string }>({})
const nameDescribedBy = computed(() =>
  [errors.value.name ? 'api-key-form-name-error' : null, 'api-key-form-name-help']
    .filter((id): id is string => id !== null)
    .join(' ')
)
const formMessage = ref<string | null>(null)
const rawKeyReveal = ref<string | null>(null)
const copied = ref(false)
const revokeTarget = ref<ApiClient | null>(null)

async function load(): Promise<void> {
  const response = await listClients()
  // Correct rather than accidentally-correct-for-page-one:
  // `ApiClientController::index` now returns every org-scoped client
  // unpaginated (generated-client-truth-and-session-safety D5), so
  // `response.data` is the whole set, not the first 20.
  clients.value = response.data
}

async function loadAbilities(): Promise<void> {
  try {
    const response = await listAbilities()
    abilityCatalog.value = response.data
    abilitiesError.value = false
  } catch {
    // Non-fatal for the LIST, which is the primary content here — but the
    // create form cannot offer a grant it could not look up, so it says so
    // rather than rendering an empty checkbox group that reads as "no
    // permissions exist".
    abilityCatalog.value = []
    abilitiesError.value = true
  }
}

function toggleAbility(ability: string, checked: boolean | 'indeterminate'): void {
  const next = selectedAbilities.value.filter((selected) => selected !== ability)
  if (checked === true) next.push(ability)
  selectedAbilities.value = next
  // Clearing the error the moment the field becomes valid, rather than at the
  // next submit, keeps the message from outliving the problem it describes.
  if (next.length > 0) errors.value.abilities = undefined
}

const SERVER_FIELD_TO_ERROR_KEY = {
  name: 'name',
  abilities: 'abilities',
} as const satisfies Record<string, keyof typeof errors.value>

async function onCreate(): Promise<void> {
  formMessage.value = null
  errors.value.name = name.value.trim() === '' ? t('settings.apiKeys.nameRequired') : undefined
  // Emitted in the server's own catalogue order, not click order, so two keys
  // with the same grants always produce the same payload.
  const parsedAbilities = abilityCatalog.value.filter((value) =>
    selectedAbilities.value.includes(value)
  )
  errors.value.abilities =
    parsedAbilities.length === 0 ? t('settings.apiKeys.abilitiesRequired') : undefined
  if (errors.value.name || errors.value.abilities) return

  creatingKey.value = true
  try {
    const response = await createClient({ name: name.value, abilities: parsedAbilities })
    rawKeyReveal.value = response.api_key
    copied.value = false
    creating.value = false
    name.value = ''
    selectedAbilities.value = []
    await load()
  } catch (error) {
    const unmapped = applyServerFieldErrors(error, SERVER_FIELD_TO_ERROR_KEY, (key, message) => {
      errors.value[key] = message
    })
    // A field with no control of its own (e.g. `organization_id` on a
    // per-organization key limit) still has to reach the operator — the
    // server's own message beats a generic banner that hides it.
    formMessage.value =
      unmapped && unmapped.length > 0 ? unmapped.join(' ') : t('settings.apiKeys.createError')
  } finally {
    creatingKey.value = false
  }
}

async function onCopy(): Promise<void> {
  if (rawKeyReveal.value === null) return
  try {
    await navigator.clipboard.writeText(rawKeyReveal.value)
    copied.value = true
  } catch {
    // Clipboard access can be denied by the browser; the value is still
    // selectable/copyable manually from the dialog's <p>, so this is a
    // convenience failure, not a blocking one.
  }
}

async function onRevokeConfirmed(): Promise<void> {
  if (revokeTarget.value === null) return
  const id = revokeTarget.value.id
  revokeTarget.value = null
  await revokeClient(id)
  await load()
}

onMounted(() => {
  void load()
  void loadAbilities()
})
</script>
