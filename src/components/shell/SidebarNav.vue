<script lang="ts">
import type { Component } from 'vue'

export interface NavEntry {
  name: string
  label: string
  to: string
  icon: Component
}

/**
 * The four destinations that fit a phone's bottom bar. `MoreSheet` carries the
 * rest, so the bar stays at five slots (four plus "More") with labels that never
 * truncate. `BottomNav` and `MoreSheet` read this same list, so phone and
 * desktop can never drift apart.
 */
export const PRIMARY_NAV: readonly NavEntry[] = [
  { name: 'dashboard', label: 'Timeline', to: '/dashboard', icon: Radio },
  { name: 'calendar', label: 'Calendar', to: '/calendar', icon: CalendarDays },
  { name: 'queue', label: 'Queue', to: '/queue', icon: ListOrdered },
  { name: 'library', label: 'Library', to: '/library', icon: Inbox },
]

/** Everything reachable from the desktop sidebar; the phone reaches it via More. */
export const SECONDARY_NAV: readonly NavEntry[] = [
  { name: 'channels', label: 'Channels', to: '/channels', icon: Users },
  { name: 'settings', label: 'Settings', to: '/settings', icon: Settings },
]
</script>

<script setup lang="ts">
/**
 * Primary navigation for the ≥ 1024 px layout.
 *
 * Six destinations, always labelled: an icon never carries meaning on its own.
 * The active row is marked with `aria-current="page"` plus a filled pill, so the
 * current page is legible without depending on colour alone.
 */
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { CalendarDays, Inbox, ListOrdered, Radio, Settings, Users } from 'lucide-vue-next'
import { cx } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    /**
     * 72 px icon rail for the 768–1023 px range. Labels stay in the accessible
     * name (and in a tooltip) rather than disappearing, so an icon-only rail is
     * still navigable by anyone who cannot see the glyph.
     */
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const ALL_ENTRIES = computed<NavEntry[]>(() => [...PRIMARY_NAV, ...SECONDARY_NAV])

const route = useRoute()

const activeName = computed<string | null>(() => {
  const name = route.name
  return typeof name === 'string' ? name : null
})

function linkClasses(name: string): string {
  return cx(
    'tap-target flex rounded-control text-sm font-medium',
    'motion-safe:transition-colors motion-safe:duration-150',
    props.compact ? 'justify-center px-0 py-2' : 'items-center gap-3 px-3',
    activeName.value === name
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
      : 'text-ink-muted motion-safe:hover:bg-surface-muted motion-safe:hover:text-ink',
  )
}
</script>

<template>
  <nav
    class="flex h-full flex-col gap-1 py-4"
    :class="props.compact ? 'px-2' : 'px-3'"
    aria-label="Primary"
    data-testid="sidebar-nav"
  >
    <RouterLink
      v-for="entry in ALL_ENTRIES"
      :key="entry.name"
      :to="entry.to"
      :aria-current="activeName === entry.name ? 'page' : undefined"
      :aria-label="entry.label"
      :title="props.compact ? entry.label : undefined"
      :class="linkClasses(entry.name)"
      :data-testid="`sidebar-nav-${entry.name}`"
      :data-active="activeName === entry.name ? 'true' : 'false'"
    >
      <component :is="entry.icon" class="size-5 shrink-0" aria-hidden="true" />
      <span v-if="!props.compact" class="truncate">{{ entry.label }}</span>
    </RouterLink>
  </nav>
</template>