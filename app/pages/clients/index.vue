<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('clients.title')" :subtitle="$t('clients.subtitle')">
      <template #actions>
        <!--
          No ability check here: the whole route is guarded by `clients.viewAny`
          (03.abilities.global.ts) and the API refuses every write to anyone else,
          so a second client-side gate would only be a copy of the rule.
        -->
        <Button data-testid="clients-new" @click="editing = 'new'">
          {{ $t('clients.action.new') }}
        </Button>
      </template>
    </PageHeader>
    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="clients-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>
    <ClientTable
      v-else
      :clients="clients"
      :acting-organization-id="actingOrganizationId"
      @edit="(id) => (editing = id)"
    />

    <FormDrawer
      :open="editing !== null"
      :title="editing === 'new' ? $t('clients.form.newTitle') : $t('clients.form.editTitle')"
      form-id="client-form"
      :pending="saving"
      @update:open="(open) => !open && (editing = null)"
    >
      <!-- Keyed on the target so switching row never reuses another's fields. -->
      <ClientForm
        v-if="editing !== null"
        :key="String(editing)"
        :client-id="editing === 'new' ? undefined : editing"
        @update:pending="(value) => (saving = value)"
        @saved="onSaved"
      />
    </FormDrawer>
  </div>
</template>

<script setup lang="ts">
// The platform owner's directory of every organization (design D5, D7).
// Page + organism split, same as participants/index.vue <-> CandidateTable.vue:
// this owns the fetch and the failure state, ClientTable owns the table.
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import ClientTable from '@/components/organisms/ClientTable.vue'
import ClientForm from '@/components/organisms/ClientForm.vue'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import { useSuperadmin, type ClientOverviewRow } from '@/composables/useSuperadmin'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

definePageMeta({
  name: 'clients',
})

const { t } = useI18n()

useHead({
  title: () => t('head.title.clients'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchClientOverview } = useSuperadmin()

const clients = ref<ClientOverviewRow[]>([])
const actingOrganizationId = ref<number | null>(null)

// A failed fetch must NEVER fall through to ClientTable's empty state
// (D7 — the same discipline as participants/index.vue): "no clients yet" and
// "we could not ask" are different facts, and only one is the operator's
// problem.
const loadError = ref<ResourceErrorState | null>(null)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

async function load(): Promise<void> {
  try {
    const response = await fetchClientOverview()
    clients.value = response.data
    actingOrganizationId.value = response.acting_organization_id ?? null
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

// `'new'` for the create form, an organization id for edit, null when closed.
const editing = ref<'new' | number | null>(null)
const saving = ref(false)

async function onSaved(): Promise<void> {
  editing.value = null
  await load()
}

onMounted(() => {
  void load()
})
</script>
