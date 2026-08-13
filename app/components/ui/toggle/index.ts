import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Toggle } from './Toggle.vue'

/**
 * Selected state uses the brand primary, not `bg-muted`.
 *
 * `--muted` is `--color-neutral-100` and `--background` is `--color-neutral-50`:
 * the shadcn default selected state was a ~1.05:1 fill against the page, so a
 * selected toggle was indistinguishable from an unselected one at a glance.
 * `--primary-foreground` on `--primary` is 8.2:1 (DESIGN.md §9.1), and the
 * unselected state is pushed down to `text-muted-foreground` so the on/off
 * difference is carried by BOTH fill and text weight of colour, not fill alone.
 */
export const toggleVariants = cva(
  'text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary-dark data-[state=on]:hover:text-primary-foreground gap-1 rounded-lg text-sm font-medium transition-all [&_svg:not([class*=size-])]:size-4 group/toggle hover:bg-muted inline-flex items-center justify-center whitespace-nowrap outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border-input hover:bg-muted data-[state=on]:border-primary border bg-transparent',
      },
      size: {
        default:
          'h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        sm: 'h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*=size-])]:size-3.5',
        lg: 'h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export type ToggleVariants = VariantProps<typeof toggleVariants>
