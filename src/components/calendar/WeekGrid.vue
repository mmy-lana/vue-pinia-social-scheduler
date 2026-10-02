<script setup lang="ts">
/**
 * The week view: seven day columns against a 24-hour time axis.
 *
 * Posts are positioned by their local time, so an 09:00 post sits on the 09:00
 * row wherever the reader's timezone puts it. Chips in the same hour stack
 * rather than overlap, and the body scrolls to the current hour on mount — a
 * week that opens on an empty midnight is a week nobody reads.
 *
 * Every column carries `data-drop-day`, so a chip dragged here lands on the day
 * whose column it was released over. That path is additive: `PostActionsMenu →
 * Reschedule…` is the same operation without a pointer.
 */
import { computed, nextTick, onMounted, useTemplateRef } from 'vue'
import CalendarPostChip from '@/components/calendar/CalendarPostChip.vue'
import type { WeekColumn } from '@/composables/useCalendarGrid'
import { minutesOfDay } from '@/lib/datetime'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { Post } from '@/types'

const props = defineProps<{
  columns: WeekColumn[]
  dropTarget?: string | null
}>()

const emit = defineEmits<{
  select: [dayKey: string]
  add: [dayKey: string]
  openPost: [post: Post]
  'drag-start': [event: PointerEvent, post: Post]
}>()

const settings = useSettingsStore()

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** One hour is 64 px, so a chip is comfortably taller than a touch target. */
const HOUR_HEIGHT = 64

const body = useTemplateRef<HTMLElement>('body')

interface PositionedPost {
  post: Post
  top: number
}

function positionsFor(column: WeekColumn): PositionedPost[] {
  const buckets = new Map<number, Post[]>()
  for (const post of column.posts) {
    if (post.scheduledAt === null) continue
    const hour = Math.floor(minutesOfDay(post.scheduledAt, settings.tz) / 60)
    const bucket = buckets.get(hour)
    if (bucket) bucket.push(post)
    else buckets.set(hour, [post])
  }
  return [...buckets.entries()].flatMap(([hour, list]) =>
    list
      .slice()
      .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
      .map((post, index) => ({ post, top: hour * HOUR_HEIGHT + index * 44 })),
  )
}

const positioned = computed<{ column: WeekColumn; items: PositionedPost[] }[]>(() =>
  props.columns.map((column) => ({ column, items: positionsFor(column) })),
)

function scrollToNow(): void {
  const element = body.value
  if (!element) return
  const hour = new Date().getHours()
  element.scrollTop = Math.max(0, hour * HOUR_HEIGHT - HOUR_HEIGHT * 2)
}

onMounted(async () => {
  await nextTick()
  scrollToNow()
})
</script>

<template>
  <div class="flex flex-col" data-testid="calendar-week-grid">
    <div class="grid grid-cols-7 border-b border-line bg-surface-muted">
      <div
        v-for="column in columns"
        :key="column.key"
        class="px-1 py-2 text-center"
      >
        <p class="truncate text-xs font-semibold text-ink-muted">{{ column.label }}</p>
        <p
          class="text-sm font-bold text-ink tabular-nums"
          :class="column.isToday ? 'text-brand-600 dark:text-brand-300' : ''"
        >
          {{ column.dayNumber }}
        </p>
      </div>
    </div>

    <div
      ref="body"
      class="max-h-[60vh] overflow-y-auto"
      :style="{ height: `${HOUR_HEIGHT * 12}px` }"
      data-testid="calendar-week-body"
    >
      <div class="relative grid grid-cols-7">
        <div
          v-for="hour in HOURS"
          :key="hour"
          class="pointer-events-none absolute inset-x-0 border-t border-line"
          :style="{ top: `${hour * HOUR_HEIGHT}px` }"
          aria-hidden="true"
        >
          <span class="sr-only">{{ String(hour).padStart(2, '0') }}:00</span>
        </div>

        <div
          v-for="entry in positioned"
          :key="entry.column.key"
          :data-drop-day="entry.column.key"
          :data-day-key="entry.column.key"
          :data-drop-target="dropTarget === entry.column.key ? 'true' : 'false'"
          class="relative border-e border-line last:border-e-0"
          :class="dropTarget === entry.column.key ? 'bg-brand-50 dark:bg-brand-500/10' : ''"
          :style="{ height: `${HOUR_HEIGHT * 24}px` }"
          data-testid="calendar-week-column"
        >
          <div
            v-for="item in entry.items"
            :key="item.post.id"
            class="absolute inset-x-1"
            :style="{ top: `${item.top}px` }"
            @pointerdown="emit('drag-start', $event, item.post)"
          >
            <CalendarPostChip
              :post="item.post"
              variant="column"
              @open="emit('openPost', $event)"
            />
          </div>

          <button
            type="button"
            class="tap-target absolute inset-x-0 top-0 h-6"
            :aria-label="`Add a post on ${entry.column.label}`"
            data-testid="calendar-column-add"
            @click="emit('add', entry.column.key)"
          >
            <span class="sr-only">Add</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>