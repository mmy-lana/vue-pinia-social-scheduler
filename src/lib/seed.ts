import { zonedToUtcIso, addDaysToKey, dayKeyOf, weekdayOfKey } from '@/lib/datetime'
import { DEFAULT_SLOT_PATTERN, minuteKey } from '@/lib/queue'
import { generateMetrics } from '@/lib/publisher'
import { hueFromString, newId } from '@/lib/utils'
import type {
  ActivityEntry,
  ActivityType,
  ISODateString,
  PlatformId,
  Post,
  QueueSlot,
  SocialAccount,
  Weekday,
} from '@/types'

/**
 * Demo dataset for the "Load demo data" action in Settings. It is generated
 * from the current clock so the timeline always has something upcoming, and it
 * uses a seeded PRNG so the same click always produces the same numbers.
 */

export interface DemoData {
  accounts: SocialAccount[]
  slots: QueueSlot[]
  posts: Post[]
  activity: ActivityEntry[]
}

interface DemoAccountSpec {
  platform: PlatformId
  handle: string
  displayName: string
  connected: boolean
}

const DEMO_ACCOUNTS: readonly DemoAccountSpec[] = [
  { platform: 'x', handle: 'lanabuilds', displayName: 'Lana Builds', connected: true },
  { platform: 'linkedin', handle: 'lana.builds', displayName: 'Lana · Product', connected: true },
  { platform: 'instagram', handle: 'lanabuilds', displayName: 'Lana Studio', connected: true },
  { platform: 'threads', handle: 'lanabuilds', displayName: 'Lana', connected: false },
]

const DEMO_POSTS: ReadonlyArray<{ content: string; platforms: PlatformId[] }> = [
  {
    content:
      'Shipped v2 of the scheduler today: calendar drag-to-reschedule, per-channel previews and a queue that never double-books a slot.',
    platforms: ['linkedin', 'x'],
  },
  {
    content: 'Behind the scenes from the workshop. Six hours, one wall, zero slides.',
    platforms: ['instagram', 'facebook'],
  },
  {
    content: 'A good posting rhythm beats a perfect one. Two slots a day, Mon–Fri.',
    platforms: ['x', 'threads'],
  },
  {
    content:
      'What we learned running 200 posts through a queue: the hard part was never writing, it was deciding what not to post.',
    platforms: ['linkedin'],
  },
  {
    content: 'New month, new studio lighting. Full set on the blog.',
    platforms: ['instagram'],
  },
  {
    content: 'Reminder: the community review is open until Friday. Bring the rough drafts.',
    platforms: ['facebook', 'threads'],
  },
  {
    content: 'Three settings I change on every project: timezone, week start, and 24-hour time.',
    platforms: ['x', 'linkedin', 'threads'],
  },
  {
    content: 'Draft: the case for a slower inbox.',
    platforms: ['linkedin'],
  },
  {
    content: 'Draft: October workshop recap, needs the numbers from the sign-up sheet.',
    platforms: ['x'],
  },
]

interface SeededRandom {
  next: () => number
}

/** mulberry32 — small, fast, and reproducible across runs. */
export function seededRandom(seed: number): SeededRandom {
  let state = seed >>> 0
  return {
    next: () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    },
  }
}

function stamp(iso: ISODateString): { createdAt: ISODateString; updatedAt: ISODateString } {
  return { createdAt: iso, updatedAt: iso }
}

export function buildDemoData(
  now: Date,
  tz: string,
  seed = 20_260_402,
): DemoData {
  const random = seededRandom(seed).next
  const nowIso = now.toISOString()
  const today = dayKeyOf(now, tz)

  const accounts: SocialAccount[] = DEMO_ACCOUNTS.map((spec) => {
    const id = newId()
    return {
      id,
      platform: spec.platform,
      handle: spec.handle,
      displayName: spec.displayName,
      avatarHue: hueFromString(`${spec.platform}:${spec.handle}`),
      connected: spec.connected,
      ...stamp(nowIso),
    }
  })

  const accountByPlatform = new Map(accounts.map((account) => [account.platform, account]))
  const slots: QueueSlot[] = []

  for (const account of accounts) {
    for (const entry of DEFAULT_SLOT_PATTERN) {
      slots.push({
        id: newId(),
        accountId: account.id,
        weekday: entry.weekday,
        time: entry.time,
        ...stamp(nowIso),
      })
    }
  }

  const posts: Post[] = []
  const activity: ActivityEntry[] = []

  const pushActivity = (type: ActivityType, message: string, postId: string | null): void => {
    activity.push({ id: newId(), postId, type, message, at: nowIso })
  }

  const firstSlotIso = (platform: PlatformId, dayOffset: number, time: string): ISODateString => {
    const account = accountByPlatform.get(platform)
    if (!account) return zonedToUtcIso(addDaysToKey(today, dayOffset), time, tz)
    const weekday = weekdayOfKey(addDaysToKey(today, dayOffset))
    const sameDay = DEFAULT_SLOT_PATTERN.filter((entry) => entry.weekday === weekday)
    const chosen = sameDay.find((entry) => entry.time === time) ?? sameDay[0]
    const slotTime = chosen?.time ?? time
    return zonedToUtcIso(addDaysToKey(today, dayOffset), slotTime, tz)
  }

  DEMO_POSTS.forEach((spec, index) => {
    const groupId = newId()
    const mode: 'queued' | 'published' | 'failed' | 'draft' =
      index < 4 ? 'queued' : index === 4 ? 'published' : index === 5 ? 'failed' : 'draft'

    spec.platforms.forEach((platform) => {
      const account = accountByPlatform.get(platform)
      if (!account) return

      const dayOffset = 1 + (index % 6)
      const time = DEFAULT_SLOT_PATTERN[(index * 3) % DEFAULT_SLOT_PATTERN.length]?.time ?? '09:00'
      const scheduledAt =
        mode === 'draft' ? null : firstSlotIso(platform, dayOffset, time)
      const createdAt = new Date(now.getTime() - (index + 1) * 3_600_000).toISOString()
      const publishedAt = mode === 'published' ? firstSlotIso(platform, -1, time) : null
      const id = newId()

      posts.push({
        id,
        groupId,
        accountId: account.id,
        content: spec.content,
        mediaIds: [],
        status:
          mode === 'queued'
            ? 'scheduled'
            : mode === 'published'
              ? 'published'
              : mode === 'failed'
                ? 'failed'
                : 'draft',
        scheduledAt,
        publishedAt,
        source: mode === 'queued' ? 'queue' : 'manual',
        attempts: mode === 'failed' ? 2 : mode === 'published' ? 1 : 0,
        nextRetryAt: null,
        failure:
          mode === 'failed'
            ? {
                code: 'RATE_LIMITED',
                message: 'The network rate-limited this publish. Retry when you are ready.',
                at: createdAt,
              }
            : null,
        metrics: mode === 'published' ? generateMetrics(platform, random) : null,
        createdAt,
        updatedAt: createdAt,
      })

      if (mode === 'published') {
        pushActivity('published', `Published to ${account.displayName}`, id)
      } else if (mode === 'failed') {
        pushActivity('failed', `Failed on ${account.displayName}`, id)
      } else if (mode === 'queued') {
        pushActivity('scheduled', `Scheduled for ${account.displayName}`, id)
      } else {
        pushActivity('created', `Draft saved for ${account.displayName}`, id)
      }
    })
  })

  // Guard against a slot collision in the generated data.
  const seen = new Set<string>()
  for (const post of posts) {
    if (post.scheduledAt === null) continue
    const key = `${post.accountId}:${minuteKey(post.scheduledAt)}`
    if (seen.has(key)) {
      post.scheduledAt = new Date(new Date(post.scheduledAt).getTime() + 5 * 60_000).toISOString()
    }
    seen.add(`${post.accountId}:${minuteKey(post.scheduledAt)}`)
  }

  return { accounts, slots, posts, activity: activity.slice(0, 50) }
}

export function demoWeekdays(): Weekday[] {
  return DEFAULT_SLOT_PATTERN.map((entry) => entry.weekday)
}
