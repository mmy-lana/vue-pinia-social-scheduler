import {
  APP_MAX_MEDIA_PER_POST,
  MAX_SCHEDULE_AHEAD_DAYS,
  MIN_SCHEDULE_LEAD_MS,
  PLATFORMS,
  formatCharLimit,
} from '@/lib/platforms'
import { MAX_QUEUE_SLOTS_PER_ACCOUNT, countSlotsFor, hasSlotFor } from '@/lib/queue'
import { isValidTimeString } from '@/lib/datetime'
import type {
  FieldErrors,
  PlatformId,
  PostStatus,
  QueueSlot,
  ScheduleMode,
  SocialAccount,
  Weekday,
} from '@/types'

export const HANDLE_PATTERN = /^[A-Za-z0-9._]{2,30}$/
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const DISPLAY_NAME_MIN = 1
export const DISPLAY_NAME_MAX = 40
export const WEEKLY_SLOT_LIMIT = MAX_QUEUE_SLOTS_PER_ACCOUNT

/** Allowed lifecycle transitions; anything else is rejected by `canTransition`. */
export const STATUS_TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  draft: ['scheduled'],
  scheduled: ['draft', 'publishing'],
  publishing: ['published', 'failed'],
  published: [],
  failed: ['scheduled'],
}

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to)
}

export interface StrictestLimit {
  limit: number
  by: PlatformId
}

/** The strictest character budget across the selected channels, and who imposes it. */
export function strictestLimit(platforms: readonly PlatformId[]): StrictestLimit | null {
  if (platforms.length === 0) return null
  return platforms.reduce<StrictestLimit>(
    (acc, platform) =>
      PLATFORMS[platform].maxChars < acc.limit
        ? { limit: PLATFORMS[platform].maxChars, by: platform }
        : acc,
    { limit: PLATFORMS[platforms[0] as PlatformId].maxChars, by: platforms[0] as PlatformId },
  )
}

/** `min(app cap, strictest channel cap)`. */
export function effectiveMediaCap(platforms: readonly PlatformId[]): number {
  return platforms.reduce(
    (cap, platform) => Math.min(cap, PLATFORMS[platform].maxMedia),
    APP_MAX_MEDIA_PER_POST,
  )
}

export function requiresMedia(platforms: readonly PlatformId[]): boolean {
  return platforms.some((platform) => PLATFORMS[platform].requiresMedia)
}

export function validateHandle(value: string): string | null {
  const handle = value.trim().replace(/^@+/, '')
  if (handle.length === 0) return 'Enter a handle.'
  if (!HANDLE_PATTERN.test(handle)) {
    return 'Use 2–30 letters, numbers, dots or underscores.'
  }
  return null
}

export function validateDisplayName(value: string): string | null {
  const name = value.trim()
  if (name.length < DISPLAY_NAME_MIN) return 'Enter a display name.'
  if (name.length > DISPLAY_NAME_MAX) {
    return `Keep the display name under ${DISPLAY_NAME_MAX} characters.`
  }
  return null
}

/** Handles are unique per platform, compared case-insensitively. */
export function isHandleTaken(
  accounts: readonly SocialAccount[],
  platform: PlatformId,
  handle: string,
  ignoreAccountId: string | null = null,
): boolean {
  const candidate = handle.trim().replace(/^@+/, '').toLowerCase()
  return accounts.some(
    (account) =>
      account.id !== ignoreAccountId &&
      account.platform === platform &&
      account.handle.toLowerCase() === candidate,
  )
}

export function validateSlotTime(value: string): string | null {
  if (!isValidTimeString(value)) return 'Pick a time between 00:00 and 23:59.'
  return null
}

export function validateSlotAddition(
  slots: readonly QueueSlot[],
  accountId: string,
  weekday: Weekday,
  time: string,
): string | null {
  const timeError = validateSlotTime(time)
  if (timeError) return timeError
  if (hasSlotFor(slots, accountId, weekday, time)) return 'That posting time already exists.'
  if (countSlotsFor(slots, accountId) >= WEEKLY_SLOT_LIMIT) {
    return `You can keep up to ${WEEKLY_SLOT_LIMIT} posting times per channel.`
  }
  return null
}

export interface ScheduleWindowInput {
  iso: string | null
  now: Date
}

/** `null` when the instant is schedulable, otherwise the message to show. */
export function validateScheduleWindow({ iso, now }: ScheduleWindowInput): string | null {
  if (!iso) return 'Pick a date and time.'
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return 'Invalid date or time.'
  if (target < now.getTime() + MIN_SCHEDULE_LEAD_MS) {
    return 'Pick a time at least 1 minute from now.'
  }
  if (target > now.getTime() + MAX_SCHEDULE_AHEAD_DAYS * 86_400_000) {
    return 'Scheduling is limited to 1 year ahead.'
  }
  return null
}

export interface ComposerValidationInput {
  content: string
  /** Selected accounts, in picker order. */
  accounts: SocialAccount[]
  mediaCount: number
  mode: ScheduleMode
  /** Resolved UTC instant for `schedule`; `null` otherwise. */
  scheduledAtIso: string | null
  now: Date
  hasSlotsFor: (accountId: string) => boolean
  /** Media library lookup, checked when a post is scheduled or queue-accepted. */
  mediaExists: (mediaId: string) => boolean
  mediaIds: string[]
}

export function validateComposer(input: ComposerValidationInput): FieldErrors {
  const errors: FieldErrors = {}
  const text = input.content.trim()
  const platforms = input.accounts.map((account) => account.platform)
  const limit = strictestLimit(platforms)
  const mediaCap = effectiveMediaCap(platforms)

  if (input.mode !== 'draft' && input.accounts.length === 0) {
    errors.accounts = 'Select at least one channel.'
  }
  if (input.mode !== 'draft' && input.accounts.some((account) => !account.connected)) {
    errors.accounts = 'A selected channel is disconnected.'
  }
  if (text.length === 0 && input.mediaCount === 0) {
    errors.content = 'Write something or add media.'
  }
  if (limit && text.length > limit.limit) {
    errors.content = `Too long for ${PLATFORMS[limit.by].label} (${formatCharLimit(
      text.length,
    )}/${formatCharLimit(limit.limit)}).`
  }
  if (input.mediaCount > mediaCap) {
    errors.media = `Too many media for the selected channels (max ${mediaCap}).`
  }
  if (input.mediaIds.some((id) => !input.mediaExists(id))) {
    errors.media = 'One of the selected media files is no longer available.'
  }
  if (input.mode !== 'draft' && requiresMedia(platforms) && input.mediaCount === 0) {
    errors.media = 'Instagram posts need at least one image.'
  }

  if (input.mode === 'schedule') {
    const scheduleError = validateScheduleWindow({ iso: input.scheduledAtIso, now: input.now })
    if (scheduleError) errors.schedule = scheduleError
  }

  if (input.mode === 'queue') {
    const missing = input.accounts.filter((account) => !input.hasSlotsFor(account.id))
    if (missing.length > 0) {
      errors.schedule = `Add posting times first for: ${missing
        .map((account) => `@${account.handle}`)
        .join(', ')}.`
    }
  }

  return errors
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string' && message.length > 0)
}

export function firstErrorField(errors: FieldErrors): string | null {
  for (const [field, message] of Object.entries(errors)) {
    if (typeof message === 'string' && message.length > 0) return field
  }
  return null
}
