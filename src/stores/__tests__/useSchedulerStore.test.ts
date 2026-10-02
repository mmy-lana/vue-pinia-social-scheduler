import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPinia } from '@/stores/__tests__/testPinia'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { usePostsStore } from '@/stores/usePostsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { useActivityStore } from '@/stores/useActivityStore'
import { readEnvelope, writeEnvelope, STORAGE_KEYS } from '@/lib/storage'
import { LEASE_MS, MAX_ATTEMPTS, type SchedulerLease } from '@/lib/scheduler'
import type { Post, SocialAccount } from '@/types'

function setup(): SocialAccount {
  window.localStorage.clear()
  createTestPinia({ persist: false })
  useSettingsStore().update({ timezone: 'Asia/Jakarta', simulateFailures: false })
  const result = useAccountsStore().add({
    platform: 'x',
    handle: 'lanabuilds',
    displayName: 'Lana Builds',
  })
  if (!result.ok) throw new Error(`fixture failed: ${JSON.stringify(result.error)}`)
  return result.value
}

/**
 * The engine re-reads LocalStorage before it mutates, exactly like a tab that
 * was just reopened. Fixtures therefore seed the persisted envelope.
 */
function seedPost(account: SocialAccount, overrides: Partial<Post> = {}): Post {
  const now = new Date().toISOString()
  const post: Post = {
    id: `post-${Math.random().toString(36).slice(2, 8)}`,
    groupId: 'group-1',
    accountId: account.id,
    content: 'Due right now',
    mediaIds: [],
    status: 'scheduled',
    scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    publishedAt: null,
    source: 'manual',
    attempts: 0,
    nextRetryAt: null,
    failure: null,
    metrics: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  const current = readEnvelope<Post[]>(STORAGE_KEYS.posts, 1, [])
  writeEnvelope(STORAGE_KEYS.posts, 1, [...current, post])
  usePostsStore().replaceFromStorage()
  return post
}

describe('useSchedulerStore — leadership', () => {
  beforeEach(() => {
    setup()
  })

  it('takes a lease and renews it', () => {
    const scheduler = useSchedulerStore()
    expect(scheduler.claimLeadership()).toBe(true)

    const lease = readEnvelope<SchedulerLease | null>(STORAGE_KEYS.schedulerLease, 1, null)
    expect(lease?.tabId).toBe(scheduler.tabId)
    expect(lease?.expiresAt ?? 0).toBeGreaterThan(Date.now())
    expect(lease?.expiresAt ?? 0).toBeLessThanOrEqual(Date.now() + LEASE_MS)
  })

  it('releases the lease when the tab goes away', () => {
    const scheduler = useSchedulerStore()
    scheduler.claimLeadership()
    scheduler.releaseLeadership()
    expect(scheduler.isLeaderTab).toBe(false)
    expect(readEnvelope(STORAGE_KEYS.schedulerLease, 1, null)).toBeNull()
  })

  it('lets another tab take over an expired lease', () => {
    const scheduler = useSchedulerStore()
    scheduler.claimLeadership()

    writeEnvelope(STORAGE_KEYS.schedulerLease, 1, {
      tabId: 'someone-else',
      expiresAt: Date.now() - 1,
    })
    expect(scheduler.claimLeadership()).toBe(true)
    expect(readEnvelope<SchedulerLease | null>(STORAGE_KEYS.schedulerLease, 1, null)?.tabId).toBe(
      scheduler.tabId,
    )
  })
})

describe('useSchedulerStore — publishing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setup()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes a due post and records metrics', async () => {
    const account = setup()
    const post = seedPost(account)
    const scheduler = useSchedulerStore()

    const tick = scheduler.tick()
    await vi.advanceTimersByTimeAsync(2_000)
    await tick

    const published = usePostsStore().get(post.id)
    expect(published?.status).toBe('published')
    expect(published?.publishedAt).not.toBeNull()
    expect(published?.metrics?.impressions).toBeGreaterThan(0)
    expect(scheduler.publishedCount).toBe(1)
    expect(useActivityStore().entries[0]?.type).toBe('published')
  })

  it('leaves posts alone when they are not due yet', async () => {
    const account = setup()
    const post = seedPost(account, {
      scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    })

    await useSchedulerStore().tick()
    expect(usePostsStore().get(post.id)?.status).toBe('scheduled')
  })

  it('fails the post when the channel is disconnected', async () => {
    const account = setup()
    const post = seedPost(account)
    useAccountsStore().setConnected(account.id, false)

    const scheduler = useSchedulerStore()
    const tick = scheduler.tick()
    await vi.advanceTimersByTimeAsync(2_000)
    await tick

    const failed = usePostsStore().get(post.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.failure?.code).toBe('ACCOUNT_DISCONNECTED')
    expect(failed?.nextRetryAt).toBeNull()
  })

  it('rate-limits a simulated failure and arms a retry', async () => {
    const account = setup()
    const post = seedPost(account)
    useSettingsStore().update({ simulateFailures: true })

    const originalRandom = Math.random
    Math.random = () => 0.01
    try {
      const scheduler = useSchedulerStore()
      const tick = scheduler.tick()
      await vi.advanceTimersByTimeAsync(2_000)
      await tick
    } finally {
      Math.random = originalRandom
    }

    const failed = usePostsStore().get(post.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.failure?.code).toBe('RATE_LIMITED')
    expect(failed?.nextRetryAt).not.toBeNull()
  })

  it('promotes a failed post back to scheduled once its backoff elapses', () => {
    const account = setup()
    const post = seedPost(account)
    const posts = usePostsStore()
    posts.markPublishing(post.id)
    posts.markFailed(post.id, {
      code: 'RATE_LIMITED',
      message: 'Slow down',
      at: new Date().toISOString(),
    })
    posts.scheduleRetry(post.id, new Date(Date.now() - 1_000).toISOString())

    expect(useSchedulerStore().processRetries(new Date().toISOString())).toBe(1)
    expect(posts.get(post.id)?.status).toBe('scheduled')
  })

  it('does not retry beyond the attempt cap', () => {
    const account = setup()
    const post = seedPost(account)
    const posts = usePostsStore()
    posts.markPublishing(post.id)
    posts.markFailed(post.id, {
      code: 'RATE_LIMITED',
      message: 'Slow down',
      at: new Date().toISOString(),
    })
    posts.scheduleRetry(post.id, new Date(Date.now() - 1_000).toISOString())
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      posts.markPublishing(post.id)
      posts.markFailed(post.id, {
        code: 'RATE_LIMITED',
        message: 'Slow down',
        at: new Date().toISOString(),
      })
    }
    expect(useSchedulerStore().processRetries(new Date().toISOString())).toBe(0)
  })

  it('marks a long-overdue post as missed instead of publishing it', () => {
    const account = setup()
    const post = seedPost(account, {
      scheduledAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
    })
    expect(useSchedulerStore().processMissed(new Date())).toBe(1)
    const failed = usePostsStore().get(post.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.failure?.code).toBe('MISSED')
  })

  it('publishes at most three posts per pass', async () => {
    const accounts = useAccountsStore()
    const posts = usePostsStore()
    for (const handle of ['one', 'two', 'three', 'four', 'five']) {
      const added = accounts.add({ platform: 'x', handle, displayName: handle })
      if (!added.ok) throw new Error('fixture failed')
      seedPost(added.value)
    }
    expect(posts.posts).toHaveLength(5)

    const scheduler = useSchedulerStore()
    const tick = scheduler.tick()
    await vi.advanceTimersByTimeAsync(2_000)
    await tick

    expect(posts.published).toHaveLength(3)
    expect(posts.scheduled).toHaveLength(2)
  })

  it('starts, ticks and stops', async () => {
    const scheduler = useSchedulerStore()
    scheduler.start()
    expect(scheduler.running).toBe(true)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(scheduler.lastTickAt).not.toBeNull()

    scheduler.stop()
    expect(scheduler.running).toBe(false)
    const stamp = scheduler.lastTickAt
    await vi.advanceTimersByTimeAsync(10_000)
    expect(scheduler.lastTickAt).toBe(stamp)
  })
})