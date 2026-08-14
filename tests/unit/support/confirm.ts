/**
 * confirmDialog() (dates-and-destructive-actions, design D6)
 *
 * `ConfirmDialog` renders through reka-ui's `AlertDialog`, which teleports
 * to `document.body` — `wrapper.find('[data-testid="confirm-dialog-confirm"]')`
 * will never match. Query `document.body` directly instead, mirroring the
 * working shape already proven in `ConfirmDialog.spec.ts` and
 * `ApiKeysPanel.spec.ts`.
 */
import { flushPromises } from '@vue/test-utils'

export async function confirmDialog(action: 'confirm' | 'cancel' = 'confirm'): Promise<void> {
  const button = document.body.querySelector<HTMLButtonElement>(
    `[data-testid="confirm-dialog-${action}"]`
  )
  if (!button) throw new Error(`No open ConfirmDialog: confirm-dialog-${action} not found`)

  // A real click is preceded by pointerdown/mouseup — dispatched explicitly
  // because reka-ui's AlertDialogAction/AlertDialogCancel close the dialog as
  // part of their OWN click handling, and ConfirmDialog.vue's
  // `suppressNextCancel` guard (which stops that auto-close from ALSO
  // emitting a spurious 'cancel' after 'confirm') is armed on pointerdown,
  // matching real pointer-driven interaction. A bare `.click()` does not
  // reliably trigger reka-ui's dismissable-layer-gated handlers in jsdom/
  // happy-dom (proven first in ApiKeysPanel.spec.ts's revoke test).
  button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}
