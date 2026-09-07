/**
 * Shared class for the native `<select>` and `<input>` elements that cannot go
 * through the vendored `Select` / `Input` components, because a `field.type`
 * switch or a `setValue`-driven test needs the real element.
 *
 * The app uses a native `<select>` wherever the control has to be driven by
 * `setValue`/`change` (filter rows, the provider picker) rather than the
 * reka-ui `Select`. Those had drifted into four different looks across three
 * files — `h-8` (32 px), `h-(--spacing-control-sm)` (36 px), and twice a bare
 * `rounded-md border border-border px-3 py-2` with no height, no focus ring and
 * the wrong border token. At 32 px a native select clips its own text: the
 * option line box plus the platform's vertical padding does not fit, and unlike
 * a styled div a native select will not let the text overflow visibly.
 *
 * Height is `--spacing-control` (44 px), the same as a default `Input` and a
 * default `Select` trigger, so a select never reads as a shrunken input beside
 * one. DESIGN.md §16.8 allows `--spacing-control-sm` for dense contexts, but
 * NOT for native selects, exactly because of the clipping above.
 *
 * Focus, invalid and disabled states mirror `ui/input/Input.vue` so the two
 * controls stay one vocabulary.
 */
/**
 * Everything both controls share EXCEPT the horizontal padding.
 *
 * Split out so the select's arrow gutter is a different padding rather than an
 * override of one. `cn(formControlClass, 'pr-9')` was the first attempt and it
 * does not do what it looks like: verified against the installed
 * tailwind-merge, `twMerge('px-2.5','pr-9')` returns `"px-2.5 pr-9"` — both
 * survive, because its conflict map lets a later `px` remove an earlier `pr`
 * but never the reverse. The gutter then applied only because Tailwind happens
 * to emit `pr` utilities after `px` in the generated stylesheet, which is CSS
 * source order — the exact mechanism the comment claimed `cn()` was avoiding.
 * Correct by luck, documented as correct by design.
 *
 * Two disjoint padding sets conflict with nothing, so neither the class order
 * nor the stylesheet order can decide the outcome.
 */
const controlBase =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-(--spacing-control) w-full rounded-lg border bg-background text-base transition-colors outline-none focus-visible:ring-3 aria-invalid:ring-3 disabled:cursor-not-allowed disabled:opacity-50'

export const formControlClass = `${controlBase} px-2.5`

/**
 * The same control, with room for the arrow a native `<select>` draws itself.
 *
 * `pl-2.5 pr-9` rather than `px-2.5` plus an override: 10px on the left to
 * match every other control, 36px on the right to clear the platform's
 * disclosure arrow. On a wide field nobody notices the gutter's absence —
 * give the select a width and a `truncate`, as the topbar client switcher
 * does, and the value renders underneath the arrow.
 *
 * A SEPARATE export rather than folding the gutter into `formControlClass`,
 * because that class is shared with the raw `<input>`s that cannot go through
 * `ui/input` either, and an input padded for an arrow it does not have reads
 * as a misaligned field.
 *
 * Enforced by `tests/unit/arch/native-select-styling.spec.ts`: DESIGN.md §16.8
 * has required a single shared class since four hand-written variants drifted
 * across three files, and it was re-broken the same way afterwards. The rule
 * needed a mechanism, not another paragraph.
 */
export const formSelectClass = `${controlBase} pl-2.5 pr-9`
