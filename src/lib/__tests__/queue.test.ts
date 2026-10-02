import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SLOT_PATTERN,
  HORIZON_DAYS,
  LEAD_MS,
  MAX_QUEUE_SLOTS_PER_ACCOUNT,
  computeNextSlot,
  countSlotsFor,
  hasSlotFor,
  minuteKey,
  pendingCountForAccount,
  slotsForAccount,
  upcomingQueuePosts,
} from '@/lib/queue'
import { makePost, makeSlot } from '@/lib/__tests__/fixtures'
import type { Post, QueueSlot } from '@/types'

const JAKARTA = 'Asia/Jakarta'

// Wednesday 2026-10-07 08:00 WIB.
const NOW = new Date('2026-10-07T01:00:00.000Z')

function weeklySlots(accountId: string, weekday: number, times: string[]): QueueSlot[] {
  return times.map((time, index) =>
    makeSlot({ id: `${accountId}-${weekday}-${index}`, accountId, weekday: weekday as QueueSlot['weekday'], time }),
  )
}

describe('computeNextSlot', () => {
  it('returns null when the account has no slots', () => {
    expect(computeNextSlot('acc-1', [], [], NOW, JAKARTA)).toBeNull()
  })

  it('picks the next slot on the same day', () => {
    const slots = weeklySlots('acc-1', 3, ['09:00', '17:00']) // Wednesday
    expect(computeNextSlot('acc-1', slots, [], NOW, JAKARTA)).toBe('2026-10-07T02:00:00.000Z')
  })

  it('skips a slot whose time already passed today', () => {
    const slots = weeklySlots('acc-1', 3, ['07:00', '09:00'])
    expect(computeNextSlot('acc-1', slots, [], NOW, JAKARTA)).toBe('2026-10-07T02:00:00.000Z')
  })

  it('respects the one-minute lead time on the current slot', () => {
    const slots = weeklySlots('acc-1', 3, ['08:01'])
    const result = computeNextSlot('acc-1', slots, [], NOW, JAKARTA)
    expect(result).toBe('2026-10-07T01:01:00.000Z')
    expect(new Date(result as string).getTime()).toBeGreaterThanOrEqual(NOW.getTime() + LEAD_MS)
  })

  it('rolls to the next matching weekday when today is exhausted', () => {
    const slots = weeklySlots('acc-1', 5, ['09:00']) // Friday
    expect(computeNextSlot('acc-1', slots, [], NOW, JAKARTA)).toBe('2026-10-09T02:00:00.000Z')
  })

  it('skips a minute already taken by a scheduled post', () => {
    const slots = weeklySlots('acc-1', 3, ['09:00', '10:00'])
    const posts: Post[] = [
      makePost({ id: 'p1', accountId: 'acc-1', status: 'scheduled', scheduledAt: '2026-10-07T02:00:00.000Z' }),
    ]
    expect(computeNextSlot('acc-1', slots, posts, NOW, JAKARTA)).toBe('2026-10-07T03:00:00.000Z')
  })

  it('ignores published and failed posts when looking for free minutes', () => {
    const slots = weeklySlots('acc-1', 3, ['09:00'])
    const posts: Post[] = [
      makePost({ id: 'p1', accountId: 'acc-1', status: 'published', scheduledAt: '2026-10-07T02:00:00.000Z' }),
    ]
    expect(computeNextSlot('acc-1', slots, posts, NOW, JAKARTA)).toBe('2026-10-07T02:00:00.000Z')
  })

  it('never returns the same minute twice in a row', () => {
    const slots = weeklySlots('acc-1', 3, ['09:00', '10:00'])
    const first = computeNextSlot('acc-1', slots, [], NOW, JAKARTA)
    const posts = [makePost({ id: 'p1', accountId: 'acc-1', scheduledAt: first })]
    const second = computeNextSlot('acc-1', slots, posts, NOW, JAKARTA)
    expect(second).not.toBe(first)
    expect(second).toBe('2026-10-07T03:00:00.000Z')
  })

  it('gives up after the horizon when every slot is booked', () => {
    const slots = weeklySlots('acc-1', 3, ['09:00'])
    const posts: Post[] = []
    for (let day = 0; day <= HORIZON_DAYS; day += 1) {
      const date = new Date(Date.UTC(2026, 9, 7 + day, 2, 0))
      if (new Date(date).getUTCDay() !== 3) continue
      posts.push(
        makePost({
          id: `p${day}`,
          accountId: 'acc-1',
          status: 'scheduled',
          scheduledAt: date.toISOString(),
        }),
      )
    }
    expect(computeNextSlot('acc-1', slots, posts, NOW, JAKARTA)).toBeNull()
  })

  it('keeps channels independent', () => {
    const slots = [
      ...weeklySlots('acc-1', 3, ['09:00']),
      ...weeklySlots('acc-2', 3, ['11:00']),
    ]
    const posts = [
      makePost({ id: 'p1', accountId: 'acc-1', status: 'scheduled', scheduledAt: '2026-10-07T02:00:00.000Z' }),
    ]
    expect(computeNextSlot('acc-2', slots, posts, NOW, JAKARTA)).toBe('2026-10-07T04:00:00.000Z')
  })
})

describe('slot helpers', () => {
  it('sorts slots by weekday then time', () => {
    const slots = [
      makeSlot({ id: 'c', weekday: 3, time: '17:00' }),
      makeSlot({ id: 'a', weekday: 1, time: '17:00' }),
      makeSlot({ id: 'b', weekday: 1, time: '09:00' }),
    ]
    expect(slotsForAccount(slots, 'acc-1').map((slot) => slot.id)).toEqual(['b', 'a', 'c'])
  })

  it('detects duplicates and counts per account', () => {
    const slots = [makeSlot({ id: 'a', accountId: 'acc-1' }), makeSlot({ id: 'b', accountId: 'acc-2' })]
    expect(hasSlotFor(slots, 'acc-1', 1, '09:00')).toBe(true)
    expect(hasSlotFor(slots, 'acc-1', 1, '10:00')).toBe(false)
    expect(countSlotsFor(slots, 'acc-1')).toBe(1)
  })

  it('builds minute-precision collision keys', () => {
    expect(minuteKey('2026-10-07T02:00:00.000Z')).toBe('2026-10-07T02:00')
  })

  it('offers a Mon–Fri 09:00/17:00 default pattern within the cap', () => {
    expect(DEFAULT_SLOT_PATTERN).toHaveLength(10)
    expect(DEFAULT_SLOT_PATTERN.every((entry) => entry.weekday >= 1 && entry.weekday <= 5)).toBe(true)
    expect(DEFAULT_SLOT_PATTERN.length).toBeLessThanOrEqual(MAX_QUEUE_SLOTS_PER_ACCOUNT)
  })
})

describe('queue views', () => {
  it('lists the next queued posts for one account', () => {
    const posts: Post[] = [
      makePost({ id: 'a', accountId: 'acc-1', source: 'queue', scheduledAt: '2026-10-09T02:00:00.000Z' }),
      makePost({ id: 'b', accountId: 'acc-1', source: 'queue', scheduledAt: '2026-10-08T02:00:00.000Z' }),
      makePost({ id: 'c', accountId: 'acc-1', source: 'manual', scheduledAt: '2026-10-07T02:00:00.000Z' }),
      makePost({ id: 'd', accountId: 'acc-2', source: 'queue', scheduledAt: '2026-10-08T02:00:00.000Z' }),
    ]
    expect(upcomingQueuePosts(posts, 'acc-1').map((post) => post.id)).toEqual(['b', 'a'])
    expect(upcomingQueuePosts(posts, 'acc-1', 1).map((post) => post.id)).toEqual(['b'])
  })

  it('counts posts that would fail while a channel is disconnected', () => {
    const posts: Post[] = [
      makePost({ id: 'a', accountId: 'acc-1', status: 'scheduled' }),
      makePost({ id: 'b', accountId: 'acc-1', status: 'publishing' }),
      makePost({ id: 'c', accountId: 'acc-1', status: 'published' }),
      makePost({ id: 'd', accountId: 'acc-2', status: 'scheduled' }),
    ]
    expect(pendingCountForAccount(posts, 'acc-1')).toBe(2)
  })
})
