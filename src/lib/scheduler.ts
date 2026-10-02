import { byScheduledAt } from '@/lib/datetime'
import type { ISODateString, Post } from '@/types'

/**
 * Engine rules for the in-browser publisher: how often the loop runs, which tab
 * is allowed to publish, which posts are due, and how a missed window is
 * treated. The store owns the side effects; everything here is pure.
 */

export const LEASE_MS = 10_000
export const TICK_MS = 5_000
export const MAX_CONCURRENT_PUBLISH = 3
export const MAX_ATTEMPTS = 3
export const RETRY_BASE_MS = 60_000
export const RETRY_MAX_MS = 15 * 60_000

/**
 * A due post older than this is not published retroactively: it fails with
 * `MISSED` and waits for an explicit retry. Without this, reopening the tab
 * after a long break would blast out a week of queued posts at once.
 */
export const CATCH_UP_GRACE_MS = 24 * 60 * 60_000

/** Delay before a manual "Retry now" is picked up, giving the UI time to update. */
export const MANUAL_RETRY_DELAY_MS = 5_000

export interface SchedulerLease {
  tabId: string
  expiresAt: number
}

export function isLeaseActive(lease: SchedulerLease | null, now: number): boolean {
  return lease !== null && lease.expiresAt > now
}

/** Only the lease holder publishes; an expired or foreign lease means "wait". */
export function isLeader(lease: SchedulerLease | null, tabId: string, now: number): boolean {
  return lease !== null && lease.tabId === tabId && lease.expiresAt > now
}

export function acquireLease(
  current: SchedulerLease | null,
  tabId: string,
  now: number,
): { lease: SchedulerLease; isNew: boolean } {
  if (isLeader(current, tabId, now)) {
    return { lease: { tabId, expiresAt: now + LEASE_MS }, isNew: false }
  }
  return { lease: { tabId, expiresAt: now + LEASE_MS }, isNew: true }
}

export function releaseLease(current: SchedulerLease | null, tabId: string): SchedulerLease | null {
  if (current && current.tabId === tabId) return null
  return current
}

export function isDue(post: Post, nowIso: ISODateString): boolean {
  if (post.status !== 'scheduled') return false
  if (post.scheduledAt === null) return false
  if (post.nextRetryAt !== null && post.nextRetryAt > nowIso) return false
  return post.scheduledAt <= nowIso
}

export function isMissed(post: Post, now: Date): boolean {
  if (post.status !== 'scheduled' || post.scheduledAt === null) return false
  return now.getTime() - new Date(post.scheduledAt).getTime() > CATCH_UP_GRACE_MS
}

export function selectDuePosts(posts: readonly Post[], nowIso: ISODateString, limit: number): Post[] {
  return posts
    .filter((post) => isDue(post, nowIso))
    .sort(byScheduledAt)
    .slice(0, limit)
}

/** Exponential backoff: 1 min, 2 min, 4 min, then the 15 min ceiling. */
export function nextRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1)
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS)
}

export function canRetryAutomatically(post: Post): boolean {
  return post.status === 'failed' && post.attempts < MAX_ATTEMPTS
}

export function autoRetryInstant(post: Post, now: Date): ISODateString {
  return new Date(now.getTime() + nextRetryDelayMs(post.attempts)).toISOString()
}

/** A post can be dragged/rescheduled only while it is still ours to move. */
export function isReschedulable(post: Post): boolean {
  return (post.status === 'scheduled' || post.status === 'draft') && post.scheduledAt !== null
}

export interface SchedulerSummary {
  due: number
  publishing: number
  scheduled: number
  nextDueAt: ISODateString | null
}

export function summarize(posts: readonly Post[], nowIso: ISODateString): SchedulerSummary {
  const due = posts.filter((post) => isDue(post, nowIso)).length
  const publishing = posts.filter((post) => post.status === 'publishing').length
  const scheduled = posts.filter((post) => post.status === 'scheduled').length
  const upcoming = posts
    .filter((post) => post.status === 'scheduled' && post.scheduledAt !== null)
    .sort(byScheduledAt)
  const next = upcoming.find((post) => (post.scheduledAt as ISODateString) > nowIso)
  return { due, publishing, scheduled, nextDueAt: next?.scheduledAt ?? null }
}
