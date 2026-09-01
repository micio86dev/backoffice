import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'h-5 gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',

        /*
         * Status variants (DESIGN.md §3.1 semantic tokens, §9.1 contrast).
         *
         * A lifecycle status was previously rendered with `default`, which is
         * `bg-primary` — the Quint purple. So "completed" and "active" were the
         * brand colour, carrying no meaning at all: the badge told you a state
         * existed without telling you whether it was good, bad or pending, and
         * spent the brand's most emphatic colour doing it.
         *
         * These read from the existing `--color-*` tokens rather than fresh
         * hexes, so they follow the theme and cannot drift from DESIGN.md.
         *
         * Light mode uses the text-safe `-dark` foregrounds; `--color-success`
         * and `--color-warning` are marked *non-text: icons/fills only* in
         * §3.1 and measure below AA on their own tint. Dark mode inverts the
         * pair for the same reason the alerts do: a pale fill on a dark ground
         * is a glare.
         */
        success:
          'bg-success-light text-success-dark dark:bg-success/15 dark:text-success [a]:hover:bg-success-light/70',
        warning:
          'bg-warning-light text-warning-dark dark:bg-warning/15 dark:text-warning [a]:hover:bg-warning-light/70',
        info: 'bg-info-light text-info-dark dark:bg-info/15 dark:text-info [a]:hover:bg-info-light/70',
        neutral: 'bg-muted text-muted-foreground dark:bg-muted/50 [a]:hover:bg-muted/70',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
