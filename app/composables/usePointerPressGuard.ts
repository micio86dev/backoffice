import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Defers a field's blur validation while a pointer press is in progress.
 *
 * Pressing another control blurs the focused field first. If that blur inserts
 * an error ABOVE the control being pressed, the control moves between
 * pointerdown and pointerup and the click is lost. While the pointer is down,
 * `guardBlur` queues the validation instead of running it; it runs right after
 * the press ends (a macrotask later, so the click has already been dispatched).
 * Keyed on the POINTER, not on where focus went: a keyboard user tabbing away
 * still validates immediately, and in WebKit a pressed button does not take
 * focus at all, so `relatedTarget` would miss it. Same contract as the
 * candidate frontend's identity form (DESIGN.md section 16.19).
 */
export function usePointerPressGuard(): { guardBlur: (validate: () => unknown) => void } {
  let pressing = false
  const pending = new Set<() => unknown>()

  function onDown(): void {
    pressing = true
  }

  function onUp(): void {
    if (!pressing) return
    pressing = false
    setTimeout(flush, 0)
  }

  function flush(): void {
    if (pressing) return
    const queued = [...pending]
    pending.clear()
    for (const validate of queued) validate()
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('pointercancel', onUp, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('pointerup', onUp, true)
    document.removeEventListener('pointercancel', onUp, true)
    pending.clear()
  })

  function guardBlur(validate: () => unknown): void {
    if (pressing) pending.add(validate)
    else validate()
  }

  return { guardBlur }
}
