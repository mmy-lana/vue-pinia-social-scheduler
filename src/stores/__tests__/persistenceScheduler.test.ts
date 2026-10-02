import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPinia } from '@/stores/__tests__/testPinia'
import { flushPersistence } from '@/stores/persistencePlugin'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { readEnvelope, STORAGE_KEYS } from '@/lib/storage'
import type { SocialAccount } from '@/types'

/**
 * Regression cover for a silent data-loss race between the scheduler and the
 * debounced persistence layer.
 *
 * `createGroup` with `mode: 'now'` calls `tick()` synchronously, and `tick()`
 * re-reads posts from LocalStorage to pick up work done by other tabs. Writes
 * are debounced, so without forcing them out first the re-read restores a
 * snapshot from before the post existed and overwrites it — the post vanishes,
 * even though the UI reported success.
 */
describe('persistence ↔ scheduler', () => {
  let account: SocialAccount

  beforeEach(() => {
    window.localStorage.clear()
    createTestPinia()
    useSettingsStore().update({ timezone: 'UTC', simulateFailures: false })
    const added = useAccountsStore().add({
      platform: 'x',
      handle: 'lanabuilds',
      displayName: 'Lana Builds',
    })
    if (!added.ok) throw new Error(`fixture failed: ${JSON.stringify(added.error)}`)
    account = added.value
  })

  afterEach(() => {
    vi.useRealTimers()
    useSchedulerStore().stop()
  })

  it('flushPersistence writes state that has not been scheduled for writing yet', () => {
    const posts = usePostsStore()
    posts.replaceAll([
      {
        id: 'post-1',
        groupId: 'group-1',
        accountId: account.id,
        content: 'Fresh',
        mediaIds: [],
        status: 'draft',
        scheduledAt: null,
        publishedAt: null,
        source: 'manual',
        attempts: 0,
        nextRetryAt: null,
        failure: null,
        metrics: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    // `$subscribe` only runs on Vue's `post` flush, so nothing has been queued.
    flushPersistence()

    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(1)
  })

  it('keeps a post created in the same tick that ticks the engine', async () => {
    const posts = usePostsStore()

    const created = posts.createGroup({
      content: 'Publish me immediately',
      accountIds: [account.id],
      mediaIds: [],
      mode: 'now',
      scheduledAtIso: null,
    })
    expect(created.ok).toBe(true)

    const scheduler = useSchedulerStore()
    scheduler.claimLeadership()
    await scheduler.tick()

    const ids = posts.posts.map((post) => post.id)
    for (const post of created.ok ? created.value.posts : []) {
      expect(ids).toContain(post.id)
    }
    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, []).length).toBe(posts.posts.length)
  })

  it('flushPersistence is safe to call when nothing changed', () => {
    const posts = usePostsStore()
    posts.replaceAll([])

    flushPersistence()
    flushPersistence()

    expect(readEnvelope<unknown[]>(STORAGE_KEYS.posts, 1, [])).toHaveLength(0)
  })
})