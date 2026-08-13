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
          <TableHead>
            <span class="sr-only">{{ $t('settings.apiKeys.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="clients.length === 0" :colspan="5">
          {{ $t('settings.apiKeys.empty') }}
        </TableEmpty>
        <TableRow v-for="client in clients" :key="client.id">
          <TableCell>{{ client.name }}</TableCell>
          <TableCell>{{ client.created_at }}</TableCell>
          <TableCell>{{ client.expires_at ?? '—' }}</TableCell>
          <TableCell>{{ client.last_used_at ?? '—' }}</TableCell>
          <TableCell class="text-right">
            <Button
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

    <Dialog :open="creating" @update:open="(open) => !open && (creating = false)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('settings.apiKeys.new') }}</DialogTitle>
        </DialogHeader>
        <form data-testid="api-key-form" novalidate @submit.prevent="onCreate">
          <FieldGroup>
            <Field :data-invalid="Boolean(errors.name)">
              <FieldLabel for="api-key-form-name">{{ $t('settings.apiKeys.name') }}</FieldLabel>
              <Input
                id="api-key-form-name"
                v-model="name"
                :aria-invalid="Boolean(errors.name)"
                :aria-describedby="errors.name ? 'api-key-form-name-error' : undefined"
                data-testid="api-key-form-name"
              />
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
              <ul
                class="divide-y divide-border overflow-hidden rounded-lg border border-border"
                :data-invalid="Boolean(errors.abilities)"
              >
                <li v-for="ability in M2M_ABILITIES" :key="ability.value">
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
                      <span class="text-foreground">{{ $t(ability.labelKey) }}</span>
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
            <Button type="submit" :disabled="creatingKey">{{
              $t('settings.apiKeys.create')
            }}</Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>

    <!--
      The raw key dialog is deliberately a SEPARATE piece of state
      (`rawKeyReveal`), held only in-memory for this component's lifetime —
      never persisted, never re-derivable from a later GET (the API itself
      never returns it again).
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
import { ref, onMounted } from 'vue'
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
import { useApiClients, type ApiClient } from '@/composables/useApiClients'

/**
 * Canonical M2M ability set.
 *
 * MIRRORS `api/config/m2m_abilities.php`, which is the single source of truth
 * and rejects anything outside it with a 422. The API publishes no endpoint
 * for this list today, so it is duplicated here rather than fetched; adding an
 * ability server-side means adding it here and in both locale files too.
 * `id` is the DOM-safe form of `value` (`:` is not usable in an i18n path).
 */
const M2M_ABILITIES = [
  {
    value: 'participants:create',
    id: 'participants-create',
    labelKey: 'settings.apiKeys.ability.participantsCreate',
  },
  {
    value: 'participants:read',
    id: 'participants-read',
    labelKey: 'settings.apiKeys.ability.participantsRead',
  },
  {
    value: 'evaluations:read',
    id: 'evaluations-read',
    labelKey: 'settings.apiKeys.ability.evaluationsRead',
  },
  {
    value: 'progress:read',
    id: 'progress-read',
    labelKey: 'settings.apiKeys.ability.progressRead',
  },
  {
    value: 'projects:read',
    id: 'projects-read',
    labelKey: 'settings.apiKeys.ability.projectsRead',
  },
  {
    value: 'sso_link:generate',
    id: 'sso-link-generate',
    labelKey: 'settings.apiKeys.ability.ssoLinkGenerate',
  },
] as const

const { listClients, createClient, revokeClient } = useApiClients()
const { t } = useI18n()

const clients = ref<ApiClient[]>([])
const creating = ref(false)
const creatingKey = ref(false)
const name = ref('')
const selectedAbilities = ref<string[]>([])
const errors = ref<{ name?: string; abilities?: string }>({})
const formMessage = ref<string | null>(null)
const rawKeyReveal = ref<string | null>(null)
const copied = ref(false)
const revokeTarget = ref<ApiClient | null>(null)

async function load(): Promise<void> {
  const response = await listClients()
  clients.value = response.data
}

function toggleAbility(ability: string, checked: boolean | 'indeterminate'): void {
  const next = selectedAbilities.value.filter((selected) => selected !== ability)
  if (checked === true) next.push(ability)
  selectedAbilities.value = next
  // Clearing the error the moment the field becomes valid, rather than at the
  // next submit, keeps the message from outliving the problem it describes.
  if (next.length > 0) errors.value.abilities = undefined
}

async function onCreate(): Promise<void> {
  formMessage.value = null
  errors.value.name = name.value.trim() === '' ? t('settings.apiKeys.nameRequired') : undefined
  // Emitted in the canonical config order, not click order, so two keys with
  // the same grants always produce the same payload.
  const parsedAbilities = M2M_ABILITIES.map((ability) => ability.value).filter((value) =>
    selectedAbilities.value.includes(value)
  )
  errors.value.abilities =
    parsedAbilities.length === 0 ? t('settings.apiKeys.abilitiesRequired') : undefined
  if (errors.value.name || errors.value.abilities) return

  creatingKey.value = true
  try {
    const response = await createClient({ name: name.value, abilities: [...parsedAbilities] })
    rawKeyReveal.value = response.api_key
    copied.value = false
    creating.value = false
    name.value = ''
    selectedAbilities.value = []
    await load()
  } catch {
    formMessage.value = t('settings.apiKeys.createError')
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
})
</script>
