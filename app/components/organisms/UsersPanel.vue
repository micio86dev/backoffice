<template>
  <div class="flex flex-col gap-4">
    <!-- The section title lives in the settings page header; repeating it here
         would give the panel two competing headings. -->
    <div class="flex items-center justify-end">
      <Button data-testid="users-new" @click="editing = 'new'">{{ $t('users.new') }}</Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('users.table.name') }}</TableHead>
          <TableHead>{{ $t('users.table.email') }}</TableHead>
          <TableHead>{{ $t('users.table.accessLevel') }}</TableHead>
          <TableHead>{{ $t('users.table.state') }}</TableHead>
          <TableHead>
            <span class="sr-only">{{ $t('users.table.actions') }}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="users.length === 0" :colspan="5">
          {{ $t('users.table.empty') }}
        </TableEmpty>
        <TableRow v-for="user in users" :key="user.id">
          <TableCell>{{ user.name }}</TableCell>
          <TableCell>{{ user.email }}</TableCell>
          <TableCell>
            <AccessLevelBadge :role="String(user.role)" />
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

    <Dialog :open="editing !== null" @update:open="(open) => !open && (editing = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editing === 'new' ? $t('users.new') : $t('users.edit') }}</DialogTitle>
        </DialogHeader>
        <UserForm v-if="editing !== null" :user="editingUser" @saved="onFormSaved" />
      </DialogContent>
    </Dialog>

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
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import AccessLevelBadge from '@/components/atoms/AccessLevelBadge.vue'
import UserStateBadge from '@/components/atoms/UserStateBadge.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import UserForm from '@/components/organisms/UserForm.vue'
import { useUsers, type UserListResponse } from '@/composables/useUsers'

type User = UserListResponse['data'][number]

const { listUsers, deactivateUser, activateUser } = useUsers()

const users = ref<User[]>([])
const editing = ref<'new' | number | null>(null)
const confirmTarget = ref<{ user: User; action: 'deactivate' | 'activate' } | null>(null)

const editingUser = computed<User | null>(() => {
  if (editing.value === null || editing.value === 'new') return null
  return users.value.find((user) => user.id === editing.value) ?? null
})

async function load(): Promise<void> {
  const response = await listUsers()
  users.value = response.data
}

async function onFormSaved(): Promise<void> {
  editing.value = null
  await load()
}

async function onConfirmAction(): Promise<void> {
  if (confirmTarget.value === null) return
  const { user, action } = confirmTarget.value
  confirmTarget.value = null
  if (action === 'deactivate') {
    await deactivateUser(user.id)
  } else {
    await activateUser(user.id)
  }
  await load()
}

onMounted(() => {
  void load()
})
</script>
