<template>
  <div class="flex flex-col gap-3" data-testid="org-multiselect">
    <div v-if="organizations.length > SEARCH_THRESHOLD" class="flex flex-col gap-1.5">
      <FieldLabel :for="`${idPrefix}-org-search`">
        {{ $t('avatar_templates.copy.searchLabel') }}
      </FieldLabel>
      <Input
        :id="`${idPrefix}-org-search`"
        v-model="query"
        type="search"
        autocomplete="off"
        data-testid="org-search"
        :placeholder="$t('avatar_templates.copy.searchPlaceholder')"
      />
    </div>

    <p
      v-if="organizations.length === 0"
      class="text-muted-foreground text-sm"
      data-testid="org-empty"
    >
      {{ $t('avatar_templates.copy.noOrganizations') }}
    </p>

    <template v-else>
      <div class="flex items-center justify-between gap-3">
        <CheckboxField
          :id="`${idPrefix}-org-all`"
          data-testid="org-select-all"
          :label="
            query.trim() === ''
              ? $t('avatar_templates.copy.selectAll')
              : $t('avatar_templates.copy.selectAllFiltered')
          "
          :model-value="allVisibleSelected"
          :indeterminate="someVisibleSelected && !allVisibleSelected"
          :disabled="disabled || visible.length === 0"
          label-class="font-medium"
          @update:model-value="toggleAll"
        />
        <!--
          Announced politely: ticking boxes far from this line would otherwise
          change a number nobody is told about.
        -->
        <p
          class="text-muted-foreground shrink-0 text-xs"
          role="status"
          data-testid="org-selected-count"
        >
          {{
            $t(
              'avatar_templates.copy.selectedCount',
              { count: modelValue.length },
              modelValue.length
            )
          }}
        </p>
      </div>

      <p
        v-if="visible.length === 0"
        class="text-muted-foreground text-sm"
        data-testid="org-no-matches"
      >
        {{ $t('avatar_templates.copy.noMatches') }}
      </p>

      <!--
        A scrollable region with a NAME: without one, a keyboard user who lands
        in it hears an anonymous group. Hover/highlight stays in the primary
        family, never brand orange (DESIGN.md §16.15).
      -->
      <div
        v-else
        role="group"
        :aria-label="$t('avatar_templates.copy.listLabel')"
        class="border-border flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-md border p-1"
        data-testid="org-list"
      >
        <CheckboxField
          v-for="organization in visible"
          :id="`${idPrefix}-org-${organization.id}`"
          :key="organization.id"
          :data-testid="`org-option-${organization.id}`"
          class="hover:bg-primary/10 rounded px-2 py-1.5"
          :label="organization.name"
          :disabled="disabled"
          :model-value="selected.has(organization.id)"
          @update:model-value="(checked: boolean) => toggle(organization.id, checked)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Pick any number of organizations (DESIGN.md §16.15).
 *
 * Presentational: it owns the search text and nothing else — the selection is
 * the parent's (`v-model`, an array of ids in LIST order so the payload is
 * deterministic). "Select all" acts on the VISIBLE options, so it never
 * silently selects rows a filter is hiding; selections already made under
 * another filter are kept.
 */
import { computed, ref } from 'vue'
import CheckboxField from '@/components/molecules/CheckboxField.vue'
import { FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface OrganizationOption {
  id: number
  name: string
}

/** Below this many rows a search box is noise. */
const SEARCH_THRESHOLD = 8

const props = withDefaults(
  defineProps<{
    organizations: OrganizationOption[]
    modelValue: number[]
    /** Prefix for generated DOM ids, so two instances never collide. */
    idPrefix?: string
    disabled?: boolean
  }>(),
  { idPrefix: 'orgs', disabled: false }
)

const emit = defineEmits<{ 'update:modelValue': [ids: number[]] }>()

const query = ref('')

const selected = computed(() => new Set(props.modelValue))

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()

  return needle === ''
    ? props.organizations
    : props.organizations.filter((organization) => organization.name.toLowerCase().includes(needle))
})

const selectedVisibleCount = computed(
  () => visible.value.filter((organization) => selected.value.has(organization.id)).length
)
const allVisibleSelected = computed(
  () => visible.value.length > 0 && selectedVisibleCount.value === visible.value.length
)
const someVisibleSelected = computed(() => selectedVisibleCount.value > 0)

/** Emit in list order, whatever order the boxes were ticked in. */
function emitSelection(ids: Set<number>): void {
  emit(
    'update:modelValue',
    props.organizations.filter((organization) => ids.has(organization.id)).map((o) => o.id)
  )
}

function toggle(id: number, checked: boolean): void {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  emitSelection(next)
}

function toggleAll(checked: boolean): void {
  const next = new Set(selected.value)
  for (const organization of visible.value) {
    if (checked) next.add(organization.id)
    else next.delete(organization.id)
  }
  emitSelection(next)
}
</script>
