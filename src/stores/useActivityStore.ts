import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ActivityEntrySchema, parseArray } from '@/lib/schemas'
import { newId } from '@/lib/utils'
import { STORE_KEYS, type PersistApi } from '@/stores/persistencePlugin'
import type { ActivityEntry, ActivityType } from '@/types'

export const ACTIVITY_LIMIT = 200
export const DASHBOARD_ACTIVITY_COUNT = 8

/** Newest-first activity log, capped so storage can never grow without bound. */
export const useActivityStore = defineStore('activity', () => {
  const entries = ref<ActivityEntry[]>([])
  const droppedCount = ref(0)

  const recent = computed(() => entries.value.slice(0, DASHBOARD_ACTIVITY_COUNT))
  const count = computed(() => entries.value.length)

  function log(type: ActivityType, message: string, postId: string | null = null): ActivityEntry {
    const entry: ActivityEntry = {
      id: newId(),
      postId,
      type,
      message,
      at: new Date().toISOString(),
    }
    entries.value = [entry, ...entries.value].slice(0, ACTIVITY_LIMIT)
    return entry
  }

  function prepend(list: readonly ActivityEntry[]): void {
    entries.value = [...list, ...entries.value].slice(0, ACTIVITY_LIMIT)
  }

  function removeForPost(postId: string): void {
    entries.value = entries.value.filter((entry) => entry.postId !== postId)
  }

  function removeManyForPosts(postIds: ReadonlySet<string>): void {
    if (postIds.size === 0) return
    entries.value = entries.value.filter(
      (entry) => entry.postId === null || !postIds.has(entry.postId),
    )
  }

  function clear(): void {
    entries.value = []
  }

  const persistApi: PersistApi<ActivityEntry[]> = {
    key: STORE_KEYS.activity,
    version: 1,
    read: () => entries.value,
    apply: (data) => {
      entries.value = data
    },
    parse: (raw) => parseArray(ActivityEntrySchema, raw),
    fallback: [],
  }

  return {
    entries,
    recent,
    count,
    droppedCount,
    log,
    prepend,
    removeForPost,
    removeManyForPosts,
    clear,
    persistApi,
  }
})
