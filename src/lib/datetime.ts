import { TZDate } from '@date-fns/tz'
import { addDays, addMonths, format, isSameDay, startOfDay, startOfMonth } from 'date-fns'
import type { ISODateString, Weekday } from '@/types'

/**
 * Every function here is timezone-aware: the user picks one IANA zone in
 * Settings and all display, entry and grouping flows through it. Internally we
 * only ever store UTC ISO strings.
 */

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
}

export const WEEKDAY_MIN: Record<Weekday, string> = {
  0: 'S',
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'T',
  5: 'F',
  6: 'S',
}

export const MONTH_LABELS: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const MONTH_SHORT: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const TIME_ZONE_FALLBACKS: readonly string[] = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Athens',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
]

/* ------------------------------------------------------------------ *
 * Zone helpers
 * ------------------------------------------------------------------ */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Zone list for the Settings select. `Intl.supportedValuesOf` omits `UTC` and
 * occasionally the runtime zone, so both are merged in.
 */
export function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }
  const zones =
    typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : []
  const source = zones.length > 0 ? zones : [...TIME_ZONE_FALLBACKS]
  const merged = new Set<string>([...source, 'UTC', systemTimeZone()])
  return [...merged].sort((a, b) => a.localeCompare(b))
}

/** `Asia/Jakarta · GMT+07:00`, the label used in the timezone select. */
export function timeZoneLabel(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(at)
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value
    return offset ? `${tz} · ${offset.replace('GMT', 'GMT')}` : tz
  } catch {
    return tz
  }
}

/* ------------------------------------------------------------------ *
 * Conversions
 * ------------------------------------------------------------------ */

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number)
  return {
    year: year ?? 1970,
    month: (month ?? 1) - 1,
    day: day ?? 1,
  }
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/**
 * Local wall-clock time in `tz` → UTC ISO string.
 * Non-existent times (spring-forward gap) normalize forward, so callers show the
 * resolved value before submitting.
 */
export function zonedToUtcIso(date: string, time: string, tz: string): string {
  const { year, month, day } = parseDateKey(date)
  const [rawHours, rawMinutes] = time.split(':').map(Number)
  const hours = Number.isFinite(rawHours) ? rawHours : 0
  const minutes = Number.isFinite(rawMinutes) ? rawMinutes : 0
  const zoned = new TZDate(year, month, day, hours, minutes, 0, tz)
  return new Date(zoned.getTime()).toISOString()
}

export function utcIsoToZonedParts(iso: ISODateString, tz: string): { date: string; time: string } {
  const zoned = new TZDate(new Date(iso), tz)
  return { date: format(zoned, 'yyyy-MM-dd'), time: format(zoned, 'HH:mm') }
}

/** `yyyy-MM-dd` of an instant, in the user's zone. */
export function dayKey(iso: ISODateString, tz: string): string {
  return format(new TZDate(new Date(iso), tz), 'yyyy-MM-dd')
}

export function dayKeyOf(date: Date, tz: string): string {
  return format(new TZDate(date, tz), 'yyyy-MM-dd')
}

export function nowIso(now: Date = new Date()): ISODateString {
  return now.toISOString()
}

/** Midnight of `key` in the user's zone, as a real `Date`. */
export function dateFromKey(key: string, tz: string): Date {
  const { year, month, day } = parseDateKey(key)
  return new TZDate(year, month, day, 0, 0, 0, tz)
}

/** Weekday of a `yyyy-MM-dd` key, computed at UTC noon to stay DST-proof. */
export function weekdayOfKey(key: string): Weekday {
  const { year, month, day } = parseDateKey(key)
  const utcNoon = new Date(Date.UTC(year, month, day, 12))
  return utcNoon.getUTCDay() as Weekday
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key)
  const shifted = new Date(Date.UTC(year, month, day + days, 12))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export function startOfWeekKey(key: string, weekStartsOn: 0 | 1): string {
  const weekday = weekdayOfKey(key)
  const delta = (weekday - weekStartsOn + 7) % 7
  return addDaysToKey(key, -delta)
}

export function weekKeys(key: string, weekStartsOn: 0 | 1): string[] {
  const start = startOfWeekKey(key, weekStartsOn)
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index))
}

/** 6 rows × 7 columns covering the month that owns `key`. */
export function monthMatrixKeys(key: string, weekStartsOn: 0 | 1): string[] {
  const { year, month } = parseDateKey(key)
  const first = `${year}-${pad(month + 1)}-01`
  const start = startOfWeekKey(first, weekStartsOn)
  return Array.from({ length: 42 }, (_, index) => addDaysToKey(start, index))
}

export function startOfMonthKey(key: string): string {
  const { year, month } = parseDateKey(key)
  return `${year}-${pad(month + 1)}-01`
}

export function shiftMonthKey(key: string, months: number): string {
  const { year, month, day } = parseDateKey(key)
  const shifted = new TZDate(year, month + months, 1, 12, 0, 0, 0)
  const lastDay = new Date(
    Date.UTC(shifted.getFullYear(), shifted.getMonth() + 1, 0, 12),
  ).getUTCDate()
  const clampedDay = Math.min(day, lastDay)
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(clampedDay)}`
}

export function shiftWeekKey(key: string, weekStartsOn: 0 | 1, weeks: number): string {
  return addDaysToKey(startOfWeekKey(key, weekStartsOn), weeks * 7)
}

export function dayOfMonth(key: string): number {
  return parseDateKey(key).day
}

export function monthIndex(key: string): number {
  return parseDateKey(key).month
}

export function yearOf(key: string): number {
  return parseDateKey(key).year
}

export function minutesOfDay(iso: ISODateString, tz: string): number {
  const { time } = utcIsoToZonedParts(iso, tz)
  return slotTimeToMinutes(time)
}

export function slotTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

export function minutesToSlotTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export function formatTime(iso: ISODateString, tz: string, is24h: boolean): string {
  return format(new TZDate(new Date(iso), tz), is24h ? 'HH:mm' : 'h:mm a')
}

export function formatSlotTime(time: string, is24h: boolean): string {
  const minutes = slotTimeToMinutes(time)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (is24h) return `${pad(hours)}:${pad(rest)}`
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${pad(rest)} ${suffix}`
}

/** `Fri, Oct 9` or the relative word when the day is today/tomorrow/yesterday. */
export function formatDayLabel(key: string, tz: string, now: Date): string {
  const today = startOfDay(new TZDate(now, tz))
  const day = new TZDate(dateFromKey(key, tz).getTime())
  if (isSameDay(day, today)) return 'Today'
  if (isSameDay(day, addDays(today, 1))) return 'Tomorrow'
  if (isSameDay(day, addDays(today, -1))) return 'Yesterday'
  return format(day, 'EEE, MMM d')
}

export function formatDayLong(key: string, tz: string): string {
  return format(new TZDate(dateFromKey(key, tz).getTime()), 'EEE, MMM d, yyyy')
}

/** `Fri, Oct 9` using the short weekday name — used by the week strip. */
export function formatDayWithWeekday(key: string, tz: string): string {
  const weekday = weekdayOfKey(key)
  return `${WEEKDAY_SHORT[weekday]}, ${format(new TZDate(dateFromKey(key, tz).getTime()), 'MMM d')}`
}

export function formatMonthTitle(key: string): string {
  const { year, month } = parseDateKey(key)
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
  return `${MONTH_LABELS[month]} ${year} · ${daysInMonth} days`
}

/** `Oct 5 – 11, 2026` inside one month, `Sep 28 – Oct 4, 2026` across two. */
export function formatWeekTitle(keys: readonly string[], tz: string): string {
  if (keys.length === 0) return ''
  const first = keys[0] as string
  const last = keys[keys.length - 1] as string
  const firstDate = new TZDate(dateFromKey(first, tz).getTime())
  const lastDate = new TZDate(dateFromKey(last, tz).getTime())
  const sameMonth = firstDate.getFullYear() === lastDate.getFullYear() && firstDate.getMonth() === lastDate.getMonth()
  const firstFormat = sameMonth ? 'MMM d' : 'MMM d'
  const lastFormat = sameMonth ? 'd, yyyy' : 'MMM d, yyyy'
  return `${format(firstDate, firstFormat)} – ${format(lastDate, lastFormat)}`
}

/** `Fri, Oct 9 · 9:30 AM` — the composer's resolved-time summary. */
export function formatDateTime(iso: ISODateString, tz: string, is24h: boolean): string {
  const zoned = new TZDate(new Date(iso), tz)
  return `${format(zoned, 'EEE, MMM d')} · ${format(zoned, is24h ? 'HH:mm' : 'h:mm a')}`
}

export function formatDateTimeWithZone(
  iso: ISODateString,
  tz: string,
  is24h: boolean,
): string {
  return `${formatDateTime(iso, tz, is24h)} (${tz})`
}

export function formatFullStamp(iso: ISODateString, tz: string, is24h: boolean): string {
  const zoned = new TZDate(new Date(iso), tz)
  return `${format(zoned, 'MMM d, yyyy')} · ${format(zoned, is24h ? 'HH:mm' : 'h:mm a')}`
}

export function relativeTime(iso: ISODateString, now: Date): string {
  const diffMs = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour')
  if (abs < 2_592_000_000) return rtf.format(Math.round(diffMs / 86_400_000), 'day')
  return rtf.format(Math.round(diffMs / 2_592_000_000), 'month')
}

export function relativeTimeFromKey(key: string, tz: string, now: Date): string {
  return relativeTime(dateFromKey(key, tz).toISOString(), now)
}

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  isPast: boolean
}

export function countdownParts(iso: ISODateString, now: Date): CountdownParts {
  const totalMs = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(totalMs)
  return {
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1_000),
    totalMs,
    isPast: totalMs < 0,
  }
}

/** `in 3h 12m` / `12m ago` style label for upcoming and past posts. */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  const minutes = Math.floor(abs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`
  if (hours >= 1) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
  if (minutes >= 1) return `${minutes}m`
  return `${Math.max(0, Math.floor(abs / 1_000))}s`
}

export function formatRelativeTarget(iso: ISODateString, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime()
  if (diff >= 0) return `in ${formatDuration(diff)}`
  return `${formatDuration(diff)} ago`
}

/* ------------------------------------------------------------------ *
 * Defaults for the composer
 * ------------------------------------------------------------------ */

/**
 * The next whole hour at least an hour away, in `tz`. The date and the time are
 * derived from the same instant so they can never disagree.
 */
export function defaultScheduleParts(now: Date, tz: string): { date: string; time: string } {
  const zoned = new TZDate(now, tz)
  const minutes = zoned.getMinutes()
  const addMinutes = minutes === 0 ? 60 : 120 - minutes
  const target = new TZDate(now.getTime() + addMinutes * 60_000, tz)
  return { date: format(target, 'yyyy-MM-dd'), time: `${pad(target.getHours())}:00` }
}

/** `HH:mm` counterpart of `defaultScheduleParts`, for callers that only need a time. */
export function defaultScheduleTime(now: Date, tz: string): string {
  return defaultScheduleParts(now, tz).time
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { year, month, day } = parseDateKey(value)
  const probe = new Date(Date.UTC(year, month, day, 12))
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month && probe.getUTCDate() === day
  )
}

export function isValidTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isParseableIso(value: unknown): value is ISODateString {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

/** Sort helper for post collections that are ordered by scheduled instant. */
export function byScheduledAt(
  a: { scheduledAt: ISODateString | null },
  b: { scheduledAt: ISODateString | null },
): number {
  if (a.scheduledAt === b.scheduledAt) return 0
  if (a.scheduledAt === null) return 1
  if (b.scheduledAt === null) return -1
  return a.scheduledAt < b.scheduledAt ? -1 : 1
}

export function startOfZonedDay(date: Date, tz: string): Date {
  return startOfDay(new TZDate(date, tz))
}

export function startOfZonedMonth(date: Date, tz: string): Date {
  return startOfMonth(new TZDate(date, tz))
}

export function addZonedMonths(date: Date, months: number, tz: string): Date {
  return addMonths(new TZDate(date, tz), months)
}

export function isSameZonedDay(a: Date, b: Date, tz: string): boolean {
  return isSameDay(new TZDate(a, tz), new TZDate(b, tz))
}
