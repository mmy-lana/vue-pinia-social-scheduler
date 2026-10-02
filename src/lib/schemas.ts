import { z } from 'zod'
import { ALLOWED_MEDIA_MIMES, PLATFORM_IDS } from '@/lib/platforms'
import { isValidTimeString, isValidTimeZone } from '@/lib/datetime'
import { TIME_PATTERN } from '@/lib/validation'
import type {
  ActivityEntry,
  AppSettings,
  ComposerDraft,
  ISODateString,
  MediaAsset,
  Post,
  QueueSlot,
  SocialAccount,
} from '@/types'

/**
 * Runtime mirrors of the domain interfaces. Every persisted slice is parsed with
 * these before it reaches a store, and invalid records are dropped individually
 * instead of poisoning the whole array.
 */

const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid ISO date string' })

const nonEmptyId = z.string().min(1)

export const PlatformIdSchema = z.enum(PLATFORM_IDS)

export const PostStatusSchema = z.enum([
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
])

export const WeekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
])

export const FailureCodeSchema = z.enum([
  'ACCOUNT_DISCONNECTED',
  'CONTENT_INVALID',
  'RATE_LIMITED',
  'MISSED',
  'MEDIA_MISSING',
])

export const ActivityTypeSchema = z.enum([
  'created',
  'scheduled',
  'rescheduled',
  'published',
  'failed',
  'retried',
  'deleted',
  'duplicated',
])

const baseShape = {
  id: nonEmptyId,
  createdAt: isoDateString,
  updatedAt: isoDateString,
}

export const SocialAccountSchema = z
  .object({
    ...baseShape,
    platform: PlatformIdSchema,
    handle: z.string().min(1).max(30),
    displayName: z.string().min(1).max(40),
    avatarHue: z.number().int().min(0).max(359),
    connected: z.boolean(),
  })
  .check((ctx) => {
    const value = ctx.value
    if (new Date(value.updatedAt).getTime() < new Date(value.createdAt).getTime()) {
      ctx.issues.push({
        code: 'custom',
        message: 'updatedAt must not precede createdAt',
        input: value,
      })
    }
  })
  .refine((value) => /^[A-Za-z0-9._]{2,30}$/.test(value.handle), {
    message: 'Handle must be 2–30 characters of [A-Za-z0-9._]',
    path: ['handle'],
  })

export const QueueSlotSchema = z
  .object({
    ...baseShape,
    accountId: nonEmptyId,
    weekday: WeekdaySchema,
    time: z.string().regex(TIME_PATTERN, 'Time must be HH:mm'),
  })
  .check((ctx) => {
    const value = ctx.value
    if (!isValidTimeString(value.time)) {
      ctx.issues.push({ code: 'custom', message: 'Time must be HH:mm', input: value, path: ['time'] })
    }
  })

export const MediaAssetSchema = z.object({
  ...baseShape,
  name: z.string().min(1),
  mime: z.enum(ALLOWED_MEDIA_MIMES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
  dataUrl: z.string().startsWith('data:'),
})

export const PostMetricsSchema = z.object({
  impressions: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
})

export const PostFailureSchema = z.object({
  code: FailureCodeSchema,
  message: z.string().min(1),
  at: isoDateString,
})

export const PostSchema = z
  .object({
    ...baseShape,
    groupId: nonEmptyId,
    accountId: nonEmptyId,
    content: z.string(),
    mediaIds: z.array(nonEmptyId),
    status: PostStatusSchema,
    scheduledAt: isoDateString.nullable(),
    publishedAt: isoDateString.nullable(),
    source: z.enum(['manual', 'queue']),
    attempts: z.number().int().nonnegative(),
    nextRetryAt: isoDateString.nullable(),
    failure: PostFailureSchema.nullable(),
    metrics: PostMetricsSchema.nullable(),
  })
  .check((ctx) => {
    const value = ctx.value
    if (new Date(value.updatedAt).getTime() < new Date(value.createdAt).getTime()) {
      ctx.issues.push({
        code: 'custom',
        message: 'updatedAt must not precede createdAt',
        input: value,
      })
    }
    if (value.status === 'draft' && value.scheduledAt !== null) {
      ctx.issues.push({
        code: 'custom',
        message: 'Drafts cannot carry a scheduledAt instant',
        input: value,
        path: ['scheduledAt'],
      })
    }
    if (value.status === 'published' && value.publishedAt === null) {
      ctx.issues.push({
        code: 'custom',
        message: 'Published posts require publishedAt',
        input: value,
        path: ['publishedAt'],
      })
    }
  })

export const AppSettingsSchema = z
  .object({
    timezone: z
      .string()
      .min(1)
      .refine(isValidTimeZone, { message: 'Unknown IANA timezone' }),
    timeFormat: z.enum(['12h', '24h']),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    theme: z.enum(['system', 'light', 'dark']),
    simulateFailures: z.boolean(),
    calendarView: z.enum(['month', 'week', 'agenda']),
  })
  .refine(
    (value) => (value.weekStartsOn === 0 || value.weekStartsOn === 1) && Number.isInteger(value.weekStartsOn),
    { message: 'weekStartsOn must be 0 or 1', path: ['weekStartsOn'] },
  )

export const ActivityEntrySchema = z.object({
  id: nonEmptyId,
  postId: nonEmptyId.nullable(),
  type: ActivityTypeSchema,
  message: z.string(),
  at: isoDateString,
})

export const ComposerDraftSchema = z.object({
  content: z.string(),
  accountIds: z.array(nonEmptyId),
  mediaIds: z.array(nonEmptyId),
  mode: z.enum(['now', 'schedule', 'queue', 'draft']),
  date: z.string(),
  time: z.string(),
  editingPostId: nonEmptyId.nullable(),
  savedAt: isoDateString,
})

export const DataBundleSchema = z.object({
  accounts: z.array(SocialAccountSchema),
  slots: z.array(QueueSlotSchema),
  posts: z.array(PostSchema),
  media: z.array(MediaAssetSchema),
  settings: AppSettingsSchema,
  activity: z.array(ActivityEntrySchema),
})

/* Compile-time guarantee that schemas and interfaces cannot drift apart. */
export type SocialAccountFromSchema = z.infer<typeof SocialAccountSchema>
export type QueueSlotFromSchema = z.infer<typeof QueueSlotSchema>
export type MediaAssetFromSchema = z.infer<typeof MediaAssetSchema>
export type PostFromSchema = z.infer<typeof PostSchema>
export type AppSettingsFromSchema = z.infer<typeof AppSettingsSchema>
export type ActivityEntryFromSchema = z.infer<typeof ActivityEntrySchema>
export type ComposerDraftFromSchema = z.infer<typeof ComposerDraftSchema>

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type AssertSync<A, B> = Exact<A, B> extends true ? true : never

const accountSync: AssertSync<SocialAccountFromSchema, SocialAccount> = true
const slotSync: AssertSync<QueueSlotFromSchema, QueueSlot> = true
const mediaSync: AssertSync<MediaAssetFromSchema, MediaAsset> = true
const postSync: AssertSync<PostFromSchema, Post> = true
const settingsSync: AssertSync<AppSettingsFromSchema, AppSettings> = true
const activitySync: AssertSync<ActivityEntryFromSchema, ActivityEntry> = true
const draftSync: AssertSync<ComposerDraftFromSchema, ComposerDraft> = true
const isoSync: AssertSync<z.infer<typeof isoDateString>, ISODateString> = true

export const SCHEMA_SYNC_CHECKS: readonly boolean[] = [
  accountSync,
  slotSync,
  mediaSync,
  postSync,
  settingsSync,
  activitySync,
  draftSync,
  isoSync,
]

/* ------------------------------------------------------------------ *
 * Per-record parsing used by the persistence plugin
 * ------------------------------------------------------------------ */

export interface ParseResult<T> {
  data: T[]
  dropped: number
}

/**
 * Validates each element on its own so one corrupted record cannot discard the
 * rest of the collection. A non-array payload yields an empty list.
 */
export function parseArray<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  if (!Array.isArray(raw)) return { data: [], dropped: 0 }
  const data: T[] = []
  let dropped = 0
  for (const item of raw) {
    const parsed = schema.safeParse(item)
    if (parsed.success) data.push(parsed.data)
    else dropped += 1
  }
  return { data, dropped }
}

/** Validates a single record, falling back when it is unusable. */
export function parseObject<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): ParseResult<T> {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { data: [parsed.data], dropped: 0 }
  return { data: [fallback], dropped: raw === undefined || raw === null ? 0 : 1 }
}

export interface ParseOneResult<T> {
  data: T
  dropped: number
}

/** Single-record variant used for the settings object. */
export function parseOne<T>(schema: z.ZodType<T>, raw: unknown, fallback: T): ParseOneResult<T> {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { data: parsed.data, dropped: 0 }
  return { data: fallback, dropped: raw === undefined || raw === null ? 0 : 1 }
}

export function parseBundle(raw: unknown): ParseResult<z.infer<typeof DataBundleSchema>> {
  const parsed = DataBundleSchema.safeParse(raw)
  if (!parsed.success) return { data: [], dropped: 1 }
  return { data: [parsed.data], dropped: 0 }
}
