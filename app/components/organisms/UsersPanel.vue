<template>
  <div class="flex flex-col gap-4">
    <!-- The section title lives in the settings page header; repeating it here
         would give the panel two competing headings. -->
    <!--
      The scope is NAMED, and that is not decoration. One click of the client
      switcher moves this panel between an organization's people and BEAI's
      own; an operator who cannot tell which is on screen is one click from
      adding the wrong person to the wrong place, and nothing downstream would
      catch it.
    -->
    <div class="flex items-center justify-between gap-4">
      <p class="text-muted-foreground text-sm" data-testid="users-scope">
        {{ isPlatform ? $t('users.scope.platform') : $t('users.scope.organization') }}
      </p>
      <Button data-testid="users-new" @click="editing = 'new'">{{
        isPlatform ? $t('users.newPlatform') : $t('users.new')
      }}</Button>
    </div>

    <!--
      A 409 means "not ready yet" — temporal and self-resolving — and must not
      render in the same destructive red as a 403. `settings/index.vue` makes
      the same distinction; reaching for the shared mapper and then flattening
      its four states into one severity throws away the reason it separates
      them.
    -->
    <FormMessage
      v-if="loadError !== null"
      :kind="loadError === 'not-ready' ? 'waiting' : 'error'"
      :text="$t(resourceErrorKey(loadError, 'message'))"
      test-id="users-load-error"
    />

    <FormMessage
      v-if="actionError !== null"
      kind="error"
      :text="actionError"
      test-id="users-action-error"
    />

    <Table v-if="loadError === null">
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('users.table.name') }}</TableHead>
          <TableHead>{{ $t('users.table.email') }}</TableHead>
          <TableHead v-if="!isPlatform">{{ $t('users.table.accessLevel') }}</TableHead>
          <TableHead>{{ $t('users.table.state') }}</TableHead>
          <TableHead>
            <span class="sr-only">{{ $t('users.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="users.length === 0" :colspan="isPlatform ? 4 : 5">
          {{ $t('users.table.empty') }}
        </TableEmpty>
        <TableRow v-for="user in users" :key="user.id">
          <TableCell>{{ user.name }}</TableCell>
          <TableCell>{{ user.email }}</TableCell>
          <TableCell v-if="!isPlatform">
            <AccessLevelBadge v-if="user.role" :role="user.role" />
            <template v-else>
              <span class="sr-only">{{ $t('users.table.noAccessLevel') }}</span>
              <span aria-hidden="true">—</span>
            </template>
          </TableCell>
          <TableCell>
            <UserStateBadge :deactivated="user.is_deactivated" />
          </TableCell>
          <TableCell class="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              :data-testid="`user-edit-${user.id}`"
              @click="editing = user.id"
            >
              {{ $t('users.edit') }}
            </Button>
            <Button
              v-if="!user.is_deactivated"
              variant="outline"
              size="sm"
              :data-testid="`user-deactivate-${user.id}`"
              @click="confirmTarget = { user, action: 'deactivate' }"
            >
              {{ $t('users.action.deactivate') }}
            </Button>
            <Button
              v-else
              variant="outline"
              size="sm"
              :data-testid="`user-activate-${user.id}`"
              @click="confirmTarget = { user, action: 'activate' }"
            >
              {{ $t('users.action.activate') }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <!--
      Right-side drawer, not a centred dialog (feature/form-drawer): a
      record-editing form launched from a list is the drawer case, and the
      shared wrapper is where the focus trap, focus restore, Escape handling
      and the never-scrolling footer come from.
    -->
    <FormDrawer
      :open="editing !== null"
      :title="
        editing === 'new'
          ? isPlatform
            ? $t('users.newPlatform')
            : $t('users.new')
          : $t('users.edit')
      "
      form-id="user-form"
      :pending="saving"
      @update:open="(open) => !open && (editing = null)"
    >
      <UserForm
        v-if="editing !== null"
        :user="editingUser"
        :variant="variant"
        @update:pending="(value) => (saving = value)"
        @saved="onFormSaved"
      />
    </FormDrawer>

    <ConfirmDialog
      :open="confirmTarget !== null"
      :title="
        confirmTarget?.action === 'deactivate'
          ? $t('users.confirm.deactivateTitle')
          : $t('users.confirm.activateTitle')
      "
      :description="
        confirmTarget?.action === 'deactivate'
          ? $t('users.confirm.deactivateDescription')
          : $t('users.confirm.activateDescription')
      "
      :confirm-label="
        confirmTarget?.action === 'deactivate'
          ? $t('users.action.deactivate')
          : $t('users.action.activate')
      "
      @confirm="onConfirmAction"
      @cancel="confirmTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
// Users & roles panel (D4/D8). Deactivate/activate go through ConfirmDialog
// — nothing happens on the first click.
import { ref, computed, onMounted, watch } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import FormDrawer from '@/components/organisms/FormDrawer.vue'
import AccessLevelBadge from '@/components/atoms/AccessLevelBadge.vue'
import UserStateBadge from '@/components/atoms/UserStateBadge.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import UserForm from '@/components/organisms/UserForm.vue'
import { useUsers, type UserListResponse } from '@/composables/useUsers'
import { usePlatformUsers } from '@/composables/usePlatformUsers'
import FormMessage from '@/components/molecules/FormMessage.vue'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'
import { guardErrorCode } from '@/utils/http-error'
import { translateServerCode } from '@/utils/server-message'

/**
 * The org row is the wider shape (it carries `role`), so the union is what a
 * cell has to be ready for. `role` is optional rather than nullable because
 * the platform payload does not publish the key at all.
 */
type User = Omit<UserListResponse['data'][number], 'role'> & {
  role?: UserListResponse['data'][number]['role']
}

const props = withDefaults(
  defineProps<{
    /**
     * Which population this panel manages (platform-user-management D6).
     *
     * A prop rather than a second component: the actions are the SAME actions
     * — list, create, edit, deactivate, activate, each behind the same
     * confirmation. What differs is one column and which composable answers.
     */
    variant?: 'organization' | 'platform'
  }>(),
  { variant: 'organization' }
)

const isPlatform = computed(() => props.variant === 'platform')

const { t, te } = useI18n()

const { listUsers, deactivateUser, activateUser } = useUsers()
const { listPlatformUsers, deactivatePlatformUser, activatePlatformUser } = usePlatformUsers()

const users = ref<User[]>([])
const editing = ref<'new' | number | null>(null)
// Mirrored from UserForm's own in-flight flag (feature/form-drawer): the form
// still owns persistence, the drawer footer holds its submit control.
const saving = ref(false)
const confirmTarget = ref<{ user: User; action: 'deactivate' | 'activate' } | null>(null)
const loadError = ref<ResourceErrorState | null>(null)
const actionError = ref<string | null>(null)

const editingUser = computed<User | null>(() => {
  if (editing.value === null || editing.value === 'new') return null
  return users.value.find((user) => user.id === editing.value) ?? null
})

/**
 * Monotonic, captured before the await and checked after it.
 *
 * Clearing the rows on a scope change does NOT cancel the request already in
 * flight, and the interleaving is the one the watcher exists to prevent: the
 * organization list resolving LAST would repaint an organization's people
 * under "You are managing the BEAI team", with every action then following
 * `isPlatform` against global ids.
 */
let loadToken = 0

async function load(): Promise<void> {
  const token = ++loadToken
  const platform = isPlatform.value

  // A rejection that falls through leaves `users` empty, and the table then
  // renders "No users yet." — a failure that looks like success, which is the
  // exact rule `utils/error-state.ts` writes down.
  loadError.value = null

  try {
    const response = platform ? await listPlatformUsers() : await listUsers()

    if (token !== loadToken) return

    users.value = response.data
  } catch (error) {
    if (token !== loadToken) return

    users.value = []
    loadError.value = resolveResourceErrorState(error)
  }
}

async function onFormSaved(): Promise<void> {
  editing.value = null
  await load()
}

async function onConfirmAction(): Promise<void> {
  if (confirmTarget.value === null) return
  const { user, action } = confirmTarget.value
  confirmTarget.value = null
  actionError.value = null

  try {
    if (action === 'deactivate') {
      await (isPlatform.value ? deactivatePlatformUser(user.id) : deactivateUser(user.id))
    } else {
      await (isPlatform.value ? activatePlatformUser(user.id) : activateUser(user.id))
    }
  } catch (error) {
    // The guards answer 422 with a CODE — last_superadmin, self_deactivation,
    // last_admin, self_demotion. UserAbilities states the contract these
    // invariants are published under: "the button renders; the API explains".
    // Swallowing the rejection left the row still reading Active with no
    // explanation, which teaches the operator the button is broken.
    //
    // Rendered from the code, never the server's `message`: that prose is
    // machine-facing and this app is the only layer that knows the operator's
    // language.
    const code = guardErrorCode(error)

    actionError.value =
      code === null
        ? t('users.actionError')
        : translateServerCode({ t, te }, 'users.serverError', code)

    return
  }

  await load()
}

onMounted(() => {
  void load()
})

/**
 * The scope can flip AFTER this panel has mounted.
 *
 * `settings/index.vue` resolves it from `/api/organization`'s 404, which
 * lands after the rail has already painted — so opening Users inside that
 * window mounted the ORGANIZATION variant, fetched `/users`, and then the
 * caption flipped to "You are managing the BEAI team" while the rows were
 * still an organization's. Every action follows `isPlatform`, and ids are
 * global, so Deactivate then aimed a well-formed request at the wrong
 * population.
 *
 * The rows are dropped BEFORE the refetch, so there is never a moment where a
 * stale row can be acted on under the new scope.
 */
watch(
  () => props.variant,
  () => {
    users.value = []
    confirmTarget.value = null
    editing.value = null
    // The message was about the OTHER population; carrying it across would
    // report a refusal that has nothing to do with what is now on screen.
    actionError.value = null
    void load()
  }
)
</script>
