/**
 * useExclusivePopover — "only one picker open at a time", by construction.
 *
 * The state lives at module scope, not inside each picker: every picker used to
 * own its own `isOpen`, so nothing could ever tell one that another had opened,
 * and two lists stayed open together. One shared id makes opening a picker close
 * whichever was open — there is no per-picker bookkeeping left to forget.
 *
 * Also owns the dismissal listeners (outside pointer press, focus moving out),
 * attached only while the picker is open.
 */
import { computed, getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'

const openId = ref<string | null>(null)
let nextId = 0

export function useExclusivePopover(root: Ref<HTMLElement | null>) {
  const id = `popover-${(nextId += 1)}`
  const isOpen = computed(() => openId.value === id)

  const open = (): void => {
    openId.value = id
  }
  const close = (): void => {
    if (openId.value === id) openId.value = null
  }
  const toggle = (): void => (isOpen.value ? close() : open())

  function dismissIfOutside(event: Event): void {
    const target = event.target as Node | null
    if (target !== null && root.value?.contains(target)) return
    close()
  }

  watch(
    isOpen,
    (now, _before, onCleanup) => {
      if (!now || typeof document === 'undefined') return
      document.addEventListener('pointerdown', dismissIfOutside, true)
      document.addEventListener('focusin', dismissIfOutside, true)
      onCleanup(() => {
        document.removeEventListener('pointerdown', dismissIfOutside, true)
        document.removeEventListener('focusin', dismissIfOutside, true)
      })
    },
    { immediate: true, flush: 'post' }
  )

  if (getCurrentInstance() !== null) onBeforeUnmount(close)

  return { isOpen, open, close, toggle }
}
