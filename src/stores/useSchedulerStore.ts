import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_CONCURRENT_PUBLISH,
  TICK_MS,
  acquireLease,
  isLeader,
  isMissed,
  nextRetryDelayMs,
  releaseLease,
  selectDuePosts,
  summarize,
  type SchedulerLease,
} from '@/lib/scheduler'
import { runPublish } from '@/lib/publisher'
import { readEnvelope, removeKey, writeEnvelope } from '@/lib/storage'
import { newId } from '@/lib/utils'
import { usePostsStore } from '@/stores/usePostsStore'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useMediaStore } from '@/stores/useMediaStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { useUiStore } from '@/stores/useUiStore'
import { flushPersistence } from '@/stores/persistencePlugin'
import { STORE_KEYS } from '@/stores/persistencePlugin'
import type { ISODateString } from '@/types'

/**
 * The publishing engine.
 *
 * A single tab holds a short lease in LocalStorage; only the lease holder
 * publishes, so two open tabs never send the same post twice. Every tick
 * re-reads the persisted posts, publishes what is due (up to three at a time),
 * and applies the outcome back to the store.
 */
export const useSchedulerStore = defineStore('scheduler', () => {
  const running = ref(false)
  const lastTickAt = ref<ISODateString | null>(null)
  const tabId = ref(newId())
  const isLeaderTab = ref(false)
  const inFlight = ref<string[]>([])
  const publishedCount = ref(0)
  const failedCount = ref(0)

  let timer: ReturnType<typeof setInterval> | null = null
  let ticking = false

  const isPublishing = computed(() => inFlight.value.length > 0)
  const publishingIds = computed(() => new Set(inFlight.value))

  function readLease(): SchedulerLease | null {
    return readEnvelope<SchedulerLease | null>(STORE_KEYS.schedulerLease, 1, null)
  }

  function writeLease(lease: SchedulerLease | null): void {
    if (lease === null) removeKey(STORE_KEYS.schedulerLease)
    else writeEnvelope(STORE_KEYS.schedulerLease, 1, lease)
  }

  /** Takes or renews the lease and reports whether this tab may publish. */
  function claimLeadership(): boolean {
    const now = Date.now()
    const current = readLease()
    const { lease } = acquireLease(current, tabId.value, now)
    writeLease(lease)
    isLeaderTab.value = isLeader(readLease(), tabId.value, now)
    return isLeaderTab.value
  }

  function releaseLeadership(): void {
    const current = readLease()
    const next = releaseLease(current, tabId.value)
    if (next === null) removeKey(STORE_KEYS.schedulerLease)
    else writeLease(next)
    isLeaderTab.value = false
  }

  function isDueForRetry(nextRetryAt: ISODateString | null, nowIso: ISODateString): boolean {
    return nextRetryAt !== null && nextRetryAt <= nowIso
  }

  /** Promotes failed posts whose backoff elapsed back into the queue. */
  function processRetries(nowIso: ISODateString): number {
    const posts = usePostsStore()
    let promoted = 0
    for (const post of posts.failed) {
      if (post.attempts >= MAX_ATTEMPTS) continue
      if (!isDueForRetry(post.nextRetryAt, nowIso)) continue
      const result = posts.update(post.id, { status: 'scheduled' })
      if (result.ok) {
        useActivityStore().log('retried', 'Automatic retry', post.id)
        promoted += 1
      }
    }
    return promoted
  }

  function processMissed(now: Date): number {
    const posts = usePostsStore()
    let missed = 0
    for (const post of posts.upcoming) {
      if (!isMissed(post, now)) continue
      const result = posts.markMissed(post.id, now.toISOString())
      if (result.ok) missed += 1
    }
    return missed
  }

  async function publishOne(postId: string): Promise<void> {
    const posts = usePostsStore()
    const accounts = useAccountsStore()
    const media = useMediaStore()
    const settings = useSettingsStore()

    const started = posts.markPublishing(postId)
    if (!started.ok) return

    inFlight.value = [...inFlight.value, postId]
    try {
      const post = started.value
      const outcome = await runPublish({
        account: accounts.get(post.accountId),
        content: post.content,
        mediaCount: post.mediaIds.filter((id) => media.exists(id)).length,
        simulateFailures: settings.settings.simulateFailures,
        random: Math.random,
      })

      if (outcome.ok) {
        posts.markPublished(post.id, outcome.publishedAt, outcome.metrics)
        publishedCount.value += 1
        return
      }

      const failure = { code: outcome.code, message: outcome.message, at: new Date().toISOString() }
      const failed = posts.markFailed(post.id, failure)
      failedCount.value += 1
      if (failed.ok && outcome.code === 'RATE_LIMITED' && failed.value.attempts < MAX_ATTEMPTS) {
        const delay = nextRetryDelayMs(failed.value.attempts)
        posts.scheduleRetry(
          post.id,
          new Date(Date.now() + delay).toISOString(),
        )
      }
    } finally {
      inFlight.value = inFlight.value.filter((id) => id !== postId)
    }
  }

  /**
   * One engine pass. Safe to call at any time: it is a no-op when another tab
   * holds the lease or when a pass is already in flight.
   */
  async function tick(): Promise<void> {
    if (ticking) return
    ticking = true
    try {
      if (!claimLeadership()) return

      const posts = usePostsStore()
      // The store is the source of truth until its debounced write lands, so a
      // re-read from storage has to be preceded by a flush or it would restore
      // a stale snapshot and drop whatever the user just did.
      flushPersistence()
      posts.replaceFromStorage()

      const now = new Date()
      const nowIso = now.toISOString()
      lastTickAt.value = nowIso

      processRetries(nowIso)
      processMissed(now)

      const capacity = Math.max(0, MAX_CONCURRENT_PUBLISH - inFlight.value.length)
      if (capacity === 0) return

      const due = selectDuePosts(posts.posts, nowIso, capacity).filter(
        (post) => !inFlight.value.includes(post.id),
      )

      await Promise.all(due.map((post) => publishOne(post.id)))
    } finally {
      ticking = false
    }
  }

  function handleUnload(): void {
    releaseLeadership()
  }

  function start(): void {
    if (running.value) return
    running.value = true
    void tick()
    timer = setInterval(() => {
      void tick()
    }, TICK_MS)
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    useActivityStore().log('created', 'Scheduler started', null)
  }

  function stop(): void {
    if (!running.value) return
    running.value = false
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    window.removeEventListener('beforeunload', handleUnload)
    window.removeEventListener('pagehide', handleUnload)
    releaseLeadership()
  }

  function status(): ReturnType<typeof summarize> {
    return summarize(usePostsStore().posts, new Date().toISOString())
  }

  function warnIfStorageBlocked(): void {
    const ui = useUiStore()
    if (ui.storageBlocked && !usePostsStore().posts.length) {
      ui.toast({
        tone: 'warn',
        message: 'Storage is unavailable — changes are lost when this tab closes.',
        durationMs: 8_000,
      })
    }
  }

  return {
    running,
    lastTickAt,
    tabId,
    isLeaderTab,
    inFlight,
    isPublishing,
    publishingIds,
    publishedCount,
    failedCount,
    LEASE_MS,
    TICK_MS,
    claimLeadership,
    releaseLeadership,
    processRetries,
    processMissed,
    tick,
    start,
    stop,
    status,
    warnIfStorageBlocked,
  }
})
