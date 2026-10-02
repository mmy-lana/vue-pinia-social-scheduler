<script setup lang="ts">
/**
 * One cell of the month grid.
 *
 * The cell itself is the tap target: it opens that day's list, where posts can
 * be added or opened. Chips inside it stop propagation so tapping a post opens
 * the post rather than the day.
 *
 * Only two chips are drawn; the rest collapse into an explicit "+N more"
 * *button* that opens the same day list — never a hover-only affordance. The
 * cell carries `data-drop-day`, which is the hook the drag-to-reschedule
 * gesture looks for.
 */
import { computed } from 'vue'
import CalendarPostChip from '@/components/calendar/CalendarPostChip.vue'
import { cx } from '@/lib/utils'
import { dayOfMonth, formatDayWithWeekday } from '@/lib/datetime'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { Post } from '@/types'

const props = defineProps<{
  dayKey: string
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  /** Set when a drag is hovering this cell. */
  isDropTarget?: boolean
  posts: Post[]
}>()

const emit = defineEmits<{
  select: [dayKey: string]
  add: [dayKey: string]
  openPost: [post: Post]
  'drag-start': [event: PointerEvent, post: Post]
}>()

const settings = useSettingsStore()

/** Two chips, then a count — the grid stays legible at any month size. */
const MAX_CHIPS = 2

const visible = computed<Post[]>(() => props.posts.slice(0, MAX_CHIPS))
const overflow = computed<number>(() => Math.max(0, props.posts.length - MAX_CHIPS))
const dayNumber = computed<number>(() => dayOfMonth(props.dayKey))
const fullLabel = computed<string>(() => formatDayWithWeekday(props.dayKey, settings.tz))
</script>

<template>
  <div
    :data-drop-day="dayKey"
    :data-day-key="dayKey"
    :data-today="isToday ? 'true' : 'false'"
    :data-drop-target="isDropTarget ? 'true' : 'false'"
    class="flex min-h-24 flex-col gap-1 border-e border-b border-line p-1 last:border-e-0"
    :class="cx(inMonth ? 'bg-surface' : 'bg-surface-muted/40', isDropTarget && 'bg-brand-50 dark:bg-brand-500/10')"
    data-testid="calendar-day-cell"
  >
    <div class="flex items-center justify-between gap-1">
      <button
        type="button"
        :class="
          cx(
            'tap-target flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
            'motion-safe:transition-colors motion-safe:duration-150',
            isToday
              ? 'bg-brand-600 text-white'
              : isSelected
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : inMonth
                  ? 'text-ink motion-safe:hover:bg-surface-muted'
                  : 'text-ink-muted',
          )
        "
        :aria-label="`${fullLabel}, ${posts.length} posts`"
        :aria-current="isToday ? 'date' : undefined"
        data-testid="calendar-day-number"
        @click="emit('select', dayKey)"
      >
        {{ dayNumber }}
      </button>

      <button
        type="button"
        class="tap-target flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted motion-safe:hover:bg-surface-muted motion-safe:hover:text-ink"
        :aria-label="`Add a post on ${fullLabel}`"
        data-testid="calendar-day-add"
        @click="emit('add', dayKey)"
      >
        +
      </button>
    </div>

    <CalendarPostChip
      v-for="post in visible"
      :key="post.id"
      :post="post"
      @open="emit('openPost', $event)"
      @drag-start="(event, dragged) => emit('drag-start', event, dragged)"
    />

    <button
      v-if="overflow > 0"
      type="button"
      class="tap-target w-full rounded-control px-1 text-start text-xs font-medium text-brand-600 motion-safe:hover:bg-surface-muted dark:text-brand-300"
      :aria-label="`Show ${overflow} more posts on ${fullLabel}`"
      data-testid="calendar-day-overflow"
      @click="emit('select', dayKey)"
    >
      +{{ overflow }} more
    </button>
  </div>
</template>