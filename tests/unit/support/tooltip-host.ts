/**
 * Test host that supplies reka-ui's TooltipProvider context.
 *
 * `TooltipRoot` injects the provider context and THROWS when it is absent
 * (reka-ui `createContext` has no fallback for it). In the running app the
 * provider is mounted once, application-wide, by `SidebarProvider` inside
 * `layouts/default.vue` — a component spec mounts its subject outside that
 * layout, so it has to bring the provider with it.
 *
 * Deliberately not a second provider in the components themselves: nesting
 * providers changes the shared open/close delay behaviour for every tooltip
 * on the page.
 */
import { defineComponent, h, type Component } from 'vue'
import { TooltipProvider } from 'reka-ui'

export function withTooltipProvider(
  component: Component,
  props: Record<string, unknown> = {}
): Component {
  return defineComponent({
    name: 'TooltipHost',
    render: () => h(TooltipProvider, { delayDuration: 0 }, { default: () => h(component, props) }),
  })
}
