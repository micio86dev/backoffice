<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-medium text-foreground">{{ $t('settings.apiKeys.title') }}</h2>
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
                data-testid="api-key-form-name"
              />
              <FieldError v-if="errors.name">{{ errors.name }}</FieldError>
            </Field>
            <Field>
              <FieldLabel for="api-key-form-abilities">{{
                $t('settings.apiKeys.abilities')
              }}</FieldLabel>
              <Input
                id="api-key-form-abilities"
                v-model="abilities"
                data-testid="api-key-form-abilities"
              />
              <FieldError v-if="errors.abilities">{{ errors.abilities }}</FieldError>
            </Field>
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { useApiClients, type ApiClient } from '@/composables/useApiClients'

const { listClients, createClient, revokeClient } = useApiClients()
const { t } = useI18n()

const clients = ref<ApiClient[]>([])
const creating = ref(false)
const creatingKey = ref(false)
const name = ref('')
const abilities = ref('')
const errors = ref<{ name?: string; abilities?: string }>({})
const formMessage = ref<string | null>(null)
const rawKeyReveal = ref<string | null>(null)
const copied = ref(false)
const revokeTarget = ref<ApiClient | null>(null)

async function load(): Promise<void> {
  const response = await listClients()
  clients.value = response.data
}

async function onCreate(): Promise<void> {
  formMessage.value = null
  errors.value.name = name.value.trim() === '' ? t('settings.apiKeys.nameRequired') : undefined
  const parsedAbilities = abilities.value
    .split(',')
    .map((ability) => ability.trim())
    .filter(Boolean)
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
    abilities.value = ''
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
