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
export const formControlClass =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-(--spacing-control) w-full rounded-lg border bg-background px-2.5 text-base transition-colors outline-none focus-visible:ring-3 aria-invalid:ring-3 disabled:cursor-not-allowed disabled:opacity-50'
