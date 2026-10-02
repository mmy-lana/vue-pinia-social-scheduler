<script setup lang="ts">
/**
 * The month grid: six rows of seven, starting on the user's chosen first day of
 * the week, plus the weekday header.
 *
 * It is a grid rather than a table because the cells are buttons and chips, not
 * tabular data; `role="grid"` with `role="row"`/`gridcell` still gives a screen
 * reader the row-then-cell reading order it needs.
 *
 * On a phone this view stays a compact dot grid — one dot per platform, three at
 * most — and tapping a day selects it, which the agenda panel below then lists.
 * Density is handled by hiding detail, never by removing tap targets.
 */
import { computed } from 'vue'
import DayCell from '@/components/calendar/DayCell.vue'
import { WEEKDAY_MIN } from '@/lib/datetime'
import { cx } from '@/lib/utils'
import { PLATFORMS } from '@/lib/platforms'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useBreakpoint } from '@/composables/useBreakpoint'
import type { DayCellModel, PlatformId, Post } from '@/types'

const props = defineProps<{
  cells: DayCellModel[]
  /** Day key the current drag is hovering. */
  dropTarget?: string | null
}>()

const emit = defineEmits<{
  select: [dayKey: string]
  add: [dayKey: string]
  openPost: [post: Post]
  'drag-start': [event: PointerEvent, post: Post]
}>()

const settings = useSettingsStore()
const accounts = useAccountsStore()
const { isMobile } = useBreakpoint()

/** Sunday-first or Monday-first, honouring the setting. */
const weekdayOrder = computed<number[]>(() => {
  const start = settings.weekStartsOn
  return Array.from({ length: 7 }, (_, index) => (start + index) % 7)
})

const compact = computed<boolean>(() => isMobile.value)

/** Up to three platform dots, so a busy day still fits a 44 px cell. */
function dotsFor(posts: Post[]): { color: string; key: string }[] {
  const seen = new Map<PlatformId, string>()
  for (const post of posts) {
    const account = accounts.get(post.accountId)
    const platform: PlatformId = account?.platform ?? 'x'
    if (seen.has(platform)) continue
    seen.set(platform, `${post.id}-${platform}`)
    if (seen.size === 3) break
  }
  return [...seen.entries()].map(([platform, key]) => ({
    color: PLATFORMS[platform].color,
    key,
  }))
}
</script>

<template>
  <div data-testid="calendar-month-grid">
    <div
      class="grid grid-cols-7 border-b border-line bg-surface-muted"
      role="row"
      data-testid="calendar-weekday-header"
    >
      <div
        v-for="weekday in weekdayOrder"
        :key="weekday"
        class="px-1 py-2 text-center text-xs font-semibold text-ink-muted"
        role="columnheader"
      >
        <span aria-hidden="true">{{ WEEKDAY_MIN[weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6] }}</span>
        <span class="sr-only">Day {{ weekday }}</span>
      </div>
    </div>

    <div v-if="compact" class="grid grid-cols-7" role="grid" aria-label="Month">
      <button
        v-for="cell in cells"
        :key="cell.key"
        type="button"
        :data-drop-day="cell.key"
        :data-day-key="cell.key"
        :data-today="cell.isToday ? 'true' : 'false'"
        :class="
          cx(
            'tap-target flex aspect-square flex-col items-center justify-center gap-1 border-e border-b border-line',
            cell.inMonth ? 'bg-surface' : 'bg-surface-muted/40',
            cell.isSelected && 'bg-brand-50 dark:bg-brand-500/10',
          )
        "
        :aria-label="`${cell.key}, ${cell.posts.length} posts`"
        :aria-current="cell.isToday ? 'date' : undefined"
        data-testid="calendar-compact-day"
        @click="emit('select', cell.key)"
      >
        <span
          :class="
            cx(
              'flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
              cell.isToday ? 'bg-brand-600 text-white' : cell.inMonth ? 'text-ink' : 'text-ink-muted',
            )
          "
        >
          {{ cell.date.getUTCDate() }}
        </span>
        <span class="flex h-1.5 items-center gap-0.5" aria-hidden="true">
          <span
            v-for="dot in dotsFor(cell.posts)"
            :key="dot.key"
            class="size-1.5 rounded-full"
            :style="{ backgroundColor: dot.color }"
          />
        </span>
      </button>
    </div>

    <div v-else class="grid grid-cols-7" role="grid" aria-label="Month">
      <DayCell
        v-for="cell in cells"
        :key="cell.key"
        :day-key="cell.key"
        :in-month="cell.inMonth"
        :is-today="cell.isToday"
        :is-selected="cell.isSelected"
        :is-drop-target="props.dropTarget === cell.key"
        :posts="cell.posts"
        @select="emit('select', $event)"
        @add="emit('add', $event)"
        @open-post="emit('openPost', $event)"
        @drag-start="(event, post) => emit('drag-start', event, post)"
      />
    </div>
  </div>
</template>