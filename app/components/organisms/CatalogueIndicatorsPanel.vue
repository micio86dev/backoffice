<template>
  <section class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <p class="text-muted-foreground text-sm" data-testid="indicators-scope">
        {{ $t('catalogue.indicators.description') }}
      </p>
      <Button v-if="editable" data-testid="indicators-new" @click="creating = true">
        {{ $t('catalogue.indicators.new') }}
      </Button>
    </div>

    <FormMessage
      v-if="loadError !== null"
      :kind="loadError === 'not-ready' ? 'waiting' : 'error'"
      :text="$t(resourceErrorKey(loadError, 'message'))"
      test-id="indicators-load-error"
    />

    <FormMessage
      v-if="actionError !== null"
      :kind="actionError.kind"
      :text="actionError.text"
      test-id="indicators-action-error"
    />

    <p
      v-if="loadError === null && competencies.length === 0"
      class="text-muted-foreground text-sm"
      data-testid="indicators-no-competencies"
    >
      {{ $t('catalogue.indicators.noCompetencies') }}
    </p>

    <div v-else-if="loadError === null" class="flex flex-col gap-6">
      <div
        v-for="group in competencyGroups"
        :key="group.competencyId"
        class="flex flex-col gap-3"
        :data-testid="`indicators-competency-${group.competencyId}`"
      >
        <h4 class="text-sm font-semibold">{{ group.competencyCode }}</h4>

        <p v-if="group.pairs.length === 0" class="text-muted-foreground text-xs">
          {{ $t('catalogue.indicators.empty') }}
        </p>

        <div
          v-for="pair in group.pairs"
          :key="pair.key"
          class="flex flex-col gap-2 rounded-lg border border-border p-3"
        >
          <p class="text-muted-foreground text-xs font-medium">{{ pair.roleLabel }}</p>

          <Table>
            <TableBody>
              <TableRow v-for="(item, index) in pair.items" :key="item.id">
                <TableCell class="w-10">{{ item.position }}</TableCell>
                <TableCell class="max-w-xs truncate">{{ indicatorText(item) }}</TableCell>
                <TableCell v-if="editable" class="flex justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="index === 0 || moving"
                    :data-testid="`indicator-move-up-${item.id}`"
                    :aria-label="$t('catalogue.indicators.moveUp')"
                    @click="onMove(pair, index, -1)"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="index === pair.items.length - 1 || moving"
                    :data-testid="`indicator-move-down-${item.id}`"
                    :aria-label="$t('catalogue.indicators.moveDown')"
                    @click="onMove(pair, index, 1)"
                  >
                    ↓
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :data-testid="`indicator-edit-${item.id}`"
                    @click="editing = item"
                  >
                    {{ $t('catalogue.indicators.edit') }}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :data-testid="`indicator-delete-${item.id}`"
                    @click="deleteTarget = item"
                  >
                    {{ $t('catalogue.indicators.delete') }}
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>

    <FormDrawer
      :open="creating || editing !== null"
      :title="creating ? $t('catalogue.indicators.new') : $t('catalogue.indicators.edit')"
      form-id="bars-indicator-form"
      :pending="saving"
      @update:open="(open) => !open && closeDrawer()"
    >
      <BarsIndicatorForm
        v-if="creating || editing !== null"
        :indicator="editing"
        :competencies="competencies"
        :roles="roles"
        :indicators="indicators"
        @update:pending="(value) => (saving = value)"
        @saved="onFormSaved"
      />
    </FormDrawer>

    <ConfirmDialog
      :open="deleteTarget !== null"
      variant="destructive"
      :title="$t('catalogue.indicators.confirmDeleteTitle')"
      :description="$t('catalogue.indicators.confirmDeleteBody')"
      :confirm-label="$t('catalogue.indicators.delete')"
      @confirm="onConfirmDelete"
      @cancel="deleteTarget = null"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * Superadmin CRUD over BARS indicators (framework-catalogue-authoring
 * PR10b, DESIGN.md §8.2.10, catalogue-authoring spec). Grouped by
 * competency, then by role/competency PAIR (the unit the exactly-3-
 * indicators rule and the `{revision, role, competency}` uniqueness both
 * scope to) — each pair renders its own small table, never one flat list
 * where an indicator's pair membership is left implicit.
 *
 * Deliberately does NOT block a delete that would leave a pair below 3, or
 * a create beyond it client-side for anything the server itself does not
 * pre-empt — the exactly-3 rule is enforced at PUBLISH time
 * (`PublishRevision::violations()`), not on every draft write; the task's
 * own instruction is to "surface the publish sweep's violation instead" of
 * silently forbidding an otherwise legal draft edit.
 */
import { ref, computed, onMounted } from 'vue'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import BarsIndicatorForm from '@/components/organisms/BarsIndicatorForm.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import {
  useCatalogue,
  type CatalogueBarsIndicator,
  type CatalogueCompetency,
  type CatalogueRole,
} from '@/composables/useCatalogue'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { actionErrorMessage } from '@/utils/action-error-message'
import type { ResourceErrorState } from '@/utils/error-state'

defineProps<{
  /** See `CatalogueCompetenciesPanel`'s own prop — identical here. */
  editable: boolean
}>()

const emit = defineEmits<{ (e: 'refresh-revision'): void }>()

const {
  listCompetencies,
  listRoles,
  listBarsIndicators,
  deleteBarsIndicator,
  updateBarsIndicator,
} = useCatalogue()
const { t, locale } = useI18n()

const competencies = ref<CatalogueCompetency[]>([])
const roles = ref<CatalogueRole[]>([])
const indicators = ref<CatalogueBarsIndicator[]>([])

const creating = ref(false)
const editing = ref<CatalogueBarsIndicator | null>(null)
const saving = ref(false)
const deleteTarget = ref<CatalogueBarsIndicator | null>(null)
const loadError = ref<ResourceErrorState | null>(null)
const actionError = ref<{ kind: FormMessageKind; text: string } | null>(null)
/**
 * True for the whole duration of `onMove`'s 3-step PATCH dance (RoleCompetenciesForm.vue's
 * `saving` guards its own double-submission the same way). Every move button
 * — not just the pair being moved — is disabled while this is true: a second
 * click on ANY row before this one's dance finishes would compute its own
 * temp/final positions from the same not-yet-reloaded `indicators`, racing
 * the in-flight PATCH sequence.
 */
const moving = ref(false)

interface PairGroup {
  key: string
  roleId: number | null
  roleLabel: string
  items: CatalogueBarsIndicator[]
}

interface CompetencyGroup {
  competencyId: number
  competencyCode: string
  pairs: PairGroup[]
}

function roleLabel(roleId: number | null): string {
  if (roleId === null) return t('catalogue.indicators.roleless')
  return roles.value.find((r) => r.id === roleId)?.code ?? String(roleId)
}

/**
 * Operator UI locale first, English fallback — same rule as
 * `CatalogueCompetenciesPanel`/`CatalogueRolesPanel` (gga review finding:
 * this previously always showed `text.en`, so an Italian operator read
 * English indicator text even when an Italian one existed).
 */
function indicatorText(indicator: CatalogueBarsIndicator): string {
  return indicator.text?.[locale.value] ?? indicator.text?.en ?? ''
}

const competencyGroups = computed<CompetencyGroup[]>(() =>
  competencies.value.map((competency) => {
    const own = indicators.value.filter((i) => i.competency_id === competency.id)

    const byRole = new Map<string, CatalogueBarsIndicator[]>()
    for (const indicator of own) {
      const key = indicator.role_id === null ? 'none' : String(indicator.role_id)
      const bucket = byRole.get(key) ?? []
      bucket.push(indicator)
      byRole.set(key, bucket)
    }

    const pairs: PairGroup[] = [...byRole.entries()]
      .map(([key, items]) => {
        const roleId = key === 'none' ? null : Number(key)
        return {
          key: `${competency.id}:${key}`,
          roleId,
          roleLabel: roleLabel(roleId),
          items: [...items].sort((a, b) => a.position - b.position),
        }
      })
      .sort((a, b) => a.roleLabel.localeCompare(b.roleLabel))

    // `code` is a fixed identifier, never translated — unlike `name`, no
    // locale-aware resolution belongs here (see `CatalogueCompetenciesPanel`
    // for the contrasting case where one is needed).
    return { competencyId: competency.id, competencyCode: competency.code, pairs }
  })
)

async function load(): Promise<void> {
  loadError.value = null

  try {
    const [competenciesResponse, rolesResponse, indicatorsResponse] = await Promise.all([
      listCompetencies(),
      listRoles(),
      listBarsIndicators(),
    ])

    competencies.value = competenciesResponse.data
    roles.value = rolesResponse.data
    indicators.value = indicatorsResponse.data
  } catch (error) {
    competencies.value = []
    roles.value = []
    indicators.value = []
    loadError.value = resolveResourceErrorState(error)
  }
}

function closeDrawer(): void {
  creating.value = false
  editing.value = null
}

async function onFormSaved(): Promise<void> {
  closeDrawer()
  actionError.value = null
  await load()
  emit('refresh-revision')
}

async function onConfirmDelete(): Promise<void> {
  if (deleteTarget.value === null) return
  const target = deleteTarget.value
  deleteTarget.value = null
  actionError.value = null

  try {
    await deleteBarsIndicator(target.id)
    await load()
    emit('refresh-revision')
  } catch (error) {
    actionError.value = actionErrorMessage(error, t, 'catalogue.indicators.deleteError')
  }
}

/**
 * Swaps two adjacent rows within ONE pair via a 3-step PATCH dance, never a
 * direct 2-call swap: `UpdateBarsIndicatorRequest` validates `position`
 * uniqueness within `(revision, role, competency)` PER REQUEST against
 * whatever the database holds at that instant, so moving row A onto row B's
 * current slot is refused outright while B still holds it — the exact same
 * same-slot collision `CatalogueDefaultQuestionsPanel.vue`'s `onReorder`
 * exists to avoid, scoped here to a single pair instead of an N-row list.
 * The temporary slot (`max(pair positions) + 1`) can never collide with
 * either row's real position, in either direction, by construction.
 */
async function onMove(pair: PairGroup, index: number, direction: -1 | 1): Promise<void> {
  // Belt-and-suspenders with the template's `:disabled="... || moving"`: the
  // buttons already keep a click from reaching here while a move is in
  // flight, but guarding the handler itself means a stray double-dispatch
  // can never start a second 3-step dance from the same pre-move positions
  // (R3-indicator-move-no-inflight-guard).
  if (moving.value) return

  const otherIndex = index + direction
  if (otherIndex < 0 || otherIndex >= pair.items.length) return

  actionError.value = null

  const a = pair.items[index]
  const b = pair.items[otherIndex]
  if (!a || !b) return

  const aPosition = a.position
  const bPosition = b.position
  const tempPosition = Math.max(...pair.items.map((i) => i.position)) + 1

  moving.value = true

  try {
    await updateBarsIndicator(a.id, { position: tempPosition })
    await updateBarsIndicator(b.id, { position: aPosition })
    await updateBarsIndicator(a.id, { position: bPosition })
    await load()
    emit('refresh-revision')
  } catch (error) {
    // Reloads from the server rather than attempting a local rollback — the
    // SAME deliberate choice `CatalogueDefaultQuestionsPanel.vue`'s own
    // `onReorder` docblock explains: a failure can land midway through this
    // 3-step dance (row A already parked at `tempPosition`, or already moved
    // to B's old slot), and a rollback issued from HERE would be guessing
    // whether that PATCH actually committed — the exact same "claims the
    // previous order was kept when it might not have been" risk that
    // sibling panel's docblock names. `load()` shows whatever the server
    // actually holds, which may include a position gap; the banner below
    // says so honestly rather than asserting a state nobody confirmed.
    await load()
    actionError.value = actionErrorMessage(error, t, 'catalogue.indicators.reorderError')
  } finally {
    moving.value = false
  }
}

onMounted(() => {
  void load()
})

defineExpose({ load })
</script>
