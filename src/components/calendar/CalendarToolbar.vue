<script setup lang="ts">
/**
 * Calendar navigation: where the period is, how to move it, and which view.
 *
 * The view control is a segmented radiogroup because the three views are
 * alternatives, not toggles. The title is a live region, so changing month
 * announces itself without moving focus.
 */
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIconButton from '@/components/ui/BaseIconButton.vue'
import BaseSegmented from '@/components/ui/BaseSegmented.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import type { CalendarView } from '@/types'

/**
 * `showViewPicker` is declared `undefined` explicitly because Vue casts an
 * absent Boolean prop to `false` rather than `undefined` — which would make the
 * `??` fallback below silently unreachable and hide the view switcher on every
 * screen size.
 */
const props = withDefaults(
  defineProps<{
    title: string
    view: CalendarView
    /** Hidden on a phone, where the view picker would crowd the toolbar. */
    showViewPicker?: boolean
  }>(),
  {
    showViewPicker: undefined,
  },
)

const emit = defineEmits<{
  previous: []
  next: []
  today: []
  'update:view': [view: CalendarView]
}>()

const { isMobile } = useBreakpoint()

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'agenda', label: 'Agenda' },
]

const selectedView = computed<CalendarView>({
  get: () => props.view,
  set: (value) => emit('update:view', value as CalendarView),
})

const showPicker = computed<boolean>(() => props.showViewPicker ?? !isMobile.value)
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2"
    data-testid="calendar-toolbar"
  >
    <div class="flex items-center gap-1">
      <BaseIconButton
        label="Previous period"
        :icon="ChevronLeft"
        variant="ghost"
        data-testid="calendar-previous"
        @click="emit('previous')"
      />
      <BaseIconButton
        label="Next period"
        :icon="ChevronRight"
        variant="ghost"
        data-testid="calendar-next"
        @click="emit('next')"
      />
    </div>

    <h2
      class="min-w-0 flex-1 truncate text-base font-bold text-ink"
      aria-live="polite"
      data-testid="calendar-title"
    >
      {{ title }}
    </h2>

    <BaseButton
      variant="secondary"
      size="sm"
      data-testid="calendar-today"
      @click="emit('today')"
    >
      Today
    </BaseButton>

    <BaseSegmented
      v-if="showPicker"
      v-model="selectedView"
      :options="VIEW_OPTIONS"
      ariaLabel="Calendar view"
      size="sm"
      data-testid="calendar-view"
    />
  </div>
</template>