import { describe, expect, it } from 'vitest'
import {
  CATCH_UP_GRACE_MS,
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_CONCURRENT_PUBLISH,
  autoRetryInstant,
  canRetryAutomatically,
  isDue,
  isLeader,
  isMissed,
  isReschedulable,
  nextRetryDelayMs,
  releaseLease,
  selectDuePosts,
  summarize,
  acquireLease,
  type SchedulerLease,
} from '@/lib/scheduler'
import { makePost } from '@/lib/__tests__/fixtures'
import type { Post } from '@/types'

const NOW_ISO = '2026-10-07T01:00:00.000Z'
const NOW = new Date(NOW_ISO)

describe('lease leadership', () => {
  it('recognises the holder of an unexpired lease', () => {
    const lease: SchedulerLease = { tabId: 'tab-a', expiresAt: 1_000 }
    expect(isLeader(lease, 'tab-a', 500)).toBe(true)
    expect(isLeader(lease, 'tab-b', 500)).toBe(false)
    expect(isLeader(lease, 'tab-a', 1_500)).toBe(false)
    expect(isLeader(null, 'tab-a', 500)).toBe(false)
  })

  it('takes over an expired lease and renews its own', () => {
    const expired: SchedulerLease = { tabId: 'tab-a', expiresAt: 900 }
    const taken = acquireLease(expired, 'tab-b', 1_000)
    expect(taken.isNew).toBe(true)
    expect(isLeader(taken.lease, 'tab-b', 1_100)).toBe(true)

    const renewed = acquireLease(taken.lease, 'tab-b', 2_000)
    expect(renewed.isNew).toBe(false)
    expect(renewed.lease.expiresAt).toBe(2_000 + LEASE_MS)
  })

  it('releases only its own lease', () => {
    const lease: SchedulerLease = { tabId: 'tab-a', expiresAt: 2_000 }
    expect(releaseLease(lease, 'tab-a')).toBeNull()
    expect(releaseLease(lease, 'tab-b')).toEqual(lease)
  })
})

describe('due post selection', () => {
  const posts: Post[] = [
    makePost({ id: 'a', status: 'scheduled', scheduledAt: '2026-10-07T00:00:00.000Z' }),
    makePost({ id: 'b', status: 'scheduled', scheduledAt: '2026-10-07T00:30:00.000Z' }),
    makePost({ id: 'c', status: 'scheduled', scheduledAt: '2026-10-08T00:00:00.000Z' }),
    makePost({ id: 'd', status: 'publishing', scheduledAt: '2026-10-06T00:00:00.000Z' }),
    makePost({ id: 'e', status: 'draft', scheduledAt: null }),
  ]

  it('only treats scheduled posts in the past as due', () => {
    expect(isDue(posts[0] as Post, NOW_ISO)).toBe(true)
    expect(isDue(posts[2] as Post, NOW_ISO)).toBe(false)
    expect(isDue(posts[3] as Post, NOW_ISO)).toBe(false)
    expect(isDue(posts[4] as Post, NOW_ISO)).toBe(false)
  })

  it('honours a pending retry time', () => {
    const retrying = makePost({
      id: 'f',
      status: 'scheduled',
      scheduledAt: '2026-10-07T00:00:00.000Z',
      nextRetryAt: '2026-10-07T02:00:00.000Z',
    })
    expect(isDue(retrying, NOW_ISO)).toBe(false)
    expect(isDue(retrying, '2026-10-07T03:00:00.000Z')).toBe(true)
  })

  it('returns the oldest due posts up to the concurrency cap', () => {
    expect(selectDuePosts(posts, NOW_ISO, MAX_CONCURRENT_PUBLISH).map((post) => post.id)).toEqual([
      'a',
      'b',
    ])
    expect(selectDuePosts(posts, NOW_ISO, 1).map((post) => post.id)).toEqual(['a'])
  })

  it('flags posts that missed their window by more than a day', () => {
    const slightlyLate = makePost({ scheduledAt: new Date(NOW.getTime() - 60_000).toISOString() })
    const veryLate = makePost({
      scheduledAt: new Date(NOW.getTime() - CATCH_UP_GRACE_MS - 60_000).toISOString(),
    })
    expect(isMissed(slightlyLate, NOW)).toBe(false)
    expect(isMissed(veryLate, NOW)).toBe(true)
    expect(isMissed(makePost({ status: 'draft', scheduledAt: null }), NOW)).toBe(false)
  })

  it('backs off exponentially and stops after the attempt cap', () => {
    expect(nextRetryDelayMs(1)).toBe(60_000)
    expect(nextRetryDelayMs(2)).toBe(120_000)
    expect(nextRetryDelayMs(3)).toBe(240_000)
    expect(nextRetryDelayMs(9)).toBe(900_000)
    expect(canRetryAutomatically(makePost({ status: 'failed', attempts: MAX_ATTEMPTS - 1 }))).toBe(true)
    expect(canRetryAutomatically(makePost({ status: 'failed', attempts: MAX_ATTEMPTS }))).toBe(false)
    expect(autoRetryInstant(makePost({ attempts: 2 }), NOW)).toBe('2026-10-07T01:02:00.000Z')
  })

  it('only reschedules posts that still have a time', () => {
    expect(isReschedulable(makePost({ status: 'scheduled' }))).toBe(true)
    expect(isReschedulable(makePost({ status: 'draft', scheduledAt: '2026-10-09T00:00:00.000Z' }))).toBe(
      true,
    )
    expect(isReschedulable(makePost({ status: 'published' }))).toBe(false)
    expect(isReschedulable(makePost({ status: 'draft', scheduledAt: null }))).toBe(false)
  })

  it('summarizes the queue', () => {
    const summary = summarize(posts, NOW_ISO)
    expect(summary.due).toBe(2)
    expect(summary.publishing).toBe(1)
    expect(summary.scheduled).toBe(3)
    expect(summary.nextDueAt).toBe('2026-10-08T00:00:00.000Z')
  })
})
