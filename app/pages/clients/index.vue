<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="$t('clients.title')" :subtitle="$t('clients.subtitle')" />
    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="clients-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>
    <ClientTable v-else :clients="clients" :acting-organization-id="actingOrganizationId" />
  </div>
</template>

<script setup lang="ts">
// The platform owner's directory of every organization (design D5, D7).
// Page + organism split, same as participants/index.vue <-> CandidateTable.vue:
// this owns the fetch and the failure state, ClientTable owns the table.
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import ClientTable from '@/components/organisms/ClientTable.vue'
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

onMounted(() => {
  void load()
})
</script>
