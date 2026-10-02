import { describe, expect, it } from 'vitest'
import {
  addDaysToKey,
  countdownParts,
  dayKey,
  dayKeyOf,
  defaultScheduleParts,
  formatDayLabel,
  formatDuration,
  formatSlotTime,
  formatTime,
  isValidDateKey,
  isValidTimeString,
  isValidTimeZone,
  minutesOfDay,
  minutesToSlotTime,
  monthMatrixKeys,
  relativeTime,
  shiftMonthKey,
  slotTimeToMinutes,
  startOfWeekKey,
  supportedTimeZones,
  systemTimeZone,
  timeZoneLabel,
  utcIsoToZonedParts,
  weekKeys,
  weekdayOfKey,
  zonedToUtcIso,
} from '@/lib/datetime'

const JAKARTA = 'Asia/Jakarta'
const NEW_YORK = 'America/New_York'
const UTC = 'UTC'

// Thursday 2026-10-01, 09:00 in Jakarta (02:00 UTC).
const NOW = new Date('2026-10-01T02:00:00.000Z')

describe('zoned conversions', () => {
  it('converts a local wall clock into a UTC instant', () => {
    expect(zonedToUtcIso('2026-10-02', '09:30', JAKARTA)).toBe('2026-10-02T02:30:00.000Z')
    expect(zonedToUtcIso('2026-10-02', '09:30', UTC)).toBe('2026-10-02T09:30:00.000Z')
  })

  it('round-trips date and time parts', () => {
    const iso = zonedToUtcIso('2026-12-31', '23:15', NEW_YORK)
    expect(utcIsoToZonedParts(iso, NEW_YORK)).toEqual({ date: '2026-12-31', time: '23:15' })
  })

  it('normalizes a spring-forward gap forward and shows the resolved time', () => {
    const iso = zonedToUtcIso('2026-03-08', '02:30', NEW_YORK)
    expect(iso).toBe('2026-03-08T07:30:00.000Z')
    expect(utcIsoToZonedParts(iso, NEW_YORK).time).toBe('03:30')
  })

  it('derives the day key in the user zone, not the browser zone', () => {
    const iso = '2026-10-01T20:00:00.000Z'
    expect(dayKey(iso, JAKARTA)).toBe('2026-10-02')
    expect(dayKey(iso, UTC)).toBe('2026-10-01')
    expect(dayKeyOf(NOW, JAKARTA)).toBe('2026-10-01')
  })

  it('exposes minutes since local midnight', () => {
    expect(minutesOfDay('2026-10-02T02:30:00.000Z', JAKARTA)).toBe(570)
    expect(slotTimeToMinutes('17:00')).toBe(1020)
    expect(minutesToSlotTime(1020)).toBe('17:00')
    expect(minutesToSlotTime(1500)).toBe('01:00')
  })
})

describe('key arithmetic', () => {
  it('computes weekdays without timezone drift', () => {
    expect(weekdayOfKey('2026-10-01')).toBe(4)
    expect(weekdayOfKey('2026-10-04')).toBe(0)
  })

  it('adds days across month and year boundaries', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysToKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('honours the configured week start', () => {
    expect(startOfWeekKey('2026-10-01', 1)).toBe('2026-09-28')
    expect(startOfWeekKey('2026-10-01', 0)).toBe('2026-09-27')
    expect(weekKeys('2026-10-01', 1)).toHaveLength(7)
    expect(weekKeys('2026-10-01', 1)[0]).toBe('2026-09-28')
    expect(weekKeys('2026-10-01', 1)[6]).toBe('2026-10-04')
  })

  it('builds a 6x7 month matrix that starts on the week start', () => {
    const keys = monthMatrixKeys('2026-10-01', 1)
    expect(keys).toHaveLength(42)
    expect(keys[0]).toBe('2026-09-28')
    expect(keys.filter((key) => key.startsWith('2026-10'))).toHaveLength(31)
  })

  it('clamps the day when shifting months', () => {
    expect(shiftMonthKey('2026-01-31', 1)).toBe('2026-02-28')
    expect(shiftMonthKey('2026-10-15', -1)).toBe('2026-09-15')
    expect(shiftMonthKey('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('validates date keys and time strings', () => {
    expect(isValidDateKey('2026-02-29')).toBe(false)
    expect(isValidDateKey('2024-02-29')).toBe(true)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidTimeString('23:59')).toBe(true)
    expect(isValidTimeString('24:00')).toBe(false)
    expect(isValidTimeString('9:00')).toBe(false)
  })
})

describe('formatting', () => {
  it('formats times in both 12h and 24h', () => {
    const iso = '2026-10-02T02:30:00.000Z'
    expect(formatTime(iso, JAKARTA, true)).toBe('09:30')
    expect(formatTime(iso, JAKARTA, false)).toBe('9:30 AM')
    expect(formatSlotTime('17:00', false)).toBe('5:00 PM')
    expect(formatSlotTime('00:05', false)).toBe('12:05 AM')
    expect(formatSlotTime('00:05', true)).toBe('00:05')
  })

  it('labels today, tomorrow, yesterday and other days', () => {
    expect(formatDayLabel('2026-10-01', JAKARTA, NOW)).toBe('Today')
    expect(formatDayLabel('2026-10-02', JAKARTA, NOW)).toBe('Tomorrow')
    expect(formatDayLabel('2026-09-30', JAKARTA, NOW)).toBe('Yesterday')
    expect(formatDayLabel('2026-10-09', JAKARTA, NOW)).toBe('Fri, Oct 9')
  })

  it('describes relative time in the nearest sensible unit', () => {
    const base = new Date('2026-10-01T12:00:00.000Z')
    expect(relativeTime('2026-10-01T12:30:00.000Z', base)).toMatch(/minute|in 30/)
    expect(relativeTime('2026-10-01T09:00:00.000Z', base)).toMatch(/hour|3/)
    expect(relativeTime('2026-10-04T12:00:00.000Z', base)).toMatch(/day|3/)
  })

  it('counts down to a future instant', () => {
    const parts = countdownParts('2026-10-02T05:00:00.000Z', new Date('2026-10-01T00:00:00.000Z'))
    expect(parts.days).toBe(1)
    expect(parts.hours).toBe(5)
    expect(parts.isPast).toBe(false)
  })

  it('formats compact durations', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(5 * 60_000)).toBe('5m')
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2h 5m')
    expect(formatDuration(2 * 3_600_000)).toBe('2h')
    expect(formatDuration(48 * 3_600_000)).toBe('2d')
    expect(formatDuration(50 * 3_600_000)).toBe('2d 2h')
  })
})

describe('composer defaults', () => {
  it('suggests a whole hour at least an hour out', () => {
    const parts = defaultScheduleParts(NOW, JAKARTA)
    expect(parts.date).toBe('2026-10-01')
    expect(parts.time).toBe('10:00')
    expect(new Date(zonedToUtcIso(parts.date, parts.time, JAKARTA)).getTime()).toBeGreaterThan(
      NOW.getTime(),
    )
  })

  it('rolls past midnight when the current hour is nearly over', () => {
    const lateEvening = new Date('2026-10-01T15:30:00.000Z') // 22:30 in Jakarta
    expect(defaultScheduleParts(lateEvening, JAKARTA)).toEqual({ date: '2026-10-02', time: '00:00' })
  })
})

describe('timezone support', () => {
  it('validates IANA identifiers', () => {
    expect(isValidTimeZone(JAKARTA)).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })

  it('exposes a non-empty zone list including the system zone', () => {
    const zones = supportedTimeZones()
    expect(zones.length).toBeGreaterThan(10)
    expect(zones).toContain('UTC')
  })

  it('resolves a system zone and labels zones with an offset', () => {
    expect(systemTimeZone().length).toBeGreaterThan(0)
    expect(timeZoneLabel(JAKARTA)).toContain(JAKARTA)
    expect(timeZoneLabel('Not/AZone')).toBe('Not/AZone')
  })
})
