import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Alert } from './Alert.vue'
export { default as AlertAction } from './AlertAction.vue'
export { default as AlertDescription } from './AlertDescription.vue'
export { default as AlertTitle } from './AlertTitle.vue'

export const alertVariants = cva(
  'grid gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*=size-])]:size-4 group/alert relative w-full',
  {
    variants: {
      /**
       * Outcome variants (DESIGN.md §3.1 semantic tokens, §9.1 contrast).
       *
       * Each state tints its whole SURFACE and its border, rather than only
       * recolouring the text. That is the actual fix: `destructive` used to be
       * red words on the same white card as `default`, so a failed save and a
       * successful one were the same box at a glance, and success had no
       * colour of its own at all.
       *
       * Light mode uses the `-light` fill with the text-safe `-dark`
       * foreground — never `--color-success` / `--color-warning` as text,
       * which §3.1 marks "non-text: icons/fills only" and which measure below
       * AA on their own tint (asserted, as a failure, in theme.spec.ts).
       *
       * Dark mode inverts the relationship rather than reusing the same
       * tokens: a `#dcfce7` fill on a dark surface is a glare, so the fill
       * becomes the saturated hue at low alpha and that same hue — legible
       * against a dark ground where it was not against a pale one — becomes
       * the text.
       *
       * No side-stripe accent border. A thick `border-l` is the reflex
       * decoration for status callouts and reads as template output; a full
       * border on a tinted surface carries the same signal without it.
       */
      variant: {
        default: 'bg-card text-card-foreground',
        success:
          'border-success/35 bg-success-light text-success-dark dark:border-success/30 dark:bg-success/15 dark:text-success *:data-[slot=alert-description]:text-current/90 *:[svg]:text-current',
        warning:
          'border-warning/40 bg-warning-light text-warning-dark dark:border-warning/30 dark:bg-warning/15 dark:text-warning *:data-[slot=alert-description]:text-current/90 *:[svg]:text-current',
        destructive:
          'border-destructive/35 bg-error-light text-destructive dark:border-destructive/30 dark:bg-destructive/15 dark:text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export type AlertVariants = VariantProps<typeof alertVariants>
