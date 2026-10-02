/**
 * Domain model for the offline social scheduler.
 *
 * Every timestamp crossing a module boundary is a UTC ISO-8601 string
 * (`2026-10-02T08:30:00.000Z`). Conversion to and from the user's IANA timezone
 * is exclusively the job of `src/lib/datetime.ts`.
 */

/** Always a UTC instant, e.g. `2026-10-02T08:30:00.000Z`. */
export type ISODateString = string

export type PlatformId = 'x' | 'linkedin' | 'instagram' | 'facebook' | 'threads'

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type ThemePreference = 'system' | 'light' | 'dark'

export type TimeFormat = '12h' | '24h'

export type ScheduleMode = 'now' | 'schedule' | 'queue' | 'draft'

export type FailureCode =
  | 'ACCOUNT_DISCONNECTED'
  | 'CONTENT_INVALID'
  | 'RATE_LIMITED'
  | 'MISSED'
  | 'MEDIA_MISSING'

export interface PlatformMeta {
  id: PlatformId
  label: string
  color: string
  maxChars: number
  maxMedia: number
  requiresMedia: boolean
}

export interface BaseEntity {
  id: string
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface SocialAccount extends BaseEntity {
  platform: PlatformId
  /** Without the leading `@`; 2–30 chars of `[A-Za-z0-9._]`. */
  handle: string
  displayName: string
  /** 0–359, drives the generated avatar color. */
  avatarHue: number
  connected: boolean
}

export interface QueueSlot extends BaseEntity {
  accountId: string
  weekday: Weekday
  /** `HH:mm`, 24-hour, interpreted in the user's timezone. */
  time: string
}

export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export interface MediaAsset extends BaseEntity {
  name: string
  mime: MediaMime
  width: number
  height: number
  /** Size in bytes of the stored (compressed) payload. */
  bytes: number
  dataUrl: string
}

export interface PostMetrics {
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
}

export interface PostFailure {
  code: FailureCode
  message: string
  at: ISODateString
}

export interface Post extends BaseEntity {
  /** Posts created together share one group id. */
  groupId: string
  accountId: string
  content: string
  mediaIds: string[]
  status: PostStatus
  /** `null` only for drafts. */
  scheduledAt: ISODateString | null
  publishedAt: ISODateString | null
  source: 'manual' | 'queue'
  attempts: number
  nextRetryAt: ISODateString | null
  failure: PostFailure | null
  metrics: PostMetrics | null
}

export type CalendarView = 'month' | 'week' | 'agenda'

export interface AppSettings {
  /** IANA identifier; defaults to the runtime zone. */
  timezone: string
  timeFormat: TimeFormat
  weekStartsOn: 0 | 1
  theme: ThemePreference
  simulateFailures: boolean
  calendarView: CalendarView
}

export type ActivityType =
  | 'created'
  | 'scheduled'
  | 'rescheduled'
  | 'published'
  | 'failed'
  | 'retried'
  | 'deleted'
  | 'duplicated'

export interface ActivityEntry {
  id: string
  postId: string | null
  type: ActivityType
  message: string
  at: ISODateString
}

/** Transient composer autosave; never part of the entity graph. */
export interface ComposerDraft {
  content: string
  accountIds: string[]
  mediaIds: string[]
  mode: ScheduleMode
  /** `yyyy-MM-dd` in the user's timezone, or `''`. */
  date: string
  /** `HH:mm`, or `''`. */
  time: string
  editingPostId: string | null
  savedAt: ISODateString
}

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E }

export interface FieldErrors {
  [field: string]: string | undefined
}

/* ------------------------------------------------------------------ *
 * Application-level types (store + component contracts)
 * ------------------------------------------------------------------ */

export type ToastTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'brand'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: string
  tone: ToastTone
  message: string
  action: ToastAction | null
  durationMs: number
  createdAt: number
}

export interface ComposerTarget {
  open: boolean
  editingPostId: string | null
  /** `yyyy-MM-dd` preset used by the calendar "add post on this day" path. */
  presetDate: string | null
  presetAccountIds: string[]
}

/** Payload the composer's submit handler hands to the posts store. */
export interface ComposerFormValue {
  content: string
  accountIds: string[]
  mediaIds: string[]
  mode: ScheduleMode
  /** Resolved UTC instant; used by `schedule`, ignored by `queue`/`now`. */
  scheduledAtIso: string | null
}

export type PostActionId =
  | 'edit'
  | 'schedule'
  | 'reschedule'
  | 'publish-now'
  | 'move-to-drafts'
  | 'duplicate'
  | 'delete'
  | 'retry'

export type TimelineStatusFilter = 'upcoming' | 'published' | 'failed' | 'drafts'

export interface TimelineFilter {
  accountId: string | 'all'
  status: TimelineStatusFilter
}

export interface PostCounts {
  scheduled: number
  publishedThisWeek: number
  failed: number
  drafts: number
}

/** Everything a cascading account removal touched, kept for the 8s undo window. */
export interface AccountRemovalSnapshot {
  account: SocialAccount
  posts: Post[]
  slots: QueueSlot[]
  media: MediaAsset[]
  activity: ActivityEntry[]
}

/** Everything a post deletion touched, kept for the 8s undo window. */
export interface PostRemovalSnapshot {
  posts: Post[]
  groupIds: string[]
  activity: ActivityEntry[]
  /**
   * Media referenced by the deleted posts.
   *
   * The assets are kept alive for the whole undo window and restored with the
   * post: collecting them eagerly would leave a restored post pointing at
   * `mediaIds` that no longer resolve, and its photos would silently vanish.
   */
  media: MediaAsset[]
}

export interface DayCellModel {
  /** `yyyy-MM-dd` in the user's timezone. */
  key: string
  date: Date
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  posts: Post[]
}

export interface AgendaGroup {
  key: string
  label: string
  posts: Post[]
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone: ToastTone
  /** Optional third action (e.g. "Save as draft") resolving to a distinct value. */
  tertiaryLabel: string | null
}

export type ConfirmResponse = boolean | null

export interface ConfirmDialogRequest extends ConfirmRequest {
  id: string
  resolve: (value: ConfirmResponse) => void
}

/** Shape produced by the Settings "Export JSON" action and consumed by "Import JSON". */
export interface DataBundle {
  accounts: SocialAccount[]
  slots: QueueSlot[]
  posts: Post[]
  media: MediaAsset[]
  settings: AppSettings
  activity: ActivityEntry[]
}
