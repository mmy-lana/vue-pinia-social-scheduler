import { describe, expect, it } from 'vitest'
import { PLATFORMS, PLATFORM_IDS, formatCharLimit, isPlatformId, platformsOf } from '@/lib/platforms'
import { buildDemoData, seededRandom } from '@/lib/seed'
import { PostSchema, QueueSlotSchema, SocialAccountSchema } from '@/lib/schemas'
import { minuteKey } from '@/lib/queue'
import { dayKeyOf } from '@/lib/datetime'
import { makeAccount } from '@/lib/__tests__/fixtures'

const JAKARTA = 'Asia/Jakarta'
const NOW = new Date('2026-10-01T02:00:00.000Z') // Thursday 09:00 WIB

describe('platform constants', () => {
  it('exposes the five supported networks', () => {
    expect(PLATFORM_IDS).toEqual(['x', 'linkedin', 'instagram', 'facebook', 'threads'])
    for (const id of PLATFORM_IDS) {
      expect(PLATFORMS[id].id).toBe(id)
      expect(PLATFORMS[id].maxChars).toBeGreaterThan(0)
      expect(PLATFORMS[id].maxMedia).toBeGreaterThan(0)
      expect(PLATFORMS[id].color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('identifies platform ids', () => {
    expect(isPlatformId('x')).toBe(true)
    expect(isPlatformId('myspace')).toBe(false)
    expect(isPlatformId(42)).toBe(false)
  })

  it('lists the distinct platforms of a set of accounts in canonical order', () => {
    const accounts = [
      makeAccount({ platform: 'threads' }),
      makeAccount({ platform: 'x' }),
      makeAccount({ platform: 'x' }),
    ]
    expect(platformsOf(accounts)).toEqual(['x', 'threads'])
  })

  it('formats large character limits', () => {
    expect(formatCharLimit(3000)).toBe('3,000')
  })
})

describe('seeded random', () => {
  it('is reproducible', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()])
    expect(seededRandom(42).next()).toBeGreaterThanOrEqual(0)
    expect(seededRandom(42).next()).toBeLessThan(1)
  })
})

describe('demo data', () => {
  const demo = buildDemoData(NOW, JAKARTA)

  it('creates valid, connected accounts on distinct platforms', () => {
    expect(demo.accounts).toHaveLength(4)
    for (const account of demo.accounts) {
      expect(SocialAccountSchema.safeParse(account).success).toBe(true)
    }
    expect(new Set(demo.accounts.map((account) => account.platform)).size).toBe(4)
  })

  it('keeps handles unique per platform', () => {
    for (const account of demo.accounts) {
      const clash = demo.accounts.some(
        (other) =>
          other.id !== account.id &&
          other.platform === account.platform &&
          other.handle.toLowerCase() === account.handle.toLowerCase(),
      )
      expect(clash).toBe(false)
    }
  })

  it('gives every account a default weekly pattern', () => {
    for (const account of demo.accounts) {
      const slots = demo.slots.filter((slot) => slot.accountId === account.id)
      expect(slots).toHaveLength(10)
      expect(slots.every((slot) => QueueSlotSchema.safeParse(slot).success)).toBe(true)
    }
  })

  it('produces schema-valid posts in every state', () => {
    expect(demo.posts.length).toBeGreaterThan(8)
    for (const post of demo.posts) {
      expect(PostSchema.safeParse(post).success).toBe(true)
    }
    const statuses = new Set(demo.posts.map((post) => post.status))
    expect(statuses.has('scheduled')).toBe(true)
    expect(statuses.has('published')).toBe(true)
    expect(statuses.has('failed')).toBe(true)
    expect(statuses.has('draft')).toBe(true)
  })

  it('never double-books a channel minute', () => {
    const taken = new Set<string>()
    for (const post of demo.posts) {
      if (post.scheduledAt === null) continue
      const key = `${post.accountId}:${minuteKey(post.scheduledAt)}`
      expect(taken.has(key)).toBe(false)
      taken.add(key)
    }
  })

  it('respects every platform character limit', () => {
    for (const post of demo.posts) {
      const account = demo.accounts.find((candidate) => candidate.id === post.accountId)
      if (!account) continue
      expect(post.content.length).toBeLessThanOrEqual(PLATFORMS[account.platform].maxChars)
    }
  })

  it('schedules into the future and publishes in the past', () => {
    const scheduled = demo.posts.filter((post) => post.status === 'scheduled')
    expect(scheduled.length).toBeGreaterThan(0)
    for (const post of scheduled) {
      expect(new Date(post.scheduledAt as string).getTime()).toBeGreaterThan(NOW.getTime())
    }
    for (const post of demo.posts.filter((candidate) => candidate.status === 'published')) {
      expect(new Date(post.publishedAt as string).getTime()).toBeLessThan(NOW.getTime())
    }
  })

  it('keeps group ids and activity entries consistent', () => {
    const groupIds = new Set(demo.posts.map((post) => post.groupId))
    expect(groupIds.size).toBeGreaterThan(1)
    for (const entry of demo.activity) {
      expect(entry.message.length).toBeGreaterThan(0)
      if (entry.postId) {
        expect(demo.posts.some((post) => post.id === entry.postId)).toBe(true)
      }
    }
  })

  it('is stable across calls and shifts with the clock', () => {
    const again = buildDemoData(NOW, JAKARTA)
    expect(again.posts.map((post) => post.content)).toEqual(demo.posts.map((post) => post.content))
    expect(again.posts.map((post) => post.metrics?.impressions)).toEqual(
      demo.posts.map((post) => post.metrics?.impressions),
    )

    const nextWeek = buildDemoData(new Date(NOW.getTime() + 7 * 86_400_000), JAKARTA)
    const firstScheduled = nextWeek.posts.find((post) => post.status === 'scheduled')
    expect(firstScheduled).toBeDefined()
    const key = firstScheduled?.scheduledAt ? dayKeyOf(new Date(firstScheduled.scheduledAt), JAKARTA) : ''
    expect(key).not.toBe(dayKeyOf(NOW, JAKARTA))
  })
})
