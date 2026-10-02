<script setup lang="ts">
/**
 * Bottom navigation for the < 768 px layout.
 *
 * Four destinations plus "More", so the bar is five slots and every label stays
 * short enough to never truncate. The current tab is marked with
 * `aria-current="page"` and a filled pill. Safe-area padding keeps the bar clear
 * of the home indicator on devices that have one.
 */
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { MoreHorizontal } from 'lucide-vue-next'
import { PRIMARY_NAV } from '@/components/shell/SidebarNav.vue'
import { cx } from '@/lib/utils'
import { useUiStore } from '@/stores/useUiStore'

const route = useRoute()
const ui = useUiStore()

const activeName = computed<string | null>(() => {
  const name = route.name
  return typeof name === 'string' ? name : null
})

/** Anything inside the More sheet counts as "More" being the current destination. */
const moreIsActive = computed<boolean>(
  () => activeName.value === 'channels' || activeName.value === 'settings',
)

function itemClasses(name: string): string {
  return cx(
    'tap-target flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5',
    'text-[11px] font-medium motion-safe:transition-colors motion-safe:duration-150',
    activeName.value === name ? 'text-brand-600 dark:text-brand-300' : 'text-ink-muted',
  )
}

function pillClasses(name: string): string {
  return cx(
    'flex size-7 items-center justify-center rounded-full',
    activeName.value === name ? 'bg-brand-50 dark:bg-brand-500/15' : '',
  )
}
</script>

<template>
  <nav
    class="z-40 shrink-0 border-t border-line bg-surface/95 backdrop-blur"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
    aria-label="Primary"
    data-testid="bottom-nav"
  >
    <ul class="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1.5">
      <li v-for="entry in PRIMARY_NAV" :key="entry.name" class="flex flex-1">
        <RouterLink
          :to="entry.to"
          :aria-current="activeName === entry.name ? 'page' : undefined"
          :class="itemClasses(entry.name)"
          :data-testid="`bottom-nav-${entry.name}`"
          :data-active="activeName === entry.name ? 'true' : 'false'"
        >
          <span :class="pillClasses(entry.name)">
            <component :is="entry.icon" class="size-5" aria-hidden="true" />
          </span>
          <span class="truncate">{{ entry.label }}</span>
        </RouterLink>
      </li>

      <li class="flex flex-1">
        <button
          type="button"
          :class="itemClasses('more')"
          :aria-expanded="ui.moreSheetOpen"
          aria-haspopup="dialog"
          data-testid="bottom-nav-more"
          :data-active="moreIsActive ? 'true' : 'false'"
          @click="ui.setMoreSheetOpen(true)"
        >
          <span :class="pillClasses('more')">
            <MoreHorizontal class="size-5" aria-hidden="true" />
          </span>
          <span class="truncate">More</span>
        </button>
      </li>
    </ul>
  </nav>
</template>