import type {
  ActivityEntry,
  AppSettings,
  ISODateString,
  MediaAsset,
  Post,
  QueueSlot,
  SocialAccount,
  Weekday,
} from '@/types'

/** Deterministic entity factories shared by the unit tests. */

export const T0: ISODateString = '2026-10-01T00:00:00.000Z'
export const T1: ISODateString = '2026-10-02T09:30:00.000Z'
export const T2: ISODateString = '2026-10-03T17:00:00.000Z'

export function makeAccount(overrides: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: 'acc-1',
    platform: 'x',
    handle: 'lanabuilds',
    displayName: 'Lana Builds',
    avatarHue: 210,
    connected: true,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}

export function makeSlot(overrides: Partial<QueueSlot> = {}): QueueSlot {
  return {
    id: 'slot-1',
    accountId: 'acc-1',
    weekday: 1 as Weekday,
    time: '09:00',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}

export function makeMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'media-1',
    name: 'photo.jpg',
    mime: 'image/jpeg',
    width: 1200,
    height: 800,
    bytes: 1024,
    dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}

export function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    groupId: 'group-1',
    accountId: 'acc-1',
    content: 'Hello from the queue.',
    mediaIds: [],
    status: 'scheduled',
    scheduledAt: T1,
    publishedAt: null,
    source: 'manual',
    attempts: 0,
    nextRetryAt: null,
    failure: null,
    metrics: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  }
}

export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    timezone: 'Asia/Jakarta',
    timeFormat: '12h',
    weekStartsOn: 1,
    theme: 'system',
    simulateFailures: false,
    calendarView: 'month',
    ...overrides,
  }
}

export function makeActivity(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'act-1',
    postId: 'post-1',
    type: 'scheduled',
    message: 'Scheduled for Lana Builds',
    at: T0,
    ...overrides,
  }
}

/** Sequential id factory so fixtures are readable in assertion diffs. */
export function idFactory(prefix: string): (n: number) => string {
  return (n: number) => `${prefix}-${n}`
}
