import { TZDate } from '@date-fns/tz'
import { addDays } from 'date-fns'
import type { ISODateString, Post, QueueSlot, Weekday } from '@/types'
import { byScheduledAt } from '@/lib/datetime'

/** A queued post may not land closer than a minute from now. */
export const LEAD_MS = 60_000

/** How far ahead the queue planner looks before giving up. */
export const HORIZON_DAYS = 60

/** Per-account ceiling on weekly posting times. */
export const MAX_QUEUE_SLOTS_PER_ACCOUNT = 14

/** Mon–Fri at 09:00 and 17:00, the pattern offered by "Use default times". */
export const DEFAULT_SLOT_PATTERN: ReadonlyArray<{ weekday: Weekday; time: string }> = [
  { weekday: 1, time: '09:00' },
  { weekday: 1, time: '17:00' },
  { weekday: 2, time: '09:00' },
  { weekday: 2, time: '17:00' },
  { weekday: 3, time: '09:00' },
  { weekday: 3, time: '17:00' },
  { weekday: 4, time: '09:00' },
  { weekday: 4, time: '17:00' },
  { weekday: 5, time: '09:00' },
  { weekday: 5, time: '17:00' },
]

/** Minute-precision key: two posts collide when they share the same instant. */
export function minuteKey(iso: ISODateString): string {
  return iso.slice(0, 16)
}

export function sortSlots(slots: readonly QueueSlot[]): QueueSlot[] {
  return [...slots].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))
}

export function slotsForAccount(slots: readonly QueueSlot[], accountId: string): QueueSlot[] {
  return sortSlots(slots.filter((slot) => slot.accountId === accountId))
}

export function hasSlotFor(
  slots: readonly QueueSlot[],
  accountId: string,
  weekday: Weekday,
  time: string,
): boolean {
  return slots.some(
    (slot) => slot.accountId === accountId && slot.weekday === weekday && slot.time === time,
  )
}

export function countSlotsFor(slots: readonly QueueSlot[], accountId: string): number {
  return slots.reduce((total, slot) => (slot.accountId === accountId ? total + 1 : total), 0)
}

/**
 * Next free instant among an account's weekly slots, or `null` when the account
 * has no slots or nothing is free inside the horizon. Already-scheduled posts
 * block their minute, so queueing twice in a row never collides.
 */
export function computeNextSlot(
  accountId: string,
  slots: readonly QueueSlot[],
  posts: readonly Post[],
  now: Date,
  tz: string,
): ISODateString | null {
  const mine = slots.filter((slot) => slot.accountId === accountId)
  if (mine.length === 0) return null

  const taken = new Set(
    posts
      .filter(
        (post) =>
          post.accountId === accountId &&
          post.scheduledAt !== null &&
          (post.status === 'scheduled' || post.status === 'publishing'),
      )
      .map((post) => minuteKey(post.scheduledAt as ISODateString)),
  )

  const earliest = now.getTime() + LEAD_MS
  const base = new TZDate(now, tz)

  for (let offset = 0; offset <= HORIZON_DAYS; offset += 1) {
    const day = addDays(base, offset)
    const todays = mine
      .filter((slot) => slot.weekday === (day.getDay() as Weekday))
      .sort((a, b) => a.time.localeCompare(b.time))
    for (const slot of todays) {
      const [hours, minutes] = slot.time.split(':').map(Number)
      const at = new TZDate(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        hours ?? 0,
        minutes ?? 0,
        0,
        tz,
      )
      const ms = at.getTime()
      if (ms < earliest) continue
      const iso = new Date(ms).toISOString()
      if (taken.has(minuteKey(iso))) continue
      return iso
    }
  }
  return null
}

/** The next `limit` queue-assigned posts for one account, soonest first. */
export function upcomingQueuePosts(
  posts: readonly Post[],
  accountId: string,
  limit = 10,
): Post[] {
  return posts
    .filter(
      (post) =>
        post.accountId === accountId &&
        post.source === 'queue' &&
        (post.status === 'scheduled' || post.status === 'publishing'),
    )
    .sort(byScheduledAt)
    .slice(0, limit)
}

/** How many posts of an account would fail while it stays disconnected. */
export function pendingCountForAccount(posts: readonly Post[], accountId: string): number {
  return posts.filter(
    (post) =>
      post.accountId === accountId &&
      (post.status === 'scheduled' || post.status === 'publishing'),
  ).length
}
