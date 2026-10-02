import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUiStore } from '@/stores/useUiStore'
import {
  addDaysToKey,
  dayKey,
  dayKeyOf,
  dayOfMonth,
  formatDayLabel,
  formatMonthTitle,
  formatWeekTitle,
  isValidDateKey,
  monthMatrixKeys,
  shiftMonthKey,
  shiftWeekKey,
  weekKeys,
} from '@/lib/datetime'
import type { AgendaGroup, CalendarView, DayCellModel, Post } from '@/types'

/** Rows of the week view, in the user's local time. */
export interface WeekColumn {
  key: string
  dayNumber: number
  label: string
  isToday: boolean
  isSelected: boolean
  posts: Post[]
}

export interface CalendarGrid {
  anchor: Ref<string>
  view: Ref<CalendarView>
  selectedKey: Ref<string | null>
  monthCells: ComputedRef<DayCellModel[]>
  weekColumns: ComputedRef<WeekColumn[]>
  agendaGroups: ComputedRef<AgendaGroup[]>
  monthTitle: ComputedRef<string>
  weekTitle: ComputedRef<string>
  agendaTitle: ComputedRef<string>
  todayKey: ComputedRef<string>
  visibleKeys: ComputedRef<string[]>
  goNext: () => void
  goPrevious: () => void
  goToday: () => void
  setView: (next: CalendarView) => void
  select: (key: string) => void
  postsFor: (key: string) => Post[]
  addOn: (key: string) => void
  openPost: Ref<Post | null>
  setOpenPost: (post: Post | null) => void
}

/**
 * Month / week / agenda grid model.
 *
 * The anchor is a local `yyyy-MM-dd` key, so "today", "this week" and "this
 * month" always mean the user's calendar, not the browser's.
 */
export function useCalendarGrid(options: { initialView?: CalendarView } = {}): CalendarGrid {
  const posts = usePostsStore()
  const settings = useSettingsStore()
  const ui = useUiStore()

  const todayKey = computed(() => dayKeyOf(new Date(), settings.tz))
  const anchor = ref(isValidDateKey(todayKey.value) ? todayKey.value : todayKey.value)
  const view = ref<CalendarView>(options.initialView ?? settings.settings.calendarView)
  const selectedKey = ref<string | null>(todayKey.value)
  const openPost = ref<Post | null>(null)

  const postsByKey = (key: string): Post[] => posts.byDay.get(key) ?? []

  const monthCells = computed<DayCellModel[]>(() => {
    const anchorMonth = anchor.value.slice(0, 7)
    return monthMatrixKeys(anchor.value, settings.weekStartsOn).map((key) => ({
      key,
      date: new Date(`${key}T00:00:00.000Z`),
      inMonth: key.startsWith(anchorMonth),
      isToday: key === todayKey.value,
      isSelected: key === selectedKey.value,
      posts: postsByKey(key),
    }))
  })

  const weekColumns = computed<WeekColumn[]>(() => {
    const keys = weekKeys(anchor.value, settings.weekStartsOn)
    return keys.map((key) => ({
      key,
      dayNumber: dayOfMonth(key),
      label: formatDayLabel(key, settings.tz, new Date()),
      isToday: key === todayKey.value,
      isSelected: key === selectedKey.value,
      posts: postsByKey(key),
    }))
  })

  const visibleKeys = computed<string[]>(() =>
    view.value === 'week'
      ? weekKeys(anchor.value, settings.weekStartsOn)
      : monthMatrixKeys(anchor.value, settings.weekStartsOn),
  )

  const agendaGroups = computed<AgendaGroup[]>(() =>
    visibleKeys.value.map((key) => ({
      key,
      label: formatDayLabel(key, settings.tz, new Date()),
      posts: postsByKey(key),
    })),
  )

  const monthTitle = computed(() => formatMonthTitle(anchor.value))
  const weekTitle = computed(() =>
    formatWeekTitle(weekKeys(anchor.value, settings.weekStartsOn), settings.tz),
  )
  const agendaTitle = computed(() => weekTitle.value)

  function goNext(): void {
    anchor.value =
      view.value === 'month'
        ? shiftMonthKey(anchor.value, 1)
        : shiftWeekKey(anchor.value, settings.weekStartsOn, 1)
  }

  function goPrevious(): void {
    anchor.value =
      view.value === 'month'
        ? shiftMonthKey(anchor.value, -1)
        : shiftWeekKey(anchor.value, settings.weekStartsOn, -1)
  }

  function goToday(): void {
    anchor.value = todayKey.value
    selectedKey.value = todayKey.value
  }

  function setView(next: CalendarView): void {
    view.value = next
    settings.update({ calendarView: next })
  }

  function select(key: string): void {
    selectedKey.value = key
  }

  function postsFor(key: string): Post[] {
    return postsByKey(key)
  }

  function addOn(key: string): void {
    ui.openComposer({ presetDate: key })
  }

  function setOpenPost(post: Post | null): void {
    openPost.value = post
  }

  return {
    anchor,
    view,
    selectedKey,
    monthCells,
    weekColumns,
    agendaGroups,
    monthTitle,
    weekTitle,
    agendaTitle,
    todayKey,
    visibleKeys,
    goNext,
    goPrevious,
    goToday,
    setView,
    select,
    postsFor,
    addOn,
    openPost,
    setOpenPost,
  }
}

/** Local day key of an instant, re-exported so calendar components need one import. */
export { dayKey, addDaysToKey }
