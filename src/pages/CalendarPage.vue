<script setup lang="ts">
/**
 * Month, week and agenda, plus drag-to-reschedule.
 *
 * The grid model (`useCalendarGrid`) owns the anchor, the view and the day
 * buckets; this page only decides what to draw and what a tap means. Below
 * 768 px the month view becomes a compact dot grid — tapping a day selects it
 * and the agenda below lists it — because a 7-column month on a phone is
 * unreadable at any density that still meets the 44 px target.
 *
 * Dragging is additive. The card's `Reschedule…` action reaches the same
 * `postsStore.reschedule` without a pointer, so the feature is never
 * pointer-only, and drag is disabled below 768 px where it would fight the
 * page scroll.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import AgendaList from '@/components/calendar/AgendaList.vue'
import CalendarToolbar from '@/components/calendar/CalendarToolbar.vue'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import PostPreviewSheet from '@/components/calendar/PostPreviewSheet.vue'
import WeekGrid from '@/components/calendar/WeekGrid.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useCalendarGrid } from '@/composables/useCalendarGrid'
import { useDragReschedule } from '@/composables/useDragReschedule'
import { usePostActions } from '@/composables/usePostActions'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUiStore } from '@/stores/useUiStore'
import { formatDateTime, utcIsoToZonedParts, zonedToUtcIso } from '@/lib/datetime'
import type { Post, PostActionId } from '@/types'

const posts = usePostsStore()
const settings = useSettingsStore()
const ui = useUiStore()
const actions = usePostActions()
const { isMobile } = useBreakpoint()

const grid = useCalendarGrid()
const selected = ref<string | null>(grid.selectedKey.value)

const title = computed<string>(() => {
  switch (grid.view.value) {
    case 'month':
      return grid.monthTitle.value
    case 'week':
      return grid.weekTitle.value
    case 'agenda':
    default:
      return grid.agendaTitle.value
  }
})

/** Dragging is a pointer enhancement, off wherever touch scrolling would fight it. */
const drag = useDragReschedule({
  isEnabled: () =>
    !isMobile.value && (grid.view.value === 'month' || grid.view.value === 'week'),
  resolveIso: (post, targetKey) => {
    if (post.scheduledAt === null) return null
    const { time } = utcIsoToZonedParts(post.scheduledAt, settings.tz)
    return zonedToUtcIso(targetKey, time, settings.tz)
  },
  applyIso: async (post, iso) => {
    const previous = post.scheduledAt
    const result = posts.reschedule(post.id, iso)
    if (!result.ok) {
      ui.toast({ tone: 'danger', message: result.error })
      return
    }
    ui.toast({
      tone: 'ok',
      message: `Moved to ${formatDateTime(iso, settings.tz, settings.is24h)}`,
      actionLabel: 'Undo',
      onAction: () => {
        if (previous !== null) posts.reschedule(post.id, previous)
      },
    })
  },
})

useEventListener(window, 'pointermove', drag.move, { passive: true })
useEventListener(window, 'pointerup', drag.end)
useEventListener(window, 'pointercancel', drag.cancel)

const ghostStyle = computed(() => {
  const ghost = drag.ghost.value
  if (ghost === null) return {}
  return {
    transform: `translate(${ghost.x + 12}px, ${ghost.y + 12}px)`,
    width: `${ghost.width}px`,
  }
})

function onSelect(dayKey: string): void {
  grid.select(dayKey)
  selected.value = dayKey
}

function onAction(postId: string, action: PostActionId): void {
  grid.setOpenPost(null)
  void actions.run(postId, action)
}

function openPost(post: Post): void {
  grid.setOpenPost(post)
}

onMounted(() => {
  grid.select(grid.todayKey.value)
  selected.value = grid.todayKey.value
})

onBeforeUnmount(() => drag.cancel())
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
    <CalendarToolbar
      :title="title"
      :view="grid.view.value"
      @previous="grid.goPrevious()"
      @next="grid.goNext()"
      @today="grid.goToday()"
      @update:view="grid.setView"
    />

    <div class="card-surface mt-4 overflow-hidden rounded-card">
      <MonthGrid
        v-if="grid.view.value === 'month'"
        :cells="grid.monthCells.value"
        :drop-target="drag.targetKey.value"
        @select="onSelect"
        @add="grid.addOn($event)"
        @open-post="openPost"
        @drag-start="drag.start"
      />

      <WeekGrid
        v-else-if="grid.view.value === 'week'"
        :columns="grid.weekColumns.value"
        :drop-target="drag.targetKey.value"
        @add="grid.addOn($event)"
        @open-post="openPost"
        @drag-start="drag.start"
      />

      <AgendaList
        v-else
        :groups="grid.agendaGroups.value"
        :selected-key="selected"
        @add="grid.addOn($event)"
        @open-post="openPost"
        @action="onAction"
      />
    </div>

    <p class="mt-3 text-xs text-ink-muted" data-testid="calendar-drag-hint">
      <span v-if="isMobile">Tap a post to open it, or a day to add one.</span>
      <span v-else>
        Drag a post onto another day to move it, or use Reschedule in its menu.
      </span>
    </p>

    <PostPreviewSheet
      :post="grid.openPost.value"
      @close="grid.setOpenPost(null)"
      @action="onAction"
    />

    <Teleport to="body">
      <div
        v-if="drag.ghost.value"
        class="pointer-events-none fixed top-0 left-0 z-[70] max-w-64 rounded-control border border-brand-300 bg-surface px-3 py-2 text-sm text-ink opacity-90 shadow-pop"
        :style="ghostStyle"
        aria-hidden="true"
        data-testid="calendar-drag-ghost"
      >
        {{ drag.ghost.value.label }}
      </div>
    </Teleport>
  </div>
</template>